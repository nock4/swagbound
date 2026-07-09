import { describe, expect, it } from "vitest";
import {
  battleItemEffectDescription,
  commandTargetSelectionPlan,
  enemyTargetModeForCommand,
  shouldOpenEnemyTargetSelection
} from "../src/battleMenuFlow";
import { decodeItemUseEffect } from "../src/partyState";

describe("battle menu flow", () => {
  it("opens target selection for single-enemy-target commands when enemies are alive", () => {
    expect(commandTargetSelectionPlan("BASH", 2)).toEqual({ submenu: "target", targetMode: "bash" });
    expect(commandTargetSelectionPlan("SPY", 3)).toEqual({ submenu: "target", targetMode: "spy" });
    expect(commandTargetSelectionPlan("MIRROR", 2)).toEqual({ submenu: "target", targetMode: "mirror" });
    expect(shouldOpenEnemyTargetSelection("BASH", 2)).toBe(true);
  });

  it("still opens target selection with a single living enemy (1-versus-1)", () => {
    expect(commandTargetSelectionPlan("BASH", 1)).toEqual({ submenu: "target", targetMode: "bash" });
    expect(shouldOpenEnemyTargetSelection("BASH", 1)).toBe(true);
  });

  it("skips target selection only when no enemy is alive", () => {
    expect(commandTargetSelectionPlan("BASH", 0)).toEqual({ submenu: "command", targetMode: "bash" });
    expect(shouldOpenEnemyTargetSelection("BASH", 0)).toBe(false);
  });

  it("does not open target selection for non-target battle commands", () => {
    expect(enemyTargetModeForCommand("AUTO")).toBeNull();
    expect(commandTargetSelectionPlan("AUTO", 3)).toEqual({ submenu: "command", targetMode: null });
    expect(commandTargetSelectionPlan("DEFEND", 3)).toEqual({ submenu: "command", targetMode: null });
  });

  it("describes highlighted battle item effects from decoded effect data", () => {
    expect(battleItemEffectDescription({ kind: "healHp", amount: 50 })).toBe("Restores 50 HP");
    expect(battleItemEffectDescription({ kind: "cureStatus", ailment: "poisoned" })).toBe("Cures poison");
    expect(battleItemEffectDescription({ kind: "damage", amount: 80 })).toBe("Hits one enemy for 80 damage");
    expect(battleItemEffectDescription({ kind: "inflictStatus", ailment: "shielded", remaining: 3 })).toBe("Shields one friend for 3 turns");
    expect(battleItemEffectDescription({ kind: "buffStat", stat: "defense", amount: 10 })).toBe("Raises one friend's defense by 10");
    expect(battleItemEffectDescription({ kind: "buffStat", stat: "defense", amount: -10 })).toBe("Lowers one enemy's defense by 10");
    expect(battleItemEffectDescription({ kind: "buffStat", stat: "guts", multiplier: 2 })).toBe("Doubles one friend's guts");
  });

  it("describes the same decoded item effect used by battle execution", () => {
    const effect = decodeItemUseEffect({
      action: 0,
      argument: 0,
      miscFlags: ["item disappears when used"],
      effect: { kind: "recoverPp", amount: 20 }
    });
    expect(battleItemEffectDescription(effect)).toBe("Restores 20 PP");
  });

  it("falls back clearly when no item effect is known", () => {
    expect(battleItemEffectDescription(undefined)).toBe("No battle effect");
  });
});
