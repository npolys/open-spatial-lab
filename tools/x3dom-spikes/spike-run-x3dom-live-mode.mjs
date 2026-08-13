// Phase 7: verifies the live app's actual X3DOM preview mode (?renderer=x3dom) end-to-end —
// not a spike page like the other scripts in this directory, but the real index.html served by
// the real backend (requires launchOpenSpatialLab.sh already running, same as verify-demo.mjs).
// Confirms: the X3D host attaches and gets a runtime, a real LiveAdapter session connects to the
// real backend (world-graph fetch + presence registration), a real avatar loads, and WASD input
// actually moves both the avatar (a real X3D DOM attribute change) and the orbit camera that
// follows it — the full pipeline, not just presence of the pieces.
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
  // "Permissions policy violation: unload is not allowed" is a known, benign headless-Chrome
  // artifact seen across every spike in this suite (X3DOM registers an unload listener headless
  // Chrome's permissions policy blocks) — not a real error, filtered the same way
  // verify-demo.mjs filters its own known-benign noise. The 403/404 "Failed to load resource"
  // pattern is the WoW-negotiated-asset feature's own expected noise — the demo's first two
  // hosted objects at every location are always restricted/hidden (see wow-asset.js).
  page.on("console", (m) => {
    if (m.type() === "error" && !/Permissions policy violation: unload is not allowed|Failed to load resource: the server responded with a status of (403|404)/i.test(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  // networkidle0 never resolves here on purpose (LiveAdapter opens a persistent runtime-state
  // WebSocket) — domcontentloaded + an explicit wait for the live-mode handle is the correct wait.
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  // Generous timeout: this is the one script in the suite that does a real WebSocket connect +
  // world-graph fetch + glTF avatar load in sequence, and running late in a long batch (this is
  // usually last) means it's competing with whatever's left of prior spikes' software-rendering
  // load — seen taking meaningfully longer under that contention than standalone.
  await page.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });
  // The glTF avatar load (real network fetch + Inline-pool URL swap/poll) can comfortably exceed
  // 1s under headless/software rendering — wait for the actual readiness signal (avatarReady)
  // rather than a fixed guess, so the WASD/DOM-sync assertions below don't race a slow load.
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);

  const before = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    return {
      x3dHostPresent: !!document.getElementById("x3dom-host"),
      x3dCanvasPresent: !!document.querySelector("#x3dom-host canvas"),
      backend: m?.adapter?.runtime?.backendName?.() || null,
      avatarPosition: m?.liveAdapter?.state?.avatar?.position || null,
      cameraPosition: m?.adapter?.camera?.getAttribute("position") || null,
    };
  });

  await page.keyboard.down("KeyW");
  await new Promise((r) => setTimeout(r, 800));
  await page.keyboard.up("KeyW");
  await new Promise((r) => setTimeout(r, 200));

  const after = await page.evaluate(() => {
    const m = window.__x3domLiveMode;
    return {
      avatarPosition: m?.liveAdapter?.state?.avatar?.position || null,
      avatarHandleTranslation: m?.avatarHandle?.getAttribute("translation") || null,
      cameraPosition: m?.adapter?.camera?.getAttribute("position") || null,
    };
  });

  const backendOk = before.x3dHostPresent && before.x3dCanvasPresent && before.backend === "webgl";
  const sessionConnected = Array.isArray(before.avatarPosition) && before.avatarPosition.length === 3;
  const avatarMoved = Array.isArray(before.avatarPosition) && Array.isArray(after.avatarPosition) &&
    Math.hypot(...after.avatarPosition.map((v, i) => v - before.avatarPosition[i])) > 0.05;
  const domTranslation = (after.avatarHandleTranslation || "").trim().split(/\s+/).map(Number);
  const avatarDomSynced = domTranslation.length === 3 && Array.isArray(after.avatarPosition) &&
    Math.hypot(...domTranslation.map((v, i) => v - after.avatarPosition[i])) < 0.001;
  const cameraFollowed = before.cameraPosition !== after.cameraPosition;
  const noPageErrors = errors.length === 0;

  const ok = backendOk && sessionConnected && avatarMoved && avatarDomSynced && cameraFollowed && noPageErrors;

  console.log("RESULT:", JSON.stringify({
    ok, backendOk, sessionConnected, avatarMoved, avatarDomSynced, cameraFollowed, noPageErrors,
    before, after, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
