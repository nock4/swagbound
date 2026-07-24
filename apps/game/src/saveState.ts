import type {
  EquipmentSlot,
  EquippedSlots,
  PartyBattleMemberSnapshot,
  PartyStateSnapshot,
  PartyStatusSnapshot,
  PartyVitalsSnapshot
} from "./partyState";
import type { Facing } from "./playerController";
import { STATUS_AILMENTS, type StatusAilment, type StatusState } from "./statusEffects";
import { validateFilingIntake, type FilingIntakeValues } from "./filingIntakeModel";
import type { OwnedMon } from "./monsModel";
import {
  DECOR_CATALOG,
  FARM_CATALOG,
  type FarmBuildingKind,
  type FarmDecorKind,
  type PlacedBuilding,
  type PlacedDecor
} from "./farmState";
import { validateCompendiumSnapshot, type CompendiumSaveSnapshot } from "./compendium";

// v3 adds the optional `farmState` snapshot (Mons Ranch economy). v1 and v2
// blobs are accepted and MIGRATED forward with newly introduced state empty.
export const SAVE_STATE_SCHEMA_VERSION = 3;
export const SAVE_STATE_SCHEMA_VERSION_V2 = 2;
export const SAVE_STATE_SCHEMA_VERSION_V1 = 1;

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

export type MonsSaveSnapshot = {
  roster: OwnedMon[];
  activeIndex?: number;
};

export type FarmSaveSnapshot = {
  swagCoins: number;
  buildings: PlacedBuilding[];
  decor: PlacedDecor[];
};

export type SaveState = {
  schemaVersion: typeof SAVE_STATE_SCHEMA_VERSION;
  savedAt?: string;
  intake?: FilingIntakeValues;
  flags: SaveFlagsSnapshot;
  party: PartyStateSnapshot;
  player: SavePlayerSnapshot;
  mons?: MonsSaveSnapshot;
  farmState?: FarmSaveSnapshot;
  compendium?: CompendiumSaveSnapshot;
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
  intake?: FilingIntakeValues;
  savedAt?: string;
  mons?: {
    snapshot(): MonsSaveSnapshot;
  };
  farmState?: {
    snapshot(): FarmSaveSnapshot;
  };
  compendium?: {
    snapshot(): CompendiumSaveSnapshot;
  };
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
  mons?: {
    restore(snapshot: MonsSaveSnapshot | undefined): void;
  };
  farmState?: {
    restore(snapshot: FarmSaveSnapshot | undefined): void;
  };
  compendium?: {
    restore(snapshot: CompendiumSaveSnapshot | undefined): void;
  };
};

export type SaveSlotPersistence = {
  saveToSlot(slot: number, blob: string): boolean;
  loadFromSlot(slot: number): string | null;
  hasSave(slot: number): boolean;
  clearSlot(slot: number): boolean;
};

export type SaveImportValidationResult =
  | { ok: true; blob: string; save: SaveState }
  | { ok: false; reason: "empty" | "invalid-json" | "invalid-schema" };

const EQUIPMENT_SLOTS: EquipmentSlot[] = ["weapon", "body", "arms", "other"];
const FACING_VALUES: Facing[] = ["up", "down", "left", "right"];

