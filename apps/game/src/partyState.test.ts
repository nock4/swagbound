import { describe, expect, it } from "vitest";
import type { ItemData } from "@eb/schemas";
import { hospitalRecoveryCost, PartyState, type PartyStateSnapshot } from "./partyState";
import { buildCombatantFromPartyMember, type PartyMember } from "./characterModel";

describe("PartyState battle round-trips", () => {
  it("does not compound equip stat bonuses across battle round-trips", () => {
    const partyState = new PartyState();
    const base: PartyMember = {
      id: 0,
      name: "Bosch",
      level: 3,
      experience: 0,
      hp: 40,
      maxHp: 40,
      pp: 10,
      maxPp: 10,
      stats: { offense: 20, defense: 12, speed: 5, guts: 3, vitality: 4, iq: 3, luck: 2 },
      inventory: [],
      money: 0
    };

    for (let trip = 0; trip < 3; trip += 1) {
      const [member] = partyState.applyToPartyMembers([{ ...base, stats: { ...base.stats } }]);
      // Persisted stats stay BASE — a +10 weapon must not raise them per battle.
      expect(member.stats.offense).toBe(20);
      expect(member.stats.defense).toBe(12);
      const combatant = buildCombatantFromPartyMember(member, { statBonuses: { offense: 10, defense: 4 } });
      // In battle the equip bonus applies once.
      expect(combatant.stats.offense).toBe(30);
      expect(combatant.stats.defense).toBe(16);
      partyState.applyBattleResult([combatant], 0);
    }
  });

  it("clears battle-scoped statuses after battle while preserving poison and paralysis", () => {
    const partyState = new PartyState();
    const base = partyMember(1, "Bosch");
    const combatant = {
      ...buildCombatantFromPartyMember(base),
      statuses: [
        { ailment: "poisoned" as const },
        { ailment: "paralyzed" as const },
        { ailment: "asleep" as const },
        { ailment: "confused" as const },
        { ailment: "shielded" as const, magnitude: 50 }
      ]
    };

    partyState.applyBattleResult([combatant], 0);

    expect(partyState.statuses(1)).toEqual([{ ailment: "poisoned" }, { ailment: "paralyzed" }]);
  });
});

describe("PartyState inventory capacity (EB 14-slot cap)", () => {
  function fullInventoryState(): PartyState {
    const partyState = new PartyState();
    partyState.restore({
      wallet: 500,
      partyIds: [1, 2],
      inventory: [
        { charId: 1, itemIds: Array.from({ length: 14 }, (_, i) => 100 + i) },
        { charId: 2, itemIds: [50] }
      ],
      equipped: []
    });
    return partyState;
  }

  it("refuses give at 14 items and reports remaining room", () => {
    const partyState = fullInventoryState();
    expect(partyState.inventoryRoom(1)).toBe(0);
    expect(partyState.give(1, 200)).toBe(false);
    expect(partyState.inventory(1)).toHaveLength(14);
    expect(partyState.inventoryRoom(2)).toBe(13);
    expect(partyState.give(2, 200)).toBe(true);
  });

  it("refuses buying into a full bag without charging", () => {
    const partyState = fullInventoryState();
    const result = partyState.buyItem(1, { id: 17, cost: 100 });
    expect(result).toMatchObject({ ok: false, reason: "inventoryFull" });
    expect(partyState.wallet).toBe(500);
    expect(partyState.inventory(1)).toHaveLength(14);
  });

  it("refuses transferring or withdrawing to a full member without moving the item", () => {
    const partyState = fullInventoryState();
    const transfer = partyState.transferItem(2, 1, 0, 50);
    expect(transfer).toMatchObject({ ok: false, reason: "targetFull" });
    expect(partyState.inventory(2)).toEqual([50]);

    partyState.depositStoredItem(2, 0, 50);
    const withdraw = partyState.withdrawStoredItem(1, 0, 50);
    expect(withdraw).toMatchObject({ ok: false, reason: "targetFull" });
    expect(partyState.storage()).toEqual([50]);
  });
});

