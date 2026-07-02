import { talkedFlag } from "./gameFlags";
import {
  resolveCustomDialoguePages,
  type CustomDialogueLookup,
  type DialogueLibraryLookup
} from "./scriptedDialogueResolver";
import { isGeneratedDrifellaBarkEntry } from "./customDialogueLookup";
import { resolveScriptEvents, type EventEffect, type NpcInteraction, type ScriptCollection } from "@eb/schemas";

export type ReferenceDialogueEvent = { kind: "dialogue"; reference: string; pages?: string[] };
export type InlineDialogueEvent = { kind: "dialogue"; pages: string[]; reference?: never };
export type DialogueEvent = ReferenceDialogueEvent | InlineDialogueEvent;
export type SetFlagEvent = { kind: "setFlag"; flag: string };
export type ShopEvent = { kind: "shop"; storeId: number };
export type ServiceKind = "hospital" | "hotel" | "phone" | "atm";
export type ServiceEvent = { kind: "service"; service: ServiceKind; cost?: number };
export type HealEvent = { kind: "heal"; scope: "full" };
export type SaveEvent = { kind: "save" };
export type GiveEvent = { kind: "give"; char: number; item: number };
export type MoneyEvent = { kind: "money"; op: "give" | "take"; amount: number };

export type GameEvent = DialogueEvent | SetFlagEvent | ShopEvent | ServiceEvent | HealEvent | SaveEvent | GiveEvent | MoneyEvent;

export type InteractionEventDispatcher = {
  startDialogue(event: DialogueEvent): void;
  setFlag(flag: string): void;
  openShop(storeId: number): void;
  deferShop(storeId: number): void;
  openService(service: ServiceKind, cost?: number): void;
  deferService(service: ServiceKind, cost?: number): void;
  heal(scope: HealEvent["scope"]): void;
  save(): void;
  give(char: number, item: number): void;
  money(op: "give" | "take", amount: number): void;
  isDialogueActive(): boolean;
};

const CCSCRIPT_REFERENCE_PATTERN = /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/;

const EB_SHOP_STORE_BY_REFERENCE = new Map<string, number>([
  ["data_05.l_0xc56df3", 41],
  ["data_05.l_0xc56df9", 45],
  ["data_05.l_0xc5711a", 43],
  ["data_05.l_0xc57120", 44],
  ["data_15.l_0xc60000", 24],
  ["data_16.l_0xc60e2a", 25],
  ["data_19.l_0xc6500f", 21],
  ["data_19.l_0xc6501b", 1],
  ["data_19.l_0xc65021", 57],
  ["data_19.l_0xc65027", 4],
  ["data_19.l_0xc6502d", 63],
  ["data_19.l_0xc65033", 63],
  ["data_19.l_0xc65039", 62],
  ["data_19.l_0xc65045", 61],
  ["data_19.l_0xc65051", 60],
  ["data_23.l_0xc6ad68", 22],
  ["data_24.l_0xc6dc8d", 26],
  ["data_28.l_0xc74e83", 1],
  ["data_28.l_0xc74e89", 2],
  ["data_28.l_0xc763a3", 4],
  ["data_28.l_0xc76443", 5],
  ["data_29.l_0xc76f20", 36],
  ["data_34.l_0xc7e813", 23],
  ["data_36.l_0xc829f8", 27],
  ["data_36.l_0xc829fe", 28],
  ["data_36.l_0xc82a63", 29],
  ["data_36.l_0xc82a69", 30],
  ["data_37.l_0xc83d18", 34],
  ["data_37.l_0xc83d1e", 35],
  ["data_41.l_0xc8a34b", 39],
  ["data_41.l_0xc8a351", 38],
  ["data_41.l_0xc8a5ce", 40],
  ["data_42.l_0xc8e138", 17],
  ["data_42.l_0xc8e13e", 18],
  ["data_42.l_0xc8e144", 20],
  ["data_43.l_0xc8ecb4", 19],
  ["data_47.l_0xc93e16", 11],
  ["data_47.l_0xc94479", 14],
  ["data_47.l_0xc94503", 15],
  ["data_48.l_0xc96a72", 6],
  ["data_48.l_0xc96a78", 7],
  ["data_49.l_0xc96baf", 8],
  ["data_49.l_0xc96bb5", 9],
  ["data_50.l_0xc98b68", 16],
  ["data_56.l_0xef6814", 56]
]);

export type FlagReader = {
  has(flag: string): boolean;
  isSet?(flag: number): boolean;
};

function ccsReference(pointer: string | undefined): string | undefined {
  return pointer && CCSCRIPT_REFERENCE_PATTERN.test(pointer) ? pointer : undefined;
}

function entryHasAuthoredBehavior(entry: NpcInteraction | undefined): boolean {
  return Boolean(entry && (
    entry.give !== undefined ||
    entry.shop !== undefined ||
    entry.service !== undefined ||
    entry.cost !== undefined ||
    entry.heal !== undefined ||
    entry.save === true
  ));
}

