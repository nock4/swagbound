#!/usr/bin/env node
/**
 * Full-arc BALANCE autorun for Swagbound.
 *
 * Drives the real game from a fresh ?nointro new-game state through the authored
 * story trigger graph, records route and battle telemetry, and force-advances
 * wall objectives after bounded retries so one pass maps the whole arc.
 *
 * Run: node scripts/arc-runner.mjs [baseUrl] [--max-objectives=N] [--spawn=x,y]
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { findPath, nearestOpen } from "./route.mjs";

const root = new URL("../", import.meta.url);
const world = JSON.parse(readFileSync(new URL("apps/game/public/generated/world.json", root), "utf8"));
const charactersData = JSON.parse(readFileSync(new URL("apps/game/public/generated/characters.json", root), "utf8"));
const triggerData = JSON.parse(readFileSync(new URL("content/triggers.json", root), "utf8"));
const cutsceneData = JSON.parse(readFileSync(new URL("content/cutscenes.json", root), "utf8"));
const archivistData = JSON.parse(readFileSync(new URL("content/archivist-spots.json", root), "utf8"));

const DEFAULT_BASE = "http://127.0.0.1:5173/";
const TELEMETRY_PATH = new URL("tmp/arc-telemetry.json", root);
const GRID_STEP = 8;
const ROUTE_MARGIN = 320;
const MAX_OBJECTIVE_ATTEMPTS = 3;
const WALL_ROUND_LIMIT = 25;
const TRIVIAL_ROUND_LIMIT = 4;
const HP_PRESSURE_FRACTION = 0.75;
const DEFEND_FRACTION = 0.4;
const AUDIT_RADIUS_PX = 300;
const DOOR_WARP_UNIT_PX = 8;
const MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX = 24;
const DEBUG_HOOK_SETTLE_TIMEOUT_MS = 10000;
const DOORS = (world.doors ?? []).map(normalizeDoorForRunner).filter(Boolean);
const HOP_DOORS = DOORS.filter((door) => !isMessageDoorForRunner(door));

const cli = parseArgs(process.argv.slice(2));
const BASE = cli.base;
const startedAt = new Date().toISOString();
const startMs = performance.now();
let activeObjectiveId = null;
let routeSampleSeq = 0;
let lastRouteSample = null;
const knownLevels = new Map((charactersData.characters ?? []).map((member) => [member.id, member.level]));

const triggerFiredFlag = (id) => `trigger:${id}`;
const isOnce = (trigger) => trigger.once ?? true;
const log = (...args) => console.log(...args);
const round = (value) => Math.round(Number(value) || 0);
const dist = (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
const rectCenter = (area) => ({ x: area.x + area.w / 2, y: area.y + area.h / 2 });
const pointInArea = (point, area) => (
  point.x >= area.x &&
  point.x < area.x + area.w &&
  point.y >= area.y &&
  point.y < area.y + area.h
);

const OPTIONAL_ID = /^(correction-|fuel-|arena-optional)/;
const objectiveTriggers = triggerData.triggers
  .map((trigger, index) => ({ ...trigger, __index: index }))
  .filter(isStoryObjective)
  .filter((trigger) => !OPTIONAL_ID.test(trigger.id ?? "")
    && !(trigger.setFlags ?? []).every((f) => f.startsWith("fuel:")) || (trigger.setFlags ?? []).length === 0);

const recruitByTrigger = new Map([
  ["recruit-cloak", { charId: 1, flag: "recruit:cloak", name: "Cloak" }],
  ["recruit-munch", { charId: 2, flag: "recruit:munch", name: "Munch" }],
  ["recruit-knight", { charId: 3, flag: "recruit:knight", name: "Knight" }]
]);

const earnedFlags = new Set();
async function forceFlag(flag) {
  earnedFlags.add(flag);
  await settleDebugHooks(`forceFlag:${flag}`);
  return page.evaluate((storyFlag) => {
    if (typeof globalThis.__setStoryFlag !== "function") return { ok: false, reason: "missing __setStoryFlag" };
    return { ok: true, result: globalThis.__setStoryFlag(storyFlag, true) };
  }, flag);
}

const telemetry = {
  schema: "swagbound.arc-telemetry.v1",
  startedAt,
  baseUrl: BASE,
  options: {
    spawn: cli.spawn ?? null,
    maxObjectives: cli.maxObjectives ?? null,
    noEncounters: cli.noEncounters
  },
  objectiveOrdering: {
    method: "At each step, read live __firstSceneDebug.flags; choose the first authored non-archivist story trigger whose requireFlags are all present, blockFlags are absent, and once/setFlags are not already satisfied. Declaration order in content/triggers.json breaks ties.",
    objectiveCount: objectiveTriggers.length,
    excluded: ["archivist-photo-* triggers are excluded from play order and audited separately."]
  },
  cheats: [],
  objectives: [],
  battles: [],
  routeLog: [],
  latestFlags: [],
  reachabilityAudit: null,
  summary: null
};

mkdirSync(dirname(TELEMETRY_PATH.pathname), { recursive: true });
flushTelemetry();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });

const peek = () => page.evaluate(() => ({
  o: globalThis.__firstSceneDebug ?? null,
  b: globalThis.__battleDebug ?? null,
  bosses: globalThis.__bossGates ?? null,
  roster: typeof globalThis.__partyRoster === "function" ? globalThis.__partyRoster() : null
}));
const tap = async (key, ms = 220) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
};
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
};

async function main() {
try {
  const boot = new URL(BASE);
  boot.searchParams.set("nointro", "1");
  if (cli.spawn) boot.searchParams.set("spawn", cli.spawn);
  if (cli.noEncounters) boot.searchParams.set("noEncounters", "1");

  log(`[boot] ${boot.toString()}`);
  await page.goto(boot.toString(), { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForFunction(() => globalThis.__firstSceneDebug, { timeout: 30000 });
  await settleDebugHooks("boot");
  await page.waitForTimeout(1500);
  await drainOpeningCutscene();

  log(`[arc] objective graph has ${objectiveTriggers.length} playable story triggers`);
  for (let step = 0; step < objectiveTriggers.length + 12; step += 1) {
    const flags = await currentFlags();
    if (flags.includes("game:complete")) {
      log("[arc] game:complete reached");
      break;
    }
    if (cli.maxObjectives !== null && telemetry.objectives.length >= cli.maxObjectives) {
      log(`[arc] max objective slice reached (${cli.maxObjectives})`);
      break;
    }

    // Defeat recovery: a party wipe reloads the autosave and REVERTS flags.
    // Re-assert everything this run already earned/forced (logged, not a wall).
    const missing = [...earnedFlags].filter((f) => !flags.includes(f));
    if (missing.length > 0) {
      log(`  [RECOVER] flag regression detected (${missing.length} lost, e.g. ${missing[0]}); re-asserting`);
      telemetry.cheats.push({ kind: "defeat-recovery", count: missing.length, atMs: elapsedMs() });
      for (const f of missing) await forceFlag(f);
      continue;
    }
    const objective = nextObjective(flags);
    if (!objective) {
      log(`[arc] no next objective; flags=[${flags.join(",")}]`);
      break;
    }
    await runObjective(objective, telemetry.objectives.length + 1);
    const after = await currentFlags();
    for (const f of after) earnedFlags.add(f);
  }
} finally {
  telemetry.summary = buildSummary();
  flushTelemetry();
  await browser.close();
}
}

function parseArgs(args) {
  let base = DEFAULT_BASE;
  let spawn = null;
  let maxObjectives = null;
  let noEncounters = false;
  for (const arg of args) {
    if (arg.startsWith("--max-objectives=")) {
      maxObjectives = Math.max(0, Number.parseInt(arg.slice("--max-objectives=".length), 10));
    } else if (arg === "--smoke") {
      maxObjectives = 1;
    } else if (arg.startsWith("--spawn=")) {
      spawn = arg.slice("--spawn=".length);
    } else if (arg === "--no-encounters") {
      noEncounters = true;
    } else if (!arg.startsWith("--")) {
      base = arg;
    }
  }
  if (!base.endsWith("/")) base += "/";
  return { base, spawn, maxObjectives, noEncounters };
}

function isStoryObjective(trigger) {
  if (!trigger?.id || trigger.id.startsWith("archivist-photo-")) {
    return false;
  }
  if (!trigger.boss && !trigger.area) {
    return false;
  }
  if (trigger.boss || (trigger.setFlags?.length ?? 0) > 0 || (trigger.grantItems?.length ?? 0) > 0) {
    return true;
  }
  return trigger.id.endsWith("-reveal");
}

function nextObjective(flags) {
  const flagSet = new Set(flags);
  return objectiveTriggers.find((trigger) => triggerReady(trigger, flagSet));
}

function triggerReady(trigger, flagSet) {
  if (isOnce(trigger) && flagSet.has(triggerFiredFlag(trigger.id))) {
    return false;
  }
  if ((trigger.requireFlags ?? []).some((flag) => !flagSet.has(flag))) {
    return false;
  }
  if ((trigger.blockFlags ?? []).some((flag) => flagSet.has(flag))) {
    return false;
  }
  const setFlags = trigger.setFlags ?? [];
  if (setFlags.length > 0 && setFlags.every((flag) => flagSet.has(flag))) {
    return false;
  }
  return true;
}

function objectiveDone(trigger, flags) {
  const flagSet = new Set(flags);
  const setFlags = trigger.setFlags ?? [];
  if (setFlags.length > 0 && setFlags.every((flag) => flagSet.has(flag))) {
    return true;
  }
  return isOnce(trigger) && flagSet.has(triggerFiredFlag(trigger.id));
}

function targetFor(trigger) {
  if (trigger.boss) return { x: trigger.boss.x, y: trigger.boss.y };
  return rectCenter(trigger.area);
}

async function runObjective(trigger, ordinal) {
  activeObjectiveId = trigger.id;
  const target = targetFor(trigger);
  const entry = {
    ordinal,
    id: trigger.id,
    kind: trigger.boss ? "boss" : "area",
    battleGroup: trigger.battleGroup ?? null,
    requireFlags: trigger.requireFlags ?? [],
    setFlags: trigger.setFlags ?? [],
    startedAtMs: elapsedMs(),
    target: { x: round(target.x), y: round(target.y) },
    attempts: [],
    battles: [],
    cheats: [],
    routeLengthPx: 0,
    routeCells: 0,
    walkingTimeMs: 0,
    unreachableRoutes: [],
    doorWarps: [],
    completed: false,
    wall: null,
    finishedAtMs: null
  };
  telemetry.objectives.push(entry);
  flushTelemetry();

  log(`\n[objective ${ordinal}] ${entry.kind} ${trigger.id} -> (${round(target.x)},${round(target.y)})`);
  for (let attempt = 1; attempt <= MAX_OBJECTIVE_ATTEMPTS && !entry.completed; attempt += 1) {
    const attemptEntry = {
      attempt,
      startedAtMs: elapsedMs(),
      flagsBefore: await currentFlags(),
      routeLengthPx: 0,
      routeCells: 0,
      walkingTimeMs: 0,
      unreachableRoutes: [],
      doorWarps: [],
      status: "started",
      completedFlags: [],
      finishedAtMs: null
    };
    entry.attempts.push(attemptEntry);

    await hotelHeal(trigger.id, entry);
    await settleWorld({ maxPresses: 80, reason: "pre-objective" });

    const routeResult = await routeToTrigger(trigger, target, attemptEntry);
    attemptEntry.status = routeResult.status;
    attemptEntry.walkingTimeMs += routeResult.walkingTimeMs;
    attemptEntry.routeLengthPx += routeResult.routeLengthPx;
    attemptEntry.routeCells += routeResult.routeCells;
    entry.routeLengthPx += attemptEntry.routeLengthPx;
    entry.routeCells += attemptEntry.routeCells;
    entry.walkingTimeMs += attemptEntry.walkingTimeMs;
    entry.unreachableRoutes.push(...attemptEntry.unreachableRoutes);
    entry.doorWarps.push(...attemptEntry.doorWarps);

    if (routeResult.status === "battle" || inBattle(await peek())) {
      const nearTarget = await playerNearTarget(trigger, target, trigger.boss ? 120 : 180);
      const battleId = nearTarget ? trigger.id : `route-interrupt:${trigger.id}`;
      const battle = await fightBattle(battleId, trigger, nearTarget ? "objective" : "route-interrupt");
      entry.battles.push(battle.runId);
      telemetry.battles.push(battle);
      await settleAfterBattle(trigger);
    } else {
      await page.waitForTimeout(350);
      await settleWorld({ maxPresses: 120, reason: "post-route" });
    }

    const afterFlags = await currentFlags();
    attemptEntry.completedFlags = (trigger.setFlags ?? []).filter((flag) => afterFlags.includes(flag));
    attemptEntry.finishedAtMs = elapsedMs();
    entry.completed = objectiveDone(trigger, afterFlags);
    log(`  [objective ${trigger.id}] attempt ${attempt}: ${entry.completed ? "complete" : routeResult.status}; flags=[${afterFlags.join(",")}]`);
    flushTelemetry();
  }

  if (!entry.completed) {
    const wallState = await snapshotWallState();
    entry.wall = {
      reason: "objective-not-completed-after-3-attempts",
      state: wallState,
      forced: []
    };
    log(`  [WALL] ${trigger.id} did not complete after ${MAX_OBJECTIVE_ATTEMPTS} attempts; forcing progression`);
    await forceAdvance(trigger, entry);
    await settleWorld({ maxPresses: 80, reason: "post-force" });
    entry.completed = objectiveDone(trigger, await currentFlags());
  }

  entry.finishedAtMs = elapsedMs();
  activeObjectiveId = null;
  flushTelemetry();
}

async function currentFlags() {
  await settleDebugHooks("flag read");
  const state = await peek();
  recordRouteSample(state);
  const flags = Array.isArray(state.o?.flags) ? [...state.o.flags] : [];
  telemetry.latestFlags = flags;
  return flags;
}

function inBattle(state) {
  const phase = state?.b?.phase;
  return ["enter-transition", "menu", "command-input", "execution", "enemy-rolling", "player-rolling"].includes(phase);
}

async function hotelHeal(objectiveId, objectiveEntry) {
  await settleDebugHooks(`pre-heal:${objectiveId}`);
  const before = await page.evaluate(() => globalThis.__firstSceneDebug?.overworldHud ?? null).catch(() => null);
  const result = await page.evaluate(() => {
    if (typeof globalThis.__debugHeal !== "function") return { ok: false, reason: "missing __debugHeal" };
    globalThis.__debugHeal();
    return { ok: true };
  });
  const cheat = {
    type: "__debugHeal",
    atMs: elapsedMs(),
    objectiveId,
    reason: "between-objective hotel stand-in",
    result,
    before
  };
  telemetry.cheats.push(cheat);
  objectiveEntry.cheats.push(cheat);
  log(`  [CHEAT] __debugHeal before ${objectiveId}: ${result?.ok ? "ok" : JSON.stringify(result)}`);
}

async function forceAdvance(trigger, objectiveEntry) {
  await settleDebugHooks(`forceAdvance:${trigger.id}`);
  const recruit = recruitByTrigger.get(trigger.id);
  if (recruit) {
    const result = await page.evaluate((charId) => {
      if (typeof globalThis.__recruit !== "function") return { ok: false, reason: "missing __recruit" };
      return { ok: true, party: globalThis.__recruit(charId) };
    }, recruit.charId);
    const cheat = {
      type: "__recruit",
      atMs: elapsedMs(),
      objectiveId: trigger.id,
      charId: recruit.charId,
      flag: recruit.flag,
      reason: "authored recruit trigger was unreachable after bounded walking attempts",
      result
    };
    telemetry.cheats.push(cheat);
    objectiveEntry.cheats.push(cheat);
    objectiveEntry.wall.forced.push(cheat);
    log(`  [CHEAT] __recruit(${recruit.charId}) for ${trigger.id}: ${JSON.stringify(result)}`);
  }

  const flagsToForce = new Set(trigger.setFlags ?? []);
  if (isOnce(trigger)) flagsToForce.add(triggerFiredFlag(trigger.id));
  if (flagsToForce.size === 0) flagsToForce.add(triggerFiredFlag(trigger.id));

  for (const flag of flagsToForce) {
    if (recruit && flag === recruit.flag) {
      continue;
    }
    const result = await page.evaluate((storyFlag) => {
      if (typeof globalThis.__setStoryFlag !== "function") return { ok: false, reason: "missing __setStoryFlag" };
      return { ok: true, result: globalThis.__setStoryFlag(storyFlag, true) };
    }, flag);
    const cheat = {
      type: "forced-setFlag",
      atMs: elapsedMs(),
      objectiveId: trigger.id,
      flag,
      reason: "wall recovery after 3 failed objective attempts",
      result
    };
    earnedFlags.add(flag);
    telemetry.cheats.push(cheat);
    objectiveEntry.cheats.push(cheat);
    objectiveEntry.wall.forced.push(cheat);
    log(`  [CHEAT] forced setFlag ${flag}: ${JSON.stringify(result)}`);
  }
}

async function routeToTrigger(trigger, target, attemptEntry) {
  const started = performance.now();
  let routeLengthPx = 0;
  let routeCells = 0;

  for (let macro = 0; macro < 10; macro += 1) {
    await waitForWorldHooks();
    let state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) {
      return routeResult("battle");
    }
    const player = state.o?.player;
    if (!player) {
      await page.waitForTimeout(250);
      continue;
    }
    if (trigger.area && pointInArea(player, trigger.area)) {
      return routeResult("arrived");
    }
    if (dist(player, target) < (trigger.boss ? 18 : 28)) {
      break;
    }

    const plan = await planPath(player, target, { margin: ROUTE_MARGIN, blockDoors: true, blockNpcs: true });
    if (!plan) {
      const miss = {
        atMs: elapsedMs(),
        from: { x: round(player.x), y: round(player.y) },
        to: { x: round(target.x), y: round(target.y) },
        reason: "astar-no-path"
      };
      attemptEntry.unreachableRoutes.push(miss);
      log(`    [route] UNREACHABLE ${trigger.id}: (${miss.from.x},${miss.from.y}) -> (${miss.to.x},${miss.to.y})`);
      const hopped = await tryDoorHopToward(target, attemptEntry);
      if (hopped) {
        continue;
      }
      // v2 fallback: the local A* grid cannot solve cross-map commutes. Warp NEAR
      // the objective (a logged cheat: the commute is skipped, the fights are not)
      // and walk the last leg for real. Snap to walkable so we never land in a wall.
      if (!attemptEntry.warpNear) {
        attemptEntry.warpNear = true;
        const candidates = await page.evaluate(({ tx, ty }) => {
          const solid = globalThis.__solidAt;
          const warp = globalThis.__warpTo;
          if (!warp) return null;
          const snap = (x, y) => {
            if (!solid || !solid(x, y)) return { x, y };
            for (let r = 8; r <= 240; r += 8) {
              for (let dy = -r; dy <= r; dy += 8) for (let dx = -r; dx <= r; dx += 8) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                if (!solid(x + dx, y + dy)) return { x: x + dx, y: y + dy };
              }
            }
            return null;
          };
          // land BEYOND the boss-gate arm radius (gates arm-by-distance), then walk in
          const spots = [
            snap(tx, ty + 420), snap(tx, ty - 420), snap(tx + 420, ty), snap(tx - 420, ty),
            snap(tx, ty + 160), snap(tx, ty - 160), snap(tx + 160, ty), snap(tx - 160, ty)
          ].filter(Boolean);
          return spots;
        }, { tx: target.x, ty: target.y });
        // pick the first candidate CONNECTED to the target (walkable is not enough:
        // pockets abound). Warp there, then locally verify a path exists.
        let landed = null;
        for (const spot of candidates ?? []) {
          const plan2 = await (async () => {
            await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), spot);
            await settleDebugHooks(`warp-near:${trigger.id}`);
            await page.waitForTimeout(500);
            return planPath(spot, target, { margin: ROUTE_MARGIN, blockDoors: true, blockNpcs: true });
          })();
          if (plan2) { landed = spot; break; }
        }
        void 0;
        if (landed) {
          telemetry.cheats.push({ kind: "warp-near", objective: trigger.id, to: landed, atMs: elapsedMs() });
          log(`  [CHEAT] warp-near ${trigger.id} -> (${landed.x},${landed.y}) (commute skipped, fights real)`);
          await page.waitForTimeout(900);
          // area triggers suppress when spawned inside: walk OUT first, then the
          // normal loop re-enters and the trigger fires.
          if (trigger.area) {
            for (let step = 0; step < 40; step += 1) {
              const st = await peek();
              const pl = st.o?.player;
              if (!pl || !pointInArea(pl, trigger.area)) break;
              if (st.o?.dialogueOpen || st.o?.inputLocked) { await tap("z", 200); continue; }
              await hold("ArrowDown", 140);
            }
          }
          for (let d = 0; d < 10; d += 1) {
            const st = await peek();
            if (!st.o?.dialogueOpen && !st.o?.inputLocked) break;
            await tap("z", 220);
          }
          continue;
        }
      }
      return routeResult("noroute");
    }

    routeLengthPx += plan.lengthPx;
    routeCells += plan.cells;
    if (macro === 0) {
      log(`    [route] (${round(player.x)},${round(player.y)}) -> (${round(target.x)},${round(target.y)}), ${plan.cells} cells, ${plan.waypoints.length} wp`);
    }
    const follow = await followWaypoints(plan.waypoints);
    if (follow === "battle") return routeResult("battle");
    if (follow === "door") continue;
    if (follow === "stuck") {
      await hold(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"][macro % 4], 220);
    }
  }

  const final = await finalApproach(trigger, target);
  return routeResult(final);

  function routeResult(status) {
    return {
      status,
      walkingTimeMs: Math.round(performance.now() - started),
      routeLengthPx: Math.round(routeLengthPx),
      routeCells
    };
  }
}

async function waitForWorldHooks() {
  for (let i = 0; i < 30; i += 1) {
    const ready = await page.evaluate(() => (
      typeof globalThis.__solidAt === "function" &&
      Boolean(globalThis.__firstSceneDebug?.player)
    )).catch(() => false);
    if (ready) return;
    await page.waitForTimeout(200);
  }
}

async function settleDebugHooks(reason) {
  try {
    await page.waitForFunction(() => (
      Boolean(globalThis.__firstSceneDebug) &&
      typeof globalThis.__debugHeal === "function" &&
      typeof globalThis.__setStoryFlag === "function"
    ), { timeout: DEBUG_HOOK_SETTLE_TIMEOUT_MS });
    return true;
  } catch (error) {
    log(`  [SETTLE:HOOKS] TIMEOUT after ${reason}; __firstSceneDebug/__debugHeal/__setStoryFlag not ready after ${DEBUG_HOOK_SETTLE_TIMEOUT_MS}ms; continuing (${String(error)})`);
    return false;
  }
}

async function planPath(from, target, options = {}) {
  const margin = options.margin ?? ROUTE_MARGIN;
  const step = options.step ?? GRID_STEP;
  const x0 = Math.min(from.x, target.x) - margin;
  const y0 = Math.min(from.y, target.y) - margin;
  const x1 = Math.max(from.x, target.x) + margin;
  const y1 = Math.max(from.y, target.y) + margin;
  const grid = await buildGrid(x0, y0, x1, y1, {
    step,
    blockDoors: options.blockDoors ?? true,
    blockNpcs: options.blockNpcs ?? true
  });
  if (!grid) return null;

  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, from.x, from.y)));
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, ...Object.values(w2c(grid, target.x, target.y)));
  const path = start && goal && findPath(grid.blocked, grid.cols, grid.rows, start, goal);
  if (!path) return null;

  const waypoints = path
    .filter((_, index) => index % 2 === 0 || index === path.length - 1)
    .map((cell) => c2w(grid, cell.c, cell.r));
  return {
    cells: path.length,
    lengthPx: Math.max(0, path.length - 1) * step,
    waypoints
  };
}

async function buildGrid(x0, y0, x1, y1, options) {
  const { step, blockDoors, blockNpcs } = options;
  const solid = await page.evaluate(({ x0, y0, x1, y1, step }) => {
    const fn = globalThis.__solidAt;
    if (!fn) return null;
    const cols = Math.floor((x1 - x0) / step) + 1;
    const rows = Math.floor((y1 - y0) / step) + 1;
    const g = [];
    for (let r = 0; r < rows; r += 1) {
      const row = new Array(cols);
      for (let c = 0; c < cols; c += 1) {
        row[c] = fn(x0 + c * step, y0 + r * step) ? 1 : 0;
      }
      g.push(row);
    }
    return { cols, rows, g };
  }, { x0, y0, x1, y1, step });
  if (!solid) return null;

  const { cols, rows, g } = solid;
  const blocked = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const mark = (c, r) => {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) blocked[nr][nc] = true;
      }
    }
  };
  const markCell = (c, r) => {
    if (r >= 0 && c >= 0 && r < rows && c < cols) blocked[r][c] = true;
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (g[r][c]) mark(c, r);
    }
  }
  if (blockDoors) {
    for (const door of DOORS) {
      const c = Math.round((door.worldPixel.x - x0) / step);
      const r = Math.round((door.worldPixel.y - y0) / step);
      if (c >= -1 && r >= -1 && c <= cols && r <= rows) mark(c, r);
    }
  }
  if (blockNpcs) {
    const npcs = await page.evaluate(() => (
      globalThis.__firstSceneDebug?.npcs ?? []
    ).filter((npc) => npc.visible).map((npc) => ({ x: npc.x, y: npc.y }))).catch(() => []);
    for (const npc of npcs) {
      markCell(Math.round((npc.x - x0) / step), Math.round((npc.y - y0) / step));
    }
  }
  return { cols, rows, blocked, x0, y0, step };
}

function w2c(grid, x, y) {
  return {
    c: Math.round((x - grid.x0) / grid.step),
    r: Math.round((y - grid.y0) / grid.step)
  };
}
function c2w(grid, c, r) {
  return {
    x: grid.x0 + c * grid.step,
    y: grid.y0 + r * grid.step
  };
}

async function followWaypoints(waypoints) {
  let lastX = -1e9;
  let lastY = -1e9;
  let stuck = 0;
  for (const wp of waypoints) {
    for (let i = 0; i < 14; i += 1) {
      const state = await peek();
      recordRouteSample(state);
      if (inBattle(state)) return "battle";
      if (state.o?.doorFadeActive) {
        await waitForDoorSettle("followWaypoints door transition");
        return "door";
      }
      if (!state.o?.player) {
        await page.waitForTimeout(120);
        continue;
      }
      if (state.o.dialogueOpen || state.o.inputLocked) {
        await tap("z", 180);
        continue;
      }
      const player = state.o.player;
      if (dist(player, wp) < 12) break;
      stuck = Math.hypot(player.x - lastX, player.y - lastY) < 3 ? stuck + 1 : 0;
      lastX = player.x;
      lastY = player.y;
      if (stuck >= 5) return "stuck";
      await hold(dirToward(wp.x - player.x, wp.y - player.y), 120);
    }
  }
  return "arrived";
}

async function finalApproach(trigger, target) {
  let lastX = -1e9;
  let lastY = -1e9;
  for (let i = 0; i < 85; i += 1) {
    const state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) return "battle";
    if (state.o?.doorFadeActive) {
      await waitForDoorSettle("finalApproach door transition");
      return "door";
    }
    if (!state.o?.player) {
      await page.waitForTimeout(120);
      continue;
    }
    if (state.o.dialogueOpen || state.o.inputLocked) {
      await tap("z", 180);
      continue;
    }
    const player = state.o.player;
    if (trigger.area && pointInArea(player, trigger.area)) return "arrived";
    const moved = Math.hypot(player.x - lastX, player.y - lastY);
    lastX = player.x;
    lastY = player.y;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    if (trigger.area && Math.hypot(dx, dy) < 18) return "arrived";
    if (i > 0 && moved < 2) {
      await hold(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"][i % 4], 140);
    } else {
      await hold(dirToward(dx, dy), 120);
    }
  }
  return inBattle(await peek()) ? "battle" : "arrived";
}

async function tryDoorHopToward(target, attemptEntry) {
  const state = await peek();
  const player = state.o?.player;
  if (!player) return false;

  const currentDistance = dist(player, target);
  const candidates = HOP_DOORS
    .map((door) => ({
      door,
      score: dist(player, door.worldPixel) + dist(door.destinationWorldPixel, target),
      improvesBy: currentDistance - dist(door.destinationWorldPixel, target)
    }))
    .filter((entry) => entry.improvesBy > 96 || dist(entry.door.destinationWorldPixel, target) < 700)
    .sort((a, b) => a.score - b.score)
    .slice(0, 32);

  for (const { door } of candidates) {
    const approaches = await doorApproaches(door);
    for (const approach of approaches) {
      const start = (await peek()).o?.player;
      if (!start) continue;
      const plan = await planPath(start, approach, { margin: 220, blockDoors: true, blockNpcs: true });
      if (!plan) continue;
      log(`    [door] ${round(door.worldPixel.x)},${round(door.worldPixel.y)} -> ${round(door.destinationWorldPixel.x)},${round(door.destinationWorldPixel.y)}`);
      const followed = await followWaypoints(plan.waypoints);
      if (followed === "battle") return true;
      if (followed === "door") return true;
      const lastDoorBefore = await lastDoorSnapshot();
      for (let i = 0; i < 8; i += 1) {
        const s = await peek();
        if (s.o?.dialogueOpen || s.o?.inputLocked) await tap("z", 180);
        await hold(approach.into, 180);
        await waitForDoorSettle("tryDoorHopToward door transition");
        await settleDebugHooks("tryDoorHopToward door hop");
        const afterState = await peek();
        recordRouteSample(afterState);
        const after = afterState.o?.player;
        const lastDoorAfter = await lastDoorSnapshot();
        const lastDoorChanged = doorSnapshotKey(lastDoorAfter) !== doorSnapshotKey(lastDoorBefore);
        if (
          after &&
          (lastDoorChanged || dist(after, door.destinationWorldPixel) < 80)
        ) {
          const resolvedTo = lastDoorAfter?.to ?? after;
          const warp = {
            atMs: elapsedMs(),
            from: { x: round(door.worldPixel.x), y: round(door.worldPixel.y) },
            to: { x: round(resolvedTo.x), y: round(resolvedTo.y) },
            destination: { x: round(door.destinationWorldPixel.x), y: round(door.destinationWorldPixel.y) }
          };
          attemptEntry.doorWarps.push(warp);
          log(`    [door] arrived at (${warp.to.x},${warp.to.y})`);
          return true;
        }
      }
    }
  }
  return false;
}

async function doorApproaches(door) {
  const approaches = await page.evaluate(({ x, y }) => {
    const solid = globalThis.__solidAt;
    if (typeof solid !== "function") return [];
    const specs = [
      { name: "N", dx: 0, dy: -1, into: "ArrowDown" },
      { name: "S", dx: 0, dy: 1, into: "ArrowUp" },
      { name: "W", dx: -1, dy: 0, into: "ArrowRight" },
      { name: "E", dx: 1, dy: 0, into: "ArrowLeft" }
    ];
    const out = [];
    for (const spec of specs) {
      for (const distance of [8, 16, 24, 32]) {
        const px = x + spec.dx * distance;
        const py = y + spec.dy * distance;
        if (!solid(px, py)) {
          out.push({ name: spec.name, x: px, y: py, into: spec.into });
          break;
        }
      }
    }
    return out;
  }, { x: door.worldPixel.x, y: door.worldPixel.y }).catch(() => []);
  return approaches;
}

async function waitForDoorSettle(reason = "door transition") {
  let sawDoorFade = false;
  for (let i = 0; i < 40; i += 1) {
    const state = await peek();
    recordRouteSample(state);
    if (state.o?.doorFadeActive) sawDoorFade = true;
    if (!state.o?.doorFadeActive && state.o?.player) {
      if (sawDoorFade) await settleDebugHooks(reason);
      return;
    }
    await page.waitForTimeout(120);
  }
  if (sawDoorFade) await settleDebugHooks(`${reason} timeout`);
}

async function lastDoorSnapshot() {
  return page.evaluate(() => {
    const door = globalThis.__firstSceneDebug?.lastDoor;
    return door ? {
      from: { x: door.from.x, y: door.from.y },
      to: { x: door.to.x, y: door.to.y }
    } : null;
  }).catch(() => null);
}

function doorSnapshotKey(door) {
  return door ? `${door.from.x},${door.from.y}->${door.to.x},${door.to.y}` : "";
}

const GRID = {
  BASH: [0, 0],
  GOODS: [1, 0],
  AUTO: [2, 0],
  PSI: [0, 1],
  DEFEND: [1, 1],
  RUN: [2, 1]
};

async function navCommand(target) {
  for (let i = 0; i < 8; i += 1) {
    const command = (await peek()).b?.command;
    if (command === target) return true;
    const [cx, cy] = GRID[command] ?? [0, 0];
    const [tx, ty] = GRID[target] ?? [0, 0];
    if (cx < tx) await tap("ArrowRight", 120);
    else if (cx > tx) await tap("ArrowLeft", 120);
    else if (cy < ty) await tap("ArrowDown", 120);
    else if (cy > ty) await tap("ArrowUp", 120);
    else return true;
  }
  return false;
}

async function selectWeakestTarget(living) {
  if (living.length <= 1) return;
  const want = living.reduce((best, entry) => (
    entry.e.hpTarget < best.e.hpTarget ? entry : best
  )).i;
  for (let i = 0; i < 8; i += 1) {
    const selection = (await peek()).b?.selection ?? "";
    const match = selection.match(/^target:BASH:(\d+)/);
    if (!match) return;
    const current = Number.parseInt(match[1], 10);
    if (current === want) return;
    await tap(current < want ? "ArrowRight" : "ArrowLeft", 120);
  }
}

async function bashWeakest(living) {
  await navCommand("BASH");
  await tap("z", 160);
  await selectWeakestTarget(living);
  await tap("z", 180);
}

async function defend() {
  await navCommand("DEFEND");
  await tap("z", 180);
}

async function fightBattle(label, trigger, source) {
  const runId = `${telemetry.battles.length + 1}:${label}`;
  const battle = {
    runId,
    bossId: label,
    source,
    objectiveId: trigger.id,
    battleGroup: trigger.battleGroup ?? null,
    startedAtMs: elapsedMs(),
    result: "unknown",
    rounds: 0,
    partySize: 0,
    hpLowWater: [],
    deaths: 0,
    deadMembers: [],
    defendNeeded: false,
    defendCommands: 0,
    levelUps: [],
    finalParty: [],
    finalEnemies: [],
    finishedAtMs: null
  };
  const startMax = [];
  const low = [];
  const dead = new Set();
  let lastPhase = "";
  let sawCommand = false;

  log(`    [battle] ${label}`);
  for (let step = 0; step < 900; step += 1) {
    const state = await peek();
    const b = state.b;
    if (!b) {
      await page.waitForTimeout(150);
      continue;
    }
    battle.rounds = Math.max(battle.rounds, b.roundNumber ?? 0);
    battle.partySize = Math.max(battle.partySize, b.party?.length ?? 0);
    captureBattleVitals(b, startMax, low, dead);

    if (b.phase === "victory-summary" || b.outcome === "win") {
      battle.result = "victory";
      battle.levelUps = b.victorySummary?.levelUps ?? [];
      for (const levelUp of battle.levelUps) {
        knownLevels.set(levelUp.charId, levelUp.toLevel);
      }
      await tap("z", 200);
      break;
    }
    if (b.phase === "defeat" || b.phase === "lose" || b.outcome === "lose" || (b.party ?? []).every((member) => !member.alive)) {
      battle.result = "defeat";
      break;
    }
    if (b.phase === "command-input") {
      sawCommand = true;
      const idx = b.inputMemberIndex ?? 0;
      const me = b.party[idx] ?? b.party[0];
      const maxHp = Math.max(1, startMax[idx] ?? me?.hpTarget ?? 1);
      const living = (b.enemies ?? []).map((e, i) => ({ e, i })).filter((entry) => entry.e.alive);
      const finishable = living.length > 0 && living.reduce((sum, entry) => sum + Math.max(0, entry.e.hpTarget), 0) <= 18;
      let action = "BASH";
      if (me && me.hpTarget <= maxHp * DEFEND_FRACTION && !finishable) {
        battle.defendNeeded = true;
        battle.defendCommands += 1;
        action = "DEFEND";
        await defend();
      } else {
        await bashWeakest(living);
      }
      log(`      [${label}] r${b.roundNumber} m${idx} ${round(me?.hpTarget)}/${round(maxHp)} hp e=[${(b.enemies ?? []).map((e) => round(e.hpTarget)).join(",")}] -> ${action}`);
    } else if (b.phase === "execution" || b.phase === "enemy-rolling" || b.phase === "player-rolling") {
      await tap("z", 150);
    } else {
      if (b.phase !== lastPhase) {
        log(`      [battle] phase=${b.phase}`);
        lastPhase = b.phase;
      }
      await page.waitForTimeout(220);
    }
  }

  const final = (await peek()).b;
  if (final) {
    captureBattleVitals(final, startMax, low, dead);
    battle.finalParty = final.party ?? [];
    battle.finalEnemies = final.enemies ?? [];
    if (battle.result === "unknown" && final.outcome === "win") battle.result = "victory";
    if (battle.result === "unknown" && final.outcome === "lose") battle.result = "defeat";
  }
  if (battle.result === "unknown") {
    battle.result = sawCommand ? "timeout" : "no-command";
  }
  battle.hpLowWater = low.map((fraction, index) => ({
    memberIndex: index,
    maxHpAssumption: round(startMax[index] ?? 0),
    fraction: Number((Number.isFinite(fraction) ? fraction : 1).toFixed(3))
  }));
  battle.deadMembers = [...dead].sort((a, b) => a - b);
  battle.deaths = battle.deadMembers.length;
  battle.finishedAtMs = elapsedMs();
  log(`    [battle] ${label}: ${battle.result.toUpperCase()} in ${battle.rounds} rounds, deaths=${battle.deaths}, defend=${battle.defendCommands}`);
  return battle;
}

function captureBattleVitals(b, startMax, low, dead) {
  for (const [index, member] of (b.party ?? []).entries()) {
    if (!startMax[index]) startMax[index] = Math.max(1, member.hpTarget ?? 1);
    if ((member.hpTarget ?? 0) > startMax[index] && (b.roundNumber ?? 1) <= 1) {
      startMax[index] = member.hpTarget;
    }
    const fraction = Math.max(0, member.hpTarget ?? 0) / Math.max(1, startMax[index]);
    low[index] = Math.min(low[index] ?? 1, fraction);
    if (!member.alive || (member.hpTarget ?? 0) <= 0) {
      dead.add(index);
    }
  }
}

async function settleAfterBattle(trigger) {
  let settled = false;
  for (let i = 0; i < 80; i += 1) {
    const state = await peek();
    if (state.b?.phase === "victory-summary") {
      await tap("z", 180);
      continue;
    }
    if (inBattle(state)) {
      await tap("z", 180);
      continue;
    }
    if (state.o?.dialogueOpen || state.o?.inputLocked) {
      await tap("z", 220);
      continue;
    }
    if (!trigger || state.o?.player) {
      settled = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  if (!settled) {
    log("  [settle] battle end did not reach an overworld player before hook settle");
  }
  await settleDebugHooks("battle end");
}

async function settleWorld({ maxPresses, reason }) {
  for (let i = 0; i < maxPresses; i += 1) {
    const state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) return;
    if (state.o?.doorFadeActive) {
      await waitForDoorSettle(`settleWorld:${reason}`);
      continue;
    }
    if (state.o?.dialogueOpen || state.o?.inputLocked) {
      await tap("z", 180);
      continue;
    }
    if (state.o?.player) return;
    await page.waitForTimeout(200);
  }
  log(`  [settle] stopped after ${maxPresses} presses (${reason})`);
}

async function drainOpeningCutscene() {
  for (let i = 0; i < 90; i += 1) {
    const state = await peek();
    recordRouteSample(state);
    const flags = state.o?.flags ?? [];
    if (flags.includes("signal:cold-signal-seen") && !state.o?.dialogueOpen && !state.o?.inputLocked) {
      break;
    }
    if (state.o?.dialogueOpen || state.o?.inputLocked) {
      await tap("z", 180);
    } else {
      await page.waitForTimeout(160);
    }
  }
  log(`  [boot] opening drained; flags=[${(await currentFlags()).join(",")}]`);
}

async function playerNearTarget(trigger, target, radius) {
  const state = await peek();
  let player = state.o?.player;
  if (!Number.isFinite(player?.x) && lastRouteSample) {
    player = lastRouteSample;
  }
  if (!player) return false;
  if (trigger.area && pointInArea(player, trigger.area)) return true;
  return dist(player, target) <= radius;
}

function dirToward(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx < 0 ? "ArrowLeft" : "ArrowRight")
    : (dy < 0 ? "ArrowUp" : "ArrowDown");
}

function recordRouteSample(state) {
  const player = state?.o?.player;
  if (!player) return;
  const sample = {
    n: routeSampleSeq,
    atMs: elapsedMs(),
    objectiveId: activeObjectiveId,
    x: round(player.x),
    y: round(player.y)
  };
  if (
    !lastRouteSample ||
    Math.hypot(sample.x - lastRouteSample.x, sample.y - lastRouteSample.y) >= 16 ||
    sample.atMs - lastRouteSample.atMs >= 1000 ||
    sample.objectiveId !== lastRouteSample.objectiveId
  ) {
    routeSampleSeq += 1;
    telemetry.routeLog.push(sample);
    lastRouteSample = sample;
  }
}

async function snapshotWallState() {
  await settleDebugHooks("wall-state snapshot");
  const state = await page.evaluate(() => {
    const worldState = globalThis.__firstSceneDebug ?? {};
    const battle = globalThis.__battleDebug ?? null;
    return {
      flags: worldState.flags ?? [],
      player: worldState.player ?? null,
      partyState: worldState.partyState ?? null,
      overworldHud: worldState.overworldHud ?? null,
      partyRoster: typeof globalThis.__partyRoster === "function" ? globalThis.__partyRoster() : null,
      levels: battle?.victorySummary?.levelUps ?? null,
      note: battle?.victorySummary ? "levels captured from battle victory summary" : "levels unavailable from current debug surface outside battle victory summary"
    };
  }).catch((error) => ({ error: String(error) }));
  const partyIds = state.partyRoster?.party ?? [];
  state.levels = partyIds.map((charId) => ({
    charId,
    level: knownLevels.get(charId) ?? null,
    source: knownLevels.has(charId) ? "generated-characters-plus-victory-summaries" : "unknown"
  }));
  state.note = "levels are tracked by the runner from generated characters.json and battle victory summaries";
  return state;
}

function buildReachabilityAudit() {
  const cutscenes = (cutsceneData.cutscenes ?? [])
    .filter((cutscene) => cutscene.trigger?.area)
    .map((cutscene) => auditTarget(`cutscene:${cutscene.id}`, cutscene.trigger.area));
  const archivist = (archivistData.spots ?? [])
    .map((spot) => auditPoint(`archivist:${String(spot.spotId).padStart(2, "0")}`, spot.anchor));
  return {
    radiusPx: AUDIT_RADIUS_PX,
    cutscenes,
    archivist,
    untouchedCutscenes: cutscenes.filter((entry) => !entry.touched).map((entry) => entry.id),
    untouchedArchivistSpots: archivist.filter((entry) => !entry.touched).map((entry) => entry.id)
  };
}

function auditTarget(id, area) {
  const minDistancePx = minDistanceToArea(area);
  return {
    id,
    area: { x: round(area.x), y: round(area.y), w: round(area.w), h: round(area.h) },
    minDistancePx,
    touched: minDistancePx !== null && minDistancePx <= AUDIT_RADIUS_PX
  };
}

function auditPoint(id, point) {
  const minDistancePx = minDistanceToPoint(point);
  return {
    id,
    point: { x: round(point.x), y: round(point.y) },
    minDistancePx,
    touched: minDistancePx !== null && minDistancePx <= AUDIT_RADIUS_PX
  };
}

function minDistanceToArea(area) {
  if (telemetry.routeLog.length === 0) return null;
  let best = Infinity;
  for (const sample of telemetry.routeLog) {
    const dx = sample.x < area.x ? area.x - sample.x : sample.x > area.x + area.w ? sample.x - (area.x + area.w) : 0;
    const dy = sample.y < area.y ? area.y - sample.y : sample.y > area.y + area.h ? sample.y - (area.y + area.h) : 0;
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return round(best);
}

function minDistanceToPoint(point) {
  if (telemetry.routeLog.length === 0) return null;
  let best = Infinity;
  for (const sample of telemetry.routeLog) {
    best = Math.min(best, Math.hypot(sample.x - point.x, sample.y - point.y));
  }
  return round(best);
}

function buildSummary() {
  const totalPlaytimeMs = elapsedMs();
  const fights = telemetry.battles.map((battle) => ({
    bossId: battle.bossId,
    objectiveId: battle.objectiveId,
    rounds: battle.rounds,
    deaths: battle.deaths,
    minHpFraction: Math.min(...battle.hpLowWater.map((entry) => entry.fraction), 1),
    defendNeeded: battle.defendNeeded,
    result: battle.result
  }));
  const trivial = fights
    .filter((fight) => fight.result === "victory" && fight.rounds < TRIVIAL_ROUND_LIMIT && !fight.defendNeeded && fight.deaths === 0 && fight.minHpFraction >= HP_PRESSURE_FRACTION)
    .map((fight) => fight.bossId);
  const walls = fights
    .filter((fight) => fight.rounds > WALL_ROUND_LIMIT || fight.deaths > 0 || fight.result !== "victory")
    .map((fight) => fight.bossId);
  const forcedWalls = telemetry.objectives
    .filter((objective) => objective.wall)
    .map((objective) => ({
      id: objective.id,
      forced: objective.wall.forced.map((entry) => entry.flag ?? `${entry.type}:${entry.charId ?? ""}`)
    }));
  const audit = buildReachabilityAudit();
  return {
    finishedAt: new Date().toISOString(),
    totalPlaytimeMs,
    completedObjectives: telemetry.objectives.filter((objective) => objective.completed).length,
    objectiveOrder: telemetry.objectives.map((objective) => objective.id),
    finalFlags: telemetry.latestFlags,
    fights,
    trivialFights: trivial,
    wallFights: [...new Set([...walls, ...forcedWalls.map((wall) => wall.id)])],
    forcedWalls,
    reachabilityAudit: {
      radiusPx: audit.radiusPx,
      untouchedCutscenes: audit.untouchedCutscenes,
      untouchedArchivistSpots: audit.untouchedArchivistSpots
    }
  };
}

function flushTelemetry() {
  telemetry.reachabilityAudit = buildReachabilityAudit();
  writeFileSync(TELEMETRY_PATH, `${JSON.stringify(telemetry, null, 2)}\n`);
}

function elapsedMs() {
  return Math.round(performance.now() - startMs);
}

function normalizeDoorForRunner(door) {
  const worldPixel = pointFrom(door?.worldPixel);
  const destinationWorldPixel = doorDestinationWorldPixel(door);
  if (!worldPixel || !destinationWorldPixel) return null;
  return { ...door, worldPixel, destinationWorldPixel };
}

function doorDestinationWorldPixel(door) {
  const generatedWorldPixel = pointFrom(door?.destinationWorldPixel);
  if (generatedWorldPixel) return generatedWorldPixel;
  const warpUnitDestination = pointFrom(door?.destination ?? door?.destinationWarpUnit ?? door?.destinationWarpUnits);
  return warpUnitDestination
    ? { x: warpUnitDestination.x * DOOR_WARP_UNIT_PX, y: warpUnitDestination.y * DOOR_WARP_UNIT_PX }
    : null;
}

function pointFrom(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function isMessageDoorForRunner(door) {
  const dx = door.destinationWorldPixel.x - door.worldPixel.x;
  const dy = door.destinationWorldPixel.y - door.worldPixel.y;
  return door.type === "door" &&
    Boolean(String(door.textPointer ?? "").trim()) &&
    Math.hypot(dx, dy) < MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX;
}

await main();
