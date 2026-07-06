import { describe, expect, it } from "vitest";
import type { Navmesh } from "@eb/schemas";
import {
  componentAtWorldPixel,
  componentBounds,
  decodeNavmesh,
  nearestComponentAt,
  nearestComponentIdAtWorldPixel,
  rectsForComponent
} from "./navmesh";

describe("navmesh queries", () => {
  it("decodes RLE rows and resolves component ids from world pixels", () => {
    const mesh = decodeNavmesh(syntheticMesh());

    expect(componentAtWorldPixel(mesh, { x: 0, y: 0 })).toBe(0);
    expect(componentAtWorldPixel(mesh, { x: 8, y: 0 })).toBe(1);
    expect(componentAtWorldPixel(mesh, { x: 23, y: 7 })).toBe(1);
    expect(componentAtWorldPixel(mesh, { x: 24, y: 8 })).toBe(2);
    expect(componentAtWorldPixel(mesh, { x: -1, y: 0 })).toBe(0);
    expect(componentAtWorldPixel(mesh, { x: 999, y: 0 })).toBe(0);
  });

  it("returns component bounds and rects in world pixels", () => {
    const mesh = decodeNavmesh(syntheticMesh());

    expect(componentBounds(mesh, 1)).toEqual({ x: 8, y: 0, w: 16, h: 16 });
    expect(componentBounds(mesh, 2)).toEqual({ x: 24, y: 8, w: 8, h: 8 });
    expect(componentBounds(mesh, 99)).toBeUndefined();
    expect(rectsForComponent(mesh, 1)).toEqual([
      { x: 8, y: 0, w: 16, h: 16 }
    ]);
  });

  it("snaps to the nearest component within a bounded cell radius", () => {
    const mesh = decodeNavmesh(syntheticMesh());

    expect(nearestComponentAt(mesh, { x: 0, y: 0 }, 0)).toBeUndefined();
    expect(nearestComponentAt(mesh, { x: 0, y: 0 }, 1)).toEqual({ componentId: 1, distanceCells: 1 });
    expect(nearestComponentAt(mesh, { x: 24, y: 16 }, 1)).toEqual({ componentId: 1, distanceCells: 1 });
    expect(nearestComponentIdAtWorldPixel(mesh, 0, 16, 1)).toBe(1);
    expect(nearestComponentIdAtWorldPixel(mesh, -100, 0, 1)).toBe(0);
  });
});

function syntheticMesh(): Navmesh {
  return {
    schema: "swagbound.navmesh.v1",
    cellSize: 8,
    width: 4,
    height: 3,
    rows: [
      [[0, 1], [1, 2], [0, 1]],
      [[0, 1], [1, 2], [2, 1]],
      [[0, 4]]
    ],
    components: {
      "1": { cells: 4, bounds: { x: 1, y: 0, w: 2, h: 2 } },
      "2": { cells: 1, bounds: { x: 3, y: 1, w: 1, h: 1 } }
    },
    rects: [
      { c: 1, x: 1, y: 0, w: 2, h: 2 },
      { c: 2, x: 3, y: 1, w: 1, h: 1 }
    ]
  };
}
