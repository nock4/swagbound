import {
  resolveScriptEvents,
  type EventEffect,
  type NumericFlagState,
  type ScriptCollection
} from "@eb/schemas";
import type { GameEvent } from "./eventRunner";
import type { NpcBehavior } from "./npcController";

export const STATIC_NPC_BEHAVIOR: NpcBehavior = { kind: "static" };
// Decoded from the EarthBound ROM action-script bytecode (movement-value pointer
// table @ 0xC400D4) against the Herringway/ebsrc disassembly: these movement ids
// run a zero-velocity / no-move-callback script, or cycle facing in place (606/693
// = look-around watchers), so the NPC never translates. Everything else falls
// through to the wander default. The decoded WALKERS are {12,13,16,599,602}; the
// rare long-tail ids (80/607-609/769/784/…) stay on the wander default for now.
export const STATIC_HEURISTIC_MOVEMENT_IDS = new Set([0, 7, 8, 9, 10, 597, 598, 600, 605, 606, 693]);
export const HEURISTIC_WANDER_RADIUS_PX = 16;
export const HEURISTIC_WANDER_SPEED_PX_PER_SEC = 22;

export type NpcBehaviorContext = {
  hasServiceInteraction?: boolean;
  isInteriorHome?: boolean;
};

// Repo-owned until imported npc_config Movement codes are decoded into runtime behaviors.
export const NPC_BEHAVIORS = {
  744: STATIC_NPC_BEHAVIOR,
  745: STATIC_NPC_BEHAVIOR,
  746: { kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 }
} satisfies Record<number, NpcBehavior>;

const SERVICE_GAME_EVENT_KINDS = new Set<GameEvent["kind"]>(["shop", "heal", "save"]);
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
  if (context.hasServiceInteraction) {
    return STATIC_NPC_BEHAVIOR;
  }
  const configured = NPC_BEHAVIORS[npcId as keyof typeof NPC_BEHAVIORS];
  if (configured) {
    return configured;
  }
  if (context.isInteriorHome) {
    return STATIC_NPC_BEHAVIOR;
  }
  return heuristicBehaviorForMovement(npcId, movementId);
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

function isServiceEventEffect(effect: EventEffect): boolean {
  if (SERVICE_EVENT_EFFECT_KINDS.has(effect.kind)) {
    return true;
  }
  return effect.kind === "partyStat" && SERVICE_PARTY_STAT_OPS.has(effect.op);
}
