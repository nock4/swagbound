import { describe, expect, it } from "vitest";
import {
  collisionOverlaySolidCells,
  solidAtWorldPixel,
  visibleCollisionCellRange,
  type CollisionGrid
} from "../src/collisionOverlay";

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

  it("fills exactly the cells that solidAtWorldPixel reports as solid", () => {
    const solidRows = [
      "0100000000",
      "0010100000",
      "0000000000",
      "0001110000",
      "0000000010",
      "1000000000"
    ];
    const rect = { x: 12, y: 7, width: 38, height: 28 };
    const range = visibleCollisionCellRange(rect, GRID, 1);
    expect(range).toBeDefined();
    if (!range) {
      throw new Error("expected visible range");
    }

    const actual = collisionOverlaySolidCells(solidRows, GRID, range).map((cell) => `${cell.cellX},${cell.cellY}`);
    const expected: string[] = [];
    for (let cellY = range.minCellY; cellY <= range.maxCellY; cellY += 1) {
      for (let cellX = range.minCellX; cellX <= range.maxCellX; cellX += 1) {
        const x = cellX * GRID.cellSize;
        const y = cellY * GRID.cellSize;
        if (solidAtWorldPixel(solidRows, { x, y }, GRID)) {
          expected.push(`${cellX},${cellY}`);
        }
      }
    }

    expect(actual).toEqual(expected);
    expect(actual).toEqual(["1,0", "2,1", "4,1", "3,3", "4,3", "5,3", "0,5"]);
  });
});
