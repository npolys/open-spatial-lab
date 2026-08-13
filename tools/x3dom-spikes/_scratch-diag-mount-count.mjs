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
  const logs = [];
  page.on("console", (m) => { logs.push(m.text()); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));

  // Count how many DEF="x3dom-portal-staging-N" elements exist RIGHT NOW (duplicates would mean
  // mountWorldContent/mountPortalApertures ran more than once without properly clearing the prior
  // staging groups first).
  const defCounts = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('#x3dom-host [def]'));
    const stagingDefs = all.filter((el) => (el.getAttribute('def') || '').startsWith('x3dom-portal-staging-'));
    const counts = {};
    stagingDefs.forEach((el) => {
      const d = el.getAttribute('def');
      counts[d] = (counts[d] || 0) + 1;
    });
    return { totalStagingDefEls: stagingDefs.length, counts };
  });
  console.log("DEF COUNTS:", JSON.stringify(defCounts, null, 2));

  const crossingLogs = logs.filter((l) => l.includes('crossing') || l.includes('x3dom-portal-glue'));
  console.log("PORTAL-GLUE LOG LINES:\n" + crossingLogs.join('\n'));
} finally {
  await browser.close();
}
