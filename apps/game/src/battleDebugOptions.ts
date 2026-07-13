import type { ItemData, PsiData, UsabilityMatrix } from "@eb/schemas";
import { psiElementForId } from "./battleAffinities";
import {
  isCombatantAlive,
  learnedPsiForCombatant,
  psiBattleKind,
  psiPpCost,
  psiTargetSide,
  psiTargetsAll,
  type BattleSide,
  type BattleState,
  type Combatant
} from "./battleLogic";
import { decodeItemUseEffect, itemEffectTargetSide, type ItemUseEffect } from "./partyState";
import { battleUsablePsi, canUseItemInBattle, itemUsability, targetSideFromRowTargets } from "./usabilityMatrix";
import type {
  BattleDebugItemCategory,
  BattleDebugPsiCategory,
  BattleDebugTargetKind,
  BattleDebugUsableItem,
  BattleDebugUsablePsi
} from "./state";

export type BattleDebugOptionsInput = {
  state: BattleState;
  inputMemberIndex: number | null;
  psi?: readonly PsiData[];
  items?: readonly ItemData[];
  usabilityMatrix?: UsabilityMatrix;
};

export function usablePsiForBattleDebug(input: BattleDebugOptionsInput): BattleDebugUsablePsi[] {
  const actor = currentInputMember(input.state, input.inputMemberIndex);
  if (!actor) {
    return [];
  }

  const learned = learnedPsiForCombatant(input.psi ? [...input.psi] : [], actor);
  const battlePsi = input.usabilityMatrix ? battleUsablePsi(learned, input.usabilityMatrix) : learned;
  return battlePsi.flatMap((psi): BattleDebugUsablePsi[] => {
    if (actor.pp < psiPpCost(psi) || !isSupportedBattlePsi(psi)) {
      return [];
    }
    const targetKind = psiTargetKind(psi);
    if (!targetKind || !hasAvailableTarget(input.state, targetKind, psi.effect)) {
      return [];
    }
    const element = psiElementForId(psi.id) ?? undefined;
    return [{
      id: psi.id,
      name: psi.name,
      ppCost: psiPpCost(psi),
      category: psiCategory(psi),
      targetKind,
      ...(element ? { element } : {})
    }];
  });
}

export function usableItemsForBattleDebug(input: BattleDebugOptionsInput): BattleDebugUsableItem[] {
  const actor = currentInputMember(input.state, input.inputMemberIndex);
  if (!actor) {
    return [];
  }
  const itemById = new Map((input.items ?? []).map((item) => [item.id, item]));
  return actor.inventory.flatMap((itemId, slot): BattleDebugUsableItem[] => {
    const item = itemById.get(itemId);
    if (!item) {
      return [];
    }
    if (input.usabilityMatrix && !canUseItemInBattle(input.usabilityMatrix, item.id)) {
      return [];
    }
    const effect = decodeItemUseEffect(item);
    if (!effect) {
      return [];
    }
    const row = itemUsability(input.usabilityMatrix, item.id);
    const side = targetSideFromRowTargets(row, "battle") ?? itemEffectTargetSide(effect);
    const targetKind = itemTargetKind(side, effect);
    if (!hasAvailableTarget(input.state, targetKind, effect)) {
      return [];
    }
    return [{
      slot,
      id: item.id,
      name: item.name,
      category: itemCategory(effect),
      targetKind
    }];
  });
}

export function psiCategory(psi: Pick<PsiData, "type" | "effect">): BattleDebugPsiCategory {
  if (psi.effect) {
    return psiEffectCategory(psi.effect);
  }
  const kind = psiBattleKind(psi);
  if (kind === "offense") {
    return "offense";
  }
  if (kind === "recovery") {
    return "heal";
  }
  if (kind === "assist") {
    return "assist";
  }
  return "status";
}

export function itemCategory(effect: ItemUseEffect): BattleDebugItemCategory {
  switch (effect.kind) {
    case "healHp":
    case "healHpPercent":
      return "heal";
    case "damage":
    case "drainPp":
    case "inflictStatus":
      return "offense";
    case "revive":
      return "revive";
    case "buffStat":
    case "permStat":
      return "buff";
    case "recoverPp":
    case "recoverPpPercent":
    case "cureStatus":
      return "other";
  }
}

function currentInputMember(state: BattleState, inputMemberIndex: number | null): Combatant | undefined {
  if (inputMemberIndex === null) {
    return undefined;
  }
  const member = state.party[inputMemberIndex];
  return member && !member.isEnemy && isCombatantAlive(member) ? member : undefined;
}

function isSupportedBattlePsi(psi: Pick<PsiData, "type" | "effect">): boolean {
  const kind = psiBattleKind(psi);
  return kind === "offense" || kind === "recovery" || Boolean(psi.effect);
}

function psiEffectCategory(effect: ItemUseEffect): BattleDebugPsiCategory {
  switch (effect.kind) {
    case "damage":
      return "offense";
    case "healHp":
    case "healHpPercent":
      return "heal";
    case "inflictStatus":
    case "cureStatus":
      return "status";
    case "recoverPp":
    case "recoverPpPercent":
    case "drainPp":
    case "buffStat":
    case "permStat":
    case "revive":
      return "assist";
  }
}

function psiTargetKind(psi: Pick<PsiData, "type" | "target" | "direction" | "effect">): BattleDebugTargetKind | null {
  const side = psiTargetSide(psi);
  if (!side) {
    return null;
  }
  return targetKindForSide(side, psiTargetsAll(psi));
}

function itemTargetKind(side: BattleSide, effect: ItemUseEffect): BattleDebugTargetKind {
  if (effect.kind === "revive") {
    return "ally";
  }
  return targetKindForSide(side, false);
}

function targetKindForSide(side: BattleSide, all: boolean): BattleDebugTargetKind {
  if (side === "enemy") {
    return all ? "all" : "enemy";
  }
  return all ? "party" : "ally";
}

function hasAvailableTarget(
  state: BattleState,
  targetKind: BattleDebugTargetKind,
  effect: ItemUseEffect | undefined
): boolean {
  if (effect?.kind === "revive") {
    return state.party.some((member) => !isCombatantAlive(member));
  }
  if (targetKind === "enemy" || targetKind === "all") {
    return state.enemies.some(isCombatantAlive);
  }
  if (targetKind === "ally" || targetKind === "party" || targetKind === "self") {
    return state.party.some(isCombatantAlive);
  }
  return false;
}
