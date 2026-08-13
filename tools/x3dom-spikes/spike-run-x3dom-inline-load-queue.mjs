// Phase 3.5a of the X3DOM render-parity plan: stress-tests X3DOMRenderAdapter.createInlineAsset()'s
// shared load queue by deliberately firing several calls CONCURRENTLY (Promise.all-style, the
// opposite of Phase 3's careful call-site serialization) and confirming zero addNameSpace-pattern
// errors — repeated several times in a row, since the bug this hardens against was intermittent,
// not deterministic (a single clean run doesn't prove it's fixed).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

// The queue makes every one of these loads strictly sequential (that's the fix being tested) —
// total wall-clock time scales with ROUNDS * URLS regardless of how "concurrently" they're fired,
// so this stays deliberately small: enough to prove repeated concurrent-fire bursts stay clean,
// not so much that a real (if slow, under headless/software rendering) sequential load chain
// trips Puppeteer's own protocol timeout.
// Deliberately excludes equip-crown.glb: it's also x3dom-inline-pool.js's placeholder URL, so a
// freshly-released slot (disposeNode() resets it back to exactly that URL) receiving a request
// for the bare same URL again is a no-op attribute set — X3DOM never fires a reload for an
// unchanged value — which would hang the poll for reasons unrelated to the load queue this spike
// is actually testing.
const BURST_ASSET_URLS = [
  "/assets/equip-hat.glb", "/assets/equip-helmet.glb", "/assets/equip-torch.glb", "/assets/equip-hammer.glb",
];
const BURST_ROUNDS = 3;

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  protocolTimeout: 180000,
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
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  // Let equipDefaults() (also going through the same queue now) finish first, so this stress
  // test's own bursts aren't sharing queue time with unrelated boot-time loads.
  await page.waitForFunction(() => {
    const equipped = window.__x3domLiveMode.equipmentGlue.equipped();
    return equipped.head && equipped.leftHand && equipped.rightHand;
  }, { timeout: 20000 });

  const rounds = await page.evaluate(async (urls, roundCount) => {
    const adapter = window.__x3domLiveMode.adapter;
    const results = [];
    for (let round = 0; round < roundCount; round++) {
      const handles = urls.map((url) => adapter.createInlineAsset(url));
      let ok = true;
      let error = null;
      try {
        await Promise.all(handles.map((h) => h.ready));
      }
      catch (err) {
        ok = false;
        error = String(err && err.message || err);
      }
      // Free every slot this round claimed before starting the next round, so BURST_ROUNDS
      // rounds don't need BURST_ROUNDS * urls.length pool slots simultaneously.
      for (const h of handles)
        adapter.disposeNode(h.node);
      results.push({ round, ok, error });
    }
    return results;
  }, BURST_ASSET_URLS, BURST_ROUNDS);

  const allRoundsOk = rounds.every((r) => r.ok);
  const noPageErrors = errors.length === 0;
  const ok = allRoundsOk && noPageErrors;

  console.log("RESULT:", JSON.stringify({ ok, allRoundsOk, noPageErrors, rounds, errors }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
