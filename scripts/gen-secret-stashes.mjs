// Finds spots that are reachable ONLY via the new traversal mechanics — climb a
// ladder, wade deep water, or step onto a canopy hide cell — and proposes them as
// hidden-present locations. Two floods from spawn: a BASE flood (plain walking,
// authored overrides applied) and an EXTENDED flood that also crosses ladder
// columns / deep water. Cells the extended flood reaches but the base flood does
// not are "traversal-gated"; the deepest such pockets become stash candidates.
//
// Run: node --import tsx scripts/gen-secret-stashes.mjs [--count 8]
// Output: tmp/collision/secret-stash-candidates.json (+ per-town labels)
import fs from "node:fs";
import path from "node:path";
import { walkableFootprintClear } from "../apps/game/src/collisionFootprint.ts";
import { applySolidOverrideRects } from "../apps/game/src/collisionOverrides.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");
const OUT_DIR = path.join(ROOT, "tmp/collision");

const args = process.argv.slice(2);
const COUNT = Number((args[args.indexOf("--count") + 1] && args.includes("--count")) ? args[args.indexOf("--count") + 1] : 10);

const world = JSON.parse(fs.readFileSync(path.join(GENERATED, "world.json"), "utf8"));
const { cellSize: CS, width: W, height: H, solidRows: rawSolid, surfaceRows } = world.collision;
const solidRows = rawSolid.map((r) => r);
const grid = { cellSize: CS, width: W, height: H };
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "content/collision-overrides.json"), "utf8"));
applySolidOverrideRects(solidRows, overrides.solids ?? [], CS);

const byte = (cx, cy) => Number.parseInt(surfaceRows[cy]?.slice(cx * 2, cx * 2 + 2) ?? "0", 16);
const solid = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || solidRows[cy][cx] === "1";
const isLadder = (cx, cy) => (byte(cx, cy) & 0x10) !== 0;
const isDeepWater = (cx, cy) => (byte(cx, cy) & 0x0c) === 0x0c;
const isCanopy = (cx, cy) => (byte(cx, cy) & 0x02) !== 0;

// STEP grid flood over cell centers using the real foot box; `extended` lets the
// player cross ladder columns (vertical) and deep water.
function flood(extended) {
  const seen = new Uint8Array(W * H);
  const spawn = world.player.spawnWorldPixel;
  const start = { cx: Math.floor(spawn.x / CS), cy: Math.floor(spawn.y / CS) };
  const queue = [start];
  seen[start.cy * W + start.cx] = 1;
  const passable = (cx, cy, fromLadderCol) => {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false;
    const p = { x: cx * CS + CS / 2, y: cy * CS + CS / 2 };
    if (walkableFootprintClear(p, solidRows, grid)) {
      return !extended ? !isDeepWater(cx, cy) : true; // base flood stops at deep water
    }
    // solid cell: extended flood may pass if it's a ladder column continuation
    return extended && fromLadderCol && isLadder(cx, cy);
  };
  let head = 0;
  while (head < queue.length) {
    const { cx, cy } = queue[head++];
    const onLadder = isLadder(cx, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx]) continue;
      const vertical = dx === 0;
      if (!passable(nx, ny, extended && vertical && (onLadder || isLadder(nx, ny)))) continue;
      seen[ny * W + nx] = 1;
      queue.push({ cx: nx, cy: ny });
    }
  }
  return seen;
}

const base = flood(false);
const extended = flood(true);

// gated cells: reachable extended, NOT reachable base, walkable, not on a door
const doorCells = new Set();
for (const d of world.doors ?? []) {
  for (const pt of [d.worldPixel, d.destinationWorldPixel]) {
    if (!pt) continue;
    doorCells.add(`${Math.floor(pt.x / CS)},${Math.floor(pt.y / CS)}`);
  }
}
const gated = [];
for (let cy = 0; cy < H; cy += 1) {
  for (let cx = 0; cx < W; cx += 1) {
    if (!extended[cy * W + cx] || base[cy * W + cx]) continue;
    if (solid(cx, cy) || doorCells.has(`${cx},${cy}`)) continue;
    if (!walkableFootprintClear({ x: cx * CS + CS / 2, y: cy * CS + CS / 2 }, solidRows, grid)) continue;
    let via = "ladder";
    if (isDeepWater(cx, cy)) via = "deep-water";
    else if (isCanopy(cx, cy)) via = "canopy";
    gated.push({ cx, cy, via });
  }
}

// cluster gated cells (8-connected) and take the deepest cell of each big cluster
const seenC = new Set();
const clusters = [];
for (const g of gated) {
  const key = `${g.cx},${g.cy}`;
  if (seenC.has(key)) continue;
  const stack = [g];
  seenC.add(key);
  const cells = [];
  while (stack.length) {
    const c = stack.pop();
    cells.push(c);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const n = gated.find((q) => q.cx === c.cx + dx && q.cy === c.cy + dy && !seenC.has(`${q.cx},${q.cy}`));
        if (n) { seenC.add(`${n.cx},${n.cy}`); stack.push(n); }
      }
    }
  }
  clusters.push(cells);
}
clusters.sort((a, b) => b.length - a.length);

// town attribution
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
const townOf = (cx, cy) => towns[Math.floor(cy / CPY) * world.sectors.cols + Math.floor(cx / CPX)] ?? "none";

const candidates = clusters.slice(0, COUNT).map((cells, i) => {
  // centroid-ish: the cell whose neighbors are most gated (deepest in the pocket)
  const pick = cells.reduce((best, c) => {
    const score = cells.filter((q) => Math.abs(q.cx - c.cx) <= 1 && Math.abs(q.cy - c.cy) <= 1).length;
    return score > best.score ? { c, score } : best;
  }, { c: cells[0], score: 0 }).c;
  const viaCounts = cells.reduce((acc, c) => ((acc[c.via] = (acc[c.via] ?? 0) + 1), acc), {});
  const via = Object.entries(viaCounts).sort((a, b) => b[1] - a[1])[0][0];
  return {
    id: i,
    worldPixel: { x: pick.cx * CS + CS / 2, y: pick.cy * CS + CS / 2 },
    via,
    clusterCells: cells.length,
    town: townOf(pick.cx, pick.cy)
  };
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "secret-stash-candidates.json"), JSON.stringify({ gatedCells: gated.length, clusters: clusters.length, candidates }, null, 2));
console.log(`traversal-gated cells: ${gated.length}, clusters: ${clusters.length}`);
console.log(`top ${candidates.length} stash candidates:`);
for (const c of candidates) console.log(`  ${c.town} via ${c.via} @ (${c.worldPixel.x},${c.worldPixel.y}) [${c.clusterCells} cells]`);
console.log("wrote", path.join(OUT_DIR, "secret-stash-candidates.json"));
