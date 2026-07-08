import { describe, expect, it } from "vitest";
import {
  cureStatus,
  hasStatus,
  incomingDamageScale,
  inflictStatus,
  resolveTurnGate,
  tickStatuses,
  PARALYSIS_RECOVERY_CHANCE,
  POISON_HP_DIVISOR,
  SLEEP_WAKE_CHANCE,
  type StatusState
} from "../src/statusEffects";

describe("inflict / cure / hasStatus", () => {
  it("adds a status and reports it", () => {
    const state = inflictStatus([], "poisoned", { magnitude: 8 });
    expect(hasStatus(state, "poisoned")).toBe(true);
    expect(state).toEqual([{ ailment: "poisoned", magnitude: 8 }]);
  });

  it("refreshes rather than stacks a re-inflicted status", () => {
    let state = inflictStatus([], "asleep", { remaining: 3 });
    state = inflictStatus(state, "asleep", { remaining: 5 });
    expect(state.filter((s) => s.ailment === "asleep")).toHaveLength(1);
    expect(state[0]?.remaining).toBe(5);
  });

  it("cures a single ailment or all of them", () => {
    const state: StatusState = [{ ailment: "poisoned" }, { ailment: "paralyzed" }];
    expect(cureStatus(state, "poisoned")).toEqual([{ ailment: "paralyzed" }]);
    expect(cureStatus(state, "all")).toEqual([]);
  });
});

describe("resolveTurnGate", () => {
  it("blocks a paralyzed combatant", () => {
    const gate = resolveTurnGate([{ ailment: "paralyzed" }], 0.99);
    expect(gate).toMatchObject({ canAct: false, reason: "paralyzed" });
  });

  it("clears paralysis on a low recovery roll while still skipping that turn", () => {
    const gate = resolveTurnGate([{ ailment: "paralyzed" }], PARALYSIS_RECOVERY_CHANCE - 0.01);
    expect(gate.canAct).toBe(false);
    expect(gate.reason).toBe("paralysisRecovered");
    expect(hasStatus(gate.statuses, "paralyzed")).toBe(false);
  });

  it("wakes a sleeper on a low roll (clears status, still skips the turn)", () => {
    const gate = resolveTurnGate([{ ailment: "asleep" }], SLEEP_WAKE_CHANCE - 0.01);
    expect(gate.canAct).toBe(false);
    expect(gate.reason).toBe("woke");
    expect(hasStatus(gate.statuses, "asleep")).toBe(false);
  });

  it("keeps a sleeper asleep on a high roll", () => {
    const gate = resolveTurnGate([{ ailment: "asleep" }], 0.99);
    expect(gate).toMatchObject({ canAct: false, reason: "asleep" });
    expect(hasStatus(gate.statuses, "asleep")).toBe(true);
  });

  it("lets a clear combatant act", () => {
    expect(resolveTurnGate([], 0.5).canAct).toBe(true);
  });
});

describe("incomingDamageScale", () => {
  it("reduces damage while shielded and is a no-op otherwise", () => {
    expect(incomingDamageScale([{ ailment: "shielded", magnitude: 50 }])).toBeCloseTo(0.5);
    expect(incomingDamageScale([])).toBe(1);
  });
});

describe("tickStatuses", () => {
  it("applies poison HP loss as a fraction of maxHp", () => {
    const result = tickStatuses([{ ailment: "poisoned" }], 160);
    expect(result.hpLoss).toBe(Math.floor(160 / POISON_HP_DIVISOR));
    expect(result.statuses).toHaveLength(1);
  });

  it("decrements timed statuses and expires them at zero", () => {
    const result = tickStatuses([{ ailment: "confused", remaining: 1 }], 100);
    expect(result.statuses).toEqual([]);
    expect(result.expired).toEqual(["confused"]);
  });

  it("is a no-op for an empty state", () => {
    expect(tickStatuses([], 100)).toEqual({ statuses: [], hpLoss: 0, expired: [] });
  });
});
