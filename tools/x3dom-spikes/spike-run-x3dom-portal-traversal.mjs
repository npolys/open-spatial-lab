// Phase 2 of the X3DOM render-parity plan: verifies portal apertures render on boot and a real
// crossing (backend exit-intent/arrival, UM manifest sign+verify, active-endpoint promotion,
// scene recomposition, camera remap) works end-to-end against the real, running ?renderer=x3dom
// app — same requires-a-live-backend model as spike-run-x3dom-live-mode.mjs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const page = await browser.newPage();
  const errors = [];
  // Known-benign patterns this whole suite already filters elsewhere: X3DOM's own internal
  // addNameSpace/Inline-node null-deref (intermittent, documented as not affecting functional
  // correctness — see spike-run-x3dom-equipment-anchors.mjs's header comment), and the
  // WoW-negotiated-asset feature's expected 403/404 noise (the demo's first two hosted objects at
  // every location are always restricted/hidden — see wow-asset.js). This spike previously lacked
  // this filter entirely, unlike its siblings.
  const KNOWN_BENIGN_ERROR_PATTERNS = [
    /Cannot read properties of null \(reading 'doc'\)/,
    /Cannot read properties of null \(reading 'removeSpace'\)/,
    /Permissions policy violation/,
    /Failed to load resource: the server responded with a status of (403|404)/i,
  ];
  const isBenign = (text) => KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(t); });
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });
  await page.waitForFunction(() => window.__x3domLiveMode.liveAdapter.world != null, { timeout: 10000 });

  // --- Portal apertures render on boot, sized/positioned from the real backend portal frames. ---
  const boot = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portals = Array.isArray(world.portals) && world.portals.length ? world.portals : (world.portal ? [world.portal] : []);
    const apertureGroup = Array.from(document.querySelectorAll("transform")).find((t) => t.name === "x3dom-portal-apertures");
    return {
      locationId: world.location_id,
      portalCount: portals.length,
      apertureChildCount: apertureGroup ? apertureGroup.children.length : 0,
    };
  });
  // Each portal now mounts 2 DOM children: the aperture plane itself plus a decorative ring mesh
  // (portal-parity fix, matching three.js's own dest-portal-ring) — not 1:1 with portalCount.
  const aperturesRendered = boot.portalCount > 0 && boot.apertureChildCount === boot.portalCount * 2;

  // --- Drive the avatar toward the first portal and through it (same stepAvatar mechanism the
  // real per-frame loop uses; looped without real-time delay so this doesn't take wall-clock
  // minutes) and confirm the backend-driven crossing actually completes. ---
  const walk = await page.evaluate(async () => {
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const portal = (world.portals && world.portals[0]) || world.portal;
    const frame = portal.frame;
    const start = m.liveAdapter.state.avatar.position;
    const targetX = frame.position[0] * 1.15;
    const targetZ = frame.position[2] * 1.15;
    const yaw = Math.atan2(targetX - start[0], targetZ - start[2]);
    const dt = 1 / 60;
    let crossed = false;
    for (let i = 0; i < 600 && !crossed; i++) {
      m.liveAdapter.stepAvatar({ forward: true, run: true, camera_yaw: yaw }, dt);
      await new Promise((r) => setTimeout(r, 0));
      if (m.liveAdapter.world.location_id !== world.location_id)
        crossed = true;
    }
    return { crossed, fromLocationId: world.location_id };
  });

  let settled = null;
  for (let i = 0; i < 40; i++) {
    settled = await page.evaluate(() => ({
      phase: window.__x3domLiveMode.liveAdapter.state.phase,
      locationId: window.__x3domLiveMode.liveAdapter.world.location_id,
    }));
    if (settled.phase === "arrived")
      break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const after = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const world = m.liveAdapter.world;
    const worldGroup = Array.from(document.querySelectorAll("transform")).find((t) => t.name === "x3dom-world-content");
    const apertureGroup = Array.from(document.querySelectorAll("transform")).find((t) => t.name === "x3dom-portal-apertures");
    const portals = Array.isArray(world.portals) && world.portals.length ? world.portals : (world.portal ? [world.portal] : []);
    const avatarPos = m.liveAdapter.state.avatar.position;
    const domTranslation = (m.avatarHandle.getAttribute("translation") || "").trim().split(/\s+/).map(Number);
    return {
      locationId: world.location_id,
      worldColor: world.color,
      worldContentChildCount: worldGroup ? worldGroup.children.length : 0,
      apertureChildCount: apertureGroup ? apertureGroup.children.length : 0,
      portalCount: portals.length,
      avatarDomSynced: domTranslation.length === 3 &&
        Math.hypot(...domTranslation.map((v, i) => v - avatarPos[i])) < 0.001,
      cameraMode: m.camera.mode(),
    };
  });

  const crossedWorlds = walk.crossed && after.locationId !== walk.fromLocationId;
  const phaseSettled = settled.phase === "arrived";
  const sceneRecomposed = after.worldContentChildCount > 0 &&
    after.apertureChildCount === after.portalCount * 2;
  const noPageErrors = errors.length === 0;
  const ok = aperturesRendered && crossedWorlds && phaseSettled && sceneRecomposed &&
    after.avatarDomSynced && noPageErrors;

  console.log("RESULT:", JSON.stringify({
    ok, aperturesRendered, crossedWorlds, phaseSettled, sceneRecomposed,
    avatarDomSynced: after.avatarDomSynced, noPageErrors,
    boot, walk, settled, after, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
