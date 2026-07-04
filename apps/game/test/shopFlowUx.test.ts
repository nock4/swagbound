import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ItemCollectionSchema,
  ShopDataSchema,
  type ItemData,
  type ShopData
} from "@eb/schemas";
import type { PartyMember } from "../src/characterModel";
import {
  buildShopMenuScreens,
  buildShopViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  currentItem,
  menuDebugState,
  moveMenu,
  openMenu,
  parseMenuAction,
  refreshMenuStackScreens,
  shopRootScreenId,
  type MenuAction,
  type MenuScreen,
  type MenuState
} from "../src/menuModel";
import { PartyState } from "../src/partyState";

const GENERATED = resolve(__dirname, "../public/generated");
const TEST_CHAR_ID = 0;
const EMPTY_STORE_ID = 0;
// In-slice custom dialogue wires the drugstore/item-shop clerk to store 1.
const DRUGSTORE_STORE_ID = 1;

const items = ItemCollectionSchema.parse(
  JSON.parse(readFileSync(resolve(GENERATED, "items.json"), "utf8"))
);
const shops = ShopDataSchema.parse(
  JSON.parse(readFileSync(resolve(GENERATED, "shops.json"), "utf8"))
);
const itemById = new Map(items.items.map((item) => [item.id, item]));

const testMember: PartyMember = {
  id: TEST_CHAR_ID,
  name: "HERO",
  level: 1,
  experience: 0,
  hp: 40,
  maxHp: 40,
  pp: 0,
  maxPp: 0,
  stats: {
    offense: 1,
    defense: 1,
    speed: 1,
    guts: 1,
    vitality: 1,
    iq: 1,
    luck: 1
  },
  inventory: [],
  money: 0
};

type ShopFlowHarness = {
  storeId: number;
  activeShopStoreId?: number;
  menuScreens: Map<string, MenuScreen>;
  menuState: MenuState;
  partyState: PartyState;
};

function newPartyState(options: { wallet?: number; inventory?: number[] } = {}): PartyState {
  const partyState = new PartyState();
  partyState.partyOp("add", TEST_CHAR_ID);
  partyState.money(options.wallet ?? 0);
  for (const itemId of options.inventory ?? []) {
    partyState.give(TEST_CHAR_ID, itemId);
  }
  return partyState;
}

function shopScreens(storeId: number, partyState: PartyState): Map<string, MenuScreen> {
  const viewModel = buildShopViewModel({
    partyMembers: [testMember],
    partyState,
    items,
    shops,
    storeId
  });
  return new Map(buildShopMenuScreens(viewModel).map((screen) => [screen.id, screen]));
}

function openShop(storeId: number, partyState = newPartyState()): ShopFlowHarness {
  const menuScreens = shopScreens(storeId, partyState);
  const root = menuScreens.get(shopRootScreenId(storeId));
  expect(root, `store ${storeId} must have a shop root screen`).toBeDefined();
  return {
    storeId,
    activeShopStoreId: storeId,
    menuScreens,
    menuState: openMenu(root!),
    partyState
  };
}

function refreshOpenShop(flow: ShopFlowHarness): void {
  flow.menuScreens = shopScreens(flow.storeId, flow.partyState);
  flow.menuState = refreshMenuStackScreens(flow.menuState, (id) => flow.menuScreens.get(id));
  if (!flow.menuState.open) {
    flow.activeShopStoreId = undefined;
  }
}

function confirmCurrent(flow: ShopFlowHarness): string | undefined {
  refreshOpenShop(flow);
  const result = confirmMenu(flow.menuState, (id) => flow.menuScreens.get(id));
  flow.menuState = result.state;
  return result.actionId;
}

function cancelCurrent(flow: ShopFlowHarness): void {
  flow.menuState = cancelMenu(flow.menuState);
  if (!flow.menuState.open) {
    flow.activeShopStoreId = undefined;
  }
}

function selectCurrentScreenItem(flow: ShopFlowHarness, itemId: string): void {
  const frame = flow.menuState.stack[flow.menuState.stack.length - 1];
  const index = frame.screen.items.findIndex((item) => item.id === itemId);
  expect(index, `${frame.screen.id} should include ${itemId}`).toBeGreaterThanOrEqual(0);
  flow.menuState = moveMenu(flow.menuState, index - frame.cursorIndex);
  expect(currentItem(flow.menuState)?.id).toBe(itemId);
}

