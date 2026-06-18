import { describe, expect, it } from "vitest";
import { composeBattleStepLines } from "../src/battleMessages";

describe("composeBattleStepLines", () => {
  it("composes attack damage and miss lines", () => {
    expect(composeBattleStepLines({
      kind: "attack",
      attackerName: "Bosch",
      targetName: "Spiteful Crow",
      damage: 12
    })).toEqual([
      "Bosch's attack!",
      "12 HP of damage to Spiteful Crow!"
    ]);

    expect(composeBattleStepLines({
      kind: "attack",
      attackerName: "Bosch",
      targetName: "Spiteful Crow",
      damage: 0,
      missed: true
    })).toEqual([
      "Bosch's attack!",
      "Spiteful Crow dodged!"
    ]);
  });

  it("composes PSI offense and recovery lines", () => {
    expect(composeBattleStepLines({
      kind: "psi",
      attackerName: "Bosch",
      targetName: "Runaway Dog",
      moveName: "PSI Rockin alpha",
      damage: 42
    })).toEqual([
      "Bosch tried PSI Rockin alpha!",
      "42 HP of damage to Runaway Dog!"
    ]);

    expect(composeBattleStepLines({
      kind: "psi",
      attackerName: "Bosch",
      targetName: "Bosch",
      moveName: "Lifeup alpha",
      healed: 28,
      message: "Bosch recovered 28 HP."
    })).toEqual(["Bosch recovered 28 HP."]);
  });

  it("composes item, defend, pray, spy, mirror, and run lines", () => {
    expect(composeBattleStepLines({
      kind: "item",
      attackerName: "Bosch",
      targetName: "Rook",
      itemName: "Cookie",
      healed: 6
    })).toEqual([
      "Bosch used Cookie!",
      "Rook recovered 6 HP!"
    ]);

    expect(composeBattleStepLines({
      kind: "defend",
      attackerName: "Bosch",
      defended: true
    })).toEqual(["Bosch took a defensive stance."]);

    expect(composeBattleStepLines({
      kind: "pray",
      attackerName: "Glimmer",
      ppRestored: 4
    })).toEqual(["Glimmer recovered 4 PP!"]);

    expect(composeBattleStepLines({
      kind: "spy",
      attackerName: "Scout",
      targetName: "Mushroom",
      message: "Mushroom HP 30/30 Off 12 Def 4."
    })).toEqual(["Mushroom HP 30/30 Off 12 Def 4."]);

    expect(composeBattleStepLines({
      kind: "mirror",
      attackerName: "Trace",
      targetName: "Mole",
      damage: 18,
      message: "Trace mirrored Mole for 18 damage."
    })).toEqual(["Trace mirrored Mole for 18 damage."]);

    expect(composeBattleStepLines({
      kind: "run",
      attackerName: "Bosch",
      fled: true
    })).toEqual(["Bosch ran away!"]);

    expect(composeBattleStepLines({
      kind: "run",
      attackerName: "Bosch",
      fled: false
    })).toEqual(["Bosch couldn't escape!"]);
  });

  it("omits skipped steps", () => {
    expect(composeBattleStepLines({
      kind: "skip",
      attackerName: "Bosch"
    })).toEqual([]);
  });
});
