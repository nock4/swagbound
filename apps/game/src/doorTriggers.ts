import type { WorldDoor } from "@eb/schemas";
import {
  PLAYER_FOOT_BOX,
  resolveWalkableFootprintDestination,
  walkableFootprintClear,
  type FootBox
} from "./collisionFootprint";
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

const DOOR_EVENT_FLAG_MASK = 0x7fff;

/**
 * EB conditional doors are runtime warp rows that stay active while their
 * associated event flag is clear, then retire when the flag is set. The 0x8000
 * encoding stores that rule directly (id = raw & 0x7FFF); the current plain
 * non-zero door flags use the same active-while-unset behavior for close/retire
 * gates such as FLG_ONET_DOOR_CLOSE, FLG_THRK_TUNNEL_CLOSE, and Bosch's front
 * door flag 474. With all flags clear, every generated door remains active.
 */
export function doorActiveForFlags(
  eventFlag: string | undefined,
  flags: { isSet(flag: number): boolean }
): boolean {
  const raw = eventFlag ? Number.parseInt(eventFlag, 16) : 0;
  if (!Number.isFinite(raw) || raw <= 0) {
    return true;
  }
  return !flags.isSet(raw & DOOR_EVENT_FLAG_MASK);
}

export type DoorWarpLanding = {
  point: { x: number; y: number };
  walkable: boolean;
};

export const MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX = 24;

export function isDistinctWarpTransition(
  door: Pick<WorldDoor, "worldPixel" | "destinationWorldPixel">,
  minWarpDistancePx = MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX
): boolean {
  const dx = door.destinationWorldPixel.x - door.worldPixel.x;
  const dy = door.destinationWorldPixel.y - door.worldPixel.y;
  return Math.hypot(dx, dy) >= minWarpDistancePx;
}

export function isMessageDoor(
  door: Pick<WorldDoor, "type" | "worldPixel" | "destinationWorldPixel" | "textPointer">,
  maxSelfWarpDistancePx = MESSAGE_DOOR_MAX_SELF_WARP_DISTANCE_PX
): boolean {
  if (door.type !== "door" || !door.textPointer?.trim()) {
    return false;
  }
  return !isDistinctWarpTransition(door, maxSelfWarpDistancePx);
}

export function messageDoorDialogueReference(
  door: Pick<WorldDoor, "type" | "worldPixel" | "destinationWorldPixel" | "textPointer">
): string | undefined {
  return isMessageDoor(door) ? door.textPointer?.trim() : undefined;
}

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
  options: {
    maxRingCells?: number;
    box?: FootBox;
    doors?: readonly Pick<WorldDoor, "worldPixel">[];
    maxAlignmentRingCells?: number;
    maxStraightWalkPx?: number;
  } = {}
): DoorWarpLanding {
  const initial = resolveWalkableFootprintDestination(destination, solidRows, grid, options);
  const point = options.doors?.length
    ? resolveStraightDoorApproachLanding(destination, initial, solidRows, grid, options)
    : initial;
  return {
    point,
    walkable: walkableFootprintClear(point, solidRows, grid, options.box)
  };
}

/**
 * Preserve an authored door destination when holding one cardinal direction can
 * reach a door. Otherwise, choose the nearest walkable arrival lane with that
 * property. This removes the common "land beside the return door and wedge on
 * the straight approach" trap without changing map collision.
 */
function resolveStraightDoorApproachLanding(
  destination: { x: number; y: number },
  initial: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  options: {
    box?: FootBox;
    doors?: readonly Pick<WorldDoor, "worldPixel">[];
    maxAlignmentRingCells?: number;
    maxStraightWalkPx?: number;
  }
): { x: number; y: number } {
  const doors = options.doors ?? [];
  const box = options.box ?? PLAYER_FOOT_BOX;
  const maxStraightWalkPx = Math.max(grid.cellSize, options.maxStraightWalkPx ?? 480);
  const doorCells = new Set(doors.map((door) => {
    const x = Math.floor(door.worldPixel.x / grid.cellSize);
    const y = Math.floor(door.worldPixel.y / grid.cellSize);
    return `${x},${y}`;
  }));
  const hasApproach = (point: { x: number; y: number }): boolean =>
    hasStraightCardinalDoorApproach(
      point,
      solidRows,
      grid,
      box,
      doorCells,
      maxStraightWalkPx
    );
  if (hasApproach(initial)) {
    return initial;
  }

  const originCellX = Math.floor(destination.x / grid.cellSize);
  const originCellY = Math.floor(destination.y / grid.cellSize);
  const offsetX = ((destination.x % grid.cellSize) + grid.cellSize) % grid.cellSize;
  const offsetY = ((destination.y % grid.cellSize) + grid.cellSize) % grid.cellSize;
  const maxRingCells = Math.max(0, Math.floor(options.maxAlignmentRingCells ?? 10));
  for (let ring = 1; ring <= maxRingCells; ring += 1) {
    let best: { x: number; y: number; distanceSq: number } | undefined;
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
          continue;
        }
        const candidate = {
          x: (originCellX + dx) * grid.cellSize + offsetX,
          y: (originCellY + dy) * grid.cellSize + offsetY
        };
        if (!walkableFootprintClear(candidate, solidRows, grid, box) || !hasApproach(candidate)) {
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
  return initial;
}

function hasStraightCardinalDoorApproach(
  start: { x: number; y: number },
  solidRows: readonly string[],
  grid: CollisionGrid,
  box: FootBox,
  doorCells: ReadonlySet<string>,
  maxStraightWalkPx: number
): boolean {
  const stepPx = 2;
  const directions = [
    { dx: 1 as const, dy: 0 as const },
    { dx: -1 as const, dy: 0 as const },
    { dx: 0 as const, dy: 1 as const },
    { dx: 0 as const, dy: -1 as const }
  ];
  for (const direction of directions) {
    let point = start;
    for (let walked = 0; walked <= maxStraightWalkPx; walked += stepPx) {
      const bounds = footprintCellBounds(point, grid.cellSize, box);
      const probes = direction.dx !== 0
        ? xProbeCells(bounds, direction.dx, 1)
        : yProbeCells(bounds, direction.dy, 1);
      if (probes.some((cell) => doorCells.has(`${cell.x},${cell.y}`))) {
        return true;
      }
      const next = { x: point.x + direction.dx * stepPx, y: point.y + direction.dy * stepPx };
      if (!walkableFootprintClear(next, solidRows, grid, box)) {
        break;
      }
      point = next;
    }
  }
  return false;
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
