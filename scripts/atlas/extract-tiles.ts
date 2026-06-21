import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FTS_ARRANGEMENT_COUNT,
  FTS_CELLS_PER_ARRANGEMENT,
  decodeArrangementCell,
  drawArrangement,
  isBlankArrangement,
  isForegroundArrangementCell,
  isOccluderTile,
  isSolidSurface,
  parseFts,
  type FtsPalette,
  type FtsTileset
} from "../../packages/eb-converter/src/fts";
import { parseIntKeyedYaml, parseMapTiles, parseYamlInteger } from "../../packages/eb-converter/src/coilsnakeYaml";
import { encodePngRgba } from "../../packages/eb-converter/src/png";
import { DEFAULT_MAP_HEIGHT_TILES, DEFAULT_MAP_WIDTH_TILES, SECTOR_HEIGHT_TILES, SECTOR_WIDTH_TILES, TILE_SIZE } from "../../packages/eb-converter/src/world";

const SCHEMA = "swagbound.atlas.tiles.v1";
const DEFAULT_PROJECT_RELATIVE = "external/coilsnake-full";
const DEFAULT_ATLAS_IMAGE_DIR_RELATIVE = "apps/game/public/atlas/tiles";
const DEFAULT_ATLAS_JSON_RELATIVE = "content/atlas/tiles.json";
const GRID_COLS = 32;

export type TilesetGraphics = {
  sourceFile: string;
  tileset: FtsTileset;
  palettes: Map<number, FtsPalette>;
};

export type ArrangementUsage = {
  usageCount: number;
  foregroundUseCount: number;
  paletteCounts: Map<number, number>;
};

export type UsageByTileset = Map<number, Map<number, ArrangementUsage>>;

export type TileAtlasTile = {
  arrangement: number;
  gx: number;
  gy: number;
  solidCells: number;
  isForeground: boolean;
  paletteId: number;
  usageCount: number;
};

export type TileAtlasTileset = {
  tileset: number;
  atlasImage: string;
  gridCols: number;
  tileCount: number;
  tiles: TileAtlasTile[];
};

export type TileAtlasIndex = {
  schema: typeof SCHEMA;
  tileSize: number;
  generatedFrom: string;
  tilesets: TileAtlasTileset[];
  counts: {
    tilesets: number;
    totalNonBlankTiles: number;
    totalUsedTiles: number;
  };
};

export type ExtractTileAtlasOptions = {
  rootDir?: string;
  projectRelative?: string;
  atlasImageDirRelative?: string;
  atlasJsonRelative?: string;
  gridCols?: number;
};

type SectorTileInfo = {
  tileset: number;
  palette: number;
};

type ArrangementDisplayFlags = {
  solidCells: number;
  hasPriorityCell: boolean;
  hasForegroundCell: boolean;
};

type TalliedMapCell = {
  tileset: number;
  arrangement: number;
  solidCells: number;
  hasPriorityCell: boolean;
};

function firstPalette(graphics: TilesetGraphics): FtsPalette | undefined {
  return [...graphics.palettes.values()].sort((a, b) => a.mapPalette - b.mapPalette)[0];
}

function mapFromList<T>(values: Iterable<T>, keyForValue: (value: T) => number): Map<number, T> {
  const map = new Map<number, T>();
  for (const value of values) {
    map.set(keyForValue(value), value);
  }
  return map;
}

function readSectorTileInfo(entry: Record<string, string> | undefined): SectorTileInfo | undefined {
  if (!entry) {
    return undefined;
  }
  const tileset = parseYamlInteger(entry.Tileset);
  const palette = parseYamlInteger(entry.Palette);
  if (Number.isNaN(tileset) || Number.isNaN(palette)) {
    return undefined;
  }
  return { tileset, palette };
}

export function deriveArrangementCollision(tileset: FtsTileset, arrangementIndex: number): {
  solidCells: number;
  isForeground: boolean;
} {
  const flags = deriveArrangementDisplayFlags(tileset, arrangementIndex);
  return { solidCells: flags.solidCells, isForeground: flags.hasForegroundCell };
}

