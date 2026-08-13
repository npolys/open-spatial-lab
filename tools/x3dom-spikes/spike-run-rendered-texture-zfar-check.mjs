import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`console[${m.type()}]: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-rendered-texture-zfar-check.html", { waitUntil: "networkidle0", timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__testResult != null, { timeout: 30000 });
  } catch (waitErr) {
    console.log("TIMED OUT waiting for __testResult:", waitErr.message);
  }
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  console.log("LOG:\n" + logText);
  const combined = { ...result, errors };
  console.log("RESULT:", JSON.stringify(combined, null, 2));
  if (!combined.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
