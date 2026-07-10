// Manual seam threading: precise key sequence through (2800,604)->(2830,610), then stages to town.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(70); };
const pos = () => page.evaluate(() => { const p = globalThis.__firstSceneDebug?.player; return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
await page.evaluate(() => { globalThis.__game?.scene?.getScene("chunked-world")?.["gameFlags"].set("intro:bedroom-opening-done"); });
await page.evaluate(() => globalThis.__warpTo?.(2800, 600));
await page.waitForTimeout(1500);
console.log("start:", JSON.stringify(await pos()));
// thread east through the seam (clear any cutscene/dialogue as it comes)
const clearDlg = async () => {
  for (let k = 0; k < 12; k++) {
    const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
    const locked = await page.evaluate(() => (globalThis.__inputOwners ? globalThis.__inputOwners() : null));
    if (!d && locked && !locked.cutscene && !locked.inputLocked && !locked.eventSeq) break;
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(380);
  }
};
for (let i = 0; i < 14; i++) { await clearDlg(); await hold("ArrowRight", 160); const p = await pos(); if (p.x > 2812) break; }
console.log("after east:", JSON.stringify(await pos()));
// now south down the slope
const WAYPOINTS = [
  { x: 2560, y: 900 }, { x: 2360, y: 950 }, { x: 2330, y: 1040 },
  { x: 2420, y: 1250 }, { x: 2350, y: 1450 }, { x: 2200, y: 1650 }, { x: 2130, y: 1760 }
];
for (const wp of WAYPOINTS) {
  let prev = null, stall = 0;
  for (let i = 0; i < 50; i++) {
    await clearDlg();
    const p = await pos();
    if (!p) { await page.waitForTimeout(250); continue; }
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 30) break;
    stall = prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 3 ? stall + 1 : 0;
    prev = p;
    if (stall >= 3) { await hold(["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"][stall % 4], 200); continue; }
    const dx = wp.x - p.x, dy = wp.y - p.y;
    await hold(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 210);
  }
  const p = await pos();
  console.log(`  wp(${wp.x},${wp.y}) -> (${p.x},${p.y})`);
  if (p.y > 1600) break;
}
console.log("after south:", JSON.stringify(await pos()));
await page.screenshot({ path: "tmp/verify/seam-thread.png" });
await browser.close();
