import { describe, expect, it } from "vitest";

import { SPRITE_WALK_BOB_AMPLITUDE_PX, spriteWalkBobOffset } from "./spriteOverrides";

describe("spriteWalkBobOffset", () => {
  it("returns 0 for an idle sprite", () => {
    expect(spriteWalkBobOffset({ clockMs: 1234, seed: 5, moving: false, frameCount: 1 })).toBe(0);
  });

  it("returns 0 for a multi-frame sprite (already animates via frame cycling)", () => {
    expect(spriteWalkBobOffset({ clockMs: 1234, seed: 5, moving: true, frameCount: 2 })).toBe(0);
  });

  it("hops between 0 and the amplitude for a moving single-frame sprite", () => {
    let max = 0;
    let min = Infinity;
    for (let t = 0; t < 2000; t += 5) {
      const v = spriteWalkBobOffset({ clockMs: t, seed: 0, moving: true, frameCount: 1 });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(SPRITE_WALK_BOB_AMPLITUDE_PX + 1e-9);
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    expect(max).toBeGreaterThan(SPRITE_WALK_BOB_AMPLITUDE_PX * 0.9); // reaches near the top of the hop
    expect(min).toBeLessThan(0.1); // and settles back to the baseline
  });

  it("desyncs sprites by seed so they do not bob in lockstep", () => {
    const a = spriteWalkBobOffset({ clockMs: 500, seed: 0, moving: true, frameCount: 1 });
    const b = spriteWalkBobOffset({ clockMs: 500, seed: 1, moving: true, frameCount: 1 });
    expect(Math.abs(a - b)).toBeGreaterThan(0.1);
  });
});
