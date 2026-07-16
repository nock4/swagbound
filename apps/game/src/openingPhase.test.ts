import { describe, expect, it } from "vitest";
import {
  OPENING_PHASE_FLAGS,
  openingMorningAliasFlags,
  openingPhaseAtOrAfter,
  resolveOpeningPhase,
  type OpeningPhase
} from "./openingPhase";

function flags(values: readonly string[]) {
  const set = new Set(values);
  return {
    has: (flag: string) => set.has(flag),
    list: () => [...set]
  };
}

describe("resolveOpeningPhase", () => {
  it("starts a fresh save at the flyover", () => {
    expect(resolveOpeningPhase(flags([]))).toBe("flyover");
  });

  it.each([
    ["intro:flyover-done", "bedroom"],
    ["intro:wake-done", "night-route"],
    ["intro:meteor-seen", "return-home"],
    ["intro:returned-home", "home-scene"],
    ["intro:home-scene-done", "home-scene"],
    ["intro:morning", "morning"]
  ] as const)("maps the single completion marker %s to %s", (flag, phase) => {
    expect(resolveOpeningPhase(flags([flag]))).toBe(phase);
  });

  it("exports the completion markers in lattice order", () => {
    expect(OPENING_PHASE_FLAGS).toEqual([
      "intro:flyover-done",
      "intro:wake-done",
      "intro:meteor-seen",
      "intro:returned-home",
      "intro:home-scene-done",
      "intro:morning"
    ]);
  });

  it("uses the highest new marker and tolerates gaps", () => {
    expect(resolveOpeningPhase(flags(["intro:meteor-seen"]))).toBe("return-home");
    expect(resolveOpeningPhase(flags([
      "intro:flyover-done",
      "intro:returned-home"
    ]))).toBe("home-scene");
  });

  it.each([
    "intro:bedroom-opening-done",
    "intro:meteor-beat-fired",
    "signal:cold-signal-seen",
    "act1:complete",
    "act2:begun",
    "act3:some-later-progress"
  ])("grandfathers a save carrying only legacy flag %s", (flag) => {
    expect(resolveOpeningPhase(flags([flag]))).toBe("post");
  });

  it("lets the new lattice win when legacy and new flags coexist", () => {
    expect(resolveOpeningPhase(flags([
      "signal:cold-signal-seen",
      "act3:some-later-progress",
      "intro:meteor-seen"
    ]))).toBe("return-home");
  });
});

describe("openingPhaseAtOrAfter", () => {
  const phases: readonly OpeningPhase[] = [
    "flyover",
    "bedroom",
    "night-route",
    "meteor",
    "return-home",
    "home-scene",
    "morning",
    "post"
  ];

  it("compares every phase in opening order", () => {
    for (const [phaseIndex, phase] of phases.entries()) {
      for (const [floorIndex, floor] of phases.entries()) {
        expect(openingPhaseAtOrAfter(phase, floor), `${phase} at or after ${floor}`).toBe(
          phaseIndex >= floorIndex
        );
      }
    }
  });

  it("treats post as the highest phase", () => {
    expect(openingPhaseAtOrAfter("post", "morning")).toBe(true);
    expect(openingPhaseAtOrAfter("morning", "post")).toBe(false);
  });
});

describe("openingMorningAliasFlags", () => {
  it("sets the new morning marker and the legacy Act 1 harness alias", () => {
    expect(openingMorningAliasFlags()).toEqual([
      "intro:morning",
      "signal:cold-signal-seen"
    ]);
  });

  it("returns a fresh array", () => {
    const first = openingMorningAliasFlags();
    first.pop();
    expect(openingMorningAliasFlags()).toHaveLength(2);
  });
});
