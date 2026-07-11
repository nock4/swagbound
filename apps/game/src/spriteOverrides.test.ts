import { describe, expect, it } from "vitest";

import {
  SPRITE_WALK_BOB_AMPLITUDE_PX,
  SPRITE_WALK_STEP_INTERVAL_MS,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteWalkBobOffset
} from "./spriteOverrides";

describe("spriteWalkBobOffset", () => {
  it("returns 0 for an idle sprite", () => {
    expect(spriteWalkBobOffset({ clockMs: 1234, seed: 5, moving: false, frameCount: 1 })).toBe(0);
  });

  it("returns 0 for a multi-frame sprite (already animates via frame cycling)", () => {
    expect(spriteWalkBobOffset({ clockMs: 1234, seed: 5, moving: true, frameCount: 2 })).toBe(0);
  });

  it("hard-toggles between exactly 0 and the step raise (no intermediate values)", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 2000; t += 5) {
      seen.add(spriteWalkBobOffset({ clockMs: t, seed: 0, moving: true, frameCount: 1 }));
    }
    expect([...seen].sort()).toEqual([0, SPRITE_WALK_BOB_AMPLITUDE_PX]);
  });

  it("toggles at the EB walk cadence, not per-frame jitter", () => {
    let toggles = 0;
    let prev = spriteWalkBobOffset({ clockMs: 0, seed: 0, moving: true, frameCount: 1 });
    for (let t = 5; t < 2000; t += 5) {
      const v = spriteWalkBobOffset({ clockMs: t, seed: 0, moving: true, frameCount: 1 });
      if (v !== prev) {
        toggles += 1;
        prev = v;
      }
    }
    const expected = Math.floor(2000 / SPRITE_WALK_STEP_INTERVAL_MS);
    expect(Math.abs(toggles - expected)).toBeLessThanOrEqual(1);
  });

  it("desyncs sprites by seed so crowds do not step in unison", () => {
    // With a 61ms per-seed shift, seeds 0 and 1 disagree for part of every cycle.
    let disagreements = 0;
    for (let t = 0; t < 2000; t += 5) {
      const a = spriteWalkBobOffset({ clockMs: t, seed: 0, moving: true, frameCount: 1 });
      const b = spriteWalkBobOffset({ clockMs: t, seed: 1, moving: true, frameCount: 1 });
      if (a !== b) {
        disagreements += 1;
      }
    }
    expect(disagreements).toBeGreaterThan(50);
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
