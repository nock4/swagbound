import { describe, expect, it } from "vitest";
import {
  createNpcState,
  facingToward,
  stepNpc,
  type NpcBehavior,
  type NpcRuntimeState
} from "../src/npcController";
import type { DirectionFrames, Facing } from "../src/playerController";

const BOUNDS = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };
const FRAMES: DirectionFrames = {
  up: [10, 11],
  right: [20, 21],
  down: [30, 31],
  left: [40, 41]
};
const PATROL: NpcBehavior = { kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 };
const WANDER: NpcBehavior = { kind: "wander", radiusPx: 16, speedPxPerSec: 32, seed: 0, stepMs: 1000 };

function step(state: NpcRuntimeState, deltaMs = 150, blocked: (x: number, y: number) => boolean = () => false): void {
  stepNpc(state, { deltaMs, bounds: BOUNDS, blocked, frames: FRAMES });
}

function patrolState(facing: Facing = "right"): NpcRuntimeState {
  return createNpcState(50, 50, facing, PATROL, FRAMES);
}

describe("NPC patrol controller", () => {
  it("oscillates inside its patrol range, reverses at ends, animates, and faces travel direction", () => {
    const state = patrolState("right");
    const seenFrames = new Set<number>();
    const seenFacings = new Set<Facing>();
    let minX = state.player.x;
    let maxX = state.player.x;

    for (let i = 0; i < 16; i += 1) {
      step(state);
      seenFrames.add(state.player.animFrame);
      seenFacings.add(state.player.facing);
      minX = Math.min(minX, state.player.x);
      maxX = Math.max(maxX, state.player.x);
    }

    expect(minX).toBeGreaterThanOrEqual(26);
    expect(maxX).toBeLessThanOrEqual(74);
    expect(maxX).toBe(74);
    expect(state.patrolDirection).toBe(1);
    expect(seenFacings).toEqual(new Set<Facing>(["right", "left"]));
    expect(seenFrames).toEqual(new Set([20, 21, 40, 41]));
  });

  it("reverses when blocked mid-path", () => {
    const state = patrolState("right");

    step(state, 200, (x) => x > 55);

    expect(state.player.x).toBe(50);
    expect(state.patrolDirection).toBe(-1);

    step(state, 200);

    expect(state.player.x).toBeLessThan(50);
    expect(state.player.facing).toBe("left");
  });

  it("holds a paused patrol on its idle frame, then resumes after unpause", () => {
    const state = patrolState("right");
    step(state, 150);
    const pausedAt = { x: state.player.x, y: state.player.y, direction: state.patrolDirection };

    state.paused = true;
    step(state, 1000);

    expect({ x: state.player.x, y: state.player.y, direction: state.patrolDirection }).toEqual(pausedAt);
    expect(state.player.moving).toBe(false);
    expect(state.player.animKey).toBe("idle-right");
    expect(state.player.animFrame).toBe(20);

    state.paused = false;
    step(state, 150);

    expect(state.player.x).toBeGreaterThan(pausedAt.x);
    expect(state.player.animKey).toBe("walk-right");
  });
});

describe("NPC wander controller", () => {
  it("stays inside its home radius", () => {
    const state = createNpcState(50, 50, "up", { ...WANDER, stepMs: 200 }, FRAMES);
    let minX = state.player.x;
    let maxX = state.player.x;
    let minY = state.player.y;
    let maxY = state.player.y;

    for (let i = 0; i < 80; i += 1) {
      step(state, 100);
      minX = Math.min(minX, state.player.x);
      maxX = Math.max(maxX, state.player.x);
      minY = Math.min(minY, state.player.y);
      maxY = Math.max(maxY, state.player.y);
    }

    expect(minX).toBeGreaterThanOrEqual(34);
    expect(maxX).toBeLessThanOrEqual(66);
    expect(minY).toBeGreaterThanOrEqual(34);
    expect(maxY).toBeLessThanOrEqual(66);
  });

  it("holds a blocked wander facing until the step window elapses", () => {
    const state = createNpcState(50, 50, "up", WANDER, FRAMES);
    const blockedFacings: Facing[] = [];

    for (let i = 0; i < 9; i += 1) {
      step(state, 100, () => true);
      blockedFacings.push(state.player.facing);
    }

    expect(state.player.x).toBe(50);
    expect(state.player.y).toBe(50);
    expect(state.wanderStepIndex).toBe(0);
    expect(new Set(blockedFacings)).toEqual(new Set<Facing>(["up"]));

    step(state, 100, () => true);

    expect(state.player.facing).toBe("right");
    expect(state.wanderStepIndex).toBe(1);

    for (let i = 0; i < 9; i += 1) {
      step(state, 100, () => true);
      expect(state.player.facing).toBe("right");
    }

    step(state, 100, () => true);

    expect(state.player.facing).toBe("down");
    expect(state.wanderStepIndex).toBe(2);
  });

  it("changes unblocked wander direction only on the step timer cadence", () => {
    const state = createNpcState(50, 50, "down", { ...WANDER, stepMs: 400 }, FRAMES);

    step(state, 399);

    expect(state.player.facing).toBe("up");
    expect(state.wanderStepIndex).toBe(0);

    step(state, 1);

    expect(state.player.facing).toBe("right");
    expect(state.wanderStepIndex).toBe(1);
    expect(state.player.x).toBeGreaterThan(50);
    expect(state.player.y).toBeLessThan(50);

    step(state, 399);

    expect(state.player.facing).toBe("right");
    expect(state.wanderStepIndex).toBe(1);

    step(state, 1);

    expect(state.player.facing).toBe("down");
    expect(state.wanderStepIndex).toBe(2);
  });

  it("replays the same path for the same seed inputs", () => {
    const trace = (seed: number): Array<[number, number, Facing]> => {
      const state = createNpcState(50, 50, "down", { ...WANDER, seed, stepMs: 250 }, FRAMES);
      const points: Array<[number, number, Facing]> = [];
      for (let i = 0; i < 12; i += 1) {
        step(state, 125);
        points.push([state.player.x, state.player.y, state.player.facing]);
      }
      return points;
    };

    expect(trace(17)).toEqual(trace(17));
  });
});

describe("facingToward", () => {
  it("uses the dominant axis and prefers horizontal ties", () => {
    expect(facingToward(0, 0, 10, 4)).toBe("right");
    expect(facingToward(0, 0, -10, 4)).toBe("left");
    expect(facingToward(0, 0, 2, 9)).toBe("down");
    expect(facingToward(0, 0, 2, -9)).toBe("up");
    expect(facingToward(0, 0, -10, 10)).toBe("left");
    expect(facingToward(0, 0, 10, -10)).toBe("right");
  });
});
