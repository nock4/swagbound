import type { ItemData } from "@eb/schemas";
import type { Combatant } from "./battleLogic";
import type { PartyMember, PartyMemberStats } from "./characterModel";
import {
  createRollingMeter,
  setTarget,
  tick,
  type RollingMeterState
} from "./rollingMeter";

export type PartyStateCounts = {
  wallet: number;
  bank: number;
  inventoryChars: number;
  inventoryItems: number;
  partyCount: number;
};

export type EquipmentSlot = "weapon" | "body" | "arms" | "other";

export type EquippedSlots = Partial<Record<EquipmentSlot, number>>;

export type PartyInventorySnapshot = {
  charId: number;
  itemIds: number[];
};

export type PartyEquipmentSnapshot = {
  charId: number;
  slots: EquippedSlots;
};

export type PartyBattleMemberSnapshot = {
  charId: number;
  level: number;
  experience: number;
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  inventory: number[];
  stats: PartyMemberStats;
};

export type PartyStateSnapshot = {
  wallet: number;
  bank?: number;
  partyIds: number[];
  inventory: PartyInventorySnapshot[];
  equipped: PartyEquipmentSnapshot[];
  battleMembers?: PartyBattleMemberSnapshot[];
};

export type PartyVitalsInput = {
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  hpRatePerSec?: number;
};

export type PartyVitals = {
  hp: RollingMeterState;
  maxHp: number;
  pp: number;
  maxPp: number;
};

export type ItemUseEffect =
  | { kind: "healHp"; amount: number }
  | { kind: "healHpPercent"; percent: number }
  | { kind: "recoverPp"; amount: number }
  | { kind: "recoverPpPercent"; percent: number };

export type ItemUseResult =
  | {
      ok: true;
      itemId: number;
      ownerChar: number;
      targetChar: number;
      effect: ItemUseEffect;
      previousValue: number;
      nextValue: number;
    }
  | {
      ok: false;
      itemId: number;
      ownerChar: number;
      targetChar: number;
      reason: "missingItem" | "notConsumable" | "unknownEffect";
    };

export type PartyVitalsApplyResult = {
  charId: number;
  effect: ItemUseEffect;
  previousValue: number;
  nextValue: number;
};

export type EquipResult =
  | {
      ok: true;
      char: number;
      itemId: number;
      slot: EquipmentSlot;
      equipped: boolean;
      previousItemId?: number;
    }
  | {
      ok: false;
      char: number;
      itemId: number;
      reason: "notEquippable";
    };

export type ShopBuyResult =
  | {
      ok: true;
      char: number;
      itemId: number;
      cost: number;
      previousWallet: number;
      nextWallet: number;
    }
  | {
      ok: false;
      char: number;
      itemId: number;
      cost: number;
      reason: "insufficientFunds";
    };

export type ShopSellResult =
  | {
      ok: true;
      char: number;
      itemId: number;
      price: number;
      previousWallet: number;
      nextWallet: number;
    }
  | {
      ok: false;
      char: number;
      itemId: number;
      price: number;
      reason: "missingItem";
    };

const HP_RATE_PER_SEC = 36;
const ITEM_DISAPPEARS_FLAG = "item disappears when used";
const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "body", "arms", "other"];

const FIELD_STAT_ACTIONS = {
  healHpPercent: new Set([0x00, 0x1e00]),
  healHp: new Set([0x02, 0x1e02]),
  recoverPpPercent: new Set([0x04, 0x1e04]),
  recoverPp: new Set([0x06, 0x1e06])
} as const;

/**
 * Minimal session-only party/inventory state for event effects.
 * Phase 4/5 can replace this with durable item and actor models.
 */
export class PartyState {
  private walletValue = 0;
  private bankValue = 0;
  private readonly inventoryByChar = new Map<number, number[]>();
  private readonly partyIds = new Set<number>();
  private readonly equippedByChar = new Map<number, EquippedSlots>();
  private readonly vitalsByChar = new Map<number, PartyVitals>();
  private readonly battleMembersByChar = new Map<number, PartyBattleMemberSnapshot>();

  get wallet(): number {
    return this.walletValue;
  }

  get bank(): number {
    return this.bankValue;
  }

