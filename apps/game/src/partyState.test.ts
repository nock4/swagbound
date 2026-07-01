import { describe, expect, it } from "vitest";
import { PartyState, type PartyStateSnapshot } from "./partyState";

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