function deriveArrangementDisplayFlags(tileset: FtsTileset, arrangementIndex: number): ArrangementDisplayFlags {
  const base = arrangementIndex * FTS_CELLS_PER_ARRANGEMENT;
  let solidCells = 0;
  let hasPriorityCell = false;
  let hasForegroundCell = false;
  for (let cellIndex = 0; cellIndex < FTS_CELLS_PER_ARRANGEMENT; cellIndex += 1) {
    const cell = decodeArrangementCell(tileset.arrangements[base + cellIndex]);
    const surfaceByte = tileset.collisions[base + cellIndex];
    if (isSolidSurface(surfaceByte)) {
      solidCells += 1;
    }
    if (cell.priority) {
      hasPriorityCell = true;
    }
    if (isForegroundArrangementCell(cell, surfaceByte)) {
      hasForegroundCell = true;
    }
  }
  return { solidCells, hasPriorityCell, hasForegroundCell };
}

function ensureUsageEntry(usage: UsageByTileset, tileset: number, arrangement: number): ArrangementUsage {
  let tilesetUsage = usage.get(tileset);
  if (!tilesetUsage) {
    tilesetUsage = new Map<number, ArrangementUsage>();
    usage.set(tileset, tilesetUsage);
  }
  let arrangementUsage = tilesetUsage.get(arrangement);
  if (!arrangementUsage) {
    arrangementUsage = { usageCount: 0, foregroundUseCount: 0, paletteCounts: new Map<number, number>() };
    tilesetUsage.set(arrangement, arrangementUsage);
  }
  return arrangementUsage;
}

export function tallyMapUsage(options: {
  mapRows: number[][];
  sectorEntries: Map<number, Record<string, string>>;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
}): {
  usageByTileset: UsageByTileset;
  mapTilesets: number[];
  mapCellCount: number;
  talliedCellCount: number;
} {
  const { mapRows, sectorEntries, graphicsByMapTileset } = options;
  const mapHeightTiles = mapRows.length || DEFAULT_MAP_HEIGHT_TILES;
  const mapWidthTiles = mapRows[0]?.length || DEFAULT_MAP_WIDTH_TILES;
  const sectorsPerRow = Math.max(1, Math.ceil(mapWidthTiles / SECTOR_WIDTH_TILES));
  const usageByTileset: UsageByTileset = new Map();
  const mapTilesets = new Set<number>();
  const talliedCells = new Array<TalliedMapCell | undefined>(mapWidthTiles * mapHeightTiles);
  const flagsCache = new Map<string, ArrangementDisplayFlags>();
  let mapCellCount = 0;
  let talliedCellCount = 0;

  const displayFlagsFor = (tilesetId: number, graphics: TilesetGraphics, arrangement: number): ArrangementDisplayFlags => {
    const key = `${tilesetId}:${arrangement}`;
    const cached = flagsCache.get(key);
    if (cached) {
      return cached;
    }
    const flags = deriveArrangementDisplayFlags(graphics.tileset, arrangement);
    flagsCache.set(key, flags);
    return flags;
  };

  for (let mapY = 0; mapY < mapHeightTiles; mapY += 1) {
    const row = mapRows[mapY];
    if (!row) {
      continue;
    }
    for (let mapX = 0; mapX < mapWidthTiles; mapX += 1) {
      const arrangementIndex = row[mapX];
      if (arrangementIndex === undefined || Number.isNaN(arrangementIndex)) {
        continue;
      }
      mapCellCount += 1;
      const sectorCol = Math.floor(mapX / SECTOR_WIDTH_TILES);
      const sectorRow = Math.floor(mapY / SECTOR_HEIGHT_TILES);
      const sector = readSectorTileInfo(sectorEntries.get(sectorRow * sectorsPerRow + sectorCol));
      if (!sector) {
        continue;
      }
      const graphics = graphicsByMapTileset.get(sector.tileset);
      if (!graphics) {
        continue;
      }
      const fallbackPalette = firstPalette(graphics);
      const palette = graphics.palettes.get(sector.palette) ?? fallbackPalette;
      if (!palette) {
        continue;
      }
      mapTilesets.add(sector.tileset);
      const flags = displayFlagsFor(sector.tileset, graphics, arrangementIndex);
      const entry = ensureUsageEntry(usageByTileset, sector.tileset, arrangementIndex);
      entry.usageCount += 1;
      entry.paletteCounts.set(palette.mapPalette, (entry.paletteCounts.get(palette.mapPalette) ?? 0) + 1);
      talliedCells[mapY * mapWidthTiles + mapX] = {
        tileset: sector.tileset,
        arrangement: arrangementIndex,
        solidCells: flags.solidCells,
        hasPriorityCell: flags.hasPriorityCell
      };
      talliedCellCount += 1;
    }
  }

  for (let mapY = 0; mapY < mapHeightTiles; mapY += 1) {
    for (let mapX = 0; mapX < mapWidthTiles; mapX += 1) {
      const cell = talliedCells[mapY * mapWidthTiles + mapX];
      if (!cell) {
        continue;
      }
      const belowSolidCells = talliedCells[(mapY + 1) * mapWidthTiles + mapX]?.solidCells ?? 0;
      if (!cell.hasPriorityCell && !isOccluderTile(cell.solidCells, belowSolidCells)) {
        continue;
      }
      const usage = usageByTileset.get(cell.tileset)?.get(cell.arrangement);
      if (usage) {
        usage.foregroundUseCount += 1;
      }
    }
  }

  return {
    usageByTileset,
    mapTilesets: [...mapTilesets].sort((a, b) => a - b),
    mapCellCount,
    talliedCellCount
  };
}

