import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BattleDataSchema,
  CharacterCollectionSchema,
  ItemCollectionSchema,
  type BattleData,
  type BattleEnemy,
  type CharacterCollection,
  type ItemCollection,
  type ItemData
} from "@eb/schemas";
import {
  applyVictoryRewards,
  buildEnemyCombatant,
  buildPlayerCombatant,
  createBattleState,
  damage,
  outcome,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolveTurn,
  selectEnemyAction,
  tickBattleMeters,
  turnOrder,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../src/battleLogic";
import { decodeItemUseEffect, isConsumableItem, PartyState, type ItemUseEffect } from "../src/partyState";
import { setTarget } from "../src/rollingMeter";

// QA: battle-combat domain. Exercises battleLogic.ts pure functions against the
// REAL generated battle.json (Onett -> Giant Step slice). IP rule: this file
// only references numeric enemy/group ids, never EarthBound name strings.

// First Act bosses by enemy id (verified bossFlag=true in generated data).
const GIANT_STEP_BOSS_ID = 37; // group 450 primary boss
const GIANT_STEP_GROUP_ID = 450;
const ACT1_BOSS_IDS = [37, 130, 131, 214]; // Giant Step boss, two robots, Starman Jr equivalent
const REQUIRED_ITEM_EFFECTS = new Map<number, ItemUseEffect["kind"]>([
  [106, "healHp"],
  [232, "healHp"],
  [89, "healHp"],
  [90, "healHp"],
  [91, "healHp"],
  [103, "healHp"],
  [110, "recoverPp"]
]);
const FOOD_DRINK_ACTION_ID = 249;
const FOOD_DRINK_TYPES = new Set([32, 36]);
const NON_CONSUMABLE_WEAPON_ID = 17;

let battleData: BattleData;
let itemData: ItemCollection;
let characterData: CharacterCollection;

function enemyById(id: number): BattleEnemy {
  const found = battleData.enemies.find((enemy) => enemy.id === id);
  if (!found) {
    throw new Error(`enemy id ${id} missing from generated battle data`);
  }
  return found;
}

function itemById(id: number): ItemData {
  const found = itemData.items.find((item) => item.id === id);
  if (!found) {
    throw new Error(`item id ${id} missing from generated item data`);
  }
  return found;
}

function actor(side: "party" | "enemy", index: number): BattleActor {
  return { side, index };
}

function drainDisplayedHp(battle: BattleState, target: BattleActor): BattleState {
  const combatant = target.side === "party" ? battle.party[target.index] : battle.enemies[target.index];
  return tickBattleMeters(
    withCombatant(battle, target, { ...combatant, hp: setTarget(combatant.hp, 0) }),
    15_000
  );
}

beforeAll(async () => {
  battleData = BattleDataSchema.parse(
    JSON.parse(await readFile(resolve("apps/game/public/generated/battle.json"), "utf8"))
  );
  itemData = ItemCollectionSchema.parse(
    JSON.parse(await readFile(resolve("apps/game/public/generated/items.json"), "utf8"))
  );
  characterData = CharacterCollectionSchema.parse(
    JSON.parse(await readFile(resolve("apps/game/public/generated/characters.json"), "utf8"))
  );
});

describe("qa generated item-use effects", () => {
  it("decodes grocery and starting food/drink consumables without treating equipment as healing", () => {
    const startingFoodDrinkIds = new Set(characterData.characters
      .flatMap((character) => character.startingItems)
      .filter((id) => {
        const item = itemById(id);
        return isConsumableItem(item) &&
          item.action === FOOD_DRINK_ACTION_ID &&
          FOOD_DRINK_TYPES.has(item.type);
      }));

    for (const id of [91, 103, 110]) {
      expect(startingFoodDrinkIds.has(id), `starting food/drink item ${id} should be covered`).toBe(true);
    }

    const requiredIds = new Set([...REQUIRED_ITEM_EFFECTS.keys(), ...startingFoodDrinkIds]);
    for (const id of requiredIds) {
      const item = itemById(id);
      const effect = decodeItemUseEffect(item);
      expect(effect?.kind, `item ${id} effect kind`).toBe(REQUIRED_ITEM_EFFECTS.get(id));
      expect(itemEffectMagnitude(effect), `item ${id} effect magnitude`).toBeGreaterThan(0);
    }

    expect(decodeItemUseEffect(itemById(NON_CONSUMABLE_WEAPON_ID))).toBeUndefined();
  });

  it("applies a generated healing item through the field party state", () => {
    const item = itemById(106);
    const state = new PartyState();
    state.give(0, item.id);

    const result = state.useItem({
      ownerChar: 0,
      targetChar: 0,
      item,
      targetVitals: { hp: 10, maxHp: 40, pp: 0, maxPp: 0 }
    });

    expect(result).toMatchObject({ ok: true, itemId: item.id, previousValue: 10, nextValue: 16 });
    expect(state.inventory(0)).toEqual([]);
    expect(state.vitals(0)?.hp.target).toBe(16);
  });

  it("applies a generated healing item through battle Goods", () => {
    const item = itemById(90);
    let battle = createBattleState([enemyById(GIANT_STEP_BOSS_ID)], { maxHp: 120 });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      inventory: [item.id],
      hp: { ...battle.party[0].hp, displayed: 20, target: 20, isRolling: false }
    });

    const result = resolveItemTurn(battle, actor("party", 0), item, { inventorySlot: 0, targetIndex: 0 });

    expect(result.skipped).toBe(false);
    expect(result.itemConsumed).toBe(true);
    expect(result.amount).toBeGreaterThan(0);
    expect(result.state.party[0].inventory).toEqual([]);
    expect(result.state.party[0].hp.target).toBeGreaterThan(20);
  });
});

