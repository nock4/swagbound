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
for (const [wx, wy] of [[2830, 620], [2836, 648], [2824, 600]]) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x: wx, y: wy });
  await page.waitForTimeout(1200);
  const start = await pos();
  await hold("ArrowLeft", 300); await hold("ArrowLeft", 300);
  const afterW = await pos();
  await hold("ArrowDown", 300);
  const afterS = await pos();
  console.log(`warp(${wx},${wy}) landed ${JSON.stringify(start)} | after W: ${JSON.stringify(afterW)} | after S: ${JSON.stringify(afterS)}`);
}
await browser.close();
