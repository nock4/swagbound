import type { WorldDoor } from "@eb/schemas";
import { resolveWalkableFootprintDestination, walkableFootprintClear, type FootBox } from "./collisionFootprint";
import type { CollisionGrid } from "./collisionOverlay";

export type DoorTriggerState = {
  suppressUntilClear: boolean;
  suppressedDoorCell?: DoorCell;
};

export type DoorTriggerResult = {
  door?: WorldDoor;
  suppressUntilClear: boolean;
  suppressedDoorCell?: DoorCell;
};

export type DoorCell = { x: number; y: number };

export type DoorIntentDirection = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  preferredAxis?: "x" | "y";
};

export type DoorIntentProbeOptions = {
  footBox?: FootBox;
};

export type DoorWarpLanding = {
  point: { x: number; y: number };
  walkable: boolean;
};

export function feetInDoorCell(
  feet: { x: number; y: number },
  door: Pick<WorldDoor, "worldPixel">,
  cellSize: number
): boolean {
  return (
    Math.floor(feet.x / cellSize) === Math.floor(door.worldPixel.x / cellSize) &&
    Math.floor(feet.y / cellSize) === Math.floor(door.worldPixel.y / cellSize)
  );
}

export function doorAtFeet(
  feet: { x: number; y: number },
  doors: readonly WorldDoor[],
  cellSize: number
): WorldDoor | undefined {
  return doors.find((door) => feetInDoorCell(feet, door, cellSize));
}

export function resolveAdjacentDoorIntentTrigger(
  currentFeet: { x: number; y: number },
  movement: DoorIntentDirection,
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number,
  options: DoorIntentProbeOptions = {}
): DoorTriggerResult {
  const currentDoor = doorAtFeet(currentFeet, doors, cellSize);
  if (state.suppressUntilClear) {
    if (state.suppressedDoorCell) {
      const suppressedDoorCell = state.suppressedDoorCell;
      const stillInSuppressedCell = cellInBounds(
        suppressedDoorCell,
        footprintCellBounds(currentFeet, cellSize, options.footBox)
      );
      const stillPressingSuppressedCell = adjacentProbeCells(currentFeet, movement, cellSize, options)
        .some((cell) => sameCell(cell, suppressedDoorCell));
      return doorResult(stillInSuppressedCell || stillPressingSuppressedCell, undefined, suppressedDoorCell);
    }
    return { suppressUntilClear: Boolean(currentDoor) };
  }

  if (currentDoor) {
    return doorResult(true, undefined, doorCell(currentDoor, cellSize));
  }

  const adjacentDoor = adjacentProbeCells(currentFeet, movement, cellSize, options)
    .map((cell) => doorAtCell(cell, doors, cellSize))
    .find((door): door is WorldDoor => Boolean(door));
  if (!adjacentDoor) {
    return { suppressUntilClear: false };
  }
  return doorResult(true, adjacentDoor, doorCell(adjacentDoor, cellSize));
}

export function resolveDoorWarpLanding(
  destination: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  options: { maxRingCells?: number; box?: FootBox } = {}
): DoorWarpLanding {
  const point = resolveWalkableFootprintDestination(destination, solidRows, grid, options);
  return {
    point,
    walkable: walkableFootprintClear(point, solidRows, grid, options.box)
  };
}

export function resolveDoorIntentTrigger(
  currentFeet: { x: number; y: number },
  intendedFeet: { x: number; y: number },
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number
): DoorTriggerResult {
  const currentDoor = doorAtFeet(currentFeet, doors, cellSize);
  if (state.suppressUntilClear && currentDoor) {
    return doorResult(true, undefined, state.suppressedDoorCell ?? doorCell(currentDoor, cellSize));
  }
  if (currentDoor) {
    return doorResult(true, undefined, doorCell(currentDoor, cellSize));
  }

  const intendedDoor = doorAtFeet(intendedFeet, doors, cellSize);
  if (!intendedDoor) {
    return { suppressUntilClear: false };
  }
  if (sameDoorCell(currentFeet, intendedFeet, cellSize)) {
    return { suppressUntilClear: false };
  }
  return doorResult(true, intendedDoor, doorCell(intendedDoor, cellSize));
}

function sameDoorCell(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cellSize: number
): boolean {
  return Math.floor(a.x / cellSize) === Math.floor(b.x / cellSize)
    && Math.floor(a.y / cellSize) === Math.floor(b.y / cellSize);
}

