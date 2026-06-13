import { describe, expect, it } from "vitest";
import type { CharacterCollection, ItemCollection, PsiCollection, ShopData } from "@eb/schemas";
import type { PartyMember } from "../src/characterModel";
import {
  buildAtmScreen,
  buildCheckDetailScreens,
  buildCheckScreen,
  buildCheckViewModel,
  buildEquipActionScreens,
  buildEquipViewModel,
  buildGoodsActionScreens,
  buildGoodsViewModel,
  buildMainMenuScreen,
  buildMenuScreens,
  buildPsiViewModel,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusScreen,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  moveMenu,
  openMenu,
  parseMenuAction,
  type MenuScreen
} from "../src/menuModel";

const rootScreen: MenuScreen = {
  id: "root",
  title: "Root",
  items: [
    { id: "first", label: "First", enabled: true },
    { id: "disabled", label: "Disabled", enabled: false },
    { id: "third", label: "Third", enabled: true }
  ]
};

describe("menuModel navigation", () => {
  it("wraps movement through enabled items by default", () => {
    let state = openMenu(rootScreen);

    state = moveMenu(state, -1);
    expect(menuDebugState(state)).toMatchObject({ cursorIndex: 2, currentItemId: "third" });

    state = moveMenu(state, 1);
    expect(menuDebugState(state)).toMatchObject({ cursorIndex: 0, currentItemId: "first" });
  });

  it("clamps movement when the screen disables wrapping", () => {
    const state = openMenu({ ...rootScreen, wrap: false });

    expect(menuDebugState(moveMenu(state, -1))).toMatchObject({ cursorIndex: 0, currentItemId: "first" });
    expect(menuDebugState(moveMenu(state, 99))).toMatchObject({ cursorIndex: 2, currentItemId: "third" });
  });

  it("pushes child screens on confirm", () => {
    const child: MenuScreen = {
      id: "child",
      title: "Child",
      items: [{ id: "child-line", label: "Child line", enabled: false }]
    };
    const root: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "open-child", label: "Open", enabled: true, childScreenId: "child" }]
    };

    const result = confirmMenu(openMenu(root), (id) => id === "child" ? child : undefined);

    expect(result.actionId).toBeUndefined();
    expect(menuDebugState(result.state)).toMatchObject({
      open: true,
      stack: ["root", "child"],
      cursorIndex: 0,
      currentItemId: "child-line"
    });
  });

  it("pops child screens and closes at the root", () => {
    const child: MenuScreen = {
      id: "child",
      title: "Child",
      items: []
    };
    const root: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "open-child", label: "Open", enabled: true, childScreenId: "child" }]
    };
    const pushed = confirmMenu(openMenu(root), () => child).state;

    const popped = cancelMenu(pushed);
    expect(menuDebugState(popped)).toMatchObject({ open: true, stack: ["root"] });

    const closed = cancelMenu(popped);
    expect(closed).toEqual(closedMenu());
  });

  it("dispatches action ids without mutating the stack", () => {
    const actionScreen: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "use", label: "Use", enabled: true, actionId: "use-selected" }]
    };
    const state = openMenu(actionScreen);

    const result = confirmMenu(state, () => undefined);

    expect(result.actionId).toBe("use-selected");
    expect(result.state).toEqual(state);
  });

  it("exposes save as a concrete main-menu action", () => {
    const screen = buildMainMenuScreen();

    expect(screen.items.find((item) => item.id === "save")).toMatchObject({
      label: "Save",
      enabled: true,
      actionId: "save"
    });
    expect(parseMenuAction("save")).toEqual({ kind: "save" });
  });
});

