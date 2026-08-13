import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "_scratch-compare-out");

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 1024, height: 768 },
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=0", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => window.__x3domLiveMode?.avatarReady != null, { timeout: 30000 });
  await page.evaluate(() => window.__x3domLiveMode.avatarReady);
  // Wait for the avatar's real DOM handle to actually have children (the glTF content swapped in,
  // not just the Inline pool's placeholder) — a fixed delay alone was unreliable (produced a
  // false-positive "avatar missing" screenshot even against an unmodified baseline).
  await page.waitForFunction(() => (window.__x3domLiveMode?.avatarHandle?.children?.length || 0) > 0, { timeout: 20000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: join(OUT_DIR, "rt-rewrite-default-pose.png") });
  console.log("done");
} finally {
  await browser.close();
}
