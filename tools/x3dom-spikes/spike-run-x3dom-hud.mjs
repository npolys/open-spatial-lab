// Phase 4 of the X3DOM render-parity plan: verifies the toast/notification chrome and the airport
// HUD overlay's projection mechanism work against the real, running ?renderer=x3dom app. The
// overlay's real storefront/traveler content is out of scope for this phase (see the comment in
// x3dom-hud-glue.mjs) — this spike verifies the mechanism directly with a synthetic entity rather
// than depending on airport-terminal content that doesn't exist in the X3DOM path yet.
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
  page.on("pageerror", (e) => errors.push(String(e)));
  // 403/404 "Failed to load resource" is the WoW-negotiated-asset feature's own expected noise —
  // the demo's first two hosted objects at every location are always restricted/hidden (see
  // wow-asset.js).
  page.on("console", (m) => {
    if (m.type() === "error" && !/Permissions policy violation: unload is not allowed|Failed to load resource: the server responded with a status of (403|404)/i.test(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });

  // --- HUD glue constructed correctly (even with zero real airport entities). ---
  const glueConstructed = await page.evaluate(() => !!window.__x3domLiveMode.hudGlue.airportHud);

  // --- Toast fires and renders real text. ---
  await page.evaluate(() => window.__x3domLiveMode.hudGlue.showToast("TEST TOAST", "sub text", "toast-test"));
  await new Promise((r) => setTimeout(r, 150));
  const toastText = await page.evaluate(() => {
    const el = document.querySelector("#toast-stack .toast .big");
    return el ? el.textContent : null;
  });

  // --- Projection mechanism: mount a second overlay instance with one synthetic traveler node,
  // offset sideways from the avatar's own XZ, and confirm it renders a positioned tag that moves
  // when the camera does. A traveler (not a storefront) deliberately: airport-hud-overlay.mjs
  // overrides Y to fixed constants regardless of the node's own transform (STOREFRONT_TAG_Y=4.4
  // vs TRAVELER_TAG_Y=2.35) — 2.35 is close to the orbit camera's look-target height and reliably
  // in frame; 4.4 is not, for the camera framing this app seeds by default.
  //
  // Deliberately offset from the avatar's exact X/Z (not placed there directly): a point sharing
  // the orbit focus's X/Z sits exactly on the orbit camera's own vertical rotation axis, so a
  // PURE azimuth (yaw-only) orbit — rotating around that same axis — leaves it essentially
  // stationary on screen by simple rotational symmetry, regardless of whether the camera or the
  // projection math has any bug at all. Confirmed directly: after setCameraPose() was fixed to
  // stop introducing roll (a real bug fixed the same session this offset was added — see the
  // parity-plan memory), this on-axis test position went from "coincidentally shifts a couple px
  // because roll was breaking the rotational symmetry" to "correctly stays put," which looked
  // like a projection regression but was actually the roll fix working as intended. An off-axis
  // point isn't subject to that symmetry and reliably shifts under azimuth-only rotation with or
  // without roll — verified directly (an on-axis point moved 640→639px vs. an off-axis point
  // moving 1382,607→531,970px for the identical azimuth nudge) before landing on this fix.
  const projection = await page.evaluate(async () => {
    const { initAirportHudOverlay } = await import("/hud/airport-hud-overlay.mjs");
    const m = window.__x3domLiveMode;
    const avatarPos = m.liveAdapter.state.avatar.position;
    // 16-element column-major identity-rotation matrix; translation = avatar's XZ offset sideways
    // (Y is overridden by the overlay itself), matching the [12,13,14] convention nodePosition()
    // reads.
    const node = {
      webofworlds_extension: { actor: { display_name: "Joe" } },
      localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, avatarPos[0] + 2, avatarPos[1], avatarPos[2] + 1, 1],
    };
    const testHud = initAirportHudOverlay({
      adapter: m.adapter,
      camera: m.adapter.camera,
      scene: null,
      document,
      host: document.getElementById("scene-mount"),
      stores: [],
      travelers: [node],
    });
    if (!testHud)
      return { ok: false, reason: "initAirportHudOverlay returned null" };
    await new Promise((r) => setTimeout(r, 250));
    const tag = testHud.layer.querySelector('[data-slug="person-joe"]');
    const transformBefore = tag ? tag.style.transform : null;
    const visibleBefore = tag ? tag.style.display !== "none" : false;

    // Nudge the third-person orbit camera and let a few frames run.
    m.camera.orbit.state.targetAzimuth += 1.2;
    await new Promise((r) => setTimeout(r, 400));
    const transformAfter = tag ? tag.style.transform : null;

    testHud.dispose();
    return {
      ok: true,
      entityCount: testHud.entityCount,
      tagFound: !!tag,
      visibleBefore,
      transformBefore,
      transformAfter,
      transformChanged: transformBefore !== transformAfter,
    };
  });

  const toastWorked = toastText === "TEST TOAST";
  const projectionWorked = projection.ok && projection.entityCount === 1 && projection.tagFound &&
    projection.visibleBefore && projection.transformChanged;
  const noPageErrors = errors.length === 0;
  const ok = glueConstructed && toastWorked && projectionWorked && noPageErrors;

  console.log("RESULT:", JSON.stringify({
    ok, glueConstructed, toastWorked, projectionWorked, noPageErrors,
    toastText, projection, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
