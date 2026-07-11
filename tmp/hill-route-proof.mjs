// P0 proof: with FLG_YAZIUMA_DISAPPEAR raised, does a walkable path exist from the
// front yard to town? Streams chunks along the corridor, then A*s the whole descent.
import { chromium } from "@playwright/test";
import { findPath, nearestOpen } from "../scripts/route.mjs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const scene = globalThis.__game?.scene?.getScene("chunked-world");
  scene["gameFlags"].setNum(469);
});
for (const [x, y] of [[2648, 420], [2670, 700], [2650, 950], [2500, 1250], [2350, 1550], [2200, 1750]]) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x, y });
  await page.waitForTimeout(1000);
}
const solid = await page.evaluate(() => {
  const fn = globalThis.__solidAt;
  const x0 = 2150, y0 = 300, x1 = 3000, y1 = 1900, step = 8;
  const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
  const g = [];
  for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); }
  return { x0, y0, step, cols, rows, g };
});
await browser.close();
const { x0, y0, step, cols, rows, g } = solid;
const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c]) {
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true;
  }
}
// door band = hazard: mark the porch strip (2712-2824, 592-624) blocked so the route avoids it
for (let y = 592; y <= 624; y += step) for (let x = 2712; x <= 2824; x += step) {
  const c = Math.round((x - x0) / step), r = Math.round((y - y0) / step);
  if (r >= 0 && c >= 0 && r < rows && c < cols) blocked[r][c] = true;
}
const w2c = (x, y) => ({ c: Math.round((x - x0) / step), r: Math.round((y - y0) / step) });
const start = nearestOpen(blocked, cols, rows, ...Object.values(w2c(2648, 420)));
const goal = nearestOpen(blocked, cols, rows, ...Object.values(w2c(2200, 1780)));
const path = start && goal && findPath(blocked, cols, rows, start, goal);
if (!path) { console.log("NO ROUTE — flag 469 alone does not open the descent"); process.exit(0); }
const pts = path.map(({ c, r }) => ({ x: x0 + c * step, y: y0 + r * step }));
console.log(`ROUTE EXISTS: ${pts.length} waypoints`);
console.log("every 10th waypoint:", pts.filter((_, i) => i % 10 === 0 || i === pts.length - 1).map((p) => `(${p.x},${p.y})`).join(" "));
