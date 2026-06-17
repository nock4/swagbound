import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ItemCollectionSchema,
  ItemOverridesSchema,
  ShopDataSchema,
  type ItemCollection,
  type ItemData,
  type ShopData
} from "@eb/schemas";
import { PartyState, sellPriceForItem } from "../src/partyState";
import {
  buildShopMenuScreens,
  buildShopViewModel,
  parseMenuAction
} from "../src/menuModel";
import { createDialogueResolver } from "../src/dialogueRenderer";

const GEN = "apps/game/public/generated";

// In-slice service clerks (per slice brief): item shop = store 1 (npc 404 / "Sal"),
// grocery = store 4 (npc 749 / "Morrow"). These are the stores a reachable Onett clerk opens.
const IN_SLICE_STORE_IDS = [1, 4] as const;

async function loadShopData(): Promise<{
  shops: ShopData;
  items: ItemCollection;
  overrides: Record<string, { name: string }>;
}> {
  const shops = ShopDataSchema.parse(
    JSON.parse(await readFile(resolve(GEN, "shops.json"), "utf8"))
  );
  const items = ItemCollectionSchema.parse(
    JSON.parse(await readFile(resolve(GEN, "items.json"), "utf8"))
  );
  const overrides = ItemOverridesSchema.parse(
    JSON.parse(await readFile(resolve("content/item-overrides.json"), "utf8"))
  );
  return { shops, items, overrides: overrides.byItemId };
}

// Mirror of loader.ts applyItemOverrides (name-only merge) so the test exercises the
// same data path the runtime uses to feed the menu/dialogue resolver.
function applyOverrides(
  items: ItemCollection,
  byItemId: Record<string, { name: string }>
): ItemCollection {
  return {
    ...items,
    items: items.items.map((item) => {
      const override = byItemId[String(item.id)];
      return override ? { ...item, name: override.name } : item;
    })
  };
}

function itemById(items: ItemCollection): Map<number, ItemData> {
  return new Map(items.items.map((item) => [item.id, item]));
}

