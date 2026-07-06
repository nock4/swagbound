import { describe, expect, it } from "vitest";
import type { Navmesh } from "@eb/schemas";
import { decodeNavmesh } from "./navmesh";
import { findMeshPath } from "./navmeshPath";

describe("navmesh pathfinding", () => {
  it("finds a straight corridor path and keeps snapped points inside the corridor", () => {
    const mesh = decodeNavmesh({
      schema: "swagbound.navmesh.v1",
      cellSize: 10,
      width: 3,
      height: 1,
      rows: [[[1, 3]]],
      components: {
        "1": { cells: 3, bounds: { x: 0, y: 0, w: 3, h: 1 } }
      },
      rects: [{ c: 1, x: 0, y: 0, w: 3, h: 1 }]
    });

    const path = findMeshPath(mesh, { x: 5, y: -5 }, { x: 25, y: 5 });

    expect(path).toEqual([
      { x: 5, y: 0 },
      { x: 25, y: 5 }
    ]);
    expect(path?.every((point) => point.y >= 0 && point.y <= 10)).toBe(true);
  });

  it("returns undefined for disconnected components", () => {
    const mesh = decodeNavmesh({
      schema: "swagbound.navmesh.v1",
      cellSize: 10,
      width: 3,
      height: 1,
      rows: [[[1, 1], [0, 1], [2, 1]]],
      components: {
        "1": { cells: 1, bounds: { x: 0, y: 0, w: 1, h: 1 } },
        "2": { cells: 1, bounds: { x: 2, y: 0, w: 1, h: 1 } }
      },
      rects: [
        { c: 1, x: 0, y: 0, w: 1, h: 1 },
        { c: 2, x: 2, y: 0, w: 1, h: 1 }
      ]
    });

    expect(findMeshPath(mesh, { x: 5, y: 5 }, { x: 25, y: 5 })).toBeUndefined();
  });

  it("routes through the corner in an L-shaped room", () => {
    const mesh = decodeNavmesh(lShapedMesh());

    const path = findMeshPath(mesh, { x: 5, y: 5 }, { x: 15, y: 15 });

    expect(path).toEqual([
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 15, y: 15 }
    ]);
    expect(path?.length).toBeGreaterThan(2);
  });
});

function lShapedMesh(): Navmesh {
  return {
    schema: "swagbound.navmesh.v1",
    cellSize: 10,
    width: 2,
    height: 2,
    rows: [
      [[1, 2]],
      [[0, 1], [1, 1]]
    ],
    components: {
      "1": { cells: 3, bounds: { x: 0, y: 0, w: 2, h: 2 } }
    },
    rects: [
      { c: 1, x: 0, y: 0, w: 1, h: 1 },
      { c: 1, x: 1, y: 0, w: 1, h: 1 },
      { c: 1, x: 1, y: 1, w: 1, h: 1 }
    ]
  };
}
