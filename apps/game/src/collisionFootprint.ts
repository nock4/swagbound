import { worldPixelToCollisionCell, type CollisionGrid } from "./collisionOverlay";

export type FootBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/**
 * Narrow EB-style walking footprint, anchored to the actor's feet.
 * The 13x9 px span fits comfortably through 32px passages while keeping the
 * sprite body free to overhang ledges and walls.
 */
export const PLAYER_FOOT_BOX: FootBox = {
  left: -7,
  right: 6,
  top: -10,
  bottom: -1
};

export type FootBoxCorner = {
  x: number;
  y: number;
};

export type FootBoxCornerCell = {
  corner: FootBoxCorner;
  cellX: number;
  cellY: number;
};

export function footBoxCorners(
  feet: { x: number; y: number },
  box: FootBox = PLAYER_FOOT_BOX
): FootBoxCorner[] {
  return [
    { x: feet.x + box.left, y: feet.y + box.top },
    { x: feet.x + box.right, y: feet.y + box.top },
    { x: feet.x + box.left, y: feet.y + box.bottom },
    { x: feet.x + box.right, y: feet.y + box.bottom }
  ];
}

export function footBoxCornerCells(
  feet: { x: number; y: number },
  grid: CollisionGrid,
  box: FootBox = PLAYER_FOOT_BOX
): FootBoxCornerCell[] {
  return footBoxCorners(feet, box).map((corner) => ({
    corner,
    cellX: Math.floor(corner.x / grid.cellSize),
    cellY: Math.floor(corner.y / grid.cellSize)
  }));
}

export function footBoxCornersClear(
  feet: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  box: FootBox = PLAYER_FOOT_BOX
): boolean {
  if (!validGrid(grid) || !Number.isFinite(feet.x) || !Number.isFinite(feet.y)) {
    return false;
  }
  for (const cell of footBoxCornerCells(feet, grid, box)) {
    if (cellBlocked(cell.cellX, cell.cellY, solidRows, grid)) {
      return false;
    }
  }
  return true;
}

export function footCellClear(
  feet: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid
): boolean {
  const cell = worldPixelToCollisionCell(feet, grid.cellSize);
  if (!cell) {
    return false;
  }
  return !cellBlocked(cell.cellX, cell.cellY, solidRows, grid);
}

export function walkableFootprintClear(
  feet: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  box: FootBox = PLAYER_FOOT_BOX
): boolean {
  return footCellClear(feet, solidRows, grid) && footBoxCornersClear(feet, solidRows, grid, box);
}

export function resolveWalkableFootprintDestination(
  destination: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  options: { maxRingCells?: number; box?: FootBox } = {}
): { x: number; y: number } {
  const box = options.box ?? PLAYER_FOOT_BOX;
  if (walkableFootprintClear(destination, solidRows, grid, box)) {
    return destination;
  }

  const originCell = worldPixelToCollisionCell(destination, grid.cellSize);
  if (!originCell || !validGrid(grid)) {
    return destination;
  }

  const maxRingCells = Math.max(0, Math.floor(options.maxRingCells ?? 8));
  const offsetX = positiveModulo(destination.x, grid.cellSize);
  const offsetY = positiveModulo(destination.y, grid.cellSize);

  for (let ring = 1; ring <= maxRingCells; ring += 1) {
    let best: { x: number; y: number; distanceSq: number } | undefined;
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
          continue;
        }
        const candidate = {
          x: (originCell.cellX + dx) * grid.cellSize + offsetX,
          y: (originCell.cellY + dy) * grid.cellSize + offsetY
        };
        if (!walkableFootprintClear(candidate, solidRows, grid, box)) {
          continue;
        }
        const distanceSq = (candidate.x - destination.x) ** 2 + (candidate.y - destination.y) ** 2;
        if (!best || distanceSq < best.distanceSq) {
          best = { ...candidate, distanceSq };
        }
      }
    }
    if (best) {
      return { x: best.x, y: best.y };
    }
  }

  return destination;
}

function cellBlocked(
  cellX: number,
  cellY: number,
  solidRows: readonly string[],
  grid: CollisionGrid
): boolean {
  return (
    cellX < 0 ||
    cellY < 0 ||
    cellX >= grid.width ||
    cellY >= grid.height ||
    solidRows[cellY]?.[cellX] === "1"
  );
}

function validGrid(grid: CollisionGrid): boolean {
  return (
    Number.isFinite(grid.cellSize) &&
    Number.isInteger(grid.width) &&
    Number.isInteger(grid.height) &&
    grid.cellSize > 0 &&
    grid.width > 0 &&
    grid.height > 0
  );
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
