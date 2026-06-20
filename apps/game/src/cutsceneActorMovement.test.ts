import { describe, expect, it } from "vitest";
import { advanceCutsceneActorTowardTarget } from "./cutsceneActorMovement";
import {
  CANONICAL_DIRECTION_FRAMES,
  createPlayerState
} from "./playerController";

describe("cutscene actor movement", () => {
  it("advances an actor toward the target over multiple frames instead of staying frozen", () => {
    const start = { x: 100, y: 100 };
    const target = { x: 80, y: 80 };
    const state = createPlayerState(start.x, start.y, "down", CANONICAL_DIRECTION_FRAMES);
    const options = {
      speed: 110,
      bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
      frames: CANONICAL_DIRECTION_FRAMES,
      arrivalPx: 2
    };

    let arrived = false;
    for (let frame = 0; frame < 4; frame += 1) {
      arrived = advanceCutsceneActorTowardTarget(state, target, {
        ...options,
        deltaMs: 16
      });
    }

    expect(arrived).toBe(false);
    expect(state.x).toBeLessThan(start.x);
    expect(state.y).toBeLessThan(start.y);
    expect(Math.hypot(target.x - state.x, target.y - state.y)).toBeLessThan(Math.hypot(target.x - start.x, target.y - start.y));
    expect(state.moving).toBe(true);
    expect(state.animKey.startsWith("walk-")).toBe(true);

    for (let frame = 0; frame < 60 && !arrived; frame += 1) {
      arrived = advanceCutsceneActorTowardTarget(state, target, {
        ...options,
        deltaMs: 16
      });
    }

    expect(arrived).toBe(true);
    expect(state.x).toBeCloseTo(target.x, 1);
    expect(state.y).toBeCloseTo(target.y, 1);
    expect(state.moving).toBe(false);
    expect(state.animKey.startsWith("idle-")).toBe(true);
  });
});
