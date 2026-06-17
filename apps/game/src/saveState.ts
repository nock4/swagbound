import type {
  EquipmentSlot,
  EquippedSlots,
  PartyBattleMemberSnapshot,
  PartyStateSnapshot,
  PartyVitalsSnapshot
} from "./partyState";
import type { Facing } from "./playerController";

export const SAVE_STATE_SCHEMA_VERSION = 1;

export type SaveMode = "region" | "chunked";

export type SavePoint = {
  x: number;
  y: number;
};

export type SaveRegionSnapshot = {
  originTile?: SavePoint;
  widthPixels?: number;
  heightPixels?: number;
};

export type SavePlayerSnapshot = SavePoint & {
  mode: SaveMode;
  mapId?: string;
  region?: SaveRegionSnapshot;
  facing: Facing;
};

export type SaveFlagsSnapshot = {
  strings: string[];
  numeric: number[];
};

export type SaveState = {
  schemaVersion: typeof SAVE_STATE_SCHEMA_VERSION;
  savedAt?: string;
  flags: SaveFlagsSnapshot;
  party: PartyStateSnapshot;
  player: SavePlayerSnapshot;
};

export type SaveStateSources = {
  flags: {
    list(): string[];
    listNums(): number[];
  };
  partyState: {
    snapshot(): PartyStateSnapshot;
  };
  player: SavePlayerSnapshot;
  savedAt?: string;
};

export type SaveStateSinks = {
  flags: {
    clear(): void;
    set(flag: string): void;
    setNum(flag: number): void;
  };
  partyState: {
    restore(snapshot: PartyStateSnapshot): void;
  };
};

export type SaveSlotPersistence = {
  saveToSlot(slot: number, blob: string): boolean;
  loadFromSlot(slot: number): string | null;
  hasSave(slot: number): boolean;
  clearSlot(slot: number): boolean;
};

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "body", "arms", "other"];
const FACING_VALUES: Facing[] = ["up", "down", "left", "right"];

export function captureSaveState(sources: SaveStateSources): SaveState {
  const save: SaveState = {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    ...(typeof sources.savedAt === "string" ? { savedAt: sources.savedAt } : {}),
    flags: {
      strings: uniqueStrings(sources.flags.list()),
      numeric: uniqueIds(sources.flags.listNums()) ?? []
    },
    party: clonePartyStateSnapshot(sources.partyState.snapshot()),
    player: clonePlayerSnapshot(sources.player)
  };
  const validated = validateSaveState(save);
  if (!validated) {
    throw new Error("Invalid save state source");
  }
  return validated;
}

export function applySaveState(save: unknown, sinks: SaveStateSinks): SavePlayerSnapshot | null {
  const validated = validateSaveState(save);
  if (!validated) {
    return null;
  }
  sinks.flags.clear();
  for (const flag of validated.flags.strings) {
    sinks.flags.set(flag);
  }
  for (const flag of validated.flags.numeric) {
    sinks.flags.setNum(flag);
  }
  sinks.partyState.restore(validated.party);
  return clonePlayerSnapshot(validated.player);
}

export function serializeSaveState(save: unknown): string | null {
  const validated = validateSaveState(save);
  if (!validated) {
    return null;
  }
  try {
    return JSON.stringify(validated);
  } catch {
    return null;
  }
}

export function deserializeSaveState(blob: string | null | undefined): SaveState | null {
  if (typeof blob !== "string" || blob.trim() === "") {
    return null;
  }
  try {
    return validateSaveState(JSON.parse(blob));
  } catch {
    return null;
  }
}

export function validateSaveState(value: unknown): SaveState | null {
  if (!isRecord(value) || value.schemaVersion !== SAVE_STATE_SCHEMA_VERSION) {
    return null;
  }
  const flags = validateFlagsSnapshot(value.flags);
  const party = validatePartyStateSnapshot(value.party);
  const player = validatePlayerSnapshot(value.player);
  if (!flags || !party || !player) {
    return null;
  }
  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    ...(typeof value.savedAt === "string" ? { savedAt: value.savedAt } : {}),
    flags,
    party,
    player
  };
}

function clonePlayerSnapshot(player: SavePlayerSnapshot): SavePlayerSnapshot {
  return {
    mode: player.mode,
    ...(typeof player.mapId === "string" ? { mapId: player.mapId } : {}),
    ...(player.region ? { region: cloneRegionSnapshot(player.region) } : {}),
    x: player.x,
    y: player.y,
    facing: player.facing
  };
}

