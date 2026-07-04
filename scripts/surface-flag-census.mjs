// Surface-flag census: the measurement half of the collision-exactness effort.
//
// Reads world.json collision (8px cells: solidRows + full EB surface byte per cell
// in surfaceRows) and reports how every flag bit is actually used, per town
// (town attribution from map_sectors.yml "Town Map"). Also decodes the BUILT
// foreground chunk PNGs to measure current walk-behind membership, so converter
// changes show up as a census delta.
//
// Outputs (to --out, default tmp/collision/):
//   census.json           — global + per-town byte/bit histograms, FG membership,
//                           town boxes, and per-class sample coordinates (world px)
//                           for native-probe spot checks
//   <town>-flags.png      — town map art with per-cell flag classes tinted
//   <town>-fg.png         — town map art with current FG-layer membership tinted
//
// Run with tsx (imports the converter's PNG codec):
//   node --import tsx scripts/surface-flag-census.mjs [--towns onett,twoson] [--no-fg] [--out dir]
import fs from "node:fs";
import path from "node:path";
import { decodePngRgba, encodePngRgba } from "../packages/eb-converter/src/png.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT_DIR = path.resolve(ROOT, argValue("--out", "tmp/collision"));
const TOWNS_FILTER = argValue("--towns", "").split(",").filter(Boolean);
const DECODE_FG = !args.includes("--no-fg");
const SAMPLES_PER_CLASS = Number(argValue("--samples", "6"));

const world = JSON.parse(fs.readFileSync(path.join(GENERATED, "world.json"), "utf8"));
const { cellSize: CS, width: W, height: H, solidRows, surfaceRows } = world.collision;
const { cols: SECTOR_COLS, rows: SECTOR_ROWS, sectorWidthTiles, sectorHeightTiles, tileSize } = world.sectors;
const CELLS_PER_SECTOR_X = (sectorWidthTiles * tileSize) / CS; // 8*32/8 = 32
const CELLS_PER_SECTOR_Y = (sectorHeightTiles * tileSize) / CS; // 4*32/8 = 16

// ---- per-sector town attribution from map_sectors.yml (index order == runtime) ----
const sectorTown = new Array(SECTOR_COLS * SECTOR_ROWS).fill("none");
const sectorIndoor = new Array(SECTOR_COLS * SECTOR_ROWS).fill(false);
{
  const lines = fs.readFileSync(path.join(ROOT, "external/coilsnake-full/map_sectors.yml"), "utf8").split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    let m = line.match(/^(\d+):\s*$/);
    if (m) { cur = Number(m[1]); continue; }
    m = line.match(/^\s+Town Map:\s*(\S+)/);
    if (m && cur != null) sectorTown[cur] = m[1];
    m = line.match(/^\s+Setting:\s*(.+?)\s*$/);
    if (m && cur != null) sectorIndoor[cur] = m[1] === "indoors";
  }
}
const townOfCell = (cx, cy) => {
  const sc = Math.floor(cx / CELLS_PER_SECTOR_X);
  const sr = Math.floor(cy / CELLS_PER_SECTOR_Y);
  return sectorTown[sr * SECTOR_COLS + sc] ?? "none";
};

// ---- flag classes, per docs/collision-semantics.md (CoilSnake wiki + Data Crystal):
// 0x80 solid | 0x10 ladder/stairs | 0x08 water (0x04 with it = deep) |
// 0x04 without water = sunstroke | 0x02 upper body behind FG | 0x01 lower body behind FG
const CLASSES = [
  { key: "solid", test: (b) => (b & 0x80) !== 0, rgba: [220, 40, 40, 120] },
  { key: "fgUpper", test: (b) => (b & 0x02) !== 0 && (b & 0x80) === 0, rgba: [200, 60, 220, 150] },
  { key: "fgLowerOnly", test: (b) => (b & 0x03) === 0x01 && (b & 0x80) === 0, rgba: [240, 220, 40, 150] },
  { key: "water", test: (b) => (b & 0x08) !== 0, rgba: [60, 140, 255, 150] },
  { key: "ladder", test: (b) => (b & 0x10) !== 0, rgba: [20, 220, 220, 200] },
  { key: "sunstroke", test: (b) => (b & 0x0c) === 0x04 && (b & 0x80) === 0, rgba: [255, 140, 30, 110] }
];

