export type PartyStateCounts = {
  wallet: number;
  inventoryChars: number;
  inventoryItems: number;
  partyCount: number;
};

/**
 * Minimal session-only party/inventory state for event effects.
 * Phase 4/5 can replace this with durable item and actor models.
 */
export class PartyState {
  private walletValue = 0;
  private readonly inventoryByChar = new Map<number, number[]>();
  private readonly partyIds = new Set<number>();

  get wallet(): number {
    return this.walletValue;
  }

  inventory(char: number): number[] {
    return [...(this.inventoryByChar.get(normalizeId(char)) ?? [])];
  }

  party(): number[] {
    return [...this.partyIds].sort((a, b) => a - b);
  }

  give(char: number, item: number): void {
    const normalizedChar = normalizeId(char);
    const items = this.inventoryByChar.get(normalizedChar) ?? [];
    items.push(normalizeId(item));
    this.inventoryByChar.set(normalizedChar, items);
  }

  take(char: number, item: number): boolean {
    const normalizedChar = normalizeId(char);
    const items = this.inventoryByChar.get(normalizedChar) ?? [];
    const index = items.indexOf(normalizeId(item));
    if (index < 0) {
      return false;
    }
    items.splice(index, 1);
    if (items.length === 0) {
      this.inventoryByChar.delete(normalizedChar);
    } else {
      this.inventoryByChar.set(normalizedChar, items);
    }
    return true;
  }

  money(delta: number): void {
    const next = this.walletValue + Math.trunc(delta);
    this.walletValue = Math.max(0, next);
  }

  applyMoney(op: "give" | "take", amount: number): void {
    this.money(op === "give" ? amount : -amount);
  }

  partyOp(op: "add" | "remove", char: number): void {
    const normalizedChar = normalizeId(char);
    if (op === "add") {
      this.partyIds.add(normalizedChar);
      return;
    }
    this.partyIds.delete(normalizedChar);
  }

  counts(): PartyStateCounts {
    let inventoryItems = 0;
    for (const items of this.inventoryByChar.values()) {
      inventoryItems += items.length;
    }
    return {
      wallet: this.walletValue,
      inventoryChars: this.inventoryByChar.size,
      inventoryItems,
      partyCount: this.partyIds.size
    };
  }
}

function normalizeId(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid session state id: ${value}`);
  }
  return value;
}
