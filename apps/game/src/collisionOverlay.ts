// EB minitile attribute masks, per docs/collision-semantics.md (the project-wide verdict).
// 0x20/0x40 are unused (zero cells map-wide); the old SURFACE_WATER_MASK=0x20 matched nothing.
export const SURFACE_SOLID_MASK = 0x80;
export const SURFACE_LADDER_MASK = 0x10;
export const SURFACE_WATER_MASK = 0x08;
export const SURFACE_SUNSTROKE_MASK = 0x04;
export const SURFACE_FG_UPPER_MASK = 0x02;
export const SURFACE_FG_LOWER_MASK = 0x01;

export function isWaterSurface(surfaceByte: number): boolean {
  return (surfaceByte & SURFACE_WATER_MASK) !== 0;
}

/** Deep water = water + the 0x04 modifier (0x04 alone is sunstroke instead). */
export function isDeepWaterSurface(surfaceByte: number): boolean {
  return (surfaceByte & (SURFACE_WATER_MASK | SURFACE_SUNSTROKE_MASK)) === (SURFACE_WATER_MASK | SURFACE_SUNSTROKE_MASK);
}

export function isSunstrokeSurface(surfaceByte: number): boolean {
  return (surfaceByte & (SURFACE_WATER_MASK | SURFACE_SUNSTROKE_MASK)) === SURFACE_SUNSTROKE_MASK;
}

export function isLadderSurface(surfaceByte: number): boolean {
  return (surfaceByte & SURFACE_LADDER_MASK) !== 0;
}

/** Standing here, the whole/upper body draws behind foreground map art (tree canopy, upper wall). */
export function isFgUpperSurface(surfaceByte: number): boolean {
  return (surfaceByte & SURFACE_FG_UPPER_MASK) !== 0;
}

/** Standing here, only the lower body is obscured (tall grass, shrub tops, roof crests). */
export function isFgLowerOnlySurface(surfaceByte: number): boolean {
  return (surfaceByte & (SURFACE_FG_UPPER_MASK | SURFACE_FG_LOWER_MASK)) === SURFACE_FG_LOWER_MASK;
}

export type CollisionGrid = {
  cellSize: number;
  width: number;
  height: number;
};

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CollisionCellRange = {
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
};

export type CollisionOverlayCell = {
  cellX: number;
  cellY: number;
  x: number;
  y: number;
  size: number;
};

export function visibleCollisionCellRange(
  rect: WorldRect,
  grid: CollisionGrid,
  paddingCells = 1
): CollisionCellRange | undefined {
  if (
    grid.cellSize <= 0 ||
    grid.width <= 0 ||
    grid.height <= 0 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    return undefined;
  }

  const padding = Math.max(0, Math.floor(paddingCells));
  const rawMinCellX = Math.floor(rect.x / grid.cellSize) - padding;
  const rawMinCellY = Math.floor(rect.y / grid.cellSize) - padding;
  const rawMaxCellX = Math.ceil((rect.x + rect.width) / grid.cellSize) - 1 + padding;
  const rawMaxCellY = Math.ceil((rect.y + rect.height) / grid.cellSize) - 1 + padding;

  if (
    rawMaxCellX < 0 ||
    rawMaxCellY < 0 ||
    rawMinCellX >= grid.width ||
    rawMinCellY >= grid.height
  ) {
    return undefined;
  }

  return {
    minCellX: clamp(rawMinCellX, 0, grid.width - 1),
    maxCellX: clamp(rawMaxCellX, 0, grid.width - 1),
    minCellY: clamp(rawMinCellY, 0, grid.height - 1),
    maxCellY: clamp(rawMaxCellY, 0, grid.height - 1)
  };
}

export function worldPixelToCollisionCell(
  point: { x: number; y: number },
  cellSize: number
): { cellX: number; cellY: number } | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || cellSize <= 0) {
    return undefined;
  }
  return {
    cellX: Math.floor(point.x / cellSize),
    cellY: Math.floor(point.y / cellSize)
  };
}

export function cellInRange(
  cell: { cellX: number; cellY: number },
  range: CollisionCellRange
): boolean {
  return (
    cell.cellX >= range.minCellX &&
    cell.cellX <= range.maxCellX &&
    cell.cellY >= range.minCellY &&
    cell.cellY <= range.maxCellY
  );
}

export function pointInRect(point: { x: number; y: number }, rect: WorldRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function solidAtCell(
  solidRows: readonly string[],
  cellX: number,
  cellY: number
): boolean {
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY) || cellX < 0 || cellY < 0) {
    return false;
  }
  return solidRows[cellY]?.[cellX] === "1";
}

export function solidAtWorldPixel(
  solidRows: readonly string[],
  point: { x: number; y: number },
  grid: CollisionGrid
): boolean {
  const cell = worldPixelToCollisionCell(point, grid.cellSize);
  if (!cell || cell.cellX < 0 || cell.cellY < 0 || cell.cellX >= grid.width || cell.cellY >= grid.height) {
    return false;
  }
  return solidAtCell(solidRows, cell.cellX, cell.cellY);
}

export function collisionOverlaySolidCells(
  solidRows: readonly string[],
  grid: CollisionGrid,
  range: CollisionCellRange
): CollisionOverlayCell[] {
  const cells: CollisionOverlayCell[] = [];
  for (let cellY = range.minCellY; cellY <= range.maxCellY; cellY += 1) {
    for (let cellX = range.minCellX; cellX <= range.maxCellX; cellX += 1) {
      const x = cellX * grid.cellSize;
      const y = cellY * grid.cellSize;
      if (solidAtWorldPixel(solidRows, { x, y }, grid)) {
        cells.push({ cellX, cellY, x, y, size: grid.cellSize });
      }
    }
  }
  return cells;
}

export function surfaceAtCell(
  surfaceRows: readonly string[],
  cellX: number,
  cellY: number
): number {
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY) || cellX < 0 || cellY < 0) {
    return 0;
  }
  const encoded = surfaceRows[cellY]?.slice(cellX * 2, cellX * 2 + 2);
  if (!encoded || encoded.length !== 2) {
    return 0;
  }
  const value = Number.parseInt(encoded, 16);
  return Number.isFinite(value) ? value : 0;
}

export function surfaceAtWorldPixel(
  surfaceRows: readonly string[],
  point: { x: number; y: number },
  grid: CollisionGrid
): number {
  const cell = worldPixelToCollisionCell(point, grid.cellSize);
  if (!cell || cell.cellX < 0 || cell.cellY < 0 || cell.cellX >= grid.width || cell.cellY >= grid.height) {
    return 0;
  }
  return surfaceAtCell(surfaceRows, cell.cellX, cell.cellY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
