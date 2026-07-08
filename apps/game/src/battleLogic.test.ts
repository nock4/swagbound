import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BattleData, BattleEnemy, CharacterCollection, EnemyStatOverrides, ItemData } from "@eb/schemas";
import { describe, expect, it } from "vitest";
import {
  applyVictoryRewards,
  buildVictorySummaryViewModel,
  createBattleRng,
  createBattleState,
  outcome,
  resolveInstantWinRewards,
  resolveItemTurn,
  resolvePhysicalAttackDamage,
  tickBattleMeters,
  type BattleState,
  type BattleActor,
  type Rng
} from "./battleLogic";
import { expandBattleGroupEnemies } from "./battleGroups";
import { resolveRoundStep } from "./battleRound";

const PARTY0: BattleActor = { side: "party", index: 0 };

function enemy(overrides: Partial<BattleEnemy> = {}): BattleEnemy {
  return {
    id: 9001,
    name: "DUMMY",
    spriteId: 0,
    level: 10,
    hp: 500,
    defense: 4,
    offense: 10,
    speed: 4,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [0, 1, 2, 3].map(() => ({ id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 })) as BattleEnemy["actions"],
    itemDropped: null,
    itemRarity: null,
    ...overrides
  };
}

function consumableItem(effect: ItemData["effect"], id = 159): ItemData {
  return {
    id,
    name: "Test item",
    type: 36,
    cost: 0,
    action: 249,
    argument: 0,
    equippable: false,
    miscFlags: ["item disappears when used"],
    effect
  };
}

function sequenceRng(values: number[]): Rng {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0;
}

function defeatedEnemyBattle(
  enemyOverrides: Partial<BattleEnemy>,
  options: { wallet: number; bank: number }
) {
  const battle = createBattleState(enemy(enemyOverrides), options);
  return {
    ...battle,
    enemies: battle.enemies.map((combatant) => ({
      ...combatant,
      hp: { ...combatant.hp, displayed: 0, target: 0, isRolling: false }
    }))
  };
}

describe("battle item stat buffs", () => {
  it("preserves additive buffStat behavior", () => {
    const battle = createBattleState(enemy(), { defense: 12 });
    battle.party[0].inventory = [161];

    const result = resolveItemTurn(
      battle,
      PARTY0,
      consumableItem({ kind: "buffStat", stat: "defense", amount: 5 }, 161),
      { inventorySlot: 0, targetIndex: 0 }
    );

    expect(result.skipped).toBe(false);
    expect(result.state.party[0].defense).toBe(17);
  });

  it("doubles effective guts for SMAAAASH chance", () => {
    const battle = createBattleState(enemy(), { statBonuses: { guts: 40 } });
    battle.party[0].inventory = [159];

    const before = resolvePhysicalAttackDamage(
      battle.party[0],
      battle.enemies[0],
      sequenceRng([0.99, 0.12, 0.5])
    );
    const result = resolveItemTurn(
      battle,
      PARTY0,
      consumableItem({ kind: "buffStat", stat: "guts", multiplier: 2 }),
      { inventorySlot: 0, targetIndex: 0 }
    );
    const after = resolvePhysicalAttackDamage(
      result.state.party[0],
      result.state.enemies[0],
      sequenceRng([0.99, 0.12, 0.5])
    );

    expect(result.skipped).toBe(false);
    expect(result.state.party[0].stats.guts).toBe(80);
    expect(before.smash).toBe(false);
    expect(after.smash).toBe(true);
  });
});

describe("battle rewards economy", () => {
  it("deposits victory money into the bank without increasing wallet cash", () => {
    const battle = defeatedEnemyBattle({ money: 42 }, { wallet: 10, bank: 100 });

    const result = applyVictoryRewards(battle);

    expect(result.state.wallet).toBe(10);
    expect(result.state.bank).toBe(142);
    expect(result.summary.moneyGained).toBe(42);
    expect(buildVictorySummaryViewModel(result.summary).pages[0]).toContain(
      "The connect wired $42 to your account."
    );
  });

  it("deposits instant-win money into the bank too", () => {
    const setup = createBattleState(enemy({ money: 35 }), { wallet: 7, bank: 12 });

    const result = resolveInstantWinRewards(setup.party, [enemy({ money: 35 })], {
      wallet: setup.wallet,
      bank: setup.bank
    });

    expect(result.state.wallet).toBe(7);
    expect(result.state.bank).toBe(47);
    expect(result.summary.moneyGained).toBe(35);
  });
});

describe("headless battle group simulation", () => {
  it.each([4, 6])("terminates generated battle group %s", (groupId) => {
    const result = simulateGeneratedGroup(groupId);

    expect(result.outcome).not.toBe("ongoing");
    expect(result.rounds).toBeLessThan(200);
  });
});

function simulateGeneratedGroup(groupId: number): { outcome: ReturnType<typeof outcome>; rounds: number } {
  const battleData = readGenerated("battle.json") as BattleData;
  const resolvedBattleData = applyEnemyStatOverridesForTest(
    battleData,
    readGenerated("enemy-stat-overrides.json") as EnemyStatOverrides
  );
  const characters = readGenerated("characters.json") as CharacterCollection;
  const group = battleData.groups.find((entry) => entry.id === groupId);
  if (!group) {
    throw new Error(`Missing generated battle group ${groupId}`);
  }
  const enemies = expandBattleGroupEnemies(resolvedBattleData, group);
  let battle: BattleState = createBattleState(enemies, { characters });
  const rng = createBattleRng(groupId);
  let result = outcome(battle);
  let rounds = 0;
  for (; rounds < 200 && result === "ongoing"; rounds += 1) {
    for (let i = 0; i < battle.party.length && result === "ongoing"; i += 1) {
      if (!targetHpAlive(battle.party[i])) continue;
      const targetIndex = firstTargetHpAliveIndex(battle.enemies);
      battle = resolveRoundStep(battle, { side: "party", index: i }, {
        partySlot: i,
        command: "AUTO",
        target: { side: "enemy", index: Math.max(0, targetIndex) }
      }, rng, {}).state;
      result = outcome(battle);
    }
    for (let i = 0; i < battle.enemies.length && result === "ongoing"; i += 1) {
      if (!targetHpAlive(battle.enemies[i])) continue;
      battle = resolveRoundStep(battle, { side: "enemy", index: i }, undefined, rng, {}).state;
      result = outcome(battle);
    }
    battle = tickBattleMeters(battle, 10000);
    result = outcome(battle);
  }
  return { outcome: result, rounds };
}

function readGenerated(file: string): unknown {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  return JSON.parse(readFileSync(path.join(root, "apps/game/public/generated", file), "utf8"));
}

function targetHpAlive(combatant: { hp: { target: number } } | undefined): boolean {
  return (combatant?.hp.target ?? 0) > 0;
}

function firstTargetHpAliveIndex(combatants: Array<{ hp: { target: number } }>): number {
  return combatants.findIndex(targetHpAlive);
}

function applyEnemyStatOverridesForTest(battleData: BattleData, overrides: EnemyStatOverrides): BattleData {
  return {
    ...battleData,
    enemies: battleData.enemies.map((enemy) => {
      const override = overrides.byEnemyId[String(enemy.id)];
      return override ? { ...enemy, ...override } : enemy;
    })
  };
}
