// Adversarial collision probe: spawn at solid-adjacent walkable spots and shove the
// player INTO the walls from all four directions, asserting the foot box never ends
// up inside a solid cell. Also spot-checks walk-behind: standing on an 0x02 canopy
// cell must have opaque foreground art over the sprite box.
//
// Requires a running dev server. Usage:
//   node --import tsx scripts/collision-adversarial.mjs [--base http://127.0.0.1:5173/] [--town onett] [--spots 10] [--seed 7]
// Exits non-zero on any violation; prints one RESULT_JSON line.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { walkableFootprintClear } from "../apps/game/src/collisionFootprint.ts";
import { applySolidOverrideRects } from "../apps/game/src/collisionOverrides.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = argValue("--base", "http://127.0.0.1:5173/");
const TOWN = argValue("--town", "onett");
const SPOTS = Number(argValue("--spots", "10"));
const SEED = Number(argValue("--seed", "7"));

const world = JSON.parse(fs.readFileSync(path.join(ROOT, "apps/game/public/generated/world.json"), "utf8"));
const { cellSize: CS, width: W, height: H, solidRows } = world.collision;
const grid = { cellSize: CS, width: W, height: H };
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "content/collision-overrides.json"), "utf8"));
applySolidOverrideRects(solidRows, overrides.solids ?? [], CS);
const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || solidRows[cy][cx] === "1";
const byte = (cx, cy) => Number.parseInt(world.collision.surfaceRows[cy]?.slice(cx * 2, cx * 2 + 2) ?? "0", 16);

// town box from map_sectors.yml (largest cluster)
const towns = new Array(world.sectors.cols * world.sectors.rows).fill("none");
{
  const lines = fs.readFileSync(path.join(ROOT, "external/coilsnake-full/map_sectors.yml"), "utf8").split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    let m = line.match(/^(\d+):\s*$/);
    if (m) { cur = Number(m[1]); continue; }
    m = line.match(/^\s+Town Map:\s*(\S+)/);
    if (m && cur != null) towns[cur] = m[1];
  }
}
const CPX = (world.sectors.sectorWidthTiles * world.sectors.tileSize) / CS;
const CPY = (world.sectors.sectorHeightTiles * world.sectors.tileSize) / CS;
let box = null;
{
  const seen = new Uint8Array(towns.length);
  let best = null;
  for (let i = 0; i < towns.length; i += 1) {
    if (towns[i] !== TOWN || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    const cluster = { count: 0, sc0: Infinity, sr0: Infinity, sc1: -1, sr1: -1 };
    while (stack.length) {
      const j = stack.pop();
      const sc = j % world.sectors.cols;
      const sr = Math.floor(j / world.sectors.cols);
      cluster.count += 1;
      cluster.sc0 = Math.min(cluster.sc0, sc); cluster.sc1 = Math.max(cluster.sc1, sc);
      cluster.sr0 = Math.min(cluster.sr0, sr); cluster.sr1 = Math.max(cluster.sr1, sr);
      for (const k of [j - 1, j + 1, j - world.sectors.cols, j + world.sectors.cols]) {
        if (k >= 0 && k < towns.length && !seen[k] && towns[k] === TOWN) { seen[k] = 1; stack.push(k); }
      }
    }
    if (!best || cluster.count > best.count) best = cluster;
  }
  if (!best) throw new Error(`no sectors for town ${TOWN}`);
  box = { cx0: best.sc0 * CPX, cy0: best.sr0 * CPY, cx1: (best.sc1 + 1) * CPX - 1, cy1: (best.sr1 + 1) * CPY - 1 };
}

// deterministic solid-adjacent footprint-clear spots
const rng = (() => { let s = SEED >>> 0; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const spots = [];
let guard = 0;
while (spots.length < SPOTS && guard < 200000) {
  guard += 1;
  const cx = Math.floor(box.cx0 + rng() * (box.cx1 - box.cx0));
  const cy = Math.floor(box.cy0 + rng() * (box.cy1 - box.cy0));
  if (solid(cx, cy)) continue;
  const adjSolid = solid(cx + 1, cy) || solid(cx - 1, cy) || solid(cx, cy + 1) || solid(cx, cy - 1);
  if (!adjSolid) continue;
  const feet = { x: cx * CS + 4, y: cy * CS + 4 };
  if (!walkableFootprintClear(feet, solidRows, grid)) continue;
  if (spots.some((s) => Math.abs(s.x - feet.x) + Math.abs(s.y - feet.y) < 64)) continue;
  spots.push(feet);
}

// one canopy walk-behind spot (0x02 walkable cell)
let canopy = null;
for (let cy = box.cy0; cy <= box.cy1 && !canopy; cy += 1) {
  for (let cx = box.cx0; cx <= box.cx1 && !canopy; cx += 1) {
    if (!solid(cx, cy) && (byte(cx, cy) & 0x02) !== 0) canopy = { x: cx * CS + 4, y: cy * CS + 4 };
  }
}

const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
const browser = await chromium.launch();
const violations = [];
let checks = 0;

for (const spot of spots) {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  await page.goto(`${BASE}?nointro=1&noEncounters=1&spawn=${spot.x},${spot.y}`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(globalThis.__solidAt), null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  for (const dir of ["up", "down", "left", "right"]) {
    await page.keyboard.down(KEYS[dir]);
    for (let t = 0; t < 8; t += 1) {
      await page.waitForTimeout(90);
      const sample = await page.evaluate(() => {
        const p = globalThis.__firstSceneDebug?.player;
        if (!p) return null;
        const points = [
          [p.x, p.y],
          [p.x - 7, p.y - 6],
          [p.x + 6, p.y - 6],
          [p.x - 7, p.y],
          [p.x + 6, p.y]
        ];
        return { x: p.x, y: p.y, inSolid: points.some(([x, y]) => globalThis.__solidAt(x, y)) };
      });
      checks += 1;
      if (sample?.inSolid) {
        violations.push({ kind: "footprint-in-solid", spot, dir, at: { x: sample.x, y: sample.y } });
        break;
      }
    }
    await page.keyboard.up(KEYS[dir]);
    await page.waitForTimeout(100);
  }
  await page.close();
}

let canopyResult = null;
if (canopy) {
  const page = await browser.newPage({ viewport: { width: 512, height: 448 } });
  await page.goto(`${BASE}?nointro=1&noEncounters=1&spawn=${canopy.x},${canopy.y}`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(globalThis.__fgCoverageRect), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  canopyResult = await page.evaluate(() => {
    const p = globalThis.__firstSceneDebug?.player;
    return { at: { x: p?.x, y: p?.y }, cover: globalThis.__fgCoverageRect(p.x - 8, p.y - 24, 16, 24) };
  });
  if (!canopyResult.cover || canopyResult.cover.ratio <= 0) {
    violations.push({ kind: "canopy-not-occluding", canopy, cover: canopyResult?.cover });
  }
  await page.close();
}

await browser.close();
console.log(
  "RESULT_JSON:" +
    JSON.stringify({ town: TOWN, spots: spots.length, checks, canopy: canopyResult, violations })
);
if (violations.length > 0) {
  console.error(`${violations.length} violation(s)`);
  process.exit(1);
}
console.log(`OK — ${spots.length} boundary spots x 4 directions, ${checks} samples, 0 violations`);
