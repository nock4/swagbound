#!/usr/bin/env node
/**
 * Unattended Act-1 autorun. Drives the real game through the authored Act-1 boss chain
 * (content/triggers.json): card-clique -> returnless-king -> malady -> leave-signal-town, following
 * the requireFlags/setFlags progression read live from __firstSceneDebug.flags. Per objective it
 * full-heals (__debugHeal, the hotel stand-in), A*-routes to the target (route.mjs + __solidAt grid
 * around walls/doors), and fights with an HP-aware AI (BASH; DEFEND when low unless the enemy is
 * finishable). Reports how far it gets; screenshots each milestone.
 *
 * Run: node scripts/act1.mjs [baseUrl] [spawnX,spawnY]
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { findPath, nearestOpen } from "./route.mjs";

const root = new URL("../", import.meta.url);
const world = JSON.parse(readFileSync(new URL("apps/game/public/generated/world.json", root), "utf8"));
const TRIG = JSON.parse(readFileSync(new URL("content/triggers.json", root), "utf8"));
const DOORS = (world.doors ?? []).map((d) => d.worldPixel).filter(Boolean);
const BOSSES = TRIG.triggers.filter((t) => t.boss && t.battleGroup).map((t) => ({ id: t.id, x: t.boss.x, y: t.boss.y, group: t.battleGroup, require: t.requireFlags ?? [], set: t.setFlags ?? [] }));
const LEAVE = TRIG.triggers.find((t) => (t.setFlags ?? []).includes("act1:complete"));

const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const SPAWN = process.argv[3];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const peek = () => page.evaluate(() => ({ o: globalThis.__firstSceneDebug ?? null, b: globalThis.__battleDebug ?? null }));
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(85); };
const tap = async (key, ms = 250) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
const heal = () => page.evaluate(() => globalThis.__debugHeal?.());
const log = (...a) => console.log(...a);
// A REAL active battle is in a fightable phase. __battleDebug lingers at "exit-transition" after a
// fight (stale), so whitelist the in-progress phases instead of just checking that a phase exists.
const inBattle = (s) => !!s.b && ["enter-transition", "command-input", "execution"].includes(s.b.phase);
const G = { lastMaxHp: 75 }; // Bosch's max HP, read from the post-heal battle-start HP each fight

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

const dirToward = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown"));
const PERP = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];

async function planPath(p, target) {
  const M = 320;
  const grid = await buildGrid(Math.min(p.x, target.x) - M, Math.min(p.y, target.y) - M, Math.max(p.x, target.x) + M, Math.max(p.y, target.y) + M);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, p.x, p.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, target.x, target.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  if (!path) return null;
  // Dense waypoints (every 2nd cell, ~16px) so the greedy mover doesn't corner-cut into walls.
  return path.filter((_, i) => i % 2 === 0 || i === path.length - 1).map((c) => c2w(grid, c.c, c.r));
}

async function routeTo(target) {
  // Wait for the overworld collision hook to be live (it re-registers after a battle).
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => typeof globalThis.__solidAt === "function" && !!globalThis.__firstSceneDebug?.player)) break; await page.waitForTimeout(200); }
  // Plan -> follow -> on a stuck stretch, nudge free and RE-PLAN from where we actually are.
  for (let attempt = 0; attempt < 12; attempt++) {
    let s = await peek();
    if (inBattle(s)) return "battle";
    let p = s.o?.player; if (!p) { await page.waitForTimeout(150); continue; }
    if (Math.hypot(target.x - p.x, target.y - p.y) < 16) break; // close enough -> final approach
    const waypoints = await planPath(p, target);
    if (!waypoints) return "noroute";
    if (attempt === 0) log(`    [route] (${Math.round(p.x)},${Math.round(p.y)}) -> (${target.x},${target.y}), ${waypoints.length} wp`);
    let lastX = p.x, lastY = p.y, stuck = 0, bailed = false;
    for (const wp of waypoints) {
      for (let i = 0; i < 12; i++) {
        s = await peek();
        if (inBattle(s)) return "battle";
        if (!s.o?.player) { await page.waitForTimeout(120); continue; }
        if (s.o.dialogueOpen) { await tap("z"); continue; }
        p = s.o.player;
        if (Math.hypot(wp.x - p.x, wp.y - p.y) < 12) break;
        stuck = Math.hypot(p.x - lastX, p.y - lastY) < 3 ? stuck + 1 : 0;
        lastX = p.x; lastY = p.y;
        if (stuck >= 4) { bailed = true; break; } // wall — bail and re-plan from here
        await hold(dirToward(wp.x - p.x, wp.y - p.y), 120);
      }
      if (bailed) break;
    }
    if (bailed) { await hold(PERP[attempt % 4], 220); } // perpendicular nudge to escape the corner
  }
  // Final approach into the target sprite (it sits just off the walkable path); nudge in 4 dirs.
  for (let i = 0; i < 40; i++) {
    let s = await peek();
    if (inBattle(s)) return "battle";
    if (!s.o?.player) { await page.waitForTimeout(120); continue; }
    if (s.o.dialogueOpen) { await tap("z"); continue; }
    const p = s.o.player, dx = target.x - p.x, dy = target.y - p.y;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { await hold(PERP[i % 4], 120); continue; }
    await hold(dirToward(dx, dy), 120);
  }
  return inBattle(await peek()) ? "battle" : "arrived";
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
// In BASH target mode (selection "target:BASH:N"), cycle to the weakest LIVING enemy so the AI
// finishes minions first instead of always hammering enemy 0 (which may be the high-HP boss).
async function selectWeakestTarget(living) {
  if (living.length <= 1) return;
  const want = living.reduce((a, x) => (x.e.hpTarget < a.e.hpTarget ? x : a)).i;
  for (let k = 0; k < 6; k++) {
    const m = ((await peek()).b?.selection ?? "").match(/^target:BASH:(\d+)/);
    if (!m) return;
    const cur = parseInt(m[1], 10);
    if (cur === want) return;
    await tap(cur < want ? "ArrowRight" : "ArrowLeft");
  }
}
const bsel = async () => (await peek()).b?.selection ?? "";
// Open the active caster's PSI list and land on psi:<id>. Returns true (now in the target submenu)
// if found; false (still in the list) if the caster hasn't learned it — caller cancels + BASHes.
async function openPsi(id) {
  await navCommand("PSI"); await tap("z");
  for (let k = 0; k < 12 && !(await bsel()).includes(`psi:${id}`); k++) await tap("ArrowDown");
  if (!(await bsel()).includes(`psi:${id}`)) return false;
  await tap("z"); // select PSI -> target submenu
  return true;
}
async function pickTargetIdx(want) {
  for (let k = 0; k < 6; k++) {
    const m = (await bsel()).match(/:(\d+)$/);
    if (!m || +m[1] === want) return;
    await tap(+m[1] < want ? "ArrowRight" : "ArrowLeft");
  }
}
async function bashWeakest(living) { await navCommand("BASH"); await tap("z"); await selectWeakestTarget(living); await tap("z"); }

// Duo AI: Paula PSI-Freezes the toughest enemy (bypasses high defense — the Titanic Ant check);
// Bosch Lifeups himself when low (he's the focused tank), else BASHes. Both fall back to BASH if a
// PSI isn't learned/affordable. Members are driven in turn via b.inputMemberIndex.
async function fight(label) {
  let lastPhase = "", captured = false;
  for (let step = 0; step < 280; step++) {
    const b = (await peek()).b;
    if (!b) { await page.waitForTimeout(150); continue; }
    if (b.phase === "victory-summary") return "victory";
    if (b.phase === "defeat" || (b.party ?? []).every((p) => !p.alive)) return "defeat";
    if (b.phase === "command-input") {
      const idx = b.inputMemberIndex ?? 0;
      const me = b.party[idx] ?? b.party[0];
      if (!captured && idx === 0) { G.lastMaxHp = b.party[0].hpTarget; captured = true; } // post-heal start HP ~= max HP
      const living = b.enemies.map((e, i) => ({ e, i })).filter((x) => x.e.alive);
      const boss = living.reduce((a, x) => (x.e.hpTarget > a.e.hpTarget ? x : a), living[0]);
      let act = "BASH";
      // Paula (the Freeze engine) is glass and now gets occasionally targeted, so Bosch
      // protects her: if she's critically low, he Lifeups HER (ally-target) before himself.
      const paula = b.party[1];
      const paulaCrit = idx === 0 && paula && paula.alive && paula.hpTarget <= 14;
      if (idx === 1 && me.pp >= 4 && (await openPsi(9))) {
        await pickTargetIdx(boss.i); await tap("z"); act = "Freeze"; // Paula -> toughest enemy
      } else if (paulaCrit && me.pp >= 4 && (await openPsi(23))) {
        await pickTargetIdx(1); await tap("z"); act = "Lifeup->Paula"; // Bosch saves Paula
      } else if (idx === 0 && me.hpTarget <= G.lastMaxHp * 0.55 && me.pp >= 4 && (await openPsi(23))) {
        await pickTargetIdx(0); await tap("z"); act = "Lifeup"; // Bosch heals himself
      } else {
        if ((await peek()).b?.submenu === "psi") await tap("x"); // back out of a half-opened PSI list
        await bashWeakest(living);
      }
      log(`    [${label}] r${b.roundNumber} ${idx ? "Paula" : "Bosch"} ${me.hpTarget}hp/${me.pp}pp e=[${b.enemies.map((e) => e.hpTarget)}] -> ${act}`);
    } else if (b.phase === "execution") {
      await tap("z"); // advance narration
    } else {
      if (b.phase !== lastPhase) { log(`      (phase: ${b.phase})`); lastPhase = b.phase; }
      await page.waitForTimeout(220); // transition / intro — wait, don't spam z
    }
  }
  return "timeout";
}

// Level Bosch on roaming overworld enemies until max HP reaches `targetHp` (or fights/enemies run out).
async function grind(targetHp, maxFights) {
  log(`  [grind] Bosch maxHP ~${G.lastMaxHp} -> target ${targetHp} (<= ${maxFights} fights)`);
  for (let f = 0; f < maxFights && G.lastMaxHp < targetHp; f++) {
    const ow = await page.evaluate(() => globalThis.__overworldEnemies ?? { enemies: [] });
    const p = (await peek()).o?.player;
    if (!p || !ow.enemies.length) { log(`    [grind] no roaming enemies in range — stopping`); return; }
    const enemy = ow.enemies.map((e) => ({ ...e, d: Math.hypot(e.x - p.x, e.y - p.y) })).sort((a, b) => a.d - b.d)[0];
    await heal();
    const reached = await routeTo({ x: enemy.x, y: enemy.y });
    if (reached !== "battle") { log(`    [grind] fight ${f + 1}: couldn't reach (${reached})`); continue; }
    for (let i = 0; i < 12; i++) { if (inBattle(await peek())) break; await tap("z"); }
    const result = await fight("grind");
    log(`    [grind] fight ${f + 1}: ${result.toUpperCase()} — Bosch maxHP ~${G.lastMaxHp}`);
    if (result === "defeat") return;
    for (let i = 0; i < 24; i++) { const ps = await peek(); if (ps.b?.phase === "victory-summary") { await tap("z"); continue; } if (ps.o?.dialogueOpen) { await tap("z"); continue; } if (ps.o?.player) break; await page.waitForTimeout(250); }
  }
  log(`  [grind] done — Bosch maxHP ~${G.lastMaxHp}`);
}

// --- Act-1 autorun ---
await page.goto(`${BASE}?nointro=1${SPAWN ? `&spawn=${SPAWN}` : ""}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
log(`Act-1 chain: ${BOSSES.map((b) => b.id).join(" -> ")} -> leave.`);

let bossesWon = 0;
for (let obj = 0; obj < 12; obj++) {
  const flags = (await peek()).o?.flags ?? [];
  if (flags.includes("act1:complete")) { log("\n*** ACT 1 COMPLETE ***"); break; }
  const next = BOSSES.find((b) => b.require.every((f) => flags.includes(f)) && !b.set.every((f) => flags.includes(f)));
  let target, kind, id;
  if (next) { target = next; kind = "boss"; id = next.id; }
  else if (flags.includes("signal:threshold_cleared") && LEAVE) { target = { x: LEAVE.area.x + LEAVE.area.w / 2, y: LEAVE.area.y + LEAVE.area.h / 2 }; kind = "leave"; id = LEAVE.id; }
  else { log(`\nNo next objective (flags: [${flags.join(",")}]). Stuck.`); break; }

  log(`\nObjective ${obj + 1}: ${kind} "${id}" at (${Math.round(target.x)},${Math.round(target.y)}). flags:[${flags.join(",")}]`);
  await heal(); // full-heal both party members before engaging (hotel stand-in; also restores Paula's PP)
  const reached = await routeTo(target);

  if (kind === "leave") {
    const f2 = (await peek()).o?.flags ?? [];
    log(f2.includes("act1:complete") ? "\n*** ACT 1 COMPLETE ***" : `  reached leave area (${reached}) but act1:complete not set; flags:[${f2.join(",")}]`);
    await page.screenshot({ path: `.codex/screenshots/act1-leave.png` });
    break;
  }
  if (reached !== "battle") {
    const dbg = await page.evaluate(() => ({ p: globalThis.__firstSceneDebug?.player, g: (globalThis.__bossGates?.gates ?? []).map((x) => ({ id: x.triggerId, x: x.x, y: x.y, armed: x.armed, vis: x.visible })) }));
    log(`  could not engage ${id} (${reached}). player=(${Math.round(dbg.p?.x)},${Math.round(dbg.p?.y)}) gates=${JSON.stringify(dbg.g)}`);
    break;
  }
  for (let i = 0; i < 12; i++) { if (inBattle(await peek())) break; await tap("z"); }
  const result = await fight(id);
  log(`  -> ${id}: ${result.toUpperCase()}`);
  await page.screenshot({ path: `.codex/screenshots/act1-${obj + 1}-${id}-${result}.png` });
  if (result !== "victory") { log("\nBosch is down. Autorun ends."); break; }
  bossesWon += 1;
  // Settle back to overworld + advance the post-battle dialogue, which applies the trigger's setFlags.
  for (let i = 0; i < 30; i++) {
    const ps = await peek();
    if (ps.b?.phase) { await tap("z"); continue; }       // dismiss victory summary
    if (ps.o?.dialogueOpen) { await tap("z"); continue; } // post-battle dialogue
    if (ps.o?.player && target.set.every((f) => (ps.o.flags ?? []).includes(f))) break; // flags applied
    await page.waitForTimeout(300);
  }
  log(`    flags now: [${((await peek()).o?.flags ?? []).join(",")}]`);
}
log(`\n=== Bosses defeated: ${bossesWon}/${BOSSES.length}. Final flags: [${((await peek()).o?.flags ?? []).join(",")}] ===`);
await browser.close();
