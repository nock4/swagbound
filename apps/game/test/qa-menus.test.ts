import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CharacterCollectionSchema,
  FontCollectionSchema,
  ItemCollectionSchema,
  ItemOverridesSchema,
  PsiCollectionSchema,
  ShopDataSchema,
  type ItemCollection,
  type ItemOverrides
} from "@eb/schemas";
import {
  buildAtmScreen,
  buildGoodsViewModel,
  buildMainMenuScreen,
  buildMenuScreens,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusViewModel,
  moveMenu,
  openMenu,
  menuDebugState,
  type MenuScreen
} from "../src/menuModel";
import { createDialogueResolver, type DialogueResolver } from "../src/dialogueRenderer";
import { glyphIndexForCodepoint, glyphAdvance } from "../src/bitmapFont";

// Native EarthBound presentation: 512x448 canvas, all UI text rendered at scale 2
// (EB_UI_SCALE / EB_BITMAP_TEXT_SCALE in windowLayout.ts). The menu window auto-sizes
// to its widest label but is clamped to (screen.width - leftMargin - rightMargin).
const SCREEN_WIDTH = 512;
const TEXT_SCALE = 2;
const MENU_LEFT_MARGIN = 8 * TEXT_SCALE; // EB_UI_SCALE
const MENU_RIGHT_MARGIN = 8 * TEXT_SCALE;
// menuWindowRect adds paddingX*2 to the measured label width before clamping to maxWidth.
// paddingX = MENU_HORIZONTAL_PADDING(8*2) + MENU_CURSOR_GUTTER_PX(14) = 30.
const MENU_PADDING_X = 8 * TEXT_SCALE + 14;
const MAX_BOX_WIDTH = SCREEN_WIDTH - MENU_LEFT_MARGIN - MENU_RIGHT_MARGIN; // 480
// A label whose rendered pixel width exceeds this would force the auto-sized box past the
// screen edge and be clipped by the fixedWidth text node. Anything <= this fits the frame.
const MAX_LABEL_PX = MAX_BOX_WIDTH - MENU_PADDING_X * 2; // 420

const GENERATED = resolve(__dirname, "../public/generated");

function readGenerated<T>(file: string, schema: { parse(value: unknown): T }): T {
  return schema.parse(JSON.parse(readFileSync(resolve(GENERATED, file), "utf8")));
}

// Mirror loader.applyItemOverrides: overrides mutate the resolved item names that the
// in-game dialogue resolver and the menu model both read from.
function applyItemOverrides(items: ItemCollection, overrides: ItemOverrides): ItemCollection {
  const resolved: ItemCollection = JSON.parse(JSON.stringify(items));
  for (const item of resolved.items) {
    const override = overrides.byItemId[String(item.id)];
    if (override) {
      item.name = override.name;
    }
  }
  return resolved;
}

const itemsRaw = readGenerated("items.json", ItemCollectionSchema);
const itemOverrides = readGenerated("item-overrides.json", ItemOverridesSchema);
const resolvedItems = applyItemOverrides(itemsRaw, itemOverrides);
const characters = readGenerated("characters.json", CharacterCollectionSchema);
const psi = readGenerated("psi.json", PsiCollectionSchema);
const shops = readGenerated("shops.json", ShopDataSchema);
const font = readGenerated("font.json", FontCollectionSchema);

const resolver: DialogueResolver = createDialogueResolver({ items: resolvedItems, characters, psi });

const fontSheet = font.fonts.find((sheet) => sheet.id === font.primaryFontId)!;

function measureLabelPx(text: string, scale = TEXT_SCALE): number {
  let width = 0;
  for (const char of Array.from(text)) {
    const codepoint = char.codePointAt(0);
    const glyphIndex = codepoint === undefined ? 0 : glyphIndexForCodepoint(codepoint, font, fontSheet);
    width += glyphAdvance(glyphIndex, fontSheet, scale);
  }
  return width;
}

// The shops actually reachable in the slice are wired through content/custom-dialogue.json:
// drug-store/item shop = npc 404 -> store 1, grocery = npc 749 -> store 4.
const IN_SLICE_STORE_IDS = [1, 4] as const;

function inSliceShopInput(storeId: number) {
  return {
    partyMembers: characters.characters.filter((character) => character.id === 0).map((character) => ({
      id: character.id,
      name: character.name,
      level: character.level,
      experience: 0,
      maxHp: character.maxHp,
      hp: character.maxHp,
      maxPp: character.maxPp,
      pp: character.maxPp,
      stats: {
        offense: character.offense,
        defense: character.defense,
        speed: character.speed,
        guts: character.guts,
        vitality: character.vitality,
        iq: character.iq,
        luck: character.luck
      },
      inventory: character.startingItems,
      money: character.money
    })),
    partyState: {
      wallet: 1234,
      bank: 0,
      party: () => [0],
      inventory: () => characters.characters.find((character) => character.id === 0)?.startingItems ?? []
    },
    items: resolvedItems,
    shops,
    resolver,
    storeId
  };
}

describe("qa-menus: main pause menu (EB parity)", () => {
  it("is exactly the vanilla 6-command pause menu in order; Save/ATM are not items", () => {
    const screen = buildMainMenuScreen();
    expect(screen.items.map((item) => item.label)).toEqual([
      "Talk",
      "Goods",
      "PSI",
      "Equip",
      "Check",
      "Status"
    ]);
    expect(screen.items.every((item) => item.enabled)).toBe(true);
    expect(screen.items.find((item) => item.id === "save")).toBeUndefined();
    expect(screen.items.find((item) => item.id === "atm")).toBeUndefined();
  });

  it("wraps the cursor through enabled commands in both directions", () => {
    const state = openMenu(buildMainMenuScreen());
    expect(menuDebugState(moveMenu(state, -1))).toMatchObject({ cursorIndex: 5, currentItemId: "status" });
    let walked = state;
    for (let step = 0; step < 6; step += 1) {
      walked = moveMenu(walked, 1);
    }
    // 6 forward steps over 6 items returns to the first command.
    expect(menuDebugState(walked)).toMatchObject({ cursorIndex: 0, currentItemId: "talk" });
  });
});

