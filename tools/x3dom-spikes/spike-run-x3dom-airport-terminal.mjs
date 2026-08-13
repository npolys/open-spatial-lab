// X3DOM airport-terminal parity, Stage 1 (structural geometry): verifies the real airport terminal
// content (walls/columns/storefronts/gate/signage, from mountAirportTerminalContentX3dom) mounts
// for both the ACTIVE-world case (a player standing in the airport, ?active=airport — confirmed a
// valid direct boot endpoint via runtime/world-server/src/config.js's node-role list) and the
// portal-preview case (viewing the airport from the lobby, ?active=lobby, reachable via
// location-lobby's third portal per the existing wow-authored-graph portal-preview spike).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
// Portable relative to this script's own location, not a hardcoded machine-specific absolute
// path — this spike is registered in REGRESSION_SPIKES and needs to run on any checkout.
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Cannot read properties of null \(reading 'removeSpace'\)/,
  /Permissions policy violation/,
  /Failed to load resource: the server responded with a status of (403|404)/i,
];
const isBenign = (t) => KNOWN_BENIGN_ERROR_PATTERNS.some((p) => p.test(t));

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  // --- Active-world case: boot directly into the airport. ---
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`pageerror: ${t}`); });
  page.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors.push(`console[error]: ${m.text()}`); });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=airport&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 1500)); // let mountWorldContent's airport branch finish

  const active = await page.evaluate(() => {
    // Scope to the ACTIVE world-content group specifically — the airport's own portal back to
    // the lobby legitimately mounts a canonical-room preview in a separate hidden host (a
    // different <x3d> document entirely), so a document-wide canonical-world-floor search would
    // false-positive on that real, correct portal-preview content.
    const worldContentGroup = Array.from(document.querySelectorAll("transform")).find((t) => t.name === "x3dom-world-content");
    const terminalGroup = worldContentGroup ? Array.from(worldContentGroup.children).find((t) => t.name === "airport-terminal-content") : null;
    const storeCount = terminalGroup ? Array.from(terminalGroup.children).filter((c) => (c.name || "").startsWith("airport-store:")).length : 0;
    const gateCount = terminalGroup ? Array.from(terminalGroup.children).filter((c) => (c.name || "").startsWith("airport-gate:")).length : 0;
    const canonicalRoomPresentInActiveWorld = worldContentGroup
      ? !!Array.from(worldContentGroup.children).find((t) => t.name === "canonical-world-floor")
      : false;
    return {
      locationId: window.__x3domLiveMode.liveAdapter.world?.location_id,
      terminalGroupFound: !!terminalGroup,
      storeCount,
      gateCount,
      canonicalRoomPresentInActiveWorld,
    };
  });
  await page.screenshot({ path: join(OUT_DIR, "airport-active.png") }).catch(() => {});

  // --- Portal-preview case: view the airport through a portal from the lobby. ---
  const page2 = await browser.newPage();
  const errors2 = [];
  page2.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors2.push(`pageerror: ${t}`); });
  page2.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors2.push(`console[error]: ${m.text()}`); });
  await page2.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=lobby&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page2.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page2.evaluate(() => window.__x3domLiveMode.avatarReady);
  await page2.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.some((r) => r.contentKind === "authored_wow_graph" && r.ready);
  }, { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  const preview = await page2.evaluate(() => {
    const state = window.__x3domLiveMode.portalGlue.previewDebugState();
    const airportRecord = state.find((r) => r.contentKind === "authored_wow_graph");
    // debugDestSceneRoot(index) already exists on the glue for exactly this kind of DOM-access
    // debug need (see the glue's own header comment on why previewDebugState() itself stays
        // plain-data-only).
    const index = state.indexOf(airportRecord);
    const destRoot = airportRecord ? window.__x3domLiveMode.portalGlue.debugDestSceneRoot(index) : null;
    const terminalGroup = destRoot ? Array.from(destRoot.querySelectorAll("transform")).find((t) => t.name === "airport-terminal-content") : null;
    return {
      airportRecordFound: !!airportRecord,
      terminalGroupFound: !!terminalGroup,
    };
  });

  const ok = active.terminalGroupFound && active.storeCount === 4 && active.gateCount === 1 &&
    !active.canonicalRoomPresentInActiveWorld && errors.length === 0 &&
    preview.airportRecordFound && preview.terminalGroupFound && errors2.length === 0;

  console.log("RESULT:", JSON.stringify({ ok, active, preview, errors, errors2 }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
