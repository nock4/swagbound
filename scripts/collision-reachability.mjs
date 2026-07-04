// Collision-reachability anomaly tool — the engine of the collision-exactness effort.
//
// Floods the world from the new-game spawn using the RUNTIME movement model:
//   - the real 13x6 player foot box (walkableFootprintClear, imported from the app)
//   - authored collision-overrides applied first (same shared module as the scene)
//   - door warps as graph edges (landing via the runtime's resolveDoorWarpLanding)
// on a 4px lattice (finer than the 8px collision cell, so gaps only passable at
// off-center feet positions are still found).
//
// Then classifies "reachable but shouldn't be" anomalies:
//   B. roofPockets — reachable enclosed pockets inside building wall outlines
//      (sandwich heuristic per gen-collision-overrides.mjs) = roof leaks the
//      authored overrides don't cover yet
//   C. stampedBuildings — reachable walkable cells under re-stamped building art
//      (content/building-overrides.json): art wider than EB collision
//   D. doors — reachable triggers whose landing is not walkable / not reachable
//
// Outputs to tmp/collision/:
//   reachability.json          stats + ranked anomalies
//   override-candidates.json   pocket anomalies as promotable solid rects
//   reach-<town>.png           map art + green reachable / red pocket / orange
//                              stamped / magenta door anomalies (via --towns)
//
// Run: node --import tsx scripts/collision-reachability.mjs [--towns onett,twoson] [--all-towns] [--no-png]
import fs from "node:fs";
import path from "node:path";
import { walkableFootprintClear } from "../apps/game/src/collisionFootprint.ts";
import { applySolidOverrideRects } from "../apps/game/src/collisionOverrides.ts";
import { resolveDoorWarpLanding } from "../apps/game/src/doorTriggers.ts";
import { decodePngRgba, encodePngRgba } from "../packages/eb-converter/src/png.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");
const OUT_DIR = path.join(ROOT, "tmp/collision");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const RENDER_PNG = !args.includes("--no-png");
const TOWNS = args.includes("--all-towns") ? null : argValue("--towns", "onett").split(",").filter(Boolean);

const world = JSON.parse(fs.readFileSync(path.join(GENERATED, "world.json"), "utf8"));
const { cellSize: CS, width: W, height: H, solidRows } = world.collision;
const grid = { cellSize: CS, width: W, height: H };

// ---- authored overrides first (identical to the scene's init path) ----
const overridesFile = path.join(ROOT, "content/collision-overrides.json");
const overrides = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, "utf8")) : { solids: [] };
applySolidOverrideRects(solidRows, overrides.solids ?? [], CS);

const solidAt = (cx, cy) => cx < 0 || cy < 0 || cx >= W || cy >= H || solidRows[cy][cx] === "1";

// ---- lattice flood from spawn, doors as edges ----
const STEP = 4;
const LW = Math.floor((W * CS) / STEP);
const LH = Math.floor((H * CS) / STEP);
const nodeIndex = (nx, ny) => ny * LW + nx;
const passable = (nx, ny) => walkableFootprintClear({ x: nx * STEP, y: ny * STEP }, solidRows, grid);

// door edges: passable lattice nodes within 2 cells of a trigger -> landing node
const doorEdges = new Map(); // nodeIndex -> number[] landing node indexes
const doorInfos = [];
for (const door of world.doors ?? []) {
  if (!door.destinationWorldPixel) continue;
  const landing = resolveDoorWarpLanding(door.destinationWorldPixel, solidRows, grid);
  const landNode = landing.walkable
    ? { nx: Math.round(landing.point.x / STEP), ny: Math.round(landing.point.y / STEP) }
    : null;
  const landIdx = landNode && passable(landNode.nx, landNode.ny) ? nodeIndex(landNode.nx, landNode.ny) : null;
  const approaches = [];
  const t = door.worldPixel;
  const reachRadiusPx = CS * 2;
  for (let y = t.y - reachRadiusPx; y <= t.y + reachRadiusPx; y += STEP) {
    for (let x = t.x - reachRadiusPx; x <= t.x + reachRadiusPx; x += STEP) {
      const nx = Math.round(x / STEP);
      const ny = Math.round(y / STEP);
      if (nx < 0 || ny < 0 || nx >= LW || ny >= LH || !passable(nx, ny)) continue;
      approaches.push(nodeIndex(nx, ny));
      if (landIdx !== null) {
        const list = doorEdges.get(nodeIndex(nx, ny)) ?? [];
        list.push(landIdx);
        doorEdges.set(nodeIndex(nx, ny), list);
      }
    }
  }
  doorInfos.push({ door, landing, landIdx, approaches });
}

