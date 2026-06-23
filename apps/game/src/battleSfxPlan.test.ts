import { describe, expect, it } from "vitest";
import { BIG_DAMAGE_SFX_THRESHOLD, battleStepSfx } from "./battleSfxPlan";
import { battleStepEvents } from "./battleEvents";
import type { BattleRoundStepNarrationDetails } from "./battleRound";

function details(overrides: Partial<BattleRoundStepNarrationDetails>): BattleRoundStepNarrationDetails {
  return {
    kind: "attack",
    attackerName: "Bosch",
    targetName: "Runaway Dog",
    ...overrides
  };
}

function sfx(overrides: Partial<BattleRoundStepNarrationDetails>) {
  return battleStepSfx(battleStepEvents(details(overrides)));
}

describe("battleStepSfx", () => {
  it("sequences attack wind-up into hit, smash, or miss", () => {
    expect(sfx({ kind: "attack", damage: 12 })).toEqual(["swing", "hit"]);
    expect(sfx({ kind: "attack", damage: 12, smash: true })).toEqual(["swing", "crit"]);
    expect(sfx({ kind: "attack", damage: BIG_DAMAGE_SFX_THRESHOLD })).toEqual(["swing", "smash"]);
    expect(sfx({ kind: "attack", missed: true, damage: 0 })).toEqual(["swing", "miss"]);
  });

  it("uses PSI shimmer before offensive impact and heal chime for recovery", () => {
    expect(sfx({ kind: "psi", damage: 24 })).toEqual(["psi", "hit"]);
    expect(sfx({ kind: "psi", missed: true, damage: 0 })).toEqual(["psi", "miss"]);
    expect(sfx({ kind: "psi", healed: 38, damage: undefined })).toEqual(["heal"]);
    expect(sfx({ kind: "pray", ppRestored: 10 })).toEqual(["heal"]);
  });

  it("adds enemyDown when a target dies", () => {
    expect(sfx({ kind: "attack", damage: 18, targetDied: true })).toEqual([
      "swing",
      "hit",
      "enemyDown"
    ]);
  });

  it("maps flee and skips non-impact steps", () => {
    expect(sfx({ kind: "run", fled: true })).toEqual(["run"]);
    expect(sfx({ kind: "skip" })).toEqual([]);
    // DEFEND has no events; the cue comes from the narration kind.
    expect(battleStepSfx(details({ kind: "defend", defended: true }))).toEqual(["defend"]);
  });
});
