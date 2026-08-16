// Phase 5 of the X3DOM render-parity plan: verifies the renderer-selection UI and its
// localStorage persistence — default (three.js), toggle-click -> immediate x3dom navigation +
// stored preference, a later BARE navigation still honoring the stored preference, and an
// explicit ?renderer= query param overriding the stored preference either direction.
//
// Uses page.evaluateOnNewDocument() to pre-seed localStorage before navigation and a fresh page
// per independent scenario, rather than chaining several navigations on one page object —
// confirmed during this phase's own debugging that chaining many full X3DOM boots on one page in
// quick succession is unreliable in this environment (resource contention), independent of the
// actual feature under test.
//
// intro=0 (not the string "bypass") is this app's real bypass-the-launcher value
// (demo-launcher.mjs's parseIntroPreference: "1"->force, "0"->bypass, anything else->"auto") —
// confirmed the hard way while building this spike, after intro=bypass (used throughout earlier
// phases' spikes) silently fell through to "auto" and only ever worked there because those URLs
// also carried other params that independently made isBareEntry false. A BARE URL (this phase's
// whole point) has no such other params, so intro=0 is required here specifically.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const STORAGE_KEY = "osl-renderer-preference-v1";

// Same known-benign addNameSpace/Inline-node null-deref quirk documented throughout this project's
// history (Phase 3; also hit spike-run-x3dom-wall-solid.mjs once the ClipPlane work, and again once
// the portal-preview WoW-fetch work, added enough concurrent Inline-loading DOM churn to push it
// over the threshold). Scenario 2 here boots a full X3DOM session (via the renderer-toggle click),
// with the same real Inline-loading activity (avatar/equipment/now portal-preview hosted objects)
// as the live app — same trigger conditions, same fix.
const KNOWN_BENIGN_ERROR_PATTERNS = [
  /Cannot read properties of null \(reading 'doc'\)/,
  /Cannot read properties of null \(reading 'removeSpace'\)/,
];
function isBenign(text) {
  return KNOWN_BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1280, height: 800 },
});
try {
  const errors = [];

  // --- Scenario 1: bare entry, no stored preference, no explicit param -> three.js, default
  // button label. ---
  const page1 = await browser.newPage();
  page1.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`s1: ${t}`); });
  await page1.goto("http://127.0.0.1:8143/index.html?intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page1.waitForFunction(() => window.__assembly != null, { timeout: 30000 }).catch(() => { });
  const s1 = await page1.evaluate(() => ({
    threeBooted: !!window.__assembly,
    x3domHost: !!document.getElementById("x3dom-host"),
    buttonText: document.getElementById("btn-renderer-preference")?.textContent,
    stored: localStorage.getItem("osl-renderer-preference-v1"),
  }));

  // --- Scenario 2: click the toggle -> immediate navigation to ?renderer=x3dom, stored
  // preference set, X3DOM boots. ---
  page1.on("console", () => { });
  await Promise.all([
    page1.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
    page1.click("#btn-renderer-preference"),
  ]);
  await page1.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 30000 }).catch(() => { });
  const s2 = await page1.evaluate(() => ({
    url: location.href,
    x3domLiveModeReady: !!window.__x3domLiveMode,
    buttonText: document.getElementById("btn-renderer-preference")?.textContent,
    stored: localStorage.getItem("osl-renderer-preference-v1"),
  }));
  await page1.close();

  // --- Scenario 3: fresh page, stored preference = x3dom (pre-seeded), bare URL, no explicit
  // renderer param -> X3DOM still boots (persistence). ---
  const page3 = await browser.newPage();
  page3.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`s3: ${t}`); });
  await page3.evaluateOnNewDocument((key) => localStorage.setItem(key, "x3dom"), STORAGE_KEY);
  await page3.goto("http://127.0.0.1:8143/index.html?intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page3.waitForFunction(() => window.__x3domLiveMode != null, { timeout: 30000 }).catch(() => { });
  const s3 = await page3.evaluate(() => ({
    x3domHost: !!document.getElementById("x3dom-host"),
    x3domLiveModeReady: !!window.__x3domLiveMode,
    buttonText: document.getElementById("btn-renderer-preference")?.textContent,
  }));
  await page3.close();

  // --- Scenario 4: fresh page, stored preference = x3dom (pre-seeded), explicit
  // ?renderer=three -> three.js boots, overriding the stored preference; stored value itself is
  // left untouched. ---
  const page4 = await browser.newPage();
  page4.on("pageerror", (e) => { const t = String(e); if (!isBenign(t)) errors.push(`s4: ${t}`); });
  await page4.evaluateOnNewDocument((key) => localStorage.setItem(key, "x3dom"), STORAGE_KEY);
  await page4.goto("http://127.0.0.1:8143/index.html?intro=0&renderer=three", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page4.waitForFunction(() => window.__assembly != null, { timeout: 30000 }).catch(() => { });
  const s4 = await page4.evaluate(() => ({
    threeBooted: !!window.__assembly,
    x3domHost: !!document.getElementById("x3dom-host"),
    buttonText: document.getElementById("btn-renderer-preference")?.textContent,
    stored: localStorage.getItem("osl-renderer-preference-v1"),
  }));
  await page4.close();

  const scenario1Ok = s1.threeBooted && !s1.x3domHost && s1.buttonText === "Renderer: three.js" && s1.stored === null;
  const scenario2Ok = s2.url.includes("renderer=x3dom") && s2.x3domLiveModeReady && s2.buttonText === "Renderer: X3DOM (preview)" && s2.stored === "x3dom";
  const scenario3Ok = s3.x3domHost && s3.x3domLiveModeReady && s3.buttonText === "Renderer: X3DOM (preview)";
  const scenario4Ok = s4.threeBooted && !s4.x3domHost && s4.buttonText === "Renderer: three.js" && s4.stored === "x3dom";
  const noErrors = errors.length === 0;
  const ok = scenario1Ok && scenario2Ok && scenario3Ok && scenario4Ok && noErrors;

  console.log("RESULT:", JSON.stringify({
    ok, scenario1Ok, scenario2Ok, scenario3Ok, scenario4Ok, noErrors,
    s1, s2, s3, s4, errors,
  }, null, 2));
  if (!ok) process.exitCode = 1;
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
