import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FTS_CELLS_PER_ARRANGEMENT,
  decodeArrangementCell,
  drawArrangement,
  isForegroundArrangementCell,
  isSolidSurface,
  type FtsPalette,
  type FtsTileset
} from "../../packages/eb-converter/src/fts";
import {
  doorTriggerToWorldPixel,
  parseIntKeyedYaml,
  parseMapDoors,
  parseMapTiles,
  parseYamlInteger,
  type MapDoorEntry
} from "../../packages/eb-converter/src/coilsnakeYaml";
import { encodePngRgba } from "../../packages/eb-converter/src/png";
import {
  DEFAULT_MAP_HEIGHT_TILES,
  DEFAULT_MAP_WIDTH_TILES,
  SECTOR_HEIGHT_TILES,
  SECTOR_WIDTH_TILES,
  TILE_SIZE,
  buildWorldSectorAreas,
  type WorldSectorAreas
} from "../../packages/eb-converter/src/world";
import {
  deriveArrangementCollision,
  loadTilesetGraphics,
  type TilesetGraphics
} from "./extract-tiles";

const SCHEMA = "swagbound.atlas.motifs.v1";
const DEFAULT_PROJECT_RELATIVE = "external/coilsnake-full";
const DEFAULT_ATLAS_JSON_RELATIVE = "content/atlas/motifs.json";
const DEFAULT_MOTIF_IMAGE_DIR_RELATIVE = "apps/game/public/atlas/motifs";
const MOTIF_IMAGE_PUBLIC_PREFIX = "atlas/motifs";
const BUILDING_DOOR_TYPES = new Set(["door", "stairway", "escalator"]);
const INTERACTABLE_DOOR_TYPES = new Set(["object", "switch", "person"]);
const TERRAIN_DENSITY_TARGET_PCT = 35;
const TERRAIN_DENSITY_RETUNE_TARGET_PCT = 34.5;
const MAX_BUILDING_DIMENSION_TILES = 14;
const MAX_BUILDING_RADIUS_LEFT = 7;
const MAX_BUILDING_RADIUS_RIGHT = 6;
const MAX_BUILDING_RADIUS_UP = 10;
const MAX_BUILDING_RADIUS_DOWN = 3;
const MAX_BUILDING_CELLS = MAX_BUILDING_DIMENSION_TILES * MAX_BUILDING_DIMENSION_TILES;
const MAX_DOORS_PER_BUILDING = 3;
const MAX_MOTIF_COMPONENT_CELLS = 96;
const MAX_MOTIF_DIMENSION_TILES = 16;
const LEGACY_MOTIF_EXCLUSION_RADIUS_X = 14;
const LEGACY_MOTIF_EXCLUSION_RADIUS_UP = 13;
const LEGACY_MOTIF_EXCLUSION_RADIUS_DOWN = 6;
const LEGACY_MOTIF_EXCLUSION_MAX_CELLS = 260;
const DEFAULT_MOTIF_ATLAS_SHAPE = {
  motifs: 79,
  motifInstances: 318,
  buildings: 262,
  rooms: 221,
  interactables: 275
} as const;

export type Point = { x: number; y: number };

type BuildingGrowthWindow = {
  left: number;
  right: number;
  up: number;
  down: number;
};

type SectorTileInfo = {
  tileset: number;
  palette: number;
  area: number;
};

type TileAtlasTile = {
  arrangement: number;
  gx: number;
  gy: number;
  solidCells: number;
  isForeground: boolean;
  paletteId: number;
  usageCount: number;
};

type TileMeta = Pick<TileAtlasTile, "solidCells" | "isForeground" | "paletteId">;

export type MapCell = {
  mapX: number;
  mapY: number;
  key: string;
  tileset: number;
  arrangement: number;
  palette: number;
  area: number;
  sector: number;
  solidCells: number;
  isForeground: boolean;
};

export type TerrainTileStat = {
  key: string;
  coverage: number;
  maxSameTileConnectedComponent: number;
  solidCells: number;
  isForeground: boolean;
  greenishRatio: number;
};

export type TerrainSplit = {
  terrainKeys: Set<string>;
  objectDensityPct: number;
  retunedTileCount: number;
};

