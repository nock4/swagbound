import { describe, expect, it } from "vitest";
import type { WindowCollection } from "@eb/schemas";
import {
  buildWindowFrameLayout,
  type WindowFrameLayout,
  type WindowFramePlacement,
  processWindowImageData
} from "../src/windowFrame";

const flavor: WindowCollection["flavors"][number] = {
  id: 0,
  file: "assets/window/0.png",
  corner: { x: 32, y: 0, w: 8, h: 8 },
  hEdge: { x: 40, y: 0, w: 8, h: 8 },
  vEdge: { x: 48, y: 0, w: 8, h: 8 },
  moreArrow: { x: 32, y: 8, w: 8, h: 8 },
  interiorColor: { r: 16, g: 16, b: 16 }
};

describe("window frame layout", () => {
  it("places mirrored corners and single stretched edges at scale 2", () => {
    const layout = buildWindowFrameLayout(64, 48, flavor, 2);

    expect(layout.interior).toEqual({ x: 16, y: 16, width: 32, height: 16 });
    expect(layout.corners).toMatchObject({
      topLeft: { part: "corner", x: 0, y: 0, flipX: false, flipY: false },
      topRight: { part: "corner", x: 48, y: 0, flipX: true, flipY: false },
      bottomLeft: { part: "corner", x: 0, y: 32, flipX: false, flipY: true },
      bottomRight: { part: "corner", x: 48, y: 32, flipX: true, flipY: true }
    });
    // Each side is one full edge tile stretched across the span between the
    // corners (no partial tiles -> no setCrop+setFlip notch artifacts).
    expect(layout.top.map((tile) => [tile.x, tile.y, tile.displayWidth, tile.sourceWidth, tile.flipY])).toEqual([
      [16, 0, 32, 8, false]
    ]);
    expect(layout.bottom.map((tile) => [tile.x, tile.y, tile.displayWidth, tile.sourceWidth, tile.flipY])).toEqual([
      [16, 32, 32, 8, true]
    ]);
    expect(layout.left.map((tile) => [tile.x, tile.y, tile.displayHeight, tile.sourceHeight, tile.flipX])).toEqual([
      [0, 16, 16, 8, false]
    ]);
    expect(layout.right.map((tile) => [tile.x, tile.y, tile.displayHeight, tile.sourceHeight, tile.flipX])).toEqual([
      [48, 16, 16, 8, true]
    ]);
    expect(allPlacements(layout).every((tile) => staysWithin(tile, 64, 48))).toBe(true);
  });

  it("stretches a single edge to fit non-multiple dimensions without overshoot", () => {
    const layout = buildWindowFrameLayout(58, 42, flavor, 2);

    expect(layout.top.map((tile) => [tile.x, tile.displayWidth, tile.sourceWidth])).toEqual([
      [16, 26, 8]
    ]);
    expect(layout.bottom.map((tile) => [tile.x, tile.y, tile.displayWidth, tile.sourceWidth, tile.flipY])).toEqual([
      [16, 26, 26, 8, true]
    ]);
    expect(layout.left.map((tile) => [tile.y, tile.displayHeight, tile.sourceHeight])).toEqual([
      [16, 10, 8]
    ]);
    expect(layout.right.map((tile) => [tile.x, tile.y, tile.displayHeight, tile.sourceHeight, tile.flipX])).toEqual([
      [42, 16, 10, 8, true]
    ]);
    expect(allPlacements(layout).every((tile) => staysWithin(tile, 58, 42))).toBe(true);
    expect(layout.bottom.every((tile) => tile.y + tile.displayHeight === 42)).toBe(true);
    expect(layout.right.every((tile) => tile.x + tile.displayWidth === 58)).toBe(true);
  });

  it("clamps edge spans for windows smaller than two corners", () => {
    const layout = buildWindowFrameLayout(20, 20, flavor, 2);

    expect(layout.top).toEqual([]);
    expect(layout.bottom).toEqual([]);
    expect(layout.left).toEqual([]);
    expect(layout.right).toEqual([]);
    expect(layout.corners.topRight.x).toBe(4);
    expect(layout.corners.bottomLeft.y).toBe(4);
    expect(allPlacements(layout).every((tile) => staysWithin(tile, 20, 20))).toBe(true);
  });

  it("clips corners too when a window is smaller than one corner", () => {
    const layout = buildWindowFrameLayout(10, 12, flavor, 2);

    expect(layout.corners.topLeft).toMatchObject({ x: 0, y: 0, displayWidth: 10, displayHeight: 12 });
    expect(layout.corners.bottomRight).toMatchObject({ x: 0, y: 0, displayWidth: 10, displayHeight: 12 });
    expect(allPlacements(layout).every((tile) => staysWithin(tile, 10, 12))).toBe(true);
  });
});

describe("window frame transparent keying", () => {
  it("keys only the configured transparent color and leaves other pixels unchanged", () => {
    const imageData = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        0, 224, 112, 255,
        16, 16, 16, 255,
        0, 224, 112, 255,
        250, 251, 252, 180
      ])
    } as ImageData;

    const result = processWindowImageData(imageData, { r: 0, g: 224, b: 112 });

    expect(result.transparentPixels).toBe(2);
    expect(result.opaquePixels).toBe(2);
    expect(Array.from(result.imageData.data)).toEqual([
      0, 224, 112, 0,
      16, 16, 16, 255,
      0, 224, 112, 0,
      250, 251, 252, 180
    ]);
    expect(result.verified).toBe(true);
  });
});

function allPlacements(layout: WindowFrameLayout): WindowFramePlacement[] {
  return [
    layout.corners.topLeft,
    layout.corners.topRight,
    layout.corners.bottomLeft,
    layout.corners.bottomRight,
    ...layout.top,
    ...layout.bottom,
    ...layout.left,
    ...layout.right
  ];
}

function staysWithin(tile: WindowFramePlacement, width: number, height: number): boolean {
  return tile.x >= 0 &&
    tile.y >= 0 &&
    tile.x + tile.displayWidth <= width &&
    tile.y + tile.displayHeight <= height;
}
