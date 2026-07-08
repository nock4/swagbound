import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  COLLISION_CELL_SIZE,
  FULL_CHUNK_SIZE_TILES,
  SECTOR_HEIGHT_TILES,
  SECTOR_WIDTH_TILES,
  TILE_SIZE,
  composeRegion
} from "../packages/eb-converter/src/world.ts";
import { parseFts } from "../packages/eb-converter/src/fts.ts";
import { parseIntKeyedYaml, parseMapTiles, parseYamlInteger } from "../packages/eb-converter/src/coilsnakeYaml.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT = path.join(ROOT, "external/coilsnake-full");
const WORLD_JSON = path.join(ROOT, "apps/game/public/generated/world.json");
const OUT_DIR = path.join(ROOT, "tmp/fg-v2");
const OUT_FILE = path.join(OUT_DIR, "regression-surface.json");

const REGION_SIZE_PX = 512;
const HEAD_WINDOW_W = 26;
const HEAD_WINDOW_H = 24;
const HEAD_WINDOW_BOTTOM_ABOVE_CELL_TOP = 16;
const SAMPLE_STRIDE = 4;
const V1_FLAG_THRESHOLD = 0.15;
const V2_FLAG_THRESHOLD = 0.05;

function readText(relative) {
  return fs.readFileSync(path.join(PROJECT, relative), "utf8");
}

function sectorField(entry, name, numeric = false) {
  const raw = entry?.[name]?.trim() ?? "";
  if (!numeric || raw.length === 0) {
    return raw;
  }
  const parsed = parseYamlInteger(raw);
  return Number.isNaN(parsed) ? raw : String(parsed);
}

function sectorInfoFromEntry(entry) {
  if (!entry) {
    return undefined;
  }
  const tileset = parseYamlInteger(entry.Tileset);
  const palette = parseYamlInteger(entry.Palette);
  if (Number.isNaN(tileset) || Number.isNaN(palette)) {
    return undefined;
  }
  const setting = sectorField(entry, "Setting");
  return {
    tileset,
    palette,
    music: sectorField(entry, "Music", true),
    setting,
    townMap: sectorField(entry, "Town Map"),
    item: sectorField(entry, "Item", true),
    areaId: 0,
    indoor: setting === "indoors",
    bounded: setting !== "none"
  };
}

function loadTilesets() {
  const tilesetByMapTileset = new Map();
  for (const file of fs.readdirSync(path.join(PROJECT, "Tilesets")).filter((item) => item.toLowerCase().endsWith(".fts")).sort()) {
    const parsed = parseFts(readText(path.join("Tilesets", file)));
    for (const palette of parsed.palettes) {
      const existing = tilesetByMapTileset.get(palette.mapTileset);
      if (existing) {
        existing.palettes.set(palette.mapPalette, palette);
      } else {
        tilesetByMapTileset.set(palette.mapTileset, {
          tileset: parsed,
          palettes: new Map([[palette.mapPalette, palette]])
        });
      }
    }
  }
  return tilesetByMapTileset;
}

function copyForegroundAlphaToMask(region, mask, worldWidthPx, originPxX, originPxY) {
  const { foreground, widthPixels, heightPixels } = region;
  for (let y = 0; y < heightPixels; y += 1) {
    let source = y * widthPixels * 4 + 3;
    let target = (originPxY + y) * worldWidthPx + originPxX;
    for (let x = 0; x < widthPixels; x += 1) {
      mask[target + x] = foreground[source] > 0 ? 1 : 0;
      source += 4;
    }
  }
}

function buildForegroundMasks({ mapRows, mapWidthTiles, mapHeightTiles, sectorLookup, tilesetForMapTileset }) {
  const worldWidthPx = mapWidthTiles * TILE_SIZE;
  const worldHeightPx = mapHeightTiles * TILE_SIZE;
  const v1 = new Uint8Array(worldWidthPx * worldHeightPx);
  const v2 = new Uint8Array(worldWidthPx * worldHeightPx);
  const chunkColumns = Math.ceil(mapWidthTiles / FULL_CHUNK_SIZE_TILES);
  const chunkRows = Math.ceil(mapHeightTiles / FULL_CHUNK_SIZE_TILES);
  let chunks = 0;

  for (let cy = 0; cy < chunkRows; cy += 1) {
    for (let cx = 0; cx < chunkColumns; cx += 1) {
      const bounds = {
        originTileX: cx * FULL_CHUNK_SIZE_TILES,
        originTileY: cy * FULL_CHUNK_SIZE_TILES,
        widthTiles: Math.min(FULL_CHUNK_SIZE_TILES, mapWidthTiles - cx * FULL_CHUNK_SIZE_TILES),
        heightTiles: Math.min(FULL_CHUNK_SIZE_TILES, mapHeightTiles - cy * FULL_CHUNK_SIZE_TILES)
      };
      const originPxX = bounds.originTileX * TILE_SIZE;
      const originPxY = bounds.originTileY * TILE_SIZE;
      for (const predicate of ["v1", "v2"]) {
        const composed = composeRegion({
          bounds,
          mapRows,
          sectorLookup,
          tilesetForMapTileset,
          fgPredicate: predicate
        });
        copyForegroundAlphaToMask(composed, predicate === "v1" ? v1 : v2, worldWidthPx, originPxX, originPxY);
      }
      chunks += 1;
      if (chunks % 40 === 0) {
        console.error(`Composed ${chunks}/${chunkColumns * chunkRows} chunks`);
      }
    }
  }

  return { v1, v2, worldWidthPx, worldHeightPx, chunkColumns, chunkRows };
}

