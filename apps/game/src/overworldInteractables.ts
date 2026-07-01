import type { OverworldInteractable } from "@eb/schemas";
import type { GameEvent } from "./eventRunner";
import type { InteractionSfxCue } from "./audio/transitionSfx";

export type OverworldInteractableFlagReader = {
  has(flag: string): boolean;
};

export type OverworldInteractableAction = {
  events: GameEvent[];
  sfxBeforeEvents: InteractionSfxCue[];
  opened: boolean;
};

export function overworldPresentOpenedFlag(entry: Extract<OverworldInteractable, { kind: "present" }>): string {
  return entry.openedFlag ?? `overworld-present:${entry.id}:opened`;
}

export function overworldInteractableIsOpened(
  entry: OverworldInteractable,
  flags: OverworldInteractableFlagReader
): boolean {
  return entry.kind === "present" && flags.has(overworldPresentOpenedFlag(entry));
}

export function overworldInteractableEvents(
  entry: OverworldInteractable,
  flags: OverworldInteractableFlagReader,
  options: {
    itemName?: (itemId: number) => string | undefined;
  } = {}
): OverworldInteractableAction {
  if (entry.kind === "present") {
    return presentEvents(entry, flags, options.itemName);
  }
  return {
    events: [{ kind: "dialogue", pages: entry.pages }],
    sfxBeforeEvents: entry.kind === "sign" ? ["talkConfirm", "readCue"] : ["readCue"],
    opened: false
  };
}

function presentEvents(
  entry: Extract<OverworldInteractable, { kind: "present" }>,
  flags: OverworldInteractableFlagReader,
  itemName: ((itemId: number) => string | undefined) | undefined
): OverworldInteractableAction {
  const openedFlag = overworldPresentOpenedFlag(entry);
  if (flags.has(openedFlag)) {
    return {
      events: [{ kind: "dialogue", pages: entry.openedPages ?? ["The present is empty."] }],
      sfxBeforeEvents: [],
      opened: true
    };
  }
  return {
    events: [
      { kind: "dialogue", pages: entry.pages ?? defaultPresentPages(itemName?.(entry.item.item), entry.item.item) },
      { kind: "give", char: entry.item.char, item: entry.item.item },
      { kind: "setFlag", flag: openedFlag }
    ],
    sfxBeforeEvents: ["presentOpen"],
    opened: false
  };
}

function defaultPresentPages(itemName: string | undefined, itemId: number): string[] {
  const name = itemName?.trim() || `[item ${itemId}]`;
  return [
    "Bosch opened the present.",
    `Inside was a ${name}!`,
    `You got the ${name}!`
  ];
}
