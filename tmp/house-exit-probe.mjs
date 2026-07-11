// Ground truth: where does the REAL boot flow (title -> naming -> wake in bed -> walk out
// of the house) land the player in town? Then: verified route segments from that landing
// to the premise-cutscene road point and the arcade. Run: node tmp/house-exit-probe.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { findPath, nearestOpen } from "../scripts/route.mjs";

mkdirSync("tmp/route-ledger", { recursive: true });
const world = JSON.parse(readFileSync(new URL("../apps/game/public/generated/world.json", import.meta.url), "utf8"));
const DOORS = (world.doors ?? []).map((d) => ({ ...d.worldPixel, dest: d.destinationWorldPixel })).filter((d) => d.x != null);

const base = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const tap = async (k, ms = 300) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(85); };
const shot = (n) => page.screenshot({ path: `tmp/route-ledger/${n}.png` });
const peek = () => page.evaluate(() => {
  const s = globalThis.__firstSceneDebug ?? null;
  return { world: !!s, player: s?.player ?? null, dlg: s?.dialogueOpen ?? false };
});
const dirToward = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"));
const PERP = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];

// ---- boot: title -> naming defaults -> wake-in-bed -> real control ----
await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await tap("KeyZ", 1100); await tap("KeyZ", 1100); await tap("KeyZ", 1100); await tap("KeyZ", 1100);
for (let field = 0; field < 3; field++) {
  for (let i = 0; i < 12; i++) await tap("KeyX", 110);
  for (let i = 0; i < 4; i++) await tap("ArrowDown", 150);
  for (let i = 0; i < 4; i++) await tap("ArrowRight", 150);
  await tap("KeyZ", 650);
}
{
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await peek()).world) break;
    await page.keyboard.press("KeyZ");
    await page.waitForTimeout(800);
  }
}
{
  const deadline = Date.now() + 120000;
  let freeChecks = 0;
  while (Date.now() < deadline && freeChecks < 3) {
    const s = await peek();
    if (!s.world) { await page.waitForTimeout(500); continue; }
    if (s.dlg) { freeChecks = 0; await tap("KeyZ", 350); continue; }
    const owners = await page.evaluate(() => (globalThis.__inputOwners ? globalThis.__inputOwners() : null));
    if (owners && !owners.cinematic && !owners.inputLocked && !owners.dialogue && !owners.eventSeq && !owners.cutscene) { freeChecks += 1; await page.waitForTimeout(300); }
    else { freeChecks = 0; await page.waitForTimeout(700); }
  }
}
let s = await peek();
console.log("control reached at:", JSON.stringify(s.player));
await shot("10-wake-in-bedroom");

// ---- grid + mover (door tiles left OPEN so we can walk into them) ----
async function buildGrid(x0, y0, x1, y1, step = 8) {
  const solid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt; if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
    const g = []; for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); } return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  if (!solid) return null;
  const { cols, rows, g } = solid;
  const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const mark = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true; } };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c]) mark(c, r);
  return { cols, rows, blocked, x0, y0, step };
}
const w2c = (G, x, y) => ({ c: Math.round((x - G.x0) / G.step), r: Math.round((y - G.y0) / G.step) });
const c2w = (G, c, r) => ({ x: G.x0 + c * G.step, y: G.y0 + r * G.step });

async function walkToward(target, maxMs = 25000) {
  const t0 = Date.now();
  let last = null, stuck = 0;
  while (Date.now() - t0 < maxMs) {
    s = await peek();
    if (s.dlg) { await tap("KeyZ", 300); continue; }
    const p = s.player; if (!p) { await page.waitForTimeout(150); continue; }
    if (last && Math.hypot(p.x - last.x, p.y - last.y) > 150) return { transitioned: true, at: p, from: last };
    if (Math.hypot(target.x - p.x, target.y - p.y) < 10) return { transitioned: false, at: p };
    stuck = last && Math.hypot(p.x - last.x, p.y - last.y) < 2 ? stuck + 1 : 0;
    last = { x: p.x, y: p.y };
    if (stuck >= 4) { await hold(PERP[Math.floor(Math.random() * 0) + (stuck % 4)], 200); stuck = 0; continue; }
    await hold(dirToward(target.x - p.x, target.y - p.y), 130);
  }
  return { transitioned: false, at: (await peek()).player, timeout: true };
}

