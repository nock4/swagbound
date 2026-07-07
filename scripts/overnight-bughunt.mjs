// Overnight bug discovery + fix run. Drives codex exec (OpenAI billing) + playwright.
// Usage:  node scripts/overnight-bughunt.mjs            (full run, ~6-8h)
//         node scripts/overnight-bughunt.mjs --smoke    (3-minute plumbing check)
//
// Phases: 1 discovery fleets -> 2 triage ledger -> 3 fix loop (safe subset) -> 4 report.
// Git: works on branch overnight/bughunt-<date>, commits locally, NEVER pushes.
// Server: boots its own vite on :5199 so the dev tunnel on :5174 is untouched.
import { chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const SMOKE = process.argv.includes("--smoke");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "tmp/bughunt");
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const LIMIT = (full, smoke) => (SMOKE ? smoke : full);
const ledger = [];               // { fleet, kind, severity, at:{x,y}, detail, evidence, fix? }
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

// ---------- setup ----------
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6, ...opts });
const today = sh("date +%Y%m%d").trim();
const BRANCH = `overnight/bughunt-${today}`;
try {
  sh(`git checkout -q -B ${BRANCH}`);
  log(`branch ${BRANCH}`);
} catch (e) {
  log(`branch checkout skipped: ${String(e.stderr || e.message || e).trim().slice(0, 180)}`);
}
const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], { cwd: path.join(ROOT, "apps/game"), stdio: "ignore", detached: false });
await new Promise((r) => setTimeout(r, 4000));

const world = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/world.json"), "utf8"));
const navmeshJson = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/navmesh.json"), "utf8"));
const npcOverrides = JSON.parse(fs.readFileSync(path.join(ROOT, "content/npc-overrides.json"), "utf8"));
const music = JSON.parse(fs.readFileSync(path.join(ROOT, "content/music-manifest.json"), "utf8"));
const { resolveDoorWarpLanding } = await tsImport(pathToFileURL(path.join(ROOT, "apps/game/src/doorTriggers.ts")).href, import.meta.url);
const { decodeNavmesh, nearestComponentAt } = await tsImport(pathToFileURL(path.join(ROOT, "apps/game/src/navmesh.ts")).href, import.meta.url);
const navmesh = decodeNavmesh(navmeshJson);
const collisionGrid = {
  cellSize: world.collision.cellSize,
  width: world.collision.width,
  height: world.collision.height
};
const MAP_BOUNDS = {
  width: navmeshJson.width * navmeshJson.cellSize,
  height: navmeshJson.height * navmeshJson.cellSize
};
const KNOWN_DECORATION_BASELINE = knownDecorationBaseline();

// one shared browser; helper to boot a controlled page (opening completed)
let browser;
let browserUnavailableDetail;
async function getBrowser() {
  if (browser) {
    return browser;
  }
  if (browserUnavailableDetail) {
    if (SMOKE) {
      return undefined;
    }
    throw new Error(browserUnavailableDetail);
  }
  try {
    browser = await chromium.launch();
    return browser;
  } catch (e) {
    browserUnavailableDetail = String(e?.message || e).slice(0, 500);
    if (SMOKE) {
      return undefined;
    }
    throw e;
  }
}

async function bootPage() {
  const activeBrowser = await getBrowser();
  if (!activeBrowser) {
    throw new Error(browserUnavailableDetail ?? "browser unavailable");
  }
  const p = await activeBrowser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => ledger.push({ fleet: "runtime", kind: "pageerror", severity: "high", detail: String(e).slice(0, 300) }));
  await p.goto(`${BASE}/?nointro=1&spawn=2144,1788`, { waitUntil: "load" });
  await p.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout: 60000 });
  const st = () => p.evaluate(() => { const s = globalThis.__firstSceneDebug; return { open: !!s?.dialogueOpen, x: Math.round(s?.player?.x ?? 0), y: Math.round(s?.player?.y ?? 0) }; });
  for (let i = 0; i < 40; i++) { const s = await st(); if (s.open) break; await p.waitForTimeout(500); }
  for (let i = 0; i < 14; i++) { await p.keyboard.press("KeyZ"); await p.waitForTimeout(380); const s = await st(); if (!s.open) break; }
  await p.waitForTimeout(600);
  return { p, st };
}

