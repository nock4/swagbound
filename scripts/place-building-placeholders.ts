import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AddedNpcsSchema,
  WorldChunkedSchema,
  type AddedNpc,
  type AddedNpcs,
  type SpriteFacing,
  type WorldChunked,
  type WorldDoor
} from "@eb/schemas";
import { worldPixelToCollisionCell, type CollisionGrid } from "../apps/game/src/collisionOverlay";

const DEFAULT_WORLD_JSON = "apps/game/public/generated/world.json";
const DEFAULT_ADDED_NPCS_JSON = "content/added-npcs.json";
const PLACEHOLDER_START_ID = 100100;
const PLACEHOLDER_SPRITE_GROUPS = [59, 54, 119, 68, 66] as const;
const FACINGS = new Set<SpriteFacing>(["up", "right", "down", "left"]);

type Pixel = { x: number; y: number };
type CollisionRows = Pick<WorldChunked["collision"], "solidRows">;
type SectorAreaMetadata = NonNullable<WorldChunked["sectors"]>;

export type DoorLanding = {
  worldPixel: Pixel;
  direction: SpriteFacing;
};

export type EmptyBoundedInterior = {
  key: string;
  sectorIndexes: number[];
  landings: DoorLanding[];
  doorCount: number;
  visibleNpcCount: number;
};

export type PlaceholderPlacementInput = {
  solidRows: readonly string[];
  grid: CollisionGrid;
  sectors: SectorAreaMetadata;
  sectorIndexes: readonly number[];
  landings: readonly DoorLanding[];
};

export type PlaceholderPlacement = {
  worldPixel: Pixel;
  cell: { cellX: number; cellY: number };
  facing: SpriteFacing;
  solidAdjacent: boolean;
};

export type PlaceholderBuildResult = {
  overlay: AddedNpcs;
  emptiesFound: number;
  placeholdersPlaced: number;
  skipped: Array<{
    key: string;
    sectorIndexes: number[];
    firstLanding?: Pixel;
  }>;
};

export function findEmptyBoundedInteriors(world: WorldChunked): EmptyBoundedInterior[] {
  const sectors = world.sectors;
  if (!sectors) {
    return [];
  }
  const groups = new Map<string, EmptyBoundedInterior>();
  for (const door of world.doors) {
    const destinationSector = sectorCoordForWorldPixel(door.destinationWorldPixel, sectors);
    if (!destinationSector || sectors.bounded[destinationSector.index] !== 1) {
      continue;
    }
    const sectorIndexes = floodConnectedSectorArea(sectors, destinationSector.index);
    const key = sectorIndexes.join(",");
    const existing = groups.get(key);
    const group = existing ?? {
      key,
      sectorIndexes,
      landings: [],
      doorCount: 0,
      visibleNpcCount: 0
    };
    group.doorCount += 1;
    addLanding(group.landings, {
      worldPixel: { ...door.destinationWorldPixel },
      direction: normalizeFacing(door.direction)
    });
    groups.set(key, group);
  }

  const visibleNpcCountsBySector = countVisibleNpcsBySector(world.npcs, sectors);
  const interiors = [...groups.values()].map((group) => ({
    ...group,
    visibleNpcCount: group.sectorIndexes.reduce(
      (count, sectorIndex) => count + (visibleNpcCountsBySector.get(sectorIndex) ?? 0),
      0
    ),
    landings: [...group.landings].sort(compareLandings)
  }));

  return interiors
    .filter((interior) => interior.visibleNpcCount === 0)
    .sort(compareInteriors);
}

export function choosePlaceholderPlacement(input: PlaceholderPlacementInput): PlaceholderPlacement | undefined {
  let best: ScoredPlacement | undefined;
  const sectorIndexes = [...new Set(input.sectorIndexes)].sort((a, b) => a - b);
  const landings = [...input.landings].sort(compareLandings);

  for (const landing of landings) {
    const landingCell = worldPixelToCollisionCell(landing.worldPixel, input.grid.cellSize);
    if (!landingCell) {
      continue;
    }
    const vector = directionVector(landing.direction);
    for (const sectorIndex of sectorIndexes) {
      const bounds = sectorCellBounds(sectorIndex, input.sectors, input.grid);
      if (!bounds) {
        continue;
      }
      for (let cellY = bounds.minCellY; cellY <= bounds.maxCellY; cellY += 1) {
        for (let cellX = bounds.minCellX; cellX <= bounds.maxCellX; cellX += 1) {
          if (!isWalkableCell(input.solidRows, cellX, cellY)) {
            continue;
          }
          if (cellX === landingCell.cellX && cellY === landingCell.cellY) {
            continue;
          }
          const axialOffset = (cellX - landingCell.cellX) * vector.dx + (cellY - landingCell.cellY) * vector.dy;
          if (axialOffset <= 0) {
            continue;
          }
          const solidAdjacent = isSolidAdjacent(input.solidRows, cellX, cellY);
          const manhattanDistance = Math.abs(cellX - landingCell.cellX) + Math.abs(cellY - landingCell.cellY);
          const lateralOffset = Math.abs((cellX - landingCell.cellX) * vector.dy - (cellY - landingCell.cellY) * vector.dx);
          const score = [
            solidAdjacent ? 0 : 1,
            manhattanDistance,
            lateralOffset,
            axialOffset,
            cellY,
            cellX
          ];
          const candidate: ScoredPlacement = {
            worldPixel: {
              x: cellX * input.grid.cellSize,
              y: cellY * input.grid.cellSize
            },
            cell: { cellX, cellY },
            facing: facingTowardCell({ cellX, cellY }, landingCell),
            solidAdjacent,
            score
          };
          if (!best || compareScore(candidate.score, best.score) < 0) {
            best = candidate;
          }
        }
      }
    }
  }

  if (!best) {
    return undefined;
  }
  return {
    worldPixel: best.worldPixel,
    cell: best.cell,
    facing: best.facing,
    solidAdjacent: best.solidAdjacent
  };
}

