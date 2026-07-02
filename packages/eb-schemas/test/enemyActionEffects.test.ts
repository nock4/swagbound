import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EnemyActionEffectsSchema } from "../src/index";

describe("EnemyActionEffectsSchema", () => {
  it("accepts authored enemy battle-action effects keyed by EB action id", () => {
    const parsed = EnemyActionEffectsSchema.parse({
      schema: "swagbound.enemy-action-effects.v1",
      byActionId: {
        "32": {
          name: "Lifeup alpha",
          note: "psi arg 23 -> Lifeup alpha",
          effect: { kind: "healHp", amount: 20 }
        },
        "72": {
          note: "message identifies poison stinger",
          effect: { kind: "inflictStatus", ailment: "poisoned" }
        }
      }
    });

    expect(parsed.byActionId["32"].effect).toEqual({ kind: "healHp", amount: 20 });
    expect(parsed.byActionId["72"].effect).toEqual({ kind: "inflictStatus", ailment: "poisoned" });
  });

  it("validates committed enemy action effects and references generated battle action ids", () => {
    const content = EnemyActionEffectsSchema.parse(JSON.parse(readFileSync(
      new URL("../../../content/enemy-action-effects.json", import.meta.url),
      "utf8"
    )));
    const battle = JSON.parse(readFileSync(
      new URL("../../../apps/game/public/generated/battle.json", import.meta.url),
      "utf8"
    )) as { enemies: { actions: { actionId?: number; id: number }[] }[] };
    const generatedActionIds = new Set<number>();
    for (const enemy of battle.enemies) {
      for (const action of enemy.actions) {
        generatedActionIds.add(action.actionId ?? action.id);
      }
    }

    for (const [actionId, entry] of Object.entries(content.byActionId)) {
      expect(entry.note?.trim().length, `action ${actionId} evidence note`).toBeGreaterThan(0);
      expect(generatedActionIds.has(Number(actionId)), `action ${actionId} exists in battle.json`).toBe(true);
    }
  });
});
