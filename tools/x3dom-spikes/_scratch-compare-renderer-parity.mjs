// Ad hoc visual + performance parity comparison between the three.js and X3DOM render paths,
// requested directly (not a permanent regression spike). Boots each renderer against the same
// world/pose, screenshots the scene at a default pose and a near-portal pose, and measures real
// browser rAF frame rate under matching conditions (idle default pose, near-portal with preview
// capture active). Uses window.__assembly (three.js) / window.__x3domLiveMode (x3dom) globals.
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const OUT_DIR = process.env.COMPARE_OUT_DIR || "/mnt/c/git/open-spatial-lab/tools/x3dom-spikes/_scratch-compare-out";
mkdirSync(OUT_DIR, { recursive: true });

const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Cannot read properties of null \(reading 'removeSpace'\)/,
  /Permissions policy violation/,
  /Failed to load resource: the server responded with a status of (403|404)/i,
];
function isBenign(text) {
  return KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

async function measureFps(page, ms) {
  return page.evaluate((durationMs) => new Promise((resolve) => {
    let count = 0;
    const start = performance.now();
    let last = start;
    let maxGap = 0;
    function tick(t) {
      count += 1;
      const gap = t - last;
      if (gap > maxGap) maxGap = gap;
      last = t;
      if (t - start < durationMs) {
        requestAnimationFrame(tick);
      } else {
        const elapsed = t - start;
        resolve({ frames: count, elapsedMs: elapsed, fps: (count / elapsed) * 1000, maxGapMs: maxGap });
      }
    }
    requestAnimationFrame(tick);
  }), ms);
}

async function runFor(browser, renderer) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  const errors = [];
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`pageerror: ${t}`); });
  page.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors.push(`console: ${m.text()}`); });

  const url = `http://127.0.0.1:8143/index.html?renderer=${renderer}&role=player&active=a&intro=0`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  if (renderer === "x3dom") {
    await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
    await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  } else {
    await page.waitForFunction(() => window.__assembly?.equipmentReady?.(), { timeout: 30000 });
    // three.js shows a "player-first-frame" onboarding card gating nothing functionally (it
    // auto-dismisses on the first real drag/WASD) but blocking the view visually until dismissed;
    // click it explicitly since our camera nudge below goes through the debug API, not a real
    // drag, so it wouldn't otherwise trigger the controller's own auto-dismiss path.
    const startBtn = await page.$('[data-testid="start-exploring"]');
    if (startBtn) await startBtn.click();
  }
  await new Promise((r) => setTimeout(r, 2500)); // let equipment/inline-queue/portal previews fully settle before measuring steady-state fps

  const results = { renderer, errors: [] };
  results.roleChip = await page.evaluate(() => {
    const el = document.getElementById("role-chip");
    const app = document.getElementById("app");
    return { text: el ? el.textContent : null, appClassName: app ? app.className : null };
  });

  // --- Default pose: screenshot + idle fps ---
  results.defaultFps = await measureFps(page, 3000);
  const defaultShot = `${OUT_DIR}/${renderer}-default.png`;
  await page.screenshot({ path: defaultShot });
  results.defaultShot = defaultShot;

  // --- Seed a near-portal pose (same seed both engines, confirmed non-degenerate against
  // gating in the x3dom camera-glue spike) so the portal aperture(s) are on-screen and preview
  // capture is actively running on both engines. ---
  if (renderer === "x3dom") {
    await page.evaluate(() => {
      const m = window.__x3domLiveMode;
      const avatarPos = m.liveAdapter.state.avatar.position;
      m.camera.seed({ azimuth: 0.5, polar: 0.4, distance: 5, focusPosition: avatarPos });
      m.camera.step(5, avatarPos);
    });
  } else {
    await page.evaluate(() => {
      window.__assembly.orbitCamera(0.5, 0.1, -2);
    });
  }
  await new Promise((r) => setTimeout(r, 1200)); // let orbit damping converge on the three.js path

  const portalShot = `${OUT_DIR}/${renderer}-near-portal.png`;
  await page.screenshot({ path: portalShot });
  results.portalShot = portalShot;
  results.nearPortalFps = await measureFps(page, 3000);

  // --- Preview/debug state, for context on what was actually active during the measurement ---
  if (renderer === "x3dom") {
    results.previewDebug = await page.evaluate(() => window.__x3domLiveMode.portalGlue?.previewDebugState?.());
  } else {
    results.previewDebug = await page.evaluate(() => window.__assembly.debugState()?.portal_spatial_preview ?? null);
  }

  results.errors = errors;
  await page.close();
  return results;
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const three = await runFor(browser, "three");
  const x3dom = await runFor(browser, "x3dom");
  const summary = {
    three: {
      defaultFps: three.defaultFps,
      nearPortalFps: three.nearPortalFps,
      errors: three.errors,
      shots: [three.defaultShot, three.portalShot],
    },
    x3dom: {
      defaultFps: x3dom.defaultFps,
      nearPortalFps: x3dom.nearPortalFps,
      errors: x3dom.errors,
      shots: [x3dom.defaultShot, x3dom.portalShot],
    },
  };
  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify({ three, x3dom }, null, 2));
  console.log("RESULT:", JSON.stringify(summary, null, 2));
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
