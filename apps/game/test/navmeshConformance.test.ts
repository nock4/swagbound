import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DrifellaSourceChecks, Navmesh, WorldArtifact } from "@eb/schemas";
import { componentAtWorldPixel, decodeNavmesh, nearestComponentAt, nearestComponentIdAtWorldPixel } from "../src/navmesh";
import { createNpcState, stepNpc } from "../src/npcController";
import type { DirectionFrames } from "../src/playerController";

const GENERATED_ROOT = new URL("../public/generated/", import.meta.url);
const FRAMES: DirectionFrames = {
  up: [10, 11],
  right: [20, 21],
  down: [30, 31],
  left: [40, 41]
};

describe("navmesh conformance", () => {
  it("keeps source-check attestations on standable navmesh components", () => {
    const mesh = decodeNavmesh(readGeneratedJson<Navmesh>("navmesh.json"));
    const checks = readGeneratedJson<DrifellaSourceChecks>("drifella-source-checks.json");
    const failures = checks.checks.filter((check) => !nearestComponentAt(mesh, check.placement.worldPixel, 2));

    expect(failures.map((check) => check.id)).toEqual([]);
  });

  it("does not grow the visible world NPC not-standable baseline", () => {
    const mesh = decodeNavmesh(readGeneratedJson<Navmesh>("navmesh.json"));
    const world = readGeneratedJson<WorldArtifact>("world.json");
    const npcs = "npcs" in world ? world.npcs : [];
    const failures = npcs.filter((npc) => npc.visible === true && !nearestComponentAt(mesh, npc.worldPixel, 2));

    // Baseline from the current generated full-world slice when this regression was added.
    expect(failures.length).toBeLessThanOrEqual(139);
  });
});

describe("navmesh wander containment", () => {
  it("keeps a wandering NPC inside its starting component", () => {
    const mesh = decodeNavmesh(twoCellRoomMesh());
    const homeComponentId = nearestComponentIdAtWorldPixel(mesh, 15, 5, 2);
    const state = createNpcState(
      15,
      5,
      "right",
      { kind: "wander", radiusPx: 100, speedPxPerSec: 40, seed: 1, stepMs: 100 },
      FRAMES
    );
    const blocked = (x: number, y: number): boolean =>
      componentAtWorldPixel(mesh, { x, y }) === 0 ||
      nearestComponentIdAtWorldPixel(mesh, x, y, 1) !== homeComponentId;

    for (let i = 0; i < 40; i += 1) {
      stepNpc(state, {
        deltaMs: 100,
        bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
        blocked,
        frames: FRAMES
      });
      expect(nearestComponentIdAtWorldPixel(mesh, state.player.x, state.player.y, 0)).toBe(homeComponentId);
      expect(state.player.x).toBeLessThanOrEqual(20);
    }
  });
});

function readGeneratedJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, GENERATED_ROOT), "utf8")) as T;
}

function twoCellRoomMesh(): Navmesh {
  return {
    schema: "swagbound.navmesh.v1",
    cellSize: 10,
    width: 3,
    height: 1,
    rows: [[[1, 2], [2, 1]]],
    components: {
      "1": { cells: 2, bounds: { x: 0, y: 0, w: 2, h: 1 } },
      "2": { cells: 1, bounds: { x: 2, y: 0, w: 1, h: 1 } }
    },
    rects: [
      { c: 1, x: 0, y: 0, w: 2, h: 1 },
      { c: 2, x: 2, y: 0, w: 1, h: 1 }
    ]
  };
}
