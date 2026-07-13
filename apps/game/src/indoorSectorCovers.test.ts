import { describe, expect, it } from "vitest";
import { indoorSectorCoverRectsForChunk, type IndoorSectorCoverMetadata } from "./indoorSectorCovers";

function sectors(indoor: number[], cols = 4, rows = 3): IndoorSectorCoverMetadata {
  return {
    cols,
    rows,
    sectorWidthTiles: 2,
    sectorHeightTiles: 1,
    tileSize: 16,
    indoor
  };
}

describe("indoorSectorCoverRectsForChunk", () => {
  it("returns clipped world rects for indoor sectors intersecting a chunk", () => {
    const metadata = sectors([
      0, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 16, y: 0, width: 48, height: 16 })).toEqual([
      { x: 32, y: 0, width: 32, height: 16 }
    ]);
  });

  it("merges horizontally-adjacent indoor sectors in the same row", () => {
    const metadata = sectors([
      0, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 0, y: 0, width: 128, height: 16 })).toEqual([
      { x: 32, y: 0, width: 96, height: 16 }
    ]);
  });

  it("does not merge indoor sectors across rows or outdoor gaps", () => {
    const metadata = sectors([
      1, 1, 0, 1,
      1, 1, 0, 1,
      0, 0, 0, 0
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 0, y: 0, width: 128, height: 32 })).toEqual([
      { x: 0, y: 0, width: 64, height: 16 },
      { x: 96, y: 0, width: 32, height: 16 },
      { x: 0, y: 16, width: 64, height: 16 },
      { x: 96, y: 16, width: 32, height: 16 }
    ]);
  });

  it("clips merged runs to partial chunk edges", () => {
    const metadata = sectors([
      1, 1, 1, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 16, y: 4, width: 72, height: 8 })).toEqual([
      { x: 16, y: 4, width: 72, height: 8 }
    ]);
  });

  it("treats exact sector boundaries as exclusive edges", () => {
    const metadata = sectors([
      1, 0, 1, 0,
      0, 0, 0, 0,
      0, 0, 0, 0
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 32, y: 0, width: 32, height: 16 })).toEqual([]);
    expect(indoorSectorCoverRectsForChunk(metadata, { x: 64, y: 0, width: 32, height: 16 })).toEqual([
      { x: 64, y: 0, width: 32, height: 16 }
    ]);
  });

  it("returns no rects for empty, out-of-map, or invalid inputs", () => {
    const metadata = sectors([
      1, 1, 1, 1,
      1, 1, 1, 1,
      1, 1, 1, 1
    ]);

    expect(indoorSectorCoverRectsForChunk(metadata, { x: 0, y: 0, width: 0, height: 16 })).toEqual([]);
    expect(indoorSectorCoverRectsForChunk(metadata, { x: 128, y: 0, width: 32, height: 16 })).toEqual([]);
    expect(indoorSectorCoverRectsForChunk(undefined, { x: 0, y: 0, width: 32, height: 16 })).toEqual([]);
  });
});