export function buildPlaceholderOverlay(world: WorldChunked): PlaceholderBuildResult {
  const sectors = world.sectors;
  if (!sectors) {
    throw new Error("world.json does not include sector metadata.");
  }
  const grid = collisionGrid(world);
  const empties = findEmptyBoundedInteriors(world);
  const npcs: AddedNpc[] = [];
  const skipped: PlaceholderBuildResult["skipped"] = [];

  for (const interior of empties) {
    const placement = choosePlaceholderPlacement({
      solidRows: world.collision.solidRows,
      grid,
      sectors,
      sectorIndexes: interior.sectorIndexes,
      landings: interior.landings
    });
    if (!placement) {
      skipped.push({
        key: interior.key,
        sectorIndexes: interior.sectorIndexes,
        firstLanding: interior.landings[0]?.worldPixel
      });
      continue;
    }
    const index = npcs.length;
    npcs.push({
      id: PLACEHOLDER_START_ID + index,
      worldPixel: placement.worldPixel,
      spriteGroup: PLACEHOLDER_SPRITE_GROUPS[index % PLACEHOLDER_SPRITE_GROUPS.length],
      facing: placement.facing
    });
  }

  const overlay = AddedNpcsSchema.parse({
    schema: "swagbound.added-npcs.v1",
    npcs
  });

  return {
    overlay,
    emptiesFound: empties.length,
    placeholdersPlaced: overlay.npcs.length,
    skipped
  };
}

async function readWorld(path: string): Promise<WorldChunked> {
  return WorldChunkedSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function collisionGrid(world: WorldChunked): CollisionGrid {
  return {
    cellSize: world.collision.cellSize,
    width: world.collision.width,
    height: world.collision.height
  };
}

function countVisibleNpcsBySector(
  npcs: readonly WorldChunked["npcs"][number][],
  sectors: SectorAreaMetadata
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const npc of npcs) {
    if (npc.visible === false) {
      continue;
    }
    const sector = sectorCoordForWorldPixel(npc.worldPixel, sectors);
    if (!sector) {
      continue;
    }
    counts.set(sector.index, (counts.get(sector.index) ?? 0) + 1);
  }
  return counts;
}

function floodConnectedSectorArea(sectors: SectorAreaMetadata, startIndex: number): number[] {
  const areaId = sectors.areaIds[startIndex];
  const seen = new Uint8Array(sectors.cols * sectors.rows);
  const queue = [startIndex];
  const indexes: number[] = [startIndex];
  seen[startIndex] = 1;
  let cursor = 0;

  while (cursor < queue.length) {
    const index = queue[cursor];
    cursor += 1;
    const sectorCol = index % sectors.cols;
    const sectorRow = Math.floor(index / sectors.cols);
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
    const index = sectorRow * sectors.cols + sectorCol;
    if (seen[index] || sectors.areaIds[index] !== areaId) {
      return;
    }
    seen[index] = 1;
    queue.push(index);
    indexes.push(index);
  }
}

function addLanding(landings: DoorLanding[], landing: DoorLanding): void {
  if (landings.some((entry) =>
    entry.worldPixel.x === landing.worldPixel.x &&
    entry.worldPixel.y === landing.worldPixel.y &&
    entry.direction === landing.direction
  )) {
    return;
  }
  landings.push(landing);
}

