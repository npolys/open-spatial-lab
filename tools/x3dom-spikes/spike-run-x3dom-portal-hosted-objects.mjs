// Portal-preview real-content work, Stage 0: verifies syncHostedSceneObjectMeshesX3dom
// (web/x3dom-portal-hosted-objects.mjs) — the X3DOM-native sibling to
// portal-render-controller.mjs's syncHostedSceneObjectMeshes(), needed because that function is
// NOT engine-agnostic (hardcodes ThreeRenderAdapter, reaches past the adapter for raw three.js
// mesh/material/geometry APIs X3DOM's plain-DOM mesh handles don't have).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 700, height: 500 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Permissions policy violation: unload is not allowed/i.test(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  await page.goto("http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-portal-hosted-objects.html", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => window.__testResult != null, { timeout: 15000 }).catch(() => { });
  const result = await page.evaluate(() => window.__testResult || null);
  const logText = await page.evaluate(() => document.getElementById("log")?.textContent || "(no log el)");
  console.log("LOG:\n" + logText);
  const ok = !!result?.ok && errors.length === 0;
  console.log("RESULT:", JSON.stringify({ ok, ...result, errors }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
