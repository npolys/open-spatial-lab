// Settles X3D Torus's actual default axis convention in THIS vendored build empirically, rather
// than trusting an assumption from the spec/tutorials. Places a bare torus at a known position
// directly in front of the DEFAULT main camera (no custom seeding needed — avoids the camera-
// controller pitfalls hit in the last diagnostic attempt), with IDENTITY rotation. If it reads as
// a face-on ring (circle/oval, hole toward camera), the default hole-axis is Z (view direction).
// If it reads as a flat ellipse/line (hole pointing up), the default hole-axis is Y, matching the
// original assumption — meaning the bug is elsewhere, not the axis convention itself.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 640, height: 480 },
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    const adapter = window.__x3domLiveMode.adapter;
    const geometry = adapter.createGeometry({ type: "torus", innerRadius: 0.15, outerRadius: 1 });
    const material = adapter.createMaterial({ type: "standard", color: 0xff2266, emissive: 0xff2266, emissiveIntensity: 0.9, side: "double" });
    const mesh = adapter.createMesh(geometry, material);
    // Identity rotation, positioned 3m in front of the avatar's spawn point, roughly at head
    // height — squarely in the default third-person camera's view, no camera seeding needed.
    mesh.setAttribute("translation", "0 1.5 -3");
    adapter.add(adapter.sceneRoot, mesh);
  });

  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(OUT_DIR, "torus-axis-check.png") });
  console.log("RESULT: screenshot written");
} catch (err) {
  console.log("RESULT:", JSON.stringify({ ok: false, error: (err && err.stack) || String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
