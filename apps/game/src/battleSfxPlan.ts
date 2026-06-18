import type { BattleSfxCue } from "./audio/battleSfx";
import type { BattleRoundStepNarrationDetails } from "./battleRound";

export const BIG_DAMAGE_SFX_THRESHOLD = 60;

export function battleStepSfx(details: BattleRoundStepNarrationDetails): BattleSfxCue[] {
  const cues: BattleSfxCue[] = [];

  switch (details.kind) {
    case "skip":
    case "defend":
    case "spy":
      break;
    case "run":
      if (details.fled) {
        cues.push("run");
      } else {
        cues.push("miss");
      }
      break;
    case "attack":
    case "mirror":
      cues.push("swing", impactCue(details));
      break;
    case "psi":
      if (isRecovery(details)) {
        cues.push("heal");
      } else {
        cues.push("psi", impactCue(details));
      }
      break;
    case "pray":
      if (isRecovery(details)) {
        cues.push("heal");
      } else if ((details.damage ?? 0) > 0) {
        cues.push("psi", impactCue(details));
      }
      break;
    case "item":
      if (isRecovery(details)) {
        cues.push("heal");
      } else if ((details.damage ?? 0) > 0) {
        cues.push(impactCue(details));
      }
      break;
  }

  if (details.targetDied) {
    cues.push("enemyDown");
  }
  return cues;
}

function impactCue(details: Pick<BattleRoundStepNarrationDetails, "damage" | "missed" | "smash">): BattleSfxCue {
  if (details.missed || (details.damage ?? 0) <= 0) {
    return "miss";
  }
  if (details.smash) {
    return "smash";
  }
  return (details.damage ?? 0) >= BIG_DAMAGE_SFX_THRESHOLD ? "smash" : "hit";
}

function isRecovery(details: Pick<BattleRoundStepNarrationDetails, "healed" | "ppRestored">): boolean {
  return (details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0;
}