describe("qa-menus: currency label is $swag", () => {
  it("shop wallet row and ATM wallet row both read $swag (never an EarthBound currency glyph)", () => {
    const shop = buildShopViewModel(inSliceShopInput(1));
    const shopScreens = buildShopMenuScreens(shop);
    const walletRow = shopScreens[0].items[0];
    expect(walletRow.id).toBe("shop-wallet-1");
    expect(walletRow.label).toBe("$swag 1234");

    const atm = buildAtmScreen(inSliceShopInput(1));
    expect(atm.title).toBe("ATM");
    expect(atm.items[0].id).toBe("atm-wallet");
    expect(atm.items[0].label).toBe("$swag 1234");

    // ATM offers deposit/withdraw and never surfaces a Save/ATM pause command.
    expect(atm.items.map((item) => item.id)).toEqual([
      "atm-wallet",
      "atm-bank",
      "atm-deposit-100",
      "atm-withdraw-100",
      "atm-deposit-all",
      "atm-withdraw-all"
    ]);
  });
});

describe("qa-menus: in-slice shops use Swagbound item names", () => {
  it("every reachable shop (stores 1 and 4) labels buy rows with the overridden name + cost, no raw item name", () => {
    const rawNameById = new Map(itemsRaw.items.map((item) => [item.id, item.name]));
    for (const storeId of IN_SLICE_STORE_IDS) {
      const shop = buildShopViewModel(inSliceShopInput(storeId));
      expect(shop.available).toBe(true);
      expect(shop.buyEntries.length).toBeGreaterThan(0);
      for (const entry of shop.buyEntries) {
        const overrideName = itemOverrides.byItemId[String(entry.itemId)]?.name;
        // The store only stocks items that have a Swagbound override.
        expect(overrideName, `store ${storeId} item ${entry.itemId} lacks an override`).toBeDefined();
        expect(entry.label.startsWith(overrideName!)).toBe(true);
        expect(entry.label).toBe(`${overrideName} ${entry.cost}`);
        // The original EarthBound item name must not appear in the label.
        const rawName = rawNameById.get(entry.itemId)!;
        expect(entry.label).not.toContain(rawName);
        // Cursor target id is parseable as a shop buy action.
        expect(entry.id.startsWith(`shop-buy-`)).toBe(true);
      }
    }
  });
});

describe("qa-menus: labels fit the native 512x448 menu window", () => {
  it("every in-slice shop buy/sell label fits the auto-sized menu box at scale 2", () => {
    for (const storeId of IN_SLICE_STORE_IDS) {
      const shop = buildShopViewModel(inSliceShopInput(storeId));
      const screens = buildShopMenuScreens(shop);
      const labels = screens.flatMap((screen) => [screen.title, ...screen.items.map((item) => item.label)]);
      for (const label of labels) {
        const px = measureLabelPx(label);
        expect(px, `label "${label}" measured ${px}px > budget ${MAX_LABEL_PX}px`).toBeLessThanOrEqual(MAX_LABEL_PX);
      }
    }
  });

  it("every full menu-stack label (Goods/PSI/Equip/Status/Check/ATM) fits at scale 2", () => {
    const partyMembers = inSliceShopInput(1).partyMembers;
    const status = buildStatusViewModel({ partyMembers });
    const screens: MenuScreen[] = buildMenuScreens(status, {
      partyMembers,
      partyState: {
        wallet: 99999,
        bank: 99999,
        party: () => [0],
        inventory: () => partyMembers[0].inventory,
        equipped: () => ({})
      },
      items: resolvedItems,
      psi,
      shops,
      resolver
    });
    for (const screen of screens) {
      for (const item of screen.items) {
        const px = measureLabelPx(item.label);
        expect(px, `screen ${screen.id} label "${item.label}" measured ${px}px > budget ${MAX_LABEL_PX}px`)
          .toBeLessThanOrEqual(MAX_LABEL_PX);
      }
    }
  });

  it("no overridden item name is wide enough to overflow a Goods row at scale 2", () => {
    // Goods rows show the bare item name; the widest override must still fit the frame.
    let widest = { name: "", px: 0 };
    for (const [id, entry] of Object.entries(itemOverrides.byItemId)) {
      const px = measureLabelPx(entry.name);
      expect(entry.name.length).toBeLessThanOrEqual(24); // schema cap
      if (px > widest.px) {
        widest = { name: `${entry.name} (#${id})`, px };
      }
    }
    expect(widest.px, `widest override ${widest.name} = ${widest.px}px`).toBeLessThanOrEqual(MAX_LABEL_PX);
  });
});

describe("qa-menus: Goods view model reflects real party data", () => {
  it("builds Ness's Goods list from generated starting inventory and uses resolved names", () => {
    const goods = buildGoodsViewModel(inSliceShopInput(1));
    expect(goods.member.id).toBe(0);
    const ness = characters.characters.find((character) => character.id === 0)!;
    expect(goods.entries.map((entry) => entry.itemId)).toEqual(ness.startingItems);
    for (const entry of goods.entries) {
      // Label resolves through the same resolver the dialogue layer uses.
      expect(entry.label).toBe(resolver.itemName(entry.itemId));
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});
