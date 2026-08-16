// Portal-preview real-content work, Stage 3: verifies proximity/visibility gating —
// x3dom-portal-traversal-glue.mjs's tick() now skips camera-gluing AND flips each portal's
// RenderedTexture `update` field to "none" when a portal aperture isn't visible/on-screen enough
// to matter (projectedApertureAreaPx(), built on X3DOMRenderAdapter.worldToScreen() against the
// MAIN camera — not a reuse of three.js's projectedPortalApertureDevicePixels, which is raw
// THREE.Vector3/camera-matrix math with no X3DOM equivalent).
//
// REWRITTEN 2026-08-13 for the RenderedTexture architecture: the old screenshot-polling mechanism
// needed an indirect captureAttempts counter (a monotonic count of actual capture() calls) because
// the captured texture could be legitimately byte-identical across ticks regardless of gating.
// RenderedTexture's `update` field is a direct, first-class signal instead — previewDebugState()'s
// `updateMode` reads it straight off the live DOM, so this just asserts eligible ⇒ "always" and
// ineligible ⇒ "none" directly, no before/after delta needed.
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

  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  // Measured at ~450ms in a clean, low-contention run — `ready` (contentKind set) doesn't itself
  // wait on WoW-fetch settling, but this timed out twice under real system load once portal-preview
  // destinations started sharing X3DOM's Inline-load queue with the active world's own hosted
  // objects (see spike-run-x3dom-hosted-objects-wow-fetch.mjs's own widened timeout, same cause).
  // Widened for real margin under load, not because the underlying operation got slower itself.
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length === 2 && state.every((r) => r.ready);
  }, { timeout: 40000 });

  // Boot's default camera pose (seeded facing the spawn area) should already be eligible — the
  // Stage 0-2 spikes' previewAllReady checks already confirm previews come up under default boot
  // conditions, so this is the known-good baseline, not a new assumption.
  await new Promise((r) => setTimeout(r, 800));
  const nearEligible = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.eligible));
  const nearUpdateModes = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.updateMode));

  // Turn the camera to face AWAY from both portals. Seeding a distant focusPosition doesn't work
  // here: x3dom-live-mode.mjs's own onEnterFrame loop calls camera.step(dt, realAvatarPosition)
  // every real frame regardless of what this test does, which immediately re-centers the orbit
  // focus back onto the avatar's REAL position (confirmed empirically — a first draft of this
  // spike tried a distant focusPosition and found the camera had drifted back to near the avatar
  // within ~500ms). Azimuth/polar/distance, by contrast, are the orbit controller's own persistent
  // state (only changed by real input or an explicit seed() call) and are NOT overwritten by the
  // continuous re-stepping — flipping azimuth 180° reliably turns the portals behind the camera
  // (worldToScreen's viewSpace.z < 0 test fails for all 4 corners), independent of that loop.
  await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    m.camera.seed({ azimuth: Math.PI, polar: 1.0, distance: 6, focusPosition: avatarPos });
    m.camera.step(5, avatarPos);
  });
  await new Promise((r) => setTimeout(r, 800));
  const farEligible = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.eligible));
  const farUpdateModes = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.updateMode));

  // Turn back to face the portals (azimuth 0, the known-eligible default boot orientation).
  await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    m.camera.seed({ azimuth: 0, polar: 1.0, distance: 6, focusPosition: avatarPos });
    m.camera.step(5, avatarPos);
  });
  await new Promise((r) => setTimeout(r, 800));
  const restoredEligible = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.eligible));
  const restoredUpdateModes = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => r.updateMode));

  const nearUpdatingAlways = nearEligible.every((e) => e === true) && nearUpdateModes.every((m) => m === "always");
  const farBecameIneligible = farEligible.every((e) => e === false);
  const farPaused = farUpdateModes.every((m) => m === "none");
  const restoredBecameEligibleAgain = restoredEligible.every((e) => e === true) && restoredUpdateModes.every((m) => m === "always");
  const noErrors = errors.length === 0;
  const ok = nearUpdatingAlways && farBecameIneligible && farPaused && restoredBecameEligibleAgain && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, nearUpdatingAlways, farBecameIneligible, farPaused, restoredBecameEligibleAgain, noErrors,
    nearEligible, nearUpdateModes,
    farEligible, farUpdateModes,
    restoredEligible, restoredUpdateModes,
    errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