export function captureSaveState(sources: SaveStateSources): SaveState {
  const save: SaveState = {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    ...(typeof sources.savedAt === "string" ? { savedAt: sources.savedAt } : {}),
    ...(sources.intake ? { intake: sources.intake } : {}),
    flags: {
      strings: uniqueStrings(sources.flags.list()),
      numeric: uniqueIds(sources.flags.listNums()) ?? []
    },
    party: clonePartyStateSnapshot(sources.partyState.snapshot()),
    player: clonePlayerSnapshot(sources.player),
    ...(sources.mons ? { mons: cloneMonsSnapshot(sources.mons.snapshot()) } : {}),
    ...(sources.farmState ? { farmState: cloneFarmSnapshot(sources.farmState.snapshot()) } : {}),
    ...(sources.compendium ? { compendium: sources.compendium.snapshot() } : {})
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
  sinks.mons?.restore(validated.mons);
  sinks.farmState?.restore(validated.farmState);
  sinks.compendium?.restore(validated.compendium);
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

export function validateImportedSaveBlob(blob: string | null | undefined): SaveImportValidationResult {
  if (typeof blob !== "string" || blob.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const save = validateSaveState(parsed);
  return save ? { ok: true, blob, save } : { ok: false, reason: "invalid-schema" };
}

export function validateSaveState(value: unknown): SaveState | null {
  if (!isRecord(value)) {
    return null;
  }
  // v1 blobs (pre-mons) and v2 blobs (pre-farm) migrate forward with newly
  // introduced state empty. Any other version is rejected.
  const version = value.schemaVersion;
  if (
    version !== SAVE_STATE_SCHEMA_VERSION &&
    version !== SAVE_STATE_SCHEMA_VERSION_V2 &&
    version !== SAVE_STATE_SCHEMA_VERSION_V1
  ) {
    return null;
  }
  const flags = validateFlagsSnapshot(value.flags);
  const party = validatePartyStateSnapshot(value.party);
  const player = validatePlayerSnapshot(value.player);
  const intake = value.intake === undefined ? undefined : validateFilingIntake(value.intake);
  if (!flags || !party || !player) {
    return null;
  }
  // v1 blobs restore an empty roster; v2 and v3 mons are validated strictly.
  const mons = version === SAVE_STATE_SCHEMA_VERSION_V1
    ? undefined
    : (value.mons === undefined ? undefined : validateMonsSnapshot(value.mons));
  if (version !== SAVE_STATE_SCHEMA_VERSION_V1 && value.mons !== undefined && !mons) {
    return null;
  }
  // v1 and v2 blobs restore an empty farm; v3 farm state is validated strictly.
  const farmState = version === SAVE_STATE_SCHEMA_VERSION
    ? (value.farmState === undefined ? undefined : validateFarmSnapshot(value.farmState))
    : undefined;
  if (version === SAVE_STATE_SCHEMA_VERSION && value.farmState !== undefined && !farmState) {
    return null;
  }
  const compendium = version === SAVE_STATE_SCHEMA_VERSION
    ? (value.compendium === undefined ? undefined : validateCompendiumSnapshot(value.compendium))
    : undefined;
  if (version === SAVE_STATE_SCHEMA_VERSION && value.compendium !== undefined && !compendium) {
    return null;
  }
  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    ...(typeof value.savedAt === "string" ? { savedAt: value.savedAt } : {}),
    ...(intake ? { intake } : {}),
    flags,
    party,
    player,
    ...(mons ? { mons } : {}),
    ...(farmState ? { farmState } : {}),
    ...(compendium ? { compendium } : {})
  };
}

function validateMonsSnapshot(value: unknown): MonsSaveSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.roster)) {
    return null;
  }
  const roster: OwnedMon[] = [];
  for (const entry of value.roster) {
    if (!isRecord(entry) || typeof entry.registryId !== "string" || entry.registryId.length === 0) {
      return null;
    }
    const level = validateId(entry.level);
    const xp = validateId(entry.xp);
    const bond = validateId(entry.bond);
    const inherited = validateStringArray(entry.inherited);
    if (level === undefined || level < 1 || xp === undefined || bond === undefined || !inherited) {
      return null;
    }
    let lineage: OwnedMon["lineage"];
    if (entry.lineage !== undefined) {
      if (
        !isRecord(entry.lineage) ||
        !Array.isArray(entry.lineage.parents) ||
        entry.lineage.parents.length !== 2 ||
        entry.lineage.parents.some((p) => typeof p !== "string")
      ) {
        return null;
      }
      lineage = { parents: [entry.lineage.parents[0] as string, entry.lineage.parents[1] as string] };
    }
    if (entry.caughtAtFlag !== undefined && typeof entry.caughtAtFlag !== "string") {
      return null;
    }
    roster.push({
      registryId: entry.registryId,
      level,
      xp,
      bond,
      inherited,
      ...(lineage ? { lineage } : {}),
      ...(typeof entry.caughtAtFlag === "string" ? { caughtAtFlag: entry.caughtAtFlag } : {})
    });
  }
  const activeIndex = value.activeIndex === undefined ? undefined : validateId(value.activeIndex);
  if (value.activeIndex !== undefined && (activeIndex === undefined || activeIndex >= roster.length)) {
    return null;
  }
  return {
    roster,
    ...(activeIndex !== undefined ? { activeIndex } : {})
  };
}

