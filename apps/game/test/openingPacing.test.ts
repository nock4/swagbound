import { describe, expect, it } from "vitest";
import {
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

  it("keeps the flyover shots spread out and slow", () => {
    expect(OPENING_FLYOVER_SHOTS).toEqual([
      expect.objectContaining({ from: { x: 1600, y: 900 }, to: { x: 2200, y: 1150 }, duration: 9_000 }),
      expect.objectContaining({ from: { x: 2400, y: 1750 }, to: { x: 3050, y: 2050 }, duration: 9_000 }),
      expect.objectContaining({ from: { x: 2900, y: 1300 }, to: { x: 2300, y: 1650 }, duration: 9_000 })
    ]);
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
