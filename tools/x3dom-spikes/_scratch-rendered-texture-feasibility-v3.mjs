// Stage 0 of the RenderedTexture-replaces-screenshot-polling plan — v3, built on a real root cause
// found by reading x3dom-full.js's own renderRTPass()/getViewMatrix() directly (not guessed):
//
// v2 (excludeNodes via DEF/USE on the consumer's geometry leaf) threw no error but never showed the
// destination content (flat ~(10,11,12) reading, unchanged across samples). Tracing renderRTPass()
// in the vendored source explains why, and reveals a BETTER mechanism than excludeNodes entirely:
//
//   var v = i._cf.scene.node;
//   if (v && v !== r) { /* recollect drawables from v's OWN subtree, isolated from the main scene */ }
//   else { /* reuse the MAIN scene's already-collected drawableCollection (includes the consumer!) */ }
//
// RenderedTexture has an SFNode `scene` field (X3DNode) — if set, the RT renders ONLY that
// referenced subtree's drawables, never the main scene at all, so the consumer aperture is never in
// the render regardless of excludeNodes. That's architecturally cleaner than excludeNodes (no
// feedback-loop risk to manage at all) AND fixes a second bug excludeNodes-based v2 had: with `scene`
// unset, getViewMatrix() composes the viewpoint's view matrix with `s.getCurrentTransform().inverse()`
// — correct ONLY for a viewpoint truly embedded in the normal Transform hierarchy, but since our
// nested <viewpoint> lives under <renderedtexture>/<appearance>/<shape>/<transform>, X3DOM's field-
// parent walk picks up that enclosing consumer transform as an "ancestor" and wrongly offsets the
// camera by it. With `scene` SET to something other than the main document scene, getViewMatrix()
// takes a different branch (`r = s.getViewMatrix()` directly, no ancestor composition) — sidestepping
// that bug too.
//
// The DOM-to-field binding for `scene` (X3DNode — matches literally anything) is ambiguous by node
// type alone (a <transform> could just as easily bind to nothing/first-match), so this uses the
// explicit `containerField` attribute (confirmed present in x3dom-full.js's setupTree: every child
// element's containerField attribute is read and passed straight into addChild()) rather than relying
// on type-based inference.
//
// Tests, matching the plan's Stage 0 order:
// (a) no feedback-loop/GL error (this design has no exclusion cycle to trigger one in the first place)
// (b) the aperture plane actually shows the destination content
// (c) update="always" gives genuinely continuous updates (sampled, not just present once)
// (d) content built/swapped AFTER the RenderedTexture already exists is picked up correctly
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  const KNOWN_BENIGN_ERROR_PATTERNS = [
    /Cannot read properties of null \(reading 'doc'\)/,
    /Cannot read properties of null \(reading 'removeSpace'\)/,
    /Permissions policy violation/,
    /Failed to load resource: the server responded with a status of (403|404)/i,
  ];
  const isBenign = (t) => KNOWN_BENIGN_ERROR_PATTERNS.some((p) => p.test(t));
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`pageerror: ${t}`); });
  page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !isBenign(m.text())) errors.push(`console[${m.type()}]: ${m.text()}`); });

  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    const adapter = window.__x3domLiveMode.adapter;
    const sceneRoot = adapter.sceneRoot;

    // Destination subtree: a DEF'd transform containing a magenta box, far from real scene content —
    // a genuine sibling of everything else, not nested inside the consumer.
    const destGroup = document.createElement("transform");
    destGroup.setAttribute("def", "rtDestGroup");
    destGroup.setAttribute("translation", "20 20 20");
    const destShape = document.createElement("shape");
    const destAppearance = document.createElement("appearance");
    const destMaterial = document.createElement("material");
    destMaterial.setAttribute("diffuseColor", "1 0 1");
    destMaterial.setAttribute("emissiveColor", "1 0 1");
    destAppearance.appendChild(destMaterial);
    const destGeom = document.createElement("box");
    destGeom.setAttribute("size", "4 4 4");
    destShape.appendChild(destAppearance);
    destShape.appendChild(destGeom);
    destGroup.appendChild(destShape);
    sceneRoot.appendChild(destGroup);

    // Consumer: a visible plane in front of the main camera, textured with a RenderedTexture whose
    // `scene` field (via containerField="scene") points at destGroup — NOT the whole main scene, so
    // the consumer itself is architecturally never part of what gets rendered into the texture.
    const consumerTransform = document.createElement("transform");
    consumerTransform.setAttribute("translation", "0 1.5 -3");
    const consumerShape = document.createElement("shape");
    const consumerAppearance = document.createElement("appearance");
    const consumerMaterial = document.createElement("material");
    consumerMaterial.setAttribute("diffuseColor", "1 1 1");
    consumerAppearance.appendChild(consumerMaterial);

    const renderedTexture = document.createElement("renderedtexture");
    renderedTexture.setAttribute("dimensions", "128 128 4");
    renderedTexture.setAttribute("update", "always");

    const rtViewpoint = document.createElement("viewpoint");
    rtViewpoint.setAttribute("containerField", "viewpoint");
    rtViewpoint.setAttribute("position", "20 20 25");
    rtViewpoint.setAttribute("orientation", "0 0 1 0");
    rtViewpoint.setAttribute("fieldOfView", "0.8");
    renderedTexture.appendChild(rtViewpoint);

    const sceneRef = document.createElement("transform");
    sceneRef.setAttribute("containerField", "scene");
    sceneRef.setAttribute("use", "rtDestGroup");
    renderedTexture.appendChild(sceneRef);

    consumerAppearance.appendChild(renderedTexture);
    const consumerGeom = document.createElement("plane");
    consumerGeom.setAttribute("size", "2 2");
    consumerShape.appendChild(consumerAppearance);
    consumerShape.appendChild(consumerGeom);
    consumerTransform.appendChild(consumerShape);
    sceneRoot.appendChild(consumerTransform);

    window.__rtFeasibility = { destMaterial, destGroup, renderedTexture, rtViewpoint };
    return { added: true };
  });

  // Diag read as a SEPARATE round trip (not in the same evaluate() as construction above) —
  // MutationObserver callbacks that register the new nodes with X3DOM run as a microtask, not
  // synchronously within the script that appended them; reading _x3domNode immediately in the same
  // evaluate() call sees pre-registration state (confirmed empirically: first attempt read all
  // fields as false/0 despite construction succeeding).
  await new Promise((r) => setTimeout(r, 300));
  const diag = await page.evaluate(() => {
    const { renderedTexture } = window.__rtFeasibility;
    const rtNode = renderedTexture._x3domNode;
    return {
      hasX3domNode: !!rtNode,
      sceneFieldNode: !!rtNode && !!rtNode._cf.scene.node,
      sceneFieldIsMainScene: !!rtNode && rtNode._cf.scene.node === rtNode._nameSpace.doc._scene,
      viewpointFieldNode: !!rtNode && !!rtNode._cf.viewpoint.node,
      nodeBagCount: window.x3dom?.canvases?.[0]?.doc?._nodeBag?.renderTextures?.length ?? null,
    };
  });
  console.log("DIAG:", JSON.stringify(diag, null, 2));

  await new Promise((r) => setTimeout(r, 1500));

  async function sampleCenterPixel() {
    return page.evaluate(() => {
      const canvas = document.querySelector("#x3dom-host canvas");
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const ctx = scratch.getContext("2d");
      ctx.drawImage(canvas, 0, 0);
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const region = ctx.getImageData(cx - 20, cy - 20, 40, 40).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < region.length; i += 4) { r += region[i]; g += region[i + 1]; b += region[i + 2]; n += 1; }
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
  }

  // (a) + (b): no feedback-loop error (checked via `errors` at the end), and the plane shows the
  // magenta destination content.
  const sample1 = await sampleCenterPixel();

  // (c) continuous live updates: sample again with unchanged content.
  await new Promise((r) => setTimeout(r, 500));
  const sample2 = await sampleCenterPixel();

  // (d) dynamic content swap AFTER the RenderedTexture already exists — the real risk category.
  await page.evaluate(() => {
    const { destMaterial } = window.__rtFeasibility;
    destMaterial.setAttribute("diffuseColor", "0.8 1 0");
    destMaterial.setAttribute("emissiveColor", "0.8 1 0");
  });
  await new Promise((r) => setTimeout(r, 1000));
  const sample3 = await sampleCenterPixel();

  await page.screenshot({ path: join(OUT_DIR, "rt-feasibility-v3.png") });

  const magentaish = (c) => c[0] > 120 && c[2] > 120 && c[1] < 120;
  const yellowGreenish = (c) => c[0] > 120 && c[1] > 120 && c[2] < 120;
  const result = {
    diag,
    noFeedbackLoopOrErrors: errors.length === 0,
    rendersDestinationContent: magentaish(sample1),
    stableBeforeSwap: magentaish(sample2),
    dynamicSwapPickedUp: yellowGreenish(sample3),
    sample1, sample2, sample3,
    errors,
  };
  result.ok = result.noFeedbackLoopOrErrors && result.rendersDestinationContent && result.stableBeforeSwap && result.dynamicSwapPickedUp;
  writeFileSync(join(OUT_DIR, "rt-feasibility-v3.json"), JSON.stringify(result, null, 2));
  console.log("RESULT:", JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
