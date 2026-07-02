import { describe, expect, it } from "vitest";
import { composeBattleStepLines } from "../src/battleMessages";
import { battleStepEvents } from "../src/battleEvents";
import type { BattleRoundStepNarrationDetails } from "../src/battleRound";

function lines(details: BattleRoundStepNarrationDetails): string[] {
  return composeBattleStepLines(battleStepEvents(details));
}

describe("composeBattleStepLines", () => {
  it("composes attack damage and miss lines", () => {
    expect(lines({
      kind: "attack",
      attackerName: "Bosch",
      targetName: "Spiteful Crow",
      damage: 12
    })).toEqual([
      "Bosch's attack!",
      "Spiteful Crow took 12 HP of damage!"
    ]);

    expect(lines({
      kind: "attack",
      attackerName: "Bosch",
      targetName: "Spiteful Crow",
      damage: 0,
      missed: true
    })).toEqual([
      "Bosch's attack!",
      "Spiteful Crow dodged swiftly!"
    ]);
  });

  it("composes SMAAAASH and Guts survival attack beats", () => {
    expect(lines({
      kind: "attack",
      attackerName: "Bosch",
      targetName: "Spiteful Crow",
      damage: 80,
      smash: true
    })).toEqual([
      "Bosch's attack!",
      "SMAAAASH!! A solid hit!",
      "Spiteful Crow took 80 HP of damage!"
    ]);

    expect(lines({
      kind: "attack",
      attackerName: "Shark",
      targetName: "Bosch",
      damage: 9,
      gutsSurvived: true
    })).toEqual([
      "Shark's attack!",
      "Bosch took 9 HP of damage!",
      "Bosch just barely held on!"
    ]);
  });

  it("composes PSI offense and recovery lines", () => {
    expect(lines({
      kind: "psi",
      attackerName: "Bosch",
      targetName: "Runaway Dog",
      moveName: "PSI Rockin alpha",
      damage: 42
    })).toEqual([
      "Bosch tried PSI Rockin alpha!",
      "Runaway Dog took 42 HP of damage!"
    ]);

    expect(lines({
      kind: "psi",
      attackerName: "Bosch",
      targetName: "Bosch",
      moveName: "Lifeup alpha",
      healed: 28,
      message: "Bosch recovered 28 HP."
    })).toEqual(["Bosch recovered 28 HP."]);
  });

  it("composes item, defend, pray, spy, mirror, and run lines", () => {
    expect(lines({
      kind: "item",
      attackerName: "Bosch",
      targetName: "Rook",
      itemName: "Cookie",
      healed: 6
    })).toEqual([
      "Bosch used Cookie!",
      "Rook recovered 6 HP!"
    ]);

    expect(lines({
      kind: "defend",
      attackerName: "Bosch",
      defended: true
    })).toEqual(["Bosch took a defensive stance."]);

    expect(lines({
      kind: "pray",
      attackerName: "Glimmer",
      ppRestored: 4
    })).toEqual(["Glimmer recovered 4 PP!"]);

    expect(lines({
      kind: "spy",
      attackerName: "Scout",
      targetName: "Mushroom",
      message: "Mushroom HP 30/30 Off 12 Def 4."
    })).toEqual(["Mushroom HP 30/30 Off 12 Def 4."]);

    expect(lines({
      kind: "mirror",
      attackerName: "Trace",
      targetName: "Mole",
      damage: 18,
      message: "Trace mirrored Mole for 18 damage."
    })).toEqual(["Trace mirrored Mole for 18 damage."]);

    expect(lines({
      kind: "run",
      attackerName: "Bosch",
      fled: true
    })).toEqual(["Bosch ran away!"]);

    expect(lines({
      kind: "run",
      attackerName: "Bosch",
      fled: false
    })).toEqual(["Bosch couldn't get away!"]);
  });

  it("omits skipped steps", () => {
    expect(lines({
      kind: "skip",
      attackerName: "Bosch"
    })).toEqual([]);

    expect(lines({
      kind: "skip",
      attackerName: "Bosch",
      message: "There was no target.",
      noTarget: true
    })).toEqual(["There was no target."]);
  });
});
