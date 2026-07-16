import { describe, expect, it } from "vitest";
import { createBattleState } from "./battleLogic";
import {
  stageTutorialDerivativeMimic,
  tutorialDerivativeActionIndex,
  tutorialDerivativeMimicLine
} from "./tutorialDerivative";

const derivative = {
  id: 900001,
  name: "Unstable Bosch Derivative",
  spriteId: 900001,
  level: 1,
  hp: 42,
  offense: 7,
  defense: 3,
  speed: 2,
  experience: 8,
  money: 0,
  bossFlag: false,
  actions: [0, 1, 2, 3, 4].map((id) => ({ id, arg: 0, actionId: id, actionType: 0, target: 0 })),
  itemDropped: null,
  itemRarity: null
} as const;

describe("tutorial Bosch derivative", () => {
  it("maps Bosch's previous command onto the next enemy action", () => {
    expect(tutorialDerivativeActionIndex(undefined)).toBe(0);
    expect(tutorialDerivativeActionIndex("BASH")).toBe(1);
    expect(tutorialDerivativeActionIndex("DEFEND")).toBe(2);
    expect(tutorialDerivativeActionIndex("PSI")).toBe(3);
    expect(tutorialDerivativeActionIndex("GOODS")).toBe(0);
  });

  it("holds a derived defensive stance for the following round", () => {
    const staged = stageTutorialDerivativeMimic(createBattleState(derivative), "DEFEND");
    expect(staged.enemies[0]).toMatchObject({ nextActionIndex: 2, defending: true });
    const released = stageTutorialDerivativeMimic(staged, "BASH");
    expect(released.enemies[0]).toMatchObject({ nextActionIndex: 1, defending: false });
  });

  it("names the derivative in its visible imitation line", () => {
    expect(tutorialDerivativeMimicLine("Unstable Bosch Derivative", "BASH"))
      .toBe("Unstable Bosch Derivative derived BASH one turn late!");
  });
});
