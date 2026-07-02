import type { BattleRoundStepNarrationDetails } from "./battleRound";

export type BattleActionKind = "attack" | "psi" | "item" | "pray" | "spy" | "mirror";

export type BattleActionStartedEvent = {
  kind: "actionStarted";
  action: BattleActionKind;
  actorName: string;
  moveName?: string;
  itemName?: string;
  psiId?: number;
};

export type BattleEvent =
  | BattleActionStartedEvent
  | { kind: "message"; lines: string[] }
  | { kind: "missed"; targetName?: string }
  | { kind: "smash" }
  | { kind: "damage"; targetName?: string; amount: number }
  | { kind: "heal"; targetName: string; amount: number }
  | { kind: "ppRestored"; targetName: string; amount: number }
  | { kind: "defended"; actorName: string }
  | { kind: "gutsSurvived"; targetName?: string }
  | { kind: "runSucceeded"; actorName: string }
  | { kind: "runFailed"; actorName: string }
  | { kind: "enemyDefeated"; targetName?: string }
  | { kind: "noTarget"; lines?: string[] };

export function battleStepEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  switch (details.kind) {
    case "skip":
      return details.noTarget ? [noTargetEvent(details)] : [];
    case "attack":
      return attackEvents(details);
    case "psi":
      return psiEvents(details);
    case "item":
      return itemEvents(details);
    case "defend":
      return [{ kind: "defended", actorName: details.attackerName }];
    case "pray":
      return prayEvents(details);
    case "spy":
      return spyEvents(details);
    case "mirror":
      return actionImpactEvents(details, actionStarted("mirror", details), preferredMessageEvent(details));
    case "run":
      return [{
        kind: details.fled ? "runSucceeded" : "runFailed",
        actorName: details.attackerName
      }];
  }
}

function attackEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  const message = preferredMessageEvent(details);
  if (message && !details.missed && (details.damage ?? 0) <= 0) {
    const events: BattleEvent[] = [actionStarted("attack", details), message];
    appendEnemyDefeatedEvent(events, details);
    return events;
  }
  return actionImpactEvents(details, actionStarted("attack", details), message);
}

export function firstBattleAction(events: readonly BattleEvent[]): BattleActionStartedEvent | undefined {
  return events.find((event): event is BattleActionStartedEvent => event.kind === "actionStarted");
}

export function firstBattleDamage(events: readonly BattleEvent[]): Extract<BattleEvent, { kind: "damage" }> | undefined {
  return events.find((event): event is Extract<BattleEvent, { kind: "damage" }> => event.kind === "damage");
}

export function battleEventsHaveMiss(events: readonly BattleEvent[]): boolean {
  return events.some((event) => event.kind === "missed");
}

export function battleEventsHaveRecovery(events: readonly BattleEvent[]): boolean {
  return events.some((event) => event.kind === "heal" || event.kind === "ppRestored");
}

export function battleEventsHaveSmash(events: readonly BattleEvent[]): boolean {
  return events.some((event) => event.kind === "smash");
}

export function battleEventsHaveEnemyDefeated(events: readonly BattleEvent[]): boolean {
  return events.some((event) => event.kind === "enemyDefeated");
}

function psiEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  if (isRecovery(details)) {
    // Name the RECIPIENT, not the caster — an enemy Lifeup on an ally must
    // read "<ally> recovered N HP!", matching the item recovery path.
    return recoveryEvents(details, details.targetName ?? details.attackerName, preferredMessageEvent(details));
  }
  // A non-damaging assist effect that didn't miss (status inflict / stat buff / PP drain) narrates
  // via its authored message — NOT the attack-impact path, which reads "no damage" as a dodge.
  const message = preferredMessageEvent(details);
  if (message && !details.missed && (details.damage ?? 0) <= 0) {
    const events: BattleEvent[] = [actionStarted("psi", details), message];
    appendEnemyDefeatedEvent(events, details);
    return events;
  }
  return actionImpactEvents(details, actionStarted("psi", details));
}

function itemEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  const events: BattleEvent[] = [actionStarted("item", details)];
  const message = preferredMessageEvent(details);
  if (message) {
    events.push(message);
  }
  if (!appendRecoveryEvent(events, details, details.targetName ?? details.attackerName) && (details.damage ?? 0) > 0) {
    appendImpactEvents(events, details);
  }
  appendEnemyDefeatedEvent(events, details);
  return events;
}

function prayEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  if (isRecovery(details)) {
    return recoveryEvents(details, details.attackerName, preferredMessageEvent(details));
  }

  const events: BattleEvent[] = [actionStarted("pray", details)];
  const message = preferredMessageEvent(details);
  if (message) {
    events.push(message);
  }
  if ((details.damage ?? 0) > 0) {
    appendImpactEvents(events, details);
  }
  appendEnemyDefeatedEvent(events, details);
  return events;
}

function spyEvents(details: BattleRoundStepNarrationDetails): BattleEvent[] {
  // Spy reveals info; it deals no damage, so it must not run the attack-impact
  // path (which would otherwise emit a spurious "missed" beat).
  const events: BattleEvent[] = [actionStarted("spy", details)];
  const message = preferredMessageEvent(details);
  if (message) {
    events.push(message);
  }
  return events;
}

function recoveryEvents(
  details: BattleRoundStepNarrationDetails,
  targetName: string,
  message: BattleEvent | null
): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (message) {
    events.push(message);
  }
  appendRecoveryEvent(events, details, targetName);
  appendEnemyDefeatedEvent(events, details);
  return events;
}

function actionImpactEvents(
  details: BattleRoundStepNarrationDetails,
  start: BattleActionStartedEvent,
  message: BattleEvent | null = null
): BattleEvent[] {
  const events: BattleEvent[] = [start];
  if (message) {
    events.push(message);
  }
  appendImpactEvents(events, details);
  appendEnemyDefeatedEvent(events, details);
  return events;
}

function appendImpactEvents(events: BattleEvent[], details: BattleRoundStepNarrationDetails): void {
  const damage = details.damage ?? 0;
  if (details.missed || damage <= 0) {
    events.push({ kind: "missed", ...targetNamePayload(details.targetName) });
    return;
  }
  if (details.smash) {
    events.push({ kind: "smash" });
  }
  events.push({ kind: "damage", amount: damage, ...targetNamePayload(details.targetName) });
  if (details.gutsSurvived) {
    events.push({ kind: "gutsSurvived", ...targetNamePayload(details.targetName) });
  }
}

function appendRecoveryEvent(
  events: BattleEvent[],
  details: BattleRoundStepNarrationDetails,
  targetName: string
): boolean {
  if ((details.healed ?? 0) > 0) {
    events.push({ kind: "heal", targetName, amount: details.healed ?? 0 });
    return true;
  }
  if ((details.ppRestored ?? 0) > 0) {
    events.push({ kind: "ppRestored", targetName, amount: details.ppRestored ?? 0 });
    return true;
  }
  return false;
}

function appendEnemyDefeatedEvent(events: BattleEvent[], details: BattleRoundStepNarrationDetails): void {
  if (details.targetDied) {
    events.push({ kind: "enemyDefeated", ...targetNamePayload(details.targetName) });
  }
}

function actionStarted(
  action: BattleActionKind,
  details: BattleRoundStepNarrationDetails
): BattleActionStartedEvent {
  return {
    kind: "actionStarted",
    action,
    actorName: details.attackerName,
    ...(details.moveName !== undefined ? { moveName: details.moveName } : {}),
    ...(details.itemName !== undefined ? { itemName: details.itemName } : {}),
    ...(details.psiId !== undefined ? { psiId: details.psiId } : {})
  };
}

function noTargetEvent(details: BattleRoundStepNarrationDetails): BattleEvent {
  const lines = preferredMessageLines(details);
  return lines ? { kind: "noTarget", lines } : { kind: "noTarget" };
}

function preferredMessageEvent(details: BattleRoundStepNarrationDetails): BattleEvent | null {
  const lines = preferredMessageLines(details);
  return lines ? { kind: "message", lines } : null;
}

function preferredMessageLines(details: BattleRoundStepNarrationDetails): string[] | null {
  const message = details.message?.trim();
  if (!message) {
    return null;
  }
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines : null;
}

function isRecovery(details: Pick<BattleRoundStepNarrationDetails, "healed" | "ppRestored">): boolean {
  return (details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0;
}

function targetNamePayload(targetName: string | undefined): { targetName?: string } {
  return targetName === undefined ? {} : { targetName };
}
