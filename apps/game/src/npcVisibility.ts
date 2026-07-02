import { isNpcVisibleForEventFlags, type WorldChunkedNpc, type WorldNpc } from "@eb/schemas";
import type { GameFlags } from "./gameFlags";

type RuntimeNpcVisibility = Pick<WorldNpc | WorldChunkedNpc, "npcId" | "showSprite" | "eventFlag">;
type RuntimeNpcVisibilityFlags = Pick<GameFlags, "has" | "isSet">;

export function cutsceneNpcHiddenFlag(npcId: number): string {
  return `cutscene:npc:${normalizeNpcId(npcId)}:hidden`;
}

export function isNpcVisibleForRuntimeFlags(
  npc: RuntimeNpcVisibility,
  flags: RuntimeNpcVisibilityFlags
): boolean {
  if (flags.has(cutsceneNpcHiddenFlag(npc.npcId))) {
    return false;
  }
  return isNpcVisibleForEventFlags(npc.showSprite, npc.eventFlag, flags);
}

function normalizeNpcId(npcId: number): number {
  if (!Number.isInteger(npcId) || npcId < 0) {
    throw new Error(`Invalid NPC id: ${npcId}`);
  }
  return npcId;
}
