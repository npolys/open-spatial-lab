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
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));

  const diag = await page.evaluate(() => {
    const canvases = window.x3dom.canvases;
    const rtEls = Array.from(document.querySelectorAll('#x3dom-host renderedtexture'));
    const stagingEls = Array.from(document.querySelectorAll('#x3dom-host [def^="x3dom-portal-staging-"]'));
    return {
      canvasCount: canvases.length,
      nodeBagRenderTexturesLength: canvases[0]?.doc?._nodeBag?.renderTextures?.length ?? null,
      rtElCount: rtEls.length,
      rt0_isSameDoc: rtEls[0]?._x3domNode?._nameSpace?.doc === canvases[0]?.doc,
      rt0_namespaceDefMapHasStaging0: (() => {
        const ns = rtEls[0]?._x3domNode?._nameSpace;
        if (!ns || !ns.defMap) return null;
        // defMap is typically a Map; try both Map and plain-object access.
        if (typeof ns.defMap.get === 'function') return ns.defMap.has('x3dom-portal-staging-0');
        return 'x3dom-portal-staging-0' in ns.defMap;
      })(),
      staging0_el_exists: !!stagingEls.find((e) => e.getAttribute('def') === 'x3dom-portal-staging-0'),
      staging0_el_hasX3domNode: !!stagingEls.find((e) => e.getAttribute('def') === 'x3dom-portal-staging-0')?._x3domNode,
      sceneRefEl0_outerHTML: rtEls[0]?.querySelector('[containerField="scene"]')?.outerHTML,
      sceneRefEl0_hasX3domNode: !!rtEls[0]?.querySelector('[containerField="scene"]')?._x3domNode,
    };
  });
  console.log("DIAG:", JSON.stringify(diag, null, 2));
} finally {
  await browser.close();
}
