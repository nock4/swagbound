import type { BattleOutcome } from "./battleLogic";

export type BattleMusicCue = "battle" | "boss" | "victory";

export function battleMusicCueForOutcome(outcome: BattleOutcome, isBoss = false): BattleMusicCue {
  if (outcome === "win") {
    return "victory";
  }
  return isBoss ? "boss" : "battle";
}