  inventory(char: number): number[] {
    return [...(this.inventoryByChar.get(normalizeId(char)) ?? [])];
  }

  equipped(char: number): EquippedSlots {
    return { ...(this.equippedByChar.get(normalizeId(char)) ?? {}) };
  }

  vitals(char: number): PartyVitals | undefined {
    const vitals = this.vitalsByChar.get(normalizeId(char));
    return vitals ? cloneVitals(vitals) : undefined;
  }

  battleMember(char: number): PartyBattleMemberSnapshot | undefined {
    const member = this.battleMembersByChar.get(normalizeId(char));
    return member ? cloneBattleMember(member) : undefined;
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
    if (!items.includes(normalizeId(item))) {
      this.clearEquippedItem(normalizedChar, normalizeId(item));
    }
    return true;
  }

  useItem(options: {
    ownerChar: number;
    targetChar: number;
    item: Pick<ItemData, "id" | "action" | "argument" | "miscFlags" | "effect">;
    targetVitals: PartyVitalsInput;
  }): ItemUseResult {
    const ownerChar = normalizeId(options.ownerChar);
    const targetChar = normalizeId(options.targetChar);
    const itemId = normalizeId(options.item.id);
    if (!this.inventory(ownerChar).includes(itemId)) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "missingItem" };
    }
    if (!isConsumableItem(options.item)) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "notConsumable" };
    }
    const effect = decodeItemUseEffect(options.item);
    if (!effect) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "unknownEffect" };
    }

    const applied = this.applyEffectToChar(targetChar, effect, options.targetVitals);
    if (!applied) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "unknownEffect" };
    }
    this.take(ownerChar, itemId);
    return {
      ok: true,
      itemId,
      ownerChar,
      targetChar,
      effect,
      previousValue: applied.previousValue,
      nextValue: applied.nextValue
    };
  }

  applyPartyStat(char: number, effect: ItemUseEffect): PartyVitalsApplyResult[] {
    const targetChars = char === 0 ? this.partyVitalTargetIds() : [normalizeId(char)];
    return targetChars
      .map((charId) => this.applyEffectToChar(charId, effect))
      .filter((result): result is PartyVitalsApplyResult => Boolean(result));
  }

  equip(char: number, item: Pick<ItemData, "id" | "type">): EquipResult {
    // The current item schema exposes equipment slot type, but not stat bonus fields.
    // Keep slot state here; stat math can consume bonuses when a data source provides them.
    const normalizedChar = normalizeId(char);
    const itemId = normalizeId(item.id);
    const slot = equipmentSlotForItemType(item.type);
    if (!slot) {
      return { ok: false, char: normalizedChar, itemId, reason: "notEquippable" };
    }
    const equipped = { ...(this.equippedByChar.get(normalizedChar) ?? {}) };
    const previousItemId = equipped[slot];
    if (previousItemId === itemId) {
      delete equipped[slot];
      this.setEquippedSlots(normalizedChar, equipped);
      return { ok: true, char: normalizedChar, itemId, slot, equipped: false, previousItemId };
    }
    equipped[slot] = itemId;
    this.setEquippedSlots(normalizedChar, equipped);
    return {
      ok: true,
      char: normalizedChar,
      itemId,
      slot,
      equipped: true,
      ...(previousItemId !== undefined ? { previousItemId } : {})
    };
  }

  tickMeters(dtMs: number): void {
    for (const [char, vitals] of this.vitalsByChar.entries()) {
      this.vitalsByChar.set(char, {
        ...vitals,
        hp: tick(vitals.hp, dtMs)
      });
    }
  }

  money(delta: number): void {
    const next = this.walletValue + Math.trunc(delta);
    this.walletValue = Math.max(0, next);
  }

  applyMoney(op: "give" | "take", amount: number): void {
    this.money(op === "give" ? amount : -amount);
  }

  deposit(amount: number): number {
    const moved = Math.min(stat(amount), this.walletValue);
    this.walletValue -= moved;
    this.bankValue += moved;
    return moved;
  }

  withdraw(amount: number): number {
    const moved = Math.min(stat(amount), this.bankValue);
    this.bankValue -= moved;
    this.walletValue += moved;
    return moved;
  }

  applyAtm(op: "deposit" | "withdraw", amount: number): number {
    return op === "deposit" ? this.deposit(amount) : this.withdraw(amount);
  }

  buyItem(char: number, item: Pick<ItemData, "id" | "cost">): ShopBuyResult {
    const normalizedChar = normalizeId(char);
    const itemId = normalizeId(item.id);
    const cost = stat(item.cost);
    const previousWallet = this.walletValue;
    if (previousWallet < cost) {
      return { ok: false, char: normalizedChar, itemId, cost, reason: "insufficientFunds" };
    }
    this.walletValue = previousWallet - cost;
    this.give(normalizedChar, itemId);
    return {
      ok: true,
      char: normalizedChar,
      itemId,
      cost,
      previousWallet,
      nextWallet: this.walletValue
    };
  }

  sellItem(char: number, item: Pick<ItemData, "id" | "cost">): ShopSellResult {
    const normalizedChar = normalizeId(char);
    const itemId = normalizeId(item.id);
    const price = sellPriceForItem(item);
    const previousWallet = this.walletValue;
    if (!this.take(normalizedChar, itemId)) {
      return { ok: false, char: normalizedChar, itemId, price, reason: "missingItem" };
    }
    this.walletValue = previousWallet + price;
    return {
      ok: true,
      char: normalizedChar,
      itemId,
      price,
      previousWallet,
      nextWallet: this.walletValue
    };
  }

  partyOp(op: "add" | "remove", char: number): void {
    const normalizedChar = normalizeId(char);
    if (op === "add") {
      this.partyIds.add(normalizedChar);
      return;
    }
    this.partyIds.delete(normalizedChar);
  }

  applyBattleResult(party: Combatant[], wallet: number): void {
    this.walletValue = stat(wallet);
    for (const combatant of party.filter((member) => !member.isEnemy)) {
      const charId = normalizeId(combatant.charId);
      const inventory = combatant.inventory.map(normalizeId);
      this.partyIds.add(charId);
      if (inventory.length > 0) {
        this.inventoryByChar.set(charId, inventory);
      } else {
        this.inventoryByChar.delete(charId);
      }
      this.vitalsByChar.set(charId, {
        hp: {
          ...combatant.hp,
          displayed: Math.min(positiveStat(combatant.maxHp), stat(combatant.hp.displayed)),
          target: Math.min(positiveStat(combatant.maxHp), stat(combatant.hp.target)),
          ratePerSec: positiveStat(combatant.hp.ratePerSec),
          isRolling: false
        },
        maxHp: positiveStat(combatant.maxHp),
        pp: Math.min(stat(combatant.maxPp), stat(combatant.pp)),
        maxPp: stat(combatant.maxPp)
      });
      this.battleMembersByChar.set(charId, battleMemberFromCombatant(combatant));
    }
  }

  applyToPartyMembers(members: PartyMember[]): PartyMember[] {
    const activeIds = this.party();
    const selected = activeIds.length > 0
      ? activeIds.map((id) => members.find((member) => normalizeId(member.id) === id)).filter((member): member is PartyMember => Boolean(member))
      : members;
    return selected.map((member) => {
      const charId = normalizeId(member.id);
      const battleMember = this.battleMembersByChar.get(charId);
      const vitals = this.vitalsByChar.get(charId);
      const inventory = this.inventoryByChar.has(charId)
        ? this.inventory(charId)
        : battleMember?.inventory ?? member.inventory.map(normalizeId);
      const stats = battleMember?.stats ?? member.stats;
      return {
        ...member,
        level: battleMember?.level ?? member.level,
        experience: battleMember?.experience ?? member.experience,
        maxHp: battleMember?.maxHp ?? member.maxHp,
        hp: vitals?.hp.target ?? battleMember?.hp ?? member.hp,
        maxPp: battleMember?.maxPp ?? member.maxPp,
        pp: vitals?.pp ?? battleMember?.pp ?? member.pp,
        stats: { ...stats },
        inventory: [...inventory]
      };
    });
  }

  counts(): PartyStateCounts {
    let inventoryItems = 0;
    for (const items of this.inventoryByChar.values()) {
      inventoryItems += items.length;
    }
    return {
      wallet: this.walletValue,
      bank: this.bankValue,
      inventoryChars: this.inventoryByChar.size,
      inventoryItems,
      partyCount: this.partyIds.size
    };
  }

  snapshot(): PartyStateSnapshot {
    return {
      wallet: this.walletValue,
      bank: this.bankValue,
      partyIds: this.party(),
      inventory: [...this.inventoryByChar.entries()]
        .sort(([a], [b]) => a - b)
        .map(([charId, itemIds]) => ({ charId, itemIds: [...itemIds] })),
      equipped: [...this.equippedByChar.entries()]
        .sort(([a], [b]) => a - b)
        .map(([charId, slots]) => ({ charId, slots: cloneEquippedSlots(slots) })),
      battleMembers: [...this.battleMembersByChar.values()]
        .sort((a, b) => a.charId - b.charId)
        .map((member) => ({
          ...cloneBattleMember(member),
          inventory: this.inventory(member.charId)
        }))
    };
  }

  restore(): void;
  restore(snapshot: PartyStateSnapshot): void;
  restore(snapshot?: PartyStateSnapshot): void {
    if (!snapshot) {
      this.restorePartyVitals();
      return;
    }

    this.walletValue = stat(snapshot.wallet);
    this.bankValue = stat(snapshot.bank ?? 0);
    this.inventoryByChar.clear();
    this.partyIds.clear();
    this.equippedByChar.clear();
    this.vitalsByChar.clear();
    this.battleMembersByChar.clear();

    for (const charId of snapshot.partyIds) {
      this.partyIds.add(normalizeId(charId));
    }
    for (const entry of snapshot.inventory) {
      const charId = normalizeId(entry.charId);
      const itemIds = entry.itemIds.map(normalizeId);
      if (itemIds.length > 0) {
        this.inventoryByChar.set(charId, itemIds);
      }
    }
    for (const entry of snapshot.equipped) {
      this.setEquippedSlots(normalizeId(entry.charId), cloneEquippedSlots(entry.slots));
    }
    for (const entry of snapshot.battleMembers ?? []) {
      const member = normalizeBattleMember(entry);
      this.battleMembersByChar.set(member.charId, member);
      this.vitalsByChar.set(member.charId, {
        hp: createRollingMeter(member.hp, HP_RATE_PER_SEC),
        maxHp: member.maxHp,
        pp: member.pp,
        maxPp: member.maxPp
      });
    }
  }

  private restorePartyVitals(): void {
    for (const charId of this.partyVitalTargetIds()) {
      const vitals = this.vitalsForKnownChar(charId);
      const member = this.battleMembersByChar.get(charId);
      if (!vitals && !member) {
        continue;
      }
      const maxHp = positiveStat(vitals?.maxHp ?? member?.maxHp ?? 1);
      const maxPp = stat(vitals?.maxPp ?? member?.maxPp ?? 0);
      const ratePerSec = positiveStat(vitals?.hp.ratePerSec ?? HP_RATE_PER_SEC);
      this.commitVitals(charId, {
        hp: createRollingMeter(maxHp, ratePerSec),
        maxHp,
        pp: maxPp,
        maxPp
      });
    }
  }

  private applyEffectToChar(
    char: number,
    effect: ItemUseEffect,
    base?: PartyVitalsInput
  ): PartyVitalsApplyResult | undefined {
    const charId = normalizeId(char);
    const vitals = base ? this.ensureVitals(charId, base) : this.vitalsForKnownChar(charId);
    if (!vitals) {
      return undefined;
    }
    const applied = applyUseEffectToVitals(vitals, effect);
    this.commitVitals(charId, applied.vitals);
    return {
      charId,
      effect,
      previousValue: applied.previousValue,
      nextValue: applied.nextValue
    };
  }

  private vitalsForKnownChar(charId: number): PartyVitals | undefined {
    const existing = this.vitalsByChar.get(charId);
    if (existing) {
      return existing;
    }
    const member = this.battleMembersByChar.get(charId);
    return member ? {
      hp: createRollingMeter(member.hp, HP_RATE_PER_SEC),
      maxHp: member.maxHp,
      pp: member.pp,
      maxPp: member.maxPp
    } : undefined;
  }

  private commitVitals(charId: number, vitals: PartyVitals): void {
    this.vitalsByChar.set(charId, cloneVitals(vitals));
    const member = this.battleMembersByChar.get(charId);
    if (!member) {
      return;
    }
    this.battleMembersByChar.set(charId, {
      ...member,
      hp: Math.min(positiveStat(vitals.maxHp), stat(vitals.hp.target)),
      maxHp: positiveStat(vitals.maxHp),
      pp: Math.min(stat(vitals.maxPp), stat(vitals.pp)),
      maxPp: stat(vitals.maxPp)
    });
  }

  private partyVitalTargetIds(): number[] {
    if (this.partyIds.size > 0) {
      return [...this.partyIds].sort((a, b) => a - b);
    }
    return [...new Set([
      ...this.battleMembersByChar.keys(),
      ...this.vitalsByChar.keys()
    ])].sort((a, b) => a - b);
  }

  private ensureVitals(char: number, base: PartyVitalsInput): PartyVitals {
    const existing = this.vitalsByChar.get(char);
    if (existing) {
      return existing;
    }
    const maxHp = positiveStat(base.maxHp);
    const maxPp = stat(base.maxPp);
    return {
      hp: createRollingMeter(Math.min(maxHp, stat(base.hp)), base.hpRatePerSec ?? HP_RATE_PER_SEC),
      maxHp,
      pp: Math.min(maxPp, stat(base.pp)),
      maxPp
    };
  }

  private clearEquippedItem(char: number, itemId: number): void {
    const equipped = this.equippedByChar.get(char);
    if (!equipped) {
      return;
    }
    const next = { ...equipped };
    for (const slot of Object.keys(next) as EquipmentSlot[]) {
      if (next[slot] === itemId) {
        delete next[slot];
      }
    }
    this.setEquippedSlots(char, next);
  }

  private setEquippedSlots(char: number, equipped: EquippedSlots): void {
    if (Object.keys(equipped).length === 0) {
      this.equippedByChar.delete(char);
      return;
    }
    this.equippedByChar.set(char, equipped);
  }
}

