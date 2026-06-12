import { talkedFlag } from "./gameFlags";

export type DialogueEvent = { kind: "dialogue"; reference: string };
export type SetFlagEvent = { kind: "setFlag"; flag: string };

export type GameEvent = DialogueEvent | SetFlagEvent;

const CCSCRIPT_REFERENCE_PATTERN = /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/;

export type FlagReader = {
  has(flag: string): boolean;
};

function ccsReference(pointer: string | undefined): string | undefined {
  return pointer && CCSCRIPT_REFERENCE_PATTERN.test(pointer) ? pointer : undefined;
}

/**
 * Repo-owned approximation: real EarthBound gates Text Pointer 2 through its
 * event-flag system, which this project has not decoded.
 */
export function interactionEvents(
  npc: { npcId: number; textPointer?: string; textPointer2?: string },
  fallbackReference: string,
  flags: FlagReader
): GameEvent[] {
  const flag = talkedFlag(npc.npcId);
  const hasTalked = flags.has(flag);
  const reference = (hasTalked ? ccsReference(npc.textPointer2) : undefined)
    ?? ccsReference(npc.textPointer)
    ?? fallbackReference;
  return [
    { kind: "dialogue", reference },
    { kind: "setFlag", flag }
  ];
}
