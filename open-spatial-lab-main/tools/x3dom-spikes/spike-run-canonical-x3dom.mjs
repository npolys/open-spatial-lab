import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 900, height: 700 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => errors.push(`console[${m.type()}]: ${m.text()}`));
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-canonical-scene.html", { waitUntil: "networkidle0", timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__testResult != null, { timeout: 15000 });
  } catch (waitErr) {
    console.log("TIMED OUT waiting for __testResult:", waitErr.message);
  }
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  const domSnippet = await page.evaluate(() => document.getElementById("mount")?.innerHTML?.slice(0, 2000) || null);
  console.log("LOG:\n" + logText);
  console.log("RESULT:", JSON.stringify(result, null, 2));
  console.log("DOM SNIPPET:\n" + domSnippet);
  if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
} finally {
  await browser.close();
}
