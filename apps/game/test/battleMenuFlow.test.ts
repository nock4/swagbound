import { describe, expect, it } from "vitest";
import {
  commandTargetSelectionPlan,
  enemyTargetModeForCommand,
  shouldOpenEnemyTargetSelection
} from "../src/battleMenuFlow";

describe("battle menu flow", () => {
  it("opens target selection for single-enemy-target commands when multiple enemies are alive", () => {
    expect(commandTargetSelectionPlan("BASH", 2)).toEqual({ submenu: "target", targetMode: "bash" });
    expect(commandTargetSelectionPlan("SPY", 3)).toEqual({ submenu: "target", targetMode: "spy" });
    expect(commandTargetSelectionPlan("MIRROR", 2)).toEqual({ submenu: "target", targetMode: "mirror" });
    expect(shouldOpenEnemyTargetSelection("BASH", 2)).toBe(true);
  });

  it("keeps single-target commands immediate when only one enemy is alive", () => {
    expect(commandTargetSelectionPlan("BASH", 1)).toEqual({ submenu: "command", targetMode: "bash" });
    expect(shouldOpenEnemyTargetSelection("BASH", 1)).toBe(false);
  });

  it("does not open target selection for non-target battle commands", () => {
    expect(enemyTargetModeForCommand("AUTO")).toBeNull();
    expect(commandTargetSelectionPlan("AUTO", 3)).toEqual({ submenu: "command", targetMode: null });
    expect(commandTargetSelectionPlan("DEFEND", 3)).toEqual({ submenu: "command", targetMode: null });
  });
});
