// Golden-snapshot regression gate for hero visual states. Forces each rendering-visible state via the
// debug hook at a fixed idle pose/spawn and captures the player region at native scale, then compares
// to committed goldens (ImageMagick AE pixel-diff, small tolerance for AA/timing). Color states
// (invert/diamondized) are NOT snapshotted -- the headless renderer can't composite WebGL color ops;
// they're covered by the readout checks in sprite-state-probe.mjs.
//   node scripts/sprite-state-goldens.mjs --update   # capture/refresh goldens
//   node scripts/sprite-state-goldens.mjs            # compare against goldens (exit 1 on regression)
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";

const BASE = "http://127.0.0.1:5173/";
const GOLDEN_DIR = new URL("./sprite-state-goldens/", import.meta.url).pathname;
const TMP = "/private/tmp/livewalk/goldens-tmp/";
const TOLERANCE = 60; // max differing pixels (AA / sub-frame timing)
const UPDATE = process.argv.includes("--update");
const BOX = { x: 220, y: 150, width: 72, height: 104 }; // player + head at native, camera-centered at spawn

// Rendering-visible states only (sheet-swap / geometry / overlay). Forced inputs per state.
const STATES = {
  default: {},
  tiny: { status: { tiny: true } },
  dead: { event: "dead" },
  bike: { riding: "bike" },
  ladder: { onLadder: true },
  rope: { onRope: true },
  water: { deepWater: true },
  mushroom: { status: { mushroomized: true } }
};

mkdirSync(TMP, { recursive: true });
if (UPDATE) mkdirSync(GOLDEN_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}?nointro=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__setPlayerVisualState === "function", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
// drain the opening cutscene so the per-frame loop runs + no dialogue box overlays the player
for (let i = 0; i < 30; i++) {
  const busy = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen || globalThis.__firstSceneDebug?.inputLocked);
  if (!busy) break;
  await page.keyboard.press("z"); await page.waitForTimeout(150);
}
await page.waitForTimeout(300);

const ae = (a, b) => {
  try {
    execFileSync("magick", ["compare", "-metric", "AE", a, b, "null:"], { stdio: ["ignore", "ignore", "pipe"] });
    return 0;
  } catch (e) {
    const out = String(e.stderr ?? e.stdout ?? "").trim();
    const n = parseInt(out.split(/\s+/)[0], 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }
};

let pass = 0, fail = 0;
for (const [name, forced] of Object.entries(STATES)) {
  await page.evaluate((f) => globalThis.__setPlayerVisualState(f), forced);
  await page.waitForTimeout(180);
  const golden = `${GOLDEN_DIR}${name}.png`;
  if (UPDATE) {
    await page.screenshot({ path: golden, clip: BOX });
    console.log(`updated golden: ${name}`);
    pass++;
  } else if (!existsSync(golden)) {
    console.log(`MISSING golden: ${name} (run --update)`); fail++;
  } else {
    const fresh = `${TMP}${name}.png`;
    await page.screenshot({ path: fresh, clip: BOX });
    const diff = ae(golden, fresh);
    const ok = diff <= TOLERANCE;
    ok ? pass++ : fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (AE diff ${diff}${ok ? "" : ` > ${TOLERANCE}`})`);
  }
}
await browser.close();
console.log(`\n=== goldens ${UPDATE ? "updated" : "compared"}: ${pass} ok, ${fail} fail ===`);
process.exit(fail > 0 ? 1 : 0);
