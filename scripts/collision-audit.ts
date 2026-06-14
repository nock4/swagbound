import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  solidAtCell,
  surfaceAtCell,
  SURFACE_WATER_MASK,
  worldPixelToCollisionCell
} from "../apps/game/src/collisionOverlay";

type CollisionRows = {
  cellSize: number;
  width: number;
  height: number;
  solidRows: string[];
  surfaceRows: string[];
};

type AuditDoor = {
  worldPixel: { x: number; y: number };
  destinationWorldPixel: { x: number; y: number };
};

export type CollisionAuditInput = {
  tileSize: number;
  collision: CollisionRows;
  doors: AuditDoor[];
};

export type CollisionAuditCounts = {
  totalCells: number;
  solidCells: number;
  solidPercent: number;
  waterCells: number;
  mixedTileCount: number;
  doorCount: number;
  doorTriggerCellCount: number;
  doorsWithSolidDestination: number;
  doorsOnSolidTriggerCells: number;
  solidDoorTriggerCells: number;
};

const DEFAULT_WORLD_JSON = "apps/game/public/generated/world.json";

export function auditCollisionWorld(world: CollisionAuditInput): CollisionAuditCounts {
  const { collision } = world;
  const totalCells = collision.width * collision.height;
  let solidCells = 0;
  let waterCells = 0;

  for (let y = 0; y < collision.height; y += 1) {
    for (let x = 0; x < collision.width; x += 1) {
      if (solidAtCell(collision.solidRows, x, y)) {
        solidCells += 1;
      }
      if ((surfaceAtCell(collision.surfaceRows, x, y) & SURFACE_WATER_MASK) !== 0) {
        waterCells += 1;
      }
    }
  }

  const triggerCells = new Set<string>();
  const solidTriggerCells = new Set<string>();
  let doorsWithSolidDestination = 0;
  let doorsOnSolidTriggerCells = 0;

  for (const door of world.doors) {
    const trigger = worldPixelToCollisionCell(door.worldPixel, collision.cellSize);
    if (trigger) {
      const key = cellKey(trigger.cellX, trigger.cellY);
      triggerCells.add(key);
      if (solidAtCell(collision.solidRows, trigger.cellX, trigger.cellY)) {
        doorsOnSolidTriggerCells += 1;
        solidTriggerCells.add(key);
      }
    }

    const destination = worldPixelToCollisionCell(door.destinationWorldPixel, collision.cellSize);
    if (destination && solidAtCell(collision.solidRows, destination.cellX, destination.cellY)) {
      doorsWithSolidDestination += 1;
    }
  }

  return {
    totalCells,
    solidCells,
    solidPercent: totalCells === 0 ? 0 : solidCells / totalCells,
    waterCells,
    mixedTileCount: countMixedTiles(world),
    doorCount: world.doors.length,
    doorTriggerCellCount: triggerCells.size,
    doorsWithSolidDestination,
    doorsOnSolidTriggerCells,
    solidDoorTriggerCells: solidTriggerCells.size
  };
}

export function countMixedTiles(world: CollisionAuditInput): number {
  const { collision } = world;
  const cellsPerTile = Math.max(1, Math.round(world.tileSize / collision.cellSize));
  const tileColumns = Math.ceil(collision.width / cellsPerTile);
  const tileRows = Math.ceil(collision.height / cellsPerTile);
  let mixed = 0;

  for (let tileY = 0; tileY < tileRows; tileY += 1) {
    for (let tileX = 0; tileX < tileColumns; tileX += 1) {
      let hasSolid = false;
      let hasOpen = false;
      const startX = tileX * cellsPerTile;
      const startY = tileY * cellsPerTile;
      const endX = Math.min(startX + cellsPerTile, collision.width);
      const endY = Math.min(startY + cellsPerTile, collision.height);

      for (let cellY = startY; cellY < endY; cellY += 1) {
        for (let cellX = startX; cellX < endX; cellX += 1) {
          if (solidAtCell(collision.solidRows, cellX, cellY)) {
            hasSolid = true;
          } else {
            hasOpen = true;
          }
        }
      }

      if (hasSolid && hasOpen) {
        mixed += 1;
      }
    }
  }

  return mixed;
}

export function formatCollisionAudit(
  counts: CollisionAuditCounts,
  source = DEFAULT_WORLD_JSON,
  tileSize = 32
): string {
  return [
    `Collision audit: ${source}`,
    `total cells: ${formatCount(counts.totalCells)}`,
    `solid cells: ${formatCount(counts.solidCells)} (${(counts.solidPercent * 100).toFixed(2)}%)`,
    `water cells: ${formatCount(counts.waterCells)}`,
    `mixed ${tileSize}px tiles: ${formatCount(counts.mixedTileCount)}`,
    `doors: ${formatCount(counts.doorCount)}`,
    `door trigger cells: ${formatCount(counts.doorTriggerCellCount)}`,
    `doors with solid destinations: ${formatCount(counts.doorsWithSolidDestination)}`,
    `doors on solid trigger cells: ${formatCount(counts.doorsOnSolidTriggerCells)}`,
    `solid door trigger cells: ${formatCount(counts.solidDoorTriggerCells)}`
  ].join("\n");
}

function readWorld(path: string): CollisionAuditInput {
  return JSON.parse(readFileSync(path, "utf8")) as CollisionAuditInput;
}

function cellKey(cellX: number, cellY: number): string {
  return `${cellX},${cellY}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? DEFAULT_WORLD_JSON;
  const absolute = resolve(source);
  const world = readWorld(absolute);
  const counts = auditCollisionWorld(world);
  console.log(formatCollisionAudit(counts, source, world.tileSize));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
