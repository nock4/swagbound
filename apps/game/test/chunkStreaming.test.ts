import { describe, expect, it } from "vitest";
import {
  ACTIVE_CHUNK_RADIUS,
  RETAIN_CHUNK_RADIUS,
  chunkForWorldPixel,
  chunkKey,
  chunkKeysForWorldPixel,
  chunkRing,
  shouldDespawnForChunk,
  shouldRetainForChunk,
  shouldSpawnForChunk,
  type ChunkGrid
} from "../src/chunkStreaming";

const FULL_GRID: ChunkGrid = {
  mapWidthTiles: 256,
  mapHeightTiles: 320,
  tileSize: 32,
  chunkSizeTiles: 16
};

describe("chunk coordinate math", () => {
  it("maps world pixels to chunk coordinates and clamps map edges", () => {
    expect(chunkForWorldPixel({ x: 0, y: 0 }, FULL_GRID)).toEqual({ cx: 0, cy: 0 });
    expect(chunkForWorldPixel({ x: 511, y: 511 }, FULL_GRID)).toEqual({ cx: 0, cy: 0 });
    expect(chunkForWorldPixel({ x: 512, y: 512 }, FULL_GRID)).toEqual({ cx: 1, cy: 1 });
    expect(chunkForWorldPixel({ x: 9000, y: 12000 }, FULL_GRID)).toEqual({ cx: 15, cy: 19 });
    expect(chunkForWorldPixel({ x: -50, y: -1 }, FULL_GRID)).toEqual({ cx: 0, cy: 0 });
  });

  it("returns the 3x3 active neighborhood for an interior chunk", () => {
    const keys = [...chunkKeysForWorldPixel({ x: 5 * 512 + 8, y: 6 * 512 + 8 }, ACTIVE_CHUNK_RADIUS, FULL_GRID)].sort();

    expect(keys).toEqual([
      "4,5",
      "4,6",
      "4,7",
      "5,5",
      "5,6",
      "5,7",
      "6,5",
      "6,6",
      "6,7"
    ]);
  });

  it("clips neighborhoods at map edges", () => {
    expect(chunkRing({ cx: 0, cy: 0 }, ACTIVE_CHUNK_RADIUS, FULL_GRID).map(chunkKey).sort()).toEqual([
      "0,0",
      "0,1",
      "1,0",
      "1,1"
    ]);
    expect(chunkRing({ cx: 15, cy: 19 }, ACTIVE_CHUNK_RADIUS, FULL_GRID).map(chunkKey).sort()).toEqual([
      "14,18",
      "14,19",
      "15,18",
      "15,19"
    ]);
  });
});

describe("streaming spawn and despawn rings", () => {
  it("spawns only within the active 3x3 neighborhood", () => {
    const current = { cx: 8, cy: 10 };

    expect(shouldSpawnForChunk({ cx: 7, cy: 9 }, current)).toBe(true);
    expect(shouldSpawnForChunk({ cx: 9, cy: 11 }, current)).toBe(true);
    expect(shouldSpawnForChunk({ cx: 10, cy: 10 }, current)).toBe(false);
  });

  it("retains spawned entities through the 5x5 ring and despawns beyond it", () => {
    const current = { cx: 8, cy: 10 };

    expect(shouldRetainForChunk({ cx: 6, cy: 8 }, current)).toBe(true);
    expect(shouldRetainForChunk({ cx: 10, cy: 12 }, current)).toBe(true);
    expect(shouldDespawnForChunk({ cx: 10, cy: 12 }, current)).toBe(false);
    expect(shouldDespawnForChunk({ cx: 11, cy: 10 }, current)).toBe(true);
    expect(RETAIN_CHUNK_RADIUS).toBe(ACTIVE_CHUNK_RADIUS + 1);
  });
});
