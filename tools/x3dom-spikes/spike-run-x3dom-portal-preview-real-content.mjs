// Portal-preview real-content work, Stage 1: verifies x3dom-portal-traversal-glue.mjs's portal
// preview now shows REAL destination content instead of Phase 6's fixed-color placeholder room.
//
// Two scenarios against the real running backend:
// (A) `?active=a` — location-a's two real portals: one to location-b (legacy_world, used to
//     verify the hosted-scene-object live-sync loop, since a default demo object already exists
//     there) and one to location-lobby (legacy_world, used to verify the REAL color, since
//     location-b's real color happens to equal the old hardcoded placeholder "#3aa0ff" by
//     coincidence — resolvePortalDestinationContent's legacy_world branch only special-cases
//     location-lobby to "#42d68a" — so the lobby-bound portal is the one place a color mismatch
//     with the old placeholder would actually be visible).
// (B) `?active=lobby` — location-lobby's third portal targets location-airport, the only world
//     with an authored WoW graph (confirmed via runtime/world-server/src/config.js). Verifies the
//     preview reaches the authored_wow_graph branch with real node content, and explicitly that no
//     airport-terminal-specific content was mounted (mountAirportTerminalContent is a documented,
//     deliberate scope cut for this stage — this assertion keeps that cut honest and diffable).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Permissions policy violation/,
  // The WoW-negotiated-asset feature deliberately triggers real 403/404s for the demo's own
  // restricted/hidden hosted objects (see wow-asset.js) — expected on every boot now.
  /Failed to load resource: the server responded with a status of (403|404)/i,
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
  const errors = [];

  // --- Scenario A: location-a ---
  const pageA = await browser.newPage();
  pageA.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`A pageerror: ${t}`); });
  pageA.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors.push(`A console: ${m.text()}`); });
  await pageA.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pageA.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await pageA.evaluate(() => window.__x3domLiveMode.avatarReady);
  await pageA.waitForFunction(() => {
    const state = window.__x3domLiveMode?.portalGlue?.previewDebugState?.();
    return Array.isArray(state) && state.length === 2 && state.every((r) => r.contentKind === "legacy_world");
  }, { timeout: 20000 }).catch(() => { });

  const colorResult = await pageA.evaluate(async () => {
    const m = window.__x3domLiveMode;
    const portals = m.liveAdapter.world.portals;
    const lobbyPortal = portals.find((p) => p.target_location_id === "location-lobby");
    const bPortal = portals.find((p) => p.target_location_id === "location-b");
    const lobbyContent = await m.liveAdapter.resolvePortalDestinationContent(lobbyPortal);
    const state = m.portalGlue.previewDebugState();
    const lobbyIdx = portals.indexOf(lobbyPortal);
    const bIdx = portals.indexOf(bPortal);
    const lobbyRoot = m.portalGlue.debugDestSceneRoot(lobbyIdx);
    // setName() sets a plain JS `.name` property, not a DOM attribute — walk elements and read
    // `.name` directly rather than using a `[name=...]` CSS attribute selector (which matches
    // nothing here).
    const wallTransform = lobbyRoot ? Array.from(lobbyRoot.querySelectorAll('*')).find((el) => el.name === 'canonical-world-wall-z') : null;
    const wallDiffuseColor = wallTransform?.querySelector('material')?.getAttribute('diffuseColor') || null;
    return {
      realColorFromApi: lobbyContent.world.color,
      lobbyContentKind: state[lobbyIdx]?.contentKind || null,
      bContentKind: state[bIdx]?.contentKind || null,
      hasHostedGroup: !!m.portalGlue.debugHostedGroup(bIdx),
      wallDiffuseColor,
      lobbyIdx, bIdx,
    };
  });

  const hostedObjectResult = await pageA.evaluate(async () => {
    const m = window.__x3domLiveMode;
    const portals = m.liveAdapter.world.portals;
    const bPortal = portals.find((p) => p.target_location_id === "location-b");
    const bIdx = portals.indexOf(bPortal);
    // Disable ambient server-side republish drift on this endpoint first — otherwise the object
    // can keep drifting between our move() and our poll-read, making an exact-position assertion
    // flaky for reasons unrelated to the preview-sync feature under test.
    await m.liveAdapter.demoSetRepublishRate("b", 0);
    const attach = await m.liveAdapter.demoReadAttachPoint("b");
    const objects = attach.value?.objects || [];
    if (!objects.length) return { hadObjects: false };
    const target = objects[0];
    const newPosition = [target.position[0] + 0.77, target.position[1], target.position[2]];
    await m.liveAdapter.demoMoveSceneObject("b", target.object_id, newPosition);
    // Give this glue's own HOSTED_POINT_POLL_MS timer (750ms) a couple of cycles to pick it up.
    await new Promise((r) => setTimeout(r, 2000));
    const hostedGroup = m.portalGlue.debugHostedGroup(bIdx);
    const mesh = hostedGroup ? Array.from(hostedGroup.children).find((c) => c.name === `demo-scene-object-${target.object_id}`) : null;
    const meshPos = mesh ? (mesh.getAttribute('translation') || '').trim().split(/\s+/).map(Number) : null;
    return {
      hadObjects: true,
      objectId: target.object_id,
      newPosition,
      meshFound: !!mesh,
      meshPos,
      positionMatches: !!meshPos && Math.hypot(...meshPos.map((v, i) => v - newPosition[i])) < 0.01,
    };
  });
  await pageA.close();

  // --- Scenario B: location-lobby, airport-bound portal (authored_wow_graph) ---
  const pageB = await browser.newPage();
  pageB.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`B pageerror: ${t}`); });
  pageB.on("console", (m) => { if (m.type() === "error" && !isBenign(m.text())) errors.push(`B console: ${m.text()}`); });
  await pageB.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=lobby&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pageB.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await pageB.evaluate(() => window.__x3domLiveMode.avatarReady);
  await pageB.waitForFunction(() => {
    const m = window.__x3domLiveMode;
    const portals = m.liveAdapter.world?.portals || [];
    const airportPortal = portals.find((p) => p.target_location_id === "location-airport");
    if (!airportPortal) return false;
    const idx = portals.indexOf(airportPortal);
    const state = m.portalGlue.previewDebugState();
    return state[idx]?.contentKind != null;
  }, { timeout: 25000 }).catch(() => { });

  const airportResult = await pageB.evaluate(() => {
    const m = window.__x3domLiveMode;
    const portals = m.liveAdapter.world?.portals || [];
    const airportPortal = portals.find((p) => p.target_location_id === "location-airport");
    if (!airportPortal) return { found: false };
    const idx = portals.indexOf(airportPortal);
    const state = m.portalGlue.previewDebugState();
    const record = state[idx];
    const root = m.portalGlue.debugDestSceneRoot(idx);
    // setName() sets a plain JS `.name` property on the element, NOT a DOM attribute (confirmed:
    // runtime/scene-core/public/render-adapter/x3dom-render-adapter.mjs's setName()) — a `[name]`
    // CSS attribute selector matches nothing. Walk every element and read `.name` directly instead.
    const allNamed = root ? Array.from(root.querySelectorAll('*')).filter((el) => el.name) : [];
    const nodeCount = allNamed.length;
    // mountAirportTerminalContent's own, specific naming convention (web/airport-terminal-scene.mjs):
    // its root group is literally named "airport-terminal-content", and set-dressing nodes are
    // prefixed "airport-sign:"/"airport-store:"/"airport-gate:". NOT a generic "airport"-topic
    // check — the real authored graph legitimately contains airport-related node labels/ids of its
    // own (this IS the airport world), so a broad topical regex would false-positive on real
    // content that has nothing to do with mountAirportTerminalContent ever running.
    const airportTerminalNodeFound = allNamed.some((el) =>
      el.name === 'airport-terminal-content' ||
      /^airport-(sign|store|gate):/.test(el.name || ''));
    return {
      found: true,
      contentKind: record?.contentKind || null,
      nodeCount,
      airportTerminalNodeFound,
    };
  });
  await pageB.close();

  const scenarioAOk = colorResult.lobbyContentKind === "legacy_world" && colorResult.bContentKind === "legacy_world" &&
    colorResult.realColorFromApi !== "#3aa0ff" && colorResult.hasHostedGroup && colorResult.wallDiffuseColor != null;
  const hostedObjectOk = hostedObjectResult.hadObjects ? hostedObjectResult.positionMatches : true;
  const scenarioBOk = airportResult.found && airportResult.contentKind === "authored_wow_graph" &&
    airportResult.nodeCount > 5 && !airportResult.airportTerminalNodeFound;
  const noErrors = errors.length === 0;
  const ok = scenarioAOk && hostedObjectOk && scenarioBOk && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, scenarioAOk, hostedObjectOk, scenarioBOk, noErrors,
    colorResult, hostedObjectResult, airportResult, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
