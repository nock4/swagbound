// Candidate generator for authored roof/behind-building solid collision.
//
// EarthBound's roof cells convert to WALKABLE (surface-00, no priority — see
// memory/roof-walking-diagnosis). They are geometrically "passable pockets enclosed
// by the building's solid walls, reachable only through the narrow door gap." This
// script finds those pockets and emits candidate solid rects for REVIEW.
//
// Method (per region box, in collision cells):
//   1. solid grid from world.collision.solidRows
//   2. morphological CLOSING (dilate r=1 then erode r=1) -> seals <=2-cell doors
//   3. flood exterior from the box border over sealed-passable cells
//   4. enclosed = passable AND not exterior -> roof/behind-building cells
//   5. connected components, size/fill filtered, merged into rects (world px)
//
// Output: scratchpad review JSON (candidates + stats). Human promotes good rects
// into content/collision-overrides.json, then rebuild.
//
// Usage: node scripts/gen-collision-overrides.mjs [x0 y0 x1 y1]   (world px box; default = Onett)
import fs from "node:fs";

const WORLD = "apps/game/public/generated/world.json";
const OUT = process.env.OUT ?? "tmp/collision-candidates.json";

// Onett town box (world px). Generous; town buildings cluster here.
const [px0, py0, px1, py1] = process.argv.slice(2).map(Number).length === 4
  ? process.argv.slice(2).map(Number)
  : [960, 1200, 3280, 2720];

const world = JSON.parse(fs.readFileSync(WORLD, "utf8"));
const { cellSize: cs, width: W, height: H, solidRows } = world.collision;

const cx0 = Math.max(0, Math.floor(px0 / cs));
const cy0 = Math.max(0, Math.floor(py0 / cs));
const cx1 = Math.min(W - 1, Math.floor((px1 - 1) / cs));
const cy1 = Math.min(H - 1, Math.floor((py1 - 1) / cs));
const rw = cx1 - cx0 + 1;
const rh = cy1 - cy0 + 1;

const idx = (lx, ly) => ly * rw + lx;
const solid = new Uint8Array(rw * rh);
for (let ly = 0; ly < rh; ly += 1) {
  const row = solidRows[cy0 + ly];
  for (let lx = 0; lx < rw; lx += 1) solid[idx(lx, ly)] = row[cx0 + lx] === "1" ? 1 : 0;
}

// Solid connected components (8-connected) = buildings (wall outlines), trees, cliffs,
// small props. A building's ROOF is the passable interior of its wall diamond.
const wall = new Int32Array(rw * rh).fill(-1);
const wallComps = [];
for (let ly = 0; ly < rh; ly += 1) for (let lx = 0; lx < rw; lx += 1) {
  const i = idx(lx, ly);
  if (!solid[i] || wall[i] >= 0) continue;
  const id = wallComps.length;
  const cells = [];
  const st = [[lx, ly]];
  wall[i] = id;
  while (st.length) {
    const [x, y] = st.pop();
    cells.push([x, y]);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
      const j = idx(nx, ny);
      if (solid[j] && wall[j] < 0) { wall[j] = id; st.push([nx, ny]); }
    }
  }
  wallComps.push(cells);
}

// For each building-sized wall component, fill its ROOF: passable cells inside the
// component bbox that are "sandwiched" by THIS component's walls on all 4 sides
// (a solid-of-this-component to the left, right, above AND below within the bbox).
// This fills convex roof interiors and naturally leaves the door open (the door column
// has no wall below it, so it isn't sandwiched vertically -> stays walkable).
// bbox via loop (spread on huge terrain arrays overflows the stack).
function bbox(cells) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, x1, y0, y1];
}
// Caps are env-overridable so a Fourside/Summers pass can relax them for big structures.
const MAXW = Number(process.env.MAXW ?? 44);
const MAXH = Number(process.env.MAXH ?? 36);
const MINFILL = Number(process.env.MINFILL ?? 0.3);
const comps = [];
for (let id = 0; id < wallComps.length; id += 1) {
  const cells = wallComps[id];
  // Skip terrain: giant solid blobs (ocean edge, cliffs, continent) are not buildings.
  if (cells.length > 2500) continue;
  const [bx0, bx1, by0, by1] = bbox(cells);
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
  // Only buildings: outline must span a house-ish box. Skips 4-cell props, thin fences,
  // AND large terrain masses (cliffs/mesas) — real EB buildings are compact (Onett max 24x19).
  if (bw < 6 || bh < 6 || cells.length < 14 || bw > MAXW || bh > MAXH) continue;
  const isWall = (x, y) => x >= 0 && x < rw && y >= 0 && y < rh && wall[idx(x, y)] === id;
  const roof = [];
  for (let y = by0; y <= by1; y += 1) for (let x = bx0; x <= bx1; x += 1) {
    if (solid[idx(x, y)]) continue; // already a wall
    let L = false, R = false, U = false, D = false;
    for (let x2 = x - 1; x2 >= bx0; x2 -= 1) if (isWall(x2, y)) { L = true; break; }
    for (let x2 = x + 1; x2 <= bx1; x2 += 1) if (isWall(x2, y)) { R = true; break; }
    for (let y2 = y - 1; y2 >= by0; y2 -= 1) if (isWall(x, y2)) { U = true; break; }
    for (let y2 = y + 1; y2 <= by1; y2 += 1) if (isWall(x, y2)) { D = true; break; }
    if (L && R && U && D) roof.push([x, y]);
  }
  if (roof.length >= 4) comps.push(roof);
}

