import { describe, expect, it } from "vitest";
import type { BattleSfxCue } from "../src/audio/battleSfx";
import { battleStepEvents } from "../src/battleEvents";
import { composeBattleStepLines } from "../src/battleMessages";
import type { BattleRoundStepNarrationDetails } from "../src/battleRound";
import { BIG_DAMAGE_SFX_THRESHOLD, battleStepSfx } from "../src/battleSfxPlan";

function step(overrides: Partial<BattleRoundStepNarrationDetails>): BattleRoundStepNarrationDetails {
  return {
    kind: "attack",
    attackerName: "Bosch",
    targetName: "Runaway Dog",
    ...overrides
  };
}

describe("battleStepEvents", () => {
  it("emits ordered attack impact beats", () => {
    expect(battleStepEvents(step({ kind: "attack", damage: 12 }))).toEqual([
      { kind: "actionStarted", action: "attack", actorName: "Bosch" },
      { kind: "damage", targetName: "Runaway Dog", amount: 12 }
    ]);

    expect(battleStepEvents(step({ kind: "attack", missed: true, damage: 0 }))).toEqual([
      { kind: "actionStarted", action: "attack", actorName: "Bosch" },
      { kind: "missed", targetName: "Runaway Dog" }
    ]);

    expect(battleStepEvents(step({ kind: "attack", damage: 80, smash: true }))).toEqual([
      { kind: "actionStarted", action: "attack", actorName: "Bosch" },
      { kind: "smash" },
      { kind: "damage", targetName: "Runaway Dog", amount: 80 }
    ]);

    expect(battleStepEvents(step({ kind: "attack", damage: 9, gutsSurvived: true }))).toEqual([
      { kind: "actionStarted", action: "attack", actorName: "Bosch" },
      { kind: "damage", targetName: "Runaway Dog", amount: 9 },
      { kind: "gutsSurvived", targetName: "Runaway Dog" }
    ]);
  });

  it("emits PSI, recovery, defend, run, defeat, and no-target beats", () => {
    expect(battleStepEvents(step({
      kind: "psi",
      moveName: "PSI Rockin alpha",
      psiId: 100,
      damage: 42
    }))).toEqual([
      { kind: "actionStarted", action: "psi", actorName: "Bosch", moveName: "PSI Rockin alpha", psiId: 100 },
      { kind: "damage", targetName: "Runaway Dog", amount: 42 }
    ]);

    expect(battleStepEvents(step({ kind: "item", itemName: "Cookie", healed: 6 }))).toEqual([
      { kind: "actionStarted", action: "item", actorName: "Bosch", itemName: "Cookie" },
      { kind: "heal", targetName: "Runaway Dog", amount: 6 }
    ]);

    expect(battleStepEvents(step({ kind: "pray", ppRestored: 4 }))).toEqual([
      { kind: "ppRestored", targetName: "Bosch", amount: 4 }
    ]);

    expect(battleStepEvents(step({ kind: "defend", defended: true }))).toEqual([
      { kind: "defended", actorName: "Bosch" }
    ]);

    expect(battleStepEvents(step({ kind: "run", fled: true }))).toEqual([
      { kind: "runSucceeded", actorName: "Bosch" }
    ]);

    expect(battleStepEvents(step({ kind: "run", fled: false }))).toEqual([
      { kind: "runFailed", actorName: "Bosch" }
    ]);

    expect(battleStepEvents(step({ kind: "attack", damage: 18, targetDied: true }))).toEqual([
      { kind: "actionStarted", action: "attack", actorName: "Bosch" },
      { kind: "damage", targetName: "Runaway Dog", amount: 18 },
      { kind: "enemyDefeated", targetName: "Runaway Dog" }
    ]);

    expect(battleStepEvents(step({
      kind: "skip",
      message: "There was no target.",
      noTarget: true
    }))).toEqual([
      { kind: "noTarget", lines: ["There was no target."] }
    ]);
  });

  it("keeps narration and SFX equivalent to the pre-event detail mapping", () => {
    const cases: BattleRoundStepNarrationDetails[] = [
      step({ kind: "attack", damage: 12 }),
      step({ kind: "attack", missed: true, damage: 0 }),
      step({ kind: "attack", damage: 80, smash: true }),
      step({ kind: "attack", damage: 9, gutsSurvived: true }),
      step({ kind: "attack", damage: 18, targetDied: true }),
      step({ kind: "psi", moveName: "PSI Rockin alpha", psiId: 100, damage: 42 }),
      step({ kind: "psi", moveName: "PSI Rockin alpha", psiId: 100, missed: true, damage: 0 }),
      step({ kind: "psi", healed: 28 }),
      step({ kind: "psi", healed: 28, message: "Bosch recovered 28 HP." }),
      step({ kind: "item", itemName: "Cookie", healed: 6 }),
      step({ kind: "item", itemName: "Magic tart", ppRestored: 12 }),
      step({ kind: "item", itemName: "Bomb", damage: 64, smash: true }),
      step({ kind: "item", itemName: "Cookie", healed: 6, message: "It tasted stale." }),
      step({ kind: "defend", defended: true }),
      step({ kind: "pray", ppRestored: 4 }),
      step({ kind: "pray", damage: 15 }),
      step({ kind: "pray", missed: true, message: "Bosch prayed. Nothing happened." }),
      step({ kind: "spy", message: "Runaway Dog HP 30/30 Off 12 Def 4." }),
      step({ kind: "spy", message: undefined }),
      step({ kind: "mirror", damage: 18, message: "Bosch mirrored Runaway Dog for 18 damage." }),
      step({ kind: "mirror", damage: 18, message: undefined }),
      step({ kind: "run", fled: true }),
      step({ kind: "run", fled: false }),
      step({ kind: "skip" }),
      step({ kind: "skip", message: "There was no target.", noTarget: true })
    ];

    for (const details of cases) {
      const events = battleStepEvents(details);
      expect(composeBattleStepLines(events), `${details.kind} narration`).toEqual(legacyBattleStepLines(details));
      expect(battleStepSfx(events), `${details.kind} sfx`).toEqual(legacyBattleStepSfx(details));
    }
  });
});