export function decodeItemUseEffect(
  item: Pick<ItemData, "action" | "argument" | "miscFlags" | "effect">
): ItemUseEffect | undefined {
  if (!isConsumableItem(item)) {
    return undefined;
  }
  const generatedEffect = normalizeGeneratedItemEffect(item.effect);
  if (generatedEffect) {
    return generatedEffect;
  }
  const action = stat(item.action);
  const argument = stat(item.argument);
  if (argument <= 0) {
    return undefined;
  }
  if (FIELD_STAT_ACTIONS.healHp.has(action)) {
    return { kind: "healHp", amount: argument };
  }
  if (FIELD_STAT_ACTIONS.healHpPercent.has(action)) {
    return { kind: "healHpPercent", percent: argument };
  }
  if (FIELD_STAT_ACTIONS.recoverPp.has(action)) {
    return { kind: "recoverPp", amount: argument };
  }
  if (FIELD_STAT_ACTIONS.recoverPpPercent.has(action)) {
    return { kind: "recoverPpPercent", percent: argument };
  }
  return undefined;
}

function normalizeGeneratedItemEffect(effect: ItemData["effect"]): ItemUseEffect | undefined {
  if (!effect) {
    return undefined;
  }
  switch (effect.kind) {
    case "healHp":
      return effect.amount > 0 ? { kind: "healHp", amount: stat(effect.amount) } : undefined;
    case "healHpPercent":
      return effect.percent > 0 ? { kind: "healHpPercent", percent: stat(effect.percent) } : undefined;
    case "recoverPp":
      return effect.amount > 0 ? { kind: "recoverPp", amount: stat(effect.amount) } : undefined;
    case "recoverPpPercent":
      return effect.percent > 0 ? { kind: "recoverPpPercent", percent: stat(effect.percent) } : undefined;
  }
}

