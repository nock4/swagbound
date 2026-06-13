import type { NpcBehavior } from "./npcController";

export const STATIC_NPC_BEHAVIOR: NpcBehavior = { kind: "static" };
export const STATIC_HEURISTIC_MOVEMENT_IDS = new Set([0, 8, 9]);
export const HEURISTIC_WANDER_RADIUS_PX = 16;
export const HEURISTIC_WANDER_SPEED_PX_PER_SEC = 22;

// Repo-owned until imported npc_config Movement codes are decoded into runtime behaviors.
export const NPC_BEHAVIORS = {
  744: STATIC_NPC_BEHAVIOR,
  745: STATIC_NPC_BEHAVIOR,
  746: { kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 }
} satisfies Record<number, NpcBehavior>;

export function behaviorForNpc(npcId: number, movementId?: number): NpcBehavior {
  return NPC_BEHAVIORS[npcId as keyof typeof NPC_BEHAVIORS] ?? heuristicBehaviorForMovement(npcId, movementId);
}

/**
 * Approximation only: CoilSnake exposes Movement as an opaque integer index, not
 * decoded movement bytecode. These buckets come from structural frequency only.
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
