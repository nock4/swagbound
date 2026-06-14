import { describe, expect, it } from "vitest";
import { auditCollisionWorld, countMixedTiles, type CollisionAuditInput } from "../../../scripts/collision-audit";

const fixture: CollisionAuditInput = {
  tileSize: 32,
  collision: {
    cellSize: 8,
    width: 8,
    height: 4,
    solidRows: [
      "10001111",
      "00001111",
      "00001111",
      "00001111"
    ],
    surfaceRows: [
      "2000000000000000",
      "0000200000000000",
      "0000000000000000",
      "0000000000000000"
    ]
  },
  doors: [
    {
      worldPixel: { x: 0, y: 0 },
      destinationWorldPixel: { x: 32, y: 0 }
    },
    {
      worldPixel: { x: 8, y: 8 },
      destinationWorldPixel: { x: 8, y: 8 }
    },
    {
      worldPixel: { x: 0, y: 0 },
      destinationWorldPixel: { x: 16, y: 8 }
    }
  ]
};

describe("collision audit counters", () => {
  it("counts mixed 32px tiles from 8px sub-cell solidity", () => {
    expect(countMixedTiles(fixture)).toBe(1);
  });

  it("counts water, solid cells, door trigger cells, and suspicious doors", () => {
    expect(auditCollisionWorld(fixture)).toEqual({
      totalCells: 32,
      solidCells: 17,
      solidPercent: 17 / 32,
      waterCells: 2,
      mixedTileCount: 1,
      doorCount: 3,
      doorTriggerCellCount: 2,
      doorsWithSolidDestination: 1,
      doorsOnSolidTriggerCells: 2,
      solidDoorTriggerCells: 1
    });
  });
});
