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

describe("sunstroke (desert field hazard)", () => {
  it("drains gentler than poison and stacks with it in the field tick", async () => {
    const m = await import("./statusEffects");
    expect(m.sunstrokeDamagePerTick([{ ailment: "sunstroke" }], 96)).toBe(3); // 96/32
    expect(m.sunstrokeDamagePerTick([], 96)).toBe(0);
    expect(m.fieldPoisonTick([{ ailment: "sunstroke" }], 20, 96)).toEqual({ hpLoss: 3, nextHp: 17 });
    expect(m.fieldPoisonTick([{ ailment: "poisoned" }, { ailment: "sunstroke" }], 20, 96)).toEqual({ hpLoss: 9, nextHp: 11 }); // 96/16 + 96/32
  });

  it("floors at 1 HP and never kills in the field", async () => {
    const m = await import("./statusEffects");
    expect(m.fieldPoisonTick([{ ailment: "sunstroke" }], 2, 96)).toEqual({ hpLoss: 1, nextHp: 1 });
    expect(m.fieldPoisonTick([{ ailment: "sunstroke" }], 1, 96)).toEqual({ hpLoss: 0, nextHp: 1 });
  });

  it("has a label and badge, and is not battle-scoped", async () => {
    const m = await import("./statusEffects");
    expect(m.statusAilmentLabel("sunstroke")).toBe("Sunstroke");
    expect(m.statusAilmentBadge("sunstroke")).toBe("SUN");
    expect(m.isBattleScopedStatus("sunstroke")).toBe(false);
    expect(m.formatStatusAilments([{ ailment: "sunstroke" }])).toBe("Sunstroke");
  });
});

describe("status badge label (battle card timers)", () => {
  it("renders badges with remaining-turn timers", async () => {
    const m = await import("./statusEffects");
    expect(m.statusBadgeLabel([])).toBe("");
    expect(m.statusBadgeLabel(undefined)).toBe("");
    expect(m.statusBadgeLabel([{ ailment: "poisoned", remaining: 3 }])).toBe("PSN·3");
    expect(m.statusBadgeLabel([{ ailment: "asleep" }])).toBe("SLP"); // no timer when open-ended
    expect(m.statusBadgeLabel([{ ailment: "paralyzed", remaining: 2 }, { ailment: "confused", remaining: 1 }])).toBe("PAR·2 CNF·1");
    expect(m.statusBadgeLabel([{ ailment: "sunstroke" }])).toBe("SUN");
  });
});
