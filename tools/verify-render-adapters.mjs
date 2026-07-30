// Phase 9: a one-command regression suite for the render-engine-adapter work (see the README's
// "Render-engine adapter" section). This is deliberately SEPARATE from verify-demo.mjs/
// verify-release.mjs (npm run verify) rather than folded into them: the shipped demo only runs
// ThreeRenderAdapter today (X3DOM isn't wired into the live app — see the README), so there is no
// "both adapters" path through the live app for verify-demo.mjs to exercise yet. This script
// instead batch-runs the individual spike harnesses under web/x3dom-spikes/ that already prove
// each piece of adapter parity, the same way verify-demo.mjs batch-checks the live app.
//
// Deliberately excludes: the diagnostic/negative-result spikes (spike-run-inline-gltf-probe.mjs,
// -inline-dynamic-diag, -inline-url-swap, -inline-prefirst-ready, -inline-documentwrite,
// -behind-probe, -viewmatrix-probe) — these intentionally demonstrate a *failing* case as evidence
// for the Inline-node/worldToScreen constraints documented in the README, not a regression to
// gate on — and the Phase 0 fps-measurement spikes (spike-run-a/-a-gpu/-b.mjs), which report
// numbers, not a pass/fail verdict.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findBrowser } from "./find-browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPIKES_DIR = join(ROOT, "tools", "x3dom-spikes");

const REGRESSION_SPIKES = [
    "spike-run-canonical-x3dom.mjs",
    "spike-run-orbit-camera.mjs",
    "spike-run-world-to-screen.mjs",
    "spike-run-pick-view-center.mjs",
    "spike-run-wow-scene.mjs",
    "spike-run-wow-scene-assets.mjs",
    "spike-run-humanoid-provider.mjs",
    "spike-run-humanoid-attach-item.mjs",
    "spike-run-inline-pool.mjs",
    "spike-run-attach.mjs",
    "spike-run-portal-renderer.mjs",
    "spike-run-three-portal-renderer.mjs",
    "spike-run-asset-negotiation.mjs", // no browser needed, but still requires the server running
    "spike-run-x3dom-live-mode.mjs", // exercises the real live app's ?renderer=x3dom entry point, not a spike page
];

function run(script, args = []) {
    const result = spawnSync("bash", [join(ROOT, script), ...args], { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0)
        throw new Error(`${script} failed\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
}

// Brace-matches from the first "{" after "RESULT:" rather than assuming the JSON block is the
// rest of stdout — some spikes (e.g. spike-run-canonical-x3dom.mjs) print more diagnostic text
// (a "DOM SNIPPET:" dump) after the RESULT block but before "PAGE ERRORS:", which a naive
// slice-to-next-marker approach mis-parses as trailing garbage and silently reports as a failure.
function extractResult(stdout) {
    const marker = "RESULT:";
    const markerIdx = stdout.indexOf(marker);
    if (markerIdx === -1)
        return null;
    const start = stdout.indexOf("{", markerIdx + marker.length);
    if (start === -1)
        return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < stdout.length; i += 1) {
        const ch = stdout[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (ch === "\\")
                escaped = true;
            else if (ch === '"')
                inString = false;
            continue;
        }
        if (ch === '"')
            inString = true;
        else if (ch === "{")
            depth += 1;
        else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(stdout.slice(start, i + 1));
                }
                catch {
                    return null;
                }
            }
        }
    }
    return null;
}

async function main() {
    run("stopOpenSpatialLab.sh", ["--quiet"]);
    const receipt = run("launchOpenSpatialLab.sh");
    if (!receipt.includes("Open Spatial Lab is ready."))
        throw new Error("startup receipt missing");

    const executablePath = findBrowser();
    if (!executablePath)
        throw new Error("No compatible local browser was found. Set PUPPETEER_EXECUTABLE_PATH.");

    const outcomes = [];
    try {
        for (const script of REGRESSION_SPIKES) {
            const scriptPath = join(SPIKES_DIR, script);
            const proc = spawnSync("node", [scriptPath], {
                cwd: ROOT,
                encoding: "utf8",
                env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: executablePath },
            });
            const parsed = extractResult(proc.stdout || "");
            const ok = proc.status === 0 && !!parsed && parsed.ok === true;
            outcomes.push({ script, ok, exitCode: proc.status, parsed, stderr: proc.stderr });
            console.log(`${ok ? "PASS" : "FAIL"}  ${script}`);
            if (!ok) {
                console.log(proc.stdout);
                if (proc.stderr)
                    console.log("stderr:\n" + proc.stderr);
            }
        }
    }
    finally {
        run("stopOpenSpatialLab.sh", ["--quiet"]);
    }

    const failed = outcomes.filter((o) => !o.ok);
    console.log(`\n${outcomes.length - failed.length}/${outcomes.length} render-adapter spikes passed`);
    if (failed.length) {
        console.error("FAILED: " + failed.map((o) => o.script).join(", "));
        process.exit(1);
    }
    console.log("PASS: render-adapter regression suite complete");
}

main().catch((error) => {
    try {
        run("stopOpenSpatialLab.sh", ["--quiet"]);
    }
    catch { }
    console.error(error.stack || error.message);
    process.exit(1);
});
