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
  const mountCalls = [];
  await page.evaluateOnNewDocument(() => {
    window.__mountLog = [];
  });
  page.on("console", (m) => console.log("[console]", m.text()));
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=airport&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 1500));

  const info = await page.evaluate(() => {
    const worldContentGroups = Array.from(document.querySelectorAll("transform")).filter((t) => t.name === "x3dom-world-content");
    const terminalGroups = Array.from(document.querySelectorAll("transform")).filter((t) => t.name === "airport-terminal-content");
    const canonicalFloors = Array.from(document.querySelectorAll("transform")).filter((t) => t.name === "canonical-world-floor");
    return {
      worldContentGroupCount: worldContentGroups.length,
      terminalGroupCount: terminalGroups.length,
      canonicalFloorCount: canonicalFloors.length,
      // where do the canonical floors actually live? (which parent group)
      canonicalFloorParents: canonicalFloors.map((f) => f.parentElement && f.parentElement.name),
      terminalGroupParents: terminalGroups.map((f) => f.parentElement && f.parentElement.name),
      worldContentChildNames: worldContentGroups.map((g) => Array.from(g.children).map((c) => c.name)),
    };
  });
  console.log("RESULT:", JSON.stringify(info, null, 2));
} finally {
  await browser.close();
}