describe("Status view model", () => {
  it("builds a structured status screen from synthetic party members", () => {
    const members: PartyMember[] = [
      partyMember(1, "MEMBER_A", 10),
      partyMember(2, "MEMBER_B", 20)
    ];

    const status = buildStatusViewModel({ partyMembers: members, wallet: 77 });
    const screen = buildStatusScreen(status);

    expect(status.wallet).toBe(77);
    expect(status.bank).toBe(0);
    expect(status.members).toHaveLength(2);
    expect(status.members[0]).toMatchObject({
      id: 1,
      name: "MEMBER_A",
      level: 10,
      hp: 50,
      maxHp: 50,
      pp: 12,
      maxPp: 12,
      stats: { offense: 11, defense: 12, speed: 13, guts: 14, vitality: 15, iq: 16, luck: 17 }
    });
    expect(screen.items.map((item) => item.id)).toEqual([
      "wallet",
      "bank",
      "member-0-vitals",
      "member-0-stats",
      "member-1-vitals",
      "member-1-stats"
    ]);
  });

  it("builds status from generated character data and session wallet", () => {
    const characters: CharacterCollection = {
      schemaVersion: "test",
      sourceProjectPath: "",
      derivation: {
        source: "synthetic",
        baseStats: "synthetic",
        statFormula: "synthetic",
        hpPpFormula: "synthetic",
        uncertainty: "synthetic"
      },
      characters: [
        {
          id: 1,
          name: "MEMBER_A",
          level: 4,
          maxHp: 44,
          maxPp: 8,
          offense: 9,
          defense: 8,
          speed: 7,
          guts: 6,
          vitality: 5,
          iq: 4,
          luck: 3,
          startingItems: [],
          money: 0
        },
        {
          id: 2,
          name: "MEMBER_B",
          level: 6,
          maxHp: 66,
          maxPp: 10,
          offense: 13,
          defense: 12,
          speed: 11,
          guts: 10,
          vitality: 9,
          iq: 8,
          luck: 7,
          startingItems: [],
          money: 0
        }
      ],
      counts: { characters: 2, statFieldsPopulated: 20 },
      warnings: []
    };

    const status = buildStatusViewModel({
      characters,
      partyState: {
        wallet: 125,
        bank: 50,
        party: () => [2]
      }
    });

    expect(status.wallet).toBe(125);
    expect(status.bank).toBe(50);
    expect(status.members).toHaveLength(1);
    expect(status.members[0]).toMatchObject({
      id: 2,
      name: "MEMBER_B",
      level: 6,
      hp: 66,
      maxHp: 66,
      stats: { offense: 13, defense: 12, speed: 11, guts: 10, vitality: 9, iq: 8, luck: 7 }
    });
  });

  it("uses a neutral default party when generated character data is absent", () => {
    const status = buildStatusViewModel();

    expect(status.members).toHaveLength(1);
    expect(status.members[0]).toMatchObject({
      id: 0,
      name: "PLAYER",
      level: 1,
      hp: 40,
      maxHp: 40
    });
  });
});

describe("item and PSI menu view models", () => {
  it("builds Goods, Equip, PSI, and Check from synthetic party data", () => {
    const input = {
      partyMembers: [partyMember(1, "MEMBER_A", 5)],
      partyState: {
        wallet: 0,
        bank: 0,
        party: () => [1],
        inventory: () => [10, 11, 12]
      },
      items: syntheticItems(),
      psi: syntheticPsi(),
      resolver: {
        itemName: (id: number) => `[item ${id} data]`,
        psiName: (id: number) => `[psi ${id} data]`
      }
    };

    const goods = buildGoodsViewModel(input);
    const equip = buildEquipViewModel(input);
    const psi = buildPsiViewModel(input);
    const check = buildCheckViewModel(input);

    expect(goods.member.id).toBe(1);
    expect(goods.targets.map((target) => target.id)).toEqual([1]);
    expect(goods.entries.map((entry) => entry.itemId)).toEqual([10, 11, 12]);
    expect(equip.entries.map((entry) => entry.itemId)).toEqual([10, 12]);
    expect(psi.entries.map((entry) => entry.psiId)).toEqual([7]);
    expect(check.entries).toHaveLength(3);

    const goodsActionScreens = buildGoodsActionScreens(goods);
    expect(goodsActionScreens[0]).toMatchObject({
      id: "goods-item-1-0-10",
      items: [{ label: "Use", childScreenId: "goods-use-target-1-0-10" }]
    });
    expect(parseMenuAction(goodsActionScreens[1].items[0]?.actionId ?? "")).toEqual({
      kind: "itemUse",
      ownerChar: 1,
      inventorySlot: 0,
      itemId: 10,
      targetChar: 1
    });

    const equipActionScreens = buildEquipActionScreens(equip);
    expect(equipActionScreens[0]).toMatchObject({
      id: "equip-item-1-0-10",
      items: [{ label: "Equip" }]
    });
    expect(parseMenuAction(equipActionScreens[0].items[0]?.actionId ?? "")).toEqual({
      kind: "equip",
      char: 1,
      inventorySlot: 0,
      itemId: 10
    });

    const checkScreen = buildCheckScreen(check);
    expect(checkScreen.items.map((item) => item.childScreenId)).toEqual([
      "check-item-0-10",
      "check-item-1-11",
      "check-item-2-12"
    ]);
    const detailScreens = buildCheckDetailScreens(check);
    expect(detailScreens).toHaveLength(3);
    expect(detailScreens[0].items.length).toBeGreaterThan(1);
  });

  it("adds concrete menu screens for the package W stub ids", () => {
    const status = buildStatusViewModel({ partyMembers: [partyMember(1, "MEMBER_A", 5)] });
    const screens = buildMenuScreens(status, {
      partyMembers: [partyMember(1, "MEMBER_A", 5)],
      partyState: {
        wallet: 0,
        bank: 0,
        party: () => [1],
        inventory: () => [10, 11, 12]
      },
      items: syntheticItems(),
      psi: syntheticPsi()
    });

    const byId = new Map(screens.map((screen) => [screen.id, screen]));
    expect(byId.get("goods")?.items[0]?.id).not.toBe("goods-stub");
    expect(byId.get("goods")?.items[0]?.childScreenId).toBe("goods-item-1-0-10");
    expect(byId.get("psi")?.items[0]?.id).not.toBe("psi-stub");
    expect(byId.get("equip")?.items[0]?.id).not.toBe("equip-stub");
    expect(byId.get("equip")?.items[0]?.childScreenId).toBe("equip-item-1-0-10");
    expect(byId.get("check")?.items[0]?.id).not.toBe("check-stub");
    expect(byId.get("atm")?.items[0]?.id).toBe("atm-wallet");
  });

  it("builds shop and ATM menu actions with neutral item labels", () => {
    const input = {
      partyMembers: [partyMember(1, "MEMBER_A", 5)],
      partyState: {
        wallet: 25,
        bank: 40,
        party: () => [1],
        inventory: () => [10, 11]
      },
      items: syntheticItems(),
      shops: syntheticShops(),
      resolver: {
        itemName: (id: number) => `[item ${id} data]`,
        psiName: (id: number) => `[psi ${id} data]`
      }
    };

    const shop = buildShopViewModel({ ...input, storeId: 2 });
    expect(shop.buyEntries.map((entry) => ({ itemId: entry.itemId, cost: entry.cost }))).toEqual([
      { itemId: 10, cost: 20 },
      { itemId: 11, cost: 7 }
    ]);
    expect(shop.sellEntries.map((entry) => ({ itemId: entry.itemId, price: entry.price }))).toEqual([
      { itemId: 10, price: 10 },
      { itemId: 11, price: 3 }
    ]);

    const screens = buildShopMenuScreens(shop);
    expect(screens[0]).toMatchObject({
      id: "shop-2",
      items: [
        { id: "shop-wallet-2", enabled: false },
        { label: "Buy", childScreenId: "shop-2-buy" },
        { label: "Sell", childScreenId: "shop-2-sell" },
        { label: "Cancel", actionId: "shop-cancel" }
      ]
    });
    expect(parseMenuAction(screens[1].items[0]?.actionId ?? "")).toEqual({
      kind: "shopBuy",
      storeId: 2,
      char: 1,
      itemId: 10
    });
    expect(parseMenuAction(screens[2].items[1]?.actionId ?? "")).toEqual({
      kind: "shopSell",
      storeId: 2,
      char: 1,
      inventorySlot: 1,
      itemId: 11
    });

    const atm = buildAtmScreen(input);
    expect(parseMenuAction(atm.items[2].actionId ?? "")).toEqual({
      kind: "atm",
      op: "deposit",
      amount: 100,
      all: false
    });
    expect(parseMenuAction(atm.items[5].actionId ?? "")).toEqual({
      kind: "atm",
      op: "withdraw",
      all: true
    });
  });
});

