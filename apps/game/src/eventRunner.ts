import { talkedFlag } from "./gameFlags";
import {
  resolveCustomDialoguePages,
  type CustomDialogueLookup,
  type DialogueLibraryLookup
} from "./scriptedDialogueResolver";
import type { NpcInteraction } from "@eb/schemas";

export type ReferenceDialogueEvent = { kind: "dialogue"; reference: string; pages?: never };
export type InlineDialogueEvent = { kind: "dialogue"; pages: string[]; reference?: never };
export type DialogueEvent = ReferenceDialogueEvent | InlineDialogueEvent;
export type SetFlagEvent = { kind: "setFlag"; flag: string };
export type ShopEvent = { kind: "shop"; storeId: number };

export type GameEvent = DialogueEvent | SetFlagEvent | ShopEvent;

export type InteractionEventDispatcher = {
  startDialogue(event: DialogueEvent): void;
  setFlag(flag: string): void;
  openShop(storeId: number): void;
  deferShop(storeId: number): void;
  isDialogueActive(): boolean;
};

const CCSCRIPT_REFERENCE_PATTERN = /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/;

export type FlagReader = {
  has(flag: string): boolean;
  isSet?(flag: number): boolean;
};

function ccsReference(pointer: string | undefined): string | undefined {
  return pointer && CCSCRIPT_REFERENCE_PATTERN.test(pointer) ? pointer : undefined;
}

export function interactionEntryEvents(
  entry: NpcInteraction | undefined,
  options: {
    fallbackReference?: string;
    dialogueLibrary?: DialogueLibraryLookup;
  } = {}
): GameEvent[] {
  if (!entry) {
    return options.fallbackReference
      ? [{ kind: "dialogue", reference: options.fallbackReference }]
      : [];
  }
  const events: GameEvent[] = [];
  const pages = resolveCustomDialoguePages(entry, options.dialogueLibrary);
  if (pages && pages.length > 0) {
    events.push({ kind: "dialogue", pages });
  } else if ((entry.pages || entry.ref) && options.fallbackReference) {
    events.push({ kind: "dialogue", reference: options.fallbackReference });
  }
  if (entry.shop !== undefined) {
    events.push({ kind: "shop", storeId: entry.shop });
  }
  return events;
}

export function addedNpcInteractionEvents(
  npc: { npcId: number; interaction: NpcInteraction },
  dialogueLibrary?: DialogueLibraryLookup
): GameEvent[] {
  return [
    ...interactionEntryEvents(npc.interaction, { dialogueLibrary }),
    { kind: "setFlag", flag: talkedFlag(npc.npcId) }
  ];
}

export function dispatchInteractionEvents(events: readonly GameEvent[], dispatcher: InteractionEventDispatcher): void {
  for (const event of events) {
    switch (event.kind) {
      case "dialogue":
        dispatcher.startDialogue(event);
        break;
      case "setFlag":
        dispatcher.setFlag(event.flag);
        break;
      case "shop":
        if (dispatcher.isDialogueActive()) {
          dispatcher.deferShop(event.storeId);
        } else {
          dispatcher.openShop(event.storeId);
        }
        break;
    }
  }
}

export function interactionEvents(
  npc: { npcId: number; eventFlag?: number; textPointer?: string; textPointer2?: string },
  fallbackReference: string,
  flags: FlagReader,
  customDialogue?: CustomDialogueLookup,
  dialogueLibrary?: DialogueLibraryLookup
): GameEvent[] {
  const flag = talkedFlag(npc.npcId);
  const hasEventFlag = npc.eventFlag !== undefined && npc.eventFlag > 0;
  const useTextPointer2 = hasEventFlag
    ? Boolean(flags.isSet?.(npc.eventFlag as number))
    : flags.has(flag);
  const reference = (useTextPointer2 ? ccsReference(npc.textPointer2) : undefined)
    ?? ccsReference(npc.textPointer)
    ?? fallbackReference;
  const customEntry = customDialogue?.byNpcId[String(npc.npcId)]
    ?? customDialogue?.byTextPointer[reference];
  return [
    ...interactionEntryEvents(customEntry, {
      fallbackReference: customEntry ? reference : undefined,
      dialogueLibrary
    }),
    ...(customEntry ? [] : [{ kind: "dialogue" as const, reference }]),
    { kind: "setFlag", flag }
  ];
}
