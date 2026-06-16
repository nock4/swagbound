import { describe, expect, it } from "vitest";
import {
  CANONICAL_DIRECTION_FRAMES,
  createPlayerState,
  findInteractionTarget,
  IDLE_INPUT,
  lockPlayer,
  nearestInteractable,
  resolveFacing,
  stepPlayer,
  toFacing,
  unlockPlayer,
  WALK_FRAME_MS,
  type MoveInput,
  type PlayerState,
  type StepOptions
} from "../src/playerController";

const BOUNDS = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };

function options(overrides: Partial<StepOptions> = {}): StepOptions {
  return {
    deltaMs: 16,
    speed: 100,
    bounds: BOUNDS,
    blocked: () => false,
    ...overrides
  };
}

function input(partial: Partial<MoveInput>): MoveInput {
  return { ...IDLE_INPUT, ...partial };
}

function walk(state: PlayerState, keys: Partial<MoveInput>, ms: number, overrides: Partial<StepOptions> = {}): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    stepPlayer(state, input(keys), options(overrides));
  }
}

describe("canonical frame mapping", () => {
  it("matches the CoilSnake sprite-group pair order N, E, S, W", () => {
    expect(CANONICAL_DIRECTION_FRAMES).toEqual({
      up: [0, 1],
      right: [2, 3],
      down: [4, 5],
      left: [6, 7]
    });
  });
});

describe("walking facing + animation (moonwalk regression)", () => {
  const cases = [
    { keys: { right: true }, facing: "right", frames: [2, 3], axis: "x", sign: 1 },
    { keys: { left: true }, facing: "left", frames: [6, 7], axis: "x", sign: -1 },
    { keys: { down: true }, facing: "down", frames: [4, 5], axis: "y", sign: 1 },
    { keys: { up: true }, facing: "up", frames: [0, 1], axis: "y", sign: -1 }
  ] as const;

  for (const testCase of cases) {
    it(`moving ${testCase.facing} uses the ${testCase.facing}-facing frames and moves that way`, () => {
      const state = createPlayerState(500, 500);
      walk(state, testCase.keys, 96);
      expect(state.facing).toBe(testCase.facing);
      expect(state.moving).toBe(true);
      expect(state.animKey).toBe(`walk-${testCase.facing}`);
      expect(testCase.frames).toContain(state.animFrame);
      const moved = testCase.axis === "x" ? state.x - 500 : state.y - 500;
      expect(Math.sign(moved)).toBe(testCase.sign);
    });
  }

  it("alternates between the two walk frames over time", () => {
    const state = createPlayerState(500, 500);
    const seen = new Set<number>();
    for (let elapsed = 0; elapsed < WALK_FRAME_MS * 4; elapsed += 16) {
      stepPlayer(state, input({ right: true }), options());
      seen.add(state.animFrame);
    }
    expect([...seen].sort()).toEqual([2, 3]);
  });

  it("supports four-frame override walk loops", () => {
    const frames = {
      down: [0, 1, 2, 3],
      left: [4, 5, 6, 7],
      right: [8, 9, 10, 11],
      up: [12, 13, 14, 15]
    } as const;
    const state = createPlayerState(500, 500, "down", frames);

    stepPlayer(state, input({ down: true }), options({ deltaMs: 1, frames }));
    expect(state.animFrame).toBe(0);
    stepPlayer(state, input({ down: true }), options({ deltaMs: WALK_FRAME_MS - 1, frames }));
    expect(state.animFrame).toBe(1);
    stepPlayer(state, input({ down: true }), options({ deltaMs: WALK_FRAME_MS, frames }));
    expect(state.animFrame).toBe(2);
    stepPlayer(state, input({ down: true }), options({ deltaMs: WALK_FRAME_MS, frames }));
    expect(state.animFrame).toBe(3);
    stepPlayer(state, input({ down: true }), options({ deltaMs: WALK_FRAME_MS, frames }));
    expect(state.animFrame).toBe(0);
  });
});

describe("idle behavior", () => {
  it("keeps the last facing and its first frame after keys release", () => {
    const state = createPlayerState(500, 500);
    walk(state, { left: true }, 96);
    stepPlayer(state, IDLE_INPUT, options());
    expect(state.moving).toBe(false);
    expect(state.facing).toBe("left");
    expect(state.animKey).toBe("idle-left");
    expect(state.animFrame).toBe(6);
    expect(state.velocityX).toBe(0);
    expect(state.velocityY).toBe(0);
  });

  it("restarts the step cycle from the lead frame after idling", () => {
    const state = createPlayerState(500, 500);
    walk(state, { down: true }, WALK_FRAME_MS + 16);
    stepPlayer(state, IDLE_INPUT, options());
    stepPlayer(state, input({ down: true }), options());
    expect(state.animFrame).toBe(4);
  });
});

