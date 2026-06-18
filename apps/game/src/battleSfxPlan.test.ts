import { describe, expect, it } from "vitest";
import { BIG_DAMAGE_SFX_THRESHOLD, battleStepSfx } from "./battleSfxPlan";
import type { BattleRoundStepNarrationDetails } from "./battleRound";

function details(overrides: Partial<BattleRoundStepNarrationDetails>): BattleRoundStepNarrationDetails {
  return {
    kind: "attack",
    attackerName: "Bosch",
    targetName: "Runaway Dog",
    ...overrides
  };
}

describe("battleStepSfx", () => {
  it("sequences attack wind-up into hit, smash, or miss", () => {
    expect(battleStepSfx(details({ kind: "attack", damage: 12 }))).toEqual(["swing", "hit"]);
    expect(battleStepSfx(details({ kind: "attack", damage: 12, smash: true }))).toEqual(["swing", "smash"]);
    expect(battleStepSfx(details({ kind: "attack", damage: BIG_DAMAGE_SFX_THRESHOLD }))).toEqual(["swing", "smash"]);
    expect(battleStepSfx(details({ kind: "attack", missed: true, damage: 0 }))).toEqual(["swing", "miss"]);
  });

  it("uses PSI shimmer before offensive impact and heal chime for recovery", () => {
    expect(battleStepSfx(details({ kind: "psi", damage: 24 }))).toEqual(["psi", "hit"]);
    expect(battleStepSfx(details({ kind: "psi", missed: true, damage: 0 }))).toEqual(["psi", "miss"]);
    expect(battleStepSfx(details({ kind: "psi", healed: 38, damage: undefined }))).toEqual(["heal"]);
    expect(battleStepSfx(details({ kind: "pray", ppRestored: 10 }))).toEqual(["heal"]);
  });

  it("adds enemyDown when a target dies", () => {
    expect(battleStepSfx(details({ kind: "attack", damage: 18, targetDied: true }))).toEqual([
      "swing",
      "hit",
      "enemyDown"
    ]);
  });

  it("maps flee and skips non-impact steps", () => {
    expect(battleStepSfx(details({ kind: "run", fled: true }))).toEqual(["run"]);
    expect(battleStepSfx(details({ kind: "skip" }))).toEqual([]);
    expect(battleStepSfx(details({ kind: "defend", defended: true }))).toEqual([]);
  });
});
