import { createRequire } from "node:module";
import { join, dirname } from "node:path";
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
  await new Promise((r) => setTimeout(r, 2000));

  await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portal = (Array.isArray(world.portals) && world.portals[0]) || world.portal;
    const frame = portal.frame;
    const pos = frame.position;
    const fwd = frame.forward;
    // Directly set the MAIN camera pose (bypassing the orbit controller's azimuth math entirely) —
    // 1.5m in front of the aperture, looking straight at its center.
    const camPos = [pos[0] + fwd[0] * 1.5, pos[1], pos[2] + fwd[2] * 1.5];
    m.adapter.setCameraPose(m.adapter.camera, { position: camPos, lookAt: pos });
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: join(OUT_DIR, "rt-rewrite-aperture-pointblank.png") });
  console.log("done");
} finally {
  await browser.close();
}
