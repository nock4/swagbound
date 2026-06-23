import type { BattleSfxCue } from "./audio/battleSfx";
import type { BattleRoundStepNarrationDetails } from "./battleRound";
import {
  battleEventsHaveEnemyDefeated,
  battleEventsHaveMiss,
  battleEventsHaveRecovery,
  battleEventsHaveSmash,
  battleStepEvents,
  firstBattleAction,
  firstBattleDamage,
  type BattleEvent
} from "./battleEvents";

export const BIG_DAMAGE_SFX_THRESHOLD = 60;

export function battleStepSfx(events: readonly BattleEvent[]): BattleSfxCue[];
export function battleStepSfx(details: BattleRoundStepNarrationDetails): BattleSfxCue[];
export function battleStepSfx(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): BattleSfxCue[] {
  // DEFEND produces no battle events, so it's only detectable from the narration kind.
  if (!isBattleEventList(input) && input.kind === "defend") {
    return ["defend"];
  }
  const events = isBattleEventList(input) ? input : battleStepEvents(input);
  const cues: BattleSfxCue[] = [];
  const runEvent = events.find((event) => event.kind === "runSucceeded" || event.kind === "runFailed");
  if (runEvent) {
    cues.push(runEvent.kind === "runSucceeded" ? "run" : "miss");
    appendEnemyDownCue(cues, events);
    return cues;
  }

  const action = firstBattleAction(events);
  const recovery = battleEventsHaveRecovery(events);
  if (!action && recovery) {
    cues.push("heal");
    appendEnemyDownCue(cues, events);
    return cues;
  }

  switch (action?.action) {
    case undefined:
    case "spy":
      break;
    case "attack":
    case "mirror":
      cues.push("swing", impactCue(events));
      break;
    case "psi":
      if (recovery) {
        cues.push("heal");
      } else {
        cues.push("psi", impactCue(events));
      }
      break;
    case "pray":
      if (recovery) {
        cues.push("heal");
      } else if (firstBattleDamage(events)) {
        cues.push("psi", impactCue(events));
      }
      break;
    case "item":
      if (recovery) {
        cues.push("heal");
      } else if (firstBattleDamage(events)) {
        cues.push(impactCue(events));
      }
      break;
  }

  appendEnemyDownCue(cues, events);
  return cues;
}

function impactCue(events: readonly BattleEvent[]): BattleSfxCue {
  const damage = firstBattleDamage(events)?.amount ?? 0;
  if (battleEventsHaveMiss(events) || damage <= 0) {
    return "miss";
  }
  if (battleEventsHaveSmash(events)) {
    return "crit";
  }
  return damage >= BIG_DAMAGE_SFX_THRESHOLD ? "smash" : "hit";
}

function appendEnemyDownCue(cues: BattleSfxCue[], events: readonly BattleEvent[]): void {
  if (battleEventsHaveEnemyDefeated(events)) {
    cues.push("enemyDown");
  }
}

function isBattleEventList(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): input is readonly BattleEvent[] {
  return Array.isArray(input);
}
