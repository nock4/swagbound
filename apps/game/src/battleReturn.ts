import type { GameData } from "./loader";
import type { PartyBattleMemberSnapshot, PartyStateSnapshot, PartyVitalsSnapshot } from "./partyState";
import type { Facing } from "./playerController";
import type { SaveFlagsSnapshot, SavePlayerSnapshot, SaveSlotPersistence } from "./saveState";

export type BattleReturnSource = "encounter" | "event";
export type BattleReturnOutcome = "win" | "lose" | "flee";
export type BattleReturnGuardPhase = "victory-summary" | "win" | "lose" | "flee" | "exit-transition";
export type BattleReturnGuardAction = "begin-exit";
export const BATTLE_RETURN_TERMINAL_GUARD_MS = 20000;

export function battleReturnGuardAction(input: {
  phase: BattleReturnGuardPhase;
  elapsedMs: number;
  returnContextActive: boolean;
  timeoutMs?: number;
}): BattleReturnGuardAction | null {
  if (!input.returnContextActive || input.phase === "exit-transition") {
    return null;
  }
  const timeoutMs = Math.max(0, Math.floor(input.timeoutMs ?? BATTLE_RETURN_TERMINAL_GUARD_MS));
  if (input.elapsedMs < timeoutMs) {
    return null;
  }
  return "begin-exit";
}

/**
 * A story-gate boss launched from a trigger. Its flag effects (and the once-fired
 * marker) are deferred into this payload so they apply ONLY when the player wins the
 * fight — a fled/lost boss never advances the story. Survives the battle round-trip
 * inside {@link ChunkedWorldRestore}.
 */
export type PendingStoryGate = {
  triggerId: string;
  once: boolean;
  setFlags?: string[];
  clearFlags?: string[];
};

export type SourceCheckReturnState = {
  id: string;
  outcome: "declined" | "failed" | "cleared";
  /** Present only for an Attestation clear that should run the world-scene reward reveal. */
  awardedCardId?: string;
  worldPixel: {
    x: number;
    y: number;
  };
};

export type PendingAttestationReward = { checkId: string; cardId: string };

export function pendingAttestationRewardForReturn(
  sourceCheck: SourceCheckReturnState | undefined
): PendingAttestationReward | undefined {
  return sourceCheck?.outcome === "cleared" && sourceCheck.awardedCardId
    ? { checkId: sourceCheck.id, cardId: sourceCheck.awardedCardId }
    : undefined;
}

export type BattleReturnEncounterState = {
  enabled: boolean;
  cooldownMs: number;
  rngSeed: number;
  lastEncounterGroup?: number;
};

export type ChunkedWorldRestore = {
  player: {
    x: number;
    y: number;
    facing: Facing;
  };
  flags: SaveFlagsSnapshot;
  party: PartyStateSnapshot;
  encounter: BattleReturnEncounterState;
  source: BattleReturnSource;
  outcome?: BattleReturnOutcome;
  /** Deferred effects for a story-gate boss; applied on `outcome === "win"`. */
  pendingStoryGate?: PendingStoryGate;
  /** Session-only source-check result; consumed by the world scene on restart. */
  sourceCheck?: SourceCheckReturnState;
  /** A wild mon convinced mid-battle; consumed idempotently by the world scene. */
  capturedMon?: {
    registryId: string;
    displayName: string;
  };
  /** Post-battle mon companion vitals + xp share; consumed by the world scene. */
  monCompanionResult?: {
    hp: number;
    pp: number;
    xpGained: number;
  };
  defeat?: {
    savedPlayer?: SavePlayerSnapshot;
    newGamePlayer: SavePlayerSnapshot;
  };
};

export type BattleReturnContext = {
  sceneKey: "chunked-world";
  gameData: GameData;
  saveSlot: number;
  saveSlots?: SaveSlotPersistence;
  restore: ChunkedWorldRestore;
};

export type DefeatReturnResult = {
  party: PartyStateSnapshot;
  player: SavePlayerSnapshot;
  respawnSource: "save" | "newGame";
};

export function applyDefeatReturn(input: {
  party: PartyStateSnapshot;
  savedPlayer?: SavePlayerSnapshot;
  newGamePlayer: SavePlayerSnapshot;
}): DefeatReturnResult {
  const respawnSource = input.savedPlayer ? "save" : "newGame";
  return {
    party: defeatPartySnapshot(input.party),
    player: clonePlayerSnapshot(input.savedPlayer ?? input.newGamePlayer),
    respawnSource
  };
}

function defeatPartySnapshot(snapshot: PartyStateSnapshot): PartyStateSnapshot {
  const leadCharId = snapshot.partyIds[0]
    ?? snapshot.battleMembers?.[0]?.charId
    ?? snapshot.vitals?.[0]?.charId;
  return {
    wallet: Math.floor(nonNegativeInt(snapshot.wallet) / 2),
    ...(snapshot.bank !== undefined ? { bank: nonNegativeInt(snapshot.bank) } : {}),
    partyIds: [...snapshot.partyIds],
    inventory: snapshot.inventory.map((entry) => ({
      charId: entry.charId,
      itemIds: [...entry.itemIds]
    })),
    equipped: snapshot.equipped.map((entry) => ({
      charId: entry.charId,
      slots: { ...entry.slots }
    })),
    ...(snapshot.storage ? { storage: [...snapshot.storage] } : {}),
    ...(snapshot.statuses ? {
      statuses: snapshot.statuses.map((entry) => ({
        charId: entry.charId,
        statuses: entry.statuses.map((status) => ({ ...status }))
      }))
    } : {}),
    ...(snapshot.vitals ? {
      vitals: snapshot.vitals.map((entry) => defeatVitals(entry, leadCharId))
    } : {}),
    ...(snapshot.battleMembers ? {
      battleMembers: snapshot.battleMembers.map((entry) => defeatBattleMember(entry, leadCharId))
    } : {})
  };
}

function defeatBattleMember(member: PartyBattleMemberSnapshot, leadCharId: number | undefined): PartyBattleMemberSnapshot {
  const maxHp = positiveInt(member.maxHp);
  return {
    ...member,
    hp: member.charId === leadCharId ? maxHp : 0,
    maxHp,
    pp: nonNegativeInt(member.pp),
    maxPp: nonNegativeInt(member.maxPp),
    inventory: [...member.inventory],
    stats: { ...member.stats }
  };
}

function defeatVitals(vitals: PartyVitalsSnapshot, leadCharId: number | undefined): PartyVitalsSnapshot {
  const maxHp = positiveInt(vitals.maxHp);
  const hp = vitals.charId === leadCharId ? maxHp : 0;
  return {
    ...vitals,
    hp: { current: hp, target: hp },
    maxHp,
    pp: nonNegativeInt(vitals.pp),
    maxPp: nonNegativeInt(vitals.maxPp)
  };
}

function clonePlayerSnapshot(player: SavePlayerSnapshot): SavePlayerSnapshot {
  return {
    mode: player.mode,
    ...(player.mapId !== undefined ? { mapId: player.mapId } : {}),
    ...(player.region ? { region: {
      ...(player.region.originTile ? { originTile: { ...player.region.originTile } } : {}),
      ...(player.region.widthPixels !== undefined ? { widthPixels: player.region.widthPixels } : {}),
      ...(player.region.heightPixels !== undefined ? { heightPixels: player.region.heightPixels } : {})
    } } : {}),
    x: player.x,
    y: player.y,
    facing: player.facing
  };
}

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function positiveInt(value: number): number {
  return Math.max(1, nonNegativeInt(value));
}
