import { describe, expect, it } from "vitest";
import type { ItemData } from "@eb/schemas";
import { PartyState, sellPriceForItem } from "../src/partyState";
import { buildPlayerCombatant } from "../src/battleLogic";
import type { PartyMember } from "../src/characterModel";

describe("PartyState", () => {
  it("tracks wallet deltas without going below zero", () => {
    const state = new PartyState();

    state.money(30);
    state.applyMoney("take", 12);
    state.money(-99);

    expect(state.wallet).toBe(0);
    expect(state.counts()).toMatchObject({ wallet: 0 });
  });

  it("clamps ATM deposits and withdrawals to available balances", () => {
    const state = new PartyState();

    state.money(30);
    expect(state.deposit(50)).toBe(30);
    expect(state.wallet).toBe(0);
    expect(state.bank).toBe(30);

    expect(state.withdraw(12)).toBe(12);
    expect(state.wallet).toBe(12);
    expect(state.bank).toBe(18);

    expect(state.applyAtm("withdraw", 99)).toBe(18);
    expect(state.counts()).toMatchObject({ wallet: 30, bank: 0 });
  });

  it("buys and sells items with wallet and inventory deltas", () => {
    const state = new PartyState();
    const item = itemData(10, { cost: 21 });

    expect(sellPriceForItem(item)).toBe(10);
    expect(state.buyItem(1, item)).toMatchObject({ ok: false, reason: "insufficientFunds" });
    expect(state.inventory(1)).toEqual([]);

    state.money(25);
    expect(state.buyItem(1, item)).toMatchObject({
      ok: true,
      cost: 21,
      previousWallet: 25,
      nextWallet: 4
    });
    expect(state.wallet).toBe(4);
    expect(state.inventory(1)).toEqual([10]);

    expect(state.sellItem(1, item)).toMatchObject({
      ok: true,
      price: 10,
      previousWallet: 4,
      nextWallet: 14
    });
    expect(state.wallet).toBe(14);
    expect(state.inventory(1)).toEqual([]);
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

  it("honors an explicit party order, appending unordered members by charId", () => {
    const state = new PartyState();
    for (const id of [0, 1, 2, 3]) {
      state.partyOp("add", id);
    }
    // Default: charId-ascending.
    expect(state.party()).toEqual([0, 1, 2, 3]);

    state.reorder([2, 0]);
    // Ordered members first (2, 0), the rest appended in charId order (1, 3).
    expect(state.party()).toEqual([2, 0, 1, 3]);

    // Removing a member drops it from the order without disturbing the rest.
    state.partyOp("remove", 2);
    expect(state.party()).toEqual([0, 1, 3]);

    // reorder ignores ids not currently in the party.
    state.reorder([3, 99, 1]);
    expect(state.party()).toEqual([3, 1, 0]);
  });

  it("round-trips explicit order through snapshot/restore", () => {
    const state = new PartyState();
    for (const id of [0, 1, 2, 3]) {
      state.partyOp("add", id);
    }
    state.reorder([3, 1]);
    const snapshot = state.snapshot();
    expect(snapshot.order).toEqual([3, 1, 0, 2]);

    const restored = new PartyState();
    restored.restore(snapshot);
    expect(restored.party()).toEqual([3, 1, 0, 2]);
  });

  it("omits order from the snapshot when no explicit order is set", () => {
    const state = new PartyState();
    state.partyOp("add", 0);
    state.partyOp("add", 1);
    expect(state.snapshot().order).toBeUndefined();
  });

  it("uses a consumable item to roll HP upward and remove inventory", () => {
    const state = new PartyState();
    const item = itemData(10, { action: 0x1e02, argument: 30, consumable: true });
    state.give(1, item.id);

    const result = state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item,
      targetVitals: { hp: 20, maxHp: 40, pp: 3, maxPp: 12 }
    });

    expect(result).toMatchObject({ ok: true, previousValue: 20, nextValue: 40 });
    expect(state.inventory(1)).toEqual([]);
    expect(state.vitals(1)?.hp).toMatchObject({ displayed: 20, target: 40, isRolling: true });

    state.tickMeters(1000);
    expect(state.vitals(1)?.hp).toMatchObject({ displayed: 40, target: 40, isRolling: false });
  });

  it("uses a consumable item to recover PP and remove inventory", () => {
    const state = new PartyState();
    const item = itemData(11, { action: 0x1e06, argument: 5, consumable: true });
    state.give(1, item.id);

    const result = state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item,
      targetVitals: { hp: 20, maxHp: 40, pp: 3, maxPp: 7 }
    });

    expect(result).toMatchObject({ ok: true, previousValue: 3, nextValue: 7 });
    expect(state.inventory(1)).toEqual([]);
    expect(state.vitals(1)?.pp).toBe(7);
  });

  it("rejects non-consumable and unknown consumable item effects without removing inventory", () => {
    const state = new PartyState();
    const nonConsumable = itemData(12, { action: 0x1e02, argument: 10, consumable: false });
    const unknown = itemData(13, { action: 999, argument: 10, consumable: true });
    state.give(1, nonConsumable.id);
    state.give(1, unknown.id);

    expect(state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: nonConsumable,
      targetVitals: { hp: 10, maxHp: 40, pp: 0, maxPp: 0 }
    })).toMatchObject({ ok: false, reason: "notConsumable" });
    expect(state.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: unknown,
      targetVitals: { hp: 10, maxHp: 40, pp: 0, maxPp: 0 }
    })).toMatchObject({ ok: false, reason: "unknownEffect" });
    expect(state.inventory(1)).toEqual([12, 13]);
  });

  it("sets, replaces, and toggles equipment slots by item type", () => {
    const state = new PartyState();
    const firstWeapon = itemData(20, { type: 0x10 });
    const secondWeapon = itemData(21, { type: 0x10 });
    const body = itemData(22, { type: 0x14 });

    expect(state.equip(1, firstWeapon)).toMatchObject({ ok: true, slot: "weapon", equipped: true });
    expect(state.equipped(1)).toEqual({ weapon: 20 });

    expect(state.equip(1, secondWeapon)).toMatchObject({
      ok: true,
      slot: "weapon",
      equipped: true,
      previousItemId: 20
    });
    expect(state.equip(1, body)).toMatchObject({ ok: true, slot: "body", equipped: true });
    expect(state.equipped(1)).toEqual({ weapon: 21, body: 22 });

    expect(state.equip(1, secondWeapon)).toMatchObject({ ok: true, slot: "weapon", equipped: false });
    expect(state.equipped(1)).toEqual({ body: 22 });
  });

  it("rejects non-equipment types for equip", () => {
    const state = new PartyState();

    expect(state.equip(1, itemData(30, { type: 0x20 }))).toMatchObject({
      ok: false,
      reason: "notEquippable"
    });
  });

  it("carries battle results into the next generated party model", () => {
    const state = new PartyState();
    const combatant = {
      ...buildPlayerCombatant({
        name: "A",
        level: 3,
        maxHp: 52,
        offense: 12,
        defense: 8,
        speed: 5
      }),
      charId: 1,
      experience: 99,
      inventory: [10, 11],
      hp: { displayed: 17, target: 17, ratePerSec: 36, isRolling: false, stepRemainder: 0 },
      pp: 4,
      maxPp: 8
    };

    state.applyBattleResult([combatant], 77);

    expect(state.wallet).toBe(77);
    expect(state.inventory(1)).toEqual([10, 11]);
    expect(state.vitals(1)).toMatchObject({ maxHp: 52, pp: 4, maxPp: 8 });
    expect(state.battleMember(1)).toMatchObject({ level: 3, experience: 99, hp: 17 });
    expect(state.applyToPartyMembers([partyMember(1)])).toMatchObject([{
      id: 1,
      level: 3,
      experience: 99,
      hp: 17,
      maxHp: 52,
      pp: 4,
      maxPp: 8,
      inventory: [10, 11]
    }]);
  });

  it("restores the whole party to full HP/PP and revives KO'd members", () => {
    const state = new PartyState();
    state.restore({
      wallet: 0,
      bank: 0,
      partyIds: [1, 2],
      inventory: [],
      equipped: [],
      battleMembers: [
        {
          charId: 1,
          level: 3,
          experience: 120,
          hp: 0,
          maxHp: 80,
          pp: 0,
          maxPp: 25,
          inventory: [],
          stats: { offense: 10, defense: 9, speed: 8, guts: 7, vitality: 6, iq: 5, luck: 4 }
        },
        {
          charId: 2,
          level: 2,
          experience: 40,
          hp: 7,
          maxHp: 30,
          pp: 1,
          maxPp: 8,
          inventory: [],
          stats: { offense: 5, defense: 5, speed: 5, guts: 5, vitality: 5, iq: 5, luck: 5 }
        }
      ]
    });

    state.restore();

    expect(state.vitals(1)).toMatchObject({
      maxHp: 80,
      pp: 25,
      maxPp: 25,
      hp: { displayed: 80, target: 80, isRolling: false }
    });
    expect(state.battleMember(1)).toMatchObject({ hp: 80, maxHp: 80, pp: 25, maxPp: 25 });
    expect(state.vitals(2)).toMatchObject({
      maxHp: 30,
      pp: 8,
      maxPp: 8,
      hp: { displayed: 30, target: 30, isRolling: false }
    });
    expect(state.battleMember(2)).toMatchObject({ hp: 30, maxHp: 30, pp: 8, maxPp: 8 });
  });
});

function partyMember(id: number): PartyMember {
  return {
    id,
    name: "A",
    level: 1,
    experience: 0,
    hp: 40,
    maxHp: 40,
    pp: 0,
    maxPp: 0,
    stats: {
      offense: 1,
      defense: 1,
      speed: 1,
      guts: 1,
      vitality: 1,
      iq: 1,
      luck: 1
    },
    inventory: [],
    money: 0
  };
}

function itemData(id: number, options: {
  type?: number;
  action?: number;
  argument?: number;
  cost?: number;
  consumable?: boolean;
} = {}): ItemData {
  return {
    id,
    name: `[item ${id}]`,
    type: options.type ?? 0x30,
    cost: options.cost ?? 0,
    action: options.action ?? 0,
    argument: options.argument ?? 0,
    equippable: (options.type ?? 0x30) >= 0x10 && (options.type ?? 0x30) <= 0x1f,
    miscFlags: options.consumable ? ["item disappears when used"] : []
  };
}
