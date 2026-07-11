import { describe, expect, it } from "vitest";
import {
  ARCHIVIST_RECORDS_MENU_ID,
  buildAtmScreen,
  buildGoodsViewModel,
  buildMenuScreens,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusViewModel
} from "./menuModel";

describe("buildAtmScreen", () => {
  it("offers withdrawals from banked battle winnings even when wallet is empty", () => {
    const screen = buildAtmScreen({
      partyState: {
        wallet: 0,
        bank: 120,
        party: () => []
      }
    });

    expect(screen.items).toContainEqual(expect.objectContaining({
      id: "atm-withdraw-50",
      enabled: true
    }));
    expect(screen.items).toContainEqual(expect.objectContaining({
      id: "atm-deposit-empty",
      enabled: false
    }));
  });
});

describe("key item menu model", () => {
  const characters = {
    schemaVersion: "test",
    sourceProjectPath: "test",
    derivation: {
      source: "test",
      baseStats: "test",
      statFormula: "test",
      hpPpFormula: "test",
      uncertainty: "test"
    },
    characters: [{
      id: 0,
      name: "Bosch",
      level: 1,
      experience: 0,
      maxHp: 30,
      maxPp: 0,
      offense: 2,
      defense: 2,
      speed: 2,
      guts: 2,
      vitality: 2,
      iq: 2,
      luck: 2,
      startingItems: [],
      money: 0
    }],
    counts: { characters: 1, statFieldsPopulated: 7 },
    warnings: []
  };
  const items = {
    schemaVersion: "test",
    sourceProjectPath: "test",
    derivation: { source: "test", equippable: "test", helpText: "test" },
    items: [
      { id: 88, name: "Pocket Snack", type: 32, cost: 7, action: 249, argument: 0, equippable: false, miscFlags: [] },
      { id: 177, name: "Proof Card", type: 59, cost: 0, action: 197, argument: 0, equippable: false, miscFlags: [] },
      { id: 178, name: "Show ticket", type: 59, cost: 12, action: 1, argument: 0, equippable: false, miscFlags: [] }
    ],
    counts: { items: 3, equippable: 0 },
    warnings: []
  };
  const partyState = {
    wallet: 20,
    party: () => [0],
    inventory: () => [88, 177, 178]
  };
  const keyItems = { schema: "swagbound.key-items.v1" as const, itemIds: [177, 178] };

  it("pins key items to the top of Goods and marks them gold", () => {
    const goods = buildGoodsViewModel({ characters, items, keyItems, partyState });
    expect(goods.entries.map((entry) => entry.itemId)).toEqual([177, 178, 88]);
    expect(goods.entries.map((entry) => entry.label)).toEqual(["Proof Card ◆", "Show ticket ◆", "Pocket Snack"]);

    expect(goods.entries[0].keyItem).toBe(true);
  });

  it("pins and colors key items in shop sell lists", () => {
    const shop = buildShopViewModel({
      characters,
      items,
      keyItems,
      partyState,
      shops: { schemaVersion: "test", sourceProjectPath: "test", derivation: { source: "test", slots: "test", unusedFields: "test" }, shops: [{ id: 1, itemIds: [88] }], counts: { shops: 1, entries: 1 }, warnings: [] },
      storeId: 1
    });
    expect(shop.sellEntries.map((entry) => entry.itemId)).toEqual([177, 178, 88]);

    const sellScreen = buildShopMenuScreens(shop).find((entry) => entry.id === "shop-1-sell");
    expect(sellScreen?.items[0]).toMatchObject({ label: "Proof Card ◆ 0", textColor: "#ffd23f" });
  });

  it("surfaces filed Archivist records under Status", () => {
    const screens = buildMenuScreens(buildStatusViewModel({ characters, partyState }), {
      characters,
      partyState,
      archivistSpots: {
        schema: "swagbound.archivist-spots.v1",
        archivist: {
          spriteId: "drifella2-168",
          spriteNpcId: 100300,
          lines: ["Filed, not minted."]
        },
        spots: [{
          spotId: 1,
          flag: { id: 698, name: "FLG_PHOTO_1" },
          anchor: { x: 2656, y: 344 },
          photographer: { x: 2632, y: 448 },
          party1: { x: 2648, y: 360 },
          slide: { direction: 0, distance: 0 },
          extraNpcs: [],
          locationLabel: "Bosch front step",
          caption: "A record of a thing that only happened once."
        }]
      },
      flags: { has: (flag) => flag === "FLG_PHOTO_1" }
    });

    const status = screens.find((screen) => screen.id === "status");
    expect(status?.items).toContainEqual(expect.objectContaining({
      id: ARCHIVIST_RECORDS_MENU_ID,
      label: "Records",
      childScreenId: ARCHIVIST_RECORDS_MENU_ID
    }));
    const records = screens.find((screen) => screen.id === ARCHIVIST_RECORDS_MENU_ID);
    expect(records?.title).toBe("Records 1/1");
    expect(records?.items[0]).toMatchObject({
      label: "01 Bosch front step",
      infoLines: ["A record of a thing that only happened once."]
    });
  });
});