const visited = new Uint8Array(LW * LH);
const queue = new Int32Array(LW * LH);
let qHead = 0;
let qTail = 0;
const spawn = world.player.spawnWorldPixel;
{
  const sx = Math.round(spawn.x / STEP);
  const sy = Math.round(spawn.y / STEP);
  const start = passable(sx, sy) ? { nx: sx, ny: sy } : null;
  if (!start) throw new Error(`spawn (${spawn.x},${spawn.y}) is not footprint-clear`);
  visited[nodeIndex(start.nx, start.ny)] = 1;
  queue[qTail++] = nodeIndex(start.nx, start.ny);
}
while (qHead < qTail) {
  const idx = queue[qHead++];
  const nx = idx % LW;
  const ny = Math.floor(idx / LW);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const mx = nx + dx;
    const my = ny + dy;
    if (mx < 0 || my < 0 || mx >= LW || my >= LH) continue;
    const midx = nodeIndex(mx, my);
    if (visited[midx] || !passable(mx, my)) continue;
    visited[midx] = 1;
    queue[qTail++] = midx;
  }
  const warps = doorEdges.get(idx);
  if (warps) {
    for (const w of warps) {
      if (!visited[w]) {
        visited[w] = 1;
        queue[qTail++] = w;
      }
    }
  }
}

// cell-level reachability: a cell is reachable if any lattice node whose FEET land
// in it was visited
const cellReachable = new Uint8Array(W * H);
let reachableNodeCount = 0;
for (let ny = 0; ny < LH; ny += 1) {
  for (let nx = 0; nx < LW; nx += 1) {
    if (!visited[nodeIndex(nx, ny)]) continue;
    reachableNodeCount += 1;
    const cx = Math.floor((nx * STEP) / CS);
    const cy = Math.floor((ny * STEP) / CS);
    cellReachable[cy * W + cx] = 1;
  }
}
let reachableCellCount = 0;
for (let i = 0; i < cellReachable.length; i += 1) reachableCellCount += cellReachable[i];

// ---- town attribution (map_sectors.yml, same parse as surface-flag-census) ----
const SECTOR_COLS = world.sectors.cols;
const SECTOR_ROWS = world.sectors.rows;
const CELLS_PER_SECTOR_X = (world.sectors.sectorWidthTiles * world.sectors.tileSize) / CS;
const CELLS_PER_SECTOR_Y = (world.sectors.sectorHeightTiles * world.sectors.tileSize) / CS;
const sectorTown = new Array(SECTOR_COLS * SECTOR_ROWS).fill("none");
{
  const lines = fs.readFileSync(path.join(ROOT, "external/coilsnake-full/map_sectors.yml"), "utf8").split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    let m = line.match(/^(\d+):\s*$/);
    if (m) { cur = Number(m[1]); continue; }
    m = line.match(/^\s+Town Map:\s*(\S+)/);
    if (m && cur != null) sectorTown[cur] = m[1];
  }
}
const townOfCell = (cx, cy) => {
  const sc = Math.floor(cx / CELLS_PER_SECTOR_X);
  const sr = Math.floor(cy / CELLS_PER_SECTOR_Y);
  return sectorTown[sr * SECTOR_COLS + sc] ?? "none";
};

// ---- anomaly B: reachable roof pockets (sandwich heuristic on the overridden grid) ----
const doorCellSet = new Set();
for (const door of world.doors ?? []) {
  for (const point of [door.worldPixel, door.destinationWorldPixel]) {
    if (!point) continue;
    const dcx = Math.floor(point.x / CS);
    const dcy = Math.floor(point.y / CS);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) doorCellSet.add(`${dcx + dx},${dcy + dy}`);
  }
}

