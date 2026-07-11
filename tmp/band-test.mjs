// Decisive: walk into the 6-door band at (2728-2808,608). Where does the player land?
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
await page.evaluate(() => globalThis.__warpTo?.(2768, 560));
await page.waitForTimeout(1500);
console.log("start:", JSON.stringify(await pos()));
for (let i = 0; i < 14; i++) {
  await hold("ArrowDown", 240);
  const p = await pos();
  if (!p) { await page.waitForTimeout(500); continue; }
  if (p.y > 700 || p.x > 3200 || p.x < 2300 || Math.abs(p.y - 560) > 300) { console.log("MOVED FAR:", JSON.stringify(p)); break; }
}
await page.waitForTimeout(1200);
console.log("end:", JSON.stringify(await pos()));
await page.screenshot({ path: "tmp/route-ledger/19-band-landing.png" });
await browser.close();