describe("qa battle data integrity", () => {
  it("parses generated battle data and exposes a non-trivial enemy/group roster", () => {
    expect(battleData.enemies.length).toBeGreaterThan(100);
    expect(battleData.groups.length).toBeGreaterThan(100);
  });

  it("includes the Giant Step boss group with the boss as its lead enemy", () => {
    const group = battleData.groups.find((entry) => entry.id === GIANT_STEP_GROUP_ID);
    expect(group).toBeDefined();
    expect(group?.enemyIds[0]).toBe(GIANT_STEP_BOSS_ID);
    expect(group?.enemyIds).toContain(GIANT_STEP_BOSS_ID);
  });

  it("gives every Act-1 boss sane, boss-flagged combat stats", () => {
    for (const id of ACT1_BOSS_IDS) {
      const boss = enemyById(id);
      expect(boss.bossFlag).toBe(true);
      expect(boss.hp).toBeGreaterThan(0);
      expect(boss.offense).toBeGreaterThan(0);
      expect(boss.defense).toBeGreaterThanOrEqual(0);
      expect(boss.actions).toHaveLength(4);
      // actionType is bounded 0..5 and target 0..4 per schema; assert decode-safety.
      for (const action of boss.actions) {
        expect(action.actionType ?? 0).toBeGreaterThanOrEqual(0);
        expect(action.actionType ?? 0).toBeLessThanOrEqual(5);
        expect(action.target ?? 0).toBeGreaterThanOrEqual(0);
        expect(action.target ?? 0).toBeLessThanOrEqual(4);
      }
    }
  });

  it("keeps the Giant Step boss within a plausible level/hp band for the slice", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID);
    expect(boss.level).toBeGreaterThan(0);
    expect(boss.hp).toBeGreaterThan(100); // a real wall, not a trash mob
    expect(boss.hp).toBeLessThan(1000); // not absurd for a first boss
    expect(boss.experience).toBeGreaterThan(0);
    expect(boss.money).toBeGreaterThan(0);
  });
});

describe("qa damage calculation against real boss stats", () => {
  it("is deterministic: base = offense - floor(defense/2), spread 0.9..1.1", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID); // defense 23 in generated data
    const hero = buildPlayerCombatant({ offense: 40 });
    const bossCombatant = buildEnemyCombatant(boss);
    // base = 40 - floor(23/2) = 40 - 11 = 29
    expect(damage(hero, bossCombatant, () => 0)).toBe(26); // floor(29 * 0.90)
    expect(damage(hero, bossCombatant, () => 0.5)).toBe(29); // floor(29 * 1.00)
    expect(damage(hero, bossCombatant, () => 1)).toBe(31); // floor(29 * 1.10)
  });

  it("never deals less than 1 damage even when defense overwhelms offense", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID); // high defense
    const weakling = buildPlayerCombatant({ offense: 1 });
    const bossCombatant = buildEnemyCombatant(boss);
    expect(damage(weakling, bossCombatant, () => 0)).toBe(1);
    expect(damage(weakling, bossCombatant, () => 1)).toBe(1);
  });
});

