// Diagnostic only: the default 3rd-person orbit camera looks down at an angle where a flat
// (floor-parallel) ring and an upright (wall-parallel) ring can both foreshorten into a similar-
// looking oval from above — not reliable for telling them apart. This directly seeds the orbit
// camera (per orbit-camera-controller.mjs's own formula: offset = (sin(az)*cosPolar, sin(polar),
// cos(az)*cosPolar) * distance, polar near 0 = level) focused on the portal itself, positioned on
// the near/approach side (opposite the portal's forward vector), close, and level — an
// unambiguous head-on view: wall-parallel should read as a near-complete oval filling the
// aperture; floor-parallel should read as a thin horizontal sliver.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

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
  await new Promise((r) => setTimeout(r, 1000));

  const info = await page.evaluate(async () => {
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portal = (world.portals && world.portals[0]) || world.portal;
    const framePos = portal.frame.position;
    const fwd = portal.frame.forward;
    const az = Math.atan2(-fwd[0], -fwd[2]);
    m.camera.seed({ azimuth: az, polar: 0.1, distance: 3, focusPosition: [framePos[0], framePos[1], framePos[2]] });
    m.camera.step(5, framePos);
    return { framePos, fwd, az, pose: m.camera.currentPose() };
  });

  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: join(OUT_DIR, "ring-orientation-check.png") });
  console.log("RESULT:", JSON.stringify(info, null, 2));
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
