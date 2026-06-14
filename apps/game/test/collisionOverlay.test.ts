import { describe, expect, it } from "vitest";
import { visibleCollisionCellRange, type CollisionGrid } from "../src/collisionOverlay";

const GRID: CollisionGrid = {
  cellSize: 8,
  width: 10,
  height: 6
};

describe("collision overlay visible cell selection", () => {
  it("selects only cells touched by the camera rect plus padding", () => {
    expect(visibleCollisionCellRange({ x: 16, y: 8, width: 16, height: 8 }, GRID, 0)).toEqual({
      minCellX: 2,
      maxCellX: 3,
      minCellY: 1,
      maxCellY: 1
    });

    expect(visibleCollisionCellRange({ x: 16, y: 8, width: 16, height: 8 }, GRID, 1)).toEqual({
      minCellX: 1,
      maxCellX: 4,
      minCellY: 0,
      maxCellY: 2
    });
  });

  it("clips the selected range to the collision grid", () => {
    expect(visibleCollisionCellRange({ x: -10, y: -10, width: 16, height: 16 }, GRID, 0)).toEqual({
      minCellX: 0,
      maxCellX: 0,
      minCellY: 0,
      maxCellY: 0
    });

    expect(visibleCollisionCellRange({ x: 72, y: 32, width: 32, height: 32 }, GRID, 1)).toEqual({
      minCellX: 8,
      maxCellX: 9,
      minCellY: 3,
      maxCellY: 5
    });
  });

  it("returns undefined when the camera rect does not overlap the grid", () => {
    expect(visibleCollisionCellRange({ x: 80, y: 0, width: 8, height: 8 }, GRID, 0)).toBeUndefined();
    expect(visibleCollisionCellRange({ x: 0, y: 48, width: 8, height: 8 }, GRID, 0)).toBeUndefined();
  });
});