function handleShopAction(flow: ShopFlowHarness, actionId: string): void {
  const action = parseMenuAction(actionId);
  if (!action) {
    throw new Error(`unparseable menu action: ${actionId}`);
  }

  if (action.kind === "shopCancel") {
    flow.menuState = closedMenu();
    flow.activeShopStoreId = undefined;
    return;
  }

  if (action.kind === "shopBuy") {
    handleShopBuy(flow, action);
    return;
  }

  if (action.kind === "shopSell") {
    handleShopSell(flow, action);
    return;
  }

  throw new Error(`unexpected shop-flow action: ${action.kind}`);
}

function handleShopBuy(flow: ShopFlowHarness, action: Extract<MenuAction, { kind: "shopBuy" }>): void {
  const shop = shops.shops.find((entry) => entry.id === action.storeId);
  if (shop?.itemIds.includes(action.itemId)) {
    flow.partyState.buyItem(action.char, itemFor(action.itemId));
  }
  refreshOpenShop(flow);
}

function handleShopSell(flow: ShopFlowHarness, action: Extract<MenuAction, { kind: "shopSell" }>): void {
  if (flow.partyState.inventory(action.char)[action.inventorySlot] === action.itemId) {
    flow.partyState.sellItem(action.char, itemFor(action.itemId));
  }
  refreshOpenShop(flow);
}

function itemFor(itemId: number): Pick<ItemData, "id" | "cost"> {
  return itemById.get(itemId) ?? { id: itemId, cost: 0 };
}

function openBuyScreen(flow: ShopFlowHarness): void {
  selectCurrentScreenItem(flow, `shop-buy-${flow.storeId}`);
  const actionId = confirmCurrent(flow);
  expect(actionId).toBeUndefined();
  expect(menuDebugState(flow.menuState).stack).toEqual([
    shopRootScreenId(flow.storeId),
    `${shopRootScreenId(flow.storeId)}-buy`
  ]);
}

function openSellScreen(flow: ShopFlowHarness): void {
  selectCurrentScreenItem(flow, `shop-sell-${flow.storeId}`);
  const actionId = confirmCurrent(flow);
  expect(actionId).toBeUndefined();
  expect(menuDebugState(flow.menuState).stack).toEqual([
    shopRootScreenId(flow.storeId),
    `${shopRootScreenId(flow.storeId)}-sell`
  ]);
}

function assertOpenAndExitable(flow: ShopFlowHarness): void {
  expect(flow.menuState.open, `store ${flow.storeId} should still have an open menu`).toBe(true);
  expect(flow.menuState.stack.length, `store ${flow.storeId} should not have an orphaned stack`).toBeGreaterThan(0);
  expect(flow.activeShopStoreId).toBe(flow.storeId);

  const frame = flow.menuState.stack[flow.menuState.stack.length - 1];
  expect(frame.cursorIndex).toBeGreaterThanOrEqual(frame.screen.items.length > 0 ? 0 : -1);
  expect(frame.cursorIndex).toBeLessThan(frame.screen.items.length);
  const enabledCount = frame.screen.items.filter((item) => item.enabled).length;
  if (enabledCount > 0) {
    expect(currentItem(flow.menuState)?.enabled).toBe(true);
  }

  const canceled = cancelMenu(flow.menuState);
  if (flow.menuState.stack.length === 1) {
    expect(canceled).toEqual(closedMenu());
  } else {
    expect(canceled.open).toBe(true);
    expect(canceled.stack.length).toBe(flow.menuState.stack.length - 1);
  }
}

function assertCancelPathCloses(source: ShopFlowHarness): void {
  const flow: ShopFlowHarness = { ...source, menuState: source.menuState };
  while (flow.menuState.open) {
    const before = menuDebugState(flow.menuState);
    const beforeDepth = flow.menuState.stack.length;
    cancelCurrent(flow);
    if (beforeDepth === 1) {
      expect(flow.menuState, `cancel at ${before.stack.join(" > ")} should close`).toEqual(closedMenu());
      expect(flow.activeShopStoreId).toBeUndefined();
    } else {
      const after = menuDebugState(flow.menuState);
      expect(after.open, `cancel at ${before.stack.join(" > ")} should keep parent open`).toBe(true);
      expect(after.stack.length).toBe(beforeDepth - 1);
    }
  }
}

function firstStockedItemId(shopData: ShopData): number {
  const itemId = shopData.shops.flatMap((shop) => shop.itemIds)[0];
  expect(itemId, "generated shops need at least one stocked item for sell-flow coverage").toBeDefined();
  return itemId!;
}

