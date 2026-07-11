// Measure the verified hill-descent route: front step (2648,352) -> premise road point -> arcade.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { findPath, nearestOpen } from "../scripts/route.mjs";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:5174/?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
for (let i = 0, calm = 0; i < 30 && calm < 3; i++) {
  const d = await page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
  if (d) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}
await page.evaluate(() => globalThis.__warpTo?.(2648, 352));
await page.waitForTimeout(1500);
await page.screenshot({ path: "tmp/route-ledger/15-hilltop-front-step.png" });
async function buildGrid(x0, y0, x1, y1, step = 8) {
  const solid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt; if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
    const g = []; for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); } return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  const { cols, rows, g } = solid;
  const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const mark = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true; } };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c]) mark(c, r);
  return { cols, rows, blocked, x0, y0, step };
}
const w2c = (G, x, y) => ({ c: Math.round((x - G.x0) / G.step), r: Math.round((y - G.y0) / G.step) });
const c2w = (G, c, r) => ({ x: G.x0 + c * G.step, y: G.y0 + r * G.step });
function segments(points) {
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    const ew = dx < 0 ? "W" : dx > 0 ? "E" : "";
    const ns = dy < 0 ? "N" : dy > 0 ? "S" : "";
    const dir = Math.abs(dx) >= 2 * Math.abs(dy) ? ew : Math.abs(dy) >= 2 * Math.abs(dx) ? ns : ns + ew;
    const len = Math.hypot(dx, dy);
    if (runs.length && runs[runs.length - 1].dir === dir) runs[runs.length - 1].len += len;
    else runs.push({ dir, len });
  }
  const merged = [];
  for (const r of runs) {
    if (r.len < 40 && merged.length) merged[merged.length - 1].len += r.len;
    else merged.push({ ...r });
  }
  return merged.map((r) => `${r.dir} ${Math.round(r.len)}px`);
}
async function plan(from, to, M) {
  const grid = await buildGrid(Math.min(from.x, to.x) - M, Math.min(from.y, to.y) - M, Math.max(from.x, to.x) + M, Math.max(from.y, to.y) + M);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, from.x, from.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, to.x, to.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  return path ? segments(path.map((c) => c2w(grid, c.c, c.r))) : null;
}
// Piecewise: warp to each leg start so chunk streaming loads the local collision,
// then A* the short leg. Concatenated segments = the verified descent.
const LEGS = [
  [{ x: 2648, y: 352 }, { x: 2500, y: 800 }],
  [{ x: 2500, y: 800 }, { x: 2300, y: 1300 }],
  [{ x: 2300, y: 1300 }, { x: 2112, y: 1768 }]
];
const all = [];
let ok = true;
for (const [from, to] of LEGS) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), from);
  await page.waitForTimeout(1600);
  let got = null;
  for (const M of [280, 450]) {
    got = await plan(from, to, M);
    if (got) break;
  }
  console.log(`leg (${from.x},${from.y}) -> (${to.x},${to.y}):`, got ? got.join(" -> ") : "NO ROUTE");
  if (!got) { ok = false; break; }
  all.push({ from, to, segments: got });
}
if (ok) writeFileSync("tmp/route-ledger/hill-descent.json", JSON.stringify(all, null, 1));
await browser.close();
