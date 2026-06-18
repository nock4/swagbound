import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterCollection, CharacterData, PsiData } from "@eb/schemas";
import { AUTO_HEAL_HP_FRACTION, autoCommandForMember } from "../src/battleAutoPolicy";
import {
  createBattleState,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../src/battleLogic";

const opponent = enemy(1, "OPPONENT", { hp: 90 });
const healer = character(0, "HEALER", { maxHp: 80, maxPp: 24 });
const allyA = character(1, "ALLY_A", { maxHp: 50, maxPp: 0 });
const allyB = character(2, "ALLY_B", { maxHp: 80, maxPp: 0 });

describe("autoCommandForMember", () => {
  it("heals an endangered ally with the cheapest sufficient affordable recovery PSI", () => {
    let battle = createBattleState(opponent, {
      characters: characters([healer, allyA])
    });
    battle = setDisplayedHp(battle, actor("party", 1), 10);
    const alpha = syntheticPsi(100, "recovery", "alpha", [{ charId: 0, level: 1 }]);
    const beta = syntheticPsi(101, "recovery", "beta", [{ charId: 0, level: 1 }]);

    expect(10 / 50).toBeLessThan(AUTO_HEAL_HP_FRACTION);
    expect(autoCommandForMember(battle, 0, [beta, alpha])).toEqual({
      partySlot: 0,
      command: "PSI",
      psiId: 100,
      target: { side: "party", index: 1 }
    });
  });

  it("picks BASH when no endangered ally can be healed", () => {
    const battle = createBattleState([opponent, enemy(2, "OTHER", { hp: 40 })], {
      characters: characters([healer, allyA])
    });

    expect(autoCommandForMember(battle, 0, [
      syntheticPsi(100, "recovery", "alpha", [{ charId: 0, level: 1 }])
    ])).toEqual({
      partySlot: 0,
      command: "BASH",
      target: { side: "enemy", index: 0 }
    });
  });

  it("does not select offensive PSI, goods, or run when healing is unavailable", () => {
    let battle = createBattleState(opponent, {
      characters: characters([healer, allyA])
    });
    battle = setDisplayedHp(battle, actor("party", 1), 8);
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      inventory: [200]
    });

    const command = autoCommandForMember(battle, 0, [
      syntheticPsi(100, "offense", "omega", [{ charId: 0, level: 1 }]),
      syntheticPsi(101, "assist", "alpha", [{ charId: 0, level: 1 }])
    ]);

    expect(command.command).toBe("BASH");
    expect(command.command).not.toBe("PSI");
    expect(command.command).not.toBe("GOODS");
    expect(command.command).not.toBe("RUN");
  });

  it("chooses the most-endangered living ally by displayed HP fraction", () => {
    let battle = createBattleState(opponent, {
      characters: characters([healer, allyA, allyB])
    });
    battle = setDisplayedHp(battle, actor("party", 1), 9);
    battle = setDisplayedHp(battle, actor("party", 2), 5);

    expect(autoCommandForMember(battle, 0, [
      syntheticPsi(100, "recovery", "gamma", [{ charId: 0, level: 1 }])
    ])).toEqual({
      partySlot: 0,
      command: "PSI",
      psiId: 100,
      target: { side: "party", index: 2 }
    });
  });

  it("falls back to BASH when recovery PSI is not affordable with current PP", () => {
    let battle = createBattleState(opponent, {
      characters: characters([healer, allyA])
    });
    battle = setDisplayedHp(battle, actor("party", 1), 10);
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      pp: 3
    });

    expect(autoCommandForMember(battle, 0, [
      syntheticPsi(100, "recovery", "alpha", [{ charId: 0, level: 1 }])
    ])).toEqual({
      partySlot: 0,
      command: "BASH",
      target: { side: "enemy", index: 0 }
    });
  });
});

function setDisplayedHp(battle: BattleState, target: BattleActor, displayed: number): BattleState {
  const combatant = target.side === "party" ? battle.party[target.index] : battle.enemies[target.index];
  return withCombatant(battle, target, {
    ...combatant,
    hp: {
      ...combatant.hp,
      displayed,
      target: displayed,
      isRolling: false,
      stepRemainder: 0
    }
  });
}

function actor(side: "party" | "enemy", index: number): BattleActor {
  return { side, index };
}

function enemy(
  id: number,
  name: string,
  stats: Partial<Pick<BattleEnemy, "hp" | "defense" | "offense" | "speed" | "level">> = {}
): BattleEnemy {
  return {
    id,
    name,
    spriteId: id,
    level: stats.level ?? 3,
    hp: stats.hp ?? 24,
    defense: stats.defense ?? 4,
    offense: stats.offense ?? 8,
    speed: stats.speed ?? stats.level ?? 3,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [0, 1, 2, 3].map((index) => ({ id: index, arg: 0, actionId: index, actionType: 0, target: 0 })) as BattleEnemy["actions"],
    itemDropped: null,
    itemRarity: null
  };
}

function character(
  id: number,
  name: string,
  stats: Partial<Pick<CharacterData, "maxHp" | "maxPp" | "offense" | "defense" | "speed">> = {}
): CharacterData {
  return {
    id,
    name,
    level: 6,
    maxHp: stats.maxHp ?? 40,
    maxPp: stats.maxPp ?? 0,
    offense: stats.offense ?? 12,
    defense: stats.defense ?? 6,
    speed: stats.speed ?? 5,
    guts: 5,
    vitality: 6,
    iq: 4,
    luck: 3,
    startingItems: [],
    money: 9
  };
}

function characters(characterList: CharacterData[]): CharacterCollection {
  return {
    schemaVersion: "test",
    sourceProjectPath: "test",
    derivation: {
      source: "test",
      baseStats: "test",
      statFormula: "test",
      hpPpFormula: "test",
      uncertainty: "test"
    },
    characters: characterList,
    counts: {
      characters: characterList.length,
      statFieldsPopulated: characterList.length * 7
    },
    warnings: []
  };
}

function syntheticPsi(
  id: number,
  type: string,
  strength: string,
  learnedBy: PsiData["learnedBy"]
): PsiData {
  return {
    id,
    name: `PSI_${id}`,
    type,
    strength,
    usableOutsideBattle: type === "recovery",
    learnedBy
  };
}