const surfaceAt = (cx, cy) => {
  const enc = surfaceRows[cy]?.slice(cx * 2, cx * 2 + 2);
  return enc && enc.length === 2 ? Number.parseInt(enc, 16) : 0;
};
const solidAt = (cx, cy) => solidRows[cy]?.[cx] === "1";

// ---- histograms ----
const emptyHist = () => ({ bytes: {}, bits: new Array(8).fill(0), cells: 0, solidCells: 0 });
const global_ = emptyHist();
const byTown = new Map();
for (let cy = 0; cy < H; cy += 1) {
  for (let cx = 0; cx < W; cx += 1) {
    const b = surfaceAt(cx, cy);
    const town = townOfCell(cx, cy);
    if (!byTown.has(town)) byTown.set(town, emptyHist());
    for (const h of [global_, byTown.get(town)]) {
      h.cells += 1;
      if (solidAt(cx, cy)) h.solidCells += 1;
      const hex = b.toString(16).padStart(2, "0");
      h.bytes[hex] = (h.bytes[hex] ?? 0) + 1;
      for (let k = 0; k < 8; k += 1) if (b & (1 << k)) h.bits[k] += 1;
    }
  }
}

// ---- current FG membership from built foreground chunk PNGs ----
const CHUNK_PX = world.chunkSizeTiles * tileSize; // 512
const fgCells = DECODE_FG ? new Uint8Array(W * H) : null;
let fgCellCount = 0;
if (DECODE_FG) {
  for (const chunk of world.chunks) {
    if (!chunk.foreground) continue;
    const file = path.join(GENERATED, chunk.foreground);
    if (!fs.existsSync(file)) continue;
    const png = decodePngRgba(fs.readFileSync(file), chunk.foreground);
    const baseCx = (chunk.cx * CHUNK_PX) / CS;
    const baseCy = (chunk.cy * CHUNK_PX) / CS;
    const cellsAcross = png.width / CS;
    const cellsDown = png.height / CS;
    for (let ly = 0; ly < cellsDown; ly += 1) {
      for (let lx = 0; lx < cellsAcross; lx += 1) {
        let opaque = false;
        for (let py = ly * CS; py < ly * CS + CS && !opaque; py += 1) {
          for (let px = lx * CS; px < lx * CS + CS && !opaque; px += 1) {
            if (png.rgba[(py * png.width + px) * 4 + 3] > 0) opaque = true;
          }
        }
        if (opaque) {
          const gx = baseCx + lx;
          const gy = baseCy + ly;
          if (gx < W && gy < H && !fgCells[gy * W + gx]) {
            fgCells[gy * W + gx] = 1;
            fgCellCount += 1;
          }
        }
      }
    }
  }
}

const computeTownBoxes = () => {
  const seen = new Uint8Array(SECTOR_COLS * SECTOR_ROWS);
  const clusters = new Map(); // town -> [{count, box}]
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
        box.sc0 = Math.min(box.sc0, x); box.sc1 = Math.max(box.sc1, x);
        box.sr0 = Math.min(box.sr0, y); box.sr1 = Math.max(box.sr1, y);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          if (nx < 0 || ny < 0 || nx >= SECTOR_COLS || ny >= SECTOR_ROWS) continue;
          const ni = ny * SECTOR_COLS + nx;
          if (!seen[ni] && sectorTown[ni] === town) { seen[ni] = 1; stack.push([nx, ny]); }
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
};
// Largest connected sector cluster per town (EB tags a few stray far-away sectors
// with a town's map, which would balloon a plain bbox). Needed before the census
// pass so per-town samples stay inside the real town.
const townBoxes = computeTownBoxes();

// ---- probe samples: N spaced coordinates per town+class, constrained to the town's
// main cluster box so native-probe spawns land in the actual town ----
const samples = new Map(); // `${town}:${classKey}` -> [{x,y,byte}]
for (let cy = 0; cy < H; cy += 1) {
  for (let cx = 0; cx < W; cx += 1) {
    const b = surfaceAt(cx, cy);
    const town = townOfCell(cx, cy);
    const box = townBoxes.get(town);
    if (box && (cx < box.cx0 || cx > box.cx1 || cy < box.cy0 || cy > box.cy1)) continue;
    for (const cls of CLASSES) {
      if (!cls.test(b)) continue;
      const key = `${town}:${cls.key}`;
      const list = samples.get(key) ?? [];
      if (list.length < SAMPLES_PER_CLASS && !list.some((s) => Math.abs(s.x / CS - cx) + Math.abs(s.y / CS - cy) < 48)) {
        list.push({ x: cx * CS + CS / 2, y: cy * CS + CS / 2, byte: "0x" + b.toString(16).padStart(2, "0") });
        samples.set(key, list);
      }
    }
  }
}

