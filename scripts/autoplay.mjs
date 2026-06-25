#!/usr/bin/env node
/**
 * Multi-boss autorun: A*-routes to each available visible boss gate in turn and fights it with an
 * HP-aware battle AI (BASH normally; DEFEND when Bosch is low), carrying HP between fights like the
 * real game. Reports how far it gets. Perceive -> plan -> decide -> act, looped over objectives.
 *
 * Run: node scripts/autoplay.mjs [baseUrl] [spawnX,spawnY]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { findPath, nearestOpen } from "./route.mjs";

const world = JSON.parse(readFileSync(new URL("../apps/game/public/generated/world.json", import.meta.url), "utf8"));
const DOORS = (world.doors ?? []).map((d) => d.worldPixel).filter(Boolean);
const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const SPAWN = process.argv[3];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const peek = () => page.evaluate(() => ({ o: globalThis.__firstSceneDebug ?? null, b: globalThis.__battleDebug ?? null, bosses: globalThis.__bossGates ?? null }));
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(90); };
const tap = async (key, ms = 250) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
const log = (...a) => console.log(...a);

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
  for (const d of DOORS) { const c = Math.round((d.x - x0) / step), r = Math.round((d.y - y0) / step); if (c >= -1 && r >= -1 && c <= cols && r <= rows) mark(c, r); }
  return { cols, rows, blocked, x0, y0, step };
}
const w2c = (G, x, y) => ({ c: Math.round((x - G.x0) / G.step), r: Math.round((y - G.y0) / G.step) });
const c2w = (G, c, r) => ({ x: G.x0 + c * G.step, y: G.y0 + r * G.step });

async function routeTo(gate) {
  let s = await peek(); const p0 = s.o?.player; if (!p0) return "lost";
  const M = 260;
  const grid = await buildGrid(Math.min(p0.x, gate.x) - M, Math.min(p0.y, gate.y) - M, Math.max(p0.x, gate.x) + M, Math.max(p0.y, gate.y) + M);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, p0.x, p0.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, gate.x, gate.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  if (!path) return "noroute";
  const waypoints = path.filter((_, i) => i % 4 === 0 || i === path.length - 1).map((c) => c2w(grid, c.c, c.r));
  for (const wp of waypoints) {
    for (let i = 0; i < 14; i++) {
      s = await peek();
      if (s.b?.phase) return "battle";
      if (!s.o?.player) { await page.waitForTimeout(130); continue; }
      if (s.o.dialogueOpen) { await tap("z"); continue; }
      const p = s.o.player, dx = wp.x - p.x, dy = wp.y - p.y;
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) break;
      await hold(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 150);
    }
  }
  for (let i = 0; i < 26; i++) {
    s = await peek();
    if (s.b?.phase) return "battle";
    if (!s.o?.player) { await page.waitForTimeout(130); continue; }
    if (s.o.dialogueOpen) { await tap("z"); continue; }
    const p = s.o.player, dx = gate.x - p.x, dy = gate.y - p.y;
    await hold(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"), 130);
  }
  return (await peek()).b?.phase ? "battle" : "timeout";
}

const GRID = { BASH: [0, 0], GOODS: [1, 0], AUTO: [2, 0], PSI: [0, 1], DEFEND: [1, 1], RUN: [2, 1] };
async function navCommand(target) {
  for (let i = 0; i < 6; i++) {
    const cmd = (await peek()).b?.command; if (cmd === target) return;
    const [cx, cy] = GRID[cmd] ?? [0, 0], [tx, ty] = GRID[target];
    if (cx < tx) await tap("ArrowRight"); else if (cx > tx) await tap("ArrowLeft");
    else if (cy < ty) await tap("ArrowDown"); else if (cy > ty) await tap("ArrowUp"); else return;
  }
}

async function fight() {
  for (let step = 0; step < 80; step++) {
    const s = await peek(), b = s.b;
    if (!b || b.phase === "victory-summary") return "victory";
    if (b.phase === "defeat" || b.party.every((p) => !p.alive)) return "defeat";
    if (b.phase === "command-input") {
      const me = b.party[0];
      const canFinish = b.enemies.some((e) => e.alive && e.hpTarget <= 12); // finish it this turn instead of turtling
      const cmd = (me.hpTarget <= 24 && !canFinish) ? "DEFEND" : "BASH"; // HP-aware decision
      log(`    round: Bosch ${me.hpTarget}hp / enemy ${b.enemies.map((e) => e.hpTarget)}hp -> ${cmd}`);
      await navCommand(cmd);
      await tap("z"); // confirm command
      if (cmd === "BASH") await tap("z"); // confirm enemy target
    } else {
      await tap("z"); // advance narration
    }
  }
  return "timeout";
}

// --- Autorun ---
await page.goto(`${BASE}?nointro=1${SPAWN ? `&spawn=${SPAWN}` : ""}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

const beaten = new Set();
let wins = 0;
for (let objective = 0; objective < 8; objective++) {
  const s = await peek();
  const gate = (s.bosses?.gates ?? []).find((g) => g.armed && g.visible && !beaten.has(g.triggerId));
  if (!gate) { log(`No more reachable bosses (${s.bosses?.gates?.length ?? 0} gates known).`); break; }
  log(`\nObjective ${objective + 1}: boss "${gate.triggerId}" at (${gate.x},${gate.y}).`);
  beaten.add(gate.triggerId);
  const reached = await routeTo(gate);
  if (reached !== "battle") { log(`  could not reach it (${reached}).`); continue; }
  for (let i = 0; i < 8; i++) { if ((await peek()).b?.phase) break; await tap("z"); }
  const startHp = (await peek()).b?.party?.[0]?.hpTarget;
  log(`  Engaged at ${startHp}hp. Fighting…`);
  const result = await fight();
  log(`  -> ${result.toUpperCase()}`);
  await page.screenshot({ path: `.codex/screenshots/autoplay-${objective + 1}-${result}.png` });
  if (result !== "victory") { log("\nBosch is down. Autorun ends."); break; }
  wins += 1;
  await page.waitForTimeout(1200); // settle back to overworld
}
log(`\n=== Autoplayed ${wins} boss fight(s) won. ===`);
await browser.close();