describe("diagonal facing rule", () => {
  it("keeps the current facing when it is still one of the held directions", () => {
    expect(resolveFacing("up", 1, -1)).toBe("up");
    expect(resolveFacing("right", 1, -1)).toBe("right");
    expect(resolveFacing("down", -1, 1)).toBe("down");
  });

  it("prefers the horizontal component when the current facing is not held", () => {
    expect(resolveFacing("down", 1, -1)).toBe("right");
    expect(resolveFacing("up", -1, 1)).toBe("left");
  });

  it("keeps facing stable for the whole diagonal hold", () => {
    const state = createPlayerState(500, 500);
    walk(state, { up: true }, 48);
    const facings = new Set<string>();
    for (let elapsed = 0; elapsed < 320; elapsed += 16) {
      stepPlayer(state, input({ up: true, right: true }), options());
      facings.add(state.facing);
    }
    expect([...facings]).toEqual(["up"]);
  });

  it("keeps the current facing when opposing keys cancel out", () => {
    const state = createPlayerState(500, 500);
    walk(state, { right: true }, 48);
    stepPlayer(state, input({ left: true, right: true }), options());
    expect(state.moving).toBe(false);
    expect(state.facing).toBe("right");
  });

  it("normalizes diagonal speed", () => {
    const straight = createPlayerState(500, 500);
    stepPlayer(straight, input({ right: true }), options({ deltaMs: 1000 }));
    const diagonal = createPlayerState(500, 500);
    stepPlayer(diagonal, input({ right: true, down: true }), options({ deltaMs: 1000 }));
    const straightDistance = straight.x - 500;
    const diagonalDistance = Math.hypot(diagonal.x - 500, diagonal.y - 500);
    expect(diagonalDistance).toBeCloseTo(straightDistance, 5);
  });
});

describe("collision and bounds", () => {
  it("slides along a wall instead of sticking", () => {
    const state = createPlayerState(500, 500);
    // Wall at x >= 504: horizontal motion blocked, vertical free.
    walk(state, { right: true, down: true }, 96, { blocked: (x) => x >= 504 });
    expect(state.x).toBeLessThan(504);
    expect(state.y).toBeGreaterThan(500);
  });

  it("clamps to the movement bounds", () => {
    const state = createPlayerState(2, 2);
    walk(state, { left: true, up: true }, 200);
    expect(state.x).toBeGreaterThanOrEqual(BOUNDS.minX);
    expect(state.y).toBeGreaterThanOrEqual(BOUNDS.minY);
  });
});

describe("input lock (dialogue)", () => {
  it("ignores held movement keys and freezes on the idle frame", () => {
    const state = createPlayerState(500, 500);
    walk(state, { right: true }, 96);
    lockPlayer(state);
    const before = { x: state.x, y: state.y };
    walk(state, { left: true }, 200);
    expect({ x: state.x, y: state.y }).toEqual(before);
    expect(state.moving).toBe(false);
    expect(state.animKey).toBe("idle-right");
    expect(state.animFrame).toBe(2);
  });

  it("resumes movement after unlock", () => {
    const state = createPlayerState(500, 500);
    lockPlayer(state);
    unlockPlayer(state);
    walk(state, { up: true }, 96);
    expect(state.moving).toBe(true);
    expect(state.y).toBeLessThan(500);
  });
});

describe("facing-aware interaction", () => {
  const npc = { id: 744, x: 514, y: 500, interactable: true };

  it("targets an NPC the player faces at adjacent distance", () => {
    const target = findInteractionTarget({ x: 500, y: 500, facing: "right" }, [npc]);
    expect(target?.candidate.id).toBe(744);
    expect(target?.forward).toBe(14);
    expect(target?.lateral).toBe(0);
  });

  it("rejects the same NPC when the player faces away", () => {
    expect(findInteractionTarget({ x: 500, y: 500, facing: "left" }, [npc])).toBeUndefined();
    expect(findInteractionTarget({ x: 500, y: 500, facing: "up" }, [npc])).toBeUndefined();
    expect(findInteractionTarget({ x: 500, y: 500, facing: "down" }, [npc])).toBeUndefined();
  });

  it("rejects NPCs beyond the interaction distance", () => {
    const far = { id: 1, x: 540, y: 500, interactable: true };
    expect(findInteractionTarget({ x: 500, y: 500, facing: "right" }, [far])).toBeUndefined();
  });

  it("rejects NPCs too far off the facing axis", () => {
    const offAxis = { id: 1, x: 510, y: 522, interactable: true };
    expect(findInteractionTarget({ x: 500, y: 500, facing: "right" }, [offAxis])).toBeUndefined();
  });

  it("supports vertical approaches from above and below", () => {
    const fromAbove = findInteractionTarget({ x: 500, y: 482, facing: "down" }, [{ id: 1, x: 500, y: 500, interactable: true }]);
    expect(fromAbove?.candidate.id).toBe(1);
    const fromBelow = findInteractionTarget({ x: 500, y: 510, facing: "up" }, [{ id: 1, x: 500, y: 500, interactable: true }]);
    expect(fromBelow?.candidate.id).toBe(1);
  });

  it("prefers the nearest NPC in front when several qualify", () => {
    const near = { id: 1, x: 512, y: 500, interactable: true };
    const farther = { id: 2, x: 524, y: 500, interactable: true };
    const target = findInteractionTarget({ x: 500, y: 500, facing: "right" }, [farther, near]);
    expect(target?.candidate.id).toBe(1);
  });

  it("ignores non-interactable candidates", () => {
    const scenery = { id: 9, x: 514, y: 500, interactable: false };
    expect(findInteractionTarget({ x: 500, y: 500, facing: "right" }, [scenery])).toBeUndefined();
    expect(nearestInteractable({ x: 500, y: 500 }, [scenery])).toBeUndefined();
  });

  it("reports radius proximity regardless of facing for prompt hints", () => {
    const behind = nearestInteractable({ x: 500, y: 500 }, [npc]);
    expect(behind?.candidate.id).toBe(744);
    expect(behind?.distance).toBe(14);
  });
});

describe("direction string normalization", () => {
  it("maps generated direction strings onto facings", () => {
    expect(toFacing("down")).toBe("down");
    expect(toFacing("Up")).toBe("up");
    expect(toFacing("WEST")).toBe("left");
    expect(toFacing("east")).toBe("right");
    expect(toFacing(undefined)).toBe("down");
    expect(toFacing("sideways", "left")).toBe("left");
  });
});
