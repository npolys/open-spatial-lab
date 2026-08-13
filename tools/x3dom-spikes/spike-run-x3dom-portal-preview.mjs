// Phase 6 of the X3DOM parity plan: verifies the live portal-aperture preview wired into
// x3dom-portal-traversal-glue.mjs. This is the previously-unwired X3DOMPortalRenderer
// (screenshot-polling, since X3DOM has no render-target API) hooked up for real — a hidden
// second <x3d> host renders a procedural destination-world preview and its captured screenshot is
// pushed into an ImageTexture on the portal aperture's material, refreshed on a throttled timer
// (see X3DOMPortalRenderer's DEFAULT_CAPTURE_INTERVAL_MS) via portalGlue.tick(), called every
// frame from x3dom-live-mode.mjs's onEnterFrame callback.
//
// Reads window.__x3domLiveMode.portalGlue.previewDebugState() rather than counting <imagetexture>
// elements in the document: avatar/equipment glTF assets embed their OWN real <imagetexture>
// elements internally (baseColor/normal/etc. maps) — a first draft of this spike counted document-
// wide imagetexture elements and got 18 (avatar + 3 default equipped items' own material textures)
// with hostCount 3 (a pre-existing baseline this app already has, unrelated to this feature) before
// switching to the dedicated debug hook, which reports specifically on this glue module's own
// preview records instead of guessing from unrelated DOM state.
//
// Verifies: (1) a preview record exists per real portal in this world (location-a has TWO —
// to location-b and to the lobby — not hardcoded to 1) and every one becomes ready; (2) every one
// captures a real, well-formed data: URI texture, stable across a second read a moment later
// (still attached, not lost/reset); (3) no console/page errors, filtering the known-benign
// addNameSpace pattern documented elsewhere in this session's work (Phase 3) — the main scene's
// avatar/equipment Inline loads run concurrently with this phase's own hidden-host reload().
//
// Deliberately does NOT assert the captured bytes change between reads (a "liveness" check) —
// the actual capture-loop liveness mechanism (that repeated captures DO reflect real scene
// changes) is already proven separately by the animated-scene spike-run-portal-renderer.mjs,
// already in REGRESSION_SPIKES. (Historical note: at the time this spike was written, the
// destination preview was still Phase 6's fixed-color placeholder room with a static camera, so
// captures were also legitimately byte-identical for that reason too. The portal-preview
// real-content follow-on work replaced that with real destination content and a camera that
// glues to the player's real pose every tick — this spike's own assertions never depended on
// which content is shown, so they remain valid unchanged; see
// spike-run-x3dom-portal-preview-real-content.mjs and
// spike-run-x3dom-portal-preview-camera-glue.mjs for what verifies the newer behavior
// specifically.)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Permissions policy violation/,
  // The WoW-negotiated-asset feature deliberately triggers real 403/404s for the demo's own
  // restricted/hidden hosted objects (see wow-asset.js) — expected on every boot now.
  /Failed to load resource: the server responded with a status of (403|404)/i,
];
function isBenign(text) {
  return KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`pageerror: ${t}`); });
  page.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);

  // Portal preview setup is async (destination adapter ready() + mount) and captures are
  // throttled (~10fps) — give it real time to complete at least a couple of capture ticks.
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state[0].capturedUrl;
  }, { timeout: 20000 }).catch(() => { });

  const first = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState());

  await new Promise((r) => setTimeout(r, 600));

  const second = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState());

  // location-a (this spike's world) has TWO real portals (to location-b and to the lobby) — not
  // hardcoding a count, just requiring at least one and that every one of them came up correctly.
  const recordCountCorrect = first.length >= 1 && first.length === second.length;
  const allReady = recordCountCorrect && first.every((r) => r.ready);
  const allTextureAttached = allReady && first.every((r) => typeof r.capturedUrl === "string" && r.capturedUrl.startsWith("data:") && r.capturedUrl.length > 500);
  const allStillAttachedLater = allTextureAttached && first.every((r, i) => {
    const laterUrl = second[i]?.capturedUrl;
    return typeof laterUrl === "string" && laterUrl.startsWith("data:");
  });
  const noErrors = errors.length === 0;
  const ok = recordCountCorrect && allReady && allTextureAttached && allStillAttachedLater && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, portalCount: first.length, recordCountCorrect, allReady, allTextureAttached, allStillAttachedLater, noErrors,
    urlLengths: first.map((r) => r.capturedUrl?.length ?? null),
    errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