function cloneMonsSnapshot(snapshot: MonsSaveSnapshot): MonsSaveSnapshot {
  return {
    roster: snapshot.roster.map((mon) => ({
      registryId: mon.registryId,
      level: mon.level,
      xp: mon.xp,
      bond: mon.bond,
      inherited: [...mon.inherited],
      ...(mon.lineage ? { lineage: { parents: [mon.lineage.parents[0], mon.lineage.parents[1]] } } : {}),
      ...(mon.caughtAtFlag !== undefined ? { caughtAtFlag: mon.caughtAtFlag } : {})
    })),
    ...(snapshot.activeIndex !== undefined ? { activeIndex: snapshot.activeIndex } : {})
  };
}

function validateFarmSnapshot(value: unknown): FarmSaveSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.buildings) || !Array.isArray(value.decor)) {
    return null;
  }
  const swagCoins = validateId(value.swagCoins);
  if (swagCoins === undefined) {
    return null;
  }
  const buildings: PlacedBuilding[] = [];
  const ids = new Set<string>();
  for (const entry of value.buildings) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      ids.has(entry.id) ||
      !isFarmBuildingKind(entry.kind)
    ) {
      return null;
    }
    const tier = validateId(entry.tier);
    const cell = validatePoint(entry.cell);
    const progressSteps = validateId(entry.progressSteps);
    const assignedMonIds = validateStringArray(entry.assignedMonIds);
    if (
      tier === undefined ||
      tier < 1 ||
      tier > 3 ||
      !cell ||
      progressSteps === undefined ||
      !assignedMonIds ||
      assignedMonIds.some((registryId) => registryId.length === 0) ||
      (entry.jobRecipeId !== undefined && typeof entry.jobRecipeId !== "string")
    ) {
      return null;
    }
    ids.add(entry.id);
    buildings.push({
      id: entry.id,
      kind: entry.kind,
      tier,
      cell,
      progressSteps,
      ...(typeof entry.jobRecipeId === "string" ? { jobRecipeId: entry.jobRecipeId } : {}),
      assignedMonIds
    });
  }
  const decor: PlacedDecor[] = [];
  for (const entry of value.decor) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      ids.has(entry.id) ||
      !isFarmDecorKind(entry.kind)
    ) {
      return null;
    }
    const cell = validatePoint(entry.cell);
    if (!cell) {
      return null;
    }
    ids.add(entry.id);
    decor.push({ id: entry.id, kind: entry.kind, cell });
  }
  return { swagCoins, buildings, decor };
}

function cloneFarmSnapshot(snapshot: FarmSaveSnapshot): FarmSaveSnapshot {
  return {
    swagCoins: snapshot.swagCoins,
    buildings: snapshot.buildings.map((building) => ({
      id: building.id,
      kind: building.kind,
      tier: building.tier,
      cell: { ...building.cell },
      progressSteps: building.progressSteps,
      ...(building.jobRecipeId !== undefined ? { jobRecipeId: building.jobRecipeId } : {}),
      assignedMonIds: [...building.assignedMonIds]
    })),
    decor: snapshot.decor.map((decor) => ({
      id: decor.id,
      kind: decor.kind,
      cell: { ...decor.cell }
    }))
  };
}

