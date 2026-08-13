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
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-rendered-texture-orientation-check.html", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => window.__testResult != null, { timeout: 20000 }).catch(() => {});
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log)");
  console.log("LOG:\n" + logText);
  await page.screenshot({ path: join(OUT_DIR, "rt-orientation-check.png") });
  const combined = { ...result, errors };
  console.log("RESULT:", JSON.stringify(combined, null, 2));
  if (!combined.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
