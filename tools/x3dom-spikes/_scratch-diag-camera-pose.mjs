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
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 800));
  const info = await page.evaluate(() => {
    const adapter = window.__x3domLiveMode.adapter;
    const cam = adapter.camera;
    const canvas = document.querySelector("#x3dom-host canvas");
    return {
      camPosition: cam.getAttribute("position"),
      camOrientation: cam.getAttribute("orientation"),
      canvasSize: canvas ? [canvas.width, canvas.height] : null,
      sceneRootChildCount: adapter.sceneRoot.children.length,
    };
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