function adjacentProbeCells(
  feet: { x: number; y: number },
  movement: DoorIntentDirection,
  cellSize: number,
  options: DoorIntentProbeOptions = {}
): DoorCell[] {
  if (movement.dx === 0 && movement.dy === 0) {
    return [];
  }

  const bounds = footprintCellBounds(feet, cellSize, options.footBox);
  // One cell past the foot box's leading edge (probes start at distance 0, see the
  // probe loops). Intentionally tight so the warp fires at the door, not ~3 cells early.
  const probeCells = 1;
  if (movement.dx !== 0 && movement.dy === 0) {
    return uniqueCells(xProbeCells(bounds, movement.dx, probeCells));
  }
  if (movement.dy !== 0 && movement.dx === 0) {
    return uniqueCells(yProbeCells(bounds, movement.dy, probeCells));
  }

  const diagonalDx = movement.dx;
  const diagonalDy = movement.dy;
  if (diagonalDx === 0 || diagonalDy === 0) {
    return [];
  }
  const xCells = xProbeCells(bounds, diagonalDx, probeCells);
  const yCells = yProbeCells(bounds, diagonalDy, probeCells);
  const diagonalCells = diagonalProbeCells(bounds, movement, probeCells);
  return uniqueCells(movement.preferredAxis === "y"
    ? [...yCells, ...xCells, ...diagonalCells]
    : [...xCells, ...yCells, ...diagonalCells]);
}

function doorAtCell(cell: DoorCell, doors: readonly WorldDoor[], cellSize: number): WorldDoor | undefined {
  return doors.find((door) => sameCell(doorCell(door, cellSize), cell));
}

type CellBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function footprintCellBounds(
  feet: { x: number; y: number },
  cellSize: number,
  footBox?: FootBox
): CellBounds {
  if (!footBox) {
    const current = feetCell(feet, cellSize);
    return { minX: current.x, maxX: current.x, minY: current.y, maxY: current.y };
  }
  return {
    minX: Math.floor((feet.x + footBox.left) / cellSize),
    maxX: Math.floor((feet.x + footBox.right) / cellSize),
    minY: Math.floor((feet.y + footBox.top) / cellSize),
    maxY: Math.floor((feet.y + footBox.bottom) / cellSize)
  };
}

// Probes start at distance 0 — the foot box's leading edge cell. A door mounted
// on a solid wall sits exactly at that edge when the player presses against it,
// so distance 0 catches it on contact; distance 1 gives a single cell of lead.
function xProbeCells(bounds: CellBounds, dx: -1 | 1, maxDistanceCells: number): DoorCell[] {
  const cells: DoorCell[] = [];
  for (let distance = 0; distance <= maxDistanceCells; distance += 1) {
    const x = dx > 0 ? bounds.maxX + distance : bounds.minX - distance;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function yProbeCells(bounds: CellBounds, dy: -1 | 1, maxDistanceCells: number): DoorCell[] {
  const cells: DoorCell[] = [];
  for (let distance = 0; distance <= maxDistanceCells; distance += 1) {
    const y = dy > 0 ? bounds.maxY + distance : bounds.minY - distance;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function diagonalProbeCells(
  bounds: CellBounds,
  movement: DoorIntentDirection,
  maxDistanceCells: number
): DoorCell[] {
  const cells: DoorCell[] = [];
  for (let distance = 1; distance <= maxDistanceCells; distance += 1) {
    const x = movement.dx > 0 ? bounds.maxX + distance : bounds.minX - distance;
    const y = movement.dy > 0 ? bounds.maxY + distance : bounds.minY - distance;
    cells.push({ x, y });
  }
  return cells;
}

function uniqueCells(cells: DoorCell[]): DoorCell[] {
  const seen = new Set<string>();
  const unique: DoorCell[] = [];
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(cell);
  }
  return unique;
}

function cellInBounds(cell: DoorCell, bounds: CellBounds): boolean {
  return cell.x >= bounds.minX && cell.x <= bounds.maxX && cell.y >= bounds.minY && cell.y <= bounds.maxY;
}

function feetCell(feet: { x: number; y: number }, cellSize: number): DoorCell {
  return {
    x: Math.floor(feet.x / cellSize),
    y: Math.floor(feet.y / cellSize)
  };
}

function doorCell(door: Pick<WorldDoor, "worldPixel">, cellSize: number): DoorCell {
  return {
    x: Math.floor(door.worldPixel.x / cellSize),
    y: Math.floor(door.worldPixel.y / cellSize)
  };
}

function sameCell(a: DoorCell, b: DoorCell): boolean {
  return a.x === b.x && a.y === b.y;
}

function doorResult(
  suppressUntilClear: boolean,
  door?: WorldDoor,
  suppressedDoorCell?: DoorCell
): DoorTriggerResult {
  const result: DoorTriggerResult = { suppressUntilClear };
  if (door) {
    result.door = door;
  }
  if (suppressUntilClear && suppressedDoorCell) {
    result.suppressedDoorCell = suppressedDoorCell;
  }
  return result;
}
