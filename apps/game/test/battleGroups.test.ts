import { describe, expect, it } from "vitest";
import type { BattleData, BattleEnemy } from "@eb/schemas";
import { expandBattleGroupEnemies } from "../src/battleGroups";

describe("battle group formation expansion", () => {
  it("expands group 36 to one Cop and two Runaway Dogs", () => {
    const expanded = expandBattleGroupEnemies(battleData(), {
      id: 36,
      background1: 1,
      background2: 0,
      enemyIds: [54, 121],
      entries: [{ id: 121, amount: 2 }, { id: 54, amount: 1 }]
    });

    expect(expanded.map((enemy) => enemy.id)).toEqual([121, 121, 54]);
    expect(countByName(expanded)).toEqual({ Cop: 1, "Runaway Dog": 2 });
  });

  it("expands group 450 to Malady and two Black Antoids", () => {
    const expanded = expandBattleGroupEnemies(battleData(), {
      id: 450,
      background1: 170,
      background2: 169,
      enemyIds: [37, 209],
      entries: [{ id: 37, amount: 1 }, { id: 209, amount: 2 }]
    });

    expect(expanded.map((enemy) => enemy.id)).toEqual([37, 209, 209]);
    expect(expanded.map((enemy) => enemy.name)).toEqual(["Malady", "Black Antoid", "Black Antoid"]);
  });

  it("falls back to distinct enemy ids for legacy groups without entries", () => {
    const expanded = expandBattleGroupEnemies(battleData(), {
      id: 99,
      background1: 0,
      background2: 0,
      enemyIds: [159, 121]
    });

    expect(expanded.map((enemy) => enemy.name)).toEqual(["Spiteful Crow", "Runaway Dog"]);
  });
});

function battleData(): BattleData {
  return {
    enemies: [
      enemy(37, "Malady"),
      enemy(54, "Cop"),
      enemy(121, "Runaway Dog"),
      enemy(159, "Spiteful Crow"),
      enemy(209, "Black Antoid")
    ]
  } as BattleData;
}

function enemy(id: number, name: string): BattleEnemy {
  return {
    id,
    name,
    spriteId: id,
    level: 1,
    hp: 1,
    defense: 0,
    offense: 0,
    speed: 0,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [
      { id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 },
      { id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 },
      { id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 },
      { id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 }
    ],
    itemDropped: null,
    itemRarity: null
  };
}

function countByName(enemies: BattleEnemy[]): Record<string, number> {
  return enemies.reduce<Record<string, number>>((counts, enemy) => ({
    ...counts,
    [enemy.name]: (counts[enemy.name] ?? 0) + 1
  }), {});
}
