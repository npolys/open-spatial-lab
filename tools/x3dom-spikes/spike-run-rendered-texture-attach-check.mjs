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
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-rendered-texture-attach-check.html", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => window.__testResult != null, { timeout: 20000 }).catch(() => {});
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log)");
  console.log("LOG:\n" + logText);
  console.log("RESULT:", JSON.stringify({ ...result, errors }, null, 2));
} finally {
  await browser.close();
}
