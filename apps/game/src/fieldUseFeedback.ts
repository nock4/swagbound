import type { ItemData, PsiData, UsabilityItemRow } from "@eb/schemas";
import { psiBattleKind, psiEffectAmount } from "./battleLogic";
import { itemEffectTargetSide, type CondimentCombineResult, type ItemUseEffect, type ItemUseResult, type FieldPsiUseResult } from "./partyState";

type Named = { name: string };

export function fieldItemUseMessage(
  target: Named,
  item: Pick<ItemData, "name">,
  row: Pick<UsabilityItemRow, "useVerb"> | undefined,
  result: Extract<ItemUseResult, { ok: true }>
): string {
  const lead = `${target.name} ${row?.useVerb ?? "used"} the ${item.name}!`;
  return joinSentences(lead, recoveryMessage(target.name, result.effect, result.previousValue, result.nextValue));
}

export function fieldItemToolMessage(user: Named, item: Pick<ItemData, "name">, row: Pick<UsabilityItemRow, "useVerb"> | undefined): string {
  return `${user.name} ${row?.useVerb ?? "used"} the ${item.name}!`;
}

export function fieldCondimentUseMessage(
  user: Named,
  condiment: Pick<ItemData, "name">,
  base: Pick<ItemData, "name">,
  result: Extract<CondimentCombineResult, { ok: true }>
): string {
  const multiplier = result.multiplier > 1 ? " It heals more now." : "";
  return `${user.name} put the ${condiment.name} on the ${base.name}.${multiplier}`;
}

export function fieldPsiUseMessage(
  caster: Named,
  target: Named,
  psi: Pick<PsiData, "name">,
  result: Extract<FieldPsiUseResult, { ok: true }>
): string {
  const lead = `${caster.name} used ${psi.name.trim() || "PSI"}!`;
  return result.effect
    ? joinSentences(lead, recoveryMessage(target.name, result.effect, result.previousValue, result.nextValue))
    : lead;
}

export function fieldPsiEffect(psi: PsiData): ItemUseEffect | undefined {
  if (psi.effect && itemEffectTargetSide(psi.effect) === "party") {
    return psi.effect;
  }
  if (psiBattleKind(psi) !== "recovery" || psi.direction === "enemy" || /magnet/i.test(psi.name)) {
    return undefined;
  }
  if (psi.id >= 27 && psi.id <= 30 || /\bhealing\b/i.test(psi.name)) {
    return { kind: "cureStatus", ailment: "all" };
  }
  return { kind: "healHp", amount: psiEffectAmount(psi, "recovery") };
}

function recoveryMessage(name: string, effect: ItemUseEffect, previousValue: number, nextValue: number): string {
  const delta = Math.max(0, nextValue - previousValue);
  switch (effect.kind) {
    case "healHp":
    case "healHpPercent":
      return `${name} recovered ${delta} HP!`;
    case "recoverPp":
    case "recoverPpPercent":
      return `${name} recovered ${delta} PP!`;
    case "revive":
      return nextValue > previousValue ? `${name} came back to life!` : `${name} did not revive.`;
    case "cureStatus":
      return effect.ailment === "all" ? `${name}'s ailments were cured!` : `${name} is no longer ${effect.ailment}!`;
    case "buffStat":
      return `${name}'s ${effect.stat} went up!`;
    case "permStat":
      return `${name}'s ${effect.stat} rose for good!`;
    case "inflictStatus":
      return effect.ailment === "shielded" ? `${name} is shielded!` : `${name} is now ${effect.ailment}!`;
    case "damage":
    case "drainPp":
      return "";
  }
}

function joinSentences(first: string, second: string): string {
  return second ? `${first} ${second}` : first;
}
