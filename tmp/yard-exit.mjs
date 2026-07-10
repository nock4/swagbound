// Empirical: from the front step, walk down the yard; find where the player exits to the road.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(85); };
const pos = () => page.evaluate(() => { const p = globalThis.__firstSceneDebug?.player; return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
await page.evaluate(() => globalThis.__warpTo?.(2648, 420));
await page.waitForTimeout(1500);
// walk down the yard: S, then try SE/SW on stalls
let last = await pos();
const trail = [last];
// stage 1: east to the dirt road; stage 2: south along it (past the police car/barricade?)
const stages = [
  { tx: 2450, ty: 620, name: "west below the yard" },
  { tx: 2300, ty: 900, name: "southwest descent" },
  { tx: 2200, ty: 1300, name: "down the hill road" },
  { tx: 2112, ty: 1700, name: "to the premise road point" }
];
for (const st of stages) {
  let stall = 0, prev = null;
  for (let i = 0; i < 45; i++) {
    const p0 = await pos();
    if (!p0) { await page.waitForTimeout(400); continue; }
    if (Math.hypot(st.tx - p0.x, st.ty - p0.y) < 30) break;
    stall = prev && Math.hypot(p0.x - prev.x, p0.y - prev.y) < 3 ? stall + 1 : 0;
    prev = p0;
    if (stall >= 3) { await hold(["ArrowLeft", "ArrowRight"][stall % 2], 240); continue; }
    const dx = st.tx - p0.x, dy = st.ty - p0.y;
    await hold(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 240);
    const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
    if (d) { console.log("DIALOGUE during", st.name); await page.screenshot({ path: "tmp/route-ledger/17-road-dialogue.png" }); await page.keyboard.press("KeyZ"); await page.waitForTimeout(400); await page.keyboard.press("KeyZ"); await page.waitForTimeout(400); }
  }
  const p = await pos();
  console.log(`stage "${st.name}" ended at`, JSON.stringify(p));
  trail.push(p);
}
console.log("trail tail:", JSON.stringify(trail.slice(-6)));
await page.screenshot({ path: "tmp/route-ledger/18-descent-west.png" });
await browser.close();
