import { describe, expect, it } from "vitest";
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
