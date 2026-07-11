import { describe, expect, it } from "vitest";
import { EB_HP_METER_ROLL_TIERS } from "../src/ebTiming";
import {
  createFixedRollingMeter,
  createRollingMeter,
  isDepleted,
  setTarget,
  survivesFatalBlowWindow,
  tick
} from "../src/rollingMeter";

describe("rolling HP meter", () => {
  it("rolls toward the target at a fixed rate and clamps at the target", () => {
    let meter = setTarget(createFixedRollingMeter(10, 10), 0);

    meter = tick(meter, 500);
    expect(meter.displayed).toBe(5);
    expect(meter.target).toBe(0);
    expect(meter.isRolling).toBe(true);

    meter = tick(meter, 1000);
    expect(meter.displayed).toBe(0);
    expect(meter.isRolling).toBe(false);
  });

  it("moves in integer odometer steps while accumulating partial time", () => {
    let meter = setTarget(createFixedRollingMeter(10, 4), 0);

    meter = tick(meter, 125);
    expect(meter.displayed).toBe(10);
    expect(meter.isRolling).toBe(true);

    meter = tick(meter, 125);
    expect(meter.displayed).toBe(9);

    meter = tick(meter, 250);
    expect(meter.displayed).toBe(8);
  });

  it("selects the EB HP/PP roll tier from the target delta magnitude", () => {
    const small = setTarget(createRollingMeter(10), 1);
    expect(small.ratePerSec).toBe(EB_HP_METER_ROLL_TIERS[0].digitsPerSecond);

    const medium = setTarget(createRollingMeter(100), 1);
    expect(medium.ratePerSec).toBe(EB_HP_METER_ROLL_TIERS[1].digitsPerSecond);

    const large = setTarget(createRollingMeter(120), 0);
    expect(large.ratePerSec).toBe(EB_HP_METER_ROLL_TIERS[2].digitsPerSecond);
  });

  it("keeps a character alive while fatal damage is only the target", () => {
    let meter = setTarget(createFixedRollingMeter(8, 4), 0);

    meter = tick(meter, 1000);
    expect(meter.displayed).toBe(4);
    expect(meter.target).toBe(0);
    expect(isDepleted(meter)).toBe(false);

    meter = setTarget(meter, 5);
    expect(meter.displayed).toBe(4);
    expect(meter.target).toBe(5);
    expect(isDepleted(meter)).toBe(false);
    expect(survivesFatalBlowWindow({
      initialDisplayed: 8,
      ratePerSec: 4,
      elapsedBeforeRescueMs: 1000,
      rescueTarget: 5
    })).toBe(true);
  });

  it("depletes only when the displayed value reaches zero", () => {
    let meter = setTarget(createFixedRollingMeter(3, 6), 0);

    meter = tick(meter, 499);
    expect(meter.displayed).toBe(1);
    expect(isDepleted(meter)).toBe(false);

    meter = tick(meter, 1);
    expect(meter.displayed).toBe(0);
    expect(meter.isRolling).toBe(false);
    expect(isDepleted(meter)).toBe(true);
  });
});
