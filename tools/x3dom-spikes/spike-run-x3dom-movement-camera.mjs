// Phase 1 of the X3DOM render-parity plan: verifies jump, first/third-person toggle, and the
// camera-wall occlusion approximation against the real, running ?renderer=x3dom app (same
// requires-a-live-backend model as spike-run-x3dom-live-mode.mjs, which this extends rather than
// duplicates — that spike still covers boot/session/WASD/orbit-follow baseline).
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
  // 403/404 "Failed to load resource" is the WoW-negotiated-asset feature's own expected noise —
  // the demo's first two hosted objects at every location are always restricted/hidden (see
  // wow-asset.js). The addNameSpace null-deref is X3DOM's own documented intermittent internal
  // Inline-node quirk (see spike-run-x3dom-equipment-anchors.mjs's header comment) — this spike
  // previously lacked this filter, unlike its siblings, and started surfacing it after the
  // portal-preview clip-plane work added more DOM construction at boot.
  const KNOWN_BENIGN_ERROR_PATTERNS = [
    /Cannot read properties of null \(reading 'doc'\)/,
    /Cannot read properties of null \(reading 'removeSpace'\)/,
    /Permissions policy violation: unload is not allowed/,
    /Failed to load resource: the server responded with a status of (403|404)/i,
  ];
  const isBenign = (t) => KNOWN_BENIGN_ERROR_PATTERNS.some((p) => p.test(t));
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(t); });
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });
  await page.waitForFunction(() => window.__x3domLiveMode.camera.mode() === "third_person", { timeout: 10000 });

  // --- Jump: hold Space, sample avatar Y mid-press, confirm it rose above baseline. ---
  const baselineY = await page.evaluate(() => window.__x3domLiveMode.liveAdapter.state.avatar.position[1]);
  await page.keyboard.down("Space");
  await new Promise((r) => setTimeout(r, 250));
  const peakY = await page.evaluate(() => window.__x3domLiveMode.liveAdapter.state.avatar.position[1]);
  await page.keyboard.up("Space");
  await new Promise((r) => setTimeout(r, 600));
  const jumpRose = peakY > baselineY + 0.1;

  // --- First/third person toggle: 'C' hides the avatar and pulls the camera to eye height. ---
  const thirdPersonState = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    const camPos = m.adapter.camera.getAttribute("position").trim().split(/\s+/).map(Number);
    return {
      mode: m.camera.mode(),
      avatarRender: m.avatarHandle.getAttribute("render"),
      cameraDistance: Math.hypot(camPos[0] - avatarPos[0], camPos[1] - avatarPos[1], camPos[2] - avatarPos[2]),
    };
  });
  await page.keyboard.press("KeyC");
  await new Promise((r) => setTimeout(r, 200));
  const firstPersonState = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    const camPos = m.adapter.camera.getAttribute("position").trim().split(/\s+/).map(Number);
    return {
      mode: m.camera.mode(),
      avatarRender: m.avatarHandle.getAttribute("render"),
      cameraDistance: Math.hypot(camPos[0] - avatarPos[0], camPos[1] - avatarPos[1], camPos[2] - avatarPos[2]),
    };
  });
  await page.keyboard.press("KeyC");
  await new Promise((r) => setTimeout(r, 500));
  const backToThirdPerson = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    return { mode: m.camera.mode(), avatarRender: m.avatarHandle.getAttribute("render") };
  });

  const toggleWorked = thirdPersonState.mode === "third_person" &&
    thirdPersonState.cameraDistance > 2.5 &&
    firstPersonState.mode === "first_person" &&
    firstPersonState.avatarRender === "false" &&
    firstPersonState.cameraDistance < 2.0 &&
    backToThirdPerson.mode === "third_person" &&
    backToThirdPerson.avatarRender === "true";

  // --- Occlusion: verify the CONTROLLER's own blocking/hysteresis wiring by monkey-patching
  // pickViewCenter() with a controlled fake hit, rather than relying on X3DOM's real picking
  // against freshly-created geometry. That real-picking mechanism (pickViewCenter's hide/restore
  // round-trip) is already covered in isolation, against static original-parse markup, by
  // spike-run-pick-view-center.mjs — duplicating it here would just re-run the same proof. What
  // this phase actually adds is the controller code that decides *when* to call it and what to do
  // with the result, which is what this block tests. (Empirically, during this work, a
  // dynamically-`add()`-ed Shape did NOT register reliably with pickViewCenter() in this X3DOM
  // build, unlike statically-authored markup — an extension of the same "dynamically created
  // nodes are unreliable" constraint this codebase already documents for <Inline> nodes. Worth
  // tracking as a further adapter limitation; not something Phase 1 can or should fix.)
  const occlusionResult = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    const adapter = m.adapter;
    const original = adapter.pickViewCenter.bind(adapter);
    const fakeNode = document.createElement("transform");
    fakeNode.setAttribute("render", "true");
    let fakeHit = { node: fakeNode, position: [0, 0, 0], normal: null, distance: 0.5 };
    adapter.pickViewCenter = () => fakeHit;
    m.camera.step(0.016, m.liveAdapter.state.avatar.position);
    const hiddenWhileBlocking = fakeNode.getAttribute("render") === "false";
    fakeHit = null;
    m.camera.step(0.016, m.liveAdapter.state.avatar.position);
    const restoredAfterClear = fakeNode.getAttribute("render") === "true";
    adapter.pickViewCenter = original;
    return { hiddenWhileBlocking, restoredAfterClear };
  });
  const occlusionWorked = occlusionResult.hiddenWhileBlocking && occlusionResult.restoredAfterClear;

  const noPageErrors = errors.length === 0;
  const ok = jumpRose && toggleWorked && occlusionWorked && noPageErrors;

  console.log("RESULT:", JSON.stringify({
    ok, jumpRose, toggleWorked, occlusionWorked, noPageErrors,
    baselineY, peakY, thirdPersonState, firstPersonState, backToThirdPerson, occlusionResult, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