function isFarmBuildingKind(value: unknown): value is FarmBuildingKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FARM_CATALOG, value);
}

function isFarmDecorKind(value: unknown): value is FarmDecorKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DECOR_CATALOG, value);
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
    ...(snapshot.order ? { order: [...snapshot.order] } : {}),
    inventory: snapshot.inventory.map((entry) => ({
      charId: entry.charId,
      itemIds: [...entry.itemIds]
    })),
    equipped: snapshot.equipped.map((entry) => ({
      charId: entry.charId,
      slots: { ...entry.slots }
    })),
    ...(snapshot.storage ? { storage: [...snapshot.storage] } : {}),
    ...(snapshot.vitals ? {
      vitals: snapshot.vitals.map(clonePartyVitalsSnapshot)
    } : {}),
    ...(snapshot.battleMembers ? {
      battleMembers: snapshot.battleMembers.map(cloneBattleMemberSnapshot)
    } : {}),
    ...(snapshot.statuses ? {
      statuses: snapshot.statuses.map(clonePartyStatusSnapshot)
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
  const order = value.order === undefined ? undefined : validateIdArray(value.order, { unique: true });
  const inventory = validateInventory(value.inventory);
  const equipped = validateEquipment(value.equipped);
  const storage = value.storage === undefined ? undefined : validateIdArray(value.storage);
  const vitals = value.vitals === undefined ? undefined : validateVitals(value.vitals);
  const battleMembers = value.battleMembers === undefined ? undefined : validateBattleMembers(value.battleMembers);
  const statuses = value.statuses === undefined ? undefined : validateStatuses(value.statuses);
  if (
    wallet === undefined ||
    (value.bank !== undefined && bank === undefined) ||
    !partyIds ||
    (value.order !== undefined && !order) ||
    !inventory ||
    !equipped ||
    (value.storage !== undefined && !storage) ||
    (value.vitals !== undefined && !vitals) ||
    (value.battleMembers !== undefined && !battleMembers) ||
    (value.statuses !== undefined && !statuses)
  ) {
    return null;
  }
  return {
    wallet,
    ...(bank !== undefined ? { bank } : {}),
    partyIds,
    ...(order ? { order } : {}),
    inventory,
    equipped,
    ...(storage ? { storage } : {}),
    ...(vitals ? { vitals } : {}),
    ...(battleMembers ? { battleMembers } : {}),
    ...(statuses ? { statuses } : {})
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

function validateStatuses(value: unknown): PartyStatusSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const statusSnapshots: PartyStatusSnapshot[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }
    const charId = validateId(entry.charId);
    const statuses = validateStatusState(entry.statuses);
    if (charId === undefined || !statuses) {
      return null;
    }
    statusSnapshots.push({ charId, statuses });
  }
  return statusSnapshots;
}

function validateStatusState(value: unknown): StatusState | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const statuses: StatusState = [];
  for (const entry of value) {
    const ailment = isRecord(entry) && typeof entry.ailment === "string" && STATUS_AILMENTS.includes(entry.ailment as StatusAilment)
      ? entry.ailment as StatusAilment
      : undefined;
    if (!isRecord(entry) || !ailment) {
      return null;
    }
    const remaining = entry.remaining === undefined ? undefined : validateId(entry.remaining);
    const magnitude = entry.magnitude === undefined ? undefined : validateId(entry.magnitude);
    if (
      (entry.remaining !== undefined && remaining === undefined) ||
      (entry.magnitude !== undefined && magnitude === undefined)
    ) {
      return null;
    }
    statuses.push({
      ailment,
      ...(remaining !== undefined ? { remaining } : {}),
      ...(magnitude !== undefined ? { magnitude } : {})
    });
  }
  return statuses;
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

function clonePartyStatusSnapshot(snapshot: PartyStatusSnapshot): PartyStatusSnapshot {
  return {
    charId: snapshot.charId,
    statuses: snapshot.statuses.map((entry) => ({ ...entry }))
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