// Exclude any roof cell a door lands on or departs from (±1-cell footprint margin).
// Warp-reachable decks/rooms look identical to sealed roof pockets to the sandwich
// heuristic — cross-checking world.doors[] is what separates them (audit: 8 corrupted
// door landings shipped without this).
const doorCells = new Set();
for (const door of world.doors ?? []) {
  for (const point of [door.worldPixel, door.destinationWorldPixel]) {
    if (!point) continue;
    const dcx = Math.floor(point.x / cs) - cx0;
    const dcy = Math.floor(point.y / cs) - cy0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      doorCells.add(`${dcx + dx},${dcy + dy}`);
    }
  }
}
for (let c = 0; c < comps.length; c += 1) {
  comps[c] = comps[c].filter(([x, y]) => !doorCells.has(`${x},${y}`));
}

// Merge a component's cells into rectangles: per-row horizontal runs, then merge
// vertically-adjacent runs with identical x-span. Precise (no bbox over-reach).
function cellsToRects(cells) {
  const byRow = new Map();
  for (const [x, y] of cells) { if (!byRow.has(y)) byRow.set(y, []); byRow.get(y).push(x); }
  const runs = []; // {y, x0, x1}
  for (const [y, xs] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let s = xs[0], p = xs[0];
    for (let k = 1; k < xs.length; k += 1) {
      if (xs[k] === p + 1) { p = xs[k]; continue; }
      runs.push({ y, x0: s, x1: p }); s = xs[k]; p = xs[k];
    }
    runs.push({ y, x0: s, x1: p });
  }
  const rects = []; // merge vertically
  const used = new Array(runs.length).fill(false);
  for (let a = 0; a < runs.length; a += 1) {
    if (used[a]) continue;
    let { y, x0, x1 } = runs[a]; let yTop = y, yBot = y; used[a] = true;
    let extended = true;
    while (extended) {
      extended = false;
      for (let b = 0; b < runs.length; b += 1) {
        if (used[b]) continue;
        if (runs[b].x0 === x0 && runs[b].x1 === x1 && runs[b].y === yBot + 1) {
          yBot = runs[b].y; used[b] = true; extended = true;
        }
      }
    }
    rects.push({ cx: x0, cy: yTop, cw: x1 - x0 + 1, ch: yBot - yTop + 1 });
  }
  return rects;
}

// Filter + build candidates. Roof pockets: ~6..300 cells. Drop tiny noise + huge yards.
const MIN_CELLS = 4, MAX_CELLS = 400;
const candidates = [];
for (let id = 0; id < comps.length; id += 1) {
  const cells = comps[id];
  if (cells.length < MIN_CELLS || cells.length > MAX_CELLS) continue;
  const [bx0, bx1, by0, by1] = bbox(cells);
  const bboxCells = (bx1 - bx0 + 1) * (by1 - by0 + 1);
  const fill = cells.length / bboxCells;
  // Reject terrain: cliffs/roads/forest edges produce a large sparse bbox with only a
  // few spuriously-sandwiched cells. Real building roofs fill >=15% of their bbox and
  // fit a building-sized box. (Reviewed empirically on Onett: buildings 0.31-0.62.)
  const bbw = bx1 - bx0 + 1, bbh = by1 - by0 + 1;
  if (fill < MINFILL || bbw > MAXW || bbh > MAXH) continue;
  const rects = cellsToRects(cells).map(r => ({
    x: (cx0 + r.cx) * cs, y: (cy0 + r.cy) * cs, w: r.cw * cs, h: r.ch * cs
  }));
  candidates.push({
    id,
    worldBBox: { x: (cx0 + bx0) * cs, y: (cy0 + by0) * cs, w: (bx1 - bx0 + 1) * cs, h: (by1 - by0 + 1) * cs },
    cells: cells.length,
    fill: Number(fill.toFixed(2)),
    rectCount: rects.length,
    rects
  });
}
candidates.sort((a, b) => a.worldBBox.y - b.worldBBox.y || a.worldBBox.x - b.worldBBox.x);

fs.writeFileSync(OUT, JSON.stringify({
  region: { px: [px0, py0, px1, py1], cells: [cx0, cy0, cx1, cy1] },
  count: candidates.length,
  totalRects: candidates.reduce((n, c) => n + c.rectCount, 0),
  candidates
}, null, 2));
console.log(`region px [${px0},${py0}]-[${px1},${py1}] cells ${rw}x${rh}`);
console.log(`candidates: ${candidates.length}, total rects: ${candidates.reduce((n, c) => n + c.rectCount, 0)}`);
console.log("wrote", OUT);
