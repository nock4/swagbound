// Overnight map-sweep CAPTURE layer.
// Warps to every cell of a tiered target list, verifies REAL gameplay state (control,
// no cutscene/dialogue/menu, chunk-settled), screenshots at native res with the build
// stamp, and records a manifest the analysis loop (the orchestrator, in batches) reads.
//
// Usage:
//   node tmp/mapsweep/capture.mjs [baseUrl] [--region <name>] [--limit N] [--from N]
// Regions: "overworld" (walkable grid), "interiors" (118 rooms), "anchors" (bosses+signs), "all".
//
// Output: tmp/mapsweep/shots/<region>/NNNN.png  +  tmp/mapsweep/manifest-<region>.json
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const world = JSON.parse(readFileSync(new URL("apps/game/public/generated/world.json", root), "utf8"));
const interiors = JSON.parse(readFileSync(new URL("tmp/interior-targets.json", root), "utf8"));
const triggers = JSON.parse(readFileSync(new URL("content/triggers.json", root), "utf8"));
const interactables = JSON.parse(readFileSync(new URL("content/overworld-interactables.json", root), "utf8"));

const args = process.argv.slice(2);
const base = ((args.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:5174/")).replace(/\/?$/, "/");
const region = (args[args.indexOf("--region") + 1] && !args.includes("--region") ? "all" : (args.includes("--region") ? args[args.indexOf("--region") + 1] : "all"));
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const from = args.includes("--from") ? Number(args[args.indexOf("--from") + 1]) : 0;
// --show-player: keep the hero visible in every shot (sprite-cutoff/occlusion sweeps).
// Default remains hidden (map-integrity sweeps) so older workflows are unchanged.
const showPlayer = args.includes("--show-player");

const MAP_W = world.mapWidthTiles * world.tileSize;   // 8192
const MAP_H = world.mapHeightTiles * world.tileSize;  // 10240
const STEP = 360; // ~1 screen of world content per cell (slight overlap)

// ---- target list ----
function overworldGrid() {
  const cells = [];
  for (let y = 200; y < MAP_H; y += STEP) {
    for (let x = 200; x < MAP_W; x += STEP) {
      cells.push({ kind: "overworld", x, y, id: `ow-${x}-${y}` });
    }
  }
  return cells;
}
function interiorTargets() {
  return interiors.map((t, i) => ({ kind: "interior", x: t.x, y: t.y, id: `int-${i}-${t.areaId}`, areaId: t.areaId }));
}
function anchorTargets() {
  // Offset +72px south so the camera frames the spot without the player contacting
  // a (re-armable) boss gate or trigger area.
  const bosses = triggers.triggers.filter((t) => t.boss).map((t) => ({ kind: "anchor", x: t.boss.x, y: t.boss.y + 72, id: `boss-${t.id}`, note: t.id }));
  const signs = interactables.interactables.map((s) => ({ kind: "anchor", x: s.worldPixel.x, y: s.worldPixel.y + 40, id: `int-${s.id}`, note: s.label ?? s.id }));
  return [...bosses, ...signs];
}

// Fully-progressed, daytime, gates-down world state so the sweep can warp anywhere
// without firing battles/cutscenes and without the Act-1 night tint hiding glitches.
const SWEEP_FLAGS = JSON.parse(readFileSync(new URL("tmp/mapsweep/sweep-flags.json", root), "utf8"));
const targetsByRegion = {
  overworld: overworldGrid,
  interiors: interiorTargets,
  anchors: anchorTargets,
  all: () => [...anchorTargets(), ...interiorTargets(), ...overworldGrid()]
};
let targets = (targetsByRegion[region] ?? targetsByRegion.all)();
targets = targets.slice(from, from + limit);

const outDir = new URL(`tmp/mapsweep/shots/${region}/`, root).pathname;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 448 }, deviceScaleFactor: 2 });
const peek = () => page.evaluate(() => {
  const s = globalThis.__firstSceneDebug ?? null;
  const owners = globalThis.__inputOwners ? globalThis.__inputOwners() : null;
  const night = globalThis.__nightDebug ? globalThis.__nightDebug() : null;
  return {
    world: !!s, player: s?.player ?? null, dlg: s?.dialogueOpen ?? false,
    owners, night: night ? { shouldShow: night.shouldShow, alpha: night.alpha } : null
  };
});
const dlgClear = async () => {
  for (let i = 0, calm = 0; i < 14 && calm < 2; i++) {
    const s = await peek();
    if (s.dlg || s.owners?.cutscene || s.owners?.inputLocked) { calm = 0; await page.keyboard.press("KeyZ"); await page.waitForTimeout(320); }
    else { calm++; await page.waitForTimeout(160); }
  }
};

