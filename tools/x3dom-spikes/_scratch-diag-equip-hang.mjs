import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => errors.push(`console[${m.type()}]: ${m.text()}`));
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 1000));

  const diag = await page.evaluate(() => {
    const allClaimed = Array.from(document.querySelectorAll('inline[data-x3dom-inline-pool-slot="claimed"]')).map((slot) => {
      const wrapper = slot.parentElement;
      return {
        wrapperName: wrapper.name || null,
        wrapperRender: wrapper.getAttribute("render"),
        url: slot.getAttribute("url"),
        placeholderUrl: slot.getAttribute("data-x3dom-inline-pool-placeholder-url"),
        stillPlaceholder: slot.getAttribute("url") === slot.getAttribute("data-x3dom-inline-pool-placeholder-url"),
        childrenCount: slot.children.length,
      };
    });
    return { allClaimed };
  });

  console.log("RESULT:", JSON.stringify({ diag, errors }, null, 2));
} finally {
  await browser.close();
}