export type Component = {
  cells: Point[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type RenderedComponent = {
  rgba: Uint8Array;
  widthPixels: number;
  heightPixels: number;
  widthTiles: number;
  heightTiles: number;
  solidRatio: number;
  foregroundRatio: number;
  greenishRatio: number;
};

type PaletteVariant = {
  tileset: number;
  palette: number;
  count: number;
};

type MotifInstance = {
  component: Component;
  signature: string;
  rendered: RenderedComponent;
  paletteKey: string;
  location: { mapX: number; mapY: number; area: number };
};

type BuildingInstance = {
  component: Component;
  doors: MapDoorEntry[];
  signature: string;
  rendered: RenderedComponent;
  location: { mapX: number; mapY: number; area: number };
};

type RoomInstance = {
  component: Component;
  sector: number;
  area: number;
  doorCount: number;
  rendered: RenderedComponent;
  location: { mapX: number; mapY: number; area: number };
};

type MotifOutput = {
  motifId: string;
  widthTiles: number;
  heightTiles: number;
  instanceCount: number;
  solidRatio: number;
  foregroundRatio: number;
  greenishRatio: number;
  categoryGuessAdvisory: string;
  paletteVariants: PaletteVariant[];
  sampleLocations: Array<{ mapX: number; mapY: number; area: number }>;
  image: string;
};

type BuildingOutput = {
  buildingId: string;
  footprintWxH: string;
  instanceCount: number;
  sampleLocations: Array<{ mapX: number; mapY: number; area: number }>;
  image: string;
  doorCount: number;
};

type RoomOutput = {
  roomId: string;
  sector: number;
  widthTiles: number;
  heightTiles: number;
  area: number;
  sampleLocation: { mapX: number; mapY: number; area: number };
  image: string;
  doorCount: number;
};

export type RoomSectorGroup = {
  sector: number;
  sectorIndexes: number[];
  area: number;
};

type InteractableOutput = {
  anchorType: string;
  worldPixel: Point;
  area: number;
  textPointer: string | null;
  textPreview: string | null;
  image: string;
};

export type MotifAtlas = {
  schema: typeof SCHEMA;
  generatedFrom: string;
  tileSize: number;
  terrain: {
    tileCount: number;
    retunedTileCount: number;
    objectDensityOverall: number;
    byArea: Array<{ area: number; cells: number; objectCells: number; objectDensity: number }>;
  };
  buildings: BuildingOutput[];
  rooms: RoomOutput[];
  interactables: InteractableOutput[];
  motifs: MotifOutput[];
  counts: {
    buildings: number;
    rooms: number;
    interactables: number;
    motifTypes: number;
    motifInstances: number;
    byCategoryAdvisory: Record<string, number>;
    singletonTypePct: number;
    pctBuildingsOver14Tiles: number;
  };
  selfCheck: {
    objectDensitySparse: boolean;
    singletonTypePctLow: boolean;
    pctBuildingsOver14TilesLow: boolean;
    frequentMotifsHaveRepeatedInstances: boolean;
    frequentBuildingsHaveRepeatedInstances: boolean;
  };
  logs: string[];
};

export type ExtractMotifAtlasOptions = {
  rootDir?: string;
  projectRelative?: string;
  atlasJsonRelative?: string;
  motifImageDirRelative?: string;
};

function pct(part: number, total: number): number {
  return total === 0 ? 0 : Number(((part / total) * 100).toFixed(2));
}

function keyFor(tileset: number, arrangement: number): string {
  return `${tileset}:${arrangement}`;
}

function resolvePath(rootDir: string, pathLike: string): string {
  return path.isAbsolute(pathLike) ? pathLike : path.join(rootDir, pathLike);
}

function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

export function sectorIndexForTile(point: Point, sectors: WorldSectorAreas): number | undefined {
  if (point.x < 0 || point.y < 0) {
    return undefined;
  }
  const sectorCol = Math.floor(point.x / sectors.sectorWidthTiles);
  const sectorRow = Math.floor(point.y / sectors.sectorHeightTiles);
  if (sectorCol < 0 || sectorRow < 0 || sectorCol >= sectors.cols || sectorRow >= sectors.rows) {
    return undefined;
  }
  return sectorRow * sectors.cols + sectorCol;
}

export function isIndoorAnchorTile(anchor: Point, sectors: WorldSectorAreas): boolean {
  const sector = sectorIndexForTile(anchor, sectors);
  return sector === undefined || sectors.indoor[sector] === 1;
}

function parseTileAtlas(source: string): Map<string, TileMeta> {
  const parsed = JSON.parse(source) as { tilesets?: Array<{ tileset: number; tiles: TileAtlasTile[] }> };
  const byKey = new Map<string, TileMeta>();
  for (const tileset of parsed.tilesets ?? []) {
    for (const tile of tileset.tiles) {
      byKey.set(keyFor(tileset.tileset, tile.arrangement), {
        solidCells: tile.solidCells,
        isForeground: tile.isForeground,
        paletteId: tile.paletteId
      });
    }
  }
  return byKey;
}

function sectorTileInfoFromEntry(entry: Record<string, string> | undefined, area: number): SectorTileInfo | undefined {
  if (!entry) {
    return undefined;
  }
  const tileset = parseYamlInteger(entry.Tileset);
  const palette = parseYamlInteger(entry.Palette);
  if (Number.isNaN(tileset) || Number.isNaN(palette)) {
    return undefined;
  }
  return { tileset, palette, area };
}

function fallbackPalette(graphics: TilesetGraphics | undefined): FtsPalette | undefined {
  return graphics ? [...graphics.palettes.values()].sort((a, b) => a.mapPalette - b.mapPalette)[0] : undefined;
}

function tileMetaFor(options: {
  tileMetaByKey: Map<string, TileMeta>;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  tileset: number;
  arrangement: number;
  palette: number;
}): TileMeta {
  const { tileMetaByKey, graphicsByMapTileset, tileset, arrangement, palette } = options;
  const fromAtlas = tileMetaByKey.get(keyFor(tileset, arrangement));
  if (fromAtlas) {
    return fromAtlas;
  }
  const graphics = graphicsByMapTileset.get(tileset);
  if (!graphics) {
    return { solidCells: 0, isForeground: false, paletteId: palette };
  }
  const collision = deriveArrangementCollision(graphics.tileset, arrangement);
  return { solidCells: collision.solidCells, isForeground: collision.isForeground, paletteId: palette };
}

function buildMapCells(options: {
  mapRows: number[][];
  sectorEntries: Map<number, Record<string, string>>;
  tileMetaByKey: Map<string, TileMeta>;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
}): {
  cells: MapCell[];
  width: number;
  height: number;
  sectors: WorldSectorAreas;
} {
  const { mapRows, sectorEntries, tileMetaByKey, graphicsByMapTileset } = options;
  const height = mapRows.length || DEFAULT_MAP_HEIGHT_TILES;
  const width = mapRows[0]?.length || DEFAULT_MAP_WIDTH_TILES;
  const sectorsPerRow = Math.max(1, Math.ceil(width / SECTOR_WIDTH_TILES));
  const sectorRows = Math.max(1, Math.ceil(height / SECTOR_HEIGHT_TILES));
  const sectorAreas = buildWorldSectorAreas({ sectorEntries, cols: sectorsPerRow, rows: sectorRows });
  const cells: MapCell[] = new Array(width * height);

  for (let mapY = 0; mapY < height; mapY += 1) {
    for (let mapX = 0; mapX < width; mapX += 1) {
      const arrangement = mapRows[mapY]?.[mapX] ?? 0;
      const sectorCol = Math.floor(mapX / SECTOR_WIDTH_TILES);
      const sectorRow = Math.floor(mapY / SECTOR_HEIGHT_TILES);
      const sectorIndex = sectorRow * sectorsPerRow + sectorCol;
      const sector = sectorTileInfoFromEntry(sectorEntries.get(sectorIndex), sectorAreas.areaIds[sectorIndex] ?? 0);
      const tileset = sector?.tileset ?? 0;
      const palette = sector?.palette ?? 0;
      const meta = tileMetaFor({ tileMetaByKey, graphicsByMapTileset, tileset, arrangement, palette });
      cells[cellIndex(mapX, mapY, width)] = {
        mapX,
        mapY,
        key: keyFor(tileset, arrangement),
        tileset,
        arrangement,
        palette,
        area: sector?.area ?? 0,
        sector: sectorIndex,
        solidCells: meta.solidCells,
        isForeground: meta.isForeground
      };
    }
  }

  return { cells, width, height, sectors: sectorAreas };
}

function connectedSameTileMaxima(cells: MapCell[], width: number, height: number): Map<string, number> {
  const visited = new Uint8Array(width * height);
  const maxima = new Map<string, number>();
  const stack: number[] = [];

  for (let index = 0; index < cells.length; index += 1) {
    if (visited[index]) {
      continue;
    }
    visited[index] = 1;
    const key = cells[index]?.key;
    let size = 0;
    stack.push(index);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || cells[neighbor]?.key !== key) {
          continue;
        }
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
    maxima.set(key, Math.max(maxima.get(key) ?? 0, size));
  }

  return maxima;
}

function renderSingleTileObject(options: {
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  cell: Pick<MapCell, "tileset" | "arrangement" | "palette">;
}): Uint8Array {
  const { graphicsByMapTileset, cell } = options;
  const rgba = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const graphics = graphicsByMapTileset.get(cell.tileset);
  const palette = graphics?.palettes.get(cell.palette) ?? fallbackPalette(graphics);
  if (!graphics || !palette) {
    return rgba;
  }
  drawArrangement({
    tileset: graphics.tileset,
    arrangementIndex: cell.arrangement,
    palette,
    target: rgba,
    targetWidth: TILE_SIZE,
    targetX: 0,
    targetY: 0,
    priorityOnly: true
  });
  if (hasOpaquePixel(rgba)) {
    return rgba;
  }
  drawArrangementTransparentZero({
    tileset: graphics.tileset,
    arrangementIndex: cell.arrangement,
    palette,
    target: rgba,
    targetWidth: TILE_SIZE,
    targetX: 0,
    targetY: 0
  });
  return rgba;
}

function greenishRatioForRgba(rgba: Uint8Array): number {
  let greenish = 0;
  let opaque = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] === 0) {
      continue;
    }
    opaque += 1;
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    if (green > red * 1.08 && green > blue * 1.05 && green > 48) {
      greenish += 1;
    }
  }
  return opaque === 0 ? 0 : greenish / opaque;
}

function estimateTileGreenish(options: {
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  sampleCell: MapCell;
}): number {
  return greenishRatioForRgba(renderSingleTileObject({ graphicsByMapTileset: options.graphicsByMapTileset, cell: options.sampleCell }));
}

function buildTerrainStats(options: {
  cells: MapCell[];
  width: number;
  height: number;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
}): TerrainTileStat[] {
  const { cells, width, height, graphicsByMapTileset } = options;
  const coverage = new Map<string, number>();
  const sampleCellByKey = new Map<string, MapCell>();
  for (const cell of cells) {
    coverage.set(cell.key, (coverage.get(cell.key) ?? 0) + 1);
    if (!sampleCellByKey.has(cell.key)) {
      sampleCellByKey.set(cell.key, cell);
    }
  }
  const maxCc = connectedSameTileMaxima(cells, width, height);
  return [...coverage.entries()].map(([key, count]) => {
    const sampleCell = sampleCellByKey.get(key) as MapCell;
    return {
      key,
      coverage: count,
      maxSameTileConnectedComponent: maxCc.get(key) ?? 0,
      solidCells: sampleCell.solidCells,
      isForeground: sampleCell.isForeground,
      greenishRatio: estimateTileGreenish({ graphicsByMapTileset, sampleCell })
    };
  });
}

function objectCellsForTerrain(stats: TerrainTileStat[], terrainKeys: Set<string>): number {
  let objectCells = 0;
  for (const stat of stats) {
    if (!terrainKeys.has(stat.key)) {
      objectCells += stat.coverage;
    }
  }
  return objectCells;
}

