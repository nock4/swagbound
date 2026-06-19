import { describe, expect, it } from "vitest";
import { EnemyNameFamiliesSchema, EnemyOverridesSchema, expandEnemyNameFamilies } from "../src/index";

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

describe("expandEnemyNameFamilies", () => {
  it("expands a family roster into a per-id name map", () => {
    const families = EnemyNameFamiliesSchema.parse({
      schema: "swagbound.enemy-name-families.v1",
      families: {
        Malady: [18, 37, 72, 126],
        "AI Slop": [59, 106]
      }
    });

    const overrides = expandEnemyNameFamilies(families);

    expect(overrides.schema).toBe("swagbound.enemy-overrides.v1");
    expect(overrides.byEnemyId["18"].name).toBe("Malady");
    expect(overrides.byEnemyId["126"].name).toBe("Malady");
    expect(overrides.byEnemyId["59"].name).toBe("AI Slop");
    expect(Object.keys(overrides.byEnemyId)).toHaveLength(6);
  });

  it("throws when one id is claimed by two families", () => {
    const families = EnemyNameFamiliesSchema.parse({
      schema: "swagbound.enemy-name-families.v1",
      families: {
        Malady: [18, 37],
        "Mifella 2": [37, 131]
      }
    });

    expect(() => expandEnemyNameFamilies(families)).toThrow(/37 is assigned to multiple/);
  });

  it("validates family names through the override name rules", () => {
    const families = EnemyNameFamiliesSchema.parse({
      schema: "swagbound.enemy-name-families.v1",
      families: {
        "This Enemy Name Is Too Long": [18]
      }
    });

    expect(() => expandEnemyNameFamilies(families)).toThrow();
  });
});
