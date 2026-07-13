import { describe, expect, it } from "vitest";
import { partyMemberAtLevel, type PartyMember } from "./characterModel";

describe("partyMemberAtLevel", () => {
  it("uses the authored baseline and exp threshold for forced levels", () => {
    const base: PartyMember = {
      id: 0,
      name: "Bosch",
      level: 1,
      experience: 0,
      hp: 75,
      maxHp: 75,
      pp: 25,
      maxPp: 25,
      stats: { offense: 18, defense: 5, speed: 4, guts: 7, vitality: 5, iq: 5, luck: 6 },
      inventory: [101],
      money: 0,
      growth: { offense: 18, defense: 5, speed: 4, guts: 7, vitality: 5, iq: 5, luck: 6 },
      expTable: [
        { level: 1, experience: 0 },
        { level: 2, experience: 4 },
        { level: 3, experience: 17 }
      ]
    };

    const levelOne = partyMemberAtLevel(base, 1);
    expect(levelOne.maxHp).toBe(75);
    expect(levelOne.maxPp).toBe(25);
    expect(levelOne.stats.offense).toBe(18);

    const levelThree = partyMemberAtLevel(base, 3);
    expect(levelThree.level).toBe(3);
    expect(levelThree.experience).toBe(17);
    expect(levelThree.hp).toBe(levelThree.maxHp);
    expect(levelThree.pp).toBe(levelThree.maxPp);
    expect(levelThree.stats.offense).toBeGreaterThanOrEqual(base.stats.offense);
  });
});
