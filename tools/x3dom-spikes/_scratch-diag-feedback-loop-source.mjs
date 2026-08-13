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
  const warns = [];
  page.on("console", (m) => { if (m.type() === "warn" && m.text().includes("Feedback loop")) warns.push(Date.now()); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=b&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 2500));
  const portalCount = await page.evaluate(() => {
    const w = window.__x3domLiveMode.liveAdapter.world;
    return (Array.isArray(w.portals) && w.portals.length ? w.portals : (w.portal ? [w.portal] : [])).length;
  });
  console.log(JSON.stringify({ active: "b", portalCount, feedbackLoopWarnCount: warns.length }));
} finally {
  await browser.close();
}
