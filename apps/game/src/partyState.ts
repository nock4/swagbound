import type { ItemData } from "@eb/schemas";
import type { Combatant } from "./battleLogic";
import {
  cureStatus as cureStatusEffect,
  fieldPoisonTick,
  inflictStatus as inflictStatusEffect,
  stripBattleScopedStatuses,
  type StatusAilment,
  type StatusState
} from "./statusEffects";
import { combatantBaseStats, type PartyMember, type PartyMemberStats } from "./characterModel";
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
  storageItems: number;
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

export type PartyVitalsSnapshot = {
  charId: number;
  hp: {
    current: number;
    target: number;
  };
  maxHp: number;
  pp: number;
  maxPp: number;
};

export type PartyStatusSnapshot = {
  charId: number;
  statuses: StatusState;
};

export type PartyStateSnapshot = {
  wallet: number;
  bank?: number;
  partyIds: number[];
  inventory: PartyInventorySnapshot[];
  equipped: PartyEquipmentSnapshot[];
  storage?: number[];
  statuses?: PartyStatusSnapshot[];
  vitals?: PartyVitalsSnapshot[];
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
  | { kind: "recoverPpPercent"; percent: number }
  | { kind: "damage"; amount: number }
  | { kind: "drainPp"; amount: number }
  | { kind: "buffStat"; stat: "offense" | "defense" | "speed" | "guts"; amount?: number; multiplier?: number }
  | { kind: "permStat"; stat: "offense" | "defense" | "speed" | "guts" | "vitality" | "iq" | "luck"; amount: number }
  | { kind: "revive"; amount: number }
  | { kind: "cureStatus"; ailment: StatusAilment | "all" }
  | { kind: "inflictStatus"; ailment: StatusAilment; remaining?: number; magnitude?: number };

/**
 * Which side of the battlefield an item's effect acts on. Offensive effects (damage, and
 * inflicting an ailment other than the defensive "shielded" buff) target the enemy; heals,
 * cures, restores, and self-buffs target the party. Shared by the round resolver, the
 * command menu, and resolveItemTurn so all three agree on the side.
 */
export function itemEffectTargetSide(effect: ItemUseEffect | undefined): "party" | "enemy" {
  if (effect?.kind === "damage" || effect?.kind === "drainPp") {
    return "enemy";
  }
  if (effect?.kind === "inflictStatus") {
    return effect.ailment === "shielded" ? "party" : "enemy";
  }
  if (effect?.kind === "buffStat") {
    // A negative buff is a debuff aimed at the enemy (e.g. Defense down).
    return (effect.amount ?? 0) < 0 ? "enemy" : "party";
  }
  return "party";
}

export function isFieldUsableItemEffect(effect: ItemUseEffect | undefined): effect is ItemUseEffect {
  if (!effect || itemEffectTargetSide(effect) !== "party") {
    return false;
  }
  switch (effect.kind) {
    case "healHp":
    case "healHpPercent":
    case "recoverPp":
    case "recoverPpPercent":
    case "cureStatus":
    case "revive":
      return true;
    case "damage":
    case "drainPp":
    case "buffStat":
    case "permStat":
    case "inflictStatus":
      return false;
  }
}

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
      reason: "missingItem" | "notConsumable" | "unknownEffect" | "notFieldUsable";
    };

export type PartyVitalsApplyResult = {
  charId: number;
  effect: ItemUseEffect;
  previousValue: number;
  nextValue: number;
};

