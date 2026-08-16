// Phase 3.5b of the X3DOM render-parity plan: verifies peer/multiplayer avatar rendering end to
// end — two tabs of the same headless browser (BroadcastChannel is same-origin only, confirmed
// elsewhere in this codebase; it does not cross separate browser processes) detect each other as
// co-present peers, spawn an avatar for each other with mirrored equipment, and stay in sync.
//
// Uses page.bringToFront() to alternate which page is actively rendering: confirmed empirically
// (see the comment in x3dom-peer-avatars-glue.mjs) that only the front-most page in a headless
// browser instance gets real requestAnimationFrame ticks — a background page's onEnterFrame-driven
// sync() genuinely never runs, independent of Chrome's background-throttling override flags. This
// is a test-harness characteristic (real separate browser windows wouldn't have it), not something
// the app can or should work around, so the spike accounts for it rather than fighting it.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  protocolTimeout: 180000,
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
// Known-benign, already-investigated noise (see spike-run-x3dom-equipment-anchors.mjs for the
// addNameSpace finding, and spike-run-x3dom-live-mode.mjs for the headless-Chrome unload notice)
// — filtered consistently on BOTH pageerror and console listeners below (an earlier version of
// this spike only filtered console, letting the same pattern leak through via pageerror events).
const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Permissions policy violation: unload is not allowed/i,
  /Cannot read properties of null \(reading 'doc'\)/,
  // Same category as the 'doc' pattern above (X3DOM's own internal Inline-node/namespace null-deref
  // noise, see spike-run-x3dom-equipment-anchors.mjs), just hit on the DISPOSAL path (a peer
  // leaving/despawning) instead of the load path — first observed during the portal-preview
  // real-content follow-on work's final regression pass, unrelated to that work (it touches no
  // avatar/Inline disposal code), functional correctness (bidirectional/equipmentMirrored) was
  // unaffected when it fired. Revisit if this pattern ever correlates with an actual functional
  // failure rather than just uncaught vendor-internal console noise.
  /Cannot read properties of null \(reading 'removeSpace'\)/,
  // The WoW-negotiated-asset feature deliberately triggers real 403/404s for the demo's own
  // restricted/hidden hosted objects (see wow-asset.js) — expected on every boot now.
  /Failed to load resource: the server responded with a status of (403|404)/i,
];
function isBenign(text) {
  return KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

// Coordinates BOTH sides of a peer-detection check every poll tick, not just the receiving side:
// live-adapter-peer-presence-reducer.mjs prunes a peer's pose as stale after PEER_PLAYER_POSE_
// STALE_MS (4000ms) with no fresh broadcast — a single upfront nudge to the sender is only "seen"
// for a 4s window, and if the receiver's own sync() doesn't happen to observe it inside that
// window (dependent on real BroadcastChannel message delivery + rAF timing under whatever
// resource contention this run happens to be under), the peer goes stale again and the check has
// to wait for a broadcast that never comes again. Re-nudging the sender every tick keeps it
// perpetually fresh for as long as this loop runs, removing that race entirely.
async function waitForPeerDetection(senderPage, receiverPage, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    await senderPage.evaluate(() => window.__x3domLiveMode.liveAdapter.stepAvatar({ forward: false, camera_yaw: 0 }, 0.05));
    count = await receiverPage.evaluate(() => {
      window.__x3domLiveMode.adapter.requestRender();
      return window.__x3domLiveMode.peerAvatarsGlue.peerCount();
    });
    if (count === 1)
      return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
try {
  const errors1 = [];
  const errors2 = [];
  // page2 is deliberately NOT created until after page1 has fully settled (confirmed empirically:
  // pre-creating both pages via newPage() before either navigates made the second page's own
  // navigation unreliable — window.__x3domLiveMode never appeared within 45s, reproducibly, two
  // runs in a row — whereas creating page2 fresh right before its own goto(), after page1 is
  // already idle, works cleanly every time).
  const page1 = await browser.newPage();
  page1.on("pageerror", (e) => { if (!isBenign(String(e))) errors1.push(String(e)); });
  page1.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text()))
      errors1.push(`console[error]: ${m.text()}`);
  });

  await page1.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page1.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });
  await page1.evaluate(() => window.__x3domLiveMode.avatarReady);
  // Let page1 fully settle before opening page2 — avoids overlapping heavy WebGL-context-creation
  // traffic on the same CDP pipe, which was found to make waitForFunction unreliable otherwise.
  await new Promise((r) => setTimeout(r, 2000));

  const page2 = await browser.newPage();
  page2.on("pageerror", (e) => { if (!isBenign(String(e))) errors2.push(String(e)); });
  page2.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text()))
      errors2.push(`console[error]: ${m.text()}`);
  });
  await page2.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page2.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 45000 });
  await page2.evaluate(() => window.__x3domLiveMode.avatarReady);

  // page2 is front-most now (created last) — give it real frame time to detect page1.
  //
  // Was a fixed 3000ms sleep + single read. sync() (which processes the BroadcastChannel message
  // into peerCount()) only runs from onEnterFrame(), which only fires while X3DOM's own render
  // loop actually ticks (see x3dom-peer-avatars-glue.mjs's own header comment) — a fixed sleep
  // assumes real rAF delivery resumes promptly and at a normal rate, which isn't reliable under
  // the resource contention of a full ~30-spike sequential suite run. waitForPeerDetection() polls
  // instead, re-nudging BOTH sides every tick (see its own comment for why the sender side needs
  // continuous re-nudging too, not just the receiver).
  await waitForPeerDetection(page1, page2);
  const p2SeesP1 = await page2.evaluate(() => {
    const glue = window.__x3domLiveMode.peerAvatarsGlue;
    return { count: glue.peerCount(), clientIds: glue.peerClientIds() };
  });

  // Bring page1 to front so ITS onEnterFrame loop (and therefore its own sync()) actually runs,
  // then give it real frame time to detect page2 — same coordinated-poll approach as above.
  await page1.bringToFront();
  await waitForPeerDetection(page2, page1);
  const p1SeesP2 = await page1.evaluate(() => {
    const glue = window.__x3domLiveMode.peerAvatarsGlue;
    return { count: glue.peerCount(), clientIds: glue.peerClientIds() };
  });

  // Confirm equipment mirrored onto the peer avatar page1 now renders for page2's player (the
  // three default items every player equips on load).
  const p1PeerEquipment = await page1.evaluate(() => {
    const dbg = window.__x3domLiveMode.liveAdapter.debugState();
    const peer = (dbg.peer_players || []).find((p) => p.co_present);
    return peer ? (peer.equippedItems || []).map((i) => i.itemId).sort() : null;
  });

  const bidirectional = p2SeesP1.count === 1 && p1SeesP2.count === 1;
  const equipmentMirrored = Array.isArray(p1PeerEquipment) &&
    JSON.stringify(p1PeerEquipment) === JSON.stringify(["equip-hammer", "equip-hat", "equip-torch"]);
  const noPageErrors = errors1.length === 0 && errors2.length === 0;
  const ok = bidirectional && equipmentMirrored && noPageErrors;

  console.log("RESULT:", JSON.stringify({
    ok, bidirectional, equipmentMirrored, noPageErrors,
    p2SeesP1, p1SeesP2, p1PeerEquipment, errors1, errors2,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