export function isConsumableItem(item: Pick<ItemData, "miscFlags">): boolean {
  return item.miscFlags.some((flag) => flag.trim().toLowerCase() === ITEM_DISAPPEARS_FLAG);
}

export function equipmentSlotForItemType(type: number): EquipmentSlot | undefined {
  const normalizedType = stat(type);
  if (normalizedType >= 0x10 && normalizedType <= 0x13) {
    return "weapon";
  }
  if (normalizedType >= 0x14 && normalizedType <= 0x17) {
    return "body";
  }
  if (normalizedType >= 0x18 && normalizedType <= 0x1b) {
    return "arms";
  }
  if (normalizedType >= 0x1c && normalizedType <= 0x1f) {
    return "other";
  }
  return undefined;
}

export function sellPriceForItem(item: Pick<ItemData, "cost">): number {
  // Phase 5 shop rule: selling returns half of item cost, rounded down.
  return Math.floor(stat(item.cost) / 2);
}

export function applyUseEffectToVitals(vitals: PartyVitals, effect: ItemUseEffect): {
  vitals: PartyVitals;
  previousValue: number;
  nextValue: number;
} {
  switch (effect.kind) {
    case "healHp": {
      const previousValue = vitals.hp.target;
      const nextValue = Math.min(vitals.maxHp, previousValue + effect.amount);
      return {
        vitals: { ...vitals, hp: setTarget(vitals.hp, nextValue) },
        previousValue,
        nextValue
      };
    }
    case "healHpPercent": {
      const previousValue = vitals.hp.target;
      const amount = Math.floor((vitals.maxHp * Math.min(100, effect.percent)) / 100);
      const nextValue = Math.min(vitals.maxHp, previousValue + amount);
      return {
        vitals: { ...vitals, hp: setTarget(vitals.hp, nextValue) },
        previousValue,
        nextValue
      };
    }
    case "recoverPp": {
      const previousValue = vitals.pp;
      const nextValue = Math.min(vitals.maxPp, previousValue + effect.amount);
      return {
        vitals: { ...vitals, pp: nextValue },
        previousValue,
        nextValue
      };
    }
    case "recoverPpPercent": {
      const previousValue = vitals.pp;
      const amount = Math.floor((vitals.maxPp * Math.min(100, effect.percent)) / 100);
      const nextValue = Math.min(vitals.maxPp, previousValue + amount);
      return {
        vitals: { ...vitals, pp: nextValue },
        previousValue,
        nextValue
      };
    }
  }
}