function mergedCcsBehaviorEvents(
  reference: string,
  scripts: ScriptCollection | undefined,
  flags: FlagReader
): GameEvent[] {
  if (!scripts) {
    return [];
  }
  const resolved = resolveScriptEvents(scripts, reference, {}, {
    flags: { isSet: (flag) => Boolean(flags.isSet?.(flag)) }
  });
  const effects = resolved?.effects ?? [];
  const shopIds = new Set<number>();
  const referenceStoreId = EB_SHOP_STORE_BY_REFERENCE.get(reference);
  if (referenceStoreId !== undefined && effects.some(isShopSelectorEffect)) {
    shopIds.add(referenceStoreId);
  }
  return [...shopIds]
    .sort((a, b) => a - b)
    .map((storeId) => ({ kind: "shop" as const, storeId }));
}

function isShopSelectorEffect(effect: EventEffect): boolean {
  return effect.kind === "shop" || effect.kind === "setFlag";
}

export function interactionEntryEvents(
  entry: NpcInteraction | undefined,
  options: {
    fallbackReference?: string;
    dialogueLibrary?: DialogueLibraryLookup;
    suppressOneTimeEffects?: boolean;
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
  if (entry.give !== undefined && !(entry.give.once && options.suppressOneTimeEffects)) {
    events.push({ kind: "give", char: entry.give.char, item: entry.give.item });
  }
  if (entry.shop !== undefined) {
    events.push({ kind: "shop", storeId: entry.shop });
  }
  if (entry.service !== undefined) {
    events.push({
      kind: "service",
      service: entry.service,
      ...(entry.cost !== undefined ? { cost: entry.cost } : {})
    });
  }
  if (entry.service === undefined && entry.cost !== undefined && entry.cost > 0) {
    events.push({ kind: "money", op: "take", amount: entry.cost });
  }
  if (entry.heal === true || entry.heal === "full") {
    events.push({ kind: "heal", scope: "full" });
  }
  if (entry.save === true) {
    events.push({ kind: "save" });
  }
  return events;
}

export function addedNpcInteractionEvents(
  npc: { npcId: number; interaction?: NpcInteraction },
  dialogueLibrary?: DialogueLibraryLookup,
  flags?: FlagReader
): GameEvent[] {
  const flag = talkedFlag(npc.npcId);
  const events = interactionEntryEvents(npc.interaction, {
    dialogueLibrary,
    suppressOneTimeEffects: flags?.has(flag) ?? false
  });
  if (events.length === 0) {
    return [];
  }
  return [
    ...events,
    { kind: "setFlag", flag }
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
      case "service":
        if (dispatcher.isDialogueActive()) {
          dispatcher.deferService(event.service, event.cost);
        } else {
          dispatcher.openService(event.service, event.cost);
        }
        break;
      case "heal":
        dispatcher.heal(event.scope);
        break;
      case "save":
        dispatcher.save();
        break;
      case "give":
        dispatcher.give(event.char, event.item);
        break;
      case "money":
        dispatcher.money(event.op, event.amount);
        break;
    }
  }
}

export function interactionEvents(
  npc: { npcId: number; eventFlag?: number; textPointer?: string; textPointer2?: string },
  fallbackReference: string,
  flags: FlagReader,
  customDialogue?: CustomDialogueLookup,
  dialogueLibrary?: DialogueLibraryLookup,
  scripts?: ScriptCollection
): GameEvent[] {
  const flag = talkedFlag(npc.npcId);
  const hasEventFlag = npc.eventFlag !== undefined && npc.eventFlag > 0;
  const useTextPointer2 = hasEventFlag
    ? Boolean(flags.isSet?.(npc.eventFlag as number))
    : flags.has(flag);
  const reference = (useTextPointer2 ? ccsReference(npc.textPointer2) : undefined)
    ?? ccsReference(npc.textPointer)
    ?? fallbackReference;
  const npcEntry = customDialogue?.byNpcId[String(npc.npcId)];
  const customEntry = (isGeneratedDrifellaBarkEntry(npcEntry) ? undefined : npcEntry)
    ?? customDialogue?.byTextPointer[reference];
  if (customEntry && !entryHasAuthoredBehavior(customEntry)) {
    const pages = resolveCustomDialoguePages(customEntry, dialogueLibrary);
    return [
      pages && pages.length > 0
        ? { kind: "dialogue" as const, reference, pages }
        : { kind: "dialogue" as const, reference },
      ...mergedCcsBehaviorEvents(reference, scripts, flags),
      { kind: "setFlag", flag }
    ];
  }
  return [
    ...interactionEntryEvents(customEntry, {
      fallbackReference: customEntry ? reference : undefined,
      dialogueLibrary,
      suppressOneTimeEffects: flags.has(flag)
    }),
    ...(customEntry ? [] : [{ kind: "dialogue" as const, reference }]),
    { kind: "setFlag", flag }
  ];
}