async function routeAndWalk(target) {
  for (let attempt = 0; attempt < 6; attempt++) {
    s = await peek();
    const p = s.player; if (!p) { await page.waitForTimeout(200); continue; }
    if (Math.hypot(target.x - p.x, target.y - p.y) < 12) return { arrived: true, at: p };
    const M = 200;
    const grid = await buildGrid(Math.min(p.x, target.x) - M, Math.min(p.y, target.y) - M, Math.max(p.x, target.x) + M, Math.max(p.y, target.y) + M);
    if (!grid) return { arrived: false };
    const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, p.x, p.y)));
    const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, target.x, target.y)));
    const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
    if (!path) return { arrived: false, noroute: true };
    const wps = path.filter((_, i) => i % 2 === 0 || i === path.length - 1).map((c) => c2w(grid, c.c, c.r));
    for (const wp of wps) {
      const r = await walkToward(wp, 8000);
      if (r.transitioned) return { arrived: false, transitioned: true, at: r.at, from: r.from };
    }
  }
  return { arrived: false };
}

// ---- walk out of the house along the KNOWN chain, verified by EXPECTED LANDINGS
// (stair/door transitions animate, so frame-delta jump detection is unreliable).
const hops = [];
const PLAN = [
  { door: { x: 7968, y: 1104 }, expect: { x: 7648, y: 1008 }, name: "bedroom west door -> hall" },
  { door: { x: 7460, y: 1008 }, expect: { x: 7472, y: 336 }, name: "hall west staircase -> downstairs" },
  { door: { x: 7480, y: 360 }, expect: { x: 7480, y: 360 }, name: "downstairs: step to the open lane" },
  { door: { x: 7770, y: 356 }, expect: { x: 7770, y: 356 }, name: "downstairs: east along the lane" },
  { door: { x: 7800, y: 336 }, expect: null, name: "east front door -> hilltop front step" }
];
const atExpect = (p, expect, tol) => expect ? Math.hypot(p.x - expect.x, p.y - expect.y) < (tol ?? 150) : p.x < 3000;
for (let hop = 0; hop < PLAN.length; hop++) {
  const { door, expect, name } = PLAN[hop];
  const tol = expect && Math.hypot(door.x - expect.x, door.y - expect.y) < 1 ? 24 : 150;
  console.log(`hop ${hop}: ${name}`);
  await routeAndWalk({ x: door.x, y: door.y }); // best effort approach
  let done = false;
  let prev = null, stall = 0;
  for (let i = 0; i < 40 && !done; i++) {
    const st = await peek();
    if (st.dlg) { await tap("KeyZ", 300); continue; }
    const p = st.player;
    if (!p) { await page.waitForTimeout(350); continue; }
    if (atExpect(p, expect, tol)) { done = true; break; }
    stall = prev && Math.hypot(p.x - prev.x, p.y - prev.y) < 3 ? stall + 1 : 0;
    prev = { x: p.x, y: p.y };
    if (stall >= 2) { // blocked (walls or NPC bodies): sidestep perpendicular, then resume
      await hold(stall % 4 < 2 ? "ArrowDown" : "ArrowUp", 260);
      continue;
    }
    await hold(dirToward(door.x - p.x, door.y - p.y), 180);
    await page.waitForTimeout(150);
  }
  // settle + final poll (animated transitions land late)
  for (let i = 0; i < 10 && !done; i++) {
    await page.waitForTimeout(500);
    const p = (await peek()).player;
    if (p && atExpect(p, expect, tol)) done = true;
  }
  const p = (await peek()).player;
  console.log(`  hop ${hop} ${done ? "OK" : "FAILED"} at (${Math.round(p?.x ?? -1)},${Math.round(p?.y ?? -1)})`);
  await shot(`11-hop-${hop}`);
  hops.push({ hop, name, done, at: p });
  if (!done) break;
}

s = await peek();
console.log("FINAL landing:", JSON.stringify(s.player));
await page.waitForTimeout(800);
await shot("12-house-front-landing");

// ---- verified segments: landing -> premise road point -> arcade ----
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
async function planSegments(from, to) {
  const M = 320;
  const grid = await buildGrid(Math.min(from.x, to.x) - M, Math.min(from.y, to.y) - M, Math.max(from.x, to.x) + M, Math.max(from.y, to.y) + M);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, from.x, from.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, to.x, to.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  return path ? segments(path.map((c) => c2w(grid, c.c, c.r))) : null;
}
const landing = { x: Math.round(s.player.x), y: Math.round(s.player.y) };
const toSpawnRoad = await planSegments(landing, { x: 2112, y: 1768 }); // hill descent to the premise road point
const toArcade = await planSegments(landing, { x: 1512, y: 1744 });
console.log("landing -> premise road point (2112,1768):", toSpawnRoad ? toSpawnRoad.join(" -> ") : "NO ROUTE");
console.log("landing -> arcade (1512,1744):", toArcade ? toArcade.join(" -> ") : "NO ROUTE");
writeFileSync("tmp/route-ledger/house-exit.json", JSON.stringify({ hops, landing, toSpawnRoad, toArcade }, null, 1));
await browser.close();
