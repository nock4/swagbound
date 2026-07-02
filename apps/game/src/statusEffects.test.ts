import { describe, expect, it } from "vitest";
import { fieldPoisonTick, formatStatusAilments, poisonDamagePerTick, stripBattleScopedStatuses } from "./statusEffects";

describe("field poison ticks", () => {
  it("does nothing without poison", () => {
    expect(fieldPoisonTick([], 20, 100)).toEqual({ hpLoss: 0, nextHp: 20 });
    expect(poisonDamagePerTick([], 100)).toBe(0);
  });

  it("drains by the poison divisor while preserving at least 1 HP", () => {
    expect(poisonDamagePerTick([{ ailment: "poisoned" }], 100)).toBe(6);
    expect(fieldPoisonTick([{ ailment: "poisoned" }], 20, 100)).toEqual({ hpLoss: 6, nextHp: 14 });
    expect(fieldPoisonTick([{ ailment: "poisoned" }], 3, 100)).toEqual({ hpLoss: 2, nextHp: 1 });
    expect(fieldPoisonTick([{ ailment: "poisoned" }], 1, 100)).toEqual({ hpLoss: 0, nextHp: 1 });
  });

  it("uses authored poison magnitude when present", () => {
    expect(poisonDamagePerTick([{ ailment: "poisoned", magnitude: 10 }], 100)).toBe(10);
  });
});

describe("status labels", () => {
  it("formats active ailments for menu display", () => {
    expect(formatStatusAilments(undefined)).toBe("OK");
    expect(formatStatusAilments([{ ailment: "poisoned" }, { ailment: "paralyzed" }])).toBe("Poison, Paralysis");
  });
});

describe("battle-scoped status cleanup", () => {
  it("strips asleep/confused/shielded while preserving EB-persistent poison and paralysis", () => {
    expect(stripBattleScopedStatuses([
      { ailment: "poisoned" },
      { ailment: "paralyzed" },
      { ailment: "asleep" },
      { ailment: "confused" },
      { ailment: "shielded", magnitude: 50 }
    ])).toEqual([
      { ailment: "poisoned" },
      { ailment: "paralyzed" }
    ]);
  });
});
