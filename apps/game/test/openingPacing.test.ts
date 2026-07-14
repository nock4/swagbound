import { describe, expect, it } from "vitest";
import {
  clampOpeningFlyoverPoint,
  OPENING_ERA_TITLE_FADE_MS,
  OPENING_ERA_TITLE_HOLD_MS,
  OPENING_FLYOVER_END_ZOOM,
  OPENING_FLYOVER_SHOTS,
  OPENING_FLYOVER_ZOOM,
  OPENING_FLYOVER_ZOOM_IN_MS,
  OPENING_GET_UP_WALK_MS,
  OPENING_KNOCK_DELAY_AFTER_WAKE_MS,
  OPENING_RUMBLE_AMPLITUDE,
  OPENING_RUMBLE_INTERVAL_MS,
  OPENING_WAKE_SIGNAL_FIRST_FLASH_MS,
  OPENING_WAKE_SIGNAL_SECOND_FLASH_MS,
  shouldRunOverworldRoamers
} from "../src/openingPacing";

describe("opening pacing timings", () => {
  it("clears the era card during the continuous flyover", () => {
    expect(OPENING_ERA_TITLE_HOLD_MS + OPENING_ERA_TITLE_FADE_MS)
      .toBeLessThan(OPENING_FLYOVER_SHOTS[0]!.duration);
    expect(OPENING_RUMBLE_INTERVAL_MS).toBe(3_000);
    expect(OPENING_RUMBLE_AMPLITUDE).toBe(0.0015);
  });

  it("uses one slow arcade-to-house move and ends with a zoom-in", () => {
    expect(OPENING_FLYOVER_SHOTS).toHaveLength(1);
    const shot = OPENING_FLYOVER_SHOTS[0]!;
    expect(shot.duration).toBeGreaterThanOrEqual(20_000);
    expect(shot.from.x).toBeLessThan(shot.to.x);
    expect(shot.from.y).toBeGreaterThan(shot.to.y);
    expect(Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y)).toBeGreaterThan(500);
    expect(OPENING_FLYOVER_END_ZOOM).toBeGreaterThan(OPENING_FLYOVER_ZOOM);
    expect(OPENING_FLYOVER_ZOOM_IN_MS).toBeLessThan(shot.duration);
    for (const point of [shot.from, shot.to]) {
      expect(clampOpeningFlyoverPoint(point)).toEqual(point);
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
