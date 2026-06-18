import { describe, expect, it } from "vitest";
import { BattleRulesSchema } from "../src/index";

describe("BattleRulesSchema", () => {
  it("parses unescapable battle group ids", () => {
    const parsed = BattleRulesSchema.parse({
      schema: "swagbound.battle-rules.v1",
      unescapableGroups: [450]
    });

    expect(parsed.unescapableGroups).toEqual([450]);
  });

  it("rejects the wrong schema id and non-numeric groups", () => {
    expect(BattleRulesSchema.safeParse({
      schema: "swagbound.enemy-overrides.v1",
      unescapableGroups: [450]
    }).success).toBe(false);

    expect(BattleRulesSchema.safeParse({
      schema: "swagbound.battle-rules.v1",
      unescapableGroups: ["450"]
    }).success).toBe(false);
  });
});
