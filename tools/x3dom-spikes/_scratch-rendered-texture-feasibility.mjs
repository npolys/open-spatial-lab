// Feasibility spike, NOT a regression check: does X3DOM's RenderedTexture node (confirmed present
// in the vendored x3dom-full.js — registerNodeType("RenderedTexture","Texturing",...), fields
// `dimensions` (MFInt32, default [128,128,4]), `update` (SFString: NONE/NEXT_FRAME_ONLY/ALWAYS),
// `viewpoint` (SFNode, set via a nested child element, NOT an attribute — confirmed via
// addField_SFNode("viewpoint", x3dom.nodeTypes.X3DViewpointNode)) actually work against content
// built the way this app's real portal-preview content is built: everything constructed via
// runtime DOM APIs (document.createElement/appendChild) AFTER initial page parse, not declared
// statically in the original HTML. This exact "dynamically created" constraint is what has broken
// other X3DOM mechanisms in this project before (Inline nodes needing pool pre-seeding, dynamic
// Shape geometry being unreliable for picking) — so this must be verified directly, not assumed
// from the spec or from RenderedTexture's own official mirror/reflection tutorial (which only
// demonstrates statically-declared content).
//
// Test design: build a plane in clear view of the main camera, textured with a RenderedTexture
// whose viewpoint looks at a distinctly-colored box placed far from all real scene content (so
// there's no ambiguity about what's being captured). Everything built via page.evaluate DOM calls,
// mirroring how mountPortalApertures()/mountCanonicalWorldContent() actually construct content.
// Then screenshot the MAIN canvas and pixel-sample the plane's on-screen region. A second phase
// swaps the box's color and re-samples, to confirm genuinely live updates (not a one-shot capture).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const PNG = null; // no PNG-decode dependency available here — sample via a 2D canvas readback in-page instead.

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

  const setup = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const adapter = m.adapter;
    const sceneRoot = adapter.sceneRoot;

    // Distant, distinctly-colored box — nowhere near real scene content (rooms are ~12x12 at
    // world origin), so anything captured by the RenderedTexture unambiguously came from here.
    const farBox = document.createElement("transform");
    farBox.setAttribute("translation", "20 20 20");
    const farShape = document.createElement("shape");
    const farAppearance = document.createElement("appearance");
    const farMaterial = document.createElement("material");
    farMaterial.setAttribute("diffuseColor", "1 0 1");
    farMaterial.setAttribute("emissiveColor", "1 0 1"); // unlit-ish, avoids ambiguity from lighting
    farAppearance.appendChild(farMaterial);
    const farBoxGeom = document.createElement("box");
    farBoxGeom.setAttribute("size", "4 4 4");
    farShape.appendChild(farAppearance);
    farShape.appendChild(farBoxGeom);
    farBox.appendChild(farShape);
    sceneRoot.appendChild(farBox);

    // Visible test plane, directly in front of the default camera pose, textured with a
    // RenderedTexture whose viewpoint looks at the magenta box above.
    const testTransform = document.createElement("transform");
    testTransform.setAttribute("def", "rtConsumerTransform");
    testTransform.setAttribute("translation", "0 1.5 -3");
    const testShape = document.createElement("shape");
    const testAppearance = document.createElement("appearance");
    const testMaterial = document.createElement("material");
    testMaterial.setAttribute("diffuseColor", "1 1 1");
    testAppearance.appendChild(testMaterial);

    const renderedTexture = document.createElement("renderedtexture");
    renderedTexture.setAttribute("dimensions", "128 128 4");
    renderedTexture.setAttribute("update", "always");
    const rtViewpoint = document.createElement("viewpoint");
    rtViewpoint.setAttribute("position", "20 20 25");
    rtViewpoint.setAttribute("orientation", "0 0 0 0");
    rtViewpoint.setAttribute("fieldofview", "0.8");
    renderedTexture.appendChild(rtViewpoint);
    testAppearance.appendChild(renderedTexture);

    const testPlane = document.createElement("plane");
    testPlane.setAttribute("size", "2 2");
    testShape.appendChild(testAppearance);
    testShape.appendChild(testPlane);
    testTransform.appendChild(testShape);
    sceneRoot.appendChild(testTransform);

    // excludeNodes (MFNode) — without this, RenderedTexture's default "render the whole scene"
    // behavior includes the very shape that's consuming the texture, causing a framebuffer/texture
    // feedback loop (confirmed empirically: WebGL threw GL_INVALID_OPERATION "Feedback loop formed
    // between Framebuffer and active Texture" without this). Reference the consumer via DEF/USE,
    // X3DOM's convention for MFNode child-node references.
    const excludeRef = document.createElement("transform");
    excludeRef.setAttribute("use", "rtConsumerTransform");
    renderedTexture.appendChild(excludeRef);

    window.__rtFeasibility = { farMaterial, testMaterial };
    return { added: true };
  });

  await new Promise((r) => setTimeout(r, 1500)); // let RenderedTexture's own render pass run several times

  async function sampleCenterPixel() {
    return page.evaluate(() => new Promise((resolve) => {
      const canvas = document.querySelector("#x3dom-host canvas");
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const ctx = scratch.getContext("2d");
      ctx.drawImage(canvas, 0, 0);
      // Sample a small region around screen-center, where the test plane should be (default
      // camera looks down -Z at the origin area; the plane sits at (0,1.5,-3), close and centered).
      const cx = Math.floor(canvas.width / 2);
      const cy = Math.floor(canvas.height / 2);
      const region = ctx.getImageData(cx - 20, cy - 20, 40, 40).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < region.length; i += 4) { r += region[i]; g += region[i + 1]; b += region[i + 2]; n += 1; }
      resolve({ avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] });
    }));
  }

  const before = await sampleCenterPixel();
  await page.screenshot({ path: "/mnt/c/git/open-spatial-lab/tools/x3dom-spikes/_scratch-compare-out/rt-feasibility-before.png" });

  // Phase 2: swap the distant box to a very different color (bright yellow-green) and confirm the
  // plane's sampled color actually changes — proves live updates, not a one-shot initial capture.
  await page.evaluate(() => {
    const { farMaterial } = window.__rtFeasibility;
    farMaterial.setAttribute("diffuseColor", "0.8 1 0");
    farMaterial.setAttribute("emissiveColor", "0.8 1 0");
  });
  await new Promise((r) => setTimeout(r, 1500));
  const after = await sampleCenterPixel();
  await page.screenshot({ path: "/mnt/c/git/open-spatial-lab/tools/x3dom-spikes/_scratch-compare-out/rt-feasibility-after.png" });

  // Magenta ~ (255,0,255), yellow-green ~ (204,255,0). "Renders at all" = center pixel isn't the
  // plain white/background it'd be if the texture never picked up any content. "Updates live" =
  // before/after colors are meaningfully different in the expected direction.
  const magentaish = before.avg[0] > 120 && before.avg[2] > 120 && before.avg[1] < 120;
  const yellowGreenish = after.avg[0] > 120 && after.avg[1] > 120 && after.avg[2] < 120;
  const changed = Math.hypot(...before.avg.map((v, i) => v - after.avg[i])) > 60;

  const result = {
    renders: magentaish,
    updatesLive: changed && yellowGreenish,
    before: before.avg,
    after: after.avg,
    errors,
  };
  writeFileSync("/mnt/c/git/open-spatial-lab/tools/x3dom-spikes/_scratch-compare-out/rt-feasibility.json", JSON.stringify(result, null, 2));
  console.log("RESULT:", JSON.stringify(result, null, 2));
  if (!result.renders) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