await page.goto(base + "?nointro=1&noEncounters=1", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof globalThis.__warpTo === "function", { timeout: 30000 });
await dlgClear();
// Put the world in the fully-progressed daytime state: defuses boss gates and clears
// the Act-1 night tint so warping anywhere is safe and every area is cleanly visible.
await page.evaluate((flags) => {
  const s = globalThis.__game?.scene?.getScene("chunked-world");
  for (const f of flags) s["gameFlags"].set(f);
}, SWEEP_FLAGS);
await page.waitForTimeout(400);

// __warpTo ignores collision, so aiming at a solid tile (tree/roof/wall) drops the
// player ON it and produces a FALSE "standing on X" artifact. Snap every target to the
// nearest WALKABLE cell so the player always stands on real ground; then any
// "on solid" in a shot is a genuine glitch, not a capture artifact.
async function snapToWalkable(x, y) {
  return await page.evaluate(({ x, y }) => {
    const fn = globalThis.__solidAt;
    if (!fn || !fn(x, y)) return { x, y, snapped: false };
    for (let r = 8; r <= 160; r += 8) {
      for (let dy = -r; dy <= r; dy += 8) for (let dx = -r; dx <= r; dx += 8) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring only
        if (!fn(x + dx, y + dy)) return { x: x + dx, y: y + dy, snapped: true };
      }
    }
    return { x, y, snapped: false }; // fully enclosed: leave as-is (rare; flagged by warpOk)
  }, { x, y });
}

// Warp + settle until the player has real control (or timeout). Retries a null landing once.
async function warpSettle(t) {
  const dst = await snapToWalkable(t.x, t.y);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(({ x, y }) => globalThis.__warpTo?.(x, y), { x: dst.x, y: dst.y });
    await page.waitForTimeout(900);
    for (let i = 0; i < 16; i++) {
      const s = await peek();
      if (s.dlg || s.owners?.cutscene || s.owners?.inputLocked) { await page.keyboard.press("KeyZ"); await page.waitForTimeout(300); continue; }
      const free = s.player && s.owners && !s.owners.cinematic && !s.owners.cutscene && !s.owners.inputLocked && !s.owners.dialogue;
      if (free) return s;
      await page.waitForTimeout(200);
    }
    const s = await peek();
    if (s.player) return s;
  }
  return await peek();
}

const manifest = [];
let shot = from, captured = 0, skipped = 0;
for (const t of targets) {
  const s = await warpSettle(t);
  const name = String(shot).padStart(4, "0");
  // Skip cells the warp could not land on (void/solid) so the analyst is not flooded with black.
  if (!s.player) { skipped++; shot++; continue; }
  const control = Boolean(s.owners && !s.owners.cinematic && !s.owners.cutscene && !s.owners.inputLocked && !s.owners.dialogue);
  const landed = { x: Math.round(s.player.x), y: Math.round(s.player.y) };
  const warpOk = Math.hypot(landed.x - t.x, landed.y - t.y) < 700;
  // Hide the (teleported) player sprite: for a MAP-integrity sweep the player is noise
  // — wherever a warp lands him he sits on solid art or gets FG-occluded by foliage,
  // producing false "on a tree / cut in half" artifacts. The map, NPCs, enemies, and
  // objects (the real subjects) stay visible.
  await page.evaluate((show) => {
    const scene = globalThis.__game?.scene?.getScene("chunked-world");
    scene?.["player"]?.setVisible?.(show);
    for (const f of (scene?.["followers"] ?? [])) f?.sprite?.setVisible?.(show);
  }, showPlayer);
  const file = `${outDir}${name}.png`;
  await page.screenshot({ path: file });
  manifest.push({
    n: shot, id: t.id, kind: t.kind, note: t.note ?? null,
    target: { x: t.x, y: t.y }, landed, warpOk, control,
    night: s.night?.shouldShow ?? false, file: `shots/${region}/${name}.png`
  });
  captured++; shot++;
  if (captured % 25 === 0) {
    writeFileSync(new URL(`tmp/mapsweep/manifest-${region}.json`, root), JSON.stringify(manifest, null, 1));
    console.log(`  ${captured} captured / ${skipped} skipped (at ${t.id})`);
  }
}
writeFileSync(new URL(`tmp/mapsweep/manifest-${region}.json`, root), JSON.stringify(manifest, null, 1));
console.log(`DONE region=${region}: ${captured} shots, ${skipped} void-skips. manifest-${region}.json`);
await browser.close();
