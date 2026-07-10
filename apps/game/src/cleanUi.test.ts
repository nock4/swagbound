import { describe, expect, it } from "vitest";
import {
  battleCommandGridIndex,
  battleCommandGridPosition,
  cleanGridCells,
  cleanPanelInnerRect,
  formatCleanOdometerValue,
  moveBattleCommandGridIndex,
  statusBarFillFraction
} from "./cleanUi";

describe("battle command grid helpers", () => {
  it("maps indexes to 3-wide row and column positions", () => {
    expect(battleCommandGridPosition(0)).toEqual({ row: 0, col: 0 });
    expect(battleCommandGridPosition(2)).toEqual({ row: 0, col: 2 });
    expect(battleCommandGridPosition(5)).toEqual({ row: 1, col: 2 });
    expect(battleCommandGridPosition(6)).toEqual({ row: 2, col: 0 });
  });

  it("maps rows and columns back to indexes with row wrapping", () => {
    expect(battleCommandGridIndex(1, 2, 6)).toBe(5);
    expect(battleCommandGridIndex(0, -1, 6)).toBe(2);
    expect(battleCommandGridIndex(3, 0, 6)).toBe(3);
    expect(battleCommandGridIndex(1, 2, 5)).toBe(3);
  });

  it("wraps arrow navigation inside a 3-wide command grid", () => {
    expect(moveBattleCommandGridIndex(0, 6, "right")).toBe(1);
    expect(moveBattleCommandGridIndex(2, 6, "right")).toBe(0);
    expect(moveBattleCommandGridIndex(0, 6, "left")).toBe(2);
    expect(moveBattleCommandGridIndex(0, 6, "down")).toBe(3);
    expect(moveBattleCommandGridIndex(3, 6, "up")).toBe(0);
  });

  it("keeps vertical navigation in a real cell when the final row is short", () => {
    expect(moveBattleCommandGridIndex(2, 5, "down")).toBe(4);
    expect(moveBattleCommandGridIndex(4, 5, "up")).toBe(1);
    expect(moveBattleCommandGridIndex(4, 5, "right")).toBe(3);
  });

  it("wraps a 7-command grid through 3/3/1 rows without leaving real cells", () => {
    expect(battleCommandGridPosition(6)).toEqual({ row: 2, col: 0 });
    expect(battleCommandGridIndex(2, 0, 7)).toBe(6);
    expect(battleCommandGridIndex(2, 2, 7)).toBe(6);
    expect(moveBattleCommandGridIndex(5, 7, "down")).toBe(6);
    expect(moveBattleCommandGridIndex(6, 7, "right")).toBe(6);
    expect(moveBattleCommandGridIndex(6, 7, "left")).toBe(6);
    expect(moveBattleCommandGridIndex(6, 7, "down")).toBe(0);
    expect(moveBattleCommandGridIndex(6, 7, "up")).toBe(3);
  });
});

describe("clean panel geometry", () => {
  it("returns a padded inner content rect", () => {
    expect(cleanPanelInnerRect({ x: 10, y: 20, width: 100, height: 60 }, { x: 12, y: 8 })).toEqual({
      x: 22,
      y: 28,
      width: 76,
      height: 44
    });
  });

  it("never returns empty dimensions for tiny panels", () => {
    expect(cleanPanelInnerRect({ x: 0, y: 0, width: 5, height: 3 }, 8)).toEqual({
      x: 2,
      y: 1,
      width: 1,
      height: 1
    });
  });

  it("lays out stable grid cells inside content bounds", () => {
    expect(cleanGridCells({ x: 20, y: 10, width: 240, height: 64 }, 6, 3, 6, 8)).toEqual([
      { index: 0, row: 0, col: 0, x: 20, y: 10, width: 76, height: 28 },
      { index: 1, row: 0, col: 1, x: 102, y: 10, width: 76, height: 28 },
      { index: 2, row: 0, col: 2, x: 184, y: 10, width: 76, height: 28 },
      { index: 3, row: 1, col: 0, x: 20, y: 46, width: 76, height: 28 },
      { index: 4, row: 1, col: 1, x: 102, y: 46, width: 76, height: 28 },
      { index: 5, row: 1, col: 2, x: 184, y: 46, width: 76, height: 28 }
    ]);
  });

  it("fits a 7-command grid inside a 3-row content rect", () => {
    const content = { x: 12, y: 14, width: 270, height: 94 };
    const cells = cleanGridCells(content, 7, 3, 8, 8);
    expect(cells).toHaveLength(7);
    expect(cells[6]).toMatchObject({ index: 6, row: 2, col: 0 });
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(content.x);
      expect(cell.y).toBeGreaterThanOrEqual(content.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(content.x + content.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(content.y + content.height);
    }
  });
});

describe("status bar helper", () => {
  it("clamps fill fractions to the valid range", () => {
    expect(statusBarFillFraction(30, 100)).toBe(0.3);
    expect(statusBarFillFraction(130, 100)).toBe(1);
    expect(statusBarFillFraction(-5, 100)).toBe(0);
    expect(statusBarFillFraction(10, 0)).toBe(0);
  });
});

describe("odometer formatting", () => {
  it("pads and clamps HP/PP values to fixed digit columns", () => {
    expect(formatCleanOdometerValue(7)).toBe("007");
    expect(formatCleanOdometerValue(45)).toBe("045");
    expect(formatCleanOdometerValue(1234)).toBe("999");
    expect(formatCleanOdometerValue(Number.NaN)).toBe("000");
  });
});
