import type { EarlyGameSequence } from "@eb/schemas";
import { describe, expect, it } from "vitest";
import {
  openingAutosaveNoticeAllowed,
  openingEncountersAllowed,
  openingGatesActive,
  openingNightDoorLocked,
  openingNightTintRequired,
  openingNpcAllowed,
  openingRoamersAllowed,
  openingSourceChecksAllowed
} from "./openingGates";

type GateSequence = Pick<
  EarlyGameSequence,
  "nightCast" | "nightDoors" | "phaseGatesEnabled" | "sourceCheckAvailabilityPhase"
>;

const disabledSequence: GateSequence = {
  phaseGatesEnabled: false,
  sourceCheckAvailabilityPhase: "morning"
};

const enabledSequence: GateSequence = {
  phaseGatesEnabled: true,
  nightCast: { allowNpcIds: [101, 202] },
  nightDoors: { allowWorldPixels: [[2648, 336]] },
  sourceCheckAvailabilityPhase: "morning"
};

function flags(values: readonly string[]) {
  const set = new Set(values);
  return {
    has: (flag: string) => set.has(flag),
    list: () => [...set]
  };
}

describe("opening gates", () => {
  it.each([
    [[], "flyover"],
    [["intro:flyover-done"], "bedroom"],
    [["intro:wake-done"], "night-route"],
    [["intro:meteor-seen"], "return-home"],
    [["intro:returned-home"], "home-scene"]
  ] as const)("activates enabled gates during %s (%s)", (storyFlags, _phase) => {
    expect(openingGatesActive(enabledSequence, flags(storyFlags))).toBe(true);
  });

  it("does not activate gates during morning or post", () => {
    expect(openingGatesActive(enabledSequence, flags(["intro:morning"]))).toBe(false);
    expect(openingGatesActive(enabledSequence, flags(["act1:complete"]))).toBe(false);
  });

  it("keeps the entire disabled path permissive", () => {
    const freshFlags = flags([]);

    expect(openingGatesActive(disabledSequence, freshFlags)).toBe(false);
    expect(openingNpcAllowed(disabledSequence, freshFlags, 999)).toBe(true);
    expect(openingRoamersAllowed(disabledSequence, freshFlags)).toBe(true);
    expect(openingEncountersAllowed(disabledSequence, freshFlags)).toBe(true);
    expect(openingSourceChecksAllowed(disabledSequence, freshFlags)).toBe(true);
    expect(openingAutosaveNoticeAllowed(disabledSequence, freshFlags)).toBe(true);
    expect(openingNightTintRequired(disabledSequence, freshFlags)).toBe(false);
  });

  it("allows only the authored night cast while gates are active", () => {
    expect(openingNpcAllowed(enabledSequence, flags([]), 101)).toBe(true);
    expect(openingNpcAllowed(enabledSequence, flags([]), 999)).toBe(false);
    expect(openingNpcAllowed({ ...enabledSequence, nightCast: undefined }, flags([]), 101)).toBe(false);
    expect(openingNpcAllowed(enabledSequence, flags(["intro:morning"]), 999)).toBe(true);
  });

  it("blocks roamers, encounters, and the autosave notice only during active gates", () => {
    const activeFlags = flags(["intro:wake-done"]);
    const morningFlags = flags(["intro:morning"]);

    expect(openingRoamersAllowed(enabledSequence, activeFlags)).toBe(false);
    expect(openingEncountersAllowed(enabledSequence, activeFlags)).toBe(false);
    expect(openingAutosaveNoticeAllowed(enabledSequence, activeFlags)).toBe(false);
    expect(openingRoamersAllowed(enabledSequence, morningFlags)).toBe(true);
    expect(openingEncountersAllowed(enabledSequence, morningFlags)).toBe(true);
    expect(openingAutosaveNoticeAllowed(enabledSequence, morningFlags)).toBe(true);
  });

  it("unlocks Source Checks at the configured phase floor", () => {
    expect(openingSourceChecksAllowed(enabledSequence, flags([]))).toBe(false);
    expect(openingSourceChecksAllowed(enabledSequence, flags(["intro:morning"]))).toBe(true);
    expect(openingSourceChecksAllowed(enabledSequence, flags(["act1:complete"]))).toBe(true);
  });

  it("requires night tint only while enabled gates are active", () => {
    expect(openingNightTintRequired(enabledSequence, flags(["intro:returned-home"]))).toBe(true);
    expect(openingNightTintRequired(enabledSequence, flags(["intro:morning"]))).toBe(false);
  });

  it("locks outdoor door entries only during the night route through return home", () => {
    const otherDoor = { x: 2000, y: 100 };

    expect(openingNightDoorLocked(enabledSequence, flags([]), otherDoor, true)).toBe(false);
    expect(openingNightDoorLocked(enabledSequence, flags(["intro:wake-done"]), otherDoor, true)).toBe(true);
    expect(openingNightDoorLocked(enabledSequence, flags(["intro:meteor-seen"]), otherDoor, true)).toBe(true);
    expect(openingNightDoorLocked(enabledSequence, flags(["intro:returned-home"]), otherDoor, true)).toBe(false);
    expect(openingNightDoorLocked(enabledSequence, flags(["intro:morning"]), otherDoor, true)).toBe(false);
  });

  it("keeps indoor exits, allowlisted entries, and the disabled path open", () => {
    const activeFlags = flags(["intro:wake-done"]);

    expect(openingNightDoorLocked(enabledSequence, activeFlags, { x: 2000, y: 100 }, false)).toBe(false);
    expect(openingNightDoorLocked(enabledSequence, activeFlags, { x: 2648, y: 336 }, true)).toBe(false);
    expect(openingNightDoorLocked(disabledSequence, activeFlags, { x: 2000, y: 100 }, true)).toBe(false);
  });
});
