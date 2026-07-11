import { describe, expect, it } from "vitest";
import {
  EB_HP_METER_ROLL_TIERS,
  EB_NORMAL_MOVEMENT_SPEED_ID,
  EB_NORMAL_WALK_SPEED,
  hpMeterRollTierForDelta,
  movementSpeedById,
  pxPerFrameToPxPerSecond
} from "./ebTiming";

describe("EB timing constants", () => {
  it("converts ROM movement px/frame to px/second at NTSC 60 fps", () => {
    expect(pxPerFrameToPxPerSecond(1)).toBe(60);
    expect(movementSpeedById(EB_NORMAL_MOVEMENT_SPEED_ID)).toEqual(EB_NORMAL_WALK_SPEED);
    expect(EB_NORMAL_WALK_SPEED.cardinalPxPerSecond).toBe(60);
    expect(EB_NORMAL_WALK_SPEED.diagonalPxPerSecond).toBeCloseTo(42.4266, 4);
  });

  it("selects HP/PP roll tiers from delta magnitude", () => {
    expect(hpMeterRollTierForDelta(1)).toBe(EB_HP_METER_ROLL_TIERS[0]);
    expect(hpMeterRollTierForDelta(9)).toBe(EB_HP_METER_ROLL_TIERS[0]);
    expect(hpMeterRollTierForDelta(10)).toBe(EB_HP_METER_ROLL_TIERS[1]);
    expect(hpMeterRollTierForDelta(-99)).toBe(EB_HP_METER_ROLL_TIERS[1]);
    expect(hpMeterRollTierForDelta(100)).toBe(EB_HP_METER_ROLL_TIERS[2]);
  });
});
