import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  page.on("console", () => {});
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);

  const timeline = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 20; i++) {
      const snap = Array.from(document.querySelectorAll('inline[data-x3dom-inline-pool-slot="claimed"]')).map((slot) => {
        const wrapper = slot.parentElement;
        return {
          name: wrapper.name || "(equip/avatar)",
          url: slot.getAttribute("url").split("/").pop(),
          childrenCount: slot.children.length,
          render: wrapper.getAttribute("render"),
        };
      });
      out.push({ t: Math.round(performance.now()), snap });
      await new Promise((r) => setTimeout(r, 1000));
    }
    return out;
  });

  console.log("RESULT:", JSON.stringify(timeline, null, 2));
} finally {
  await browser.close();
}
