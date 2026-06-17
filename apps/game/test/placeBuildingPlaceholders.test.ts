import { describe, expect, it } from "vitest";
import {
  choosePlaceholderPlacement,
  type PlaceholderPlacementInput
} from "../../../scripts/place-building-placeholders";
import type { CollisionGrid } from "../src/collisionOverlay";

const GRID: CollisionGrid = { cellSize: 8, width: 6, height: 5 };
const SECTORS: PlaceholderPlacementInput["sectors"] = {
  cols: 1,
  rows: 1,
  sectorWidthTiles: 6,
  sectorHeightTiles: 5,
  tileSize: 8,
  areaIds: [1],
  indoor: [1],
  bounded: [1]
};

function rows(width: number, height: number, solidCells: Array<[number, number]>): string[] {
  const solid = new Set(solidCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => solid.has(`${x},${y}`) ? "1" : "0").join("")
  );
}

describe("choosePlaceholderPlacement", () => {
  it("returns a walkable in-area non-landing cell and prefers solid-adjacent fixtures", () => {
    const solidRows = rows(GRID.width, GRID.height, [[4, 2]]);

    const placement = choosePlaceholderPlacement({
      solidRows,
      grid: GRID,
      sectors: SECTORS,
      sectorIndexes: [0],
      landings: [{
        worldPixel: { x: 8, y: 16 },
        direction: "right"
      }]
    });

    expect(placement).toMatchObject({
      cell: { cellX: 3, cellY: 2 },
      worldPixel: { x: 24, y: 16 },
      facing: "left",
      solidAdjacent: true
    });
    expect(placement && solidRows[placement.cell.cellY]?.[placement.cell.cellX]).toBe("0");
    expect(placement?.cell).not.toEqual({ cellX: 1, cellY: 2 });
  });

  it("returns undefined when the only walkable cell is the landing", () => {
    const solidRows = rows(
      GRID.width,
      GRID.height,
      Array.from({ length: GRID.width * GRID.height }, (_, index) => [
        index % GRID.width,
        Math.floor(index / GRID.width)
      ] as [number, number]).filter(([x, y]) => !(x === 1 && y === 2))
    );

    expect(choosePlaceholderPlacement({
      solidRows,
      grid: GRID,
      sectors: SECTORS,
      sectorIndexes: [0],
      landings: [{
        worldPixel: { x: 8, y: 16 },
        direction: "right"
      }]
    })).toBeUndefined();
  });
});