function mostCommonPaletteId(usage: ArrangementUsage | undefined, fallbackPaletteId: number): number {
  if (!usage || usage.paletteCounts.size === 0) {
    return fallbackPaletteId;
  }
  return [...usage.paletteCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? fallbackPaletteId;
}

export async function loadTilesetGraphics(tilesetDir: string): Promise<Map<number, TilesetGraphics>> {
  const graphicsByMapTileset = new Map<number, TilesetGraphics>();
  const ftsFiles = (await readdir(tilesetDir)).filter((file) => file.toLowerCase().endsWith(".fts")).sort();

  for (const file of ftsFiles) {
    const parsed = parseFts(await readFile(path.join(tilesetDir, file), "utf8"));
    const palettesByMapTileset = new Map<number, FtsPalette[]>();
    for (const palette of parsed.palettes) {
      const list = palettesByMapTileset.get(palette.mapTileset) ?? [];
      list.push(palette);
      palettesByMapTileset.set(palette.mapTileset, list);
    }

    for (const [mapTileset, palettes] of palettesByMapTileset) {
      const existing = graphicsByMapTileset.get(mapTileset);
      const paletteMap = mapFromList(palettes, (palette) => palette.mapPalette);
      if (existing) {
        for (const [paletteId, palette] of paletteMap) {
          existing.palettes.set(paletteId, palette);
        }
      } else {
        graphicsByMapTileset.set(mapTileset, {
          sourceFile: file,
          tileset: parsed,
          palettes: paletteMap
        });
      }
    }
  }

  return new Map([...graphicsByMapTileset.entries()].sort((a, b) => a[0] - b[0]));
}

async function cleanPreviousAtlasSheets(outDir: string): Promise<void> {
  if (!existsSync(outDir)) {
    return;
  }
  const entries = await readdir(outDir);
  await Promise.all(
    entries
      .filter((entry) => /^tileset-\d+\.png$/.test(entry))
      .map((entry) => unlink(path.join(outDir, entry)))
  );
}

function drawAtlasSheet(options: {
  graphics: TilesetGraphics;
  mapTileset: number;
  usageByArrangement: Map<number, ArrangementUsage> | undefined;
  gridCols: number;
}): TileAtlasTileset & { image: Uint8Array; width: number; height: number } {
  const { graphics, mapTileset, usageByArrangement, gridCols } = options;
  const fallbackPalette = firstPalette(graphics);
  if (!fallbackPalette) {
    throw new Error(`atlas: map tileset ${mapTileset} has no palettes`);
  }

  const nonBlankArrangements: number[] = [];
  for (let arrangement = 0; arrangement < FTS_ARRANGEMENT_COUNT; arrangement += 1) {
    if (!isBlankArrangement(graphics.tileset, arrangement)) {
      nonBlankArrangements.push(arrangement);
    }
  }

  const rows = Math.max(1, Math.ceil(nonBlankArrangements.length / gridCols));
  const width = gridCols * TILE_SIZE;
  const height = rows * TILE_SIZE;
  const image = new Uint8Array(width * height * 4);
  const tiles: TileAtlasTile[] = [];

  for (let tileIndex = 0; tileIndex < nonBlankArrangements.length; tileIndex += 1) {
    const arrangement = nonBlankArrangements[tileIndex];
    const gx = tileIndex % gridCols;
    const gy = Math.floor(tileIndex / gridCols);
    const usage = usageByArrangement?.get(arrangement);
    const paletteId = mostCommonPaletteId(usage, fallbackPalette.mapPalette);
    const palette = graphics.palettes.get(paletteId) ?? fallbackPalette;
    const collision = deriveArrangementCollision(graphics.tileset, arrangement);
    drawArrangement({
      tileset: graphics.tileset,
      arrangementIndex: arrangement,
      palette,
      target: image,
      targetWidth: width,
      targetX: gx * TILE_SIZE,
      targetY: gy * TILE_SIZE,
      priorityOnly: false
    });
    tiles.push({
      arrangement,
      gx,
      gy,
      solidCells: collision.solidCells,
      isForeground: usage ? usage.foregroundUseCount > 0 : collision.isForeground,
      paletteId: palette.mapPalette,
      usageCount: usage?.usageCount ?? 0
    });
  }

  return {
    tileset: mapTileset,
    atlasImage: `atlas/tiles/tileset-${String(mapTileset).padStart(2, "0")}.png`,
    gridCols,
    tileCount: tiles.length,
    tiles,
    image,
    width,
    height
  };
}

export async function extractTileAtlas(options: ExtractTileAtlasOptions = {}): Promise<TileAtlasIndex> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const projectRelative = options.projectRelative ?? DEFAULT_PROJECT_RELATIVE;
  const atlasImageDirRelative = options.atlasImageDirRelative ?? DEFAULT_ATLAS_IMAGE_DIR_RELATIVE;
  const atlasJsonRelative = options.atlasJsonRelative ?? DEFAULT_ATLAS_JSON_RELATIVE;
  const gridCols = options.gridCols ?? GRID_COLS;
  const projectAbs = path.join(rootDir, projectRelative);
  const tilesetDir = path.join(projectAbs, "Tilesets");
  const mapTilesPath = path.join(projectAbs, "map_tiles.map");
  const mapSectorsPath = path.join(projectAbs, "map_sectors.yml");
  const outImageDir = path.join(rootDir, atlasImageDirRelative);
  const outJsonPath = path.join(rootDir, atlasJsonRelative);

  const [graphicsByMapTileset, mapRows, sectorEntries] = await Promise.all([
    loadTilesetGraphics(tilesetDir),
    readFile(mapTilesPath, "utf8").then(parseMapTiles),
    readFile(mapSectorsPath, "utf8").then(parseIntKeyedYaml)
  ]);
  const usage = tallyMapUsage({ mapRows, sectorEntries, graphicsByMapTileset });
  if (usage.mapCellCount !== usage.talliedCellCount) {
    throw new Error(`atlas: tallied ${usage.talliedCellCount} of ${usage.mapCellCount} map cells`);
  }

  await mkdir(outImageDir, { recursive: true });
  await mkdir(path.dirname(outJsonPath), { recursive: true });
  await cleanPreviousAtlasSheets(outImageDir);

  const tilesets: TileAtlasTileset[] = [];
  let totalNonBlankTiles = 0;
  let totalUsedTiles = 0;
  for (const mapTileset of usage.mapTilesets) {
    const graphics = graphicsByMapTileset.get(mapTileset);
    if (!graphics) {
      throw new Error(`atlas: missing graphics for map tileset ${mapTileset}`);
    }
    const atlas = drawAtlasSheet({
      graphics,
      mapTileset,
      usageByArrangement: usage.usageByTileset.get(mapTileset),
      gridCols
    });
    const { image, width, height, ...tilesetIndex } = atlas;
    await writeFile(path.join(outImageDir, `tileset-${String(mapTileset).padStart(2, "0")}.png`), encodePngRgba(width, height, image));
    tilesets.push(tilesetIndex);
    totalNonBlankTiles += tilesetIndex.tileCount;
    totalUsedTiles += tilesetIndex.tiles.filter((tile) => tile.usageCount > 0).length;
  }

  const index: TileAtlasIndex = {
    schema: SCHEMA,
    tileSize: TILE_SIZE,
    generatedFrom: `${projectRelative}/Tilesets`,
    tilesets,
    counts: {
      tilesets: tilesets.length,
      totalNonBlankTiles,
      totalUsedTiles
    }
  };
  await writeFile(outJsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

async function main(): Promise<void> {
  const index = await extractTileAtlas();
  const top = index.tilesets
    .flatMap((tileset) => tileset.tiles.map((tile) => ({ tileset: tileset.tileset, arrangement: tile.arrangement, count: tile.usageCount })))
    .sort((a, b) => b.count - a.count || a.tileset - b.tileset || a.arrangement - b.arrangement)
    .slice(0, 10)
    .map((tile) => `${tile.tileset}:${tile.arrangement}:${tile.count}`)
    .join(", ");
  console.log(`atlas: wrote ${index.counts.tilesets} tilesets, ${index.counts.totalNonBlankTiles} non-blank tiles, ${index.counts.totalUsedTiles} used tiles`);
  console.log(`atlas: top used ${top}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
