/**
 * Autonomous playtest driver for the fleet of test subagents.
 *
 * Drives the game in a headless browser against the dev server and reports
 * structured ANOMALIES (JS errors, crashes, softlocks, stuck/boxed states,
 * invalid state, void-walks). Each tester agent runs this for one scenario,
 * then reasons over the output + screenshots and files confirmed bug findings.
 *
 * Usage:
 *   node scripts/playtest-driver.mjs --scenario '<json>' --out <dir> [--base http://127.0.0.1:5176/]
 * Scenario JSON:
 *   { "id":"...", "mode":"explore|battle|script|menu",
 *     "spawn":"x,y"?, "flags":"a,b"?, "nointro":true?,
 *     "steps":N?, "seed":N?,
 *     "battle":{ "group":N, "party":"0,1", "items":"159,153", "psi":"all", "advantage":"normal" }?,
 *     "actions":[ {do:"move",dir:"up",ms:400}, {do:"tap",key:"z"}, {do:"interact"}, {do:"menu"}, {do:"wait",ms:300}, {do:"snapshot"} ]? }
 *
 * Prints exactly one line:  RESULT_JSON:<json>
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { findPath, nearestOpen } from "./route.mjs";

const args = parseArgs(process.argv.slice(2));
const scenario = JSON.parse(args.scenario ?? "{}");
const BASE = (args.base ?? "http://127.0.0.1:5176/").replace(/\/?$/, "/");
const OUT = args.out ?? "/tmp/playtest";
mkdirSync(OUT, { recursive: true });
const SID = (scenario.id ?? "s").replace(/[^a-z0-9_-]/gi, "_");

const anomalies = [];
const jsErrors = [];
const screenshots = [];
let shotN = 0;

function add(type, detail, extra = {}) {
  anomalies.push({ type, detail, ...extra });
}

// Deterministic PRNG (Math.random is fine here, but seed-stable helps repro).
let seed = (scenario.seed ?? 1234) >>> 0;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const main = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => {
    jsErrors.push(String(e.message).slice(0, 300));
    add("jsError", String(e.message).slice(0, 300));
    process.stderr.write("STACKDUMP_BEGIN\n" + String(e.stack || e.message).slice(0, 1500) + "\nSTACKDUMP_END\n");
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text();
      // Ignore noisy expected warnings (music cue unavailable, favicon, font CDN).
      if (/staying silent|favicon|Pixelify|net::ERR/i.test(t)) return;
      jsErrors.push(t.slice(0, 300));
      add("consoleError", t.slice(0, 300));
    }
  });

  const url = BASE + "?" + buildQuery(scenario);
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    add("loadFailed", String(e).slice(0, 200), { url });
    await finish(browser, page);
    return;
  }

  // wait for a scene
  let booted = false;
  for (let i = 0; i < 60; i++) {
    const m = await dbg(page, "mode");
    if (m && m !== "error") { booted = true; break; }
    if (m === "error") { add("bootError", "scene booted into error mode"); break; }
    await page.waitForTimeout(200);
  }
  if (!booted) {
    add("noBoot", "scene never booted to a playable mode");
    await shot(page, "noboot");
    await finish(browser, page);
    return;
  }
  await page.waitForTimeout(500);
  await page.mouse.click(256, 224); // focus canvas
  await page.waitForTimeout(120);

  try {
    if (scenario.mode === "battle") await runBattle(page);
    else if (scenario.mode === "script") await runScript(page);
    else if (scenario.mode === "menu") await runMenu(page);
    else if (scenario.mode === "saveload") await runSaveLoad(page);
    else if (scenario.mode === "shop") await runShop(page);
    else if (scenario.mode === "trigger") await runTrigger(page);
    else if (scenario.mode === "door") await runDoor(page);
    else if (scenario.mode === "equip") await runEquip(page);
    else if (scenario.mode === "cutscene") await runCutscene(page);
    else await runExplore(page);
  } catch (e) {
    add("driverError", String(e).slice(0, 200));
  }

  await checkState(page, "end");
  await shot(page, "final");
  await finish(browser, page);
};

function buildQuery(s) {
  const q = [];
  if (s.nointro !== false) q.push("nointro=1");
  if (s.spawn) q.push("spawn=" + s.spawn);
  if (s.flags) q.push("flags=" + s.flags);
  if (s.mode === "battle" && s.battle) {
    q.push("battle=" + s.battle.group);
    if (s.battle.party) q.push("party=" + s.battle.party);
    if (s.battle.items) q.push("items=" + s.battle.items);
    if (s.battle.psi) q.push("psi=" + s.battle.psi);
    if (s.battle.advantage) q.push("advantage=" + s.battle.advantage);
  }
  return q.join("&");
}

const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

async function dbg(page, key) {
  return page.evaluate((k) => {
    const d = globalThis.__firstSceneDebug;
    return d ? (k ? d[k] : d) : null;
  }, key);
}
async function snap(page) {
  return page.evaluate(() => {
    const d = globalThis.__firstSceneDebug || {};
    const b = globalThis.__battleDebug || null;
    const ps = d.partyState || {};
    return {
      mode: d.mode, x: d.player?.x, y: d.player?.y, locked: d.inputLocked,
      dlg: d.dialogueOpen, menu: d.menu?.open ?? d.menuOpen, shop: d.shopOpen,
      inRange: d.inInteractionRange, cue: d.musicCue, sector: d.currentSectorIndex,
      bounds: d.movementBounds, battle: b ? { phase: b.phase, command: b.command } : null,
      flags: Array.isArray(d.flags) ? [...d.flags].sort() : [],
      wallet: ps.wallet, bank: ps.bank, invItems: ps.inventoryItems, partyCount: ps.partyCount,
      doorFade: d.doorFadeActive, lastDoor: d.lastDoor
    };
  });
}
async function shot(page, tag) {
  const p = `${OUT}/${SID}-${String(shotN++).padStart(2, "0")}-${tag}.png`;
  try { await page.screenshot({ path: p }); screenshots.push(p); } catch {}
  return p;
}
async function hold(page, dir, ms) {
  await page.keyboard.down(KEYS[dir]); await page.waitForTimeout(ms); await page.keyboard.up(KEYS[dir]); await page.waitForTimeout(60);
}
async function tap(page, key, ms = 180) { await page.keyboard.press(key); await page.waitForTimeout(ms); }

async function checkState(page, where) {
  const s = await snap(page);
  if (s.mode === "error" || s.mode === "fallback") add("crash", `mode=${s.mode}`, { where });
  if (s.x != null && (!Number.isFinite(s.x) || !Number.isFinite(s.y))) add("invalidPos", `x=${s.x} y=${s.y}`, { where });
  if (s.bounds && s.x != null) {
    const m = 40;
    if (s.x < s.bounds.minX - m || s.x > s.bounds.maxX + m || s.y < s.bounds.minY - m || s.y > s.bounds.maxY + m)
      add("outOfBounds", `pos(${Math.round(s.x)},${Math.round(s.y)}) vs bounds`, { where, bounds: s.bounds });
  }
  return s;
}

let everMoved = false; // gate stuck/boxed reports: only real if the player proved mobile first

async function runExplore(page) {
  const steps = scenario.steps ?? 60;
  let prev = await snap(page);
  let stuckRun = 0;
  for (let i = 0; i < steps; i++) {
    const roll = rand();
    if (roll < 0.62) {
      const dir = pick(["up", "down", "left", "right"]);
      await hold(page, dir, 220 + Math.floor(rand() * 260));
    } else if (roll < 0.8) {
      await tap(page, "z"); // interact / advance
    } else if (roll < 0.9) {
      // open + close menu
      await tap(page, "m", 250); await tap(page, "x", 200); await tap(page, "Escape", 150);
    } else {
      await tap(page, "Enter", 150);
    }
    const s = await checkState(page, `explore#${i}`);
    if (s.mode === "battle" || s.battle) { await runBattle(page); }
    // stuck/boxed detection: player not moving across several move-heavy steps
    if (s.x != null && prev.x != null) {
      const moved = Math.hypot((s.x ?? 0) - (prev.x ?? 0), (s.y ?? 0) - (prev.y ?? 0));
      if (moved > 1) everMoved = true;
      if (moved < 1 && !s.dlg && !s.menu && !s.locked) stuckRun++; else stuckRun = 0;
      if (stuckRun === 12) {
        if (everMoved) { add("possiblyStuck", `stopped moving for ${stuckRun} steps at (${Math.round(s.x)},${Math.round(s.y)})`, { where: `explore#${i}` }); await boxedCheck(page); }
        else { add("deadSpawn", `never moved from spawn (${Math.round(s.x)},${Math.round(s.y)}) — likely an unwalkable test spawn, not a gameplay bug`, { where: `explore#${i}`, severity: "low" }); break; }
      }
    }
    if (jsErrors.length > 6) break;
    prev = s;
  }
}

// Confirm a hard box-in: try all 4 dirs from current spot, report if none move.
async function boxedCheck(page) {
  const start = await snap(page);
  if (start.x == null) return;
  let best = 0;
  for (const d of ["up", "down", "left", "right"]) {
    await hold(page, d, 350);
    const s = await snap(page);
    best = Math.max(best, Math.hypot((s.x ?? 0) - (start.x ?? 0), (s.y ?? 0) - (start.y ?? 0)));
    if (best > 6) break;
  }
  if (best <= 6 && !start.dlg && !start.menu && !start.locked && everMoved) {
    add("boxedIn", `walked to (${Math.round(start.x)},${Math.round(start.y)}) then could not move ANY direction`, { where: "boxedCheck" });
    await shot(page, "boxed");
  }
}

async function runMenu(page) {
  await tap(page, "m", 300);
  await shot(page, "menu-open");
  // walk every row + into submenus
  for (let i = 0; i < 18; i++) {
    await tap(page, "ArrowDown", 120);
    await tap(page, "z", 160);
    const s = await snap(page);
    if (s.mode === "error") { add("crash", "menu navigation crashed", { where: `menu#${i}` }); break; }
    await tap(page, "x", 120);
  }
  await tap(page, "x", 150); await tap(page, "Escape", 150);
  const s = await snap(page);
  if (s.menu) add("menuStuck", "menu did not close after Escape/cancel", { where: "menu" });
}

async function runBattle(page) {
  const deadline = Date.now() + 45000;
  let lastPhase = null, samePhase = 0, rounds = 0;
  for (let i = 0; i < 120 && Date.now() < deadline; i++) {
    const b = await page.evaluate(() => globalThis.__battleDebug || null);
    if (!b || !b.phase) { // battle ended
      if (i > 0) return;
      await page.waitForTimeout(300); continue;
    }
    if (["win", "lose", "flee", "result", "ended", "exit-transition"].includes(b.phase)) {
      await tap(page, "z", 200); return;
    }
    if (b.phase === lastPhase) samePhase++; else { samePhase = 0; rounds++; }
    lastPhase = b.phase;
    if (samePhase > 40) { add("battleSoftlock", `battle phase '${b.phase}' stuck >40 inputs`, { where: "battle" }); await shot(page, "battle-stuck"); return; }
    if (b.phase === "command-input") {
      // simple AI: mostly BASH, sometimes defend/item
      const r = rand();
      if (r < 0.7) { await tap(page, "z", 160); await tap(page, "z", 220); } // bash + confirm target
      else if (r < 0.85) { await tap(page, "ArrowDown", 120); await tap(page, "z", 200); }
      else { await tap(page, "ArrowRight", 120); await tap(page, "z", 200); }
    } else {
      await tap(page, "z", 200);
    }
  }
  const b = await page.evaluate(() => globalThis.__battleDebug || null);
  if (b && b.phase && !["win","lose","flee"].includes(b.phase)) add("battleTimeout", `battle did not resolve in 45s (phase=${b.phase})`, { where: "battle" });
}

async function runScript(page) {
  const actions = scenario.actions ?? [];
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.do === "move") await hold(page, a.dir, a.ms ?? 350);
    else if (a.do === "tap") await tap(page, a.key, a.ms ?? 180);
    else if (a.do === "interact") { await tap(page, "z", 250); await tap(page, "z", 220); }
    else if (a.do === "menu") await runMenu(page);
    else if (a.do === "battle") await runBattle(page);
    else if (a.do === "wait") await page.waitForTimeout(a.ms ?? 300);
    else if (a.do === "snapshot") await shot(page, `script#${i}`);
    const s = await checkState(page, `script#${i}:${a.do}`);
    if (s.battle) await runBattle(page);
  }
}

// A* walk to (tx,ty) using the game's own collision (__solidAt), like act1.mjs.
// Returns the final snapshot. Bails early on transition (fade)/battle/dialogue.
async function astarWalkTo(page, tx, ty, opts = {}) {
  const step = 8, M = 96;
  const s0 = await snap(page);
  if (s0.x == null) return s0;
  const x0 = Math.min(s0.x, tx) - M, y0 = Math.min(s0.y, ty) - M, x1 = Math.max(s0.x, tx) + M, y1 = Math.max(s0.y, ty) + M;
  const grid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt; if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1, rows = Math.floor((y1 - y0) / step) + 1;
    const g = []; for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < cols; c++) row.push(fn(x0 + c * step, y0 + r * step) ? 1 : 0); g.push(row); }
    return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  if (!grid) return s0;
  const blocked = grid.g.map((row) => row.map((v) => v === 1));
  const w2c = (x, y) => [Math.round((x - x0) / step), Math.round((y - y0) / step)];
  const start = nearestOpen(blocked, grid.cols, grid.rows, ...w2c(s0.x, s0.y));
  const goal = nearestOpen(blocked, grid.cols, grid.rows, ...w2c(tx, ty));
  const path = start && goal && findPath(blocked, grid.cols, grid.rows, start, goal);
  if (!path || !path.length) return s0;
  for (let i = 1; i < path.length; i++) {
    const wx = x0 + path[i].c * step, wy = y0 + path[i].r * step;
    // step toward this waypoint; if the dominant axis is blocked, take the other axis.
    for (let k = 0; k < 8; k++) {
      const s = await snap(page);
      if (s.doorFade || s.battle || (opts.stopOnDialogue && s.dlg)) return s;
      const dx = wx - (s.x ?? wx), dy = wy - (s.y ?? wy);
      if (Math.hypot(dx, dy) < 7) break;
      const primary = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      const secondary = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? "down" : "up") : (dx > 0 ? "right" : "left");
      const bx = s.x ?? 0, by = s.y ?? 0;
      await hold(page, primary, 120);
      const a = await snap(page);
      // primary made no progress AND the other axis still needs distance -> try it
      if (Math.hypot((a.x ?? bx) - bx, (a.y ?? by) - by) < 2 && Math.abs(Math.abs(dx) > Math.abs(dy) ? dy : dx) > 4) {
        await hold(page, secondary, 120);
      }
    }
  }
  return snap(page);
}

async function walkToward(page, tx, ty, maxIters = 14) {
  for (let i = 0; i < maxIters; i++) {
    const s = await snap(page);
    if (s.x == null) return s;
    const dx = tx - s.x, dy = ty - s.y;
    if (Math.hypot(dx, dy) < 22) return s;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    await hold(page, dir, 200);
    if (s.dlg || s.battle) return s; // bumped into something interactive
  }
  return snap(page);
}

// SAVE/LOAD: change state, press P to save, reload, verify state restored.
async function runSaveLoad(page) {
  // Save at the (distinct) spawn immediately. We deliberately do NOT walk first:
  // movement can bump a door/NPC (warp or dialogue) which suppresses the P-save and
  // muddies the restore comparison. The distinct spawn already makes a failed restore
  // (which would land on the default start) detectable.
  const pre = await snap(page);
  if (pre.dlg || pre.menu || pre.locked) { add("saveBlockedAtSpawn", `cannot save at spawn (dlg/menu/locked) — spawn may be on a trigger`, { where: "saveload", severity: "low" }); return; }
  await tap(page, "p", 350); // save (keydown-P)
  const before = await snap(page);
  await page.waitForTimeout(250);
  // reload into the saved slot (no spawn/flags overrides this time)
  try {
    await page.goto(BASE + "?nointro=1", { waitUntil: "load", timeout: 30000 });
  } catch (e) { add("reloadFailed", String(e).slice(0, 160)); return; }
  let booted = false;
  for (let i = 0; i < 60; i++) { const m = await dbg(page, "mode"); if (m && m !== "error") { booted = true; break; } await page.waitForTimeout(200); }
  if (!booted) { add("crashOnLoad", "scene did not boot after reload-from-save"); return; }
  await page.waitForTimeout(700);
  const after = await snap(page);
  if (after.mode === "error" || after.mode === "fallback") { add("crashOnLoad", `mode=${after.mode} after load`); return; }
  if (before.x != null && after.x != null) {
    const d = Math.hypot(after.x - before.x, after.y - before.y);
    if (d > 40) add("savePositionNotRestored", `saved (${Math.round(before.x)},${Math.round(before.y)}) but loaded at (${Math.round(after.x)},${Math.round(after.y)}) (Δ${Math.round(d)}px)`, { where: "saveload" });
  }
  const bf = new Set(before.flags), af = new Set(after.flags);
  const missing = [...bf].filter((f) => !af.has(f));
  if (missing.length) add("saveFlagsNotRestored", `flags lost on load: ${missing.slice(0, 6).join(",")}`, { where: "saveload" });
  if (before.wallet != null && after.wallet !== before.wallet) add("saveMoneyNotRestored", `wallet saved=${before.wallet} loaded=${after.wallet}`, { where: "saveload", severity: "low" });
  await shot(page, "afterload");
}

// SHOP: walk to a clerk, open shop, attempt buy/sell, exit. Best-effort; flags softlocks/crashes/negative money.
async function runShop(page) {
  const clerk = scenario.clerk || {};
  if (clerk.x != null) await walkToward(page, clerk.x, clerk.y);
  let opened = false;
  for (let i = 0; i < 4 && !opened; i++) {
    // face each direction then interact, to catch the clerk
    await tap(page, "z", 260);
    const s = await snap(page);
    if (s.shop || s.dlg) opened = true;
    if (!opened) await hold(page, ["up", "right", "down", "left"][i], 120);
  }
  // advance any opening dialogue toward the shop menu
  for (let i = 0; i < 5; i++) { const s = await snap(page); if (s.shop) break; await tap(page, "z", 200); }
  const inShop = (await snap(page)).shop;
  if (!inShop) { add("shopWontOpen", `could not open shop ${clerk.storeId} at clerk (${clerk.x},${clerk.y}) — may be positioning, verify`, { where: "shop", severity: "low" }); return; }
  await shot(page, "shop-open");
  // Buy: enter Buy, pick an item, confirm through quantity/confirm prompts
  await tap(page, "z", 220); // select Buy (first option)
  for (let i = 0; i < 6; i++) await tap(page, "z", 180); // push through item/quantity/confirm
  let s = await snap(page);
  if (s.wallet != null && s.wallet < 0) add("shopMoneyNegative", `wallet went negative (${s.wallet}) after buy in shop ${clerk.storeId}`, { where: "shop", severity: "high" });
  // back out of the shop entirely
  for (let i = 0; i < 8; i++) { await tap(page, "x", 150); await tap(page, "Escape", 120); if (!(await snap(page)).shop) break; }
  s = await snap(page);
  if (s.shop) { add("cantExitShop", `shop ${clerk.storeId} would not close after repeated cancel`, { where: "shop", severity: "high" }); await shot(page, "shop-stuck"); }
  else if (s.locked && !s.dlg && !s.menu) add("shopLeftLocked", `input still locked after leaving shop ${clerk.storeId}`, { where: "shop", severity: "high" });
}

// TRIGGER GATING: walk into a story/boss trigger; assert it fires (or stays gated) as expected.
async function runTrigger(page) {
  const t = scenario.trigger || {};
  const startFlags = new Set((await snap(page)).flags);
  await walkToward(page, t.x, t.y, 16);
  // linger a moment for the trigger/collision to fire
  for (let i = 0; i < 6; i++) { await hold(page, t.approach || "up", 160); const s = await snap(page); if (s.battle || s.dlg) break; }
  const s = await snap(page);
  const fired = Boolean(s.battle) || Boolean(s.dlg) || [...new Set(s.flags)].some((f) => !startFlags.has(f));
  const expect = scenario.expectFire;
  if (expect === true && !fired) add("triggerDidNotFire", `expected trigger '${t.id}' to fire (conditions met) but nothing happened at (${t.x},${t.y})`, { where: "trigger", severity: "high" });
  if (expect === false && fired) add("triggerFiredWhenGated", `trigger '${t.id}' fired but should be gated (requireFlags unmet / blocked)`, { where: "trigger", severity: "high" });
  if (s.battle) await runBattle(page);
}

// DOOR: walk into a door, assert a transition fires, you're not boxed in after, and you can leave.
// Exhaustive per-door solver: a door tile is solid; the walkable approach can be on
// ANY side. Probe __solidAt for every walkable neighbour, then A* to each and push
// into the door. Only flag a DEAD door if EVERY walkable approach fails to transition.
async function runDoor(page) {
  const door = scenario.door || {};
  const start = await snap(page);
  if (start.x == null) { add("noBoot", "no player for door test"); return; }
  const startSector = start.sector, startX = start.x, startY = start.y;
  // Probe walkable neighbours of the door tile, scanning out a few tiles per side so
  // we find the real doorstep even when the immediate neighbour is also wall.
  const probe = await page.evaluate(({ x, y }) => {
    const f = globalThis.__solidAt; if (!f) return null;
    const open = (px, py) => !f(px, py);
    const find = (dx, dy) => { for (let d = 8; d <= 32; d += 8) { if (open(x + dx * d, y + dy * d)) return d; } return 0; };
    return { N: find(0, -1), S: find(0, 1), W: find(-1, 0), E: find(1, 0) };
  }, { x: door.x, y: door.y });
  if (!probe) { add("noSolidProbe", "__solidAt unavailable for door test"); return; }
  const approaches = [];
  if (probe.N) approaches.push({ name: "N", sx: door.x, sy: door.y - probe.N, into: "down" });
  if (probe.S) approaches.push({ name: "S", sx: door.x, sy: door.y + probe.S, into: "up" });
  if (probe.W) approaches.push({ name: "W", sx: door.x - probe.W, sy: door.y, into: "right" });
  if (probe.E) approaches.push({ name: "E", sx: door.x + probe.E, sy: door.y, into: "left" });
  if (approaches.length === 0) { add("doorWalledOff", `door (${door.x},${door.y}) has no walkable tile within 32px (decorative/unreachable)`, { where: "door", severity: "low" }); return; }

  // Re-spawn AT each doorstep and step into the door. Spawning on the walkable
  // approach removes all navigation uncertainty — the only thing under test is the door.
  let entered = false, used = null;
  for (const ap of approaches) {
    try { await page.goto(BASE + `?nointro=1&spawn=${ap.sx},${ap.sy}`, { waitUntil: "load", timeout: 30000 }); } catch { continue; }
    let ok = false;
    for (let i = 0; i < 40; i++) { const m = await dbg(page, "mode"); if (m && m !== "error") { ok = true; break; } await page.waitForTimeout(150); }
    if (!ok) continue;
    await page.waitForTimeout(400); await page.mouse.click(256, 224); await page.waitForTimeout(80);
    const sStart = await snap(page);
    for (let k = 0; k < 6 && !entered; k++) {
      await hold(page, ap.into, 200);
      const s = await snap(page);
      if (s.battle) { await runBattle(page); break; }
      if (s.doorFade || (s.sector != null && s.sector !== sStart.sector) || Math.hypot((s.x ?? sStart.x) - sStart.x, (s.y ?? sStart.y) - sStart.y) > 200) entered = true;
    }
    if (entered) { used = ap.name; break; }
  }

  if (!entered) {
    add("doorDead", `door (${door.x},${door.y}) did not transition from ANY walkable approach [${approaches.map((a) => a.name + a.sx + ":" + a.sy).join(" ")}]`, { where: "door", severity: "high" });
    await shot(page, "door-dead");
    return;
  }
  await page.waitForTimeout(800);
  if ((await snap(page)).doorFade) { await page.waitForTimeout(1600); if ((await snap(page)).doorFade) { add("doorFadeStuck", `door (${door.x},${door.y}) fade never completed`, { where: "door", severity: "high" }); await shot(page, "door-fade-stuck"); return; } }
  everMoved = true; await boxedCheck(page);
}

// EQUIP/MENU: open menu, walk every screen, equip/unequip, use a good, watch for crash/softlock/no-effect.
async function runEquip(page) {
  await tap(page, "m", 320);
  if (!(await snap(page)).menu) { add("menuWontOpen", "menu did not open on M", { where: "equip", severity: "med" }); return; }
  await shot(page, "menu");
  // Equip is the 4th top-level row (Talk,Goods,PSI,Equip,Check,Status) -> down x3
  const before = await snap(page);
  for (let r = 0; r < 6; r++) {
    // navigate to row r, enter, poke first few items, back out
    await tap(page, "x", 120); await tap(page, "Escape", 120); // ensure top level
    for (let k = 0; k < r; k++) await tap(page, "ArrowDown", 110);
    await tap(page, "z", 220); // enter screen
    let s = await snap(page);
    if (s.mode === "error") { add("crash", `menu screen row ${r} crashed`, { where: "equip", severity: "high" }); return; }
    // poke a couple of items/rows with confirm (equip/use/select a character)
    for (let k = 0; k < 4; k++) { await tap(page, "z", 180); s = await snap(page); if (s.mode === "error") { add("crash", `menu action row ${r} crashed`, { where: "equip", severity: "high" }); return; } if (s.wallet != null && s.wallet < 0) add("menuMoneyNegative", `wallet negative after menu actions`, { where: "equip", severity: "high" }); }
    // back out to top
    for (let k = 0; k < 4; k++) await tap(page, "x", 110);
  }
  // close menu
  for (let i = 0; i < 5; i++) { await tap(page, "x", 110); await tap(page, "Escape", 110); if (!(await snap(page)).menu) break; }
  const after = await snap(page);
  if (after.menu) add("menuStuck", "menu would not close after equip/use stress", { where: "equip", severity: "high" });
  else if (after.locked && !after.dlg) add("menuLeftLocked", "input locked after closing menu", { where: "equip", severity: "high" });
}

// CUTSCENE: walk into the trigger area; assert the scene fires (player locks / NPCs move)
// and COMPLETES (player unlocks) without softlocking.
async function runCutscene(page) {
  const cs = scenario.cutscene || {};
  await astarWalkTo(page, cs.x, cs.y);
  // nudge into the area
  let fired = false;
  for (let i = 0; i < 8; i++) {
    await hold(page, cs.approach || "up", 180);
    const s = await snap(page);
    if (s.locked || s.dlg) { fired = true; break; }
  }
  if (!fired) { add("cutsceneNoFire", `entered area for '${cs.id}' but it never started (player never locked) — may be once:true already-fired or area miss`, { where: "cutscene", severity: "low" }); return; }
  await shot(page, "cutscene-mid");
  // wait for completion (unlock); advance any dialogue
  let done = false;
  for (let i = 0; i < 40; i++) {
    const s = await snap(page);
    if (!s.locked && !s.dlg) { done = true; break; }
    if (s.dlg) await tap(page, "z", 200); else await page.waitForTimeout(300);
  }
  if (!done) { add("cutsceneSoftlock", `cutscene '${cs.id}' did not release the player within ~12s (possible softlock)`, { where: "cutscene", severity: "high" }); await shot(page, "cutscene-stuck"); return; }
  // after completion the player must be able to move
  everMoved = true; await boxedCheck(page);
}

async function finish(browser, page) {
  try { await browser.close(); } catch {}
  const result = {
    scenario: { id: scenario.id, mode: scenario.mode, focus: scenario.focus ?? null },
    anomalyCount: anomalies.length,
    jsErrorCount: jsErrors.length,
    anomalies: anomalies.slice(0, 40),
    screenshots,
    ok: anomalies.length === 0
  };
  process.stdout.write("RESULT_JSON:" + JSON.stringify(result) + "\n");
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { o[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return o;
}

await main();