describe("qa turn order / speed sort against real boss stats", () => {
  it("sorts living combatants by descending speed with deterministic side ties", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID); // speed 6
    const second = enemyById(battleData.groups.find((g) => g.id === GIANT_STEP_GROUP_ID)!.enemyIds[1]);
    // Player faster than both enemies -> party0 first, then enemies by speed.
    const battle = createBattleState([boss, second], { speed: 12, offense: 40, maxHp: 200 });
    const order = turnOrder(battle).map((entry) => `${entry.side}${entry.index}`);
    expect(order[0]).toBe("party0");
    // boss (speed 6) outranks the slower second enemy (speed 4) in descending sort.
    expect(order).toEqual(["party0", "enemy0", "enemy1"]);
  });

  it("drops displayed-dead combatants out of the turn order", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID);
    let battle = createBattleState([boss], { speed: 12 });
    battle = drainDisplayedHp(battle, actor("enemy", 0));
    expect(turnOrder(battle).map((entry) => `${entry.side}${entry.index}`)).toEqual(["party0"]);
  });
});

describe("qa victory detection and rewards against the real boss group", () => {
  it("declares a win only after every enemy display HP is drained", () => {
    const group = battleData.groups.find((g) => g.id === GIANT_STEP_GROUP_ID)!;
    const enemies = group.enemyIds.map(enemyById);
    let battle = createBattleState(enemies, { offense: 40, maxHp: 200 });
    expect(outcome(battle)).toBe("ongoing");
    battle = drainDisplayedHp(battle, actor("enemy", 0));
    expect(outcome(battle)).toBe("ongoing"); // second enemy still standing
    battle = drainDisplayedHp(battle, actor("enemy", 1));
    expect(outcome(battle)).toBe("win");
  });

  it("awards summed EXP and money for the defeated boss group", () => {
    const group = battleData.groups.find((g) => g.id === GIANT_STEP_GROUP_ID)!;
    const enemies = group.enemyIds.map(enemyById);
    const expectedExp = enemies.reduce((sum, enemy) => sum + enemy.experience, 0);
    const expectedMoney = enemies.reduce((sum, enemy) => sum + enemy.money, 0);
    let battle = createBattleState(enemies, { offense: 40, maxHp: 200 });
    battle = {
      ...battle,
      enemies: battle.enemies.map((enemy) => ({
        ...enemy,
        hp: { ...enemy.hp, displayed: 0, target: 0, isRolling: false }
      }))
    };
    const { summary } = applyVictoryRewards(battle, { rng: () => 0.999 });
    expect(summary.expGained).toBe(expectedExp);
    expect(summary.moneyGained).toBe(expectedMoney);
  });

  it("is winnable: a strong party defeats the full boss group via BASH turns", () => {
    const group = battleData.groups.find((g) => g.id === GIANT_STEP_GROUP_ID)!;
    const enemies = group.enemyIds.map(enemyById);
    let battle = createBattleState(enemies, { offense: 60, maxHp: 400, speed: 20 });
    let safety = 0;
    while (outcome(battle) === "ongoing" && safety < 200) {
      const targetIndex = battle.enemies.findIndex(
        (enemy) => enemy.hp.target > 0 || enemy.hp.displayed > 0
      );
      const result = resolveTurn(battle, actor("party", 0), () => 0.5, { targetIndex });
      battle = tickBattleMeters(result.state, 15_000);
      safety += 1;
    }
    expect(outcome(battle)).toBe("win");
  });
});

describe("qa enemy AI action selection on real boss tables", () => {
  it("round-robins deterministically across the boss's four action slots", () => {
    const boss = enemyById(GIANT_STEP_BOSS_ID);
    // selection wraps modulo 4 and is stable.
    expect(selectEnemyAction(boss.actions, 0).actionIndex).toBe(0);
    expect(selectEnemyAction(boss.actions, 3).actionIndex).toBe(3);
    expect(selectEnemyAction(boss.actions, 4).actionIndex).toBe(0);
    expect(selectEnemyAction(boss.actions, 7).actionIndex).toBe(3);
  });

  it("lands at least one HP-dealing turn within a full 4-slot rotation", () => {
    // Document/guard the round-robin reality: not every slot deals damage
    // (status slots with target=0 resolve to no-ops), but a boss must threaten
    // the party at least once per rotation.
    const boss = enemyById(GIANT_STEP_BOSS_ID);
    let battle = createBattleState(boss, { maxHp: 400, defense: 6 });
    let dealtDamage = false;
    for (let slot = 0; slot < 4; slot += 1) {
      const result = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);
      if (result.amount > 0) {
        dealtDamage = true;
      }
      battle = result.state;
    }
    expect(dealtDamage).toBe(true);
  });
});

function itemEffectMagnitude(effect: ItemUseEffect | undefined): number {
  if (!effect) {
    return 0;
  }
  return "amount" in effect ? effect.amount : effect.percent;
}
