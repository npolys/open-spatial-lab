import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: [
    "--no-sandbox",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=gl",
    "--enable-gpu-rasterization",
    "--ignore-gpu-blocklist",
  ],
  defaultViewport: { width: 1100, height: 800 },
});
try {
  const page = await browser.newPage();
  await page.goto("about:blank");
  const gpuInfo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return { webgl: false };
    const dbgInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl: true,
      renderer: dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: dbgInfo ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  });
  console.log("GPU INFO:", JSON.stringify(gpuInfo, null, 2));

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
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  console.log("LOG:\n" + logText);
  console.log("JSON:", JSON.stringify(result, null, 2));
  if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
} finally {
  await browser.close();
}
