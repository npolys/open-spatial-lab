import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1100, height: 800 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => errors.push(`console[${m.type()}]: ${m.text()}`));
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-portal.html", { waitUntil: "networkidle0", timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__spikeResult != null, { timeout: 15000 });
  } catch (waitErr) {
    console.log("TIMED OUT waiting for __spikeResult:", waitErr.message);
  }
  const result = await page.evaluate(() => window.__spikeResult || null);
  const statusText = await page.evaluate(() => document.getElementById("status")?.textContent || "(no status el)");
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  const diag = await page.evaluate(() => {
    const src = document.getElementById("source");
    return {
      x3domGlobalPresent: typeof window.x3dom !== "undefined",
      x3domVersion: window.x3dom && window.x3dom.about ? window.x3dom.about : null,
      sourceRuntimePresent: !!(src && src.runtime),
      sourceHasCanvas: !!(src && src.querySelector("canvas")),
      sourceInnerHTMLSnippet: src ? src.innerHTML.slice(0, 300) : null,
    };
  });
  console.log("STATUS:", statusText);
  console.log("LOG:\n" + logText);
  console.log("DIAG:", JSON.stringify(diag, null, 2));
  console.log("JSON:", JSON.stringify(result, null, 2));
  if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
} finally {
  await browser.close();
}