describe("PartyState field statuses", () => {
  it("drains poisoned active party members on field steps without killing them", () => {
    const partyState = poisonedPartyState(3);

    const ticks = partyState.applyFieldPoisonStep();

    expect(ticks).toEqual([
      { charId: 1, previousHp: 3, nextHp: 1, hpLoss: 2 }
    ]);
    expect(partyState.vitals(1)?.hp.target).toBe(1);
    expect(partyState.vitals(1)?.hp.displayed).toBe(3);

    partyState.tickMeters(1000);
    expect(partyState.vitals(1)?.hp.displayed).toBe(1);
    expect(partyState.applyFieldPoisonStep()).toEqual([]);
  });

  it("cures field statuses through recovery effects", () => {
    const partyState = poisonedPartyState(40);

    const result = partyState.applyRecovery({ kind: "cureStatus", ailment: "poisoned" }, 1);

    expect(result).toMatchObject([{ charId: 1, previousValue: 1, nextValue: 0 }]);
    expect(partyState.statuses(1)).toEqual([]);
    expect(partyState.applyFieldPoisonStep()).toEqual([]);
  });

  it("hydrates party members with persisted statuses for battle setup", () => {
    const partyState = poisonedPartyState(40);
    const members = partyState.applyToPartyMembers([{
      id: 1,
      name: "Bosch",
      level: 1,
      experience: 0,
      maxHp: 100,
      hp: 100,
      maxPp: 20,
      pp: 20,
      stats: { offense: 1, defense: 1, speed: 1, guts: 1, vitality: 1, iq: 1, luck: 1 },
      inventory: [],
      money: 0
    }]);

    expect(members[0]?.statuses).toEqual([{ ailment: "poisoned" }]);
  });
});

describe("PartyState menu services", () => {
  it("moves and drops exact inventory slots while clearing orphaned equipment", () => {
    const partyState = new PartyState();
    partyState.restore({
      wallet: 0,
      partyIds: [1, 2],
      inventory: [{ charId: 1, itemIds: [10, 11] }],
      equipped: [{ charId: 1, slots: { weapon: 10 } }]
    });

    expect(partyState.transferItem(1, 2, 0, 10)).toMatchObject({
      ok: true,
      fromChar: 1,
      toChar: 2,
      fromSlot: 0,
      toSlot: 0
    });
    expect(partyState.inventory(1)).toEqual([11]);
    expect(partyState.inventory(2)).toEqual([10]);
    expect(partyState.equipped(1)).toEqual({});

    expect(partyState.dropItem(1, 0, 11)).toMatchObject({ ok: true, fromChar: 1, fromSlot: 0 });
    expect(partyState.inventory(1)).toEqual([]);
  });

  it("deposits and withdraws storage items through exact slots", () => {
    const partyState = new PartyState();
    partyState.restore({
      wallet: 0,
      partyIds: [1, 2],
      inventory: [{ charId: 1, itemIds: [20, 21] }],
      equipped: []
    });

    expect(partyState.depositStoredItem(1, 1, 21)).toMatchObject({ ok: true, fromChar: 1, toSlot: 0 });
    expect(partyState.inventory(1)).toEqual([20]);
    expect(partyState.storage()).toEqual([21]);

    expect(partyState.withdrawStoredItem(2, 0, 21)).toMatchObject({ ok: true, toChar: 2, toSlot: 0 });
    expect(partyState.storage()).toEqual([]);
    expect(partyState.inventory(2)).toEqual([21]);
  });

  it("withdraws banked battle winnings into wallet cash through ATM state", () => {
    const partyState = new PartyState();
    partyState.restore({
      wallet: 0,
      bank: 120,
      partyIds: [1],
      inventory: [],
      equipped: []
    });

    expect(partyState.applyAtm("withdraw", 50)).toBe(50);
    expect(partyState.wallet).toBe(50);
    expect(partyState.bank).toBe(70);
  });

  it("computes hospital recovery cost from damage, PP, level, and KO state", () => {
    expect(hospitalRecoveryCost([
      memberForRecovery({ level: 5, hp: 45, maxHp: 100, pp: 5, maxPp: 20 }),
      memberForRecovery({ level: 3, hp: 0, maxHp: 80, pp: 0, maxPp: 10 })
    ])).toBe(85);
  });

  it("full recovery restores HP/PP and optionally cures statuses", () => {
    const partyState = poisonedPartyState(3);
    partyState.fullRecover({ cureStatuses: true });

    expect(partyState.vitals(1)?.hp.target).toBe(100);
    expect(partyState.vitals(1)?.pp).toBe(20);
    expect(partyState.statuses(1)).toEqual([]);
  });

  it("does not consume battle-only damage items from the field", () => {
    const partyState = itemUsePartyState([200], 40);
    const bomb: ItemData = { ...syntheticItem(200), effect: { kind: "damage", amount: 30 } };

    const result = partyState.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: bomb,
      targetVitals: { hp: 40, maxHp: 100, pp: 10, maxPp: 20 }
    });

    expect(result).toMatchObject({ ok: false, reason: "notFieldUsable" });
    expect(partyState.inventory(1)).toEqual([200]);
    expect(partyState.vitals(1)?.hp.target).toBe(40);
  });

  it("does not let offensive status items self-target from the field", () => {
    const partyState = itemUsePartyState([201], 40);
    const poisonNeedle: ItemData = { ...syntheticItem(201), effect: { kind: "inflictStatus", ailment: "poisoned" } };

    const result = partyState.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: poisonNeedle,
      targetVitals: { hp: 40, maxHp: 100, pp: 10, maxPp: 20 }
    });

    expect(result).toMatchObject({ ok: false, reason: "notFieldUsable" });
    expect(partyState.inventory(1)).toEqual([201]);
    expect(partyState.statuses(1)).toEqual([]);
  });

  it("still consumes and applies field healing items", () => {
    const partyState = itemUsePartyState([202], 25);
    const cookie = syntheticItem(202, { kind: "healHp", amount: 12 });

    const result = partyState.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: cookie,
      targetVitals: { hp: 25, maxHp: 100, pp: 10, maxPp: 20 }
    });

    expect(result).toMatchObject({ ok: true, previousValue: 25, nextValue: 37 });
    expect(partyState.inventory(1)).toEqual([]);
    expect(partyState.vitals(1)?.hp.target).toBe(37);
  });
});

