import type { KeyItems } from "@eb/schemas";

export const KEY_ITEM_COLOR = "#ffd23f";
export const KEY_ITEM_SUFFIX = " ◆";

export type KeyItemReader = Pick<KeyItems, "itemIds"> | undefined;

export function normalizeKeyItemIds(keyItems: KeyItemReader): Set<number> {
  return new Set((keyItems?.itemIds ?? [])
    .map((id) => Math.trunc(id))
    .filter((id) => Number.isInteger(id) && id >= 0));
}

export function isKeyItemId(itemId: number, keyItems: KeyItemReader): boolean {
  return normalizeKeyItemIds(keyItems).has(Math.trunc(itemId));
}

export function keyItemLabel(label: string, keyItem: boolean): string {
  return keyItem && !label.endsWith(KEY_ITEM_SUFFIX) ? `${label}${KEY_ITEM_SUFFIX}` : label;
}

export function keyItemSortValue(keyItem: boolean): number {
  return keyItem ? 0 : 1;
}