const wall = new Int32Array(W * H).fill(-1);
const wallComps = [];
for (let cy = 0; cy < H; cy += 1) {
  for (let cx = 0; cx < W; cx += 1) {
    if (!solidAt(cx, cy) || wall[cy * W + cx] >= 0) continue;
    const id = wallComps.length;
    const cells = [];
    const stack = [[cx, cy]];
    wall[cy * W + cx] = id;
    while (stack.length) {
      const [x, y] = stack.pop();
      cells.push([x, y]);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const mx = x + dx;
          const my = y + dy;
          if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
          if (solidAt(mx, my) && wall[my * W + mx] < 0) {
            wall[my * W + mx] = id;
            stack.push([mx, my]);
          }
        }
      }
    }
    wallComps.push(cells);
  }
}

const MAXW = Number(process.env.MAXW ?? 44);
const MAXH = Number(process.env.MAXH ?? 36);
const bbox = (cells) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, x1, y0, y1];
};
const pocketAnomalies = [];
for (let id = 0; id < wallComps.length; id += 1) {
  const cells = wallComps[id];
  if (cells.length > 2500 || cells.length < 14) continue;
  const [bx0, bx1, by0, by1] = bbox(cells);
  const bw = bx1 - bx0 + 1;
  const bh = by1 - by0 + 1;
  if (bw < 6 || bh < 6 || bw > MAXW || bh > MAXH) continue;
  const isWall = (x, y) => x >= 0 && x < W && y >= 0 && y < H && wall[y * W + x] === id;
  const leakCells = [];
  for (let y = by0; y <= by1; y += 1) {
    for (let x = bx0; x <= bx1; x += 1) {
      if (solidAt(x, y) || !cellReachable[y * W + x] || doorCellSet.has(`${x},${y}`)) continue;
      let L = false, R = false, U = false, D = false;
      for (let x2 = x - 1; x2 >= bx0 && !L; x2 -= 1) L = isWall(x2, y);
      for (let x2 = x + 1; x2 <= bx1 && !R; x2 += 1) R = isWall(x2, y);
      for (let y2 = y - 1; y2 >= by0 && !U; y2 -= 1) U = isWall(x, y2);
      for (let y2 = y + 1; y2 <= by1 && !D; y2 += 1) D = isWall(x, y2);
      if (L && R && U && D) leakCells.push([x, y]);
    }
  }
  if (leakCells.length < 3) continue;
  const [lx0, lx1, ly0, ly1] = bbox(leakCells);
  pocketAnomalies.push({
    town: townOfCell(lx0, ly0),
    cells: leakCells.length,
    worldBBox: { x: lx0 * CS, y: ly0 * CS, w: (lx1 - lx0 + 1) * CS, h: (ly1 - ly0 + 1) * CS },
    rects: cellsToRects(leakCells).map((r) => ({ x: r.cx * CS, y: r.cy * CS, w: r.cw * CS, h: r.ch * CS })),
    leakCells
  });
}
pocketAnomalies.sort((a, b) => b.cells - a.cells);

