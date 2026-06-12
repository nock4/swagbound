export type DialogueEvent = { kind: "dialogue"; reference: string };

export type GameEvent = DialogueEvent;

const CCSCRIPT_REFERENCE_PATTERN = /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/;

export function interactionEvents(npc: { textPointer?: string }, fallbackReference: string): GameEvent[] {
  const reference = npc.textPointer && CCSCRIPT_REFERENCE_PATTERN.test(npc.textPointer)
    ? npc.textPointer
    : fallbackReference;
  return [{ kind: "dialogue", reference }];
}
