import { describe, expect, it } from "vitest";
import { createPlayerState, IDLE_INPUT, stepPlayer, type MoveInput } from "../src/playerController";
import {
  footBoxCornerCells,
  footBoxCornersClear,
  PLAYER_FOOT_BOX,
  resolveWalkableFootprintDestination,
  walkableFootprintClear
} from "../src/collisionFootprint";
import type { CollisionGrid } from "../src/collisionOverlay";

const GRID: CollisionGrid = { cellSize: 8, width: 12, height: 12 };

function rows(width: number, height: number, solidCells: Array<[number, number]>): string[] {
  const solid = new Set(solidCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => solid.has(`${x},${y}`) ? "1" : "0").join("")
  );
}

describe("walkable destination resolution", () => {
  it("snaps a solid destination to the nearest walkable footprint", () => {
    const solidRows = rows(GRID.width, GRID.height, [[4, 4]]);
    const destination = { x: 34, y: 35 };

    const resolved = resolveWalkableFootprintDestination(destination, solidRows, GRID, { maxRingCells: 4 });

    expect(resolved).not.toEqual(destination);
    expect(walkableFootprintClear(resolved, solidRows, GRID)).toBe(true);
  });

  it("leaves an already walkable destination unchanged", () => {
    const solidRows = rows(GRID.width, GRID.height, [[6, 6]]);
    const destination = { x: 34, y: 35 };

    expect(resolveWalkableFootprintDestination(destination, solidRows, GRID)).toEqual(destination);
  });

  it("falls back to the raw destination when no walkable footprint is inside the bound", () => {
    const solidRows = rows(GRID.width, GRID.height, Array.from({ length: GRID.width * GRID.height }, (_, index) => [
      index % GRID.width,
      Math.floor(index / GRID.width)
    ]));
    const destination = { x: 34, y: 35 };

    expect(resolveWalkableFootprintDestination(destination, solidRows, GRID, { maxRingCells: 2 })).toEqual(destination);
  });
});

describe("player foot box", () => {
  it("keeps the current narrow footprint dimensions documented", () => {
    expect(PLAYER_FOOT_BOX).toEqual({ left: -7, right: 6, top: -10, bottom: -1 });
  });

  it("keeps foot-box corners off solid cells after attempted movement into a cliff", () => {
    const solidRows = rows(GRID.width, GRID.height, Array.from({ length: GRID.width }, (_, x) => [x, 6]));
    const state = createPlayerState(40, 48);

    for (let frame = 0; frame < 20; frame += 1) {
      stepPlayer(state, input({ down: true }), {
        deltaMs: 16,
        speed: 100,
        bounds: { minX: 0, maxX: 95, minY: 12, maxY: 95 },
        blocked: (x, y) => !footBoxCornersClear({ x, y }, solidRows, GRID)
      });
      expect(footBoxCornersClear(state, solidRows, GRID)).toBe(true);
      expect(footBoxCornerCells(state, GRID).some((cell) => solidRows[cell.cellY]?.[cell.cellX] === "1")).toBe(false);
    }
  });

  it("preserves passage through a 32px-wide gap", () => {
    const gapCells = new Set([4, 5, 6, 7]);
    const solidRows = rows(
      GRID.width,
      GRID.height,
      Array.from({ length: GRID.width }, (_, x) => [x, 6] as [number, number])
        .filter(([x]) => !gapCells.has(x))
    );
    const state = createPlayerState(44, 44);

    for (let frame = 0; frame < 40; frame += 1) {
      stepPlayer(state, input({ down: true }), {
        deltaMs: 16,
        speed: 100,
        bounds: { minX: 0, maxX: 95, minY: 12, maxY: 95 },
        blocked: (x, y) => !footBoxCornersClear({ x, y }, solidRows, GRID)
      });
    }

    expect(state.y).toBeGreaterThan(56);
    expect(footBoxCornersClear(state, solidRows, GRID)).toBe(true);
  });
});

function input(partial: Partial<MoveInput>): MoveInput {
  return { ...IDLE_INPUT, ...partial };
}
