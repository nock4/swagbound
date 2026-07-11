import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ItemOverridesSchema,
  KeyItemsSchema,
  OverworldInteractablesSchema,
  StoryItemsSchema,
  StoryTriggersSchema,
  type OverworldInteractable,
  type StoryItem,
  type StoryItems
} from "@eb/schemas";
import {
  isStoryItemAcquired,
  resolvePresentSpriteTexture,
  storyItemById,
  storyItemByItemId
} from "../src/storyItems";

const doxSheet: StoryItem = {
  id: "dox-sheet",
  itemId: 206,
  name: "Dox Sheet",
  worldTexture: "story-item-dox-sheet",
  worldAsset: "assets/swagbound/story-items/dox-sheet-world.png",
  pickupFlag: "story-item:dox-sheet",
  useBeats: ["leave-signal-town"],
  storyRole: "The damaged record of Bosch."
};

describe("StoryItemsSchema", () => {
  it("accepts strict story item manifests", () => {
    const parsed = StoryItemsSchema.parse({
      schema: "swagbound.story-items.v1",
      items: [doxSheet]
    });

    expect(parsed.items[0]).toEqual(doxSheet);
  });

  it("rejects duplicate story ids and item ids", () => {
    expect(() => StoryItemsSchema.parse({
      schema: "swagbound.story-items.v1",
      items: [
        doxSheet,
        { ...doxSheet, worldTexture: "other-texture" }
      ]
    })).toThrow(/duplicate story item id dox-sheet/);

    expect(() => StoryItemsSchema.parse({
      schema: "swagbound.story-items.v1",
      items: [
        doxSheet,
        { ...doxSheet, id: "other-sheet" }
      ]
    })).toThrow(/duplicate story item itemId 206/);
  });
});

describe("story item helpers", () => {
  const storyItems: StoryItems = {
    schema: "swagbound.story-items.v1",
    items: [doxSheet]
  };

  it("looks up story items by story id and item id", () => {
    expect(storyItemById(storyItems, "dox-sheet")).toEqual(doxSheet);
    expect(storyItemById(storyItems, "missing")).toBeUndefined();
    expect(storyItemByItemId(storyItems, 206)).toEqual(doxSheet);
    expect(storyItemByItemId(storyItems, 999)).toBeUndefined();
  });

  it("checks acquisition through the game flag reader contract", () => {
    const flags = new Set([doxSheet.pickupFlag]);

    expect(isStoryItemAcquired({ has: (flag) => flags.has(flag) }, doxSheet)).toBe(true);
    expect(isStoryItemAcquired({ has: () => false }, doxSheet)).toBe(false);
  });
});

