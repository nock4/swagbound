import type { ItemData, PsiData, UsabilityMatrix } from "@eb/schemas";
import { describe, expect, it } from "vitest";
import { usableItemsForBattleDebug, usablePsiForBattleDebug } from "./battleDebugOptions";
import { createBattleState, type BattleState } from "./battleLogic";

const matrix: UsabilityMatrix = {
  schema: "swagbound.usability-matrix.v1",
  generatedFrom: {
    items: "test",
    psi: "test",
    itemOverrides: "test",
    psiOverrides: "test",
    keyItems: "test",
    battleActions: "test",
    derivation: "test"
  },
  itemTypeContexts: [],
  items: [
    itemRow(1, "Snack", true, ["battle:party:one"], "healHp 30"),
    itemRow(2, "Rocket", true, ["battle:enemy:one"], "damage 90"),
    itemRow(3, "Badge", false, [], "action item")
  ],
  psi: [
    psiRow(5, "Fire", true, ["battle:enemy:all"], 6),
    psiRow(25, "Lifeup", true, ["battle:party:one"], 5),
    psiRow(33, "Shield", true, ["battle:party:one"], 8)
  ]
};

describe("battle debug usable options", () => {
  it("surfaces only affordable battle PSI with derived category, target kind, and element", () => {
    const state = battleState();
    state.party[0] = { ...state.party[0], pp: 6 };
    const options = usablePsiForBattleDebug({
      state,
      inputMemberIndex: 0,
      usabilityMatrix: matrix,
      psi: [
        psi(5, "Fire", "offense", "alpha", "all", "enemy", 1),
        psi(25, "Lifeup", "recovery", "alpha", "one", "party", 1),
        psi(33, "Shield", "assist", "alpha", "one", "party", 1, { kind: "buffStat", stat: "defense", amount: 10 })
      ]
    });

    expect(options).toEqual([
      { id: 5, name: "Fire", ppCost: 6, category: "offense", targetKind: "all", element: "fire" },
      { id: 25, name: "Lifeup", ppCost: 5, category: "heal", targetKind: "ally" }
    ]);
  });

  it("surfaces only present battle-usable items with categories from effects", () => {
    const state = battleState();
    state.party[0] = { ...state.party[0], inventory: [1, 2, 3] };
    const options = usableItemsForBattleDebug({
      state,
      inputMemberIndex: 0,
      usabilityMatrix: matrix,
      items: [
        item(1, "Snack", { kind: "healHp", amount: 30 }),
        item(2, "Rocket", { kind: "damage", amount: 90 }),
        item(3, "Badge", { kind: "buffStat", stat: "defense", amount: 10 })
      ]
    });

    expect(options).toEqual([
      { slot: 0, id: 1, name: "Snack", category: "heal", targetKind: "ally" },
      { slot: 1, id: 2, name: "Rocket", category: "offense", targetKind: "enemy" }
    ]);
  });
});

function battleState(): BattleState {
  return createBattleState({
    id: 1,
    name: "Enemy",
    hp: 80,
    offense: 10,
    defense: 5,
    speed: 5,
    spriteId: 1,
    level: 1,
    experience: 1,
    money: 1,
    itemDropped: null,
    itemRarity: { numerator: 0, denominator: 1 },
    bossFlag: false,
    actions: []
  }, {
    partyOptions: [{
      name: "Tester",
      level: 8,
      maxHp: 100,
      offense: 10,
      defense: 5,
      speed: 5
    }]
  });
}

function itemRow(id: number, name: string, battleUse: boolean, targets: string[], effectSummary: string) {
  return {
    id,
    name,
    type: 0,
    fieldUse: battleUse,
    battleUse,
    equippable: false,
    keyItem: false,
    targets,
    effectSummary,
    useVerb: "used" as const
  };
}

function psiRow(id: number, name: string, battleUse: boolean, targets: string[], ppCost: number) {
  return { id, name, fieldUse: false, battleUse, targets, ppCost };
}

function item(id: number, name: string, effect: ItemData["effect"]): ItemData {
  return {
    id,
    name,
    type: 0,
    cost: 0,
    action: 0,
    argument: 0,
    equippable: false,
    miscFlags: ["Item disappears when used"],
    effect
  };
}

function psi(
  id: number,
  name: string,
  type: string,
  strength: string,
  target: PsiData["target"],
  direction: PsiData["direction"],
  level: number,
  effect?: PsiData["effect"]
): PsiData {
  return {
    id,
    name,
    type,
    strength,
    ppCost: matrix.psi.find((row) => row.id === id)?.ppCost ?? 0,
    target,
    direction,
    usableOutsideBattle: false,
    learnedBy: [{ charId: 0, level }],
    ...(effect ? { effect } : {})
  };
}
