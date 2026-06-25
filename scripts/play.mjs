#!/usr/bin/env node
/**
 * Autonomous play probe: starts a fresh game, A*-routes the overworld to the nearest visible boss
 * gate (around walls + doors, using the game's own collision via __solidAt), then fights the
 * battle by reading state each round. Perceive -> plan -> act, end to end.
 *
 * Run: node scripts/play.mjs [baseUrl] [spawnX,spawnY]   (needs a dev server)
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { findPath, nearestOpen } from "./route.mjs";

const world = JSON.parse(readFileSync(new URL("../apps/game/public/generated/world.json", import.meta.url), "utf8"));
const DOORS = (world.doors ?? []).map((d) => d.worldPixel).filter(Boolean);

const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });

const peek = () => page.evaluate(() => ({
  o: globalThis.__firstSceneDebug ?? null,
  b: globalThis.__battleDebug ?? null,
  bosses: globalThis.__bossGates ?? null
}));
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(90); };
const tap = async (key, ms = 260) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
const shot = (n) => page.screenshot({ path: `.codex/screenshots/play-${n}.png` });
const log = (...a) => console.log(...a);

// Sample the game's own collision (__solidAt) over a region, dilate walls by a cell for foot
// clearance, and block door cells so the route never warps into a building.
async function buildGrid(x0, y0, x1, y1, step = 8) {
  const solid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt;
    if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
    const g = [];
    for (let r = 0; r < rows; r++) { const row = new Array(cols); for (let c = 0; c < cols; c++) row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0; g.push(row); }
    return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  const { cols, rows, g } = solid;
  const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const mark = (c, r) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true; } };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (g[r][c]) mark(c, r);
  for (const d of DOORS) { const c = Math.round((d.x - x0) / step), r = Math.round((d.y - y0) / step); if (c >= -1 && r >= -1 && c <= cols && r <= rows) mark(c, r); }
  return { cols, rows, blocked, x0, y0, step };
}
const w2c = (G, x, y) => ({ c: Math.round((x - G.x0) / G.step), r: Math.round((y - G.y0) / G.step) });
const c2w = (G, c, r) => ({ x: G.x0 + c * G.step, y: G.y0 + r * G.step });

const SPAWN = process.argv[3];
await page.goto(`${BASE}?nointro=1${SPAWN ? `&spawn=${SPAWN}` : ""}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

let s = await peek();
const gate = s.bosses?.gates?.[0];
const p0 = s.o.player;
log(`Spawned at (${Math.round(p0.x)},${Math.round(p0.y)}). Goal: boss "${gate?.triggerId}" at (${gate?.x},${gate?.y}).`);
await shot("start");

// --- Plan a route ---
const M = 260;
const x0 = Math.min(p0.x, gate.x) - M, y0 = Math.min(p0.y, gate.y) - M;
const x1 = Math.max(p0.x, gate.x) + M, y1 = Math.max(p0.y, gate.y) + M;
const grid = await buildGrid(x0, y0, x1, y1);
const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, p0.x, p0.y)));
const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, gate.x, gate.y)));
const path = findPath(grid.blocked, grid.cols, grid.rows, start, goal);
if (!path) { log("No route found — stopping."); await browser.close(); process.exit(1); }
const waypoints = path.filter((_, i) => i % 4 === 0 || i === path.length - 1).map((c) => c2w(grid, c.c, c.r));
log(`Routed: ${path.length} cells -> ${waypoints.length} waypoints, around ${grid.blocked.flat().filter(Boolean).length} blocked cells.`);

// --- Follow the route ---
let nav = "timeout";
for (let w = 0; w < waypoints.length && nav !== "battle"; w++) {
  const wp = waypoints[w];
  for (let i = 0; i < 14; i++) {
    s = await peek();
    if (s.b?.phase) { nav = "battle"; break; }
    if (!s.o?.player) { await page.waitForTimeout(140); continue; }
    if (s.o.dialogueOpen) { await tap("z"); continue; }
    const p = s.o.player, dx = wp.x - p.x, dy = wp.y - p.y;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) break;
    const horiz = Math.abs(dx) >= Math.abs(dy);
    await hold(horiz ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 150);
  }
}
// Final touch into the boss sprite (it sits just off the walkable path) + any pre-battle dialogue.
for (let i = 0; i < 24 && nav !== "battle"; i++) {
  s = await peek();
  if (s.b?.phase) { nav = "battle"; break; }
  if (!s.o?.player) { await page.waitForTimeout(140); continue; }
  if (s.o.dialogueOpen) { await tap("z"); continue; }
  const p = s.o.player, dx = gate.x - p.x, dy = gate.y - p.y;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  await hold(horiz ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 130);
}
log(`Navigation: ${nav === "battle" ? "reached the boss" : "did not reach a battle"}`);
await shot("contact");

// --- Fight ---
s = await peek();
if (!s.b?.phase) { log("No battle — stopping."); await browser.close(); process.exit(0); }
log(`Battle! enemy HP ${s.b.enemies.map((e) => e.hpTarget)}, Bosch HP ${s.b.party[0].hpTarget}.`);
let result = "ongoing", round = 0;
for (let step = 0; step < 60; step++) {
  s = await peek();
  const b = s.b;
  if (!b || b.phase === "victory-summary" || b.phase === "defeat") { result = b?.phase === "defeat" ? "defeat" : "victory"; break; }
  if (b.party.every((pp) => !pp.alive)) { result = "defeat"; break; }
  if (b.phase === "command-input") {
    round += 1;
    log(`  round ${round}: Bosch ${b.party[0].hpTarget}hp / enemy ${b.enemies.map((e) => e.hpTarget)}hp — BASH`);
    await tap("z"); await tap("z");
  } else {
    await tap("z");
  }
}
log(`Result: ${result.toUpperCase()}`);
await shot("end");
s = await peek();
log(`Final — Bosch ${s.b?.party?.[0]?.hpTarget ?? "?"}hp, enemy ${s.b?.enemies?.map((e) => `${e.hpTarget}hp${e.alive ? "" : " (down)"}`)}.`);
await browser.close();