describe("resolvePresentSpriteTexture", () => {
  const storyItems: StoryItems = {
    schema: "swagbound.story-items.v1",
    items: [doxSheet]
  };

  const normalPresent: Extract<OverworldInteractable, { kind: "present" }> = {
    id: "normal",
    kind: "present",
    worldPixel: { x: 10, y: 20 },
    item: { char: 0, item: 88 }
  };
  const storyPresent: Extract<OverworldInteractable, { kind: "present" }> = {
    ...normalPresent,
    id: "story",
    storyItemId: "dox-sheet"
  };

  function resolve(
    entry: Extract<OverworldInteractable, { kind: "present" }>,
    options: { opened?: boolean; textureExists?: (textureKey: string) => boolean; storyItems?: StoryItems } = {}
  ) {
    return resolvePresentSpriteTexture(entry, {
      opened: options.opened ?? false,
      storyItems: options.storyItems ?? storyItems,
      textureExists: options.textureExists ?? ((textureKey) => textureKey === doxSheet.worldTexture),
      genericClosedTexture: "closed",
      genericOpenTexture: "open"
    });
  }

  it("uses generic closed and open textures for normal presents", () => {
    expect(resolve(normalPresent)).toEqual({
      textureKey: "closed",
      visible: true,
      hideWhenOpened: false
    });
    expect(resolve(normalPresent, { opened: true })).toEqual({
      textureKey: "open",
      visible: true,
      hideWhenOpened: false
    });
  });

  it("uses the story texture for story presents and hides it after pickup", () => {
    expect(resolve(storyPresent)).toEqual({
      textureKey: "story-item-dox-sheet",
      visible: true,
      hideWhenOpened: true,
      storyItemId: "dox-sheet"
    });
    expect(resolve(storyPresent, { opened: true })).toEqual({
      textureKey: "story-item-dox-sheet",
      visible: false,
      hideWhenOpened: true,
      storyItemId: "dox-sheet"
    });
  });

  it("reports unresolved story present data while falling back to generic textures", () => {
    expect(resolve({ ...storyPresent, storyItemId: "missing-sheet" })).toEqual({
      textureKey: "closed",
      visible: true,
      hideWhenOpened: false,
      issue: { kind: "missingStoryItem", storyItemId: "missing-sheet" }
    });
    expect(resolve(storyPresent, { textureExists: () => false })).toEqual({
      textureKey: "closed",
      visible: true,
      hideWhenOpened: false,
      storyItemId: "dox-sheet",
      issue: {
        kind: "missingStoryTexture",
        storyItemId: "dox-sheet",
        textureKey: "story-item-dox-sheet"
      }
    });
  });
});

describe("story item content integrity", () => {
  it("keeps the intake ledger examine hotspot connected to visible prop art", async () => {
    const overworldInteractables = OverworldInteractablesSchema.parse(JSON.parse(
      await readFile(resolve("content/overworld-interactables.json"), "utf8")
    ));
    const ledger = overworldInteractables.interactables.find((entry) => entry.id === "intake-ledger");

    expect(ledger).toMatchObject({
      kind: "examine",
      worldPixel: { x: 2332, y: 7208 },
      sprite: "assets/swagbound/props/intake-ledger.png"
    });
    if (ledger?.kind === "examine" && ledger.sprite) {
      await expect(access(resolve("apps/game/public", ledger.sprite))).resolves.toBeUndefined();
    }
  });

  it("keeps story item ids connected to key items, triggers, assets, item names, and present refs", async () => {
    const storyItems = StoryItemsSchema.parse(JSON.parse(
      await readFile(resolve("content/story-items.json"), "utf8")
    ));
    const keyItems = KeyItemsSchema.parse(JSON.parse(
      await readFile(resolve("content/key-items.json"), "utf8")
    ));
    const triggers = StoryTriggersSchema.parse(JSON.parse(
      await readFile(resolve("content/triggers.json"), "utf8")
    ));
    const itemOverrides = ItemOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/item-overrides.json"), "utf8")
    ));
    const overworldInteractables = OverworldInteractablesSchema.parse(JSON.parse(
      await readFile(resolve("content/overworld-interactables.json"), "utf8")
    ));

    const keyItemIds = new Set(keyItems.itemIds);
    const triggerIds = new Set(triggers.triggers.map((trigger) => trigger.id));
    const storyItemIds = new Set(storyItems.items.map((item) => item.id));

    for (const item of storyItems.items) {
      expect(keyItemIds.has(item.itemId), `story item ${item.id} itemId must be in key-items`).toBe(true);
      for (const beat of item.useBeats) {
        expect(triggerIds.has(beat), `story item ${item.id} useBeat ${beat} must be a trigger id`).toBe(true);
      }
      await expect(access(resolve("apps/game/public", item.worldAsset))).resolves.toBeUndefined();
      expect(itemOverrides.byItemId[String(item.itemId)]?.name).toBe(item.name);
    }

    for (const entry of overworldInteractables.interactables) {
      if (entry.kind !== "present" || !entry.storyItemId) {
        continue;
      }
      expect(storyItemIds.has(entry.storyItemId), `present ${entry.id} storyItemId must resolve`).toBe(true);
    }
  });
});