function poisonedPartyState(hp: number): PartyState {
  const partyState = new PartyState();
  partyState.restore({
    wallet: 0,
    partyIds: [1],
    inventory: [],
    equipped: [],
    statuses: [{ charId: 1, statuses: [{ ailment: "poisoned" }] }],
    vitals: [
      { charId: 1, hp: { current: hp, target: hp }, maxHp: 100, pp: 10, maxPp: 20 }
    ]
  } satisfies PartyStateSnapshot);
  return partyState;
}

function itemUsePartyState(itemIds: number[], hp: number): PartyState {
  const partyState = new PartyState();
  partyState.restore({
    wallet: 0,
    partyIds: [1],
    inventory: [{ charId: 1, itemIds }],
    equipped: [],
    statuses: [],
    vitals: [
      { charId: 1, hp: { current: hp, target: hp }, maxHp: 100, pp: 10, maxPp: 20 }
    ]
  } satisfies PartyStateSnapshot);
  return partyState;
}

function partyMember(id: number, name: string): PartyMember {
  return {
    id,
    name,
    level: 3,
    experience: 0,
    hp: 40,
    maxHp: 40,
    pp: 10,
    maxPp: 10,
    stats: { offense: 20, defense: 12, speed: 5, guts: 3, vitality: 4, iq: 3, luck: 2 },
    inventory: [],
    money: 0
  };
}

function syntheticItem(id: number, effect?: ItemData["effect"]): ItemData {
  return {
    id,
    name: `ITEM_${id}`,
    type: 0,
    cost: 0,
    action: 0,
    argument: 0,
    equippable: false,
    miscFlags: ["item disappears when used"],
    ...(effect ? { effect } : {})
  };
}

function memberForRecovery(input: {
  level: number;
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
}) {
  return {
    id: input.level,
    name: `Member ${input.level}`,
    level: input.level,
    experience: 0,
    hp: input.hp,
    maxHp: input.maxHp,
    pp: input.pp,
    maxPp: input.maxPp,
    stats: { offense: 1, defense: 1, speed: 1, guts: 1, vitality: 1, iq: 1, luck: 1 },
    inventory: [],
    money: 0
  };
}
