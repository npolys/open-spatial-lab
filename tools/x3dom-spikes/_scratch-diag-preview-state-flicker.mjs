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
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  for (let i = 0; i < 15; i += 1) {
    const state = await page.evaluate(() => {
      const s = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
      return Array.isArray(s) ? s.map((r) => r.ready) : null;
    });
    console.log(`t=${i * 1000}ms state=${JSON.stringify(state)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("ERRORS:", JSON.stringify(errors, null, 2));
} finally {
  await browser.close();
}