function cloneRegionSnapshot(region: SaveRegionSnapshot): SaveRegionSnapshot {
  return {
    ...(region.originTile ? { originTile: { ...region.originTile } } : {}),
    ...(region.widthPixels !== undefined ? { widthPixels: region.widthPixels } : {}),
    ...(region.heightPixels !== undefined ? { heightPixels: region.heightPixels } : {})
  };
}

function clonePartyStateSnapshot(snapshot: PartyStateSnapshot): PartyStateSnapshot {
  return {
    wallet: snapshot.wallet,
    ...(snapshot.bank !== undefined ? { bank: snapshot.bank } : {}),
    partyIds: [...snapshot.partyIds],
    inventory: snapshot.inventory.map((entry) => ({
      charId: entry.charId,
      itemIds: [...entry.itemIds]
    })),
    equipped: snapshot.equipped.map((entry) => ({
      charId: entry.charId,
      slots: { ...entry.slots }
    })),
    ...(snapshot.vitals ? {
      vitals: snapshot.vitals.map(clonePartyVitalsSnapshot)
    } : {}),
    ...(snapshot.battleMembers ? {
      battleMembers: snapshot.battleMembers.map(cloneBattleMemberSnapshot)
    } : {})
  };
}

function validateFlagsSnapshot(value: unknown): SaveFlagsSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const strings = validateStringArray(value.strings);
  const numeric = validateIdArray(value.numeric, { unique: true });
  return strings && numeric ? { strings, numeric } : null;
}

function validatePartyStateSnapshot(value: unknown): PartyStateSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const wallet = validateId(value.wallet);
  const bank = value.bank === undefined ? undefined : validateId(value.bank);
  const partyIds = validateIdArray(value.partyIds, { unique: true });
  const inventory = validateInventory(value.inventory);
  const equipped = validateEquipment(value.equipped);
  const vitals = value.vitals === undefined ? undefined : validateVitals(value.vitals);
  const battleMembers = value.battleMembers === undefined ? undefined : validateBattleMembers(value.battleMembers);
  if (
    wallet === undefined ||
    (value.bank !== undefined && bank === undefined) ||
    !partyIds ||
    !inventory ||
    !equipped ||
    (value.vitals !== undefined && !vitals) ||
    (value.battleMembers !== undefined && !battleMembers)
  ) {
    return null;
  }
  return {
    wallet,
    ...(bank !== undefined ? { bank } : {}),
    partyIds,
    inventory,
    equipped,
    ...(vitals ? { vitals } : {}),
    ...(battleMembers ? { battleMembers } : {})
  };
}

function validatePlayerSnapshot(value: unknown): SavePlayerSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.mode !== "region" && value.mode !== "chunked") {
    return null;
  }
  if (typeof value.facing !== "string" || !FACING_VALUES.includes(value.facing as Facing)) {
    return null;
  }
  const x = validateFiniteNumber(value.x);
  const y = validateFiniteNumber(value.y);
  if (x === undefined || y === undefined) {
    return null;
  }
  const region = value.region === undefined ? undefined : validateRegionSnapshot(value.region);
  if (value.region !== undefined && !region) {
    return null;
  }
  return {
    mode: value.mode,
    ...(typeof value.mapId === "string" ? { mapId: value.mapId } : {}),
    ...(region ? { region } : {}),
    x,
    y,
    facing: value.facing as Facing
  };
}

function validateRegionSnapshot(value: unknown): SaveRegionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const originTile = value.originTile === undefined ? undefined : validatePoint(value.originTile);
  if (value.originTile !== undefined && !originTile) {
    return null;
  }
  const widthPixels = value.widthPixels === undefined ? undefined : validateId(value.widthPixels);
  const heightPixels = value.heightPixels === undefined ? undefined : validateId(value.heightPixels);
  if (
    (value.widthPixels !== undefined && widthPixels === undefined) ||
    (value.heightPixels !== undefined && heightPixels === undefined)
  ) {
    return null;
  }
  return {
    ...(originTile ? { originTile } : {}),
    ...(widthPixels !== undefined ? { widthPixels } : {}),
    ...(heightPixels !== undefined ? { heightPixels } : {})
  };
}

function validatePoint(value: unknown): SavePoint | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = validateFiniteNumber(value.x);
  const y = validateFiniteNumber(value.y);
  return x === undefined || y === undefined ? null : { x, y };
}