async function tryBootPage(fleet) {
  try {
    return await bootPage();
  } catch (e) {
    const detail = String(e?.message || e).slice(0, 500);
    if (!SMOKE) {
      throw e;
    }
    ledger.push({ fleet, kind: "browser-unavailable", severity: "low", detail });
    log(`${fleet} browser skipped: ${detail}`);
    return undefined;
  }
}

// codex vision helper (one image -> one-line JSON)
function codexVision(image, prompt) {
  return new Promise((resolve) => {
    const cp = spawn("codex", ["exec", "--skip-git-repo-check", "-c", "model_reasoning_effort=medium", "-i", image], { stdio: ["pipe", "pipe", "ignore"] });
    let out = ""; cp.stdout.on("data", (d) => (out += d));
    cp.stdin.write(prompt); cp.stdin.end();
    const t = setTimeout(() => { cp.kill("SIGKILL"); resolve(null); }, 90000);
    cp.on("close", () => { clearTimeout(t);
      const line = out.split("\n").reverse().find((l) => l.trim().startsWith("{"));
      try { resolve(JSON.parse(line.trim())); } catch { resolve(null); }
    });
  });
}

// ---------- shared data helpers ----------
function doorKey(door) {
  return `${door.type ?? "door"}:${door.worldPixel?.x ?? "?"},${door.worldPixel?.y ?? "?"}->${door.destinationWorldPixel?.x ?? "?"},${door.destinationWorldPixel?.y ?? "?"}`;
}

