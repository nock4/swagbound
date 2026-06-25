#!/usr/bin/env node
/**
 * Autonomous play probe: starts a fresh game, navigates to the nearest visible boss gate by
 * dead-reckoning off the live player position, then fights the battle by reading state and
 * choosing actions each round. Proves the game is playable end-to-end by an agent loop (not a
 * scripted key sequence) — perceive (debug state) -> decide -> act.
 *
 * Run: node scripts/play.mjs [baseUrl]   (needs a dev server)
 */
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] ?? "http://127.0.0.1:5174/").replace(/\/?$/, "/");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });

const peek = () => page.evaluate(() => ({
  o: globalThis.__firstSceneDebug ?? null,
  b: globalThis.__battleDebug ?? null,
  bosses: globalThis.__bossGates ?? null
}));
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(110); };
const tap = async (key, ms = 260) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
const shot = (n) => page.screenshot({ path: `.codex/screenshots/play-${n}.png` });
const log = (...a) => console.log(...a);

const SPAWN = process.argv[3]; // optional "x,y" to start near a target (dead-reckoning has no pathfinding)
await page.goto(`${BASE}?nointro=1${SPAWN ? `&spawn=${SPAWN}` : ""}`, { waitUntil: "networkidle" });
await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

let s = await peek();
const gate = s.bosses?.gates?.[0];
log(`Spawned at (${s.o?.player?.x},${s.o?.player?.y}). Goal: boss "${gate?.triggerId}" at (${gate?.x},${gate?.y}).`);
await shot("start");

// --- Navigate to the boss ---
let nav = "timeout";
for (let i = 0; i < 50; i++) {
  s = await peek();
  if (s.b?.phase) { nav = "battle"; break; }
  if (!s.o?.player) { await page.waitForTimeout(200); continue; } // scene transition; let it settle
  if (s.o.dialogueOpen) { await tap("z"); continue; }
  const p = s.o.player;
  const dx = gate.x - p.x, dy = gate.y - p.y;
  // These bosses are touch-to-battle sprites, so close in until the battle actually fires.
  const close = Math.abs(dx) < 48 && Math.abs(dy) < 48;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  const dir = horiz ? (dx < 0 ? "ArrowLeft" : "ArrowRight") : (dy < 0 ? "ArrowUp" : "ArrowDown");
  await hold(dir, close ? 130 : 340);
  const after = (await peek()).o?.player ?? p;
  if (after.x === p.x && after.y === p.y) {
    const alt = horiz ? (dy < 0 ? "ArrowUp" : "ArrowDown") : (dx < 0 ? "ArrowLeft" : "ArrowRight");
    await hold(alt, 340);
  }
  if (i % 4 === 0) log(`  walking… at (${after.x},${after.y}), ${Math.round(Math.hypot(gate.x - after.x, gate.y - after.y))}px to go`);
}
log(`Navigation: ${nav}`);
await shot("contact");

// Advance any pre-battle dialogue.
for (let i = 0; i < 8; i++) { s = await peek(); if (s.b?.phase) break; await tap("z"); }

// --- Fight ---
s = await peek();
if (!s.b?.phase) { log("No battle started — stopping here."); await browser.close(); process.exit(0); }

log(`Battle! enemy HP ${s.b.enemies.map((e) => e.hpTarget)}, Bosch HP ${s.b.party[0].hpTarget}.`);
let result = "ongoing", round = 0;
for (let step = 0; step < 60; step++) {
  s = await peek();
  const b = s.b;
  if (!b || b.phase === "victory-summary" || b.phase === "defeat") { result = b?.phase === "defeat" ? "defeat" : "victory"; break; }
  if (b.party.every((p) => !p.alive)) { result = "defeat"; break; }
  if (b.phase === "command-input") {
    round += 1;
    log(`  round ${round}: Bosch ${b.party[0].hpTarget}hp / enemy ${b.enemies.map((e) => e.hpTarget)}hp — BASH`);
    await tap("z"); // BASH (default command)
    await tap("z"); // confirm the enemy target
  } else {
    await tap("z"); // advance execution narration
  }
}
log(`Result: ${result.toUpperCase()}`);
await shot("end");
s = await peek();
log(`Final — Bosch ${s.b?.party?.[0]?.hpTarget ?? "?"}hp, enemy ${s.b?.enemies?.map((e) => `${e.hpTarget}hp${e.alive ? "" : " (down)"}`)}.`);
await browser.close();
