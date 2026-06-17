import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ItemCollectionSchema, ItemOverridesSchema, ShopDataSchema } from "@eb/schemas";

describe("item override content", () => {
  it("covers every generated shop item with a short replacement name", async () => {
    const shops = ShopDataSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/shops.json"), "utf8")
    ));
    const items = ItemCollectionSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/items.json"), "utf8")
    ));
    const overrides = ItemOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/item-overrides.json"), "utf8")
    ));
    const itemById = new Map(items.items.map((item) => [item.id, item]));
    const requiredIds = [...new Set(shops.shops.flatMap((shop) => shop.itemIds))]
      .filter((id) => id !== 0 && itemById.has(id))
      .sort((a, b) => a - b);

    expect(Object.keys(overrides.byItemId).map(Number).sort((a, b) => a - b)).toEqual(requiredIds);

    for (const id of requiredIds) {
      const override = overrides.byItemId[String(id)];
      expect(override).toBeDefined();
      expect(override.name.trim()).toBe(override.name);
      expect(override.name.length).toBeGreaterThan(0);
      expect(override.name.length).toBeLessThanOrEqual(24);
      expect(override.name).not.toMatch(/[@\u0000-\u001f\u007f]/);
      expect(override.name).not.toContain("/Users/");
      expect(override.name).not.toBe(itemById.get(id)?.name);
    }
  });

  it("keeps corpus anchor names on expected item categories", async () => {
    const items = ItemCollectionSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/items.json"), "utf8")
    ));
    const overrides = ItemOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/item-overrides.json"), "utf8")
    ));
    const itemById = new Map(items.items.map((item) => [item.id, item]));

    expect(itemById.get(17)?.type).toBe(16);
    expect(overrides.byItemId["17"]?.name).toBe("Practice Bat");
    expect(itemById.get(88)?.type).toBe(32);
    expect(overrides.byItemId["88"]?.name).toBe("Pocket Snack");
  });
});
