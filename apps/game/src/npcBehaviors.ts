import {
  resolveScriptEvents,
  type EventEffect,
  type NpcMovementPatternName,
  type NumericFlagState,
  type ScriptCollection
} from "@eb/schemas";
import { movementSpeedById } from "./ebTiming";
import type { GameEvent } from "./eventRunner";
import type { NpcBehavior } from "./npcController";

export const STATIC_NPC_BEHAVIOR: NpcBehavior = { kind: "static" };
// Decoded from the EarthBound ROM action-script bytecode (movement-value pointer
// table @ 0xC400D4) against the Herringway/ebsrc disassembly. STATIC ids run a
// zero-velocity / no-move-callback script (the NPC never translates). LOOK_AROUND
// ids (606/693 "watcher" scripts) stand still but turn to face new directions in
// place. Decoded WALKERS {12,13,16,599,602} + the rare long-tail (80/607-609/769/
// 784/…) fall through to the wander default.
export const STATIC_HEURISTIC_MOVEMENT_IDS = new Set([0, 7, 8, 9, 10, 597, 598, 600, 605]);
export const LOOK_AROUND_MOVEMENT_IDS = new Set([606, 693]);
export const LOOK_AROUND_PERIOD_MS = 2000;
export const HEURISTIC_WANDER_RADIUS_PX = 16;
export const HEURISTIC_WANDER_SPEED_PX_PER_SEC = 22;
export const AUTHORED_PATTERN_MOVEMENT_SPEED_ID = 10;
export const AUTHORED_PATTERN_SPEED_PX_PER_SEC =
  movementSpeedById(AUTHORED_PATTERN_MOVEMENT_SPEED_ID).cardinalPxPerSecond;
export const AUTHORED_PATTERN_PACE_RANGE_PX = 24;
export const AUTHORED_PATTERN_WANDER_RADIUS_PX = 24;

export type NpcBehaviorContext = {
  hasServiceInteraction?: boolean;
  isInteriorHome?: boolean;
  movementPattern?: NpcMovementPatternName;
  npcType?: string;
};

// Repo-owned until imported npc_config Movement codes are decoded into runtime behaviors.
export const NPC_BEHAVIORS = {
  744: STATIC_NPC_BEHAVIOR,
  745: STATIC_NPC_BEHAVIOR,
  746: { kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 }
} satisfies Record<number, NpcBehavior>;

const SERVICE_GAME_EVENT_KINDS = new Set<GameEvent["kind"]>(["shop", "service", "heal", "save"]);
const SERVICE_EVENT_EFFECT_KINDS = new Set<EventEffect["kind"]>([
  "shop",
  "healHp",
  "healHpPercent",
  "recoverPp",
  "recoverPpPercent"
]);
const SERVICE_PARTY_STAT_OPS = new Set<Extract<EventEffect, { kind: "partyStat" }>["op"]>([
  "heal",
  "heal_percent",
  "recoverpp",
  "recoverpp_percent"
]);

export function behaviorForNpc(npcId: number, movementId?: number, context: NpcBehaviorContext = {}): NpcBehavior {
  if (context.movementPattern) {
    return authoredPatternBehaviorForNpc(npcId, context.movementPattern);
  }
  if (context.hasServiceInteraction) {
    return STATIC_NPC_BEHAVIOR;
  }
  const configured = NPC_BEHAVIORS[npcId as keyof typeof NPC_BEHAVIORS];
  if (configured) {
    return configured;
  }
  if (context.npcType === "object" || context.npcType === "item") {
    return STATIC_NPC_BEHAVIOR;
  }
  if (context.isInteriorHome) {
    return STATIC_NPC_BEHAVIOR;
  }
  return heuristicBehaviorForMovement(npcId, movementId);
}

export function authoredPatternBehaviorForNpc(npcId: number, pattern: NpcMovementPatternName): NpcBehavior {
  switch (pattern) {
    case "pace-horizontal":
      return {
        kind: "patrol",
        axis: "x",
        rangePx: AUTHORED_PATTERN_PACE_RANGE_PX,
        speedPxPerSec: AUTHORED_PATTERN_SPEED_PX_PER_SEC
      };
    case "pace-vertical":
      return {
        kind: "patrol",
        axis: "y",
        rangePx: AUTHORED_PATTERN_PACE_RANGE_PX,
        speedPxPerSec: AUTHORED_PATTERN_SPEED_PX_PER_SEC
      };
    case "stationary-look-around":
      return {
        kind: "lookAround",
        periodMs: LOOK_AROUND_PERIOD_MS,
        seed: npcBehaviorSeed(npcId, authoredPatternSeedId(pattern))
      };
    case "wander-box":
      return {
        kind: "wander",
        radiusPx: AUTHORED_PATTERN_WANDER_RADIUS_PX,
        speedPxPerSec: AUTHORED_PATTERN_SPEED_PX_PER_SEC,
        seed: npcBehaviorSeed(npcId, authoredPatternSeedId(pattern))
      };
  }
}

export function interactionEventsHaveServiceEffect(
  events: readonly GameEvent[],
  scripts?: ScriptCollection,
  flags?: NumericFlagState
): boolean {
  for (const event of events) {
    if (SERVICE_GAME_EVENT_KINDS.has(event.kind)) {
      return true;
    }
    if (event.kind === "dialogue" && event.reference && scripts) {
      const resolved = resolveScriptEvents(scripts, event.reference, {}, { flags });
      if (resolved?.effects.some(isServiceEventEffect)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Movement-id behavior. The static set is decoded from the EarthBound action-script
 * bytecode (see STATIC_HEURISTIC_MOVEMENT_IDS); decoded non-static ids and the rare
 * undecoded long tail fall through to a deterministic bounded wander. This corrects
 * the prior {0,8,9}-only rule that wrongly drifted ~400 standing NPCs.
 */
export function heuristicBehaviorForMovement(npcId: number, movementId?: number): NpcBehavior {
  if (movementId === undefined || STATIC_HEURISTIC_MOVEMENT_IDS.has(movementId)) {
    return STATIC_NPC_BEHAVIOR;
  }
  if (LOOK_AROUND_MOVEMENT_IDS.has(movementId)) {
    return { kind: "lookAround", periodMs: LOOK_AROUND_PERIOD_MS, seed: npcBehaviorSeed(npcId, movementId) };
  }
  return {
    kind: "wander",
    radiusPx: HEURISTIC_WANDER_RADIUS_PX,
    speedPxPerSec: HEURISTIC_WANDER_SPEED_PX_PER_SEC,
    seed: npcBehaviorSeed(npcId, movementId)
  };
}

function npcBehaviorSeed(npcId: number, movementId: number): number {
  let value = (Math.imul(npcId + 1, 0x45d9f3b) ^ Math.imul(movementId + 1, 0x119de1f3)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

function authoredPatternSeedId(pattern: NpcMovementPatternName): number {
  switch (pattern) {
    case "pace-horizontal":
      return 10_001;
    case "pace-vertical":
      return 10_002;
    case "stationary-look-around":
      return 10_003;
    case "wander-box":
      return 10_004;
  }
}

function isServiceEventEffect(effect: EventEffect): boolean {
  if (SERVICE_EVENT_EFFECT_KINDS.has(effect.kind)) {
    return true;
  }
  return effect.kind === "partyStat" && SERVICE_PARTY_STAT_OPS.has(effect.op);
}