export function splitTerrainTiles(
  stats: TerrainTileStat[],
  totalCells: number,
  options: {
    densityTargetPct?: number;
    retuneTargetPct?: number;
    largeSameTileCc?: number;
    veryHighCoverage?: number;
    highCoverage?: number;
    mediumSameTileCc?: number;
  } = {}
): TerrainSplit {
  const densityTargetPct = options.densityTargetPct ?? TERRAIN_DENSITY_TARGET_PCT;
  const retuneTargetPct = options.retuneTargetPct ?? TERRAIN_DENSITY_RETUNE_TARGET_PCT;
  const largeSameTileCc = options.largeSameTileCc ?? 24;
  const veryHighCoverage = options.veryHighCoverage ?? 240;
  const highCoverage = options.highCoverage ?? 120;
  const mediumSameTileCc = options.mediumSameTileCc ?? 8;
  const terrainKeys = new Set<string>();

  for (const stat of stats) {
    const isWalkableSurface = stat.solidCells <= 0 && !stat.isForeground;
    const isLargeFill = stat.maxSameTileConnectedComponent >= largeSameTileCc;
    const isVeryCommon = stat.coverage >= veryHighCoverage;
    const isRepeatedFill = stat.coverage >= highCoverage && stat.maxSameTileConnectedComponent >= mediumSameTileCc;
    const isCommonNonGreenFill = stat.coverage >= 20 && stat.greenishRatio < 0.2;
    if (isWalkableSurface || isLargeFill || isVeryCommon || isRepeatedFill || isCommonNonGreenFill) {
      terrainKeys.add(stat.key);
    }
  }

  let objectDensityPct = pct(objectCellsForTerrain(stats, terrainKeys), totalCells);
  let retunedTileCount = 0;
  if (objectDensityPct > densityTargetPct) {
    const candidates = stats
      .filter((stat) => !terrainKeys.has(stat.key))
      .sort((a, b) => {
        const aGreenPenalty = a.greenishRatio >= 0.2 ? 300 : 0;
        const bGreenPenalty = b.greenishRatio >= 0.2 ? 300 : 0;
        const aScore = a.coverage + a.maxSameTileConnectedComponent * 8 - aGreenPenalty;
        const bScore = b.coverage + b.maxSameTileConnectedComponent * 8 - bGreenPenalty;
        return bScore - aScore || b.coverage - a.coverage || a.key.localeCompare(b.key);
      });
    for (const candidate of candidates) {
      terrainKeys.add(candidate.key);
      retunedTileCount += 1;
      objectDensityPct = pct(objectCellsForTerrain(stats, terrainKeys), totalCells);
      if (objectDensityPct <= retuneTargetPct) {
        break;
      }
    }
  }

  return { terrainKeys, objectDensityPct, retunedTileCount };
}

function terrainByArea(options: {
  cells: MapCell[];
  terrainKeys: Set<string>;
}): Array<{ area: number; cells: number; objectCells: number; objectDensity: number }> {
  const byArea = new Map<number, { cells: number; objectCells: number }>();
  for (const cell of options.cells) {
    const entry = byArea.get(cell.area) ?? { cells: 0, objectCells: 0 };
    entry.cells += 1;
    if (!options.terrainKeys.has(cell.key)) {
      entry.objectCells += 1;
    }
    byArea.set(cell.area, entry);
  }
  return [...byArea.entries()]
    .map(([area, entry]) => ({
      area,
      cells: entry.cells,
      objectCells: entry.objectCells,
      objectDensity: pct(entry.objectCells, entry.cells)
    }))
    .sort((a, b) => b.objectDensity - a.objectDensity || b.cells - a.cells || a.area - b.area);
}

function componentFromCells(points: Point[]): Component {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { cells: points, minX, minY, maxX, maxY };
}

export function extractObjectComponents(options: {
  width: number;
  height: number;
  isCandidate: (x: number, y: number) => boolean;
  isClaimed?: (x: number, y: number) => boolean;
  claim?: (x: number, y: number) => void;
}): Component[] {
  const { width, height, isCandidate, isClaimed, claim } = options;
  const visited = new Uint8Array(width * height);
  const components: Component[] = [];
  const stack: Point[] = [];
  const dirs = [-1, 0, 1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = cellIndex(x, y, width);
      if (visited[index] || isClaimed?.(x, y) || !isCandidate(x, y)) {
        continue;
      }
      visited[index] = 1;
      const points: Point[] = [];
      stack.push({ x, y });
      while (stack.length > 0) {
        const current = stack.pop() as Point;
        points.push(current);
        for (const dy of dirs) {
          for (const dx of dirs) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const nx = current.x + dx;
            const ny = current.y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              continue;
            }
            const neighborIndex = cellIndex(nx, ny, width);
            if (visited[neighborIndex] || isClaimed?.(nx, ny) || !isCandidate(nx, ny)) {
              continue;
            }
            visited[neighborIndex] = 1;
            stack.push({ x: nx, y: ny });
          }
        }
      }
      for (const point of points) {
        claim?.(point.x, point.y);
      }
      components.push(componentFromCells(points));
    }
  }

  return components;
}

function nearestSolidTile(options: {
  cells: MapCell[];
  width: number;
  height: number;
  origin: Point;
  radius: number;
  isAllowed?: (x: number, y: number) => boolean;
}): Point | undefined {
  const { cells, width, height, origin, radius, isAllowed } = options;
  let best: { point: Point; distance: number } | undefined;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      if (isAllowed && !isAllowed(x, y)) {
        continue;
      }
      const cell = cells[cellIndex(x, y, width)];
      if (!cell || cell.solidCells <= 0) {
        continue;
      }
      const distance = Math.abs(dx) + Math.abs(dy);
      if (!best || distance < best.distance || (distance === best.distance && y < best.point.y)) {
        best = { point: { x, y }, distance };
      }
    }
  }
  return best?.point;
}

