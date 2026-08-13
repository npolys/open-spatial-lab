// Regenerates RELEASE-MANIFEST.json from the current file tree, preserving existing entries'
// classification/license metadata and computing sensible values for genuinely new files by
// matching this manifest's own established conventions (sampled from the file itself, not
// invented): runtime/scene-core/public/** code -> browser-runtime/Apache-2.0 (matches the
// existing runtime/scene-core/public/vendor/three/three.module.js precedent — this manifest
// classifies vendored JS by runtime role, not license origin; "third-party-*" classifications are
// reserved for media assets and license-text files specifically), tools/*.mjs test scripts ->
// public-test/Apache-2.0 (matches tools/verify-demo.mjs etc.), *.md docs -> documentation/
// Apache-2.0 (matches README.md/SECURITY.md), a vendored LICENSE.md -> third-party-license/
// notice-only (matches licenses/*-README.md).
//
// Deliberately excludes from the release tree entirely (not just "unclassified" — genuinely not
// part of what ships): .claude/ (local tooling/session config, same category as the already-
// excluded .git/node_modules/.runtime) and NNotes.txt (personal notes, confirmed with the repo
// owner neither ever appeared in any prior manifest snapshot).
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const manifestPath = join(ROOT, "RELEASE-MANIFEST.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const byPath = new Map(manifest.files.map((f) => [f.path, f]));

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

const EXCLUDED_DIRS = new Set([".git", ".runtime", "node_modules", ".claude"]);
const EXCLUDED_PATHS = new Set(["RELEASE-MANIFEST.json", "NNotes.txt"]);

function walk(current = ROOT) {
    const files = [];
    for (const name of readdirSync(current).sort()) {
        if (EXCLUDED_DIRS.has(name))
            continue;
        const absolute = join(current, name);
        const stat = lstatSync(absolute);
        const publicName = relative(ROOT, absolute).split(sep).join("/");
        if (EXCLUDED_PATHS.has(publicName))
            continue;
        if (stat.isSymbolicLink())
            throw new Error(`symbolic links are not allowed: ${publicName}`);
        if (stat.isDirectory())
            files.push(...walk(absolute));
        else if (stat.isFile())
            files.push({ absolute, path: publicName });
    }
    return files;
}

// Classification for NEW files only — existing entries keep whatever they already had.
function classify(path) {
    if (path === "smoke_tests.md")
        return { classification: "documentation", license: "Apache-2.0" };
    if (path === "bash.cmd" || path === "run-bash.ps1")
        return { classification: "launcher", license: "Apache-2.0" };
    if (path.startsWith("tools/ubuntu/") && path.endsWith(".md"))
        return { classification: "documentation", license: "Apache-2.0" };
    if (path.startsWith("tools/ubuntu/"))
        return { classification: "launcher", license: "Apache-2.0" };
    if (path.endsWith("/LICENSE.md"))
        return { classification: "third-party-license", license: "notice-only" };
    if (path.startsWith("runtime/scene-core/public/"))
        return { classification: "browser-runtime", license: "Apache-2.0" };
    if (path.startsWith("tools/x3dom-spikes/") || path === "tools/verify-render-adapters.mjs" || path === "tools/verify-wowapi-smoke.mjs" || path === "tools/generate-release-manifest.mjs")
        return { classification: "public-test", license: "Apache-2.0" };
    if (path.startsWith("web/x3dom-spikes/"))
        return { classification: "public-test", license: "Apache-2.0" };
    if (path.startsWith("web/"))
        return { classification: "browser-runtime", license: "Apache-2.0" };
    throw new Error(`generate-release-manifest.mjs: no classification rule for new file: ${path} — add one explicitly rather than guessing.`);
}

const actual = walk().sort((a, b) => a.path.localeCompare(b.path));
const files = [];
const added = [];
const changed = [];
for (const file of actual) {
    const bytes = readFileSync(file.absolute);
    const size = bytes.length;
    const digest = sha256(bytes);
    const existing = byPath.get(file.path);
    if (existing) {
        if (existing.size !== size || existing.sha256 !== digest)
            changed.push(file.path);
        files.push({ ...existing, size, sha256: digest });
    }
    else {
        const meta = classify(file.path);
        files.push({ path: file.path, mode: "100644", size, sha256: digest, ...meta });
        added.push(file.path);
    }
}
const actualPaths = new Set(actual.map((f) => f.path));
const removed = manifest.files.map((f) => f.path).filter((p) => !actualPaths.has(p));

files.sort((a, b) => a.path.localeCompare(b.path));
const treeInput = files.map((file) => `${file.path}\0${file.mode}\0${file.size}\0${file.sha256}\n`).join("");
const complete_tree_sha256 = sha256(Buffer.from(treeInput, "utf8"));

const next = { ...manifest, complete_tree_sha256, files };
writeFileSync(manifestPath, JSON.stringify(next, null, 2) + "\n", "utf8");

console.log(`files: ${manifest.files.length} -> ${files.length}`);
console.log(`added (${added.length}):`);
for (const p of added)
    console.log(`  + ${p}`);
if (changed.length) {
    console.log(`changed content (${changed.length}):`);
    for (const p of changed)
        console.log(`  ~ ${p}`);
}
if (removed.length) {
    console.log(`removed (${removed.length}):`);
    for (const p of removed)
        console.log(`  - ${p}`);
}
console.log(`complete_tree_sha256: ${complete_tree_sha256}`);
