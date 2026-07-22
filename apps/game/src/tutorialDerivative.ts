import type { BattleCommand, BattleState } from "./battleLogic";

export const TUTORIAL_DERIVATIVE_ENEMY_ID = 900001;

export function tutorialDerivativeActionIndex(command: BattleCommand | undefined): number {
  switch (command) {
    case undefined:
    case "RUN":
    case "GOODS":
      return 0;
    case "BASH":
    case "AUTO":
    case "SPY":
    case "MIRROR":
      return 1;
    case "DEFEND":
      return 2;
    case "PSI":
    case "PRAY":
      return 3;
    // CONVINCE never queues a round action (scene-intercepted), so the mimic
    // treats it as idle.
    case "CONVINCE":
      return 0;
  }
}

export function tutorialDerivativeMimicLine(name: string, command: BattleCommand | undefined): string {
  return command
    ? `${name} filed Bosch's ${command} and ran it back!`
    : `${name} reads Bosch's file.`;
}

/** Stage the prior lead command before the next round begins. */
export function stageTutorialDerivativeMimic(
  state: BattleState,
  command: BattleCommand | undefined
): BattleState {
  let changed = false;
  const enemies = state.enemies.map((enemy) => {
    if (enemy.charId !== TUTORIAL_DERIVATIVE_ENEMY_ID) {
      return enemy;
    }
    changed = true;
    return {
      ...enemy,
      nextActionIndex: tutorialDerivativeActionIndex(command),
      defending: command === "DEFEND"
    };
  });
  return changed ? { ...state, enemies } : state;
}