export function growSolidFootprint(options: {
  cells: MapCell[];
  width: number;
  height: number;
  anchor: Point;
  sectors: WorldSectorAreas;
  window?: BuildingGrowthWindow;
}): Component | undefined {
  const { cells, width, height, anchor, sectors } = options;
  const window = options.window ?? {
    left: MAX_BUILDING_RADIUS_LEFT,
    right: MAX_BUILDING_RADIUS_RIGHT,
    up: MAX_BUILDING_RADIUS_UP,
    down: MAX_BUILDING_RADIUS_DOWN
  };
  const minX = Math.max(0, anchor.x - window.left);
  const maxX = Math.min(width - 1, anchor.x + window.right);
  const minY = Math.max(0, anchor.y - window.up);
  const maxY = Math.min(height - 1, anchor.y + window.down);
  const isAllowed = (x: number, y: number): boolean => {
    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false;
    }
    const sector = sectorIndexForTile({ x, y }, sectors);
    return sector !== undefined && sectors.indoor[sector] !== 1;
  };
  const seed = nearestSolidTile({ cells, width, height, origin: anchor, radius: 3, isAllowed });
  if (!seed) {
    return undefined;
  }
  const visited = new Set<string>();
  const stack: Point[] = [seed];
  const points: Point[] = [];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  visited.add(`${seed.x},${seed.y}`);

  while (stack.length > 0 && points.length <= MAX_BUILDING_CELLS) {
    const current = stack.pop() as Point;
    if (!isAllowed(current.x, current.y)) {
      continue;
    }
    const cell = cells[cellIndex(current.x, current.y, width)];
    if (!cell || cell.solidCells <= 0) {
      continue;
    }
    points.push(current);
    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      if (!isAllowed(nx, ny)) {
        continue;
      }
      const key = `${nx},${ny}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      stack.push({ x: nx, y: ny });
    }
  }

  return points.length === 0 ? undefined : componentFromCells(points);
}

function growLegacyMotifExclusionFootprint(options: {
  cells: MapCell[];
  width: number;
  height: number;
  anchor: Point;
}): Component | undefined {
  const { cells, width, height, anchor } = options;
  const seed = nearestSolidTile({ cells, width, height, origin: anchor, radius: 3 });
  if (!seed) {
    return undefined;
  }
  const visited = new Set<string>();
  const stack: Point[] = [seed];
  const points: Point[] = [];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  visited.add(`${seed.x},${seed.y}`);

  while (stack.length > 0 && points.length <= LEGACY_MOTIF_EXCLUSION_MAX_CELLS) {
    const current = stack.pop() as Point;
    if (
      Math.abs(current.x - anchor.x) > LEGACY_MOTIF_EXCLUSION_RADIUS_X ||
      current.y < anchor.y - LEGACY_MOTIF_EXCLUSION_RADIUS_UP ||
      current.y > anchor.y + LEGACY_MOTIF_EXCLUSION_RADIUS_DOWN
    ) {
      continue;
    }
    const cell = cells[cellIndex(current.x, current.y, width)];
    if (!cell || cell.solidCells <= 0) {
      continue;
    }
    points.push(current);
    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const key = `${nx},${ny}`;
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      stack.push({ x: nx, y: ny });
    }
  }

  return points.length === 0 ? undefined : componentFromCells(points);
}

function componentsOverlap(a: Component, b: Component): boolean {
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) {
    return false;
  }
  const cells = new Set(a.cells.map((point) => `${point.x},${point.y}`));
  return b.cells.some((point) => cells.has(`${point.x},${point.y}`));
}

function componentOverlapRatio(a: Component, b: Component): number {
  if (!componentsOverlap(a, b)) {
    return 0;
  }
  const aCells = new Set(a.cells.map((point) => `${point.x},${point.y}`));
  let overlap = 0;
  for (const point of b.cells) {
    if (aCells.has(`${point.x},${point.y}`)) {
      overlap += 1;
    }
  }
  const smaller = Math.min(a.cells.length, b.cells.length);
  return smaller === 0 ? 0 : overlap / smaller;
}

function shouldMergeLegacyMotifExclusionFootprints(a: Component, b: Component): boolean {
  const smaller = Math.min(a.cells.length, b.cells.length);
  const unionWidth = Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX) + 1;
  const unionHeight = Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY) + 1;
  return smaller > 0 && componentOverlapRatio(a, b) >= 0.55 && unionWidth <= 34 && unionHeight <= 24;
}

function unionComponents(components: Component[]): Component {
  const pointsByKey = new Map<string, Point>();
  for (const component of components) {
    for (const point of component.cells) {
      pointsByKey.set(`${point.x},${point.y}`, point);
    }
  }
  return componentFromCells([...pointsByKey.values()]);
}

function drawArrangementTransparentZero(options: {
  tileset: FtsTileset;
  arrangementIndex: number;
  palette: FtsPalette;
  target: Uint8Array;
  targetWidth: number;
  targetX: number;
  targetY: number;
}): void {
  const { tileset, arrangementIndex, palette, target, targetWidth, targetX, targetY } = options;
  const base = arrangementIndex * FTS_CELLS_PER_ARRANGEMENT;
  for (let cellY = 0; cellY < 4; cellY += 1) {
    for (let cellX = 0; cellX < 4; cellX += 1) {
      const cell = decodeArrangementCell(tileset.arrangements[base + cellY * 4 + cellX]);
      const minitile = tileset.minitiles[cell.minitile] ?? tileset.minitiles[0];
      for (let py = 0; py < 8; py += 1) {
        const sourceY = cell.vFlip ? 7 - py : py;
        for (let px = 0; px < 8; px += 1) {
          const sourceX = cell.hFlip ? 7 - px : px;
          const pixel = minitile[sourceY * 8 + sourceX];
          if (pixel === 0) {
            continue;
          }
          const colorOffset = (cell.subpalette * 16 + pixel) * 4;
          const outOffset = ((targetY + cellY * 8 + py) * targetWidth + targetX + cellX * 8 + px) * 4;
          target[outOffset] = palette.colors[colorOffset];
          target[outOffset + 1] = palette.colors[colorOffset + 1];
          target[outOffset + 2] = palette.colors[colorOffset + 2];
          target[outOffset + 3] = 255;
        }
      }
    }
  }
}

function drawObjectArrangement(options: {
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  cell: MapCell;
  target: Uint8Array;
  targetWidth: number;
  targetX: number;
  targetY: number;
}): void {
  const { graphicsByMapTileset, cell, target, targetWidth, targetX, targetY } = options;
  const graphics = graphicsByMapTileset.get(cell.tileset);
  const palette = graphics?.palettes.get(cell.palette) ?? fallbackPalette(graphics);
  if (!graphics || !palette) {
    return;
  }
  const tile = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  drawArrangement({
    tileset: graphics.tileset,
    arrangementIndex: cell.arrangement,
    palette,
    target: tile,
    targetWidth: TILE_SIZE,
    targetX: 0,
    targetY: 0,
    priorityOnly: true
  });
  if (!hasOpaquePixel(tile)) {
    drawArrangementTransparentZero({
      tileset: graphics.tileset,
      arrangementIndex: cell.arrangement,
      palette,
      target: tile,
      targetWidth: TILE_SIZE,
      targetX: 0,
      targetY: 0
    });
  }
  blitRgba(tile, TILE_SIZE, TILE_SIZE, target, targetWidth, targetX, targetY);
}

function hasOpaquePixel(rgba: Uint8Array): boolean {
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] !== 0) {
      return true;
    }
  }
  return false;
}

function blitRgba(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint8Array,
  targetWidth: number,
  targetX: number,
  targetY: number
): void {
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceOffset = (y * sourceWidth + x) * 4;
      if (source[sourceOffset + 3] === 0) {
        continue;
      }
      const targetOffset = ((targetY + y) * targetWidth + targetX + x) * 4;
      target[targetOffset] = source[sourceOffset];
      target[targetOffset + 1] = source[sourceOffset + 1];
      target[targetOffset + 2] = source[sourceOffset + 2];
      target[targetOffset + 3] = source[sourceOffset + 3];
    }
  }
}

function renderComponent(options: {
  component: Component;
  cells: MapCell[];
  mapWidth: number;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
}): RenderedComponent {
  const { component, cells, mapWidth, graphicsByMapTileset } = options;
  const widthTiles = component.maxX - component.minX + 1;
  const heightTiles = component.maxY - component.minY + 1;
  const widthPixels = widthTiles * TILE_SIZE;
  const heightPixels = heightTiles * TILE_SIZE;
  const rgba = new Uint8Array(widthPixels * heightPixels * 4);
  let solidTiles = 0;
  let foregroundTiles = 0;

  for (const point of component.cells) {
    const cell = cells[cellIndex(point.x, point.y, mapWidth)];
    if (!cell) {
      continue;
    }
    if (cell.solidCells > 0) {
      solidTiles += 1;
    }
    if (cell.isForeground) {
      foregroundTiles += 1;
    }
    drawObjectArrangement({
      graphicsByMapTileset,
      cell,
      target: rgba,
      targetWidth: widthPixels,
      targetX: (point.x - component.minX) * TILE_SIZE,
      targetY: (point.y - component.minY) * TILE_SIZE
    });
  }

  return {
    rgba,
    widthPixels,
    heightPixels,
    widthTiles,
    heightTiles,
    solidRatio: component.cells.length === 0 ? 0 : Number((solidTiles / component.cells.length).toFixed(3)),
    foregroundRatio: component.cells.length === 0 ? 0 : Number((foregroundTiles / component.cells.length).toFixed(3)),
    greenishRatio: Number(greenishRatioForRgba(rgba).toFixed(3))
  };
}

function bitmapFromRgba(rgba: Uint8Array, widthPixels: number, heightPixels: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < heightPixels; y += 1) {
    let row = "";
    for (let x = 0; x < widthPixels; x += 1) {
      const index = (y * widthPixels + x) * 4;
      const alpha = rgba[index + 3];
      if (alpha === 0) {
        row += ".";
        continue;
      }
      const red = rgba[index];
      const green = rgba[index + 1];
      const blue = rgba[index + 2];
      const luminance = Math.round((red * 0.299 + green * 0.587 + blue * 0.114) / 64);
      const greenBit = green > red * 1.08 && green > blue * 1.05 ? "g" : "";
      row += `${greenBit}${Math.max(0, Math.min(3, luminance))}`;
    }
    rows.push(row);
  }
  return rows;
}

function mirrorRowsHorizontal(rows: string[]): string[] {
  return rows.map((row) => [...row].reverse().join(""));
}

function mirrorRowsVertical(rows: string[]): string[] {
  return [...rows].reverse();
}

export function canonicalMirrorSignature(width: number, height: number, rows: string[]): string {
  const variants = [
    rows,
    mirrorRowsHorizontal(rows),
    mirrorRowsVertical(rows),
    mirrorRowsVertical(mirrorRowsHorizontal(rows))
  ].map((variant) => `${width}x${height}:${variant.join("/")}`);
  return variants.sort()[0] as string;
}

function signatureForRendered(rendered: RenderedComponent): string {
  return canonicalMirrorSignature(
    rendered.widthPixels,
    rendered.heightPixels,
    bitmapFromRgba(rendered.rgba, rendered.widthPixels, rendered.heightPixels)
  );
}

function signatureForFootprint(component: Component): string {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  const filled = new Set(component.cells.map((point) => `${point.x - component.minX},${point.y - component.minY}`));
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = "";
    for (let x = 0; x < width; x += 1) {
      row += filled.has(`${x},${y}`) ? "#" : ".";
    }
    rows.push(row);
  }
  return canonicalMirrorSignature(width, height, rows);
}

function sampleLocations<T extends { location: { mapX: number; mapY: number; area: number } }>(instances: T[], limit = 8): Array<{ mapX: number; mapY: number; area: number }> {
  return instances
    .slice(0, limit)
    .map((instance) => instance.location)
    .sort((a, b) => a.mapY - b.mapY || a.mapX - b.mapX || a.area - b.area);
}

function paletteVariantsFor(instances: MotifInstance[]): PaletteVariant[] {
  const counts = new Map<string, PaletteVariant>();
  for (const instance of instances) {
    const [tilesetText, paletteText] = instance.paletteKey.split(":");
    const key = instance.paletteKey;
    const entry = counts.get(key) ?? { tileset: Number(tilesetText), palette: Number(paletteText), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tileset - b.tileset || a.palette - b.palette);
}

function categoryGuessAdvisory(rendered: RenderedComponent): string {
  if (rendered.greenishRatio >= 0.35) {
    return rendered.widthTiles <= 2 && rendered.heightTiles <= 2 ? "bush_or_small_flora" : "tree_or_flora";
  }
  if ((rendered.widthTiles >= 4 && rendered.heightTiles <= 2) || (rendered.heightTiles >= 4 && rendered.widthTiles <= 2)) {
    return "fence_or_linear_prop";
  }
  if (rendered.widthTiles <= 1 && rendered.heightTiles <= 1) {
    return "small_prop";
  }
  if (rendered.solidRatio >= 0.8) {
    return "solid_prop_or_wall";
  }
  return "unknown_prop";
}

async function cleanPreviousMotifImages(outDir: string): Promise<void> {
  if (!existsSync(outDir)) {
    return;
  }
  const entries = await readdir(outDir);
  await Promise.all(
    entries
      .filter((entry) => /^(motif|building|room|interactable)-\d+\.png$/.test(entry))
      .map((entry) => unlink(path.join(outDir, entry)))
  );
}

function areaForTile(cells: MapCell[], width: number, point: Point): number {
  return cells[cellIndex(point.x, point.y, width)]?.area ?? 0;
}

function anchorTileForDoor(entry: MapDoorEntry): Point {
  const worldPixel = doorTriggerToWorldPixel(entry);
  return {
    x: Math.max(0, Math.min(DEFAULT_MAP_WIDTH_TILES - 1, Math.floor(worldPixel.x / TILE_SIZE))),
    y: Math.max(0, Math.min(DEFAULT_MAP_HEIGHT_TILES - 1, Math.floor(worldPixel.y / TILE_SIZE)))
  };
}

function buildBuildingInstances(options: {
  cells: MapCell[];
  width: number;
  height: number;
  doors: MapDoorEntry[];
  sectors: WorldSectorAreas;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  logs: string[];
}): { instances: BuildingInstance[]; claimed: Uint8Array } {
  const { cells, width, height, doors, sectors, graphicsByMapTileset, logs } = options;
  const raw: Array<{ component: Component; doors: MapDoorEntry[] }> = [];
  const claimed = new Uint8Array(width * height);
  let indoorAnchorDrops = 0;
  for (const door of doors.filter((entry) => BUILDING_DOOR_TYPES.has(entry.type))) {
    const anchor = anchorTileForDoor(door);
    if (isIndoorAnchorTile(anchor, sectors)) {
      indoorAnchorDrops += 1;
      continue;
    }
    const component = growSolidFootprint({ cells, width, height, anchor, sectors });
    if (!component) {
      logs.push(`building-anchor-drop: no solid footprint near ${door.type} at ${anchor.x},${anchor.y}`);
      continue;
    }
    let bestOverlap: { entry: { component: Component; doors: MapDoorEntry[] }; ratio: number } | undefined;
    for (const existing of raw) {
      const ratio = componentOverlapRatio(existing.component, component);
      if (ratio > 0 && (!bestOverlap || ratio > bestOverlap.ratio)) {
        bestOverlap = { entry: existing, ratio };
      }
    }
    if (bestOverlap && bestOverlap.ratio >= 0.35) {
      if (bestOverlap.entry.doors.length >= MAX_DOORS_PER_BUILDING) {
        continue;
      }
      bestOverlap.entry.doors.push(door);
      continue;
    }
    const unclaimed = component.cells.filter((point) => claimed[cellIndex(point.x, point.y, width)] !== 1);
    if (unclaimed.length === 0) {
      if (bestOverlap && bestOverlap.entry.doors.length < MAX_DOORS_PER_BUILDING) {
        bestOverlap.entry.doors.push(door);
      }
      continue;
    }
    const unclaimedComponent = componentFromCells(unclaimed);
    const footprintWidth = unclaimedComponent.maxX - unclaimedComponent.minX + 1;
    const footprintHeight = unclaimedComponent.maxY - unclaimedComponent.minY + 1;
    if (footprintWidth > MAX_BUILDING_DIMENSION_TILES || footprintHeight > MAX_BUILDING_DIMENSION_TILES) {
      logs.push(`building-anchor-drop: capped footprint overflow ${footprintWidth}x${footprintHeight} at ${anchor.x},${anchor.y}`);
      continue;
    }
    raw.push({ component: unclaimedComponent, doors: [door] });
    for (const point of unclaimedComponent.cells) {
      claimed[cellIndex(point.x, point.y, width)] = 1;
    }
  }
  if (indoorAnchorDrops > 0) {
    logs.push(`building-anchor-indoor-room: skipped ${indoorAnchorDrops} indoor door/stairway anchors`);
  }

  const instances = raw.map((entry) => {
    const rendered = renderComponent({ component: entry.component, cells, mapWidth: width, graphicsByMapTileset });
    const firstDoor = entry.doors[0] as MapDoorEntry;
    const anchor = anchorTileForDoor(firstDoor);
    return {
      component: entry.component,
      doors: entry.doors,
      signature: signatureForFootprint(entry.component),
      rendered,
      location: { mapX: entry.component.minX, mapY: entry.component.minY, area: areaForTile(cells, width, anchor) }
    };
  });

  return { instances, claimed };
}

function buildBuildingMotifExclusionMask(options: {
  cells: MapCell[];
  width: number;
  height: number;
  doors: MapDoorEntry[];
}): Uint8Array {
  const { cells, width, height, doors } = options;
  const raw: Component[] = [];
  for (const door of doors.filter((entry) => BUILDING_DOOR_TYPES.has(entry.type))) {
    const anchor = anchorTileForDoor(door);
    const component = growLegacyMotifExclusionFootprint({ cells, width, height, anchor });
    if (!component) {
      continue;
    }
    let merged = false;
    for (let index = 0; index < raw.length; index += 1) {
      const existing = raw[index] as Component;
      if (shouldMergeLegacyMotifExclusionFootprints(existing, component)) {
        raw[index] = unionComponents([existing, component]);
        merged = true;
        break;
      }
    }
    if (!merged) {
      raw.push(component);
    }
  }

  const claimed = new Uint8Array(width * height);
  for (const component of raw) {
    for (const point of component.cells) {
      claimed[cellIndex(point.x, point.y, width)] = 1;
    }
  }
  return claimed;
}

function sectorTileBounds(options: {
  sector: number;
  sectors: WorldSectorAreas;
  width: number;
  height: number;
}): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  const { sector, sectors, width, height } = options;
  const sectorCol = sector % sectors.cols;
  const sectorRow = Math.floor(sector / sectors.cols);
  const minX = sectorCol * sectors.sectorWidthTiles;
  const minY = sectorRow * sectors.sectorHeightTiles;
  const maxX = Math.min((sectorCol + 1) * sectors.sectorWidthTiles, width) - 1;
  const maxY = Math.min((sectorRow + 1) * sectors.sectorHeightTiles, height) - 1;
  if (minX > maxX || minY > maxY) {
    return undefined;
  }
  return { minX, minY, maxX, maxY };
}

function floodConnectedIndoorSectorArea(sectors: WorldSectorAreas, startSector: number): number[] {
  const areaId = sectors.areaIds[startSector];
  const seen = new Uint8Array(sectors.cols * sectors.rows);
  const queue = [startSector];
  const indexes = [startSector];
  seen[startSector] = 1;
  let cursor = 0;

  while (cursor < queue.length) {
    const sector = queue[cursor] as number;
    cursor += 1;
    const sectorCol = sector % sectors.cols;
    const sectorRow = Math.floor(sector / sectors.cols);
    enqueue(sectorCol + 1, sectorRow);
    enqueue(sectorCol - 1, sectorRow);
    enqueue(sectorCol, sectorRow + 1);
    enqueue(sectorCol, sectorRow - 1);
  }

  return indexes.sort((a, b) => a - b);

  function enqueue(sectorCol: number, sectorRow: number): void {
    if (sectorCol < 0 || sectorRow < 0 || sectorCol >= sectors.cols || sectorRow >= sectors.rows) {
      return;
    }
    const sector = sectorRow * sectors.cols + sectorCol;
    if (seen[sector] || sectors.indoor[sector] !== 1 || sectors.areaIds[sector] !== areaId) {
      return;
    }
    seen[sector] = 1;
    queue.push(sector);
    indexes.push(sector);
  }
}

export function buildIndoorRoomSectorGroups(sectors: WorldSectorAreas): RoomSectorGroup[] {
  const visited = new Uint8Array(sectors.cols * sectors.rows);
  const groups: RoomSectorGroup[] = [];
  for (let sector = 0; sector < sectors.areaIds.length; sector += 1) {
    if (visited[sector] || sectors.indoor[sector] !== 1) {
      continue;
    }
    const sectorIndexes = floodConnectedIndoorSectorArea(sectors, sector);
    for (const index of sectorIndexes) {
      visited[index] = 1;
    }
    groups.push({
      sector,
      sectorIndexes,
      area: sectors.areaIds[sector] ?? 0
    });
  }
  return groups.sort((a, b) => a.sector - b.sector);
}

function componentFromSectorIndexes(options: {
  sectorIndexes: number[];
  sectors: WorldSectorAreas;
  width: number;
  height: number;
}): Component | undefined {
  const points: Point[] = [];
  for (const sector of options.sectorIndexes) {
    const bounds = sectorTileBounds({ sector, sectors: options.sectors, width: options.width, height: options.height });
    if (!bounds) {
      continue;
    }
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        points.push({ x, y });
      }
    }
  }
  return points.length === 0 ? undefined : componentFromCells(points);
}

function buildRoomInstances(options: {
  cells: MapCell[];
  width: number;
  height: number;
  doors: MapDoorEntry[];
  sectors: WorldSectorAreas;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
}): { instances: RoomInstance[]; claimed: Uint8Array } {
  const { cells, width, height, doors, sectors, graphicsByMapTileset } = options;
  const doorCountsBySector = new Map<number, number>();
  for (const door of doors.filter((entry) => BUILDING_DOOR_TYPES.has(entry.type))) {
    const anchor = anchorTileForDoor(door);
    const sector = sectorIndexForTile(anchor, sectors);
    if (sector !== undefined && sectors.indoor[sector] === 1) {
      doorCountsBySector.set(sector, (doorCountsBySector.get(sector) ?? 0) + 1);
    }
  }

  const claimed = new Uint8Array(width * height);
  const instances: RoomInstance[] = [];
  for (const group of buildIndoorRoomSectorGroups(sectors)) {
    const { sector, sectorIndexes, area } = group;
    const component = componentFromSectorIndexes({ sectorIndexes, sectors, width, height });
    if (!component) {
      continue;
    }
    for (const point of component.cells) {
      claimed[cellIndex(point.x, point.y, width)] = 1;
    }
    instances.push({
      component,
      sector,
      area,
      doorCount: sectorIndexes.reduce((sum, index) => sum + (doorCountsBySector.get(index) ?? 0), 0),
      rendered: renderComponent({ component, cells, mapWidth: width, graphicsByMapTileset }),
      location: { mapX: component.minX, mapY: component.minY, area }
    });
  }

  return {
    instances: instances.sort((a, b) => a.location.mapY - b.location.mapY || a.location.mapX - b.location.mapX || a.sector - b.sector),
    claimed
  };
}

function mergeClaimMasks(width: number, height: number, masks: Uint8Array[]): Uint8Array {
  const merged = new Uint8Array(width * height);
  for (const mask of masks) {
    for (let index = 0; index < merged.length; index += 1) {
      if (mask[index] === 1) {
        merged[index] = 1;
      }
    }
  }
  return merged;
}

function buildMotifInstances(options: {
  cells: MapCell[];
  width: number;
  height: number;
  terrainKeys: Set<string>;
  buildingClaimed: Uint8Array;
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  logs: string[];
}): MotifInstance[] {
  const { cells, width, height, terrainKeys, buildingClaimed, graphicsByMapTileset, logs } = options;
  const claimed = new Uint8Array(width * height);
  const components = extractObjectComponents({
    width,
    height,
    isCandidate: (x, y) => {
      const cell = cells[cellIndex(x, y, width)];
      return Boolean(cell && !terrainKeys.has(cell.key) && (cell.isForeground || cell.solidCells > 0));
    },
    isClaimed: (x, y) => buildingClaimed[cellIndex(x, y, width)] === 1 || claimed[cellIndex(x, y, width)] === 1,
    claim: (x, y) => {
      claimed[cellIndex(x, y, width)] = 1;
    }
  });

  const instances: MotifInstance[] = [];
  for (const component of components) {
    const widthTiles = component.maxX - component.minX + 1;
    const heightTiles = component.maxY - component.minY + 1;
    if (
      component.cells.length > MAX_MOTIF_COMPONENT_CELLS ||
      widthTiles > MAX_MOTIF_DIMENSION_TILES ||
      heightTiles > MAX_MOTIF_DIMENSION_TILES
    ) {
      logs.push(`motif-component-drop: ${widthTiles}x${heightTiles}/${component.cells.length} at ${component.minX},${component.minY}`);
      continue;
    }
    const rendered = renderComponent({ component, cells, mapWidth: width, graphicsByMapTileset });
    if (!hasOpaquePixel(rendered.rgba)) {
      logs.push(`motif-component-drop: empty render at ${component.minX},${component.minY}`);
      continue;
    }
    const firstCell = cells[cellIndex(component.minX, component.minY, width)] as MapCell;
    instances.push({
      component,
      signature: signatureForRendered(rendered),
      rendered,
      paletteKey: `${firstCell.tileset}:${firstCell.palette}`,
      location: { mapX: component.minX, mapY: component.minY, area: firstCell.area }
    });
  }
  return instances;
}

async function writeGroupedBuildings(options: {
  instances: BuildingInstance[];
  outImageDir: string;
}): Promise<BuildingOutput[]> {
  const groups = new Map<string, BuildingInstance[]>();
  for (const instance of options.instances) {
    const group = groups.get(instance.signature) ?? [];
    group.push(instance);
    groups.set(instance.signature, group);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    b.length - a.length ||
    b[0].component.cells.length - a[0].component.cells.length ||
    a[0].location.mapY - b[0].location.mapY ||
    a[0].location.mapX - b[0].location.mapX
  );

  const outputs: BuildingOutput[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const instances = sorted[index] as BuildingInstance[];
    const sample = instances[0] as BuildingInstance;
    const id = `building-${String(index + 1).padStart(4, "0")}`;
    const imageFile = `${id}.png`;
    await writeFile(path.join(options.outImageDir, imageFile), encodePngRgba(sample.rendered.widthPixels, sample.rendered.heightPixels, sample.rendered.rgba));
    outputs.push({
      buildingId: id,
      footprintWxH: `${sample.rendered.widthTiles}x${sample.rendered.heightTiles}`,
      instanceCount: instances.length,
      sampleLocations: sampleLocations(instances),
      image: `${MOTIF_IMAGE_PUBLIC_PREFIX}/${imageFile}`,
      doorCount: Math.max(...instances.map((instance) => instance.doors.length))
    });
  }
  return outputs;
}

async function writeRooms(options: {
  instances: RoomInstance[];
  outImageDir: string;
}): Promise<RoomOutput[]> {
  const outputs: RoomOutput[] = [];
  for (let index = 0; index < options.instances.length; index += 1) {
    const room = options.instances[index] as RoomInstance;
    const id = `room-${String(index + 1).padStart(4, "0")}`;
    const imageFile = `${id}.png`;
    await writeFile(path.join(options.outImageDir, imageFile), encodePngRgba(room.rendered.widthPixels, room.rendered.heightPixels, room.rendered.rgba));
    outputs.push({
      roomId: id,
      sector: room.sector,
      widthTiles: room.rendered.widthTiles,
      heightTiles: room.rendered.heightTiles,
      area: room.area,
      sampleLocation: room.location,
      image: `${MOTIF_IMAGE_PUBLIC_PREFIX}/${imageFile}`,
      doorCount: room.doorCount
    });
  }
  return outputs;
}

async function writeGroupedMotifs(options: {
  instances: MotifInstance[];
  outImageDir: string;
  logs: string[];
}): Promise<MotifOutput[]> {
  const groups = new Map<string, MotifInstance[]>();
  for (const instance of options.instances) {
    const group = groups.get(instance.signature) ?? [];
    group.push(instance);
    groups.set(instance.signature, group);
  }
  const singletonGroups = [...groups.values()].filter((group) => group.length === 1);
  if (singletonGroups.length > 0) {
    options.logs.push(`motif-singleton-drop: ${singletonGroups.length} non-recurring type groups (${singletonGroups.length} physical placements)`);
  }
  const sorted = [...groups.values()].filter((group) => group.length > 1).sort((a, b) =>
    b.length - a.length ||
    b[0].component.cells.length - a[0].component.cells.length ||
    a[0].location.mapY - b[0].location.mapY ||
    a[0].location.mapX - b[0].location.mapX
  );

  const outputs: MotifOutput[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const instances = sorted[index] as MotifInstance[];
    const sample = instances[0] as MotifInstance;
    const id = `motif-${String(index + 1).padStart(4, "0")}`;
    const imageFile = `${id}.png`;
    await writeFile(path.join(options.outImageDir, imageFile), encodePngRgba(sample.rendered.widthPixels, sample.rendered.heightPixels, sample.rendered.rgba));
    outputs.push({
      motifId: id,
      widthTiles: sample.rendered.widthTiles,
      heightTiles: sample.rendered.heightTiles,
      instanceCount: instances.length,
      solidRatio: sample.rendered.solidRatio,
      foregroundRatio: sample.rendered.foregroundRatio,
      greenishRatio: sample.rendered.greenishRatio,
      categoryGuessAdvisory: categoryGuessAdvisory(sample.rendered),
      paletteVariants: paletteVariantsFor(instances),
      sampleLocations: sampleLocations(instances, 10),
      image: `${MOTIF_IMAGE_PUBLIC_PREFIX}/${imageFile}`
    });
  }
  return outputs;
}

async function writeInteractables(options: {
  cells: MapCell[];
  width: number;
  height: number;
  doors: MapDoorEntry[];
  graphicsByMapTileset: Map<number, TilesetGraphics>;
  outImageDir: string;
}): Promise<InteractableOutput[]> {
  const outputs: InteractableOutput[] = [];
  const anchors = options.doors.filter((entry) => INTERACTABLE_DOOR_TYPES.has(entry.type));
  for (let index = 0; index < anchors.length; index += 1) {
    const entry = anchors[index] as MapDoorEntry;
    const worldPixel = doorTriggerToWorldPixel(entry);
    const anchorTile = anchorTileForDoor(entry);
    const nearest = nearestSolidTile({
      cells: options.cells,
      width: options.width,
      height: options.height,
      origin: anchorTile,
      radius: 2
    }) ?? anchorTile;
    const cell = options.cells[cellIndex(nearest.x, nearest.y, options.width)] as MapCell;
    const image = renderSingleTileObject({ graphicsByMapTileset: options.graphicsByMapTileset, cell });
    const imageFile = `interactable-${String(index + 1).padStart(4, "0")}.png`;
    await writeFile(path.join(options.outImageDir, imageFile), encodePngRgba(TILE_SIZE, TILE_SIZE, image));
    outputs.push({
      anchorType: entry.type,
      worldPixel,
      area: areaForTile(options.cells, options.width, anchorTile),
      textPointer: entry.textPointer ?? null,
      textPreview: null,
      image: `${MOTIF_IMAGE_PUBLIC_PREFIX}/${imageFile}`
    });
  }
  return outputs.sort((a, b) => a.worldPixel.y - b.worldPixel.y || a.worldPixel.x - b.worldPixel.x || a.anchorType.localeCompare(b.anchorType));
}

function byCategory(motifs: MotifOutput[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const motif of motifs) {
    counts[motif.categoryGuessAdvisory] = (counts[motif.categoryGuessAdvisory] ?? 0) + motif.instanceCount;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function shouldValidateDefaultShape(projectRelative: string): boolean {
  return path.normalize(projectRelative) === path.normalize(DEFAULT_PROJECT_RELATIVE);
}

function assertDefaultMotifAtlasShape(atlas: MotifAtlas, projectRelative: string): void {
  if (!shouldValidateDefaultShape(projectRelative)) {
    return;
  }

  const failures: string[] = [];
  const expected = DEFAULT_MOTIF_ATLAS_SHAPE;
  if (atlas.motifs.length !== expected.motifs) {
    failures.push(`motifs=${atlas.motifs.length} expected ${expected.motifs}`);
  }
  if (atlas.counts.motifTypes !== expected.motifs) {
    failures.push(`counts.motifTypes=${atlas.counts.motifTypes} expected ${expected.motifs}`);
  }
  if (atlas.counts.motifInstances !== expected.motifInstances) {
    failures.push(`counts.motifInstances=${atlas.counts.motifInstances} expected ${expected.motifInstances}`);
  }
  if (atlas.buildings.length !== expected.buildings) {
    failures.push(`buildings=${atlas.buildings.length} expected ${expected.buildings}`);
  }
  if (atlas.counts.buildings !== expected.buildings) {
    failures.push(`counts.buildings=${atlas.counts.buildings} expected ${expected.buildings}`);
  }
  if (!Array.isArray(atlas.rooms)) {
    failures.push("rooms is not an array");
  } else if (atlas.rooms.length !== expected.rooms) {
    failures.push(`rooms=${atlas.rooms.length} expected ${expected.rooms}`);
  }
  if (atlas.counts.rooms !== expected.rooms) {
    failures.push(`counts.rooms=${atlas.counts.rooms} expected ${expected.rooms}`);
  }
  if (atlas.interactables.length !== expected.interactables) {
    failures.push(`interactables=${atlas.interactables.length} expected ${expected.interactables}`);
  }
  if (atlas.counts.interactables !== expected.interactables) {
    failures.push(`counts.interactables=${atlas.counts.interactables} expected ${expected.interactables}`);
  }

  const oversizedBuilding = atlas.buildings.find((building) => {
    const [widthTiles, heightTiles] = building.footprintWxH.split("x").map((value) => Number(value));
    return (widthTiles ?? 0) > MAX_BUILDING_DIMENSION_TILES || (heightTiles ?? 0) > MAX_BUILDING_DIMENSION_TILES;
  });
  if (oversizedBuilding) {
    failures.push(`${oversizedBuilding.buildingId} footprint ${oversizedBuilding.footprintWxH} exceeds ${MAX_BUILDING_DIMENSION_TILES}x${MAX_BUILDING_DIMENSION_TILES}`);
  }

  if (failures.length > 0) {
    throw new Error(`atlas: motif extraction shape drifted for ${DEFAULT_PROJECT_RELATIVE}: ${failures.join("; ")}`);
  }
}

export async function extractMotifAtlas(options: ExtractMotifAtlasOptions = {}): Promise<MotifAtlas> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const projectRelative = options.projectRelative ?? DEFAULT_PROJECT_RELATIVE;
  const atlasJsonRelative = options.atlasJsonRelative ?? DEFAULT_ATLAS_JSON_RELATIVE;
  const motifImageDirRelative = options.motifImageDirRelative ?? DEFAULT_MOTIF_IMAGE_DIR_RELATIVE;
  const projectAbs = resolvePath(rootDir, projectRelative);
  const outJsonPath = resolvePath(rootDir, atlasJsonRelative);
  const outImageDir = resolvePath(rootDir, motifImageDirRelative);
  const logs: string[] = [];

  const [graphicsByMapTileset, mapRows, sectorEntries, tileAtlasSource, mapDoorsSource] = await Promise.all([
    loadTilesetGraphics(path.join(projectAbs, "Tilesets")),
    readFile(path.join(projectAbs, "map_tiles.map"), "utf8").then(parseMapTiles),
    readFile(path.join(projectAbs, "map_sectors.yml"), "utf8").then(parseIntKeyedYaml),
    readFile(path.join(rootDir, "content/atlas/tiles.json"), "utf8"),
    readFile(path.join(projectAbs, "map_doors.yml"), "utf8")
  ]);
  const tileMetaByKey = parseTileAtlas(tileAtlasSource);
  const { cells, width, height, sectors } = buildMapCells({ mapRows, sectorEntries, tileMetaByKey, graphicsByMapTileset });
  const terrainStats = buildTerrainStats({ cells, width, height, graphicsByMapTileset });
  const terrainSplit = splitTerrainTiles(terrainStats, cells.length);
  if (terrainSplit.objectDensityPct > TERRAIN_DENSITY_TARGET_PCT) {
    throw new Error(`atlas: terrain split still blobby (${terrainSplit.objectDensityPct}% object density > ${TERRAIN_DENSITY_TARGET_PCT}%)`);
  }
  logs.push(`terrain: ${terrainSplit.terrainKeys.size} tile types, object density ${terrainSplit.objectDensityPct}%, retuned ${terrainSplit.retunedTileCount} tile types`);

  await mkdir(outImageDir, { recursive: true });
  await mkdir(path.dirname(outJsonPath), { recursive: true });
  await cleanPreviousMotifImages(outImageDir);

  const doors = parseMapDoors(mapDoorsSource);
  const buildingBuild = buildBuildingInstances({ cells, width, height, doors, sectors, graphicsByMapTileset, logs });
  const buildingMotifExclusion = buildBuildingMotifExclusionMask({ cells, width, height, doors });
  const roomBuild = buildRoomInstances({ cells, width, height, doors, sectors, graphicsByMapTileset });
  const atlasClaimed = mergeClaimMasks(width, height, [buildingMotifExclusion]);
  const motifInstances = buildMotifInstances({
    cells,
    width,
    height,
    terrainKeys: terrainSplit.terrainKeys,
    buildingClaimed: atlasClaimed,
    graphicsByMapTileset,
    logs
  });

  const [buildings, rooms, motifs, interactables] = await Promise.all([
    writeGroupedBuildings({ instances: buildingBuild.instances, outImageDir }),
    writeRooms({ instances: roomBuild.instances, outImageDir }),
    writeGroupedMotifs({ instances: motifInstances, outImageDir, logs }),
    writeInteractables({ cells, width, height, doors, graphicsByMapTileset, outImageDir })
  ]);

  const singletonTypes = motifs.filter((motif) => motif.instanceCount === 1).length;
  const singletonTypePct = motifs.length === 0 ? 0 : Number(((singletonTypes / motifs.length) * 100).toFixed(2));
  const emittedMotifInstances = motifs.reduce((sum, motif) => sum + motif.instanceCount, 0);
  const buildingsOver14Tiles = buildings.filter((building) => {
    const [widthTiles, heightTiles] = building.footprintWxH.split("x").map((value) => Number(value));
    return (widthTiles ?? 0) > MAX_BUILDING_DIMENSION_TILES || (heightTiles ?? 0) > MAX_BUILDING_DIMENSION_TILES;
  }).length;
  const pctBuildingsOver14Tiles = pct(buildingsOver14Tiles, buildings.length);
  const atlas: MotifAtlas = {
    schema: SCHEMA,
    generatedFrom: projectRelative,
    tileSize: TILE_SIZE,
    terrain: {
      tileCount: terrainSplit.terrainKeys.size,
      retunedTileCount: terrainSplit.retunedTileCount,
      objectDensityOverall: terrainSplit.objectDensityPct,
      byArea: terrainByArea({ cells, terrainKeys: terrainSplit.terrainKeys })
    },
    buildings,
    rooms,
    interactables,
    motifs,
    counts: {
      buildings: buildings.length,
      rooms: rooms.length,
      interactables: interactables.length,
      motifTypes: motifs.length,
      motifInstances: emittedMotifInstances,
      byCategoryAdvisory: byCategory(motifs),
      singletonTypePct,
      pctBuildingsOver14Tiles
    },
    selfCheck: {
      objectDensitySparse: terrainSplit.objectDensityPct <= TERRAIN_DENSITY_TARGET_PCT,
      singletonTypePctLow: singletonTypePct < 30,
      pctBuildingsOver14TilesLow: pctBuildingsOver14Tiles <= 5,
      frequentMotifsHaveRepeatedInstances: motifs.slice(0, 15).some((motif) => motif.instanceCount > 1),
      frequentBuildingsHaveRepeatedInstances: buildings.slice(0, 10).some((building) => building.instanceCount > 1)
    },
    logs
  };

  assertDefaultMotifAtlasShape(atlas, projectRelative);
  await writeFile(outJsonPath, `${JSON.stringify(atlas, null, 2)}\n`, "utf8");
  return atlas;
}

async function main(): Promise<void> {
  const atlas = await extractMotifAtlas();
  const topMotifs = atlas.motifs
    .slice(0, 15)
    .map((motif) => `${motif.motifId}:${motif.widthTiles}x${motif.heightTiles}:${motif.instanceCount}`)
    .join(", ");
  const topBuildings = atlas.buildings
    .slice(0, 10)
    .map((building) => `${building.buildingId}:${building.footprintWxH}:${building.instanceCount}:${building.doorCount}`)
    .join(", ");
  console.log(`atlas: terrain tile types ${atlas.terrain.tileCount}, object density ${atlas.terrain.objectDensityOverall}%, singleton types ${atlas.counts.singletonTypePct}%`);
  console.log(`atlas: buildings ${atlas.counts.buildings}, rooms ${atlas.counts.rooms}, interactables ${atlas.counts.interactables}, motifs ${atlas.counts.motifTypes}/${atlas.counts.motifInstances}`);
  console.log(`atlas: building size >${MAX_BUILDING_DIMENSION_TILES} tiles ${atlas.counts.pctBuildingsOver14Tiles}%`);
  console.log(`atlas: top motifs ${topMotifs}`);
  console.log(`atlas: top buildings ${topBuildings}`);
  if (atlas.logs.length > 0) {
    console.log(`atlas: logs ${atlas.logs.length}`);
    for (const line of atlas.logs.slice(-20)) {
      console.log(`atlas: ${line}`);
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
