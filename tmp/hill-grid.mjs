// ASCII map of the hilltop with flag 469 raised: static collision + NPC bodies + door band.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene["gameFlags"].setNum(469);
});
// visit a few points so chunks stream in
for (const [x, y] of [[2648, 420], [2648, 900], [2500, 1300], [2300, 1700]]) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x, y });
  await page.waitForTimeout(1100);
}
await page.evaluate(() => globalThis.__warpTo?.(2648, 420));
await page.waitForTimeout(1100);
const grid = await page.evaluate(() => {
  const fn = globalThis.__solidAt;
  const x0 = 2200, x1 = 3000, y0 = 300, y1 = 1900, step = 16;
  const rows = [];
  for (let y = y0; y <= y1; y += step) {
    let row = "";
    for (let x = x0; x <= x1; x += step) row += fn(x, y) ? "#" : ".";
    rows.push(String(y).padStart(4) + " " + row);
  }
  return rows.join("\n");
});
console.log("     x2200 -> x3000 (16px cells), flag 469 raised");
console.log(grid);
console.log("door band cols (2728-2808):", Math.round((2728-2200)/16), "-", Math.round((2808-2200)/16));
await browser.close();
