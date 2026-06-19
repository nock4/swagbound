import type { GameData } from "./loader";
import type { PartyStateSnapshot } from "./partyState";
import type { Facing } from "./playerController";
import type { SaveFlagsSnapshot, SaveSlotPersistence } from "./saveState";

export type BattleReturnSource = "encounter" | "event";
export type BattleReturnOutcome = "win" | "lose" | "flee";

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
};

export type BattleReturnContext = {
  sceneKey: "chunked-world";
  gameData: GameData;
  saveSlot: number;
  saveSlots?: SaveSlotPersistence;
  restore: ChunkedWorldRestore;
};
