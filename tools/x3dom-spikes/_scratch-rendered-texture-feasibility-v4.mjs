// Stage 0 of the RenderedTexture-replaces-screenshot-polling plan — v4.
//
// v3 fixed two real, source-confirmed bugs (containerField-based `scene`/`viewpoint` field binding,
// avoiding the ancestor-transform bug in getViewMatrix() when `scene` is unset) but STILL read a
// flat, unchanging (10,11,12) at screen-center — identical across v1/v2/v3 despite structurally
// different RenderedTexture setups. That invariance across unrelated changes is itself the signal:
// it means center-screen sampling was never actually looking at OUR test plane at all. The live app
// scene (window.__x3domLiveMode) already has 36 real children in sceneRoot (room walls, floor,
// avatar, ...) by the time this spike injects content — a plane placed at a hardcoded (0,1.5,-3)
// can easily be occluded by, or embedded inside, that real geometry, so the sample was reading real
// room content the whole time, not our texture.
//
// Fix: stop guessing where the camera is looking. Use the adapter's own setCameraPose() (a real,
// already-proven method — every third/first-person camera update in this app goes through it) to
// point the MAIN camera directly at a test plane placed far from any real content (100,1.5,100 —
// nowhere near the ~12x12 room the live scene actually occupies), guaranteeing an unobstructed view
// regardless of what real scene content exists. The RenderedTexture's own destination box sits
// further along the same far-away area, in a different direction from the consumer so the two don't
// spatially overlap.
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

    // Destination subtree: a DEF'd transform containing a magenta box, far out at (100,1.5,80) —
    // "north" of the consumer plane below, in clear open space nowhere near the real room.
    const destGroup = document.createElement("transform");
    destGroup.setAttribute("def", "rtDestGroup");
    destGroup.setAttribute("translation", "100 1.5 80");
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

    // Consumer: a plane at (100,1.5,100), textured with a RenderedTexture whose `scene` field
    // (containerField="scene") points at destGroup, and whose own nested viewpoint sits at
    // (100,1.5,84) looking north at the magenta box.
    const consumerTransform = document.createElement("transform");
    consumerTransform.setAttribute("translation", "100 1.5 100");
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
    rtViewpoint.setAttribute("position", "100 1.5 84");
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

    // Point the MAIN camera directly at the consumer plane — sidesteps any uncertainty about the
    // live app's own camera pose or intervening real-room geometry entirely.
    adapter.setCameraPose(adapter.camera, { position: [100, 1.5, 104], lookAt: [100, 1.5, 100] });

    window.__rtFeasibility = { destMaterial, destGroup, renderedTexture, rtViewpoint };
    return { added: true };
  });

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

  const sample1 = await sampleCenterPixel();
  await page.screenshot({ path: join(OUT_DIR, "rt-feasibility-v4-sample1.png") });

  await new Promise((r) => setTimeout(r, 500));
  const sample2 = await sampleCenterPixel();

  await page.evaluate(() => {
    const { destMaterial } = window.__rtFeasibility;
    destMaterial.setAttribute("diffuseColor", "0.8 1 0");
    destMaterial.setAttribute("emissiveColor", "0.8 1 0");
  });
  await new Promise((r) => setTimeout(r, 1000));
  const sample3 = await sampleCenterPixel();

  await page.screenshot({ path: join(OUT_DIR, "rt-feasibility-v4-sample3.png") });

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
  writeFileSync(join(OUT_DIR, "rt-feasibility-v4.json"), JSON.stringify(result, null, 2));
  console.log("RESULT:", JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