function cloneVitals(vitals: PartyVitals): PartyVitals {
  return {
    ...vitals,
    hp: { ...vitals.hp }
  };
}

function battleMemberFromCombatant(combatant: Combatant): PartyBattleMemberSnapshot {
  return normalizeBattleMember({
    charId: combatant.charId,
    level: combatant.level,
    experience: combatant.experience,
    hp: combatant.hp.target,
    maxHp: combatant.maxHp,
    pp: combatant.pp,
    maxPp: combatant.maxPp,
    inventory: combatant.inventory,
    stats: combatant.stats
  });
}

function cloneBattleMember(member: PartyBattleMemberSnapshot): PartyBattleMemberSnapshot {
  return {
    charId: member.charId,
    level: member.level,
    experience: member.experience,
    hp: member.hp,
    maxHp: member.maxHp,
    pp: member.pp,
    maxPp: member.maxPp,
    inventory: [...member.inventory],
    stats: { ...member.stats }
  };
}

function normalizeBattleMember(member: PartyBattleMemberSnapshot): PartyBattleMemberSnapshot {
  const maxHp = positiveStat(member.maxHp);
  const maxPp = stat(member.maxPp);
  return {
    charId: normalizeId(member.charId),
    level: positiveStat(member.level),
    experience: stat(member.experience),
    hp: Math.min(maxHp, stat(member.hp)),
    maxHp,
    pp: Math.min(maxPp, stat(member.pp)),
    maxPp,
    inventory: member.inventory.map(normalizeId),
    stats: {
      offense: stat(member.stats.offense),
      defense: stat(member.stats.defense),
      speed: stat(member.stats.speed),
      guts: stat(member.stats.guts),
      vitality: stat(member.stats.vitality),
      iq: stat(member.stats.iq),
      luck: stat(member.stats.luck)
    }
  };
}

function cloneEquippedSlots(slots: EquippedSlots): EquippedSlots {
  const next: EquippedSlots = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = slots[slot];
    if (itemId !== undefined) {
      next[slot] = normalizeId(itemId);
    }
  }
  return next;
}

function normalizeId(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid session state id: ${value}`);
  }
  return value;
}

function positiveStat(value: number): number {
  return Math.max(1, stat(value));
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