function validateInventory(value: unknown): PartyStateSnapshot["inventory"] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const inventory: PartyStateSnapshot["inventory"] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const charId = validateId(entry.charId);
    const itemIds = validateIdArray(entry.itemIds);
    if (charId === undefined || !itemIds) {
      return null;
    }
    inventory.push({ charId, itemIds });
  }
  return inventory;
}

function validateEquipment(value: unknown): PartyStateSnapshot["equipped"] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const equipped: PartyStateSnapshot["equipped"] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const charId = validateId(entry.charId);
    const slots = validateEquippedSlots(entry.slots);
    if (charId === undefined || !slots) {
      return null;
    }
    equipped.push({ charId, slots });
  }
  return equipped;
}

function validateBattleMembers(value: unknown): PartyBattleMemberSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const members: PartyBattleMemberSnapshot[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const charId = validateId(entry.charId);
    const level = validateId(entry.level);
    const experience = validateId(entry.experience);
    const hp = validateId(entry.hp);
    const maxHp = validateId(entry.maxHp);
    const pp = validateId(entry.pp);
    const maxPp = validateId(entry.maxPp);
    const inventory = validateIdArray(entry.inventory);
    const stats = validatePartyMemberStats(entry.stats);
    if (
      charId === undefined ||
      level === undefined ||
      experience === undefined ||
      hp === undefined ||
      maxHp === undefined ||
      pp === undefined ||
      maxPp === undefined ||
      !inventory ||
      !stats
    ) {
      return null;
    }
    members.push({ charId, level, experience, hp, maxHp, pp, maxPp, inventory, stats });
  }
  return members;
}

function validateVitals(value: unknown): PartyVitalsSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const vitals: PartyVitalsSnapshot[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const charId = validateId(entry.charId);
    const hp = validateHpSnapshot(entry.hp);
    const maxHp = validateId(entry.maxHp);
    const pp = validateId(entry.pp);
    const maxPp = validateId(entry.maxPp);
    if (
      charId === undefined ||
      !hp ||
      maxHp === undefined ||
      pp === undefined ||
      maxPp === undefined
    ) {
      return null;
    }
    vitals.push({ charId, hp, maxHp, pp, maxPp });
  }
  return vitals;
}

function validateHpSnapshot(value: unknown): PartyVitalsSnapshot["hp"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const current = validateId(value.current);
  const target = validateId(value.target);
  return current === undefined || target === undefined ? null : { current, target };
}

function validatePartyMemberStats(value: unknown): PartyBattleMemberSnapshot["stats"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const offense = validateId(value.offense);
  const defense = validateId(value.defense);
  const speed = validateId(value.speed);
  const guts = validateId(value.guts);
  const vitality = validateId(value.vitality);
  const iq = validateId(value.iq);
  const luck = validateId(value.luck);
  if (
    offense === undefined ||
    defense === undefined ||
    speed === undefined ||
    guts === undefined ||
    vitality === undefined ||
    iq === undefined ||
    luck === undefined
  ) {
    return null;
  }
  return { offense, defense, speed, guts, vitality, iq, luck };
}

function validateEquippedSlots(value: unknown): EquippedSlots | null {
  if (!isRecord(value)) {
    return null;
  }
  const slots: EquippedSlots = {};
  for (const slot of EQUIPMENT_SLOTS) {
    if (value[slot] === undefined) {
      continue;
    }
    const itemId = validateId(value[slot]);
    if (itemId === undefined) {
      return null;
    }
    slots[slot] = itemId;
  }
  return slots;
}

function cloneBattleMemberSnapshot(member: PartyBattleMemberSnapshot): PartyBattleMemberSnapshot {
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

function clonePartyVitalsSnapshot(vitals: PartyVitalsSnapshot): PartyVitalsSnapshot {
  return {
    charId: vitals.charId,
    hp: { ...vitals.hp },
    maxHp: vitals.maxHp,
    pp: vitals.pp,
    maxPp: vitals.maxPp
  };
}

function validateStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    if (!seen.has(item)) {
      seen.add(item);
      strings.push(item);
    }
  }
  return strings;
}

function validateIdArray(value: unknown, options: { unique?: boolean } = {}): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (options.unique) {
    return uniqueIds(value);
  }
  const result: number[] = [];
  for (const item of value) {
    const id = validateId(item);
    if (id === undefined) {
      return null;
    }
    result.push(id);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function uniqueIds(values: readonly unknown[]): number[] | null {
  const result: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    const id = validateId(value);
    if (id === undefined) {
      return null;
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function validateId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function validateFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
