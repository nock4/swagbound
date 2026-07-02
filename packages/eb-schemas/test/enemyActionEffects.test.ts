import { describe, expect, it } from "vitest";
import { EnemyActionEffectsSchema } from "../src/index";

describe("EnemyActionEffectsSchema", () => {
  it("accepts authored enemy battle-action effects keyed by EB action id", () => {
    const parsed = EnemyActionEffectsSchema.parse({
      schema: "swagbound.enemy-action-effects.v1",
      byActionId: {
        "32": {
          name: "Lifeup alpha",
          effect: { kind: "healHp", amount: 20 }
        },
        "242": {
          effect: { kind: "inflictStatus", ailment: "poisoned" }
        }
      }
    });

    expect(parsed.byActionId["32"].effect).toEqual({ kind: "healHp", amount: 20 });
    expect(parsed.byActionId["242"].effect).toEqual({ kind: "inflictStatus", ailment: "poisoned" });
  });
});
