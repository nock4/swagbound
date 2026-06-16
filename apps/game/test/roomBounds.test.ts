import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS,
  DEFAULT_MAX_INTERIOR_WALKABLE_CELLS,
  resolveConnectedRoomBounds,
  roomMaskContainsCell
} from "../src/roomBounds";
import type { CollisionGrid } from "../src/collisionOverlay";

function rows(width: number, height: number, walkableCells: Array<[number, number]>): string[] {
  const walkable = new Set(walkableCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => walkable.has(`${x},${y}`) ? "0" : "1").join("")
  );
}

function surfaceRows(width: number, height: number, renderedSolidCells: Array<[number, number]>): string[] {
  const rendered = new Set(renderedSolidCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => rendered.has(`${x},${y}`) ? "80" : "00").join("")
  );
}

function rectCells(minX: number, minY: number, width: number, height: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let y = minY; y < minY + height; y += 1) {
    for (let x = minX; x < minX + width; x += 1) {
      cells.push([x, y]);
    }
  }
  return cells;
}

describe("connected room bounds", () => {
  it("returns a small room bounding box and classifies it as an interior", () => {
    const grid: CollisionGrid = { cellSize: 8, width: 16, height: 16 };
    const solidRows = rows(grid.width, grid.height, rectCells(4, 6, 5, 3));

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 5 * 8 + 1, y: 7 * 8 + 1 }, {
      wallMaskThicknessCells: 3
    });

    expect(bounds?.isInterior).toBe(true);
    expect(bounds?.walkableCells).toBe(15);
    expect(bounds?.walkableCellBounds).toMatchObject({
      minCellX: 4,
      maxCellX: 8,
      minCellY: 6,
      maxCellY: 8,
      widthCells: 5,
      heightCells: 3,
      areaCells: 15
    });
    expect(bounds && roomMaskContainsCell(bounds, 5, 7)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 4, 3)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 1, 1)).toBe(false);
    expect(bounds?.maskCellBounds).toMatchObject({
      minCellX: 1,
      maxCellX: 11,
      minCellY: 3,
      maxCellY: 11
    });
  });

  it("keeps a large open component classified as overworld", () => {
    const widthCells = DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS + 1;
    const grid: CollisionGrid = { cellSize: 8, width: widthCells, height: 1 };
    const solidRows = rows(grid.width, grid.height, rectCells(0, 0, widthCells, 1));

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 4, y: 4 });

    expect(bounds?.isInterior).toBe(false);
    expect(bounds?.walkableCells).toBe(DEFAULT_MAX_INTERIOR_WALKABLE_CELLS + 4097);
    expect(bounds?.walkableCellBounds.areaCells).toBe(DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS + 1);
    expect(bounds?.maskCellRanges).toEqual([]);
  });

  it("includes the current room's walls but excludes a neighboring room's floor and walls", () => {
    const grid: CollisionGrid = { cellSize: 8, width: 12, height: 14 };
    const solidRows = rows(grid.width, grid.height, [
      ...rectCells(3, 8, 4, 2),
      ...rectCells(3, 2, 4, 2)
    ]);
    const surfaces = surfaceRows(grid.width, grid.height, [
      ...rectCells(2, 1, 6, 4),
      ...rectCells(2, 7, 6, 4)
    ]);

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 3 * 8 + 1, y: 3 * 8 + 1 }, {
      wallMaskThicknessCells: 4,
      surfaceRows: surfaces
    });

    expect(bounds?.isInterior).toBe(true);
    expect(bounds?.walkableCells).toBe(8);
    expect(bounds?.walkableCellBounds).toMatchObject({
      minCellX: 3,
      maxCellX: 6,
      minCellY: 2,
      maxCellY: 3
    });
    expect(bounds && roomMaskContainsCell(bounds, 4, 3)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 4, 4)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 4, 8)).toBe(false);
    expect(bounds && roomMaskContainsCell(bounds, 4, 7)).toBe(false);
  });

  it("excludes a side-by-side neighboring room across solid void cells", () => {
    const grid: CollisionGrid = { cellSize: 8, width: 18, height: 10 };
    const solidRows = rows(grid.width, grid.height, [
      ...rectCells(2, 2, 4, 4),
      ...rectCells(9, 2, 4, 4)
    ]);
    const surfaces = surfaceRows(grid.width, grid.height, [
      ...rectCells(1, 1, 6, 6),
      ...rectCells(8, 1, 6, 6)
    ]);

    const bounds = resolveConnectedRoomBounds(solidRows, grid, { x: 3 * 8 + 1, y: 3 * 8 + 1 }, {
      wallMaskThicknessCells: 3,
      surfaceRows: surfaces
    });

    expect(bounds?.isInterior).toBe(true);
    expect(bounds?.walkableCells).toBe(16);
    expect(bounds && roomMaskContainsCell(bounds, 3, 3)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 1, 3)).toBe(true);
    expect(bounds && roomMaskContainsCell(bounds, 9, 3)).toBe(false);
    expect(bounds && roomMaskContainsCell(bounds, 8, 3)).toBe(false);
  });
});