// ---- overlays: map art + tint ----
const blend = (rgba, i, [r, g, b, a]) => {
  const k = a / 255;
  rgba[i] = Math.round(rgba[i] * (1 - k) + r * k);
  rgba[i + 1] = Math.round(rgba[i + 1] * (1 - k) + g * k);
  rgba[i + 2] = Math.round(rgba[i + 2] * (1 - k) + b * k);
  rgba[i + 3] = 255;
};

function renderTownOverlay(town, box, mode) {
  const wPx = (box.cx1 - box.cx0 + 1) * CS;
  const hPx = (box.cy1 - box.cy0 + 1) * CS;
  const originX = box.cx0 * CS;
  const originY = box.cy0 * CS;
  const rgba = new Uint8Array(wPx * hPx * 4);
  // background art
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
  // tint cells
  for (let cy = box.cy0; cy <= box.cy1; cy += 1) {
    for (let cx = box.cx0; cx <= box.cx1; cx += 1) {
      let tint;
      if (mode === "flags") {
        const b = surfaceAt(cx, cy);
        for (const cls of CLASSES) if (cls.test(b)) { tint = cls.rgba; break; }
      } else if (fgCells?.[cy * W + cx]) {
        tint = [40, 220, 90, 140];
      }
      if (!tint) continue;
      for (let py = 0; py < CS; py += 1) {
        for (let px = 0; px < CS; px += 1) {
          blend(rgba, (((cy - box.cy0) * CS + py) * wPx + (cx - box.cx0) * CS + px) * 4, tint);
        }
      }
    }
  }
  return encodePngRgba(wPx, hPx, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const townsToRender = TOWNS_FILTER.length > 0 ? TOWNS_FILTER : [...townBoxes.keys()];
for (const town of townsToRender) {
  const box = townBoxes.get(town);
  if (!box) { console.warn(`no sectors tagged for town "${town}"`); continue; }
  fs.writeFileSync(path.join(OUT_DIR, `${town}-flags.png`), renderTownOverlay(town, box, "flags"));
  if (DECODE_FG) fs.writeFileSync(path.join(OUT_DIR, `${town}-fg.png`), renderTownOverlay(town, box, "fg"));
  console.log(`overlay: ${town} cells [${box.cx0},${box.cy0}]-[${box.cx1},${box.cy1}]`);
}

const censusJson = {
  schema: "swagbound.surface-flag-census.v1",
  grid: { cellSize: CS, width: W, height: H },
  fgMembershipCells: DECODE_FG ? fgCellCount : null,
  global: global_,
  towns: Object.fromEntries(
    [...byTown.entries()].map(([town, h]) => [town, { ...h, bytes: Object.fromEntries(Object.entries(h.bytes).sort((a, b) => b[1] - a[1])) }])
  ),
  townBoxesWorldPx: Object.fromEntries(
    [...townBoxes.entries()].map(([t, b]) => [t, { x: b.cx0 * CS, y: b.cy0 * CS, w: (b.cx1 - b.cx0 + 1) * CS, h: (b.cy1 - b.cy0 + 1) * CS }])
  ),
  samples: Object.fromEntries([...samples.entries()].map(([k, list]) => [k, [...list]]))
};
fs.writeFileSync(path.join(OUT_DIR, "census.json"), JSON.stringify(censusJson, null, 2));

console.log(`cells ${global_.cells}, solid ${global_.solidCells} (${((global_.solidCells / global_.cells) * 100).toFixed(1)}%)`);
console.log("global bit usage:", global_.bits.map((n, k) => `0x${(1 << k).toString(16).padStart(2, "0")}=${n}`).join(" "));
if (DECODE_FG) console.log(`current FG-layer membership: ${fgCellCount} cells`);
console.log("wrote", path.join(OUT_DIR, "census.json"));
