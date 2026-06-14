import type { WorldDoor } from "@eb/schemas";

export type DoorTriggerState = {
  suppressUntilClear: boolean;
};

export type DoorTriggerResult = {
  door?: WorldDoor;
  suppressUntilClear: boolean;
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

export function resolveDoorTrigger(
  feet: { x: number; y: number },
  doors: readonly WorldDoor[],
  state: DoorTriggerState,
  cellSize: number
): DoorTriggerResult {
  const currentDoor = doorAtFeet(feet, doors, cellSize);
  if (state.suppressUntilClear) {
    return { suppressUntilClear: Boolean(currentDoor) };
  }
  if (!currentDoor) {
    return { suppressUntilClear: false };
  }
  return { door: currentDoor, suppressUntilClear: true };
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
    return { suppressUntilClear: true };
  }

  const intendedDoor = doorAtFeet(intendedFeet, doors, cellSize);
  if (!intendedDoor) {
    return { suppressUntilClear: false };
  }
  if (sameDoorCell(currentFeet, intendedFeet, cellSize) || currentDoor) {
    return { suppressUntilClear: Boolean(currentDoor) };
  }
  return { door: intendedDoor, suppressUntilClear: true };
}

function sameDoorCell(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cellSize: number
): boolean {
  return Math.floor(a.x / cellSize) === Math.floor(b.x / cellSize)
    && Math.floor(a.y / cellSize) === Math.floor(b.y / cellSize);
}
