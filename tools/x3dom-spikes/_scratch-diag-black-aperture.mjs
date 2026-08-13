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
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));

  const diag = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const state = m.portalGlue.previewDebugState();
    const stagingRoot0 = m.portalGlue.debugDestSceneRoot(0);
    const rtEls = Array.from(document.querySelectorAll('#x3dom-host renderedtexture'));
    const rt0 = rtEls[0];
    const rtNode = rt0?._x3domNode;
    return {
      previewState: state,
      stagingChildCount: stagingRoot0 ? stagingRoot0.children.length : null,
      stagingChildTags: stagingRoot0 ? Array.from(stagingRoot0.children).map((c) => c.tagName.toLowerCase()) : null,
      rtCount: rtEls.length,
      rtOuterHTMLStart: rt0 ? rt0.outerHTML.slice(0, 200) : null,
      rtHasX3domNode: !!rtNode,
      rtSceneFieldNode: !!rtNode && !!rtNode._cf.scene.node,
      rtSceneFieldIsMainScene: !!rtNode && rtNode._cf.scene.node === rtNode._nameSpace.doc._scene,
      rtViewpointFieldNode: !!rtNode && !!rtNode._cf.viewpoint.node,
      rtViewpointPosition: rt0?.querySelector('viewpoint')?.getAttribute('position'),
      // Does the aperture material's <appearance> actually contain both material + renderedtexture,
      // in what order, and is there anything ELSE unexpected in there?
      apertureAppearanceHTML: (() => {
        const shapes = Array.from(document.querySelectorAll('#x3dom-host transform')).filter((t) => t._x3dShape);
        return null; // placeholder, real query below
      })(),
    };
  });
  console.log("DIAG:", JSON.stringify(diag, null, 2));

  // Separately: find the actual aperture <shape>/<appearance> in the DOM directly.
  const apertureHtml = await page.evaluate(() => {
    const rt = document.querySelector('#x3dom-host renderedtexture');
    const appearance = rt ? rt.closest('appearance') : null;
    return appearance ? appearance.outerHTML.slice(0, 500) : null;
  });
  console.log("APERTURE APPEARANCE HTML:", apertureHtml);
} finally {
  await browser.close();
}
