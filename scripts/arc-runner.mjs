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
const MAX_INTERRUPT_BATTLES_PER_ATTEMPT = 8;
const ATTEMPT_DEADLINE_MS = 10 * 60 * 1000;
const WALL_ROUND_LIMIT = 25;
const TRIVIAL_ROUND_LIMIT = 4;
const HP_PRESSURE_FRACTION = 0.75;
const DEFEND_FRACTION = 0.4;
const AUDIT_RADIUS_PX = 300;
const DOOR_WARP_UNIT_PX = 8;
const MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX = 24;
const DEBUG_HOOK_SETTLE_TIMEOUT_MS = 10000;
const PAGE_EVALUATE_WATCHDOG_MS = 30000;
const KEYBOARD_WATCHDOG_MS = 15000;
const DOORS = (world.doors ?? []).map(normalizeDoorForRunner).filter(Boolean);
const HOP_DOORS = DOORS.filter((door) => !isMessageDoorForRunner(door));

const cli = parseArgs(process.argv.slice(2));
const BASE = cli.base;
const startedAt = new Date().toISOString();
const startMs = performance.now();
let activeObjectiveId = null;
let activeAttemptDeadlineAt = null;
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

class PageWedgedError extends Error {
  constructor(operation, timeoutMs) {
    super(`Page wedged during ${operation} after ${timeoutMs}ms`);
    this.name = "PageWedgedError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

function withWatchdog(promise, timeoutMs, operation) {
  let timeout = null;
  const watchdog = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new PageWedgedError(operation, timeoutMs)), timeoutMs);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    watchdog
  ]);
}

function evaluateWithWatchdog(operation, fn, arg) {
  const promise = arguments.length >= 3
    ? page.evaluate(fn, arg)
    : page.evaluate(fn);
  return withWatchdog(promise, PAGE_EVALUATE_WATCHDOG_MS, operation);
}

function waitForFunctionWithWatchdog(operation, fn, options = {}) {
  return withWatchdog(page.waitForFunction(fn, options), PAGE_EVALUATE_WATCHDOG_MS, operation);
}

function keyboardWithWatchdog(operation, promise) {
  return withWatchdog(promise, KEYBOARD_WATCHDOG_MS, operation);
}

function rethrowPageWedged(error, fallback) {
  if (error instanceof PageWedgedError) throw error;
  return fallback;
}

function attemptDeadlineExpired() {
  return activeAttemptDeadlineAt !== null && performance.now() >= activeAttemptDeadlineAt;
}

function bootUrl() {
  const boot = new URL(BASE);
  boot.searchParams.set("nointro", "1");
  if (cli.spawn) boot.searchParams.set("spawn", cli.spawn);
  if (cli.noEncounters) boot.searchParams.set("noEncounters", "1");
  return boot;
}

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
  return evaluateWithWatchdog("forceFlag", (storyFlag) => {
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
    noEncounters: cli.noEncounters,
    forceFlags: cli.forceFlags
  },
  objectiveOrdering: {
    method: "At each step, read live __firstSceneDebug.flags; choose the first authored non-archivist story trigger whose requireFlags are all present, blockFlags are absent, and once/setFlags are not already satisfied. Declaration order in content/triggers.json breaks ties.",
    objectiveCount: objectiveTriggers.length,
    excluded: ["archivist-photo-* triggers are excluded from play order and audited separately."]
  },
  cheats: [],
  objectives: [],
  battles: [],
  saves: [],
  routeLog: [],
  latestFlags: [],
  reachabilityAudit: null,
  summary: null
};

mkdirSync(dirname(TELEMETRY_PATH.pathname), { recursive: true });
flushTelemetry();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });

const peek = () => evaluateWithWatchdog("peek", () => ({
  o: globalThis.__firstSceneDebug ?? null,
  b: globalThis.__battleDebug ?? null,
  bosses: globalThis.__bossGates ?? null,
  roster: typeof globalThis.__partyRoster === "function" ? globalThis.__partyRoster() : null
}));
const tap = async (key, ms = 220) => {
  await keyboardWithWatchdog(`keyboard.press:${key}`, page.keyboard.press(key));
  await page.waitForTimeout(ms);
};
const hold = async (key, ms) => {
  await keyboardWithWatchdog(`keyboard.down:${key}`, page.keyboard.down(key));
  await page.waitForTimeout(ms);
  await keyboardWithWatchdog(`keyboard.up:${key}`, page.keyboard.up(key));
  await page.waitForTimeout(80);
};

