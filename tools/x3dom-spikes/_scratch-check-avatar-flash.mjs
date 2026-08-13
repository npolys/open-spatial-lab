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
  const errors = [];
  const logs = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (/equip/i.test(m.text())) logs.push(m.text()); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 500)); // let equipment settle

  const samples = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 60; i++) {
      const m = window.__x3domLiveMode;
      const avatarNode = m.avatarHandle;
      const anchors = avatarNode._x3domAnchors || {};
      const equipRenders = {};
      for (const [name, anchor] of Object.entries(anchors)) {
        equipRenders[name] = Array.from(anchor.children).map((c) => ({
          tag: c.tagName,
          render: c.getAttribute ? c.getAttribute("render") : null,
        }));
      }
      out.push({
        t: performance.now(),
        avatarRender: avatarNode.getAttribute("render"),
        equipRenders,
      });
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });

  // Detect toggling: any attribute value that changes back and forth (not just settles once).
  const avatarValues = samples.map((s) => s.avatarRender);
  const avatarToggles = avatarValues.filter((v, i) => i > 0 && v !== avatarValues[i - 1]).length;

  console.log("RESULT:", JSON.stringify({ avatarToggles, lastSample: samples[samples.length - 1], logs, errors }, null, 2));
} finally {
  await browser.close();
}
