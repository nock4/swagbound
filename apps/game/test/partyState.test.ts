import { describe, expect, it } from "vitest";
import { PartyState } from "../src/partyState";

describe("PartyState", () => {
  it("tracks wallet deltas without going below zero", () => {
    const state = new PartyState();

    state.money(30);
    state.applyMoney("take", 12);
    state.money(-99);

    expect(state.wallet).toBe(0);
    expect(state.counts()).toMatchObject({ wallet: 0 });
  });

  it("keeps inventory arrays by character id", () => {
    const state = new PartyState();

    state.give(1, 10);
    state.give(1, 11);
    state.give(2, 12);

    expect(state.inventory(1)).toEqual([10, 11]);
    expect(state.inventory(2)).toEqual([12]);
    expect(state.counts()).toMatchObject({ inventoryChars: 2, inventoryItems: 3 });

    expect(state.take(1, 10)).toBe(true);
    expect(state.take(1, 99)).toBe(false);

    expect(state.inventory(1)).toEqual([11]);
    expect(state.counts()).toMatchObject({ inventoryChars: 2, inventoryItems: 2 });
  });

  it("adds and removes party ids as a set", () => {
    const state = new PartyState();

    state.partyOp("add", 3);
    state.partyOp("add", 1);
    state.partyOp("add", 3);
    state.partyOp("remove", 3);

    expect(state.party()).toEqual([1]);
    expect(state.counts()).toMatchObject({ partyCount: 1 });
  });
});
