import { describe, expect, it } from "vitest";
import { createNpcState, stepNpc } from "./npcController";

const OPEN_BOUNDS = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

describe("NPC controller authored movement primitives", () => {
  it("keeps patrol movement inside its authored range and reverses at the edge", () => {
    const state = createNpcState(50, 50, "right", {
      kind: "patrol",
      axis: "x",
      rangePx: 10,
      speedPxPerSec: 10
    });

    stepNpc(state, {
      deltaMs: 1000,
      bounds: OPEN_BOUNDS,
      blocked: () => false
    });

    expect(state.player.x).toBe(60);
    expect(state.patrolDirection).toBe(-1);

    stepNpc(state, {
      deltaMs: 1000,
      bounds: OPEN_BOUNDS,
      blocked: () => false
    });

    expect(state.player.x).toBe(50);
  });

  it("turns stationary look-around NPCs without translating them", () => {
    const state = createNpcState(40, 40, "down", {
      kind: "lookAround",
      periodMs: 500,
      seed: 0
    });

    stepNpc(state, {
      deltaMs: 500,
      bounds: OPEN_BOUNDS,
      blocked: () => false
    });

    expect(state.player.x).toBe(40);
    expect(state.player.y).toBe(40);
    expect(state.player.moving).toBe(false);
    expect(state.player.facing).toBe("right");
  });
});