export type PartyFieldPoisonTickResult = {
  charId: number;
  previousHp: number;
  nextHp: number;
  hpLoss: number;
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

export type EquipStatSummary = {
  offense: number;
  defense: number;
};

export type EquipStatPreview = EquipStatSummary & {
  deltaOffense: number;
  deltaDefense: number;
};

export type ItemMoveResult =
  | {
      ok: true;
      itemId: number;
      fromChar?: number;
      toChar?: number;
      fromSlot: number;
      toSlot?: number;
    }
  | {
      ok: false;
      itemId: number;
      fromChar?: number;
      toChar?: number;
      fromSlot: number;
      reason: "missingItem" | "sameTarget" | "targetFull";
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
      reason: "insufficientFunds" | "inventoryFull";
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
/** EB caps each character at 14 carried items; equipped gear stays in the list, so a length cap matches. */
export const INVENTORY_CAPACITY = 14;

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
  private storageItems: number[] = [];
  private readonly partyIds = new Set<number>();
  private readonly equippedByChar = new Map<number, EquippedSlots>();
  private readonly vitalsByChar = new Map<number, PartyVitals>();
  private readonly battleMembersByChar = new Map<number, PartyBattleMemberSnapshot>();
  private readonly statusesByChar = new Map<number, StatusState>();

  get wallet(): number {
    return this.walletValue;
  }

  get bank(): number {
    return this.bankValue;
  }

  inventory(char: number): number[] {
    return [...(this.inventoryByChar.get(normalizeId(char)) ?? [])];
  }

  storage(): number[] {
    return [...this.storageItems];
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

  statuses(char: number): StatusState {
    return cloneStatusState(this.statusesByChar.get(normalizeId(char)));
  }

  party(): number[] {
    return [...this.partyIds].sort((a, b) => a - b);
  }

  give(char: number, item: number): boolean {
    const normalizedChar = normalizeId(char);
    const items = this.inventoryByChar.get(normalizedChar) ?? [];
    if (items.length >= INVENTORY_CAPACITY) {
      return false;
    }
    items.push(normalizeId(item));
    this.inventoryByChar.set(normalizedChar, items);
    return true;
  }

  inventoryRoom(char: number): number {
    return Math.max(0, INVENTORY_CAPACITY - (this.inventoryByChar.get(normalizeId(char)) ?? []).length);
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

  takeFromSlot(char: number, inventorySlot: number, item: number): boolean {
    const normalizedChar = normalizeId(char);
    const itemId = normalizeId(item);
    const slot = stat(inventorySlot);
    const items = this.inventoryByChar.get(normalizedChar) ?? [];
    if (items[slot] !== itemId) {
      return false;
    }
    items.splice(slot, 1);
    if (items.length === 0) {
      this.inventoryByChar.delete(normalizedChar);
    } else {
      this.inventoryByChar.set(normalizedChar, items);
    }
    if (!items.includes(itemId)) {
      this.clearEquippedItem(normalizedChar, itemId);
    }
    return true;
  }

  transferItem(ownerChar: number, targetChar: number, inventorySlot: number, item: number): ItemMoveResult {
    const fromChar = normalizeId(ownerChar);
    const toChar = normalizeId(targetChar);
    const itemId = normalizeId(item);
    const fromSlot = stat(inventorySlot);
    if (fromChar === toChar) {
      return { ok: false, itemId, fromChar, toChar, fromSlot, reason: "sameTarget" };
    }
    if (this.inventoryRoom(toChar) <= 0) {
      return { ok: false, itemId, fromChar, toChar, fromSlot, reason: "targetFull" };
    }
    if (!this.takeFromSlot(fromChar, fromSlot, itemId)) {
      return { ok: false, itemId, fromChar, toChar, fromSlot, reason: "missingItem" };
    }
    const targetItems = this.inventoryByChar.get(toChar) ?? [];
    targetItems.push(itemId);
    this.inventoryByChar.set(toChar, targetItems);
    return { ok: true, itemId, fromChar, toChar, fromSlot, toSlot: targetItems.length - 1 };
  }

  dropItem(char: number, inventorySlot: number, item: number): ItemMoveResult {
    const fromChar = normalizeId(char);
    const itemId = normalizeId(item);
    const fromSlot = stat(inventorySlot);
    if (!this.takeFromSlot(fromChar, fromSlot, itemId)) {
      return { ok: false, itemId, fromChar, fromSlot, reason: "missingItem" };
    }
    return { ok: true, itemId, fromChar, fromSlot };
  }

  depositStoredItem(char: number, inventorySlot: number, item: number): ItemMoveResult {
    const fromChar = normalizeId(char);
    const itemId = normalizeId(item);
    const fromSlot = stat(inventorySlot);
    if (!this.takeFromSlot(fromChar, fromSlot, itemId)) {
      return { ok: false, itemId, fromChar, fromSlot, reason: "missingItem" };
    }
    this.storageItems.push(itemId);
    return { ok: true, itemId, fromChar, fromSlot, toSlot: this.storageItems.length - 1 };
  }

  withdrawStoredItem(char: number, storageSlot: number, item: number): ItemMoveResult {
    const toChar = normalizeId(char);
    const itemId = normalizeId(item);
    const fromSlot = stat(storageSlot);
    if (this.inventoryRoom(toChar) <= 0) {
      return { ok: false, itemId, toChar, fromSlot, reason: "targetFull" };
    }
    if (this.storageItems[fromSlot] !== itemId) {
      return { ok: false, itemId, toChar, fromSlot, reason: "missingItem" };
    }
    this.storageItems.splice(fromSlot, 1);
    const targetItems = this.inventoryByChar.get(toChar) ?? [];
    targetItems.push(itemId);
    this.inventoryByChar.set(toChar, targetItems);
    return { ok: true, itemId, toChar, fromSlot, toSlot: targetItems.length - 1 };
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
    if (!isFieldUsableItemEffect(effect)) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "notFieldUsable" };
    }

    const applied = this.applyEffectToChar(targetChar, effect, options.targetVitals);
    if (!applied) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "unknownEffect" };
    }
    if (effect.kind === "revive" && applied.previousValue === applied.nextValue) {
      return { ok: false, itemId, ownerChar, targetChar, reason: "notFieldUsable" };
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
    return this.applyRecovery(effect, char);
  }

  applyRecovery(effect: ItemUseEffect, char?: number): PartyVitalsApplyResult[] {
    const targetChars = char === undefined || char === 0 ? this.partyVitalTargetIds() : [normalizeId(char)];
    return targetChars
      .map((charId) => this.applyEffectToChar(charId, effect))
      .filter((result): result is PartyVitalsApplyResult => Boolean(result));
  }

  fullRecover(options: { cureStatuses?: boolean } = {}): void {
    this.restorePartyVitals();
    if (options.cureStatuses ?? true) {
      for (const charId of this.partyVitalTargetIds()) {
        this.statusesByChar.delete(charId);
      }
    }
  }

  hospitalRecoveryCost(members: readonly PartyMember[]): number {
    return hospitalRecoveryCost(this.applyToPartyMembers([...members]));
  }

  /**
   * Seed baseline vitals for active party members that have none yet. Vitals are
   * otherwise only recorded once a character takes damage or enters battle, which
   * left field poison (and the overworld HUD) with no HP/PP target to work from
   * on a fresh game. Never overwrites an existing (e.g. save-restored) entry.
   */
  ensureVitalsFor(members: readonly PartyMember[]): void {
    for (const member of members) {
      const charId = normalizeId(member.id);
      if (this.vitalsByChar.has(charId)) {
        continue;
      }
      this.vitalsByChar.set(charId, {
        hp: createRollingMeter(member.hp, HP_RATE_PER_SEC),
        maxHp: member.maxHp,
        pp: member.pp,
        maxPp: member.maxPp
      });
    }
  }

  applyFieldPoisonStep(): PartyFieldPoisonTickResult[] {
    const results: PartyFieldPoisonTickResult[] = [];
    for (const charId of this.partyVitalTargetIds()) {
      const statuses = this.statusesByChar.get(charId);
      const vitals = this.vitalsForKnownChar(charId);
      if (!vitals || !statuses?.length) {
        continue;
      }
      const previousHp = vitals.hp.target;
      const tickResult = fieldPoisonTick(statuses, previousHp, vitals.maxHp);
      if (tickResult.hpLoss <= 0) {
        continue;
      }
      this.commitVitals(charId, {
        ...vitals,
        hp: setTarget(vitals.hp, tickResult.nextHp)
      });
      results.push({
        charId,
        previousHp,
        nextHp: tickResult.nextHp,
        hpLoss: tickResult.hpLoss
      });
    }
    return results;
  }

  inflictStatus(char: number, ailment: StatusAilment, options: { remaining?: number; magnitude?: number } = {}): StatusState {
    const charId = normalizeId(char);
    const statuses = inflictStatusEffect(this.statusesByChar.get(charId), ailment, options);
    this.commitStatuses(charId, statuses);
    return cloneStatusState(statuses);
  }

  cureStatus(char: number, ailment: StatusAilment | "all"): StatusState {
    const charId = normalizeId(char);
    const statuses = cureStatusEffect(this.statusesByChar.get(charId), ailment);
    this.commitStatuses(charId, statuses);
    return cloneStatusState(statuses);
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
    if (this.inventoryRoom(normalizedChar) <= 0) {
      return { ok: false, char: normalizedChar, itemId, cost, reason: "inventoryFull" };
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

  applyBattleResult(party: Combatant[], wallet: number, bank?: number): void {
    this.walletValue = stat(wallet);
    if (bank !== undefined) {
      this.bankValue = stat(bank);
    }
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
      this.commitStatuses(charId, stripBattleScopedStatuses(combatant.statuses));
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
      const statuses = this.statusesByChar.get(charId);
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
        inventory: [...inventory],
        ...(statuses?.length ? { statuses: cloneStatusState(statuses) } : {})
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
      storageItems: this.storageItems.length,
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
      ...(this.storageItems.length > 0 ? { storage: [...this.storageItems] } : {}),
      statuses: [...this.statusesByChar.entries()]
        .sort(([a], [b]) => a - b)
        .map(([charId, statuses]) => ({ charId, statuses: cloneStatusState(statuses) })),
      vitals: [...this.vitalsByChar.entries()]
        .sort(([a], [b]) => a - b)
        .map(([charId, vitals]) => vitalsSnapshotFromVitals(charId, vitals)),
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
    this.storageItems = [];
    this.partyIds.clear();
    this.equippedByChar.clear();
    this.vitalsByChar.clear();
    this.battleMembersByChar.clear();
    this.statusesByChar.clear();

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
    this.storageItems = (snapshot.storage ?? []).map(normalizeId);
    for (const entry of snapshot.statuses ?? []) {
      this.commitStatuses(normalizeId(entry.charId), entry.statuses);
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
    for (const entry of snapshot.vitals ?? []) {
      const vitals = vitalsFromSnapshot(entry);
      this.commitVitals(normalizeId(entry.charId), vitals);
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
    const statusApplied = applyUseEffectToStatuses(this.statusesByChar.get(charId), effect);
    if (statusApplied) {
      this.commitStatuses(charId, statusApplied.statuses);
    }
    this.commitVitals(charId, applied.vitals);
    return {
      charId,
      effect,
      previousValue: statusApplied?.previousValue ?? applied.previousValue,
      nextValue: statusApplied?.nextValue ?? applied.nextValue
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

  private commitStatuses(charId: number, statuses: StatusState): void {
    const next = cloneStatusState(statuses);
    if (next.length === 0) {
      this.statusesByChar.delete(charId);
      return;
    }
    this.statusesByChar.set(charId, next);
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
    case "damage":
      return effect.amount > 0 ? { kind: "damage", amount: stat(effect.amount) } : undefined;
    case "drainPp":
      return effect.amount > 0 ? { kind: "drainPp", amount: stat(effect.amount) } : undefined;
    case "buffStat":
      {
        const amount = Math.trunc(effect.amount ?? 0);
        const multiplier = effect.multiplier;
        const hasMultiplier = multiplier !== undefined && Number.isFinite(multiplier) && multiplier > 0 && multiplier !== 1;
        if (amount === 0 && !hasMultiplier) {
          return undefined;
        }
        return {
          kind: "buffStat",
          stat: effect.stat,
          ...(amount !== 0 ? { amount } : {}),
          ...(hasMultiplier ? { multiplier } : {})
        };
      }
    case "permStat":
      return effect.amount !== 0 ? { kind: "permStat", stat: effect.stat, amount: Math.trunc(effect.amount) } : undefined;
    case "revive":
      return effect.amount > 0 ? { kind: "revive", amount: stat(effect.amount) } : undefined;
    case "cureStatus":
      return { kind: "cureStatus", ailment: effect.ailment };
    case "inflictStatus":
      return {
        kind: "inflictStatus",
        ailment: effect.ailment,
        ...(effect.remaining !== undefined ? { remaining: stat(effect.remaining) } : {}),
        ...(effect.magnitude !== undefined ? { magnitude: stat(effect.magnitude) } : {})
      };
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

export function equipmentStatBonuses(
  equipped: EquippedSlots,
  itemById: (itemId: number) => Pick<ItemData, "equipBonuses"> | undefined
): EquipStatSummary {
  let offense = 0;
  let defense = 0;
  for (const itemId of Object.values(equipped)) {
    const bonuses = itemById(itemId)?.equipBonuses;
    offense += intStat(bonuses?.offense ?? 0);
    defense += intStat(bonuses?.defense ?? 0);
  }
  return { offense, defense };
}

export function previewEquipStats(options: {
  baseStats: Pick<PartyMemberStats, "offense" | "defense">;
  equipped: EquippedSlots;
  item: Pick<ItemData, "id" | "type" | "equipBonuses">;
  itemById: (itemId: number) => Pick<ItemData, "equipBonuses"> | undefined;
}): EquipStatPreview | undefined {
  const slot = equipmentSlotForItemType(options.item.type);
  if (!slot) {
    return undefined;
  }
  const equipped = cloneEquippedSlots(options.equipped);
  const itemId = normalizeId(options.item.id);
  const currentBonuses = equipmentStatBonuses(equipped, options.itemById);
  if (equipped[slot] === itemId) {
    delete equipped[slot];
  } else {
    equipped[slot] = itemId;
  }
  const nextBonuses = equipmentStatBonuses(equipped, (id) => id === itemId ? options.item : options.itemById(id));
  const current = {
    offense: stat(options.baseStats.offense) + currentBonuses.offense,
    defense: stat(options.baseStats.defense) + currentBonuses.defense
  };
  const next = {
    offense: stat(options.baseStats.offense) + nextBonuses.offense,
    defense: stat(options.baseStats.defense) + nextBonuses.defense
  };
  return {
    offense: next.offense,
    defense: next.defense,
    deltaOffense: next.offense - current.offense,
    deltaDefense: next.defense - current.defense
  };
}

export function sellPriceForItem(item: Pick<ItemData, "cost">): number {
  // Phase 5 shop rule: selling returns half of item cost, rounded down.
  return Math.floor(stat(item.cost) / 2);
}

export function hospitalRecoveryCost(members: readonly Pick<PartyMember, "level" | "hp" | "maxHp" | "pp" | "maxPp">[]): number {
  return members.reduce((sum, member) => {
    const level = positiveStat(member.level);
    const maxHp = positiveStat(member.maxHp);
    const maxPp = stat(member.maxPp);
    const hp = Math.min(maxHp, stat(member.hp));
    const pp = Math.min(maxPp, stat(member.pp));
    const missingHp = Math.max(0, maxHp - hp);
    const missingPp = Math.max(0, maxPp - pp);
    if (missingHp === 0 && missingPp === 0) {
      return sum;
    }
    const damageCost = Math.ceil(missingHp / 5);
    const ppCost = Math.ceil(missingPp / 3);
    const levelCost = Math.max(2, Math.ceil(level * 1.5));
    const reviveCost = hp <= 0 ? Math.max(20, level * 12) : 0;
    return sum + damageCost + ppCost + levelCost + reviveCost;
  }, 0);
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
    case "damage":
    case "drainPp":
    case "buffStat":
    case "permStat":
    case "cureStatus":
    case "inflictStatus":
      // Battle-only effects; no overworld vitals change.
      return { vitals, previousValue: 0, nextValue: 0 };
    case "revive": {
      const previousValue = vitals.hp.target;
      if (previousValue > 0) {
        return { vitals, previousValue, nextValue: previousValue };
      }
      const nextValue = Math.min(vitals.maxHp, Math.max(1, effect.amount));
      return {
        vitals: { ...vitals, hp: setTarget(vitals.hp, nextValue) },
        previousValue,
        nextValue
      };
    }
  }
}

export function applyUseEffectToStatuses(
  statuses: StatusState | undefined,
  effect: ItemUseEffect
): { statuses: StatusState; previousValue: number; nextValue: number } | undefined {
  switch (effect.kind) {
    case "cureStatus": {
      const previousValue = statuses?.length ?? 0;
      const nextStatuses = cureStatusEffect(statuses, effect.ailment);
      return {
        statuses: nextStatuses,
        previousValue,
        nextValue: nextStatuses.length
      };
    }
    case "inflictStatus": {
      const previousValue = statuses?.length ?? 0;
      const nextStatuses = inflictStatusEffect(statuses, effect.ailment, {
        remaining: effect.remaining,
        magnitude: effect.magnitude
      });
      return {
        statuses: nextStatuses,
        previousValue,
        nextValue: nextStatuses.length
      };
    }
    case "healHp":
    case "healHpPercent":
    case "recoverPp":
    case "recoverPpPercent":
    case "damage":
    case "drainPp":
    case "buffStat":
    case "permStat":
    case "revive":
      return undefined;
  }
}

function cloneVitals(vitals: PartyVitals): PartyVitals {
  return {
    ...vitals,
    hp: { ...vitals.hp }
  };
}

function cloneStatusState(statuses: StatusState | undefined): StatusState {
  return (statuses ?? []).map((entry) => ({ ...entry }));
}

function vitalsSnapshotFromVitals(charId: number, vitals: PartyVitals): PartyVitalsSnapshot {
  const maxHp = positiveStat(vitals.maxHp);
  const maxPp = stat(vitals.maxPp);
  return {
    charId: normalizeId(charId),
    hp: {
      current: Math.min(maxHp, stat(vitals.hp.displayed)),
      target: Math.min(maxHp, stat(vitals.hp.target))
    },
    maxHp,
    pp: Math.min(maxPp, stat(vitals.pp)),
    maxPp
  };
}

function vitalsFromSnapshot(snapshot: PartyVitalsSnapshot): PartyVitals {
  const maxHp = positiveStat(snapshot.maxHp);
  const maxPp = stat(snapshot.maxPp);
  const current = Math.min(maxHp, stat(snapshot.hp.current));
  const target = Math.min(maxHp, stat(snapshot.hp.target));
  return {
    hp: setTarget(createRollingMeter(current, HP_RATE_PER_SEC), target),
    maxHp,
    pp: Math.min(maxPp, stat(snapshot.pp)),
    maxPp
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
    // BASE stats only — persisting effective stats re-adds equip bonuses next battle.
    stats: combatantBaseStats(combatant)
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

function intStat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
