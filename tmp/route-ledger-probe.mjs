// Phase 0 route-ledger probe: browser-verified spatial facts for the Act 1 critical path.
// Boots the real game (?nointro), records the true new-game spawn, then for each Act-1 leg
// plans the actual walkable path (route.mjs A* over __solidAt) and compresses it into
// direction segments a human can turn into landmark wording. Screenshots every beat.
// Run: node tmp/route-ledger-probe.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { findPath, nearestOpen } from "../scripts/route.mjs";

mkdirSync("tmp/route-ledger", { recursive: true });
const world = JSON.parse(readFileSync(new URL("../apps/game/public/generated/world.json", import.meta.url), "utf8"));
const DOORS = (world.doors ?? []).map((d) => ({ ...d.worldPixel, type: d.type, style: d.style })).filter((d) => d.x != null);

const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
const dlg = () => page.evaluate(() => globalThis.__firstSceneDebug?.dialogueOpen ?? false);
let calm = 0;
for (let i = 0; i < 30 && calm < 3; i++) {
  if (await dlg()) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(340); }
  else { calm++; await page.waitForTimeout(260); }
}

const pos = () => page.evaluate(() => {
  const p = globalThis.__firstSceneDebug?.player;
  return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null;
});
const warp = async (x, y) => {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x, y });
  await page.waitForTimeout(1400); // chunk settle + fade gate
};
const shot = (n) => page.screenshot({ path: `tmp/route-ledger/${n}.png` });

// --- grid builder (act1.mjs pattern: __solidAt + doors marked, NPCs ignored for ledger) ---
async function buildGrid(x0, y0, x1, y1, step = 8) {
  const solid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt; if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
    const g = []; for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); } return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  if (!solid) throw new Error("__solidAt unavailable");
  const { cols, rows, g } = solid;
  const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const mark = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true; } };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c]) mark(c, r);
  for (const d of DOORS) { const c = Math.round((d.x - x0) / step), r = Math.round((d.y - y0) / step); if (c >= -1 && r >= -1 && c <= cols && r <= rows) mark(c, r); }
  return { cols, rows, blocked, x0, y0, step };
}
const w2c = (G, x, y) => ({ c: Math.round((x - G.x0) / G.step), r: Math.round((y - G.y0) / G.step) });
const c2w = (G, c, r) => ({ x: G.x0 + c * G.step, y: G.y0 + r * G.step });

// Compress a waypoint path into human direction segments (dominant axis, merged runs).
function segments(points) {
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    // 8-way: diagonal when the minor axis is at least half the major axis
    const ew = dx < 0 ? "W" : dx > 0 ? "E" : "";
    const ns = dy < 0 ? "N" : dy > 0 ? "S" : "";
    const dir = Math.abs(dx) >= 2 * Math.abs(dy) ? ew : Math.abs(dy) >= 2 * Math.abs(dx) ? ns : ns + ew;
    const len = Math.hypot(dx, dy);
    if (runs.length && runs[runs.length - 1].dir === dir) runs[runs.length - 1].len += len;
    else runs.push({ dir, len });
  }
  // merge sub-40px jogs into the previous run so the summary reads like route advice
  const merged = [];
  for (const r of runs) {
    if (r.len < 40 && merged.length) merged[merged.length - 1].len += r.len;
    else merged.push({ ...r });
  }
  return merged.map((r) => `${r.dir} ${Math.round(r.len)}px`);
}

async function planLeg(name, from, to) {
  const M = 320;
  const grid = await buildGrid(Math.min(from.x, to.x) - M, Math.min(from.y, to.y) - M, Math.max(from.x, to.x) + M, Math.max(from.y, to.y) + M);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, from.x, from.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, to.x, to.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  if (!path) return { name, from, to, route: null };
  const pts = path.map(({ c, r }) => c2w(grid, c, r));
  const doorsNearTo = DOORS.filter((d) => Math.hypot(d.x - to.x, d.y - to.y) < 130).map((d) => ({ x: d.x, y: d.y, style: d.style }));
  return { name, from, to, waypoints: pts.length, route: segments(pts), doorsNearTarget: doorsNearTo };
}

const out = { generatedFor: "act1-route-ledger", baseUrl: base, legs: [], spawn: null };

// 1) TRUE new-game spawn (house exterior ground truth)
const spawn = await pos();
out.spawn = spawn;
console.log("new-game spawn (house exterior):", spawn);
await shot("00-spawn-house-exterior");

const BEATS = [
  { id: "card-clique-arcade", x: 1512, y: 1744 },
  { id: "relay-gate-returnless-king", x: 1928, y: 1560 },
  { id: "first-threshold-malady", x: 1904, y: 1408 },
  { id: "recruit-munch", x: 1928, y: 1364 },
  { id: "leave-signal-town", x: 1928, y: 1300 }
];

let cur = spawn;
for (const b of BEATS) {
  const leg = await planLeg(`${cur.x},${cur.y} -> ${b.id}`, cur, b);
  out.legs.push(leg);
  console.log(leg.name, "|", leg.route ? leg.route.join(" -> ") : "NO ROUTE", "| doors near:", (leg.doorsNearTarget ?? []).length);
  await warp(b.x, b.y + 24); // stand just below the beat so the subject is framed
  await shot(`beat-${b.id}`);
  cur = { x: b.x, y: b.y };
}

// extra context frames: the road midway to the arcade + the arcade building doors
await warp(1800, 1760); await shot("leg1-midway-road");
await warp(1580, 1710); await shot("arcade-building-doors");

writeFileSync("tmp/route-ledger/route-ledger.json", JSON.stringify(out, null, 1));
console.log("wrote tmp/route-ledger/route-ledger.json");
await browser.close();