describe("shops & services QA (generated slice data)", () => {
  it("in-slice stores have items, valid positive $swag costs, and Swagbound name overrides", async () => {
    const { shops, items, overrides } = await loadShopData();
    const byId = itemById(items);

    for (const storeId of IN_SLICE_STORE_IDS) {
      const shop = shops.shops.find((entry) => entry.id === storeId);
      expect(shop, `store ${storeId} must exist`).toBeDefined();
      expect(shop!.itemIds.length, `store ${storeId} must stock items`).toBeGreaterThan(0);

      for (const itemId of shop!.itemIds) {
        const item = byId.get(itemId);
        expect(item, `store ${storeId} item ${itemId} must resolve`).toBeDefined();
        // Buy price must be a positive integer (no free / negative shop goods).
        expect(item!.cost).toBeGreaterThan(0);
        expect(Number.isInteger(item!.cost)).toBe(true);
        // Every stocked item must carry a Swagbound rename.
        expect(overrides[String(itemId)], `item ${itemId} needs an override`).toBeDefined();
        expect(overrides[String(itemId)].name.length).toBeGreaterThan(0);
      }
    }
  });

  it("every item stocked by any shop is renamed and priced (no orphan / no zero-cost goods)", async () => {
    const { shops, items, overrides } = await loadShopData();
    const byId = itemById(items);

    const stocked = new Set<number>();
    for (const shop of shops.shops) {
      for (const id of shop.itemIds) {
        stocked.add(id);
      }
    }

    const missingOverride: number[] = [];
    const zeroCost: number[] = [];
    for (const id of stocked) {
      if (!overrides[String(id)]) missingOverride.push(id);
      const item = byId.get(id);
      if (!item || item.cost <= 0) zeroCost.push(id);
    }
    expect(missingOverride).toEqual([]);
    expect(zeroCost).toEqual([]);

    // Overrides are scoped exactly to shop goods (no orphan overrides for unsold items).
    const orphanOverrides = Object.keys(overrides)
      .map(Number)
      .filter((id) => !stocked.has(id));
    expect(orphanOverrides).toEqual([]);
  });

  it("Swagbound shop names are unique (no two goods collapse to the same label)", async () => {
    const { overrides } = await loadShopData();
    const names = Object.values(overrides).map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("shop view model surfaces Swagbound names + $swag costs for a real in-slice store", async () => {
    const { shops, items, overrides } = await loadShopData();
    const resolved = applyOverrides(items, overrides);
    const resolver = createDialogueResolver({ items: resolved });
    const byId = itemById(resolved);

    const shop = buildShopViewModel({
      partyMembers: [
        {
          id: 1,
          name: "HERO",
          level: 1,
          experience: 0,
          hp: 10,
          maxHp: 10,
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
          money: 0,
          inventory: []
        }
      ],
      partyState: { wallet: 999, bank: 0, party: () => [1], inventory: () => [] },
      items: resolved,
      shops,
      resolver,
      storeId: 1
    });

    expect(shop.available).toBe(true);
    expect(shop.buyEntries.length).toBe(shops.shops.find((s) => s.id === 1)!.itemIds.length);

    for (const entry of shop.buyEntries) {
      const item = byId.get(entry.itemId)!;
      // cost reflected in the view model equals the item cost (post-override, name-only change).
      expect(entry.cost).toBe(item.cost);
      // sell price is floor(cost/2).
      expect(entry.price).toBe(Math.floor(item.cost / 2));
      // label leads with the Swagbound override name, then the cost.
      const expectedName = overrides[String(entry.itemId)].name;
      expect(entry.label.startsWith(expectedName)).toBe(true);
      expect(entry.label.endsWith(String(item.cost))).toBe(true);
    }

    // Currency label is "$swag".
    const screens = buildShopMenuScreens(shop);
    const walletItem = screens[0].items.find((i) => i.id === "shop-wallet-1");
    expect(walletItem?.label.startsWith("$swag ")).toBe(true);
  });

  it("buy deducts $swag, respects affordability, and credits items to inventory", async () => {
    const { shops, items } = await loadShopData();
    const byId = itemById(items);
    const store1 = shops.shops.find((s) => s.id === 1)!;
    const cheapest = store1.itemIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.cost - b.cost)[0];
    const priciest = store1.itemIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => b.cost - a.cost)[0];

    const ps = new PartyState();
    ps.money(cheapest.cost); // exactly affordable

    const buy = ps.buyItem(1, cheapest);
    expect(buy.ok).toBe(true);
    if (buy.ok) {
      expect(buy.cost).toBe(cheapest.cost);
      expect(buy.nextWallet).toBe(0);
    }
    expect(ps.wallet).toBe(0);
    expect(ps.inventory(1)).toContain(cheapest.id);

    // Now broke: an unaffordable buy must fail and leave wallet/inventory untouched.
    const beforeWallet = ps.wallet;
    const beforeInv = ps.inventory(1).length;
    const denied = ps.buyItem(1, priciest);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("insufficientFunds");
    expect(ps.wallet).toBe(beforeWallet);
    expect(ps.inventory(1).length).toBe(beforeInv);
  });

  it("sell credits floor(cost/2) $swag, removes the item, and rejects items not held", async () => {
    const { shops, items } = await loadShopData();
    const byId = itemById(items);
    // Use an item with an odd cost so the floor() rounding is exercised.
    const oddCostItem = items.items.find(
      (i) => i.cost % 2 === 1 && shops.shops.some((s) => s.itemIds.includes(i.id))
    );
    expect(oddCostItem, "expected at least one odd-cost shop item").toBeDefined();
    const item = oddCostItem!;
    const expectedPrice = Math.floor(item.cost / 2);
    expect(sellPriceForItem(item)).toBe(expectedPrice);

    const ps = new PartyState();
    ps.give(1, item.id);
    const startWallet = ps.wallet;

    const sale = ps.sellItem(1, item);
    expect(sale.ok).toBe(true);
    if (sale.ok) expect(sale.price).toBe(expectedPrice);
    expect(ps.wallet).toBe(startWallet + expectedPrice);
    expect(ps.inventory(1)).not.toContain(item.id);

    // Selling again (now missing) must fail without changing the wallet.
    const walletAfter = ps.wallet;
    const denied = ps.sellItem(1, item);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("missingItem");
    expect(ps.wallet).toBe(walletAfter);
  });

  it("buy then sell of the same good reflects the 50% spread (round-trip loss)", async () => {
    const { shops, items } = await loadShopData();
    const byId = itemById(items);
    const item = byId.get(shops.shops.find((s) => s.id === 1)!.itemIds[0])!;

    const ps = new PartyState();
    ps.money(item.cost);
    const buy = ps.buyItem(1, item);
    expect(buy.ok).toBe(true);
    expect(ps.wallet).toBe(0);

    const sale = ps.sellItem(1, item);
    expect(sale.ok).toBe(true);
    // Player paid full cost, recovers half: net wallet = floor(cost/2), never exceeds the buy price.
    expect(ps.wallet).toBe(Math.floor(item.cost / 2));
    expect(ps.wallet).toBeLessThanOrEqual(item.cost);
  });
});
