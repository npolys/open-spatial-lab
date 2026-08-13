// Phase 6 of the X3DOM parity plan: verifies the live portal-aperture preview wired into
// x3dom-portal-traversal-glue.mjs. Originally the previously-unwired X3DOMPortalRenderer
// (screenshot-polling, since X3DOM was believed to have no render-target API) — REWRITTEN
// 2026-08-13 to use X3DOMRenderAdapter.createRenderedTexture() instead: destination content is
// staged directly in the main document and a RenderedTexture attached to the aperture material
// renders it continuously (update="always"), with no discrete capture step and no data: URI at all
// — see x3dom-portal-traversal-glue.mjs's own header comment for the full architecture change.
//
// Reads window.__x3domLiveMode.portalGlue.previewDebugState() rather than counting texture
// elements in the document: avatar/equipment glTF assets embed their OWN real <imagetexture>
// elements internally (baseColor/normal/etc. maps) — a first draft of this spike counted document-
// wide imagetexture elements and got 18 (avatar + 3 default equipped items' own material textures)
// with hostCount 3 (a pre-existing baseline this app already has, unrelated to this feature) before
// switching to the dedicated debug hook, which reports specifically on this glue module's own
// preview records instead of guessing from unrelated DOM state.
//
// Verifies: (1) a preview record exists per real portal in this world (location-a has TWO —
// to location-b and to the lobby — not hardcoded to 1) and every one becomes ready; (2) every one
// has a RenderedTexture attached to its aperture material, in "always" update mode (both boot's
// default camera pose and every portal's own default resolution path result in an eligible,
// actively-updating preview), stable across a second read a moment later; (3) no console/page
// errors, filtering the known-benign addNameSpace pattern documented elsewhere in this session's
// work (Phase 3) — the main scene's avatar/equipment Inline loads run concurrently with portal
// preview setup.
//
// Deliberately does NOT assert on the texture's actual pixel content (a "renders correctly" check)
// — that's covered by the dedicated RenderedTexture feasibility spikes
// (spike-run-rendered-texture-v2.mjs, spike-run-rendered-texture-adapter.mjs) and by direct visual
// verification during the rewrite. This spike is about the GLUE wiring — is a RenderedTexture
// actually attached and live — not the underlying primitive's own correctness, which those other
// spikes already own.
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

  // Portal preview setup's only real async step now is resolvePortalDestinationContent() (a
  // network-ish fetch) — the RenderedTexture itself is attached synchronously up front (see
  // setupPortalPreview()'s own comment), so this just waits for content to resolve (`ready`).
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 }).catch(() => { });

  const first = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState());

  await new Promise((r) => setTimeout(r, 600));

  const second = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState());

  // location-a (this spike's world) has TWO real portals (to location-b and to the lobby) — not
  // hardcoding a count, just requiring at least one and that every one of them came up correctly.
  const recordCountCorrect = first.length >= 1 && first.length === second.length;
  const allReady = recordCountCorrect && first.every((r) => r.ready);
  const allTextureAttached = allReady && first.every((r) => r.textureAttached === true);
  // Boot's default camera pose is the known-good eligible baseline (matches the gating spike's own
  // assumption) — every preview should be actively updating, not paused.
  const allUpdatingAlways = allTextureAttached && first.every((r) => r.eligible === true && r.updateMode === "always");
  const allStillAttachedLater = allUpdatingAlways && second.every((r) => r.textureAttached === true && r.updateMode === "always");
  const noErrors = errors.length === 0;
  const ok = recordCountCorrect && allReady && allTextureAttached && allUpdatingAlways && allStillAttachedLater && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, portalCount: first.length, recordCountCorrect, allReady, allTextureAttached, allUpdatingAlways, allStillAttachedLater, noErrors,
    first, second, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
