// P0 test: raise FLG_YAZIUMA_DISAPPEAR (469) and walk the hill road for real.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(80); };
const pos = () => page.evaluate(() => { const p = globalThis.__firstSceneDebug?.player; return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  // The real path: the story flag raises 469 + 340 through the flag-map bridge.
  scene["gameFlags"].set("intro:bedroom-opening-done");
  console.log("nums:", scene["gameFlags"].listNums());
});
await page.evaluate(() => globalThis.__warpTo?.(2648, 420));
await page.waitForTimeout(1600);
await page.screenshot({ path: "tmp/verify/p0-yaziuma-cleared.png" });
// walk the road: east to the road, then follow it south, steering toward town
const stages = [
  { tx: 2800, ty: 556 },  // yard southeast corner
  { tx: 2818, ty: 600 },  // the seam beside the porch
  { tx: 2822, ty: 660 },  // through, onto the town-side slope
  { tx: 2760, ty: 900 },
  { tx: 2450, ty: 1400 },
  { tx: 2150, ty: 1750 }
];
let reached = null;
for (const st of stages) {
  let prev = null, stall = 0;
  for (let i = 0; i < 60; i++) {
    const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
    if (d) { await page.keyboard.press("KeyZ"); await page.waitForTimeout(320); continue; }
    const p = await pos();
    if (!p) { await page.waitForTimeout(300); continue; }
    if (Math.hypot(st.tx - p.x, st.ty - p.y) < 40) break;
    if (p.y > 1600) { reached = p; break; }
    stall = prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 3 ? stall + 1 : 0;
    prev = p;
    if (stall >= 3) { await hold(["ArrowLeft", "ArrowRight", "ArrowDown"][stall % 3], 240); continue; }
    const dx = st.tx - p.x, dy = st.ty - p.y;
    await hold(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 220);
  }
  const p = await pos();
  console.log(`stage (${st.tx},${st.ty}) -> at (${p.x},${p.y})`);
  if (reached) break;
}
const fin = await pos();
console.log("FINAL:", JSON.stringify(fin), fin.y > 1500 ? ">>> TOWN REACHED <<<" : "still on the hill");
await page.screenshot({ path: "tmp/verify/p0-walk-final.png" });
await browser.close();
