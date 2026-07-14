import { describe, expect, it } from "vitest";
import { describeAffinity, elementalAffinity, psiElementForId, RESIST_MULTIPLIER, WEAK_MULTIPLIER } from "./battleAffinities";

describe("battle affinities", () => {
  it("maps offense PSI ids to elements (rename-proof)", () => {
    expect(psiElementForId(6)).toBe("fire");
    expect(psiElementForId(9)).toBe("ice"); // Freeze, displayed as "Cold Memo"
    expect(psiElementForId(13)).toBe("thunder");
    expect(psiElementForId(18)).toBe("flash");
    expect(psiElementForId(21)).toBe("cosmic");
    expect(psiElementForId(2)).toBe("beam");
    expect(psiElementForId(0)).toBeNull();
    expect(psiElementForId(undefined)).toBeNull();
  });

  it("applies weak / resist / neutral multipliers", () => {
    // Frankystein Mark II (130) is a machine — weak to thunder
    expect(elementalAffinity(130, "thunder")).toEqual({ multiplier: WEAK_MULTIPLIER, kind: "weak" });
    expect(elementalAffinity(130, "fire")).toEqual({ multiplier: 1, kind: null });
    // Soul Consuming Flame (147): pray-to-win boss (be72f2dd) — resists ice, no weakness
    expect(elementalAffinity(147, "ice")).toEqual({ multiplier: RESIST_MULTIPLIER, kind: "resist" });
    expect(elementalAffinity(147, "fire")).toEqual({ multiplier: 1, kind: null });
    // Frank / Milady swarm lead (enemy id 131, not the group id 448) — weak to the source beam
    expect(elementalAffinity(131, "beam")).toEqual({ multiplier: WEAK_MULTIPLIER, kind: "weak" });
    expect(elementalAffinity(131, "flash")).toEqual({ multiplier: RESIST_MULTIPLIER, kind: "resist" });
    // Unlisted enemy is neutral to everything
    expect(elementalAffinity(9999, "ice")).toEqual({ multiplier: 1, kind: null });
    // No element = no effect
    expect(elementalAffinity(147, null)).toEqual({ multiplier: 1, kind: null });
  });

  it("describes weaknesses for SPY", () => {
    expect(describeAffinity(147)).toBe("Resists ice."); // Soul Consuming Flame: pray-to-win boss, no weakness (be72f2dd)
    expect(describeAffinity(130)).toBe("Weak to thunder."); // Frankystein (weak only)
    expect(describeAffinity(9999)).toBe("No elemental weakness."); // unlisted
  });
});
