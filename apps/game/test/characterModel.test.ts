import { describe, expect, it } from "vitest";
import type { CharacterData } from "@eb/schemas";
import {
  buildCombatantFromCharacter,
  buildCombatantFromPartyMember,
  buildPartyMember,
  effectivePartyMemberStats
} from "../src/characterModel";
import { hpMeterDigitsPerSecondForDelta } from "../src/ebTiming";

const character: CharacterData = {
  id: 2,
  name: "PARTY_MEMBER",
  level: 7,
  maxHp: 88,
  maxPp: 24,
  offense: 14,
  defense: 9,
  speed: 6,
  guts: 5,
  vitality: 8,
  iq: 4,
  luck: 3,
  startingItems: [12, 13],
  money: 21
};

describe("character model", () => {
  it("builds a party member record from generated character data", () => {
    const member = buildPartyMember(character);

    expect(member).toEqual({
      id: 2,
      name: "PARTY_MEMBER",
      level: 7,
      experience: 0,
      maxHp: 88,
      hp: 88,
      maxPp: 24,
      pp: 24,
      stats: {
        offense: 14,
        defense: 9,
        speed: 6,
        guts: 5,
        vitality: 8,
        iq: 4,
        luck: 3
      },
      inventory: [12, 13],
      money: 21
    });
  });

  it("builds a battle combatant from a party member", () => {
    const member = buildPartyMember(character);
    const combatant = buildCombatantFromPartyMember(member);

    expect(combatant).toMatchObject({
      name: "PARTY_MEMBER",
      level: 7,
      maxHp: 88,
      maxPp: 24,
      pp: 24,
      offense: 14,
      defense: 9,
      isEnemy: false
    });
    expect(combatant.hp).toMatchObject({ displayed: 88, target: 88, ratePerSec: hpMeterDigitsPerSecondForDelta(1) });
  });

  it("starts the combatant at the member's CURRENT hp, not full (persists damage/death across battles)", () => {
    const damaged = { ...buildPartyMember(character), hp: 12 };
    expect(buildCombatantFromPartyMember(damaged).hp).toMatchObject({ displayed: 12, target: 12 });

    const dead = { ...buildPartyMember(character), hp: 0 };
    expect(buildCombatantFromPartyMember(dead).hp).toMatchObject({ displayed: 0, target: 0 });

    const overflow = { ...buildPartyMember(character), hp: 999 };
    expect(buildCombatantFromPartyMember(overflow).hp).toMatchObject({ displayed: 88, target: 88 });
  });

  it("computes effective stats with optional equipment bonuses", () => {
    const member = buildPartyMember(character);

    expect(effectivePartyMemberStats(member)).toMatchObject({
      offense: 14,
      defense: 9
    });
    expect(effectivePartyMemberStats(member, { offense: 5, defense: 3 })).toMatchObject({
      offense: 19,
      defense: 12
    });
  });

  it("uses effective stats when building a battle combatant", () => {
    const member = buildPartyMember(character);
    const combatant = buildCombatantFromPartyMember(member, {
      statBonuses: { offense: 5, defense: 3 }
    });

    expect(combatant).toMatchObject({
      offense: 19,
      defense: 12
    });
  });

  it("builds a battle combatant directly from generated character data", () => {
    const combatant = buildCombatantFromCharacter(character);

    expect(combatant.name).toBe("PARTY_MEMBER");
    expect(combatant.maxHp).toBe(88);
    expect(combatant.pp).toBe(24);
  });
});
