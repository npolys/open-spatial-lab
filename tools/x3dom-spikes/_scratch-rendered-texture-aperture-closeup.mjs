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
  await page.waitForFunction(() => (window.__x3domLiveMode?.avatarHandle?.children?.length || 0) > 0, { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  // Right aperture region, zoomed — from the default-pose screenshot, roughly x=770-1024, y=80-465.
  await page.screenshot({ path: join(OUT_DIR, "rt-rewrite-aperture-closeup.png"), clip: { x: 770, y: 80, width: 254, height: 385 } });
  console.log("done");
} finally {
  await browser.close();
}
