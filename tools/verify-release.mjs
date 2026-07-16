import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] || join(SCRIPT_DIR, ".."));
const manifest = JSON.parse(readFileSync(join(ROOT, "RELEASE-MANIFEST.json"), "utf8"));
function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function walk(current = ROOT) {
    const files = [];
    for (const name of readdirSync(current).sort()) {
        if ([".git", ".runtime", "node_modules", "RELEASE-MANIFEST.json"].includes(name))
            continue;
        const absolute = join(current, name);
        const stat = lstatSync(absolute);
        const publicName = relative(ROOT, absolute).split(sep).join("/");
        if (stat.isSymbolicLink())
            throw new Error(`symbolic links are not allowed: ${publicName}`);
        if (stat.isDirectory())
            files.push(...walk(absolute));
        else if (stat.isFile())
            files.push({ absolute, path: publicName });
        else
            throw new Error(`unsupported filesystem entry: ${publicName}`);
    }
    return files;
}
const forbiddenPathParts = [
    "." + "dev/", "." + "agents/", "work" + "orders/", "govern" + "ance/",
    "re" + "ports/", "au" + "dits/", "find" + "ings/", "ses" + "sions/",
];
const forbiddenText = [
    { label: "absolute user path", pattern: new RegExp("/" + "Users" + "/") },
    { label: "project-management path", pattern: new RegExp("\\." + "dev/" + "ai/") },
    { label: "project-management identifier", pattern: new RegExp("\\b" + String.fromCharCode(87, 79, 45) + "[A-Z0-9-]+", "i") },
    { label: "secret key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { label: "cloud access key", pattern: /AKIA[0-9A-Z]{16}/ },
    { label: "GitHub token", pattern: /gh[opusr]_[A-Za-z0-9_]{20,}/ },
    { label: "embedded demo credential", pattern: new RegExp("osl-" + "(?:dev|demo)-[a-z0-9-]*token", "i") },
    { label: "private workflow marker", pattern: new RegExp("MSF-" + "local|project-" + "notes|local demo-" + "DEMO", "i") },
];
const privateProjectToken = Buffer.from("6f70656e2d7370617469616c2d6c61622d646576", "hex").toString("utf8");
function searchableText(path, bytes) {
    if (![".glb", ".vrm"].includes(extname(path).toLowerCase()))
        return bytes.toString("utf8");
    let offset = 12;
    const chunks = [];
    while (offset + 8 <= bytes.length) {
        const length = bytes.readUInt32LE(offset);
        const type = bytes.readUInt32LE(offset + 4);
        if (type === 0x4e4f534a)
            chunks.push(bytes.subarray(offset + 8, offset + 8 + length).toString("utf8"));
        offset += 8 + length;
    }
    return chunks.join("\n");
}
const actual = walk().sort((a, b) => a.path.localeCompare(b.path));
const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
if (actual.length !== expected.length)
    throw new Error(`file-count mismatch: expected ${expected.length}, found ${actual.length}`);
for (let index = 0; index < actual.length; index += 1) {
    const file = actual[index];
    const recorded = expected[index];
    if (file.path !== recorded.path)
        throw new Error(`unexpected file: ${file.path}; expected ${recorded.path}`);
    if (forbiddenPathParts.some((part) => file.path.toLowerCase().includes(part)))
        throw new Error(`unexpected project path: ${file.path}`);
    const bytes = readFileSync(file.absolute);
    if (bytes.length !== recorded.size || sha256(bytes) !== recorded.sha256)
        throw new Error(`hash or size mismatch: ${file.path}`);
    if ([".glb", ".vrm"].includes(extname(file.path).toLowerCase()) && bytes.subarray(0, 4).toString("ascii") !== "glTF") {
        throw new Error(`invalid binary glTF header: ${file.path}`);
    }
    const text = searchableText(file.path, bytes);
    if (text.toLowerCase().includes(privateProjectToken))
        throw new Error(`unexpected repository reference: ${file.path}`);
    for (const rule of forbiddenText)
        if (rule.pattern.test(text))
            throw new Error(`${rule.label}: ${file.path}`);
}
const treeInput = expected.map((file) => `${file.path}\0${file.mode}\0${file.size}\0${file.sha256}\n`).join("");
if (sha256(Buffer.from(treeInput, "utf8")) !== manifest.complete_tree_sha256)
    throw new Error("complete tree hash mismatch");
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
if (packageJson.name !== "open-spatial-lab" || packageJson.private !== true || packageJson.license !== "Apache-2.0") {
    throw new Error("package identity mismatch");
}
for (const command of ["start", "stop", "verify"])
    if (!packageJson.scripts?.[command])
        throw new Error(`missing npm script: ${command}`);
for (const world of ["location-a.json", "location-b.json"]) {
    const text = readFileSync(join(ROOT, "web", "worlds", world), "utf8");
    if (/https:\/\/raw\.githubusercontent\.com/i.test(text))
        throw new Error(`${world} still depends on remote models`);
}
console.log(JSON.stringify({ status: "PASS", file_count: actual.length + 1, complete_tree_sha256: manifest.complete_tree_sha256 }, null, 2));