function legacyBattleStepLines(details: BattleRoundStepNarrationDetails): string[] {
  switch (details.kind) {
    case "skip":
      return details.noTarget ? preferredMessageLines(details) ?? ["There was no target."] : [];
    case "attack":
      return legacyAttackLines(details);
    case "psi":
      return legacyPsiLines(details);
    case "item":
      return legacyItemLines(details);
    case "defend":
      return [`${details.attackerName} took a defensive stance.`];
    case "pray":
      return legacyRecoveryOrMessageLines(details, "prayed");
    case "spy":
      return preferredMessageLines(details) || [`${details.attackerName} sizes up the foe!`];
    case "mirror":
      return preferredMessageLines(details) || legacyMirrorLines(details);
    case "run":
      return [details.fled ? `${details.attackerName} ran away!` : `${details.attackerName} couldn't escape!`];
  }
}

function legacyAttackLines(details: BattleRoundStepNarrationDetails): string[] {
  const opener = `${details.attackerName}'s attack!`;
  if (details.missed || !details.damage || details.damage <= 0) {
    return [opener, details.targetName ? `${details.targetName} dodged!` : "It missed!"];
  }
  const lines = [opener];
  if (details.smash) {
    lines.push("SMAAAASH!!");
  }
  lines.push(`${details.damage} HP of damage to ${details.targetName ?? "the target"}!`);
  if (details.gutsSurvived) {
    lines.push(`${details.targetName ?? "The target"} endured the blow!`);
  }
  return lines;
}

function legacyMirrorLines(details: BattleRoundStepNarrationDetails): string[] {
  const [, ...rest] = legacyAttackLines(details);
  return [`${details.attackerName} mirrors the foe!`, ...rest];
}

function legacyPsiLines(details: BattleRoundStepNarrationDetails): string[] {
  if ((details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0) {
    return legacyRecoveryOrMessageLines(details, "tried PSI");
  }
  const move = details.moveName?.trim() || "PSI";
  const opener = `${details.attackerName} tried ${move}!`;
  if (details.missed || !details.damage || details.damage <= 0) {
    return [opener, details.targetName ? `${details.targetName} dodged!` : "It missed!"];
  }
  return [opener, `${details.damage} HP of damage to ${details.targetName ?? "the target"}!`];
}

function legacyItemLines(details: BattleRoundStepNarrationDetails): string[] {
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

function legacyRecoveryOrMessageLines(
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

function legacyBattleStepSfx(details: BattleRoundStepNarrationDetails): BattleSfxCue[] {
  const cues: BattleSfxCue[] = [];

  switch (details.kind) {
    case "skip":
    case "defend":
    case "spy":
      break;
    case "run":
      cues.push(details.fled ? "run" : "miss");
      break;
    case "attack":
    case "mirror":
      cues.push("swing", legacyImpactCue(details));
      break;
    case "psi":
      if (legacyIsRecovery(details)) {
        cues.push("heal");
      } else {
        cues.push("psi", legacyImpactCue(details));
      }
      break;
    case "pray":
      if (legacyIsRecovery(details)) {
        cues.push("heal");
      } else if ((details.damage ?? 0) > 0) {
        cues.push("psi", legacyImpactCue(details));
      }
      break;
    case "item":
      if (legacyIsRecovery(details)) {
        cues.push("heal");
      } else if ((details.damage ?? 0) > 0) {
        cues.push(legacyImpactCue(details));
      }
      break;
  }

  if (details.targetDied) {
    cues.push("enemyDown");
  }
  return cues;
}

function legacyImpactCue(details: Pick<BattleRoundStepNarrationDetails, "damage" | "missed" | "smash">): BattleSfxCue {
  if (details.missed || (details.damage ?? 0) <= 0) {
    return "miss";
  }
  if (details.smash) {
    return "crit";
  }
  return (details.damage ?? 0) >= BIG_DAMAGE_SFX_THRESHOLD ? "smash" : "hit";
}

function legacyIsRecovery(details: Pick<BattleRoundStepNarrationDetails, "healed" | "ppRestored">): boolean {
  return (details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0;
}

function preferredMessageLines(details: BattleRoundStepNarrationDetails): string[] | null {
  const message = details.message?.trim();
  if (!message) {
    return null;
  }
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines : null;
}
