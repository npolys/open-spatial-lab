// Stage 0 of the RenderedTexture-replaces-screenshot-polling plan — a CORRECTED retry of the
// earlier feasibility spike (_scratch-rendered-texture-feasibility.mjs), which hit a real
// RangeError: Maximum call stack size exceeded traced to a genuine structural bug, not a false
// alarm: excluding the whole consumer <transform> (via excludeNodes DEF/USE) is inherently
// recursive, because that transform's own subtree (shape > appearance > renderedtexture) CONTAINS
// the very USE reference doing the excluding — a true cycle, not just "referencing an ancestor"
// (which excludeNodes must support in general, e.g. mirrors excluding their own frame). The fix:
// exclude the GEOMETRY LEAF node specifically (a bare <plane>, no children of its own) instead of
// the whole Transform/Shape/Appearance chain — referencing a leaf can't recurse into anything that
// contains the RenderedTexture.
//
// Built via runtime DOM APIs throughout (document.createElement/appendChild), matching how this
// app's real content is always constructed dynamically — not a static-markup baseline, which
// wouldn't be representative of the real integration point in x3dom-portal-traversal-glue.mjs.
//
// Tests, in the order the plan's Stage 0 requires:
// (a) no feedback-loop GL error with excludeNodes referencing only the consumer's geometry leaf
// (b) the aperture plane actually shows the destination content (not blank/background)
// (c) update="always" gives genuinely continuous updates (sample multiple times, not just once)
// (d) content built/swapped AFTER the RenderedTexture already exists (matching real per-crossing
//     world changes) is picked up correctly — the "dynamically-created nodes are unreliable" risk
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

    // Destination content: a magenta box, a genuine SIBLING of the consumer (not nested inside
    // it) — far from real scene content so anything captured unambiguously came from here.
    const destBox = document.createElement("transform");
    destBox.setAttribute("translation", "20 20 20");
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
    destBox.appendChild(destShape);
    sceneRoot.appendChild(destBox);

    // Consumer: a visible plane in front of the main camera, textured with a RenderedTexture.
    // The excluded node is the plane GEOMETRY ITSELF (a leaf, DEF'd), referenced via USE from
    // inside the RenderedTexture — no recursive containment, unlike excluding the whole transform.
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
    rtViewpoint.setAttribute("position", "20 20 25");
    rtViewpoint.setAttribute("orientation", "0 0 1 0");
    rtViewpoint.setAttribute("fieldofview", "0.8");
    renderedTexture.appendChild(rtViewpoint);
    consumerAppearance.appendChild(renderedTexture);

    const consumerGeom = document.createElement("plane");
    consumerGeom.setAttribute("def", "rtConsumerGeom");
    consumerGeom.setAttribute("size", "2 2");
    consumerShape.appendChild(consumerAppearance);
    consumerShape.appendChild(consumerGeom);
    consumerTransform.appendChild(consumerShape);
    sceneRoot.appendChild(consumerTransform);

    // DIAGNOSTIC TOGGLE: exclusion temporarily disabled to isolate whether excludeNodes itself is
    // what's preventing content from rendering, vs. some other cause (viewpoint math, dimensions,
    // dynamic-construction unreliability). Accepting the feedback-loop error risk for this one
    // targeted check.
    if (false) {
      const excludeRef = document.createElement("plane");
      excludeRef.setAttribute("use", "rtConsumerGeom");
      renderedTexture.appendChild(excludeRef);
    }

    window.__rtFeasibility = { destMaterial, destBox, renderedTexture, rtViewpoint };
  });

  const diag = await page.evaluate(() => {
    const { renderedTexture, rtViewpoint } = window.__rtFeasibility;
    const rt = renderedTexture._x3domNode || renderedTexture._xmlNode?._x3domNode || null;
    return {
      hasXmlNode: !!renderedTexture._xmlNode,
      hasX3domNodeDirect: !!renderedTexture._x3domNode,
      constructorName: renderedTexture.constructor?.name,
      // X3DOM typically stashes the live node instance on `._x3domNode` once registered — dump
      // whatever's actually there, plus check the doc's own renderTextures bag directly.
      nodeBagCount: window.x3dom?.canvases?.[0]?.doc?._nodeBag?.renderTextures?.length ?? null,
      viewpointHasX3domNode: !!rtViewpoint._x3domNode,
      rtOuterHTML: renderedTexture.outerHTML?.slice(0, 300),
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

  // (c) continuous live updates: sample repeatedly, un-changed content, to see whether the texture
  // is a live GPU render (should be byte/color identical across samples for STATIC content — the
  // real liveness proof is (d) below, changing content) vs check it isn't just a one-shot blank.
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

  await page.screenshot({ path: join(OUT_DIR, "rt-feasibility-v2.png") });

  const magentaish = (c) => c[0] > 120 && c[2] > 120 && c[1] < 120;
  const yellowGreenish = (c) => c[0] > 120 && c[1] > 120 && c[2] < 120;
  const result = {
    noFeedbackLoopOrErrors: errors.length === 0,
    rendersDestinationContent: magentaish(sample1),
    stableBeforeSwap: magentaish(sample2),
    dynamicSwapPickedUp: yellowGreenish(sample3),
    sample1, sample2, sample3,
    errors,
  };
  result.ok = result.noFeedbackLoopOrErrors && result.rendersDestinationContent && result.stableBeforeSwap && result.dynamicSwapPickedUp;
  writeFileSync(join(OUT_DIR, "rt-feasibility-v2.json"), JSON.stringify(result, null, 2));
  console.log("RESULT:", JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
