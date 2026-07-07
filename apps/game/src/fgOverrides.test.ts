import { describe, expect, it } from "vitest";
import { fgClearsForChunk, fgClearTextureHash } from "./fgOverrides";

describe("foreground override helpers", () => {
  it("clips world-pixel clears to chunk-local rectangles", () => {
    const clears = fgClearsForChunk(
      [{ x: 500, y: 500, w: 40, h: 40, note: "crosses chunk edge" }],
      { cx: 1, cy: 1 },
      512
    );

    expect(clears).toEqual([
      { x: 0, y: 0, w: 28, h: 28, worldX: 512, worldY: 512, note: "crosses chunk edge" }
    ]);
  });

  it("omits non-intersecting clears and hashes applied rects deterministically", () => {
    const clears = fgClearsForChunk(
      [
        { x: 7600, y: 992, w: 16, h: 24, note: "plant" },
        { x: 100, y: 100, w: 16, h: 16, note: "elsewhere" }
      ],
      { cx: 14, cy: 1 },
      512
    );

    expect(clears).toEqual([
      { x: 432, y: 480, w: 16, h: 24, worldX: 7600, worldY: 992, note: "plant" }
    ]);
    expect(fgClearTextureHash(clears)).toBe(fgClearTextureHash([...clears]));
    expect(fgClearTextureHash(clears)).not.toBe(fgClearTextureHash([{ ...clears[0], h: 25 }]));
  });
});
