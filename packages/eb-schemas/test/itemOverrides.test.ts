import { describe, expect, it } from "vitest";
import { ItemOverridesSchema } from "../src/index";

describe("ItemOverridesSchema", () => {
  it("parses numeric item ids with short replacement names", () => {
    const parsed = ItemOverridesSchema.parse({
      schema: "swagbound.item-overrides.v1",
      byItemId: {
        "17": { name: "Practice Bat" },
        "88": { name: "Pocket Snack" }
      }
    });

    expect(parsed.byItemId["17"].name).toBe("Practice Bat");
    expect(parsed.byItemId["88"].name).toBe("Pocket Snack");
  });

  it("rejects invalid keys and unsafe names", () => {
    expect(ItemOverridesSchema.safeParse({
      schema: "swagbound.item-overrides.v1",
      byItemId: {
        starter: { name: "Practice Bat" }
      }
    }).success).toBe(false);

    expect(ItemOverridesSchema.safeParse({
      schema: "swagbound.item-overrides.v1",
      byItemId: {
        "17": { name: "" }
      }
    }).success).toBe(false);

    expect(ItemOverridesSchema.safeParse({
      schema: "swagbound.item-overrides.v1",
      byItemId: {
        "17": { name: "This Name Is Much Too Long" }
      }
    }).success).toBe(false);

    expect(ItemOverridesSchema.safeParse({
      schema: "swagbound.item-overrides.v1",
      byItemId: {
        "17": { name: "Bad@Marker" }
      }
    }).success).toBe(false);
  });
});