function sampledCoverage(mask, worldWidthPx, worldHeightPx, x0, y0) {
  let covered = 0;
  let samples = 0;
  for (let y = 0; y < HEAD_WINDOW_H; y += SAMPLE_STRIDE) {
    const worldY = y0 + y;
    for (let x = 0; x < HEAD_WINDOW_W; x += SAMPLE_STRIDE) {
      samples += 1;
      const worldX = x0 + x;
      if (worldX < 0 || worldY < 0 || worldX >= worldWidthPx || worldY >= worldHeightPx) {
        continue;
      }
      covered += mask[worldY * worldWidthPx + worldX];
    }
  }
  return samples === 0 ? 0 : covered / samples;
}

function lowestOpaqueRowNearCell(mask, worldWidthPx, worldHeightPx, x0, y0, cellTopPx) {
  const startY = Math.max(0, y0);
  const endY = Math.min(worldHeightPx - 1, cellTopPx);
  const startX = Math.max(0, x0);
  const endX = Math.min(worldWidthPx - 1, x0 + HEAD_WINDOW_W - 1);
  let lowest = -1;
  for (let y = startY; y <= endY; y += 1) {
    const row = y * worldWidthPx;
    for (let x = startX; x <= endX; x += 1) {
      if (mask[row + x]) {
        lowest = y;
      }
    }
  }
  return lowest;
}

function incrementRegion(regions, regionX, regionY, classification) {
  const key = `${regionX},${regionY}`;
  let entry = regions.get(key);
  if (!entry) {
    entry = {
      key,
      regionX,
      regionY,
      originPxX: regionX * REGION_SIZE_PX,
      originPxY: regionY * REGION_SIZE_PX,
      count: 0,
      besideProp: 0,
      tallOverhang: 0
    };
    regions.set(key, entry);
  }
  entry.count += 1;
  if (classification === "beside-prop") {
    entry.besideProp += 1;
  } else {
    entry.tallOverhang += 1;
  }
}

function insertTopCell(top, cell) {
  top.push(cell);
  top.sort((a, b) => b.v1Coverage - a.v1Coverage || a.v2Coverage - b.v2Coverage || a.worldPxY - b.worldPxY || a.worldPxX - b.worldPxX);
  if (top.length > 40) {
    top.length = 40;
  }
}

const started = performance.now();
const mapRows = parseMapTiles(readText("map_tiles.map"));
const mapHeightTiles = mapRows.length;
const mapWidthTiles = mapRows[0]?.length ?? 0;
const sectorsPerRow = Math.max(1, Math.ceil(mapWidthTiles / SECTOR_WIDTH_TILES));
const sectorEntries = parseIntKeyedYaml(readText("map_sectors.yml"));
const sectorLookup = (sectorCol, sectorRow) => sectorInfoFromEntry(sectorEntries.get(sectorRow * sectorsPerRow + sectorCol));
const tilesetByMapTileset = loadTilesets();
const tilesetForMapTileset = (mapTileset) => tilesetByMapTileset.get(mapTileset);
const world = JSON.parse(fs.readFileSync(WORLD_JSON, "utf8"));
const collision = world.collision;

if (collision.cellSize !== COLLISION_CELL_SIZE) {
  throw new Error(`Expected collision cell size ${COLLISION_CELL_SIZE}, got ${collision.cellSize}`);
}
if (collision.width !== mapWidthTiles * (TILE_SIZE / COLLISION_CELL_SIZE) || collision.height !== mapHeightTiles * (TILE_SIZE / COLLISION_CELL_SIZE)) {
  throw new Error(`Collision dimensions ${collision.width}x${collision.height} do not match map ${mapWidthTiles}x${mapHeightTiles} tiles`);
}

const masksStarted = performance.now();
const masks = buildForegroundMasks({ mapRows, mapWidthTiles, mapHeightTiles, sectorLookup, tilesetForMapTileset });
const masksMs = performance.now() - masksStarted;

let walkableCells = 0;
let flaggedTotal = 0;
let besideProp = 0;
let tallOverhang = 0;
const regions = new Map();
const topFlaggedCells = [];
const scanStarted = performance.now();