// ---- anomaly C: reachable walkable cells whose art the building stamps CHANGED ----
// The stamps are mostly seamless re-signed crops (same silhouette as EB), so a
// walkable cell only matters when its pixels actually differ from the pre-stamp
// background (snapshot in apps/game/public/editor-chunks/). Unchanged-art cells
// keep EB's own art, for which EB's collision is already correct.
const buildingsFile = path.join(ROOT, "content/building-overrides.json");
const stampedAnomalies = [];
if (fs.existsSync(buildingsFile)) {
  const CHUNK_PX = world.chunkSizeTiles * world.tileSize;
  const chunkPair = new Map(); // "cx,cy" -> {post, pre} | null
  const loadChunkPair = (chunkX, chunkY) => {
    const key = `${chunkX},${chunkY}`;
    if (chunkPair.has(key)) return chunkPair.get(key);
    const postFile = path.join(GENERATED, `assets/world/chunks/background-${chunkX}-${chunkY}.png`);
    const preFile = path.join(ROOT, `apps/game/public/editor-chunks/background-${chunkX}-${chunkY}.png`);
    const pair =
      fs.existsSync(postFile) && fs.existsSync(preFile)
        ? { post: decodePngRgba(fs.readFileSync(postFile), postFile), pre: decodePngRgba(fs.readFileSync(preFile), preFile) }
        : null;
    chunkPair.set(key, pair);
    return pair;
  };
  const cellArtChanged = (cx, cy) => {
    const chunkX = Math.floor((cx * CS) / CHUNK_PX);
    const chunkY = Math.floor((cy * CS) / CHUNK_PX);
    const pair = loadChunkPair(chunkX, chunkY);
    if (!pair) return true; // no snapshot -> keep the cell (conservative)
    const lx = cx * CS - chunkX * CHUNK_PX;
    const ly = cy * CS - chunkY * CHUNK_PX;
    let changed = 0;
    for (let py = ly; py < ly + CS; py += 1) {
      for (let px = lx; px < lx + CS; px += 1) {
        const i = (py * pair.post.width + px) * 4;
        if (
          Math.abs(pair.post.rgba[i] - pair.pre.rgba[i]) > 10 ||
          Math.abs(pair.post.rgba[i + 1] - pair.pre.rgba[i + 1]) > 10 ||
          Math.abs(pair.post.rgba[i + 2] - pair.pre.rgba[i + 2]) > 10
        ) {
          changed += 1;
        }
      }
    }
    return changed > 4; // >4 of 64 px differ = the stamp really redrew this cell
  };
  const { buildings } = JSON.parse(fs.readFileSync(buildingsFile, "utf8"));
  for (const b of buildings ?? []) {
    const [chunkX, chunkY] = b.chunk.split(",").map(Number);
    const rect = { x: chunkX * CHUNK_PX + b.x, y: chunkY * CHUNK_PX + b.y, w: b.w, h: b.h };
    const c0 = Math.max(0, Math.floor(rect.x / CS));
    const c1 = Math.min(W - 1, Math.floor((rect.x + rect.w - 1) / CS));
    const r0 = Math.max(0, Math.floor(rect.y / CS));
    const r1 = Math.min(H - 1, Math.floor((rect.y + rect.h - 1) / CS));
    const hits = [];
    for (let cy = r0; cy <= r1; cy += 1) {
      for (let cx = c0; cx <= c1; cx += 1) {
        if (!solidAt(cx, cy) && cellReachable[cy * W + cx] && !doorCellSet.has(`${cx},${cy}`) && cellArtChanged(cx, cy)) {
          hits.push([cx, cy]);
        }
      }
    }
    if (hits.length === 0) continue;
    stampedAnomalies.push({
      building: b.id,
      town: townOfCell(c0, r0),
      worldRect: rect,
      reachableWalkableCells: hits.length,
      cells: hits
    });
  }
  stampedAnomalies.sort((a, b) => b.reachableWalkableCells - a.reachableWalkableCells);
}

// ---- anomaly D: reachable doors with broken landings ----
const doorAnomalies = [];
for (const info of doorInfos) {
  const triggerReachable = info.approaches.some((idx) => visited[idx]);
  if (!triggerReachable) continue;
  const landingUnreachable = info.landIdx === null || !visited[info.landIdx];
  if (!info.landing.walkable || landingUnreachable) {
    doorAnomalies.push({
      trigger: info.door.worldPixel,
      destination: info.door.destinationWorldPixel,
      landingWalkable: info.landing.walkable,
      landingReachable: info.landIdx !== null && Boolean(visited[info.landIdx]),
      town: townOfCell(Math.floor(info.door.worldPixel.x / CS), Math.floor(info.door.worldPixel.y / CS))
    });
  }
}

// ---- outputs ----
fs.mkdirSync(OUT_DIR, { recursive: true });
const stats = {
  latticeStep: STEP,
  reachableNodes: reachableNodeCount,
  reachableCells: reachableCellCount,
  overrideRectsApplied: overrides.solids?.length ?? 0,
  doors: doorInfos.length,
  anomalies: {
    roofPockets: pocketAnomalies.length,
    roofPocketCells: pocketAnomalies.reduce((n, a) => n + a.cells, 0),
    stampedBuildings: stampedAnomalies.length,
    doors: doorAnomalies.length
  }
};
fs.writeFileSync(
  path.join(OUT_DIR, "reachability.json"),
  JSON.stringify(
    {
      schema: "swagbound.collision-reachability.v1",
      spawn,
      stats,
      roofPockets: pocketAnomalies.map(({ leakCells: _cells, ...rest }) => rest),
      stampedBuildings: stampedAnomalies.map(({ cells: _cells, ...rest }) => rest),
      doors: doorAnomalies
    },
    null,
    2
  )
);
fs.writeFileSync(
  path.join(OUT_DIR, "override-candidates.json"),
  JSON.stringify(
    {
      schema: "swagbound.collision-override-candidates.v1",
      generatedBy: "collision-reachability",
      candidates: [
        ...pocketAnomalies.map((a, i) => ({
          id: i,
          town: a.town,
          kind: "pocket",
          cells: a.cells,
          rects: a.rects.map((r) => ({ ...r, note: `[gen:reachability] ${a.town} pocket ${i} (${a.cells} cells)` }))
        })),
        ...stampedAnomalies.map((a, i) => ({
          id: pocketAnomalies.length + i,
          town: a.town,
          kind: "stamped",
          building: a.building,
          cells: a.reachableWalkableCells,
          rects: cellsToRects(a.cells).map((r) => ({
            x: r.cx * CS,
            y: r.cy * CS,
            w: r.cw * CS,
            h: r.ch * CS,
            note: `[gen:reachability] stamped ${a.building} art-changed walkable band`
          }))
        }))
      ]
    },
    null,
    2
  )
);

