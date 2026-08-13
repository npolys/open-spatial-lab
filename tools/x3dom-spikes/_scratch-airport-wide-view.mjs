import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=airport&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    // Pull back and up to see more of the concourse, turned away from the portal.
    m.camera.seed({ azimuth: 2.2, polar: 0.55, distance: 22, focusPosition: avatarPos });
    m.camera.step(5, avatarPos);
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: "/mnt/c/git/open-spatial-lab/tools/x3dom-spikes/_scratch-compare-out/airport-wide.png" });
  console.log("done");
} finally {
  await browser.close();
}