function partyMember(id: number, name: string, level: number): PartyMember {
  return {
    id,
    name,
    level,
    maxHp: 50,
    hp: 50,
    maxPp: 12,
    pp: 12,
    stats: {
      offense: 11,
      defense: 12,
      speed: 13,
      guts: 14,
      vitality: 15,
      iq: 16,
      luck: 17
    },
    inventory: [],
    money: 0
  };
}

function syntheticItems(): ItemCollection {
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    derivation: { source: "synthetic", equippable: "synthetic", helpText: "synthetic" },
    items: [
      itemData(10, true),
      itemData(11, false),
      itemData(12, true, "Neutral help text for [item 12 data].")
    ],
    counts: { items: 3, equippable: 2 },
    warnings: []
  };
}

function itemData(id: number, equippable: boolean, helpText?: string): ItemCollection["items"][number] {
  return {
    id,
    name: `[item ${id} data]`,
    type: equippable ? 0x10 : 0x20,
    cost: id === 10 ? 20 : id === 11 ? 7 : 9,
    action: 0,
    argument: 0,
    equippable,
    miscFlags: [],
    ...(helpText ? { helpText } : {})
  };
}

function syntheticShops(): ShopData {
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    derivation: {
      source: "synthetic",
      slots: "synthetic",
      unusedFields: "synthetic"
    },
    shops: [
      { id: 2, itemIds: [10, 11] }
    ],
    counts: { shops: 1, entries: 2 },
    warnings: []
  };
}

function syntheticPsi(): PsiCollection {
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    derivation: { source: "synthetic", names: "synthetic", learnedBy: "synthetic", usableOutsideBattle: "synthetic" },
    psi: [
      {
        id: 7,
        name: "[psi 7 data]",
        type: "assist",
        strength: "stage-a",
        usableOutsideBattle: true,
        learnedBy: [{ charId: 1, level: 3 }]
      },
      {
        id: 8,
        name: "[psi 8 data]",
        type: "assist",
        strength: "stage-b",
        usableOutsideBattle: true,
        learnedBy: [{ charId: 1, level: 9 }]
      },
      {
        id: 9,
        name: "[psi 9 data]",
        type: "assist",
        strength: "stage-c",
        usableOutsideBattle: false,
        learnedBy: [{ charId: 3, level: 1 }]
      }
    ],
    counts: { psi: 3, learnedBy: 3 },
    warnings: []
  };
}