console.log(`reachable: ${reachableNodeCount.toLocaleString()} nodes / ${reachableCellCount.toLocaleString()} cells (of ${(W * H).toLocaleString()})`);
console.log(`anomalies: ${pocketAnomalies.length} roof pockets (${stats.anomalies.roofPocketCells} cells), ${stampedAnomalies.length} stamped buildings, ${doorAnomalies.length} doors`);
console.log("wrote", path.join(OUT_DIR, "reachability.json"), "+ override-candidates.json");

// ---- per-town review PNGs ----
if (RENDER_PNG) {
  const townBoxes = computeTownBoxes();
  const renderTowns = TOWNS ?? [...townBoxes.keys()];
  for (const town of renderTowns) {
    const box = townBoxes.get(town);
    if (!box) {
      console.warn(`no sectors tagged for town "${town}"`);
      continue;
    }
    fs.writeFileSync(path.join(OUT_DIR, `reach-${town}.png`), renderReachOverlay(box));
    console.log(`overlay: reach-${town}.png`);
  }
}

function computeTownBoxes() {
  const seen = new Uint8Array(SECTOR_COLS * SECTOR_ROWS);
  const clusters = new Map();
  for (let sr = 0; sr < SECTOR_ROWS; sr += 1) {
    for (let sc = 0; sc < SECTOR_COLS; sc += 1) {
      const start = sr * SECTOR_COLS + sc;
      const town = sectorTown[start];
      if (town === "none" || seen[start]) continue;
      const stack = [[sc, sr]];
      seen[start] = 1;
      let count = 0;
      const box = { sc0: sc, sr0: sr, sc1: sc, sr1: sr };
      while (stack.length) {
        const [x, y] = stack.pop();
        count += 1;
        box.sc0 = Math.min(box.sc0, x);
        box.sc1 = Math.max(box.sc1, x);
        box.sr0 = Math.min(box.sr0, y);
        box.sr1 = Math.max(box.sr1, y);
        for (const [mx, my] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (mx < 0 || my < 0 || mx >= SECTOR_COLS || my >= SECTOR_ROWS) continue;
          const mi = my * SECTOR_COLS + mx;
          if (!seen[mi] && sectorTown[mi] === town) {
            seen[mi] = 1;
            stack.push([mx, my]);
          }
        }
      }
      const list = clusters.get(town) ?? [];
      list.push({ count, box });
      clusters.set(town, list);
    }
  }
  const boxes = new Map();
  for (const [town, list] of clusters) {
    const best = list.sort((a, b) => b.count - a.count)[0].box;
    boxes.set(town, {
      cx0: best.sc0 * CELLS_PER_SECTOR_X,
      cy0: best.sr0 * CELLS_PER_SECTOR_Y,
      cx1: (best.sc1 + 1) * CELLS_PER_SECTOR_X - 1,
      cy1: (best.sr1 + 1) * CELLS_PER_SECTOR_Y - 1
    });
  }
  return boxes;
}

