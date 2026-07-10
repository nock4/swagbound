// Find the seam: flood-fill from the yard and from town; report the closest cell pairs.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => { globalThis.__game?.scene?.getScene("chunked-world")?.["gameFlags"].setNum(469); });
for (const [x, y] of [[2648, 420], [2670, 700], [2650, 950], [2500, 1250], [2350, 1550], [2200, 1750], [2900, 700], [2900, 1100]]) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x, y });
  await page.waitForTimeout(900);
}
const solid = await page.evaluate(() => {
  const fn = globalThis.__solidAt;
  const x0 = 2150, y0 = 300, x1 = 3020, y1 = 1900, step = 8;
  const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
  const g = [];
  for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); }
  return { x0, y0, step, cols, rows, g };
});
await browser.close();
const { x0, y0, step, cols, rows, g } = solid;
function fill(sc, sr) {
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const q = [[sc, sr]];
  seen[sr][sc] = true;
  while (q.length) {
    const [c, r] = q.pop();
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[nr][nc] && !g[nr][nc]) { seen[nr][nc] = true; q.push([nc, nr]); }
    }
  }
  return seen;
}
const w2c = (x, y) => [Math.round((x - x0) / step), Math.round((y - y0) / step)];
const [ac, ar] = w2c(2648, 420), [bc, br] = w2c(2200, 1780);
const A = fill(ac, ar), B = fill(bc, br);
console.log("MERGED:", A[br]?.[bc] === true ? "YES - yard flood reaches town" : "no");
// render components to PNG via a python helper
import { writeFileSync } from "node:fs";
const lines = [];
for (let r = 0; r < rows; r++) {
  let row = "";
  for (let c = 0; c < cols; c++) row += g[r][c] ? "#" : A[r][c] ? "A" : B[r][c] ? "B" : ".";
  lines.push(row);
}
writeFileSync("tmp/verify/hill-components.txt", JSON.stringify({ x0, y0, step, rows: lines }));
console.log("component map written");