function pointValid(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function inMapBounds(point) {
  return pointValid(point) && point.x >= 0 && point.y >= 0 && point.x < MAP_BOUNDS.width && point.y < MAP_BOUNDS.height;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resolveLanding(door) {
  if (!pointValid(door?.destinationWorldPixel)) {
    return { point: door?.destinationWorldPixel, walkable: false };
  }
  return resolveDoorWarpLanding(
    door.destinationWorldPixel,
    world.collision.solidRows,
    collisionGrid,
    { maxRingCells: 8 }
  );
}

function nearestComponent(point, radius = 2) {
  return pointValid(point) ? nearestComponentAt(navmesh, point, radius) : undefined;
}

function meshComponentAtCell(cellX, cellY) {
  return navmesh.componentAtCell(cellX, cellY);
}

function pointToNavCell(point) {
  return {
    x: Math.floor(point.x / navmesh.cellSize),
    y: Math.floor(point.y / navmesh.cellSize)
  };
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function knownDecorationBaseline() {
  const ids = new Set();
  for (const npc of world.npcs ?? []) {
    if (npc.visible !== true || !pointValid(npc.worldPixel)) {
      continue;
    }
    if (!nearestComponent(npc.worldPixel, 2)) {
      ids.add(String(npc.npcId));
    }
  }
  return ids;
}

function hiddenNpcIds() {
  const ids = new Set();
  for (const [id, override] of Object.entries(npcOverrides.byNpcId ?? {})) {
    if (override?.hide === true) {
      ids.add(String(id));
    }
  }
  return ids;
}

function isRelocationEligible(id, point) {
  const npcId = String(id).replace(/^npc:/, "");
  const oob = !inMapBounds(point);
  const meshVoid = !nearestComponent(point, 2);
  return (oob || meshVoid) && !KNOWN_DECORATION_BASELINE.has(npcId);
}

function seededRandom(seed = 0x5eed1234) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sampleStable(items, count, seed = 0x00d00125) {
  const rand = seededRandom(seed);
  return items
    .map((item) => ({ item, sort: rand() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, count)
    .map((entry) => entry.item);
}

function interiorTargetCompId(target) {
  if (target.comp && typeof target.comp === "object") {
    return target.comp.componentId ?? target.comp.id ?? target.comp.c ?? "unknown";
  }
  return target.comp ?? "unknown";
}

// ---------- PHASE 1A: door data validation + smoke crawler ----------
async function fleetDoors() {
  const doors = world.doors ?? [];
  const dataFailures = new Set();
  log(`doors fleet: ${doors.length} data checks`);
  for (const d of doors) {
    const from = d.worldPixel;
    const landing = resolveLanding(d);
    const landingComponent = nearestComponent(landing.point, 2);
    const failures = [];
    if (!pointValid(from)) failures.push("missing door worldPixel");
    if (!pointValid(d.destinationWorldPixel)) failures.push("missing destinationWorldPixel");
    if (!pointValid(landing.point)) failures.push("landing did not resolve to a finite point");
    if (!landing.walkable) failures.push("landing footprint is not collision-walkable");
    if (!landingComponent) failures.push("landing is not on a navmesh component within 2 cells");

    if (d.type === "door" && pointValid(landing.point) && pointValid(from)) {
      const returns = doors.filter((candidate) =>
        candidate !== d &&
        candidate.type === "door" &&
        pointValid(candidate.worldPixel) &&
        distance(candidate.worldPixel, landing.point) <= 64
      );
      if (returns.length > 0) {
        const roundTrips = returns.some((candidate) => {
          const back = resolveLanding(candidate);
          return pointValid(back.point) && back.walkable && distance(back.point, from) <= 64;
        });
        if (!roundTrips) {
          failures.push(`nearby return door count ${returns.length} did not round-trip within 64px`);
        }
      }
    }

    if (failures.length > 0) {
      dataFailures.add(doorKey(d));
      ledger.push({
        fleet: "doors",
        kind: "door-data-invalid",
        severity: "high",
        at: from ?? d.destinationWorldPixel,
        detail: failures.join("; "),
        evidence: { landing: landing.point, landingWalkable: landing.walkable, landingComponent }
      });
    }
  }

  const smokeDoors = sampleStable(doors.filter((d) => pointValid(d.worldPixel)), LIMIT(25, 5));
  log(`doors smoke: ${smokeDoors.length} sampled doors`);
  const boot = await tryBootPage("doors");
  if (!boot) {
    return;
  }
  const { p, st } = boot;
  let checked = 0;
  for (const d of smokeDoors) {
    const from = d.worldPixel;
    try {
      await p.evaluate(([x, y]) => globalThis.__warpTo(x, y + 20), [from.x, from.y]);
      await p.waitForTimeout(250);
      const a = await st();
      for (let i = 0; i < 5; i++) { await p.keyboard.down("ArrowUp"); await p.waitForTimeout(140); await p.keyboard.up("ArrowUp"); }
      await p.waitForTimeout(700);
      const b = await st();
      const warped = Math.hypot(b.x - a.x, b.y - a.y) > 120;
      if (!warped && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
        const failedData = dataFailures.has(doorKey(d));
        ledger.push({
          fleet: "doors",
          kind: failedData ? "door-unreachable-or-blocked" : "walk-anomaly-lowconf",
          severity: failedData ? "high" : "low",
          at: from,
          detail: `no movement and no warp approaching door at ${from.x},${from.y}`,
          evidence: { dataLayerFailed: failedData }
        });
      }
    } catch { /* keep crawling */ }
    if (++checked % 100 === 0) log(`  doors ${checked}/${doors.length} (ledger ${ledger.length})`);
  }
  await p.close();
}

// ---------- PHASE 1B: chokepoint + placement conformance ----------
async function fleetPlacement() {
  log("placement fleet (conformance script + chokepoints)");
  try { sh("node scripts/navmesh-conformance.mjs"); } catch {}
  try {
    const conf = JSON.parse(fs.readFileSync(path.join(ROOT, "tmp/navmesh/conformance.json"), "utf8"));
    for (const f of (conf.failures ?? []).slice(0, LIMIT(999, 3))) {
      const npcId = f.metadata?.npcId ?? String(f.id ?? "").match(/^npc:(\d+)$/)?.[1];
      const fix = npcId != null && f.suggestedWorldPixel && isRelocationEligible(npcId, f.worldPixel)
        ? { type: "relocate", id: npcId, to: f.suggestedWorldPixel }
        : undefined;
      ledger.push({ fleet: "placement", kind: "not-standable", severity: "low", at: f.worldPixel, detail: `${f.id} not standable`, fix });
    }
  } catch {}
  // chokepoints: visible NPC body on a navmesh cell whose 3x3 removal disconnects a local window
  const added = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/added-npcs.json"), "utf8"));
  const addedArr = Array.isArray(added) ? added : (added.npcs ?? Object.values(added).find(Array.isArray) ?? []);
  const hidden = hiddenNpcIds();
  const npcs = [...world.npcs.filter((n) => n.visible !== false && n.worldPixel), ...addedArr.filter((n) => n.worldPixel)].slice(0, LIMIT(99999, 30));
  for (const n of npcs) {
    const id = n.npcId ?? n.id;
    if (hidden.has(String(id))) {
      continue;
    }
    const { x, y } = n.worldPixel;
    const split = npcDisconnectsLocalMesh(n.worldPixel);
    if (split.disconnected) {
      ledger.push({
        fleet: "placement",
        kind: "chokepoint-npc",
        severity: "high",
        at: { x, y },
        detail: `NPC ${id} 3x3 body box splits local navmesh component ${split.componentId}`,
        evidence: split,
        fix: { type: "relocate-manual", id }
      });
    }
  }
}

function npcDisconnectsLocalMesh(point) {
  const body = pointToNavCell(point);
  const componentId = meshComponentAtCell(body.x, body.y);
  if (componentId === 0) {
    return { disconnected: false, reason: "body-cell-not-walkable" };
  }
  const base = localComponentCount(body, componentId, () => false);
  const blocked = localComponentCount(body, componentId, (x, y) => Math.abs(x - body.x) <= 1 && Math.abs(y - body.y) <= 1);
  return {
    disconnected: blocked.components > base.components,
    componentId,
    baseComponents: base.components,
    blockedComponents: blocked.components,
    baseCells: base.cells,
    blockedCells: blocked.cells
  };
}

function localComponentCount(center, componentId, blocked) {
  const radius = 24;
  const cells = new Set();
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      if (blocked(x, y) || meshComponentAtCell(x, y) !== componentId) {
        continue;
      }
      cells.add(cellKey(x, y));
    }
  }
  const seen = new Set();
  let components = 0;
  for (const key of cells) {
    if (seen.has(key)) {
      continue;
    }
    components += 1;
    const stack = [key];
    seen.add(key);
    while (stack.length > 0) {
      const current = stack.pop();
      const [x, y] = current.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = cellKey(x + dx, y + dy);
        if (!cells.has(next) || seen.has(next)) {
          continue;
        }
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return { components, cells: cells.size };
}

// ---------- PHASE 1C: visual sweeps (interiors + OW sample) ----------
async function fleetVisual() {
  const targets = JSON.parse(fs.readFileSync(path.join(ROOT, "tmp/interior-targets.json"), "utf8")).slice(0, LIMIT(118, 3));
  log(`visual fleet: ${targets.length} interiors`);
  const boot = await tryBootPage("visual");
  if (!boot) {
    return;
  }
  const { p } = boot;
  const prompt = `QA vision for a top-down EarthBound-style game. Interior rooms of the same building strip may see each other (correct); solid black belongs past strip edges. Ignore the hooded player, HUD text, dialogue boxes. Flag ONLY: sprites/objects floating on solid black, a room sliced mid-furniture by a straight black edge, or a garbled/torn sprite. Reply ONE line JSON: {"defect":true|false,"class":"","note":""}`;
  for (const t of targets) {
    await p.evaluate(([x, y]) => globalThis.__warpTo(x, y), [t.x, t.y]);
    await p.waitForTimeout(600);
    const shot = path.join(OUT, "shots", `int-${t.areaId}-${String(interiorTargetCompId(t))}.png`);
    await p.screenshot({ path: shot });
    const v = await codexVision(shot, prompt);
    if (v?.defect) ledger.push({ fleet: "visual", kind: `interior-${v.class || "defect"}`, severity: "medium", at: { x: t.x, y: t.y }, detail: v.note, evidence: shot });
  }
  await p.close();
}

// ---------- PHASE 1D: audio matrix ----------
async function fleetAudio() {
  const areas = (music.areas ?? []).slice(0, LIMIT(99, 2));
  log(`audio fleet: ${areas.length} areas`);
  const S = world.sectors; const secW = S.sectorWidthTiles * S.tileSize, secH = S.sectorHeightTiles * S.tileSize;
  const boot = await tryBootPage("audio");
  if (!boot) {
    return;
  }
  const { p } = boot;
  const mp3s = []; p.on("request", (r) => { if (/\.mp3/.test(r.url())) mp3s.push(r.url().split("/").pop()); });
  for (const a of areas) {
    const sec = a.match?.sectorIds?.[0]; if (sec == null) continue;
    const x = (sec % S.cols) * secW + secW / 2, y = Math.floor(sec / S.cols) * secH + secH / 2;
    mp3s.length = 0;
    await p.evaluate(([X, Y]) => globalThis.__warpTo(X, Y), [x, y]);
    await p.waitForTimeout(2200);
    const want = (a.file ?? "").split("/").pop();
    if (want && mp3s.length && !mp3s.includes(want)) {
      ledger.push({ fleet: "audio", kind: "wrong-cue", severity: "medium", at: { x, y }, detail: `area ${a.id}: expected ${want}, got ${mp3s.join(",")}` });
    }
  }
  await p.close();
}

// ---------- PHASE 1E: systems (battle matrix + menu crawler) ----------
async function fleetSystems() {
  log("systems fleet");
  if (!SMOKE) {
    try { sh("pnpm exec tsx scripts/run-battle-matrix.ts", { timeout: 900000 }); }
    catch (e) { ledger.push({ fleet: "systems", kind: "battle-matrix-failure", severity: "high", detail: String(e.stdout || e).slice(-400) }); }
  }
  const boot = await tryBootPage("systems");
  if (!boot) {
    return;
  }
  const { p, st } = boot;
  await p.keyboard.press("KeyM"); await p.waitForTimeout(500);
  for (const k of ["ArrowRight", "ArrowDown", "KeyZ", "KeyX", "ArrowDown", "KeyZ", "KeyX", "KeyX"]) { await p.keyboard.press(k); await p.waitForTimeout(280); }
  const s = await st();
  for (const k of ["ArrowLeft"]) { await p.keyboard.down(k); await p.waitForTimeout(220); await p.keyboard.up(k); }
  const s2 = await st();
  if (s.x === s2.x && s.y === s2.y) ledger.push({ fleet: "systems", kind: "menu-crawl-stuck", severity: "high", at: s, detail: "player immobile after menu open/close cycle" });
  await p.close();
}

// ---------- PHASE 3: fix loop (safe subset) ----------
async function fixLoop() {
  const relocatable = ledger.filter((l) => l.fix?.type === "relocate");
  log(`fix loop: ${relocatable.length} auto-relocations`);
  // (data fixes only; code fixes are listed for the morning session)
  // ... relocations reuse suggestedWorldPixel from conformance; applied to npc-overrides
  if (relocatable.length && !SMOKE) {
    const ovPath = path.join(ROOT, "content/npc-overrides.json");
    const ov = JSON.parse(fs.readFileSync(ovPath, "utf8"));
    let applied = 0;
    for (const l of relocatable.slice(0, 40)) {
      const idm = String(l.fix.id).match(/(\d+)/); if (!idm) continue;
      if (ov.byNpcId?.[idm[1]]) {
        l.applied = false;
        l.skipped = "existing byNpcId override";
        continue;
      }
      ov.byNpcId[idm[1]] = { worldPixel: l.fix.to };
      l.applied = true; applied++;
    }
    fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2));
    fs.copyFileSync(ovPath, path.join(ROOT, "apps/game/public/generated/npc-overrides.json"));
    log(`applied ${applied} relocations`);
    sh(`git add content/npc-overrides.json apps/game/public/generated/npc-overrides.json && git commit -q -m "Overnight bughunt: auto-relocate not-standable NPCs (mesh-suggested spots)" || true`);
  }
}

// ---------- run ----------
try {
  await fleetPlacement();
  await fleetDoors();
  await fleetVisual();
  await fleetAudio();
  await fleetSystems();
  await fixLoop();
} finally {
  fs.writeFileSync(path.join(OUT, "ledger.json"), JSON.stringify({ generated: new Date().toISOString(), smoke: SMOKE, count: ledger.length, ledger }, null, 2));
  const byKind = {}; ledger.forEach((l) => (byKind[l.kind] = (byKind[l.kind] || 0) + 1));
  const md = [`# Overnight bughunt ${today}${SMOKE ? " (SMOKE)" : ""}`, "", `findings: ${ledger.length}`, "", ...Object.entries(byKind).map(([k, n]) => `- ${k}: ${n}`), "", "Full ledger: tmp/bughunt/ledger.json | evidence: tmp/bughunt/shots/"].join("\n");
  fs.writeFileSync(path.join(OUT, "MORNING.md"), md);
  log(`DONE: ${ledger.length} findings -> tmp/bughunt/ledger.json + MORNING.md`);
  if (browser) {
    await browser.close();
  }
  vite.kill();
}
