#!/usr/bin/env node
// Read-only inventory of "broken overworld scenes": EarthBound scripted cutscenes
// (NPC choreography) the converter doesn't replicate, plus NPC movement-accuracy
// buckets. Joins the CCS event scripts to world.json so each candidate is locatable.
//
// Usage:
//   node scripts/scan-broken-scenes.mjs                 # ranked summary to stdout
//   node scripts/scan-broken-scenes.mjs --out scan.json # also write full JSON
//   node scripts/scan-broken-scenes.mjs --scene data_20.l_0xc66b97   # one scene's NPCs/coords
//
// All inputs are local + gitignored (external/coilsnake-full, generated/world.json).

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CCS_DIR = resolve(ROOT, "external/coilsnake-full/ccscript");
const WORLD_PATH = resolve(ROOT, "apps/game/public/generated/world.json");

const args = process.argv.slice(2);
const opt = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const sceneArg = opt("--scene");
const outArg = opt("--out");

// Choreography macros: presence of any => the label drives actors (cutscene).
// {warp} is deliberately NOT here (plain door transitions are already handled).
const CHOREO_MARKERS = [
  "lock_movement", "unlock_movement",
  "hide_char", "hide_char_float", "show_char",
  "char_direction", "char_movement",
  "party_remove", "party_add",
  "teleport", "generate_character", "make_invisible"
];
const REF_RE = /(?:\{e\(|call\(|goto\()\s*((?:data_\d+\.)?l_0x[0-9a-f]+)\)/g;
const LABEL_RE = /^(l_0x[0-9a-f]+):/gm;
const REACH_DEPTH = 5;

// ---- 1. Parse every CCS label block -------------------------------------------
/** fullLabel -> { mod, markers:string[], refs:string[], raw1F:number, hasWarp:bool, len:number } */
const labels = new Map();
for (const file of readdirSync(CCS_DIR).filter((f) => f.endsWith(".ccs"))) {
  const mod = file.replace(/\.ccs$/, "");
  const text = readFileSync(resolve(CCS_DIR, file), "utf8");
  const marks = [...text.matchAll(LABEL_RE)];
  for (let i = 0; i < marks.length; i++) {
    const name = marks[i][1];
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const block = text.slice(start, end);
    const markers = CHOREO_MARKERS.filter((m) => block.includes("{" + m));
    const refs = [];
    for (const r of block.matchAll(REF_RE)) {
      refs.push(r[1].includes(".") ? r[1] : `${mod}.${r[1]}`);
    }
    labels.set(`${mod}.${name}`, {
      mod,
      markers,
      refs,
      raw1F: (block.match(/\[1F /g) || []).length,
      rawMove: (block.match(/\[1F F1/g) || []).length, // raw character-action code (CoilSnake un-macro'd choreography, e.g. cops walking out)
      hasWarp: block.includes("{warp"),
      len: block.length
    });
  }
}

// reverse ref graph: target -> [sources]
const revRefs = new Map();
for (const [label, info] of labels) {
  for (const t of info.refs) {
    if (!revRefs.has(t)) revRefs.set(t, []);
    revRefs.get(t).push(label);
  }
}

// ---- 2. world.json reverse index: textPointer -> placements ---------------------
const world = JSON.parse(readFileSync(WORLD_PATH, "utf8"));
const npcs = world.npcs || [];
const doors = world.doors || [];
/** fullLabel -> [{kind, worldPixel, eventFlag, npcId?, spriteGroup?, movement?}] */
const placements = new Map();
const addPlacement = (tp, rec) => {
  if (!tp || !tp.startsWith("data_")) return;
  if (!placements.has(tp)) placements.set(tp, []);
  placements.get(tp).push(rec);
};
for (const n of npcs) {
  addPlacement(n.textPointer, { kind: "npc", worldPixel: n.worldPixel, eventFlag: n.eventFlag, npcId: n.npcId, spriteGroup: n.spriteGroup, movement: n.movement });
  addPlacement(n.textPointer2, { kind: "npc", worldPixel: n.worldPixel, eventFlag: n.eventFlag, npcId: n.npcId, spriteGroup: n.spriteGroup, movement: n.movement });
}
for (const d of doors) addPlacement(d.textPointer, { kind: "door", worldPixel: d.worldPixel, eventFlag: d.eventFlag });

// ---- region tagging via per-sector areaId; the spawn's areaId == Act-1/Onett ----
const SEC = world.sectors;
const sectorOf = (wp) =>
  wp ? Math.floor(wp.y / (SEC.sectorHeightTiles * SEC.tileSize)) * SEC.cols + Math.floor(wp.x / (SEC.sectorWidthTiles * SEC.tileSize)) : -1;
const spawn = world.player?.spawnWorldPixel;
const startAreaId = spawn ? SEC.areaIds[sectorOf(spawn)] : null;
const regionOf = (wp) => {
  if (!wp) return "unknown";
  const aid = SEC.areaIds[sectorOf(wp)];
  return aid === startAreaId ? "act1-start" : `area:${aid}`;
};

// ---- 3. For each world-referenced ENTRY label, aggregate reachable choreography --
function reachableMarkers(entry) {
  const seen = new Set([entry]);
  let frontier = [entry];
  const agg = new Set();
  let raw1F = 0;
  let rawMove = 0;
  let depth = 0;
  while (frontier.length && depth < REACH_DEPTH) {
    const next = [];
    for (const lbl of frontier) {
      const info = labels.get(lbl);
      if (!info) continue;
      info.markers.forEach((m) => agg.add(m));
      raw1F += info.raw1F;
      rawMove += info.rawMove;
      for (const t of info.refs) if (!seen.has(t)) { seen.add(t); next.push(t); }
    }
    frontier = next;
    depth++;
  }
  return { markers: [...agg], raw1F, rawMove, reachedLabels: seen.size };
}

const scenes = [];
const seenEntry = new Set();
for (const [tp, recs] of placements) {
  if (!labels.has(tp) || seenEntry.has(tp)) continue;
  seenEntry.add(tp);
  const { markers, raw1F, rawMove, reachedLabels } = reachableMarkers(tp);
  if (markers.length === 0 && rawMove === 0) continue; // no choreography (macro or raw) => not a cutscene
  // pick a representative placement (prefer an npc with worldPixel)
  const rec = recs.find((r) => r.worldPixel) || recs[0];
  scenes.push({
    ccsRef: tp,
    markers,
    rawMove,
    markerScore: markers.length * 3 + Math.min(rawMove, 12) + Math.min(raw1F, 6),
    raw1F,
    reachedLabels,
    trigger: rec ? { kind: rec.kind, worldPixel: rec.worldPixel, eventFlag: rec.eventFlag, npcId: rec.npcId, spriteGroup: rec.spriteGroup } : null,
    placements: recs.length,
    region: regionOf(rec?.worldPixel)
  });
}
scenes.sort((a, b) => {
  const aw = a.region === "act1-start" ? 1 : 0;
  const bw = b.region === "act1-start" ? 1 : 0;
  if (aw !== bw) return bw - aw; // Act-1 first
  return b.markerScore - a.markerScore;
});

// ---- 4. movement-accuracy buckets ----------------------------------------------
const STATIC_HEURISTIC = new Set([0, 8, 9]);
const buckets = new Map();
for (const n of npcs) {
  if (!n.visible) continue;
  const id = n.movement;
  if (!buckets.has(id)) buckets.set(id, { movementId: id, count: 0, heuristicWander: !STATIC_HEURISTIC.has(id), sampleNpcIds: [] });
  const b = buckets.get(id);
  b.count++;
  if (b.sampleNpcIds.length < 5) b.sampleNpcIds.push(n.npcId);
}
const movementBuckets = [...buckets.values()].sort((a, b) => b.count - a.count);

// ---- --scene mode: dump one scene's candidate NPCs + nearby door target --------
if (sceneArg) {
  const recs = placements.get(sceneArg) || [];
  const info = labels.get(sceneArg);
  console.log(`scene ${sceneArg}`);
  console.log("  markers (reachable):", info ? reachableMarkers(sceneArg).markers.join(", ") : "(label not found)");
  console.log("  referenced by placements:");
  for (const r of recs) console.log("   ", JSON.stringify(r));
  // nearest doors to the first placement (likely exit targets)
  const anchor = recs.find((r) => r.worldPixel)?.worldPixel;
  if (anchor) {
    const near = doors
      .map((d) => ({ d, dist: Math.hypot(d.worldPixel.x - anchor.x, d.worldPixel.y - anchor.y) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4);
    console.log("  nearest doors (possible exit targets):");
    for (const { d, dist } of near) console.log(`    @${d.worldPixel.x},${d.worldPixel.y} (${Math.round(dist)}px) -> ${JSON.stringify(d.destinationWorldPixel)}`);
    // co-located NPCs (likely the actors in this scene)
    const group = npcs
      .filter((n) => n.worldPixel && Math.hypot(n.worldPixel.x - anchor.x, n.worldPixel.y - anchor.y) < 96)
      .map((n) => ({ npcId: n.npcId, spriteGroup: n.spriteGroup, movement: n.movement, worldPixel: n.worldPixel }));
    console.log(`  co-located NPCs (<96px, likely actors): ${group.length}`);
    for (const g of group) console.log("   ", JSON.stringify(g));
  }
  process.exit(0);
}

// ---- 5. summary + output -------------------------------------------------------
const byRegion = {};
for (const s of scenes) {
  const key = s.region === "act1-start" ? "act1-start" : "other-acts";
  byRegion[key] = (byRegion[key] || 0) + 1;
}
const totalChoreographyLabels = [...labels.values()].filter((l) => l.markers.length || l.rawMove).length;

const result = {
  generatedNote: "read-only inventory; run with --out to persist",
  world: { npcs: npcs.length, doors: doors.length, ccsLabels: labels.size },
  summary: {
    cutsceneCandidates: scenes.length,
    act1Cutscenes: scenes.filter((s) => s.region === "act1-start").length,
    totalChoreographyLabels,
    byRegion,
    visibleNpcs: npcs.filter((n) => n.visible).length,
    npcsOnGenericWander: npcs.filter((n) => n.visible && !STATIC_HEURISTIC.has(n.movement)).length
  },
  cutscenes: scenes,
  movementBuckets
};

console.log("=== BROKEN-SCENE INVENTORY ===");
console.log(`CCS labels parsed: ${labels.size} | NPCs: ${npcs.length} | doors: ${doors.length}`);
console.log(`Located cutscene candidates (macro or raw [1F F1] choreography): ${scenes.length}  [act1-start ${result.summary.act1Cutscenes} | other-acts ${(byRegion["other-acts"] || 0)}]`);
console.log(`Total CCS labels with choreography (located+orphan, full scope): ${totalChoreographyLabels}`);
console.log(`Movement-accuracy: ${result.summary.npcsOnGenericWander}/${result.summary.visibleNpcs} visible NPCs on generic wander`);
console.log("\n-- top 30 located candidates (act1 first, then score; rawMv = raw [1F F1] count) --");
console.log("a1 score rawMv  markers                                  region        ccsRef            trigger");
for (const s of scenes.slice(0, 30)) {
  const wp = s.trigger?.worldPixel ? `@${s.trigger.worldPixel.x},${s.trigger.worldPixel.y}` : "(?)";
  const flag = s.region === "act1-start" ? "*" : " ";
  console.log(
    `${flag}  ${String(s.markerScore).padStart(4)} ${String(s.rawMove).padStart(4)}  ${(s.markers.join(",") || "(raw-only)").padEnd(40).slice(0, 40)}  ${s.region.padEnd(12).slice(0, 12)}  ${s.ccsRef.padEnd(20)}  ${s.trigger?.kind || "?"} ${wp}`
  );
}
console.log("\n-- movement-id buckets (visible NPCs) --");
for (const b of movementBuckets.slice(0, 12)) {
  console.log(`  movement ${String(b.movementId).padStart(4)}: ${String(b.count).padStart(4)} NPCs  ${b.heuristicWander ? "(generic wander)" : "(static)"}  e.g. ${b.sampleNpcIds.join(",")}`);
}

if (outArg) {
  writeFileSync(resolve(ROOT, outArg), JSON.stringify(result, null, 2));
  console.log(`\nfull inventory -> ${outArg}`);
}