function renderReachOverlay(box) {
  const CHUNK_PX = world.chunkSizeTiles * world.tileSize;
  const wPx = (box.cx1 - box.cx0 + 1) * CS;
  const hPx = (box.cy1 - box.cy0 + 1) * CS;
  const originX = box.cx0 * CS;
  const originY = box.cy0 * CS;
  const rgba = new Uint8Array(wPx * hPx * 4);
  for (const chunk of world.chunks) {
    if (!chunk.background) continue;
    const chunkX = chunk.cx * CHUNK_PX;
    const chunkY = chunk.cy * CHUNK_PX;
    if (chunkX + CHUNK_PX <= originX || chunkX >= originX + wPx) continue;
    if (chunkY + CHUNK_PX <= originY || chunkY >= originY + hPx) continue;
    const file = path.join(GENERATED, chunk.background);
    if (!fs.existsSync(file)) continue;
    const png = decodePngRgba(fs.readFileSync(file), chunk.background);
    for (let py = 0; py < png.height; py += 1) {
      const gy = chunkY + py - originY;
      if (gy < 0 || gy >= hPx) continue;
      for (let px = 0; px < png.width; px += 1) {
        const gx = chunkX + px - originX;
        if (gx < 0 || gx >= wPx) continue;
        const src = (py * png.width + px) * 4;
        const dst = (gy * wPx + gx) * 4;
        rgba[dst] = png.rgba[src];
        rgba[dst + 1] = png.rgba[src + 1];
        rgba[dst + 2] = png.rgba[src + 2];
        rgba[dst + 3] = 255;
      }
    }
  }
  const tintCell = (cx, cy, [r, g, b, a]) => {
    if (cx < box.cx0 || cx > box.cx1 || cy < box.cy0 || cy > box.cy1) return;
    const k = a / 255;
    for (let py = 0; py < CS; py += 1) {
      for (let px = 0; px < CS; px += 1) {
        const dst = (((cy - box.cy0) * CS + py) * wPx + (cx - box.cx0) * CS + px) * 4;
        rgba[dst] = Math.round(rgba[dst] * (1 - k) + r * k);
        rgba[dst + 1] = Math.round(rgba[dst + 1] * (1 - k) + g * k);
        rgba[dst + 2] = Math.round(rgba[dst + 2] * (1 - k) + b * k);
        rgba[dst + 3] = 255;
      }
    }
  };
  for (let cy = box.cy0; cy <= box.cy1; cy += 1) {
    for (let cx = box.cx0; cx <= box.cx1; cx += 1) {
      if (cellReachable[cy * W + cx]) tintCell(cx, cy, [40, 220, 90, 70]);
    }
  }
  for (const a of pocketAnomalies) for (const [cx, cy] of a.leakCells) tintCell(cx, cy, [230, 30, 30, 170]);
  for (const a of stampedAnomalies) for (const [cx, cy] of a.cells) tintCell(cx, cy, [255, 150, 20, 140]);
  for (const d of doorAnomalies) {
    tintCell(Math.floor(d.trigger.x / CS), Math.floor(d.trigger.y / CS), [230, 40, 230, 200]);
    if (d.destination) tintCell(Math.floor(d.destination.x / CS), Math.floor(d.destination.y / CS), [230, 40, 230, 200]);
  }
  return encodePngRgba(wPx, hPx, rgba);
}

// per-row horizontal runs merged vertically when x-spans match (from gen-collision-overrides)
function cellsToRects(cells) {
  const byRow = new Map();
  for (const [x, y] of cells) {
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y).push(x);
  }
  const runs = [];
  for (const [y, xs] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let s = xs[0];
    let p = xs[0];
    for (let k = 1; k < xs.length; k += 1) {
      if (xs[k] === p + 1) {
        p = xs[k];
        continue;
      }
      runs.push({ y, x0: s, x1: p });
      s = xs[k];
      p = xs[k];
    }
    runs.push({ y, x0: s, x1: p });
  }
  const rects = [];
  const used = new Array(runs.length).fill(false);
  for (let a = 0; a < runs.length; a += 1) {
    if (used[a]) continue;
    const { y, x0, x1 } = runs[a];
    let yBot = y;
    used[a] = true;
    let extended = true;
    while (extended) {
      extended = false;
      for (let b = 0; b < runs.length; b += 1) {
        if (used[b]) continue;
        if (runs[b].x0 === x0 && runs[b].x1 === x1 && runs[b].y === yBot + 1) {
          yBot = runs[b].y;
          used[b] = true;
          extended = true;
        }
      }
    }
    rects.push({ cx: x0, cy: y, cw: x1 - x0 + 1, ch: yBot - y + 1 });
  }
  return rects;
}
