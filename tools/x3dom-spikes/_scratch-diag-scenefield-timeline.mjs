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

  // Poll every 100ms for 4s, recording exactly when each portal's RT scene field first resolves
  // (or fails to).
  const timeline = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    const t0 = performance.now();
    const interval = setInterval(() => {
      const rtEls = Array.from(document.querySelectorAll('#x3dom-host renderedtexture'));
      const sample = {
        tMs: Math.round(performance.now() - t0),
        rtCount: rtEls.length,
        states: rtEls.map((el) => {
          const node = el._x3domNode;
          return {
            hasNode: !!node,
            sceneFieldNode: !!node && !!node._cf.scene.node,
            sceneUseNodeCount: el.querySelector('[containerfield="scene"]') ? (node && node._cf.scene.node ? 1 : 0) : -1,
          };
        }),
      };
      samples.push(sample);
      if (performance.now() - t0 > 4000) {
        clearInterval(interval);
        resolve(samples);
      }
    }, 150);
  }));
  console.log("TIMELINE:", JSON.stringify(timeline, null, 2));
} finally {
  await browser.close();
}
