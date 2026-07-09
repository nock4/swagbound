import type { BattleCommand } from "./battleLogic";
import { itemEffectTargetSide, type ItemUseEffect } from "./partyState";

export type CommandEnemyTargetMode = "bash" | "spy" | "mirror";
type CureStatusAilment = Extract<ItemUseEffect, { kind: "cureStatus" }>["ailment"];
type ItemStat = Extract<ItemUseEffect, { kind: "buffStat" | "permStat" }>["stat"];

export type CommandTargetSelectionPlan =
  | { submenu: "target"; targetMode: CommandEnemyTargetMode }
  | { submenu: "command"; targetMode: CommandEnemyTargetMode | null };

export function enemyTargetModeForCommand(command: BattleCommand): CommandEnemyTargetMode | null {
  switch (command) {
    case "BASH":
      return "bash";
    case "SPY":
      return "spy";
    case "MIRROR":
      return "mirror";
    default:
      return null;
  }
}

export function commandTargetSelectionPlan(
  command: BattleCommand,
  livingEnemyCount: number
): CommandTargetSelectionPlan {
  const targetMode = enemyTargetModeForCommand(command);
  // Always require an explicit target pick for single-target enemy actions, even
  // in a 1-versus-1 fight (mirrors the ally/heal flow, which already does this).
  // Only skip when there is no living enemy to point at.
  if (targetMode && livingEnemyCount > 0) {
    return { submenu: "target", targetMode };
  }
  return { submenu: "command", targetMode };
}

export function shouldOpenEnemyTargetSelection(command: BattleCommand, livingEnemyCount: number): boolean {
  return commandTargetSelectionPlan(command, livingEnemyCount).submenu === "target";
}

export function battleItemEffectDescription(effect: ItemUseEffect | undefined): string {
  if (!effect) {
    return "No battle effect";
  }
  switch (effect.kind) {
    case "healHp":
      return `Restores ${effect.amount} HP`;
    case "healHpPercent":
      return `Restores ${effect.percent}% HP`;
    case "recoverPp":
      return `Restores ${effect.amount} PP`;
    case "recoverPpPercent":
      return `Restores ${effect.percent}% PP`;
    case "damage":
      return `Hits one enemy for ${effect.amount} damage`;
    case "drainPp":
      return `Drains ${effect.amount} PP from one enemy`;
    case "buffStat":
      return battleStatBuffDescription(effect);
    case "permStat":
      return `Permanently ${effect.amount < 0 ? "lowers" : "raises"} ${statLabel(effect.stat)} by ${Math.abs(effect.amount)}`;
    case "revive":
      return `Revives one friend with ${effect.amount} HP`;
    case "cureStatus":
      return cureStatusDescription(effect.ailment);
    case "inflictStatus":
      return inflictStatusDescription(effect);
  }
}

function battleStatBuffDescription(effect: Extract<ItemUseEffect, { kind: "buffStat" }>): string {
  const target = itemEffectTargetSide(effect) === "enemy" ? "one enemy" : "one friend";
  const stat = statLabel(effect.stat);
  const amount = effect.amount ?? 0;
  const multiplier = effect.multiplier ?? 1;
  if (amount < 0 || multiplier < 1) {
    return `Lowers ${target}'s ${stat}${amount < 0 ? ` by ${Math.abs(amount)}` : ""}`;
  }
  if (multiplier !== 1 && amount === 0) {
    return multiplier === 2
      ? `Doubles ${target}'s ${stat}`
      : `Multiplies ${target}'s ${stat} by ${formatMultiplier(multiplier)}`;
  }
  return `Raises ${target}'s ${stat}${amount > 0 ? ` by ${amount}` : ""}`;
}

function cureStatusDescription(ailment: CureStatusAilment): string {
  switch (ailment) {
    case "all":
      return "Cures all ailments";
    case "poisoned":
      return "Cures poison";
    case "paralyzed":
      return "Cures paralysis";
    case "asleep":
      return "Wakes one friend";
    case "confused":
      return "Cures confusion";
    case "shielded":
      return "Removes shield";
    case "sunstroke":
      return "Cures sunstroke";
  }
}

function inflictStatusDescription(effect: Extract<ItemUseEffect, { kind: "inflictStatus" }>): string {
  const turns = effect.remaining !== undefined ? ` for ${effect.remaining} turns` : "";
  switch (effect.ailment) {
    case "shielded":
      return `Shields one friend${turns}`;
    case "poisoned":
      return `Poisons one enemy${turns}`;
    case "paralyzed":
      return `Paralyzes one enemy${turns}`;
    case "asleep":
      return `Puts one enemy to sleep${turns}`;
    case "confused":
      return `Confuses one enemy${turns}`;
    case "sunstroke":
      return `Inflicts sunstroke on one enemy${turns}`;
  }
}

function statLabel(stat: ItemStat): string {
  return stat === "iq" ? "IQ" : stat;
}

function formatMultiplier(multiplier: number): string {
  return Number.isInteger(multiplier) ? `${multiplier}x` : `${Number(multiplier.toFixed(2))}x`;
}
