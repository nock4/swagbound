import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

export const FLEETS = ["talk", "tiles", "doors", "battles", "systems", "minigames", "story", "vision"];

const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_FLEET_BUDGET_MS = {
  talk: 2.5 * HOUR_MS,
  tiles: 4 * HOUR_MS,
  doors: HOUR_MS,
  battles: 1.5 * HOUR_MS,
  systems: HOUR_MS,
  minigames: HOUR_MS,
  story: 30 * 60 * 1000,
  vision: 2 * HOUR_MS
};

export class BughuntTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "BughuntTimeoutError";
  }
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function generatedPath(ctx, file) {
  return path.join(ctx.root, "apps/game/public/generated", file);
}

export function readGenerated(ctx, file) {
  return readJson(generatedPath(ctx, file));
}

export function contentPath(ctx, file) {
  return path.join(ctx.root, "content", file);
}

export function readContent(ctx, file) {
  return readJson(contentPath(ctx, file));
}

export function pointValid(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function dist(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

export function roundedAt(point) {
  return pointValid(point) ? { x: Math.round(point.x), y: Math.round(point.y) } : undefined;
}

export function limitFor(ctx, full, smoke) {
  return ctx.smoke ? smoke : full;
}

export function sampleStable(items, count, seed = 0x51a7c0de) {
  if (items.length <= count) return [...items];
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return items
    .map((item) => ({ item, sort: rand() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, count)
    .map((entry) => entry.item);
}

export class Ledger {
  constructor(options = {}) {
    this.entries = [];
    this.seen = new Set();
    this.flushEvery = options.flushEvery ?? 0;
    this.onFlush = options.onFlush;
    this.newSinceFlush = 0;
    this.flushing = false;
  }

  configureFlush(options = {}) {
    this.flushEvery = options.flushEvery ?? this.flushEvery;
    this.onFlush = options.onFlush ?? this.onFlush;
  }

  flush(reason = "manual") {
    if (!this.onFlush || this.flushing) return;
    this.flushing = true;
    try {
      this.onFlush(reason);
      this.newSinceFlush = 0;
    } finally {
      this.flushing = false;
    }
  }

  push(entry) {
    const at = roundedAt(entry.at);
    const rx = at ? Math.round(at.x / 64) * 64 : "na";
    const ry = at ? Math.round(at.y / 64) * 64 : "na";
    const key = `${entry.kind}:${rx},${ry}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.add(key);
    this.entries.push({
      severity: "medium",
      ...entry,
      ...(at ? { at } : {})
    });
    this.newSinceFlush += 1;
    if (this.flushEvery > 0 && this.newSinceFlush >= this.flushEvery) {
      this.flush("finding-threshold");
    }
    return true;
  }
}

export class PagePool {
  constructor(ctx, browser, maxPages) {
    this.ctx = ctx;
    this.browser = browser;
    this.maxPages = Math.max(1, maxPages);
    this.active = 0;
    this.waiters = [];
  }

  async acquire(fleet, options = {}) {
    await this.takeSlot();
    let session;
    try {
      session = await bootPage(this.ctx, this.browser, fleet, options);
      return {
        ...session,
        release: async () => {
          try {
            await session.page.close();
          } finally {
            this.releaseSlot();
          }
        }
      };
    } catch (error) {
      this.releaseSlot();
      throw error;
    }
  }

  async takeSlot() {
    if (this.active < this.maxPages) {
      this.active += 1;
      return;
    }
    await new Promise((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  releaseSlot() {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

export async function createRuntimeContext(base) {
  const world = readGenerated(base, "world.json");
  const navmeshJson = readGenerated(base, "navmesh.json");
  const { decodeNavmesh, nearestComponentAt } = await tsImport(
    pathToFileURL(path.join(base.root, "apps/game/src/navmesh.ts")).href,
    import.meta.url
  );
  const navmesh = decodeNavmesh(navmeshJson);
  return {
    ...base,
    world,
    navmeshJson,
    navmesh,
    nearestComponentAt: (point, radius = 2) => nearestComponentAt(navmesh, point, radius),
    stats: {}
  };
}

async function bootPage(ctx, browser, fleet, options = {}) {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  if (ctx.routePage) {
    await ctx.routePage(page);
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push({ at: Date.now(), message: String(error?.message || error).slice(0, 600) }));
  const params = new URLSearchParams();
  if (options.nointro !== false) params.set("nointro", "1");
  params.set("spawn", options.spawn ?? "2144,1788");
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== null && value !== false) params.set(key, String(value));
  }
  if (options.flags?.length) params.set("flags", options.flags.join(","));
  const url = params.toString() ? `${ctx.base}/?${params.toString()}` : `${ctx.base}/`;
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  if (options.waitForWorld !== false) {
    await waitForWorld(page, 60000);
    await drainDialogue(page, 14, 250);
  }
  if (options.clearSave !== false) {
    await page.evaluate(() => globalThis.localStorage?.removeItem?.("coilsnake-tutorial-experiment:save:0")).catch(() => {});
  }
  return { page, fleet, errors, lastAction: "boot" };
}

export async function waitForWorld(page, timeout = 30000) {
  await page.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout });
}

export async function state(page) {
  return page.evaluate(() => {
    const s = globalThis.__firstSceneDebug ?? null;
    const b = globalThis.__battleDebug ?? null;
    return {
      world: s,
      battle: b,
      player: s?.player ? { x: s.player.x, y: s.player.y } : null,
      dialogueOpen: Boolean(s?.dialogueOpen),
      inputLocked: Boolean(s?.inputLocked),
      facing: s?.facing ?? null,
      flags: s?.flags ?? []
    };
  });
}

export async function tap(page, key, delay = 160) {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
}

export async function hold(page, key, ms = 180) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
}

export async function drainDialogue(page, presses = 10, delay = 220) {
  for (let i = 0; i < presses; i += 1) {
    const open = await page.evaluate(() => Boolean(globalThis.__firstSceneDebug?.dialogueOpen));
    if (!open) break;
    await tap(page, "KeyZ", delay);
  }
}

export async function warpTo(page, point) {
  await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x: point.x, y: point.y });
  await page.waitForTimeout(260);
}

export function directionToward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "ArrowLeft" : "ArrowRight";
  return dy < 0 ? "ArrowUp" : "ArrowDown";
}

export async function facePoint(page, target) {
  const s = await state(page);
  if (!s.player) return;
  await hold(page, directionToward(s.player, target), 55);
}

export function decodeCellsByComponent(navmeshJson, maxCells = Infinity) {
  const byComponent = new Map();
  let total = 0;
  for (let y = 0; y < navmeshJson.rows.length; y += 1) {
    let x = 0;
    for (const [componentId, runLength] of navmeshJson.rows[y]) {
      if (componentId !== 0) {
        let list = byComponent.get(componentId);
        if (!list) {
          list = [];
          byComponent.set(componentId, list);
        }
        for (let dx = 0; dx < runLength && total < maxCells; dx += 1) {
          list.push({ x: x + dx, y });
          total += 1;
        }
      }
      x += runLength;
      if (total >= maxCells) break;
    }
    if (total >= maxCells) break;
  }
  return { byComponent, total };
}

export function fleetBudgetMs(fleet) {
  const envName = `${fleet.toUpperCase()}_BUDGET_MS`;
  const parsed = Number.parseInt(process.env[envName] ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_FLEET_BUDGET_MS[fleet] ?? HOUR_MS;
}

export function createFleetRunControl(ctx, fleet, options = {}) {
  const budgetMs = options.budgetMs ?? fleetBudgetMs(fleet);
  const heartbeatMs = options.heartbeatMs ?? 60000;
  const started = Date.now();
  const doneLabel = options.doneLabel ?? "items";
  const currentLabel = options.currentLabel ?? "current";
  let done = options.done ?? 0;
  let total = options.total ?? options.totalItems;
  let current = "starting";
  let budgetReported = false;
  const heartbeat = setInterval(() => {
    ctx.log(`${fleet} heartbeat: ${formatProgress(done, total, doneLabel)}; ${currentLabel} ${current}; elapsed ${formatDuration(Date.now() - started)}; budget ${formatDuration(budgetMs)}`);
  }, heartbeatMs);
  heartbeat.unref?.();

  function update(progress = {}) {
    if (progress.done !== undefined) done = progress.done;
    if (progress.total !== undefined) total = progress.total;
    if (progress.current !== undefined) current = progress.current;
  }

  function remainingMs() {
    return Math.max(0, budgetMs - (Date.now() - started));
  }

  function budgetExpired() {
    return remainingMs() <= 0;
  }

  function reportBudget(reason = `budget exhausted during ${current}`) {
    if (budgetReported) return;
    budgetReported = true;
    ctx.log(`${fleet} budget expired: ${formatProgress(done, total, doneLabel)}; ${reason}`);
  }

  async function runItem(label, fn, itemOptions = {}) {
    update({ current: label });
    if (budgetExpired()) {
      reportBudget(`before ${label}`);
      return { ok: false, budgetExpired: true };
    }
    const remaining = remainingMs();
    const task = Promise.resolve().then(fn);
    task.catch(() => {});
    try {
      const value = await runWithTimeout(() => task, remaining, `${fleet} budget expired during ${label}`);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof BughuntTimeoutError) {
        reportBudget(`during ${label}`);
        return { ok: false, budgetExpired: true };
      }
      ctx.ledger.push({
        fleet,
        kind: itemOptions.kind ?? `${fleet}-item-error`,
        severity: itemOptions.severity ?? "blocker",
        at: itemOptions.at,
        detail: `${label} threw: ${String(error?.stack || error?.message || error).slice(0, 1500)}`,
        evidence: itemOptions.evidence
      });
      return { ok: false, error };
    } finally {
      if (itemOptions.count !== false) {
        done += 1;
      }
    }
  }

  function stop() {
    clearInterval(heartbeat);
  }

  return {
    started,
    budgetMs,
    update,
    remainingMs,
    budgetExpired,
    reportBudget,
    runItem,
    stop,
    get done() { return done; },
    get total() { return total; },
    get current() { return current; }
  };
}

export async function runWithTimeout(fn, timeoutMs, message) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new BughuntTimeoutError(message);
  }
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new BughuntTimeoutError(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function cellCenter(ctx, cell) {
  return {
    x: cell.x * ctx.navmeshJson.cellSize + ctx.navmeshJson.cellSize / 2,
    y: cell.y * ctx.navmeshJson.cellSize + ctx.navmeshJson.cellSize / 2
  };
}

export function isWalkableCell(ctx, x, y) {
  return ctx.navmesh.componentAtCell(x, y) !== 0;
}

export function nearestWalkableAdjacent(ctx, target) {
  const cellSize = ctx.navmeshJson.cellSize;
  const tx = Math.floor(target.x / cellSize);
  const ty = Math.floor(target.y / cellSize);
  const preferred = [
    { x: tx, y: ty + 2 },
    { x: tx, y: ty - 2 },
    { x: tx + 2, y: ty },
    { x: tx - 2, y: ty },
    { x: tx, y: ty + 1 },
    { x: tx, y: ty - 1 },
    { x: tx + 1, y: ty },
    { x: tx - 1, y: ty }
  ];
  for (const cell of preferred) {
    if (isWalkableCell(ctx, cell.x, cell.y)) return cellCenter(ctx, cell);
  }
  let best;
  for (let radius = 1; radius <= 8; radius += 1) {
    for (let y = ty - radius; y <= ty + radius; y += 1) {
      for (let x = tx - radius; x <= tx + radius; x += 1) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== radius || !isWalkableCell(ctx, x, y)) continue;
        const point = cellCenter(ctx, { x, y });
        if (!best || dist(point, target) < dist(best, target)) best = point;
      }
    }
    if (best) return best;
  }
  return { x: target.x, y: target.y + 32 };
}

export async function afterAction(ctx, session, precededBy = session.lastAction ?? "action") {
  const page = session.page;
  await drainDialogue(page, 10, 170);
  const afterDrain = await state(page);
  if (afterDrain.dialogueOpen) {
    ctx.ledger.push({
      fleet: session.fleet,
      kind: "dialogue-stuck-open",
      severity: "blocker",
      at: afterDrain.player,
      detail: `dialogue stayed open after 10 Z presses; preceded by ${precededBy}`,
      evidence: { dialogueText: afterDrain.world?.dialogueText ?? afterDrain.world?.revealedText ?? "" }
    });
    return false;
  }

  const errors = session.errors.splice(0);
  if (errors.length > 0) {
    ctx.ledger.push({
      fleet: session.fleet,
      kind: "pageerror",
      severity: "blocker",
      at: afterDrain.player,
      detail: `pageerror since last check after ${precededBy}`,
      evidence: errors
    });
    return false;
  }

  if (!afterDrain.player) {
    ctx.ledger.push({
      fleet: session.fleet,
      kind: "no-player-after-action",
      severity: "blocker",
      detail: `world player missing after ${precededBy}`
    });
    return false;
  }

  const start = afterDrain.player;
  const startInsideSolid = await page.evaluate(({ x, y }) => {
    const solid = globalThis.__solidAt;
    return typeof solid === "function" ? Boolean(solid(x, y)) : false;
  }, start).catch(() => false);
  if (startInsideSolid) {
    return true;
  }

  let probe = await movementProbePass(page, start, 600);
  if (!probe.moved) {
    await page.waitForTimeout(500);
    await warpTo(page, start);
    probe = await movementProbePass(page, start, 600);
  }
  if (!probe.moved) {
    const allBlocked = await page.evaluate(({ x, y }) => {
      const solid = globalThis.__solidAt;
      if (typeof solid !== "function") return false;
      return [
        solid(x, y - 14),
        solid(x, y + 14),
        solid(x - 14, y),
        solid(x + 14, y)
      ].every(Boolean);
    }, start).catch(() => false);
    if (!allBlocked) {
      ctx.ledger.push({
        fleet: session.fleet,
        kind: "player-cannot-move",
        severity: "blocker",
        at: start,
        detail: `two-pass movement probe failed after ${precededBy}`,
        evidence: { allFourBlockedByCollision: allBlocked, lastProbe: probe }
      });
      return false;
    }
  }
  return true;
}

async function movementProbePass(page, start, holdMs) {
  const moves = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  let last;
  for (const key of moves) {
    last = await holdAndReadMotion(page, key, holdMs);
    if (last.player && dist(start, last.player) > 2) {
      return { moved: true, key, via: "position", last };
    }
    if (last.motion.moving || last.motion.velocityMagnitude > 0.1) {
      return { moved: true, key, via: "debug-motion", last };
    }
    await warpTo(page, start);
  }
  return { moved: false, last };
}

async function holdAndReadMotion(page, key, ms) {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(ms);
    const snap = await state(page);
    const motion = await page.evaluate(() => {
      const world = globalThis.__firstSceneDebug ?? {};
      const owners = typeof globalThis.__inputOwners === "function" ? globalThis.__inputOwners() : {};
      const velocity = owners?.velocity ?? world.velocity ?? world.playerVelocity ?? {};
      const vx = Number(velocity.x ?? world.velocityX ?? 0);
      const vy = Number(velocity.y ?? world.velocityY ?? 0);
      return {
        moving: Boolean(world.moving || owners?.moving),
        velocityMagnitude: Math.hypot(Number.isFinite(vx) ? vx : 0, Number.isFinite(vy) ? vy : 0),
        inputLocked: Boolean(world.inputLocked || owners?.inputLocked)
      };
    }).catch(() => ({ moving: false, velocityMagnitude: 0, inputLocked: false }));
    return { player: snap.player, motion };
  } finally {
    await page.keyboard.up(key).catch(() => {});
    await page.waitForTimeout(80);
  }
}

function formatProgress(done, total, label) {
  const base = `${done}${Number.isFinite(total) ? `/${total}` : ""} ${label}`;
  if (!Number.isFinite(total) || total <= 0) return base;
  return `${base} (${Math.round((done / total) * 1000) / 10}%)`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export async function screenshot(ctx, page, fleet, label, point) {
  const at = roundedAt(point) ?? { x: 0, y: 0 };
  const safe = String(label).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
  const file = path.join(ctx.out, "shots", `${fleet}-${safe}-${at.x}-${at.y}-${Date.now()}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return file;
}

export function codexVision(image, prompt, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const cp = spawn("codex", ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=medium", "-i", image], {
      stdio: ["pipe", "pipe", "ignore"]
    });
    let out = "";
    cp.stdout.on("data", (data) => { out += data; });
    cp.on("error", () => resolve(null));
    cp.stdin.write(prompt);
    cp.stdin.end();
    const timer = setTimeout(() => {
      cp.kill("SIGKILL");
      resolve(null);
    }, timeoutMs);
    cp.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").reverse().find((candidate) => candidate.trim().startsWith("{"));
      try {
        resolve(JSON.parse(line.trim()));
      } catch {
        resolve(null);
      }
    });
  });
}
