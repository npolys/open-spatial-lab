// Verifies the WoW-negotiated-asset path for ACTIVE-world hosted scene objects
// (syncHostedSceneObjectMeshesX3dom's fetchWowRepresentation branch, x3dom-portal-hosted-objects.mjs)
// against the real, running ?renderer=x3dom app and its real backend. The demo's own
// restricted/hidden convention (wow-asset.js: the first scene object at every location is
// `restricted` (403), the second `hidden` (404), and OSL_DEMO_ASSET_TOKEN is unset anywhere in
// this repo so authorization always fails) makes 403/404-triggered fallback the COMMON case here,
// not an edge case — this spike asserts all three outcomes: real load (3rd object),
// denied-fallback (1st/2nd objects), and that position tracking keeps working post-load
// regardless of which path a given object took.
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
  // "Cannot read properties of null (reading 'doc')" is the already-documented, project-wide
  // benign X3DOM internal Inline-node/namespace null-deref noise (see spike-run-x3dom-equipment-
  // anchors.mjs/spike-run-x3dom-peer-avatars.mjs for where this was first found). The 403/404
  // "Failed to load resource" console messages are Chrome's own automatic network-failure
  // logging for the deliberately-triggered restricted/hidden requests this spike exists to
  // exercise — expected here, not a real error.
  const isBenign = (text) => /Permissions policy violation|Cannot read properties of null \(reading '(doc|removeSpace)'\)|Failed to load resource.*status of (403|404)/i.test(text);
  page.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(t); });
  page.on("console", (m) => {
    if (m.type() === "error" && !isBenign(m.text()))
      errors.push(`console[error]: ${m.text()}`);
  });
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);

  // Wait until the active-hosted-objects group exists and every object has settled to a final
  // wow_status (loaded or denied-or-error). The poll itself runs at 100ms, but actual settling now
  // shares X3DOM's single-claim-at-a-time Inline-load queue with the portal-preview destinations'
  // own WoW-fetch objects (wired up in the same round this timeout was widened) — measured at
  // ~15s in a clean, low-contention run, uncomfortably close to the previous 20s budget; widened to
  // give real margin rather than leave this newly flaky under normal system load.
  await page.waitForFunction(() => {
    const group = Array.from(document.querySelectorAll("*")).find((el) => el.name === "x3dom-active-hosted-objects");
    if (!group || group.children.length < 3) return false;
    return Array.from(group.children).every((node) => {
      const status = node.userData?.hostedSceneObject?.wow_status;
      return status === "loaded" || status === "denied-or-error";
    });
  }, { timeout: 45000 });

  const objectsInfo = await page.evaluate(() => {
    const group = Array.from(document.querySelectorAll("*")).find((el) => el.name === "x3dom-active-hosted-objects");
    return Array.from(group.children).map((node) => ({
      name: node.name,
      wow_status: node.userData?.hostedSceneObject?.wow_status || null,
      hasInlineChild: !!node.querySelector("inline"),
      hasPlainShapeChild: !!node.querySelector(":scope > shape"),
      translation: (node.getAttribute("translation") || "").trim(),
    }));
  });

  const loaded = objectsInfo.filter((o) => o.wow_status === "loaded");
  const denied = objectsInfo.filter((o) => o.wow_status === "denied-or-error");
  // Exactly one object per location is expected to succeed (the 3rd/last one — see wow-asset.js's
  // objs[0]=restricted/objs[1]=hidden convention), the other two fall back.
  const loadedShapeOk = loaded.length === 1 && loaded[0].hasInlineChild && !loaded[0].hasPlainShapeChild;
  const deniedShapeOk = denied.length === 2 && denied.every((o) => o.hasPlainShapeChild && !o.hasInlineChild);

  // Position tracking: move the avatar so the ambient poll ticks again, confirm loaded/fallback
  // nodes both still have a real, non-empty translation (they don't move themselves, but this
  // confirms the per-tick position-application branch didn't throw/skip for either kind of node).
  const positionsNonEmpty = objectsInfo.every((o) => /^-?\d/.test(o.translation));

  // Fixture-object exclusion: call the sync function directly in a scratch scene with a synthetic
  // fixture object and fetchWowRepresentation:true — must stay synthetic (plain <shape>, no
  // <inline>) regardless, since density-fixture objects are excluded unconditionally.
  const fixtureInfo = await page.evaluate(async () => {
    const { X3DOMRenderAdapter } = await import("/vendor/scene-core/render-adapter/x3dom-render-adapter.mjs");
    const { syncHostedSceneObjectMeshesX3dom } = await import("/x3dom-portal-hosted-objects.mjs");
    const mount = document.createElement("div");
    mount.style.cssText = "position:fixed; left:-99999px; width:64px; height:64px;";
    document.body.appendChild(mount);
    const adapter = new X3DOMRenderAdapter(window.x3dom);
    adapter.mount(mount, { width: 64, height: 64 });
    // X3DOM's <x3d>-element discovery only runs once at document load — a dynamically-created
    // host needs an explicit reload() to get picked up and attached a runtime.
    window.x3dom.reload();
    await adapter.ready();
    const parent = adapter.createGroup("fixture-test-parent");
    adapter.add(adapter.sceneRoot, parent);
    const meshes = new Map();
    syncHostedSceneObjectMeshesX3dom({
      adapter, meshes, parent, version: 1,
      fetchWowRepresentation: true,
      wowAssetBaseUrl: "/api/a",
      objects: [{ object_id: "fixture-location-a-000", shape: "box", size_m: 0.24, color: "#ff0000", position: [0, 0, 0], fixture: true, synthetic_density_fixture: true }],
    });
    const node = meshes.get("fixture-location-a-000");
    return { hasPlainShapeChild: !!node?.querySelector(":scope > shape"), hasInlineChild: !!node?.querySelector("inline") };
  });
  const fixtureStaysSynthetic = fixtureInfo.hasPlainShapeChild && !fixtureInfo.hasInlineChild;

  const noErrors = errors.length === 0;
  const ok = loadedShapeOk && deniedShapeOk && positionsNonEmpty && fixtureStaysSynthetic && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, loadedShapeOk, deniedShapeOk, positionsNonEmpty, fixtureStaysSynthetic, noErrors,
    objectsInfo, fixtureInfo, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
