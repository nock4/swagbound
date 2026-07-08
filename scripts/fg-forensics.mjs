import fs from "node:fs";
import path from "node:path";
import {
  COLLISION_CELL_SIZE,
  FULL_CHUNK_SIZE_TILES,
  SECTOR_HEIGHT_TILES,
  SECTOR_WIDTH_TILES,
  TILE_SIZE,
  composeRegion,
  foregroundReasonName
} from "../packages/eb-converter/src/world.ts";
import { parseFts } from "../packages/eb-converter/src/fts.ts";
import { parseIntKeyedYaml, parseMapTiles, parseYamlInteger } from "../packages/eb-converter/src/coilsnakeYaml.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROJECT = path.join(ROOT, "external/coilsnake-full");
const OVERRIDES = path.join(ROOT, "content/fg-overrides.json");
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const match = args.find((arg) => arg.startsWith(`${name}=`));
  if (match) {
    return match.slice(name.length + 1);
  }
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const PREDICATE = argValue("--fg-predicate", "v1");
if (PREDICATE !== "v1" && PREDICATE !== "v2") {
  throw new Error(`Unsupported --fg-predicate ${PREDICATE}`);
}

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

function rectCellBounds(rect) {
  return {
    x0: Math.floor(rect.x / COLLISION_CELL_SIZE),
    y0: Math.floor(rect.y / COLLISION_CELL_SIZE),
    x1: Math.ceil((rect.x + rect.w) / COLLISION_CELL_SIZE),
    y1: Math.ceil((rect.y + rect.h) / COLLISION_CELL_SIZE)
  };
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 0x100000000;
  };
}

const mapRows = parseMapTiles(readText("map_tiles.map"));
const mapHeightTiles = mapRows.length;
const mapWidthTiles = mapRows[0]?.length ?? 0;
const sectorsPerRow = Math.max(1, Math.ceil(mapWidthTiles / SECTOR_WIDTH_TILES));
const sectorEntries = parseIntKeyedYaml(readText("map_sectors.yml"));
const sectorLookup = (sectorCol, sectorRow) => sectorInfoFromEntry(sectorEntries.get(sectorRow * sectorsPerRow + sectorCol));

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
const tilesetForMapTileset = (mapTileset) => tilesetByMapTileset.get(mapTileset);

const overrides = JSON.parse(fs.readFileSync(OVERRIDES, "utf8"));
const rects = overrides.clears.map((rect, index) => ({ id: index + 1, ...rect, cells: rectCellBounds(rect), promoted: [] }));
const histogram = { priority: 0, occluder: 0, wholebody02: 0 };
const edgeSamples = [];
const chunkColumns = Math.ceil(mapWidthTiles / FULL_CHUNK_SIZE_TILES);
const chunkRows = Math.ceil(mapHeightTiles / FULL_CHUNK_SIZE_TILES);

for (let cy = 0; cy < chunkRows; cy += 1) {
  for (let cx = 0; cx < chunkColumns; cx += 1) {
    const bounds = {
      originTileX: cx * FULL_CHUNK_SIZE_TILES,
      originTileY: cy * FULL_CHUNK_SIZE_TILES,
      widthTiles: Math.min(FULL_CHUNK_SIZE_TILES, mapWidthTiles - cx * FULL_CHUNK_SIZE_TILES),
      heightTiles: Math.min(FULL_CHUNK_SIZE_TILES, mapHeightTiles - cy * FULL_CHUNK_SIZE_TILES)
    };
    const debug = composeRegion({
      bounds,
      mapRows,
      sectorLookup,
      tilesetForMapTileset,
      fgPredicate: PREDICATE,
      foregroundDebug: true
    }).foregroundDebug;
    if (!debug) {
      throw new Error(`No foreground debug map for chunk ${cx},${cy}`);
    }
    for (let y = 0; y < debug.heightCells; y += 1) {
      for (let x = 0; x < debug.widthCells; x += 1) {
        const index = y * debug.widthCells + x;
        const reason = foregroundReasonName(debug.reasons[index]);
        if (reason === "none") {
          continue;
        }
        histogram[reason] += 1;
        const worldCellX = debug.originCellX + x;
        const worldCellY = debug.originCellY + y;
        const southWalkable = debug.southWalkable[index] === 1;
        if (southWalkable) {
          edgeSamples.push({ worldCellX, worldCellY, worldPxX: worldCellX * COLLISION_CELL_SIZE, worldPxY: worldCellY * COLLISION_CELL_SIZE, reason, southWalkable });
        }
        for (const rect of rects) {
          if (worldCellX >= rect.cells.x0 && worldCellX < rect.cells.x1 && worldCellY >= rect.cells.y0 && worldCellY < rect.cells.y1) {
            rect.promoted.push({ worldCellX, worldCellY, worldPxX: worldCellX * COLLISION_CELL_SIZE, worldPxY: worldCellY * COLLISION_CELL_SIZE, reason, southWalkable });
          }
        }
      }
    }
  }
}

const rng = makeRng(0xf9f7);
const shuffled = [...edgeSamples];
for (let index = shuffled.length - 1; index > 0; index -= 1) {
  const swap = Math.floor(rng() * (index + 1));
  [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
}

const report = {
  project: path.relative(ROOT, PROJECT),
  predicate: PREDICATE,
  histogram,
  rects: rects.map(({ id, x, y, w, h, note, promoted }) => ({
    id,
    rect: { x, y, w, h },
    note,
    promotedCount: promoted.length,
    reasonHistogram: promoted.reduce((acc, cell) => {
      acc[cell.reason] = (acc[cell.reason] ?? 0) + 1;
      return acc;
    }, {}),
    promoted
  })),
  sampledPromotedEdgeCells: shuffled.slice(0, 10)
};

console.log(JSON.stringify(report, null, 2));