function sectorCoordForWorldPixel(
  point: Pixel,
  sectors: SectorAreaMetadata
): { sectorCol: number; sectorRow: number; index: number } | undefined {
  const sectorWidthPixels = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeightPixels = sectors.sectorHeightTiles * sectors.tileSize;
  if (sectorWidthPixels <= 0 || sectorHeightPixels <= 0 || point.x < 0 || point.y < 0) {
    return undefined;
  }
  const sectorCol = Math.floor(point.x / sectorWidthPixels);
  const sectorRow = Math.floor(point.y / sectorHeightPixels);
  if (sectorCol < 0 || sectorRow < 0 || sectorCol >= sectors.cols || sectorRow >= sectors.rows) {
    return undefined;
  }
  return { sectorCol, sectorRow, index: sectorRow * sectors.cols + sectorCol };
}

function sectorCellBounds(
  sectorIndex: number,
  sectors: SectorAreaMetadata,
  grid: CollisionGrid
): { minCellX: number; maxCellX: number; minCellY: number; maxCellY: number } | undefined {
  const sectorCol = sectorIndex % sectors.cols;
  const sectorRow = Math.floor(sectorIndex / sectors.cols);
  const minPixelX = sectorCol * sectors.sectorWidthTiles * sectors.tileSize;
  const minPixelY = sectorRow * sectors.sectorHeightTiles * sectors.tileSize;
  const maxPixelX = Math.min((sectorCol + 1) * sectors.sectorWidthTiles * sectors.tileSize, grid.width * grid.cellSize);
  const maxPixelY = Math.min((sectorRow + 1) * sectors.sectorHeightTiles * sectors.tileSize, grid.height * grid.cellSize);
  const minCellX = Math.floor(minPixelX / grid.cellSize);
  const minCellY = Math.floor(minPixelY / grid.cellSize);
  const maxCellX = Math.ceil(maxPixelX / grid.cellSize) - 1;
  const maxCellY = Math.ceil(maxPixelY / grid.cellSize) - 1;
  if (maxCellX < minCellX || maxCellY < minCellY) {
    return undefined;
  }
  return {
    minCellX: clamp(minCellX, 0, grid.width - 1),
    maxCellX: clamp(maxCellX, 0, grid.width - 1),
    minCellY: clamp(minCellY, 0, grid.height - 1),
    maxCellY: clamp(maxCellY, 0, grid.height - 1)
  };
}

function isWalkableCell(solidRows: readonly string[], cellX: number, cellY: number): boolean {
  return solidRows[cellY]?.[cellX] === "0";
}

function isSolidAdjacent(solidRows: readonly string[], cellX: number, cellY: number): boolean {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ].some(([dx, dy]) => !isWalkableCell(solidRows, cellX + dx, cellY + dy));
}

function normalizeFacing(direction: WorldDoor["direction"]): SpriteFacing {
  return FACINGS.has(direction as SpriteFacing) ? direction as SpriteFacing : "down";
}

function directionVector(facing: SpriteFacing): { dx: number; dy: number } {
  switch (facing) {
    case "up":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: 1, dy: 0 };
    case "left":
      return { dx: -1, dy: 0 };
    case "down":
      return { dx: 0, dy: 1 };
  }
}

function facingTowardCell(
  from: { cellX: number; cellY: number },
  to: { cellX: number; cellY: number }
): SpriteFacing {
  const dx = to.cellX - from.cellX;
  const dy = to.cellY - from.cellY;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    return dx > 0 ? "right" : "left";
  }
  if (dy !== 0) {
    return dy > 0 ? "down" : "up";
  }
  return "down";
}

function compareLandings(a: DoorLanding, b: DoorLanding): number {
  return a.worldPixel.y - b.worldPixel.y ||
    a.worldPixel.x - b.worldPixel.x ||
    a.direction.localeCompare(b.direction);
}

function compareInteriors(a: EmptyBoundedInterior, b: EmptyBoundedInterior): number {
  const aLanding = a.landings[0]?.worldPixel;
  const bLanding = b.landings[0]?.worldPixel;
  return a.sectorIndexes[0] - b.sectorIndexes[0] ||
    (aLanding?.y ?? 0) - (bLanding?.y ?? 0) ||
    (aLanding?.x ?? 0) - (bLanding?.x ?? 0) ||
    a.key.localeCompare(b.key);
}

function compareScore(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const delta = a[index] - b[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return a.length - b.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type ScoredPlacement = PlaceholderPlacement & {
  score: number[];
};

async function main(): Promise<void> {
  const worldPath = resolve(process.argv[2] ?? DEFAULT_WORLD_JSON);
  const outputPath = resolve(process.argv[3] ?? DEFAULT_ADDED_NPCS_JSON);
  const world = await readWorld(worldPath);
  const result = buildPlaceholderOverlay(world);
  await writeFile(outputPath, `${JSON.stringify(result.overlay, null, 2)}\n`);

  console.log(JSON.stringify({
    emptiesFound: result.emptiesFound,
    placeholdersPlaced: result.placeholdersPlaced,
    skipped: result.skipped.length,
    output: outputPath,
    skippedInteriors: result.skipped
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
