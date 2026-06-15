import { describe, expect, it } from "vitest";
import type { CharacterCollection, ItemCollection, PsiCollection, ShopData } from "@eb/schemas";
import type { PartyMember } from "../src/characterModel";
import {
  buildAtmScreen,
  buildCheckDetailScreens,
  buildCheckScreen,
  buildCheckViewModel,
  buildEquipActionScreens,
  buildEquipSlotScreens,
  buildEquipViewModel,
  buildGoodsActionScreens,
  buildGoodsViewModel,
  buildMainMenuScreen,
  buildMenuScreens,
  buildPsiViewModel,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusMemberScreens,
  buildStatusScreen,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  moveMenu,
  openMenu,
  parseMenuAction,
  resolveTalkMenuAction,
  NO_ONE_TO_TALK_TO_MESSAGE,
  TALK_MENU_ACTION_ID,
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

    expect(screen.items.find((item) => item.id === "talk")).toMatchObject({
      label: "Talk",
      enabled: true,
      actionId: TALK_MENU_ACTION_ID
    });
    expect(screen.items.find((item) => item.id === "save")).toMatchObject({
      label: "Save",
      enabled: true,
      actionId: "save"
    });
    expect(parseMenuAction("save")).toEqual({ kind: "save" });
  });

  it("orders the main menu like vanilla EarthBound before local additions", () => {
    const screen = buildMainMenuScreen();

    expect(screen.items.map((item) => item.label)).toEqual([
      "Talk",
      "Goods",
      "PSI",
      "Equip",
      "Check",
      "Status",
      "ATM",
      "Save"
    ]);
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
      experience: 0,
      hp: 50,
      maxHp: 50,
      pp: 12,
      maxPp: 12,
      stats: { offense: 11, defense: 12, speed: 13, guts: 14, vitality: 15, iq: 16, luck: 17 }
    });
    expect(screen.items.map((item) => item.id)).toEqual([
      "status-select-0",
      "status-select-1"
    ]);
    expect(screen.items.map((item) => item.label)).toEqual(["MEMBER_A", "MEMBER_B"]);
    expect(screen.items.map((item) => item.childScreenId)).toEqual(["status-member-0", "status-member-1"]);

    const memberScreens = buildStatusMemberScreens(status);
    expect(memberScreens).toHaveLength(2);
    expect(memberScreens[0].items.map((item) => item.label)).toEqual([
      "MEMBER_A Lv 10",
      "HP 50/50 PP 12/12",
      "EXP 0",
      "Offense 11 Defense 12",
      "Speed 13 Guts 14",
      "Luck 17 Vitality 15",
      "IQ 16"
    ]);
    expect(memberScreens[0].items.every((item) => !item.enabled)).toBe(true);
    const renderedStatus = memberScreens[0].items.map((item) => item.label).join(" ");
    expect(renderedStatus).not.toContain("Wallet");
    expect(renderedStatus).not.toContain("Bank");
    expect(renderedStatus).not.toMatch(/NameMEMBER_A|Level10|Offense11|Defense12/);
    expect(memberScreens[1].items[0].label).toBe("MEMBER_B Lv 20");
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
      experience: 0,
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
      experience: 0,
      hp: 40,
      maxHp: 40
    });
  });

  it("decides whether the Talk command should reuse dialogue or show the no-one message", () => {
    expect(resolveTalkMenuAction({ hasInteractionTarget: true, dialogueCanOpen: true })).toEqual({
      kind: "openDialogue"
    });
    expect(resolveTalkMenuAction({ hasInteractionTarget: false, dialogueCanOpen: true })).toEqual({
      kind: "message",
      message: NO_ONE_TO_TALK_TO_MESSAGE
    });
    expect(resolveTalkMenuAction({ hasInteractionTarget: true, dialogueCanOpen: false })).toEqual({
      kind: "close"
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
    expect(equip.slots.map((slot) => ({
      slot: slot.slot,
      label: slot.label,
      equippedLabel: slot.equippedLabel,
      itemIds: slot.entries.map((entry) => entry.itemId)
    }))).toEqual([
      { slot: "weapon", label: "Weapon", equippedLabel: "-", itemIds: [10, 12] },
      { slot: "body", label: "Body", equippedLabel: "-", itemIds: [] },
      { slot: "arms", label: "Arms", equippedLabel: "-", itemIds: [] },
      { slot: "other", label: "Other", equippedLabel: "-", itemIds: [] }
    ]);
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
    const equipSlotScreens = buildEquipSlotScreens(equip);
    expect(equipSlotScreens.map((screen) => screen.id)).toEqual([
      "equip-slot-1-weapon",
      "equip-slot-1-body",
      "equip-slot-1-arms",
      "equip-slot-1-other"
    ]);
    expect(equipSlotScreens[0].items.map((item) => item.childScreenId)).toEqual([
      "equip-item-1-0-10",
      "equip-item-1-2-12"
    ]);
    expect(equipSlotScreens[1].items).toMatchObject([
      { label: "Nothing to equip.", enabled: false }
    ]);

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

  it("drills Goods, PSI, and Equip through member-select screens", () => {
    const partyMembers = [partyMember(1, "MEMBER_A", 5), partyMember(2, "MEMBER_B", 5)];
    const status = buildStatusViewModel({ partyMembers });
    const screens = buildMenuScreens(status, {
      partyMembers,
      partyState: {
        wallet: 0,
        bank: 0,
        party: () => [1, 2],
        inventory: (char: number) => char === 2 ? [13] : [10, 11, 12],
        equipped: (char: number) => char === 2 ? { body: 13 } : { weapon: 10 }
      },
      items: syntheticItems(),
      psi: syntheticPsi()
    });

    const byId = new Map(screens.map((screen) => [screen.id, screen]));
    expect(byId.get("goods")?.items.map((item) => [item.label, item.childScreenId])).toEqual([
      ["MEMBER_A", "goods-member-0"],
      ["MEMBER_B", "goods-member-1"]
    ]);
    expect(byId.get("goods-member-0")?.items[0]).toMatchObject({
      id: "goods-0-10",
      childScreenId: "goods-item-1-0-10"
    });
    expect(byId.get("goods-member-1")?.items[0]).toMatchObject({
      label: "[item 13 data]",
      childScreenId: "goods-item-2-0-13"
    });

    expect(byId.get("psi")?.items.map((item) => [item.label, item.childScreenId])).toEqual([
      ["MEMBER_A", "psi-member-0"],
      ["MEMBER_B", "psi-member-1"]
    ]);
    expect(byId.get("psi-member-0")?.items.map((item) => item.label)).toEqual(["[psi 7 data] stage-a"]);
    expect(byId.get("psi-member-1")?.items.map((item) => item.label)).toEqual(["[psi 9 data] stage-c"]);

    expect(byId.get("equip")?.items.map((item) => [item.label, item.childScreenId])).toEqual([
      ["MEMBER_A", "equip-member-0"],
      ["MEMBER_B", "equip-member-1"]
    ]);
    expect(byId.get("equip-member-0")?.items.map((item) => item.label)).toEqual([
      "Weapon: [item 10 data]",
      "Body: -",
      "Arms: -",
      "Other: -"
    ]);
    expect(byId.get("equip-member-0")?.items.map((item) => item.childScreenId)).toEqual([
      "equip-slot-1-weapon",
      "equip-slot-1-body",
      "equip-slot-1-arms",
      "equip-slot-1-other"
    ]);
    expect(byId.get("equip-member-1")?.items.map((item) => item.label)).toEqual([
      "Weapon: -",
      "Body: [item 13 data]",
      "Arms: -",
      "Other: -"
    ]);
    expect(byId.get("equip-slot-1-weapon")?.items.map((item) => item.childScreenId)).toEqual([
      "equip-item-1-0-10",
      "equip-item-1-2-12"
    ]);
    expect(byId.get("equip-slot-1-body")?.items).toMatchObject([
      { label: "Nothing to equip.", enabled: false }
    ]);
    expect(parseMenuAction(byId.get("equip-item-2-0-13")?.items[0]?.actionId ?? "")).toEqual({
      kind: "equip",
      char: 2,
      inventorySlot: 0,
      itemId: 13
    });

    expect(byId.get("check")?.items[0]?.id).not.toBe("check-stub");
    expect(byId.get("check")?.items[0]?.childScreenId).toBe("check-item-0-10");
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
    experience: 0,
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
      itemData(12, true, "Neutral help text for [item 12 data]."),
      itemData(13, true, undefined, 0x14)
    ],
    counts: { items: 4, equippable: 3 },
    warnings: []
  };
}

function itemData(
  id: number,
  equippable: boolean,
  helpText?: string,
  type = equippable ? 0x10 : 0x20
): ItemCollection["items"][number] {
  return {
    id,
    name: `[item ${id} data]`,
    type,
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
        learnedBy: [{ charId: 2, level: 1 }]
      }
    ],
    counts: { psi: 3, learnedBy: 3 },
    warnings: []
  };
}
