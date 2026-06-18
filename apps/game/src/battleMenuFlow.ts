import type { BattleCommand } from "./battleLogic";

export type CommandEnemyTargetMode = "bash" | "spy" | "mirror";

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
  if (targetMode && livingEnemyCount > 1) {
    return { submenu: "target", targetMode };
  }
  return { submenu: "command", targetMode };
}

export function shouldOpenEnemyTargetSelection(command: BattleCommand, livingEnemyCount: number): boolean {
  return commandTargetSelectionPlan(command, livingEnemyCount).submenu === "target";
}
