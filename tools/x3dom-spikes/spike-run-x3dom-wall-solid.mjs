// Phase 6 of the X3DOM parity plan: verifies the plane/`solid` bridging fix in
// X3DOMRenderAdapter._wrapShape() — canonical-world-content.js's walls request
// `{ side: "double" }` on their material, which createMaterial() now records on the returned
// handle's `base.side`, and _wrapShape() bridges onto the geometry element as `solid="false"`
// (X3DOM's Plane node inherits a `solid` SFBool field from X3DGeometryNode, default true /
// backface-culled — confirmed by reading x3dom-full.js's X3DGeometryNode field registration).
// Before this fix the two fields (material's `side`, geometry's `solid`) were never bridged, so
// walls stayed single-sided even when double-sided was explicitly requested.
//
// Checks DOM attributes directly rather than attempting a live pick from outside the room: Phase 1
// separately found dynamically-mounted geometry (which the canonical world content is — it's
// mounted via JS after page load, not present in the original static parse) unreliable for
// X3DOM's pickViewCenter()/shootRay() picking in this build, a distinct, already-documented
// constraint unrelated to this fix. Testing the DOM attribute isolates the fix itself.
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
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);

  const result = await page.evaluate(() => {
    const host = document.getElementById("x3dom-host") || document;
    const planes = Array.from(host.querySelectorAll("plane"));
    const solidFalseCount = planes.filter((p) => p.getAttribute("solid") === "false").length;
    const totalPlanes = planes.length;
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portalCount = (Array.isArray(world.portals) && world.portals.length ? world.portals : (world.portal ? [world.portal] : [])).length;
    return { totalPlanes, solidFalseCount, portalCount };
  });

  // canonical-world-content.js mounts exactly one single-sided floor plane and two double-sided
  // wall planes (backWall "canonical-world-wall-z", leftWall "canonical-world-wall-x"). Portal
  // apertures (x3dom-portal-traversal-glue.mjs) are also double-sided planes as of the
  // portal-preview-real-content follow-on's texture-rendering fix (a thin box was found to never
  // visibly texture in this X3DOM build — see that file's header comment — while a double-sided
  // plane, enabled by this same solid="false" bridge, renders correctly from both approach
  // directions). So the expected double-sided count is the 2 fixed walls plus however many
  // portals the active world has, read live rather than hardcoded so this doesn't go stale again
  // if the demo world's portal count changes.
  const expectedSolidFalseCount = 2 + result.portalCount;
  const ok = result.totalPlanes >= 3 && result.solidFalseCount === expectedSolidFalseCount && errors.length === 0;

  console.log("RESULT:", JSON.stringify({ ok, ...result, expectedSolidFalseCount, errors }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
