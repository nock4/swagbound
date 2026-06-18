import type { BattleRoundStepNarrationDetails } from "./battleRound";

export function composeBattleStepLines(details: BattleRoundStepNarrationDetails): string[] {
  switch (details.kind) {
    case "skip":
      return [];
    case "attack":
      return composeAttackLines(details.attackerName, details.targetName, details.damage, details.missed);
    case "psi":
      return composePsiLines(details);
    case "item":
      return composeItemLines(details);
    case "defend":
      return [`${details.attackerName} took a defensive stance.`];
    case "pray":
      return composeRecoveryOrMessageLines(details, "prayed");
    case "spy":
    case "mirror":
      return preferredMessageLines(details) || composeAttackLines(
        details.attackerName,
        details.targetName,
        details.damage,
        details.missed
      );
    case "run":
      return [details.fled ? `${details.attackerName} ran away!` : `${details.attackerName} couldn't escape!`];
  }
}

function composeAttackLines(
  attackerName: string,
  targetName: string | undefined,
  damage: number | undefined,
  missed: boolean | undefined
): string[] {
  const opener = `${attackerName}'s attack!`;
  if (missed || !damage || damage <= 0) {
    return [opener, targetName ? `${targetName} dodged!` : "It missed!"];
  }
  return [opener, `${damage} HP of damage to ${targetName ?? "the target"}!`];
}

function composePsiLines(details: BattleRoundStepNarrationDetails): string[] {
  if ((details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0) {
    return composeRecoveryOrMessageLines(details, "tried PSI");
  }
  const move = details.moveName?.trim() || "PSI";
  const opener = `${details.attackerName} tried ${move}!`;
  if (details.missed || !details.damage || details.damage <= 0) {
    return [opener, details.targetName ? `${details.targetName} dodged!` : "It missed!"];
  }
  return [opener, `${details.damage} HP of damage to ${details.targetName ?? "the target"}!`];
}

function composeItemLines(details: BattleRoundStepNarrationDetails): string[] {
  const message = preferredMessageLines(details);
  if (message) {
    return message;
  }
  const item = details.itemName?.trim() || "an item";
  const opener = `${details.attackerName} used ${item}!`;
  if ((details.healed ?? 0) > 0) {
    return [opener, `${details.targetName ?? details.attackerName} recovered ${details.healed} HP!`];
  }
  if ((details.ppRestored ?? 0) > 0) {
    return [opener, `${details.targetName ?? details.attackerName} recovered ${details.ppRestored} PP!`];
  }
  return [opener];
}

function composeRecoveryOrMessageLines(
  details: BattleRoundStepNarrationDetails,
  fallbackVerb: string
): string[] {
  const message = preferredMessageLines(details);
  if (message) {
    return message;
  }
  if ((details.healed ?? 0) > 0) {
    return [`${details.attackerName} recovered ${details.healed} HP!`];
  }
  if ((details.ppRestored ?? 0) > 0) {
    return [`${details.attackerName} recovered ${details.ppRestored} PP!`];
  }
  if ((details.damage ?? 0) > 0) {
    return [`${details.attackerName} ${fallbackVerb}.`, `${details.damage} HP of damage to ${details.targetName ?? "the target"}!`];
  }
  return [`${details.attackerName} ${fallbackVerb}.`];
}

function preferredMessageLines(details: BattleRoundStepNarrationDetails): string[] | null {
  const message = details.message?.trim();
  if (!message) {
    return null;
  }
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines : null;
}
