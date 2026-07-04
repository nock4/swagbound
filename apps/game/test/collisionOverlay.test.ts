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

describe("surface flag predicates (docs/collision-semantics.md)", () => {
  it("decodes water vs deep water vs sunstroke (0x04 is a modifier on 0x08)", async () => {
    const m = await import("../src/collisionOverlay");
    expect(m.isWaterSurface(0x08)).toBe(true);
    expect(m.isDeepWaterSurface(0x08)).toBe(false);
    expect(m.isWaterSurface(0x0c)).toBe(true);
    expect(m.isDeepWaterSurface(0x0c)).toBe(true);
    expect(m.isSunstrokeSurface(0x04)).toBe(true);
    expect(m.isSunstrokeSurface(0x0c)).toBe(false); // deep water, not sunstroke
    expect(m.isWaterSurface(0x20)).toBe(false); // legacy wrong mask must stay dead
  });

  it("decodes walk-behind foreground flags", async () => {
    const m = await import("../src/collisionOverlay");
    expect(m.isFgUpperSurface(0x03)).toBe(true);
    expect(m.isFgUpperSurface(0x02)).toBe(true);
    expect(m.isFgUpperSurface(0x01)).toBe(false);
    expect(m.isFgLowerOnlySurface(0x01)).toBe(true);
    expect(m.isFgLowerOnlySurface(0x03)).toBe(false);
    expect(m.isFgLowerOnlySurface(0x09)).toBe(true); // water + lower-hide (Deep Darkness)
    expect(m.isFgUpperSurface(0x0f)).toBe(true); // swamp: deep water + whole-body hide
  });

  it("decodes ladder/stairs including the solid-cliff combination", async () => {
    const m = await import("../src/collisionOverlay");
    expect(m.isLadderSurface(0x10)).toBe(true);
    expect(m.isLadderSurface(0x90)).toBe(true);
    expect(m.isLadderSurface(0x80)).toBe(false);
  });
});
