import type { BattleRoundStepNarrationDetails } from "./battleRound";
import { battleStepEvents, type BattleActionStartedEvent, type BattleEvent } from "./battleEvents";

export function composeBattleStepLines(events: readonly BattleEvent[]): string[];
export function composeBattleStepLines(details: BattleRoundStepNarrationDetails): string[];
export function composeBattleStepLines(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): string[] {
  const events = isBattleEventList(input) ? input : battleStepEvents(input);
  const message = events.find((event): event is Extract<BattleEvent, { kind: "message" }> => event.kind === "message");
  if (message) {
    return [...message.lines];
  }

  const lines: string[] = [];
  let activeAction: BattleActionStartedEvent | null = null;
  for (const event of events) {
    switch (event.kind) {
      case "actionStarted":
        activeAction = event;
        lines.push(actionStartedLine(event));
        break;
      case "missed":
        lines.push(missedLine(event, activeAction));
        break;
      case "smash":
        if (usesAttackImpactNarration(activeAction)) {
          lines.push("SMAAAASH!! A solid hit!");
        }
        break;
      case "damage":
        if (activeAction?.action !== "item") {
          lines.push(damageLine(event));
        }
        break;
      case "heal":
        lines.push(`${event.targetName} recovered ${event.amount} HP!`);
        break;
      case "ppRestored":
        lines.push(`${event.targetName} recovered ${event.amount} PP!`);
        break;
      case "defended":
        lines.push(`${event.actorName} took a defensive stance.`);
        break;
      case "gutsSurvived":
        if (usesAttackImpactNarration(activeAction)) {
          lines.push(`${event.targetName ?? "The target"} just barely held on!`);
        }
        break;
      case "runSucceeded":
        lines.push(`${event.actorName} ran away!`);
        break;
      case "runFailed":
        lines.push(`${event.actorName} couldn't get away!`);
        break;
      case "noTarget":
        lines.push(...(event.lines ?? ["There was no target."]));
        break;
      case "message":
      case "enemyDefeated":
        break;
    }
  }
  return lines;
}

function missedLine(
  event: Extract<BattleEvent, { kind: "missed" }>,
  action: BattleActionStartedEvent | null
): string {
  if (action?.action === "psi") {
    return event.targetName ? `It didn't work on ${event.targetName}!` : "It didn't work!";
  }
  if (action?.action === "pray") {
    return "Nothing happened!";
  }
  return event.targetName ? `${event.targetName} dodged swiftly!` : "The attack missed!";
}

function damageLine(event: Extract<BattleEvent, { kind: "damage" }>): string {
  const target = event.targetName ?? "the target";
  return `${target} took ${event.amount} HP of damage!`;
}

function actionStartedLine(event: BattleActionStartedEvent): string {
  switch (event.action) {
    case "psi": {
      const move = event.moveName?.trim() || "PSI";
      return `${event.actorName} tried ${move}!`;
    }
    case "item": {
      const item = event.itemName?.trim() || "an item";
      return `${event.actorName} used ${item}!`;
    }
    case "pray":
      return `${event.actorName} prayed.`;
    case "spy":
      return `${event.actorName} sizes up the foe!`;
    case "mirror":
      return `${event.actorName} mirrors the foe!`;
    case "attack":
      return `${event.actorName}'s attack!`;
  }
}

function usesAttackImpactNarration(action: BattleActionStartedEvent | null): boolean {
  return action?.action === "attack" || action?.action === "mirror";
}

function isBattleEventList(input: readonly BattleEvent[] | BattleRoundStepNarrationDetails): input is readonly BattleEvent[] {
  return Array.isArray(input);
}
