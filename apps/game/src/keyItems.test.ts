import { describe, expect, it } from "vitest";
import { isKeyItemId, keyItemLabel, keyItemSortValue, normalizeKeyItemIds } from "./keyItems";

describe("key item helpers", () => {
  it("classifies ids from the content list", () => {
    const keyItems = { itemIds: [177, 170, 170] };

    expect([...normalizeKeyItemIds(keyItems)].sort((a, b) => a - b)).toEqual([170, 177]);
    expect(isKeyItemId(177, keyItems)).toBe(true);
    expect(isKeyItemId(178, keyItems)).toBe(false);
  });

  it("decorates labels once and pins key items before normal goods", () => {
    expect(keyItemLabel("Proof Card", true)).toBe("Proof Card ◆");
    expect(keyItemLabel("Proof Card ◆", true)).toBe("Proof Card ◆");
    expect(keyItemLabel("Pocket Snack", false)).toBe("Pocket Snack");

    const sorted = [
      { label: "Snack", keyItem: false, slot: 0 },
      { label: "Proof", keyItem: true, slot: 1 },
      { label: "Ticket", keyItem: true, slot: 2 }
    ].sort((a, b) => keyItemSortValue(a.keyItem) - keyItemSortValue(b.keyItem) || a.slot - b.slot);

    expect(sorted.map((entry) => entry.label)).toEqual(["Proof", "Ticket", "Snack"]);
  });
});
