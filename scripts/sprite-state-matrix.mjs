// One slice of the hero-visual-state test matrix: verify every state at a GIVEN facing.
// For each state: force it, read the resolver readout (baseState + sheetSwapped), and pixel-diff the
// rendered player region against the default-at-this-facing (confirms the state actually renders for
// this facing's row). Emits a JSON result line so a fleet/Workflow can fan facings and synthesize.
//   node scripts/sprite-state-matrix.mjs --facing down|up|left|right
import { chromium } from "@playwright/test";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const facing = arg("--facing", "down");
const BASE = "http://127.0.0.1:5173/";
const KEY = { down: "ArrowDown", up: "ArrowUp", left: "ArrowLeft", right: "ArrowRight" }[facing] ?? "ArrowDown";
const BOX = { x: 210, y: 140, width: 92, height: 120 };
// state -> {forced, expectBase, swap?} (sheet-swap states must report sheetSwapped)
const STATES = [
  ["tiny", { status: { tiny: true } }, "tiny", false],
  ["dead", { event: "dead" }, "dead", true],
  ["bike", { riding: "bike" }, "bike", true],
  ["ladder", { onLadder: true }, "ladder", true],
  ["rope", { onRope: true }, "rope", true],
  ["water", { deepWater: true }, "default", false],
  ["mushroom", { status: { mushroomized: true } }, "default", false]
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}?nointro=1`, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__setPlayerVisualState === "function", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
for (let i = 0; i < 30; i++) {
  const busy = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen || globalThis.__firstSceneDebug?.inputLocked);
  if (!busy) break;
  await page.keyboard.press("z"); await page.waitForTimeout(150);
}
await page.waitForTimeout(300);
// turn to face the requested direction
await page.keyboard.down(KEY); await page.waitForTimeout(160); await page.keyboard.up(KEY); await page.waitForTimeout(200);

const force = (f) => page.evaluate((x) => globalThis.__setPlayerVisualState(x), f);
const shot = () => page.screenshot({ clip: BOX });
await force({}); await page.waitForTimeout(160);
const baseBuf = await shot();

const results = [];
for (const [name, forced, expectBase, swap] of STATES) {
  await force(forced); await page.waitForTimeout(180);
  const v = await page.evaluate(() => globalThis.__firstSceneDebug?.visualState);
  const buf = await shot();
  const baseOk = v?.baseState === expectBase;
  const swapOk = swap ? v?.sheetSwapped === true : true;
  const rendered = !baseBuf.equals(buf); // changed vs default-at-this-facing
  const ok = baseOk && swapOk && rendered;
  results.push({ state: name, ok, baseState: v?.baseState, sheetSwapped: v?.sheetSwapped, rendered });
  await force({}); await page.waitForTimeout(80);
}
await browser.close();
const pass = results.filter((r) => r.ok).length;
console.log(JSON.stringify({ facing, pass, total: results.length, results }));
process.exit(pass === results.length ? 0 : 1);
