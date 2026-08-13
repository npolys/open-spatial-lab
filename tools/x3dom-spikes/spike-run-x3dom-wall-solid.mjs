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

// Same known-benign addNameSpace/Inline-node null-deref quirk documented throughout this project's
// history (Phase 3; also hit 3 older spikes once the ClipPlane awareness-volume work added more
// concurrent DOM construction — see the ClipPlane section of the X3DOM parity plan). This spike
// never needed the filter before because it never triggered concurrent Inline/namespace churn; the
// RenderedTexture rewrite's staged portal-preview content (clip planes + canonical rooms, now built
// inside this same document) pushed it over that same threshold.
const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Cannot read properties of null \(reading 'removeSpace'\)/,
];
function isBenign(text) {
  return KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(t); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  // Portal-preview destination content now stages directly inside the same #x3dom-host document
  // (the RenderedTexture rewrite, 2026-08-13 — see x3dom-portal-traversal-glue.mjs's own header
  // comment), not a separate hidden <x3d> element invisible to this query — wait for every preview
  // record to resolve real content first, or the staged-wall count below would be a moving target.
  await page.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length > 0 && state.every((r) => r.ready);
  }, { timeout: 20000 });

  const result = await page.evaluate(() => {
    const host = document.getElementById("x3dom-host") || document;
    const planes = Array.from(host.querySelectorAll("plane"));
    const solidFalseCount = planes.filter((p) => p.getAttribute("solid") === "false").length;
    const totalPlanes = planes.length;
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portalCount = (Array.isArray(world.portals) && world.portals.length ? world.portals : (world.portal ? [world.portal] : [])).length;
    // legacy_world and placeholder destinations both mount via mountCanonicalWorldContent, adding
    // 2 more double-sided walls apiece, now inside this same document; authored_wow_graph
    // destinations (buildWowScene + mountAirportTerminalContentX3dom) don't follow that same
    // fixed 2-wall shape, so they're deliberately not counted here — read live rather than assumed,
    // so this doesn't silently go stale if the demo world's portal topology changes.
    const preview = m.portalGlue.previewDebugState();
    const stagedCanonicalRoomCount = preview.filter((r) => r.contentKind === "legacy_world" || r.contentKind === "placeholder").length;
    return { totalPlanes, solidFalseCount, portalCount, stagedCanonicalRoomCount };
  });

  // canonical-world-content.js mounts exactly one single-sided floor plane and two double-sided
  // wall planes (backWall "canonical-world-wall-z", leftWall "canonical-world-wall-x"). Portal
  // apertures (x3dom-portal-traversal-glue.mjs) are also double-sided planes as of the
  // portal-preview-real-content follow-on's texture-rendering fix (a thin box was found to never
  // visibly texture in this X3DOM build — see that file's header comment — while a double-sided
  // plane, enabled by this same solid="false" bridge, renders correctly from both approach
  // directions). So the expected double-sided count is the 2 fixed walls, plus however many
  // portals the active world has (their apertures), plus 2 more for every portal-preview
  // destination that mounted its own canonical room (staged in this same document since the
  // RenderedTexture rewrite) — all read live rather than hardcoded.
  const expectedSolidFalseCount = 2 + result.portalCount + result.stagedCanonicalRoomCount * 2;
  const ok = result.totalPlanes >= 3 && result.solidFalseCount === expectedSolidFalseCount && errors.length === 0;

  console.log("RESULT:", JSON.stringify({ ok, ...result, expectedSolidFalseCount, errors }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
