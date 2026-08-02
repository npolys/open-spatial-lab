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
  page.on("console", (m) => console.log(`console[${m.type()}]: ${m.text()}`));
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-inline-url-swap.html", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => window.__testResult != null, { timeout: 30000 }).catch((e) => console.log("timeout:", e.message));
  const result = await page.evaluate(() => window.__testResult);
  console.log("RESULT:", JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
