import { describe, expect, it } from "vitest";

import {
  SPRITE_WALK_STEP_INTERVAL_MS,
  spriteOverrideCropRect,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteWalkMirror,
  spriteWalkStepPhase
} from "./spriteOverrides";

describe("spriteWalkStepPhase / spriteWalkMirror", () => {
  it("never mirrors an idle sprite", () => {
    expect(spriteWalkMirror({ clockMs: 1234, seed: 5, moving: false, frameCount: 1 })).toBe(false);
  });

  it("never mirrors a multi-frame sprite (already animates via frame cycling)", () => {
    expect(spriteWalkMirror({ clockMs: 1234, seed: 5, moving: true, frameCount: 2 })).toBe(false);
  });

  it("hard-swaps between exactly two states (EB step, no intermediate values)", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 2000; t += 5) {
      seen.add(spriteWalkStepPhase({ clockMs: t, seed: 0, moving: true, frameCount: 1 }));
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it("swaps at the EB walk cadence, not per-frame jitter", () => {
    let swaps = 0;
    let prev = spriteWalkStepPhase({ clockMs: 0, seed: 0, moving: true, frameCount: 1 });
    for (let t = 5; t < 2000; t += 5) {
      const v = spriteWalkStepPhase({ clockMs: t, seed: 0, moving: true, frameCount: 1 });
      if (v !== prev) {
        swaps += 1;
        prev = v;
      }
    }
    const expected = Math.floor(2000 / SPRITE_WALK_STEP_INTERVAL_MS);
    expect(Math.abs(swaps - expected)).toBeLessThanOrEqual(1);
  });

  it("desyncs sprites by seed so crowds do not step in unison", () => {
    // With a 61ms per-seed shift, seeds 0 and 1 disagree for part of every cycle.
    let disagreements = 0;
    for (let t = 0; t < 2000; t += 5) {
      const a = spriteWalkStepPhase({ clockMs: t, seed: 0, moving: true, frameCount: 1 });
      const b = spriteWalkStepPhase({ clockMs: t, seed: 1, moving: true, frameCount: 1 });
      if (a !== b) {
        disagreements += 1;
      }
    }
    expect(disagreements).toBeGreaterThan(50);
  });
});

describe("spriteOverrideCropRect", () => {
  it("selects one canonical frame from an overworld sheet used in battle", () => {
    expect(spriteOverrideCropRect(
      { frameWidth: 96, frameHeight: 96 },
      { width: 384, height: 384 }
    )).toEqual({ x: 0, y: 0, width: 96, height: 96 });
  });

  it("leaves ordinary single-image battle art uncropped", () => {
    expect(spriteOverrideCropRect(
      { frameWidth: 96, frameHeight: 96 },
      { width: 96, height: 96 }
    )).toBeUndefined();
  });
});

describe("spriteOverrideNpcSheetKey", () => {
  it("includes the image path hash so NPC override texture keys do not go stale", () => {
    const key = spriteOverrideNpcSheetKey(100300, "assets/swagbound/overworld-npc/archivist-ow.png");

    expect(key).toMatch(/^sprite-override-npc-100300-[0-9a-z]+$/);
    expect(spriteOverrideNpcIdFromSheetKey(key)).toBe(100300);
  });

  it("keeps parsing legacy un-hashed NPC override keys", () => {
    expect(spriteOverrideNpcIdFromSheetKey("sprite-override-npc-100300")).toBe(100300);
  });
});
