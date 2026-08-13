import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

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
  const KNOWN_BENIGN_ERROR_PATTERNS = [
    /Cannot read properties of null \(reading 'doc'\)/,
    /Cannot read properties of null \(reading 'removeSpace'\)/,
    /Permissions policy violation/,
  ];
  const isBenign = (t) => KNOWN_BENIGN_ERROR_PATTERNS.some((p) => p.test(t));
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`pageerror: ${t}`); });
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !isBenign(m.text())) errors.push(`console[${m.type()}]: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-rendered-texture-v2.html", { waitUntil: "networkidle0", timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__testResult != null, { timeout: 30000 });
  } catch (waitErr) {
    console.log("TIMED OUT waiting for __testResult:", waitErr.message);
  }
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  console.log("LOG:\n" + logText);
  await page.screenshot({ path: join(OUT_DIR, "rt-feasibility-v5.png") });
  const combined = { ...result, noFeedbackLoopOrErrors: errors.length === 0, errors };
  combined.ok = !!(combined.ok && combined.noFeedbackLoopOrErrors);
  console.log("RESULT:", JSON.stringify(combined, null, 2));
  if (!combined.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