describe("shop-flow UX", () => {
  it("covers the empty shop, the drugstore, and every generated shop", () => {
    const storeIds = shops.shops.map((shop) => shop.id);
    expect(storeIds).toContain(EMPTY_STORE_ID);
    expect(shops.shops.find((shop) => shop.id === EMPTY_STORE_ID)?.itemIds).toEqual([]);
    expect(storeIds).toContain(DRUGSTORE_STORE_ID);
    expect(shops.shops.find((shop) => shop.id === DRUGSTORE_STORE_ID)?.itemIds.length).toBeGreaterThan(0);
  });

  it("lets every root, buy, and sell screen back out one level at a time and close cleanly", () => {
    const sellItemId = firstStockedItemId(shops);

    for (const shop of shops.shops) {
      assertCancelPathCloses(openShop(shop.id));

      const buyFlow = openShop(shop.id);
      openBuyScreen(buyFlow);
      assertOpenAndExitable(buyFlow);
      assertCancelPathCloses(buyFlow);

      const sellFlow = openShop(shop.id, newPartyState({ inventory: [sellItemId] }));
      openSellScreen(sellFlow);
      assertOpenAndExitable(sellFlow);
      assertCancelPathCloses(sellFlow);

      const closeFlow = openShop(shop.id);
      selectCurrentScreenItem(closeFlow, `shop-cancel-${shop.id}`);
      const closeActionId = confirmCurrent(closeFlow);
      expect(parseMenuAction(closeActionId ?? "")).toEqual({ kind: "shopCancel" });
      handleShopAction(closeFlow, closeActionId!);
      expect(closeFlow.menuState).toEqual(closedMenu());
      expect(closeFlow.activeShopStoreId).toBeUndefined();
    }
  });

  it("keeps every completed buy on an open, refreshed, exitable shop screen", () => {
    for (const shop of shops.shops) {
      for (let index = 0; index < shop.itemIds.length; index += 1) {
        const itemId = shop.itemIds[index];
        const item = itemFor(itemId);
        const flow = openShop(shop.id, newPartyState({ wallet: item.cost }));
        openBuyScreen(flow);
        // Step through ENABLED rows until the target buy row is current. moveMenu skips
        // disabled (unaffordable) rows, so a raw index delta can't address the target;
        // the affordable target row is reachable by wrapping the cursor.
        const targetRow = `shop-buy-${index}-${itemId}`;
        for (let guard = 0; guard < 32 && currentItem(flow.menuState)?.id !== targetRow; guard += 1) {
          flow.menuState = moveMenu(flow.menuState, 1);
        }
        expect(currentItem(flow.menuState)?.id).toBe(targetRow);

        const actionId = confirmCurrent(flow);
        expect(parseMenuAction(actionId ?? "")).toEqual({
          kind: "shopBuy",
          storeId: shop.id,
          char: TEST_CHAR_ID,
          itemId
        });
        handleShopAction(flow, actionId!);

        expect(flow.partyState.wallet).toBe(0);
        expect(flow.partyState.inventory(TEST_CHAR_ID)).toContain(itemId);
        expect(menuDebugState(flow.menuState).stack).toEqual([
          shopRootScreenId(shop.id),
          `${shopRootScreenId(shop.id)}-buy`
        ]);
        expect(flow.menuState.stack[0].screen.items[0].label).toBe("$swag 0");
        assertOpenAndExitable(flow);
        assertCancelPathCloses(flow);
      }
    }
  });

  it("keeps every completed sell on an open, refreshed, exitable shop screen", () => {
    const sellItemId = firstStockedItemId(shops);
    const sellPrice = Math.floor(itemFor(sellItemId).cost / 2);

    for (const shop of shops.shops) {
      const flow = openShop(shop.id, newPartyState({ inventory: [sellItemId] }));
      openSellScreen(flow);

      const actionId = confirmCurrent(flow);
      expect(parseMenuAction(actionId ?? "")).toEqual({
        kind: "shopSell",
        storeId: shop.id,
        char: TEST_CHAR_ID,
        inventorySlot: 0,
        itemId: sellItemId
      });
      handleShopAction(flow, actionId!);

      expect(flow.partyState.wallet).toBe(sellPrice);
      expect(flow.partyState.inventory(TEST_CHAR_ID)).toEqual([]);
      expect(menuDebugState(flow.menuState).stack).toEqual([
        shopRootScreenId(shop.id),
        `${shopRootScreenId(shop.id)}-sell`
      ]);
      expect(flow.menuState.stack[0].screen.items[0].label).toBe(`$swag ${sellPrice}`);
      assertOpenAndExitable(flow);
      assertCancelPathCloses(flow);
    }
  });
});
