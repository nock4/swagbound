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
    hasRoom?: (char: number) => boolean;
  } = {}
): OverworldInteractableAction {
  if (entry.kind === "present") {
    return presentEvents(entry, flags, options.itemName, options.hasRoom);
  }
  return {
    events: [{ kind: "dialogue", pages: entry.pages }],
    sfxBeforeEvents: ["talkConfirm", "readCue"],
    opened: false
  };
}

function presentEvents(
  entry: Extract<OverworldInteractable, { kind: "present" }>,
  flags: OverworldInteractableFlagReader,
  itemName: ((itemId: number) => string | undefined) | undefined,
  hasRoom: ((char: number) => boolean) | undefined
): OverworldInteractableAction {
  const openedFlag = overworldPresentOpenedFlag(entry);
  if (flags.has(openedFlag)) {
    return {
      events: [{ kind: "dialogue", pages: entry.openedPages ?? ["The present is empty."] }],
      sfxBeforeEvents: ["talkConfirm"],
      opened: true
    };
  }
  if (hasRoom && !hasRoom(entry.item.char)) {
    // EB: a present stays unopened when the recipient's bag is full.
    return {
      events: [{ kind: "dialogue", pages: ["You can't carry any more."] }],
      sfxBeforeEvents: ["talkConfirm"],
      opened: false
    };
  }
  return {
    events: [
      { kind: "dialogue", pages: entry.pages ?? defaultPresentPages(itemName?.(entry.item.item), entry.item.item) },
      { kind: "give", char: entry.item.char, item: entry.item.item },
      { kind: "setFlag", flag: openedFlag }
    ],
    sfxBeforeEvents: ["talkConfirm", "presentOpen"],
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
