import { describe, expect, it } from "vitest";
import { buildTileWorklist } from "../../../scripts/atlas/tile-worklist";

describe("tile worklist", () => {
  it("ranks unoverridden used tiles and reports coverage milestones", () => {
    const worklist = buildTileWorklist({
      overrideKeys: new Set(["1:7"]),
      tileAtlas: {
        tilesets: [
          {
            tileset: 1,
            atlasImage: "atlas/tiles/tileset-01.png",
            tiles: [
              {
                arrangement: 7,
                gx: 7,
                gy: 0,
                solidCells: 0,
                isForeground: false,
                paletteId: 2,
                usageCount: 50,
                overridden: false
              },
              {
                arrangement: 2,
                gx: 2,
                gy: 0,
                solidCells: 3,
                isForeground: true,
                paletteId: 1,
                usageCount: 30,
                overridden: false
              },
              {
                arrangement: 4,
                gx: 4,
                gy: 0,
                solidCells: 1,
                isForeground: false,
                paletteId: 1,
                usageCount: 20,
                overridden: false
              },
              {
                arrangement: 99,
                gx: 3,
                gy: 3,
                solidCells: 0,
                isForeground: false,
                paletteId: 0,
                usageCount: 0,
                overridden: false
              }
            ]
          },
          {
            tileset: 0,
            atlasImage: "atlas/tiles/tileset-00.png",
            tiles: [
              {
                arrangement: 9,
                gx: 9,
                gy: 0,
                solidCells: 2,
                isForeground: false,
                paletteId: 4,
                usageCount: 30,
                overridden: false
              }
            ]
          }
        ]
      }
    });

    expect(worklist.tiles.map((tile) => `${tile.tileset}:${tile.arrangement}`)).toEqual(["0:9", "1:2", "1:4"]);
    expect(worklist.tiles.map((tile) => tile.cumulativeCoverage)).toEqual([0.230769, 0.461538, 0.615385]);
    expect(worklist.summary).toMatchObject({
      totalTilePlacements: 130,
      totalUsedTiles: 4,
      overriddenUsedTiles: 1,
      worklistTiles: 3,
      worklistPlacements: 80,
      worklistCoverage: 0.615385,
      tilesToCover50Pct: 3,
      tilesToCover80Pct: null,
      tilesToCover95Pct: null
    });
  });
});
