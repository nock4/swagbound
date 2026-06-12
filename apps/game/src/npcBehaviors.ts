import type { NpcBehavior } from "./npcController";

export const STATIC_NPC_BEHAVIOR: NpcBehavior = { kind: "static" };

// Repo-owned until imported npc_config Movement codes are decoded into runtime behaviors.
export const NPC_BEHAVIORS = {
  746: { kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 }
} satisfies Record<number, NpcBehavior>;

export function behaviorForNpc(npcId: number): NpcBehavior {
  return NPC_BEHAVIORS[npcId as keyof typeof NPC_BEHAVIORS] ?? STATIC_NPC_BEHAVIOR;
}
