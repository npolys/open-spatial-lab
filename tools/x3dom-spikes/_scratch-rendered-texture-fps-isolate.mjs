// The first fps check (_scratch-rendered-texture-fps-and-visual-check.mjs) found idleFps (1.8)
// LOWER than nearPortalFps (5.35) — backwards from a naive expectation, and nearPortalFps landed
// suspiciously close to the OLD architecture's own documented ~5.3fps baseline for this same
// 2-portal case (see memory: osl-x3dom-portal-preview-architecture, camera-glue spike section).
// This isolates what's actually going on: measures fps over a longer, settled window at the
// default boot pose (both portals eligible, update="always"), then again with BOTH RenderedTextures
// forced to update="none" (previews fully paused) to isolate exactly how much the two continuous,
// unthrottled render-to-texture passes cost per frame in this headless/SwiftShader environment.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

async function measureFps(page, ms) {
  return page.evaluate((durationMs) => new Promise((resolve) => {
    let count = 0;
    const start = performance.now();
    function tick(t) {
      count += 1;
      if (t - start < durationMs) requestAnimationFrame(tick);
      else resolve({ frames: count, elapsedMs: t - start, fps: (count / (t - start)) * 1000 });
    }
    requestAnimationFrame(tick);
  }), ms);
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });

  // Let everything fully settle (asset loads, initial layout, GC) before measuring anything —
  // the first check's low "idle" number was measured too soon after boot to be a fair baseline.
  await new Promise((r) => setTimeout(r, 2000));

  const bothActiveState = await page.evaluate(() => window.__x3domLiveMode.portalGlue.previewDebugState().map((r) => ({ updateMode: r.updateMode, eligible: r.eligible })));
  const withPreviewsFps = await measureFps(page, 3000);

  // Force both RenderedTextures to update="none" directly (bypassing the glue's own eligibility
  // gating, which wouldn't do this at the default boot pose since both portals are on-screen) to
  // isolate exactly what the two continuous render-to-texture passes cost per frame.
  await page.evaluate(() => {
    window.__x3domLiveMode.portalGlue.previewDebugState(); // no-op, just confirms hook still live
  });
  const pausedOk = await page.evaluate(() => {
    // previewDebugState() doesn't expose the raw rt handle, so reach the aperture materials'
    // <renderedtexture> elements directly via the DOM instead — read-only diagnostic use, not a
    // pattern any production code follows.
    const rtEls = Array.from(document.querySelectorAll('#x3dom-host renderedtexture'));
    rtEls.forEach((el) => el.setAttribute('update', 'none'));
    return rtEls.length;
  });
  await new Promise((r) => setTimeout(r, 500));
  const previewsPausedFps = await measureFps(page, 3000);

  // Restore, to leave the page in a normal state (not that anything downstream reads it further).
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('#x3dom-host renderedtexture')).forEach((el) => el.setAttribute('update', 'always'));
  });
  await new Promise((r) => setTimeout(r, 500));
  const restoredFps = await measureFps(page, 3000);

  console.log("RESULT:", JSON.stringify({
    bothActiveState,
    rtElementCount: pausedOk,
    withPreviewsFps: withPreviewsFps.fps,
    previewsPausedFps: previewsPausedFps.fps,
    restoredFps: restoredFps.fps,
    previewCostRatio: withPreviewsFps.fps > 0 ? previewsPausedFps.fps / withPreviewsFps.fps : null,
  }, null, 2));
} finally {
  await browser.close();
}
