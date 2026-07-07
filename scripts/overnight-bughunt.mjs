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
sh(`git checkout -q -B ${BRANCH}`);
log(`branch ${BRANCH}`);
const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort"], { cwd: path.join(ROOT, "apps/game"), stdio: "ignore", detached: false });
await new Promise((r) => setTimeout(r, 4000));

const world = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/world.json"), "utf8"));
const music = JSON.parse(fs.readFileSync(path.join(ROOT, "content/music-manifest.json"), "utf8"));

// one shared browser; helper to boot a controlled page (opening completed)
const browser = await chromium.launch();
async function bootPage() {
  const p = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
  p.on("pageerror", (e) => ledger.push({ fleet: "runtime", kind: "pageerror", severity: "high", detail: String(e).slice(0, 300) }));
  await p.goto(`${BASE}/?nointro=1&spawn=2144,1788`, { waitUntil: "load" });
  await p.waitForFunction(() => globalThis.__firstSceneDebug !== undefined, { timeout: 60000 });
  const st = () => p.evaluate(() => { const s = globalThis.__firstSceneDebug; return { open: !!s?.dialogueOpen, x: Math.round(s?.player?.x ?? 0), y: Math.round(s?.player?.y ?? 0) }; });
  for (let i = 0; i < 40; i++) { const s = await st(); if (s.open) break; await p.waitForTimeout(500); }
  for (let i = 0; i < 14; i++) { await p.keyboard.press("KeyZ"); await p.waitForTimeout(380); const s = await st(); if (!s.open) break; }
  await p.waitForTimeout(600);
  return { p, st };
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

// ---------- PHASE 1A: door-graph crawler ----------
async function fleetDoors() {
  const doors = (world.doors ?? []).filter((d) => d.kind === "door" || d.type === "door" || true).slice(0, LIMIT(4000, 5));
  log(`doors fleet: ${doors.length} doors`);
  const { p, st } = await bootPage();
  let checked = 0;
  for (const d of doors) {
    const from = d.worldPixel ?? d.from ?? (d.x != null ? { x: d.x, y: d.y } : null);
    if (!from) continue;
    try {
      await p.evaluate(([x, y]) => globalThis.__warpTo(x, y + 20), [from.x, from.y]);
      await p.waitForTimeout(250);
      const a = await st();
      for (let i = 0; i < 5; i++) { await p.keyboard.down("ArrowUp"); await p.waitForTimeout(140); await p.keyboard.up("ArrowUp"); }
      await p.waitForTimeout(700);
      const b = await st();
      const warped = Math.hypot(b.x - a.x, b.y - a.y) > 120;
      if (!warped && Math.hypot(b.x - a.x, b.y - a.y) < 4) {
        ledger.push({ fleet: "doors", kind: "door-unreachable-or-blocked", severity: "high", at: from, detail: `no movement and no warp approaching door at ${from.x},${from.y}` });
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
      ledger.push({ fleet: "placement", kind: "not-standable", severity: "low", at: f.worldPixel, detail: `${f.id} not standable`, fix: f.suggestedWorldPixel ? { type: "relocate", id: f.id, to: f.suggestedWorldPixel } : undefined });
    }
  } catch {}
  // chokepoints: NPC body on a cell whose removal disconnects a local window
  const added = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/added-npcs.json"), "utf8"));
  const addedArr = Array.isArray(added) ? added : (added.npcs ?? Object.values(added).find(Array.isArray) ?? []);
  const npcs = [...world.npcs.filter((n) => n.visible !== false && n.worldPixel), ...addedArr.filter((n) => n.worldPixel)].slice(0, LIMIT(99999, 30));
  const { solidRows, cellSize, width } = world.collision;
  const solid = (x, y) => { const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize); if (cx < 0 || cy < 0 || cx >= width) return true; const row = solidRows[cy]; return !row || row[cx] === "1"; };
  for (const n of npcs) {
    const { x, y } = n.worldPixel;
    // local passability: count open cells in a 3x3 ring; NPC on the ONLY open column of a wall line = chokepoint suspect
    const ring = [[-16,0],[16,0],[0,-16],[0,16]];
    const openNeighbors = ring.filter(([dx, dy]) => !solid(x + dx, y + dy)).length;
    const rowSolid = [[-32,0],[32,0]].every(([dx]) => solid(x + dx, y - 16) && solid(x + dx, y + 16));
    if (!solid(x, y) && openNeighbors <= 2 && rowSolid) {
      ledger.push({ fleet: "placement", kind: "chokepoint-npc", severity: "high", at: { x, y }, detail: `NPC ${(n.npcId ?? n.id)} occupies a narrow passage cell`, fix: { type: "relocate-manual", id: n.npcId ?? n.id } });
    }
  }
}

// ---------- PHASE 1C: visual sweeps (interiors + OW sample) ----------
async function fleetVisual() {
  const targets = JSON.parse(fs.readFileSync(path.join(ROOT, "tmp/interior-targets.json"), "utf8")).slice(0, LIMIT(118, 3));
  log(`visual fleet: ${targets.length} interiors`);
  const { p } = await bootPage();
  const prompt = `QA vision for a top-down EarthBound-style game. Interior rooms of the same building strip may see each other (correct); solid black belongs past strip edges. Ignore the hooded player, HUD text, dialogue boxes. Flag ONLY: sprites/objects floating on solid black, a room sliced mid-furniture by a straight black edge, or a garbled/torn sprite. Reply ONE line JSON: {"defect":true|false,"class":"","note":""}`;
  for (const t of targets) {
    await p.evaluate(([x, y]) => globalThis.__warpTo(x, y), [t.x, t.y]);
    await p.waitForTimeout(600);
    const shot = path.join(OUT, "shots", `int-${t.areaId}-${String(t.comp)}.png`);
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
  const { p } = await bootPage();
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
  const { p, st } = await bootPage();
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
  await browser.close();
  vite.kill();
}
