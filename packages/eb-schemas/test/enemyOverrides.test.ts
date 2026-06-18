import { describe, expect, it } from "vitest";
import { EnemyOverridesSchema } from "../src/index";

describe("EnemyOverridesSchema", () => {
  it("parses numeric enemy ids with short replacement names", () => {
    const parsed = EnemyOverridesSchema.parse({
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "159": { name: "AI Slop" },
        "220": { name: "Spam Caller" }
      }
    });

    expect(parsed.byEnemyId["159"].name).toBe("AI Slop");
    expect(parsed.byEnemyId["220"].name).toBe("Spam Caller");
  });

  it("rejects invalid keys and unsafe names", () => {
    expect(EnemyOverridesSchema.safeParse({
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        starter: { name: "AI Slop" }
      }
    }).success).toBe(false);

    expect(EnemyOverridesSchema.safeParse({
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "159": { name: "This Enemy Name Is Too Long" }
      }
    }).success).toBe(false);

    expect(EnemyOverridesSchema.safeParse({
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "159": { name: "Bad@Marker" }
      }
    }).success).toBe(false);
  });
});