async function main() {
try {
  const boot = bootUrl();

  log(`[boot] ${boot.toString()}`);
  await page.goto(boot.toString(), { waitUntil: "networkidle", timeout: 60000 });
  await waitForFunctionWithWatchdog("boot:firstSceneDebug", () => globalThis.__firstSceneDebug, { timeout: 30000 });
  await settleDebugHooks("boot");
  await page.waitForTimeout(1500);
  await drainOpeningCutscene();
  if (cli.forceFlags.length > 0) {
    for (const flag of cli.forceFlags) await forceFlag(flag);
    telemetry.cheats.push({ kind: "cli-forced-flags", flags: [...cli.forceFlags] });
    flushTelemetry();
  }

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
      await recoverParty("between-objective");
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
  let forceFlags = [];
  for (const arg of args) {
    if (arg.startsWith("--max-objectives=")) {
      maxObjectives = Math.max(0, Number.parseInt(arg.slice("--max-objectives=".length), 10));
    } else if (arg === "--smoke") {
      maxObjectives = 1;
    } else if (arg.startsWith("--spawn=")) {
      spawn = arg.slice("--spawn=".length);
    } else if (arg === "--no-encounters") {
      noEncounters = true;
    } else if (arg.startsWith("--force-flags=")) {
      forceFlags = arg.slice("--force-flags=".length).split(",").map((flag) => flag.trim()).filter(Boolean);
    } else if (!arg.startsWith("--")) {
      base = arg;
    }
  }
  if (!base.endsWith("/")) base += "/";
  return { base, spawn, maxObjectives, noEncounters, forceFlags };
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

function liveTargetFor(trigger, staticTarget, state, objectiveEntry = null) {
  const gates = state?.bosses?.gates;
  const gate = trigger.boss && Array.isArray(gates)
    ? gates.find((candidate) => candidate.triggerId === trigger.id)
    : null;
  if (!gate || !Number.isFinite(gate.x) || !Number.isFinite(gate.y)) return staticTarget;

  const liveTarget = { x: gate.x, y: gate.y };
  if (objectiveEntry) {
    objectiveEntry.liveTargetUsed = true;
    objectiveEntry.lastLiveTarget = { x: round(liveTarget.x), y: round(liveTarget.y) };
  }
  return liveTarget;
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
    liveTargetUsed: false,
    lastLiveTarget: null,
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
      flagsBefore: [],
      routeLengthPx: 0,
      routeCells: 0,
      walkingTimeMs: 0,
      unreachableRoutes: [],
      doorWarps: [],
      interruptBattles: 0,
      status: "started",
      completedFlags: [],
      finishedAtMs: null
    };
    entry.attempts.push(attemptEntry);
    activeAttemptDeadlineAt = performance.now() + ATTEMPT_DEADLINE_MS;

    try {
      attemptEntry.flagsBefore = await currentFlags();
      const missingAttemptFlags = [...earnedFlags].filter((f) => !attemptEntry.flagsBefore.includes(f));
      if (missingAttemptFlags.length > 0) {
        log(`  [RECOVER] attempt flag regression before ${trigger.id} (${missingAttemptFlags.length} lost, e.g. ${missingAttemptFlags[0]}); re-asserting`);
        telemetry.cheats.push({
          kind: "attempt-flag-recovery",
          objectiveId: trigger.id,
          count: missingAttemptFlags.length,
          atMs: elapsedMs()
        });
        for (const flag of missingAttemptFlags) await forceFlag(flag);
        await recoverParty(`attempt:${trigger.id}`);
        attemptEntry.flagsBefore = await currentFlags();
      }
      await hotelHeal(trigger.id, entry);
      const preSettle = await settleWorld({ maxPresses: 80, reason: "pre-objective" });
      if (preSettle === "attempt-deadline") {
        attemptEntry.status = "attempt-deadline";
        attemptEntry.finishedAtMs = elapsedMs();
        log(`  [objective ${trigger.id}] attempt ${attempt}: ${attemptEntry.status}; flags=[${telemetry.latestFlags.join(",")}]`);
        flushTelemetry();
        continue;
      }

      while (!entry.completed) {
        const unreachableStart = attemptEntry.unreachableRoutes.length;
        const doorWarpStart = attemptEntry.doorWarps.length;
        const routeResult = await routeToTrigger(trigger, target, attemptEntry, entry);
        attemptEntry.status = routeResult.status;
        attemptEntry.walkingTimeMs += routeResult.walkingTimeMs;
        attemptEntry.routeLengthPx += routeResult.routeLengthPx;
        attemptEntry.routeCells += routeResult.routeCells;
        entry.routeLengthPx += routeResult.routeLengthPx;
        entry.routeCells += routeResult.routeCells;
        entry.walkingTimeMs += routeResult.walkingTimeMs;
        entry.unreachableRoutes.push(...attemptEntry.unreachableRoutes.slice(unreachableStart));
        entry.doorWarps.push(...attemptEntry.doorWarps.slice(doorWarpStart));

        if (routeResult.status === "attempt-deadline") {
          attemptEntry.finishedAtMs = elapsedMs();
          log(`  [objective ${trigger.id}] attempt ${attempt}: ${attemptEntry.status}; flags=[${telemetry.latestFlags.join(",")}]`);
          flushTelemetry();
          break;
        }

        let battle = null;
        if (routeResult.status === "battle" || inBattle(await peek())) {
          const nearTarget = await playerNearTarget(trigger, target, trigger.boss ? 120 : 180);
          const battleId = nearTarget ? trigger.id : `route-interrupt:${trigger.id}`;
          battle = await fightBattle(battleId, trigger, nearTarget ? "objective" : "route-interrupt");
          entry.battles.push(battle.runId);
          telemetry.battles.push(battle);
          if (battle.result === "defeat") await settleAfterDefeat(trigger);
          else await settleAfterBattle(trigger);
        } else {
          await page.waitForTimeout(350);
          const postSettle = await settleWorld({ maxPresses: 120, reason: "post-route" });
          if (postSettle === "attempt-deadline") {
            attemptEntry.status = "attempt-deadline";
            attemptEntry.finishedAtMs = elapsedMs();
            log(`  [objective ${trigger.id}] attempt ${attempt}: ${attemptEntry.status}; flags=[${telemetry.latestFlags.join(",")}]`);
            flushTelemetry();
            break;
          }
          const settledFlags = await currentFlags();
          if (trigger.boss && routeResult.status === "arrived" && !objectiveDone(trigger, settledFlags)) {
            const pressResult = await pressIntoBossGate(trigger, target, entry);
            if (pressResult === "battle" || inBattle(await peek())) {
              attemptEntry.status = "battle";
              battle = await fightBattle(trigger.id, trigger, "objective");
              entry.battles.push(battle.runId);
              telemetry.battles.push(battle);
              if (battle.result === "defeat") await settleAfterDefeat(trigger);
              else await settleAfterBattle(trigger);
            }
          }
        }

        const afterFlags = await currentFlags();
        attemptEntry.completedFlags = (trigger.setFlags ?? []).filter((flag) => afterFlags.includes(flag));
        entry.completed = objectiveDone(trigger, afterFlags);

        if (!entry.completed && battle?.result === "victory") {
          attemptEntry.interruptBattles += 1;
          attemptEntry.status = attemptEntry.interruptBattles >= MAX_INTERRUPT_BATTLES_PER_ATTEMPT
            ? "interrupt-battle-cap"
            : "interrupt-battle";
        }

        const retrySameAttempt = !entry.completed
          && battle?.result === "victory"
          && attemptEntry.interruptBattles < MAX_INTERRUPT_BATTLES_PER_ATTEMPT;
        if (!retrySameAttempt) {
          attemptEntry.finishedAtMs = elapsedMs();
        }

        log(`  [objective ${trigger.id}] attempt ${attempt}: ${entry.completed ? "complete" : attemptEntry.status}; flags=[${afterFlags.join(",")}]`);
        flushTelemetry();

        if (entry.completed) break;
        if (retrySameAttempt) {
          log(`    [interrupt] ${trigger.id} attempt ${attempt}: battle victory did not complete objective; retrying same attempt (${attemptEntry.interruptBattles}/${MAX_INTERRUPT_BATTLES_PER_ATTEMPT})`);
          continue;
        }
        if (battle?.result === "victory" && attemptEntry.interruptBattles >= MAX_INTERRUPT_BATTLES_PER_ATTEMPT) {
          log(`    [interrupt] ${trigger.id} attempt ${attempt}: interrupt battle cap reached (${MAX_INTERRUPT_BATTLES_PER_ATTEMPT}); consuming attempt`);
        }
        break;
      }
    } catch (error) {
      if (!(error instanceof PageWedgedError)) throw error;
      attemptEntry.status = "wedged";
      attemptEntry.finishedAtMs = elapsedMs();
      activeAttemptDeadlineAt = null;
      telemetry.cheats.push({ kind: "page-wedge-recovery", objectiveId: trigger.id, atMs: elapsedMs() });
      log(`  [WEDGE] ${trigger.id} attempt ${attempt}: ${error.message}; reloading and retrying next attempt`);
      flushTelemetry();
      await recoverFromPageWedge();
      continue;
    } finally {
      activeAttemptDeadlineAt = null;
    }
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

  if (entry.completed) {
    await saveAfterObjective(trigger.id);
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

async function recoverFromPageWedge() {
  const boot = bootUrl();
  await page.goto(boot.toString(), { waitUntil: "networkidle", timeout: 60000 });
  await waitForFunctionWithWatchdog("page-wedge-recovery:hooks", () => (
    Boolean(globalThis.__firstSceneDebug) &&
    typeof globalThis.__debugHeal === "function" &&
    typeof globalThis.__setStoryFlag === "function"
  ), { timeout: 30000 });
  await settleWorld({ maxPresses: 80, reason: "page-wedge-recovery" });
  for (const flag of [...earnedFlags]) await forceFlag(flag);
  await recoverParty("page-wedge-recovery");
}

// After a flag re-assertion, the roster can still be short a recruit (defeat
// reload restores the party snapshot, but forced recruit flags do not re-add
// members). Re-run the authored recruit for any earned recruit flag whose
// charId is missing from the live roster.
async function recoverParty(reason) {
  const roster = await page.evaluate(() => (
    typeof globalThis.__partyRoster === "function" ? globalThis.__partyRoster() : null
  )).catch((error) => rethrowPageWedged(error, null));
  const present = new Set(roster?.party ?? []);
  for (const { charId, flag } of recruitByTrigger.values()) {
    if (!earnedFlags.has(flag) || present.has(charId)) continue;
    const result = await evaluateWithWatchdog("recoverParty:recruit", (id) => {
      if (typeof globalThis.__recruit !== "function") return { ok: false, reason: "missing __recruit" };
      return { ok: true, party: globalThis.__recruit(id) };
    }, charId);
    telemetry.cheats.push({ kind: "party-recovery", charId, reason, atMs: elapsedMs() });
    log(`  [CHEAT] party-recovery __recruit(${charId}) (${reason}): ${JSON.stringify(result)}`);
  }
}

// Instant save via the "p" hotkey (no dialog). The hotkey no-ops while a menu,
// dialogue, event, door fade, or pending battle is active, so settle first, then
// confirm the save landed by watching lastSavedAt change.
async function saveAfterObjective(objectiveId) {
  await settleWorld({ maxPresses: 60, reason: `pre-save:${objectiveId}` });
  const readSavedAt = () => page.evaluate(() => ({
    lastSavedAt: globalThis.__firstSceneDebug?.lastSavedAt ?? null,
    hasSave: globalThis.__firstSceneDebug?.hasSave ?? false
  })).catch((error) => rethrowPageWedged(error, { lastSavedAt: null, hasSave: false }));
  const before = await readSavedAt();
  let after = before;
  let ok = false;
  for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
    await tap("p", 400);
    after = await readSavedAt();
    ok = after.lastSavedAt !== before.lastSavedAt && Boolean(after.lastSavedAt);
  }
  telemetry.saves.push({ objectiveId, atMs: elapsedMs(), savedAt: after.lastSavedAt, ok });
  log(`  [save] ${objectiveId}: ${ok ? `ok @ ${after.lastSavedAt}` : "no lastSavedAt change (save may be guarded)"}`);
  flushTelemetry();
}

// Battle-end settle that tolerates the expected reload after a DEFEAT. On defeat
// the scene restores from save (or new game) and the execution context is torn
// down mid-evaluate; retry across a 60s budget instead of firing the 30s wedge.
async function settleAfterDefeat(trigger) {
  const deadline = performance.now() + 60000;
  while (performance.now() < deadline) {
    const ready = await page.evaluate(() => (
      Boolean(globalThis.__firstSceneDebug) &&
      typeof globalThis.__debugHeal === "function" &&
      typeof globalThis.__setStoryFlag === "function" &&
      Boolean(globalThis.__firstSceneDebug?.player)
    )).catch(() => false);
    if (ready) {
      await settleWorld({ maxPresses: 60, reason: "post-defeat" });
      return true;
    }
    await page.waitForTimeout(500);
  }
  log(`  [settle] post-defeat hooks absent after 60s for ${trigger?.id ?? "?"}; treating as wedge`);
  throw new PageWedgedError("settleAfterDefeat", 60000);
}

function inBattle(state) {
  const phase = state?.b?.phase;
  return ["enter-transition", "menu", "command-input", "execution", "enemy-rolling", "player-rolling"].includes(phase);
}

async function hotelHeal(objectiveId, objectiveEntry) {
  await settleDebugHooks(`pre-heal:${objectiveId}`);
  const before = await evaluateWithWatchdog("hotelHeal:before", () => globalThis.__firstSceneDebug?.overworldHud ?? null)
    .catch((error) => rethrowPageWedged(error, null));
  const result = await evaluateWithWatchdog("hotelHeal:debugHeal", () => {
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
    const result = await evaluateWithWatchdog("forceAdvance:recruit", (charId) => {
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
    const result = await evaluateWithWatchdog("forceAdvance:setFlag", (storyFlag) => {
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

async function routeToTrigger(trigger, target, attemptEntry, objectiveEntry) {
  const started = performance.now();
  let routeLengthPx = 0;
  let routeCells = 0;
  let previousStuckPlayer = null;
  let consecutiveStuck = 0;

  for (let macro = 0; macro < 10; macro += 1) {
    if (attemptDeadlineExpired()) return routeResult("attempt-deadline");
    await waitForWorldHooks();
    let state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) {
      return routeResult("battle");
    }
    const liveTarget = liveTargetFor(trigger, target, state, objectiveEntry);
    const player = state.o?.player;
    if (!player) {
      await page.waitForTimeout(250);
      continue;
    }
    if (trigger.area && pointInArea(player, trigger.area)) {
      return routeResult("arrived");
    }
    if (dist(player, liveTarget) < (trigger.boss ? 18 : 28)) {
      break;
    }

    const plan = await planPath(player, liveTarget, {
      margin: ROUTE_MARGIN,
      blockDoors: true,
      blockNpcs: true,
      targetExclusionRadius: trigger.boss ? 32 : 0
    });
    if (!plan) {
      const recovery = await recoverRouteFailure(trigger, target, liveTarget, attemptEntry, player, "astar-no-path", "noroute", objectiveEntry);
      if (recovery === "continue") continue;
      return routeResult(recovery);
    }

    routeLengthPx += plan.lengthPx;
    routeCells += plan.cells;
    if (macro === 0) {
      log(`    [route] (${round(player.x)},${round(player.y)}) -> (${round(liveTarget.x)},${round(liveTarget.y)}), ${plan.cells} cells, ${plan.waypoints.length} wp`);
    }
    const follow = await followWaypoints(plan.waypoints);
    if (follow === "battle") return routeResult("battle");
    if (follow === "door") continue;
    if (follow === "attempt-deadline") return routeResult("attempt-deadline");
    if (follow === "stuck") {
      const stuckState = await peek();
      const stuckPlayer = stuckState.o?.player ?? player;
      const stuckTarget = liveTargetFor(trigger, target, stuckState, objectiveEntry);
      consecutiveStuck = previousStuckPlayer && dist(stuckPlayer, previousStuckPlayer) < 8
        ? consecutiveStuck + 1
        : 1;
      previousStuckPlayer = stuckPlayer ? { x: stuckPlayer.x, y: stuckPlayer.y } : null;
      if (consecutiveStuck >= 2) {
        const recovery = await recoverRouteFailure(trigger, target, stuckTarget, attemptEntry, stuckPlayer, "follow-stuck", "stalled", objectiveEntry);
        if (recovery === "continue") continue;
        return routeResult(recovery);
      }
      await hold(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"][macro % 4], 220);
    } else {
      previousStuckPlayer = null;
      consecutiveStuck = 0;
    }
  }

  const final = await finalApproach(trigger, target, objectiveEntry);
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

async function recoverRouteFailure(trigger, staticTarget, routeTarget, attemptEntry, player, reason, exhaustedStatus, objectiveEntry) {
  recordRouteMiss(trigger, routeTarget, attemptEntry, player, reason);
  const hopped = await tryDoorHopToward(routeTarget, attemptEntry);
  if (hopped === "attempt-deadline") return "attempt-deadline";
  if (hopped) return "continue";
  if (!attemptEntry.warpNear) {
    attemptEntry.warpNear = true;
    return tryWarpNear(trigger, staticTarget, player, objectiveEntry);
  }
  return exhaustedStatus;
}

function recordRouteMiss(trigger, target, attemptEntry, player, reason) {
  const miss = {
    atMs: elapsedMs(),
    from: { x: round(player?.x), y: round(player?.y) },
    to: { x: round(target.x), y: round(target.y) },
    reason
  };
  attemptEntry.unreachableRoutes.push(miss);
  const label = reason === "astar-no-path" ? "UNREACHABLE" : "STUCK";
  log(`    [route] ${label} ${trigger.id}: (${miss.from.x},${miss.from.y}) -> (${miss.to.x},${miss.to.y}) reason=${reason}`);
}

async function tryWarpNear(trigger, target, fallbackPlayer, objectiveEntry) {
  const preWarpState = await peek();
  const preWarp = preWarpState.o?.player
    ? { x: preWarpState.o.player.x, y: preWarpState.o.player.y }
    : { x: fallbackPlayer?.x, y: fallbackPlayer?.y };
  const warpTarget = liveTargetFor(trigger, target, preWarpState, objectiveEntry);
  const candidates = await warpNearCandidates(warpTarget, Boolean(trigger.boss));
  let candidatesTried = 0;

  for (const spot of candidates ?? []) {
    if (attemptDeadlineExpired()) return "attempt-deadline";
    const candidateStartState = await peek();
    if (inBattle(candidateStartState)) return "battle";
    candidatesTried += 1;
    const warped = await warpTo(spot, `warp-near:${trigger.id}`);
    if (!warped) continue;
    await settleDebugHooks(`warp-near:${trigger.id}`);
    await page.waitForTimeout(500);
    const landingState = await peek();
    const landing = landingState.o?.player;
    if (!landing) continue;
    const mobility = await probeMobility();
    const liveState = await peek();
    if (inBattle(liveState)) return "battle";
    const live = liveState.o?.player;
    if (!live || mobility.maxDisplacement < 6) continue;
    const liveTarget = liveTargetFor(trigger, target, liveState, objectiveEntry);
    const plan = await planPath(live, liveTarget, {
      margin: ROUTE_MARGIN,
      blockDoors: true,
      blockNpcs: true,
      targetExclusionRadius: trigger.boss ? 32 : 0
    });
    if (!plan) continue;

    telemetry.cheats.push({
      kind: "warp-near",
      objective: trigger.id,
      to: spot,
      atMs: elapsedMs(),
      landing: { x: round(landing.x), y: round(landing.y) },
      mobility
    });
    log(`  [CHEAT] warp-near ${trigger.id} -> (${round(landing.x)},${round(landing.y)}) (commute skipped, fights real)`);
    await page.waitForTimeout(900);
    if (trigger.area) {
      const exitStatus = await walkOutOfArea(trigger.area);
      if (exitStatus === "attempt-deadline") return "attempt-deadline";
    }
    await dismissBlockingDialogs();
    return "continue";
  }

  if (Number.isFinite(preWarp.x) && Number.isFinite(preWarp.y)) {
    await warpTo(preWarp, `warp-near-restore:${trigger.id}`);
    await settleDebugHooks(`warp-near-restore:${trigger.id}`);
  }
  telemetry.cheats.push({ kind: "warp-near-failed", objective: trigger.id, candidatesTried });
  log(`  [CHEAT] warp-near-failed ${trigger.id}: tried ${candidatesTried} candidates`);
  return "noroute";
}

async function warpNearCandidates(target, isBoss = false) {
  const offsets = [
    { dx: 0, dy: 420 }, { dx: 0, dy: -420 }, { dx: 420, dy: 0 }, { dx: -420, dy: 0 },
    { dx: 0, dy: 160 }, { dx: 0, dy: -160 }, { dx: 160, dy: 0 }, { dx: -160, dy: 0 },
    { dx: 0, dy: 240 }, { dx: 0, dy: -240 }, { dx: 240, dy: 0 }, { dx: -240, dy: 0 },
    { dx: 0, dy: 560 }, { dx: 0, dy: -560 }, { dx: 560, dy: 0 }, { dx: -560, dy: 0 },
    { dx: 300, dy: 300 }, { dx: 300, dy: -300 }, { dx: -300, dy: 300 }, { dx: -300, dy: -300 }
  ];
  if (isBoss) {
    offsets.push(
      { dx: 0, dy: 120 }, { dx: 0, dy: -120 }, { dx: 120, dy: 0 }, { dx: -120, dy: 0 },
      { dx: 0, dy: 160 }, { dx: 0, dy: -160 }, { dx: 160, dy: 0 }, { dx: -160, dy: 0 },
      { dx: 140, dy: 140 }, { dx: 140, dy: -140 }, { dx: -140, dy: 140 }, { dx: -140, dy: -140 }
    );
  }
  return evaluateWithWatchdog("warp-near:candidates", ({ tx, ty, offsets }) => {
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
    const seen = new Set();
    const spots = [];
    for (const offset of offsets) {
      const spot = snap(tx + offset.dx, ty + offset.dy);
      if (!spot) continue;
      const key = `${Math.round(spot.x)},${Math.round(spot.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spots.push(spot);
    }
    return spots;
  }, { tx: target.x, ty: target.y, offsets });
}

async function warpTo(point, operation) {
  return evaluateWithWatchdog(operation, ({ x, y }) => {
    if (typeof globalThis.__warpTo !== "function") return false;
    globalThis.__warpTo(x, y);
    return true;
  }, point);
}

async function probeMobility() {
  const directions = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"];
  const samples = [];
  let maxDisplacement = 0;
  for (const key of directions) {
    const before = (await peek()).o?.player;
    if (!before) {
      samples.push({ key, displacement: 0 });
      continue;
    }
    await hold(key, 200);
    const after = (await peek()).o?.player;
    const displacement = after ? dist(before, after) : 0;
    maxDisplacement = Math.max(maxDisplacement, displacement);
    samples.push({
      key,
      dx: after ? round(after.x - before.x) : 0,
      dy: after ? round(after.y - before.y) : 0,
      displacement: round(displacement)
    });
  }
  return {
    maxDisplacement: Number(maxDisplacement.toFixed(2)),
    samples
  };
}

async function walkOutOfArea(area) {
  let directions = null;
  let directionIndex = 0;
  for (let step = 0; step < 40; step += 1) {
    if (attemptDeadlineExpired()) return "attempt-deadline";
    const state = await peek();
    const player = state.o?.player;
    if (!player || !pointInArea(player, area)) return "ok";
    if (state.o?.dialogueOpen || state.o?.inputLocked) {
      await tap("z", 200);
      continue;
    }
    if (!directions) directions = areaExitDirections(player, area);
    const key = directions[directionIndex]?.key ?? "ArrowDown";
    const before = { x: player.x, y: player.y };
    await hold(key, 140);
    const after = (await peek()).o?.player;
    if (!after || dist(before, after) < 4) {
      directionIndex = (directionIndex + 1) % directions.length;
    }
  }
  return "ok";
}

function areaExitDirections(player, area) {
  return [
    { key: "ArrowLeft", distance: Math.max(0, player.x - area.x + 1) },
    { key: "ArrowRight", distance: Math.max(0, area.x + area.w - player.x + 1) },
    { key: "ArrowUp", distance: Math.max(0, player.y - area.y + 1) },
    { key: "ArrowDown", distance: Math.max(0, area.y + area.h - player.y + 1) }
  ].sort((a, b) => a.distance - b.distance);
}

async function dismissBlockingDialogs() {
  for (let d = 0; d < 10; d += 1) {
    const state = await peek();
    if (!state.o?.dialogueOpen && !state.o?.inputLocked) break;
    await tap("z", 220);
  }
}

async function waitForWorldHooks() {
  for (let i = 0; i < 30; i += 1) {
    const ready = await evaluateWithWatchdog("waitForWorldHooks", () => (
      typeof globalThis.__solidAt === "function" &&
      Boolean(globalThis.__firstSceneDebug?.player)
    )).catch((error) => rethrowPageWedged(error, false));
    if (ready) return;
    await page.waitForTimeout(200);
  }
}

async function settleDebugHooks(reason) {
  try {
    await waitForFunctionWithWatchdog(`settleDebugHooks:${reason}`, () => (
      Boolean(globalThis.__firstSceneDebug) &&
      typeof globalThis.__debugHeal === "function" &&
      typeof globalThis.__setStoryFlag === "function"
    ), { timeout: DEBUG_HOOK_SETTLE_TIMEOUT_MS });
    return true;
  } catch (error) {
    if (error instanceof PageWedgedError) throw error;
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
    blockNpcs: options.blockNpcs ?? true,
    target,
    targetExclusionRadius: options.targetExclusionRadius ?? 0
  });
  if (!grid) return null;

  const startCell = w2c(grid, from.x, from.y);
  const goalCell = w2c(grid, target.x, target.y);
  const start = nearestOpen(grid.blocked, grid.cols, grid.rows, startCell.c, startCell.r, 2);
  const goal = nearestOpen(grid.blocked, grid.cols, grid.rows, goalCell.c, goalCell.r);
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
  const { step, blockDoors, blockNpcs, target, targetExclusionRadius = 0 } = options;
  const solid = await evaluateWithWatchdog("buildGrid:solid", ({ x0, y0, x1, y1, step }) => {
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
    const npcs = await evaluateWithWatchdog("buildGrid:npcs", () => (
      globalThis.__firstSceneDebug?.npcs ?? []
    ).filter((npc) => npc.visible).map((npc) => ({ x: npc.x, y: npc.y })))
      .catch((error) => rethrowPageWedged(error, []));
    for (const npc of npcs) {
      if (targetExclusionRadius > 0 && target && dist(npc, target) <= targetExclusionRadius) continue;
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
    if (attemptDeadlineExpired()) return "attempt-deadline";
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

async function finalApproach(trigger, target, objectiveEntry) {
  let lastX = -1e9;
  let lastY = -1e9;
  for (let i = 0; i < 85; i += 1) {
    if (attemptDeadlineExpired()) return "attempt-deadline";
    const state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) return "battle";
    const liveTarget = liveTargetFor(trigger, target, state, objectiveEntry);
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
    const dx = liveTarget.x - player.x;
    const dy = liveTarget.y - player.y;
    if (trigger.boss && Math.hypot(dx, dy) < 48) return "arrived";
    if (i > 0 && moved < 2) {
      await hold(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"][i % 4], 140);
    } else {
      await hold(dirToward(dx, dy), 120);
    }
  }
  const state = await peek();
  const player = state.o?.player;
  const liveTarget = liveTargetFor(trigger, target, state, objectiveEntry);
  if (inBattle(state)) return "battle";
  if (trigger.area && player && pointInArea(player, trigger.area)) return "arrived";
  if (trigger.boss && player && dist(player, liveTarget) < 48) return "arrived";
  return "stalled";
}

async function pressIntoBossGate(trigger, target, objectiveEntry) {
  if (!trigger.boss) return "arrived";
  log(`    [gate] pressing into ${trigger.id} at (${round(target.x)},${round(target.y)})`);
  for (let i = 0; i < 12; i += 1) {
    const state = await peek();
    recordRouteSample(state);
    if (inBattle(state)) return "battle";
    const liveTarget = liveTargetFor(trigger, target, state, objectiveEntry);
    if (state.o?.doorFadeActive) {
      await waitForDoorSettle("pressIntoBossGate door transition");
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
    await hold(dirToward(liveTarget.x - player.x, liveTarget.y - player.y), 180);
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
    if (attemptDeadlineExpired()) return "attempt-deadline";
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
      if (followed === "attempt-deadline") return "attempt-deadline";
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
  const approaches = await evaluateWithWatchdog("doorApproaches", ({ x, y }) => {
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
  }, { x: door.worldPixel.x, y: door.worldPixel.y }).catch((error) => rethrowPageWedged(error, []));
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
  return evaluateWithWatchdog("lastDoorSnapshot", () => {
    const door = globalThis.__firstSceneDebug?.lastDoor;
    return door ? {
      from: { x: door.from.x, y: door.from.y },
      to: { x: door.to.x, y: door.to.y }
    } : null;
  }).catch((error) => rethrowPageWedged(error, null));
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
    if (attemptDeadlineExpired()) return "attempt-deadline";
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
  return dist(player, liveTargetFor(trigger, target, state)) <= radius;
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
  const state = await evaluateWithWatchdog("snapshotWallState", () => {
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
  }).catch((error) => {
    if (error instanceof PageWedgedError) throw error;
    return { error: String(error) };
  });
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
