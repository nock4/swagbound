import { describe, expect, it } from "vitest";
import {
  clampOpeningFlyoverPoint,
  OPENING_ERA_TITLE_FADE_MS,
  OPENING_ERA_TITLE_HOLD_MS,
  OPENING_FLYOVER_SHOTS,
  OPENING_GET_UP_WALK_MS,
  OPENING_KNOCK_DELAY_AFTER_WAKE_MS,
  OPENING_RUMBLE_AMPLITUDE,
  OPENING_RUMBLE_INTERVAL_MS,
  OPENING_SHOT_ZERO_HOLD_MS,
  OPENING_WAKE_SIGNAL_FIRST_FLASH_MS,
  OPENING_WAKE_SIGNAL_SECOND_FLASH_MS,
  shouldRunOverworldRoamers
} from "../src/openingPacing";

describe("opening pacing timings", () => {
  it("holds the night long enough for the era card to clear before the pan shots", () => {
    expect(OPENING_SHOT_ZERO_HOLD_MS).toBe(26_000);
    expect(OPENING_ERA_TITLE_HOLD_MS + OPENING_ERA_TITLE_FADE_MS).toBe(8_000);
    expect(OPENING_RUMBLE_INTERVAL_MS).toBe(6_000);
    expect(OPENING_RUMBLE_AMPLITUDE).toBe(0.0015);
  });

  it("keeps the flyover shots spread out, slow, and inside scenic bounds", () => {
    // Assert the INVARIANTS (three distinct slow shots, all points clamp-stable),
    // not exact coordinates, so scenic retunes don't break the suite while a pan
    // that drifts off-map still fails loudly.
    expect(OPENING_FLYOVER_SHOTS).toHaveLength(3);
    for (const shot of OPENING_FLYOVER_SHOTS) {
      expect(shot.duration).toBeGreaterThanOrEqual(9_000);
      for (const point of [shot.from, shot.to]) {
        expect(clampOpeningFlyoverPoint(point)).toEqual(point);
      }
    }
    // Distinct regions: shot midpoints are meaningfully far apart.
    const mids = OPENING_FLYOVER_SHOTS.map((s) => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }));
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) {
        const d = Math.hypot(mids[i].x - mids[j].x, mids[i].y - mids[j].y);
        expect(d).toBeGreaterThan(300);
      }
    }
  });

  it("keeps bedroom wake pacing without dropping the intro track", () => {
    expect(OPENING_WAKE_SIGNAL_FIRST_FLASH_MS).toBe(1_000);
    expect(OPENING_WAKE_SIGNAL_SECOND_FLASH_MS).toBe(1_750);
    expect(OPENING_KNOCK_DELAY_AFTER_WAKE_MS).toBe(2_600);
    expect(OPENING_GET_UP_WALK_MS).toBe(420);
  });

  it("gates roamers for fresh-opening intro hold only", () => {
    expect(shouldRunOverworldRoamers(true)).toBe(false);
    expect(shouldRunOverworldRoamers(false)).toBe(true);
  });
});
