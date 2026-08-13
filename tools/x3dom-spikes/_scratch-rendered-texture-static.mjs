// Isolates one variable against the dynamic-construction feasibility test
// (_scratch-rendered-texture-feasibility.mjs): is RenderedTexture broken in general, or only for
// content built via runtime DOM APIs after initial parse (the same class of constraint already
// documented for Inline nodes needing pool pre-seeding)? Same magenta-box/plane setup, but
// declared statically in web/x3dom-spikes/spike-x3dom-rendered-texture.html's original markup.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 640, height: 480 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`console[${m.type()}]: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-rendered-texture.html", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => window.__spikeResult != null, { timeout: 15000 });
  const result = await page.evaluate(() => window.__spikeResult);
  console.log("RESULT:", JSON.stringify({ ...result, errors }, null, 2));
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
