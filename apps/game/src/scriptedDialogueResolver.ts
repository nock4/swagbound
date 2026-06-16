import type {
  CustomDialogue,
  DialoguePage,
  NumericFlagState,
  ScriptCollection,
  SwagboundDialogueLibrary
} from "@eb/schemas";
import { buildDialogueForReference, buildInlineDialoguePages } from "./loader";

export type CustomDialogueLookup = Pick<CustomDialogue, "byNpcId" | "byTextPointer">;
export type DialogueLibraryLookup = Pick<SwagboundDialogueLibrary, "entries">;

export type ScriptedBeatDialogueStartResult = "override" | "eventSequence" | "unavailable";

export function resolveCustomDialoguePages(
  entry: CustomDialogueLookup["byNpcId"][string] | undefined,
  dialogueLibrary?: DialogueLibraryLookup
): string[] | undefined {
  if (!entry) {
    return undefined;
  }
  if (entry.pages) {
    return entry.pages.length > 0 ? [...entry.pages] : undefined;
  }
  if (!entry.ref) {
    return undefined;
  }
  const libraryPages = dialogueLibrary?.entries[entry.ref]?.pages;
  if (libraryPages && libraryPages.length > 0) {
    return [...libraryPages];
  }
  console.warn(`Custom dialogue ref "${entry.ref}" was not found; using EB fallback.`);
  return undefined;
}

export function resolveScriptedDialogueOverridePages(
  customDialogue: Pick<CustomDialogueLookup, "byTextPointer"> | undefined,
  dialogueLibrary: DialogueLibraryLookup | undefined,
  reference: string
): DialoguePage[] | undefined {
  const pages = resolveCustomDialoguePages(customDialogue?.byTextPointer[reference], dialogueLibrary);
  return pages && pages.length > 0 ? buildInlineDialoguePages(pages) : undefined;
}

export function resolveScriptedDialoguePages(
  customDialogue: Pick<CustomDialogueLookup, "byTextPointer"> | undefined,
  dialogueLibrary: DialogueLibraryLookup | undefined,
  scripts: ScriptCollection | undefined,
  reference: string,
  flags?: NumericFlagState
): DialoguePage[] {
  return resolveScriptedDialogueOverridePages(customDialogue, dialogueLibrary, reference)
    ?? buildDialogueForReference(scripts, reference, flags);
}

export function startScriptedBeatDialogue(options: {
  reference: string;
  customDialogue?: Pick<CustomDialogueLookup, "byTextPointer">;
  dialogueLibrary?: DialogueLibraryLookup;
  onComplete: () => void;
  startOverrideDialogue: (pages: DialoguePage[], onComplete: () => void) => void;
  startEventSequence: (reference: string, onComplete: () => void) => boolean;
}): ScriptedBeatDialogueStartResult {
  const pages = resolveScriptedDialogueOverridePages(
    options.customDialogue,
    options.dialogueLibrary,
    options.reference
  );
  if (pages && pages.length > 0) {
    options.startOverrideDialogue(pages, options.onComplete);
    return "override";
  }
  return options.startEventSequence(options.reference, options.onComplete)
    ? "eventSequence"
    : "unavailable";
}
