// Visual + performance sanity check for the RenderedTexture rewrite, ad hoc (not a permanent
// regression spike). Confirms two things the automated pixel-sample spikes don't directly show:
// (1) the portal aperture actually LOOKS like a real preview window up close, not a broken/blank
// texture; (2) the real frame-rate win the whole rewrite was motivated by — memory documents the
// OLD architecture (2 concurrently-polled hidden <x3d> hosts, location-a's own 2-portal case)
// measuring ~5.3fps under this same headless/SwiftShader environment.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");
mkdirSync(OUT_DIR, { recursive: true });

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
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });

  // Idle baseline fps (matches the "near" pose used in the gating spike's default boot orientation
  // — both portals eligible/updating).
  await new Promise((r) => setTimeout(r, 500));
  const idleFps = await measureFps(page, 2000);

  // Walk the camera close to a portal for a real up-close screenshot of the aperture itself —
  // reusing the same orbit-seed technique the gating spike uses to get a deterministic pose.
  const portalFrame = await page.evaluate(() => {
    const world = window.__x3domLiveMode.liveAdapter.world;
    const portal = (Array.isArray(world.portals) && world.portals[0]) || world.portal;
    return portal.frame;
  });
  await page.evaluate((frame) => {
    const m = window.__x3domLiveMode;
    // Position the avatar/camera focus a couple meters in front of the portal, looking at it.
    const pos = frame.position;
    const fwd = frame.forward;
    const standAt = [pos[0] + fwd[0] * 3, 0, pos[2] + fwd[2] * 3];
    m.camera.seed({ azimuth: Math.atan2(-fwd[0], -fwd[2]), polar: 1.15, distance: 2.5, focusPosition: [pos[0] + fwd[0] * 2, pos[1], pos[2] + fwd[2] * 2] });
    m.camera.step(5, [pos[0] + fwd[0] * 2, 0, pos[2] + fwd[2] * 2]);
  }, portalFrame);
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: join(OUT_DIR, "rt-rewrite-near-portal.png") });

  const nearPortalFps = await measureFps(page, 2000);

  const result = { idleFps: idleFps.fps, nearPortalFps: nearPortalFps.fps, errors };
  writeFileSync(join(OUT_DIR, "rt-rewrite-fps.json"), JSON.stringify(result, null, 2));
  console.log("RESULT:", JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