for (let cellY = 0; cellY < collision.height; cellY += 1) {
  const row = collision.solidRows[cellY];
  for (let cellX = 0; cellX < collision.width; cellX += 1) {
    if (row[cellX] !== "0") {
      continue;
    }
    walkableCells += 1;
    const cellLeftPx = cellX * COLLISION_CELL_SIZE;
    const cellTopPx = cellY * COLLISION_CELL_SIZE;
    const headX0 = cellLeftPx + COLLISION_CELL_SIZE / 2 - HEAD_WINDOW_W / 2;
    const headY0 = cellTopPx - HEAD_WINDOW_BOTTOM_ABOVE_CELL_TOP - HEAD_WINDOW_H;
    const v1Coverage = sampledCoverage(masks.v1, masks.worldWidthPx, masks.worldHeightPx, headX0, headY0);
    if (v1Coverage < V1_FLAG_THRESHOLD) {
      continue;
    }
    const v2Coverage = sampledCoverage(masks.v2, masks.worldWidthPx, masks.worldHeightPx, headX0, headY0);
    if (v2Coverage > V2_FLAG_THRESHOLD) {
      continue;
    }
    const lowestOpaqueRow = lowestOpaqueRowNearCell(masks.v1, masks.worldWidthPx, masks.worldHeightPx, headX0, headY0, cellTopPx);
    const pixelsAboveCellTop = lowestOpaqueRow < 0 ? null : cellTopPx - lowestOpaqueRow;
    const classification = pixelsAboveCellTop !== null && pixelsAboveCellTop <= 16 ? "beside-prop" : "tall-overhang";
    const regionX = Math.floor(cellLeftPx / REGION_SIZE_PX);
    const regionY = Math.floor(cellTopPx / REGION_SIZE_PX);
    flaggedTotal += 1;
    if (classification === "beside-prop") {
      besideProp += 1;
    } else {
      tallOverhang += 1;
    }
    incrementRegion(regions, regionX, regionY, classification);
    insertTopCell(topFlaggedCells, {
      cellX,
      cellY,
      worldPxX: cellLeftPx,
      worldPxY: cellTopPx,
      headWindow: { x: headX0, y: headY0, w: HEAD_WINDOW_W, h: HEAD_WINDOW_H },
      region: { x: regionX, y: regionY, key: `${regionX},${regionY}` },
      v1Coverage: Number(v1Coverage.toFixed(4)),
      v2Coverage: Number(v2Coverage.toFixed(4)),
      classification,
      lowestOpaqueRow,
      pixelsAboveCellTop
    });
  }
}

const scanMs = performance.now() - scanStarted;
const runtimeMs = performance.now() - started;
const regionsByCount = [...regions.values()].sort((a, b) => b.count - a.count || a.regionY - b.regionY || a.regionX - b.regionX);
const countsByRegion = Object.fromEntries(regionsByCount.map((entry) => [entry.key, entry.count]));

const report = {
  generatedAt: new Date().toISOString(),
  map: {
    worldWidthPx: masks.worldWidthPx,
    worldHeightPx: masks.worldHeightPx,
    collisionWidth: collision.width,
    collisionHeight: collision.height,
    collisionCellSize: collision.cellSize,
    regionSizePx: REGION_SIZE_PX,
    walkabilitySource: "apps/game/public/generated/world.json collision.solidRows non-solid cells"
  },
  predicateComparison: { old: "v1", new: "v2" },
  headWindow: {
    widthPx: HEAD_WINDOW_W,
    heightPx: HEAD_WINDOW_H,
    bottomAboveCellTopPx: HEAD_WINDOW_BOTTOM_ABOVE_CELL_TOP,
    horizontalAnchor: "centered on collision cell center",
    sampleStridePx: SAMPLE_STRIDE
  },
  thresholds: {
    v1CoverageAtLeast: V1_FLAG_THRESHOLD,
    v2CoverageAtMost: V2_FLAG_THRESHOLD
  },
  totals: {
    walkableCells,
    flagged: flaggedTotal,
    besideProp,
    tallOverhang
  },
  countsByRegion,
  regionsByCount,
  topFlaggedCells,
  runtime: {
    chunks: masks.chunkColumns * masks.chunkRows,
    masksMs: Math.round(masksMs),
    scanMs: Math.round(scanMs),
    totalMs: Math.round(runtimeMs)
  }
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

console.log(`FG v2 regression surface: ${flaggedTotal} flagged / ${walkableCells} walkable cells`);
console.log(`Classification: beside-prop ${besideProp}, tall-overhang ${tallOverhang}`);
console.log(`Top clusters: ${regionsByCount.slice(0, 8).map((entry) => `${entry.key}=${entry.count}`).join(", ") || "none"}`);
console.log(`Runtime: ${Math.round(runtimeMs)} ms (masks ${Math.round(masksMs)} ms, scan ${Math.round(scanMs)} ms)`);
console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
