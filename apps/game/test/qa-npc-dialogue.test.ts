import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AddedNpcsSchema,
  CustomDialogueSchema,
  DrifellaBarksSchema,
  SwagboundDialogueLibrarySchema,
  WorldChunkedSchema,
  FontCollectionSchema,
  ScriptCollectionSchema
} from "@eb/schemas";
import {
  EB_SHOP_STORE_BY_REFERENCE,
  addedNpcInteractionEvents,
  interactionEvents,
  type GameEvent,
  type FlagReader
} from "../src/eventRunner";
import { buildCustomDialogueWithDrifellaBarks, buildDialogueForReference } from "../src/loader";
import { isGeneratedDrifellaBarkEntry } from "../src/customDialogueLookup";
import { drifellaBarkForNpcId } from "../src/drifellaBarks";
import { measureBitmapTextForFontId } from "../src/bitmapFont";
import {
  dialogueWindowRect,
  dialogueTextWidth,
  ebTextLineHeight,
  EB_UI_SCALE,
  EB_BITMAP_TEXT_SCALE,
  EB_TEXT_LINE_SPACING
} from "../src/windowLayout";

// ---------------------------------------------------------------------------
// Fixtures: committed Swagbound content + gitignored generated EB data.
// These probes exercise the live resolution order in eventRunner.ts:
//   custom-dialogue byNpcId -> byTextPointer -> added-npc pages/ref -> EB textPointer
// No EarthBound strings are embedded; only numeric ids + Swagbound ref keys.
// ---------------------------------------------------------------------------
const read = (rel: string) => JSON.parse(readFileSync(resolve(rel), "utf8"));

const customDialogue = CustomDialogueSchema.parse(read("content/custom-dialogue.json"));
const dialogueLibrary = SwagboundDialogueLibrarySchema.parse(read("content/swagbound-dialogue-library.json"));
const addedNpcs = AddedNpcsSchema.parse(read("content/added-npcs.json"));
const drifellaBarks = DrifellaBarksSchema.parse(read("content/drifella-barks.json"));
const world = WorldChunkedSchema.parse(read("apps/game/public/generated/world.json"));
const font = FontCollectionSchema.parse(read("apps/game/public/generated/font.json"));
const scripts = ScriptCollectionSchema.parse(read("apps/game/public/generated/scripts.json"));
const runtimeCustomDialogue = buildCustomDialogueWithDrifellaBarks(customDialogue, world.npcs, drifellaBarks);

const customLookup = { byNpcId: customDialogue.byNpcId, byTextPointer: customDialogue.byTextPointer };
const libLookup = { entries: dialogueLibrary.entries };
const FALLBACK_REFERENCE = "data_00.l_fallback";
const unsetFlags: FlagReader = { has: () => false, isSet: () => false };

function describeDialogue(events: readonly GameEvent[]): {
  hasRenderableDialogue: boolean;
  shopIds: number[];
} {
  let hasRenderableDialogue = false;
  const shopIds: number[] = [];
  for (const event of events) {
    if (event.kind === "dialogue") {
      if (event.pages && event.pages.length > 0) {
        hasRenderableDialogue = true;
      } else if (event.reference) {
        // EB fallback reference must resolve to real script text.
        const pages = buildDialogueForReference(scripts, event.reference);
        const joined = pages.map((page) => page.text).join("");
        const failed =
          joined.includes("No imported script text") || joined.includes("could not be loaded");
        if (!failed) {
          hasRenderableDialogue = true;
        }
      }
    } else if (event.kind === "shop") {
      shopIds.push(event.storeId);
    }
  }
  return { hasRenderableDialogue, shopIds };
}

describe("qa npc-dialogue: authored content resolution", () => {
  it("wires interaction for every added NPC and resolves each to renderable dialogue", () => {
    // The added-NPC roster grows as zones are promoted; assert a sane floor rather than an exact
    // snapshot, and keep the real invariant below (every added NPC resolves to renderable dialogue).
    expect(addedNpcs.npcs.length).toBeGreaterThanOrEqual(88);
    const broken: number[] = [];
    for (const npc of addedNpcs.npcs) {
      expect(npc.interaction, `added npc ${npc.id} has no interaction`).toBeDefined();
      const events = addedNpcInteractionEvents(
        { npcId: npc.id, interaction: npc.interaction },
        libLookup
      );
      if (!describeDialogue(events).hasRenderableDialogue) {
        broken.push(npc.id);
      }
    }
    expect(broken, "added NPCs resolving to no renderable dialogue").toEqual([]);
  });

  it("resolves every custom-dialogue ref against the dialogue library", () => {
    const libraryKeys = new Set(Object.keys(dialogueLibrary.entries));
    const unresolved: string[] = [];
    const collectRef = (location: string, ref: string | undefined) => {
      if (ref && !libraryKeys.has(ref)) {
        unresolved.push(`${location} -> ${ref}`);
      }
    };
    for (const [id, entry] of Object.entries(customDialogue.byNpcId)) {
      collectRef(`byNpcId.${id}`, entry.ref);
    }
    for (const [pointer, entry] of Object.entries(customDialogue.byTextPointer)) {
      collectRef(`byTextPointer.${pointer}`, entry.ref);
    }
    for (const npc of addedNpcs.npcs) {
      collectRef(`added.${npc.id}`, npc.interaction?.ref);
    }
    expect(unresolved).toEqual([]);
  });

  it("wires the shop clerks (404 / 749) to override dialogue plus their stores", () => {
    const sal = world.npcs.find((npc) => npc.npcId === 404 && npc.interactable);
    const morrow = world.npcs.find((npc) => npc.npcId === 749 && npc.interactable);
    expect(sal, "EB npc 404 (item shop clerk) missing/non-interactable").toBeDefined();
    expect(morrow, "EB npc 749 (grocery clerk) missing/non-interactable").toBeDefined();

    const salEvents = interactionEvents(sal!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    const morrowEvents = interactionEvents(morrow!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    const salResolved = describeDialogue(salEvents);
    const morrowResolved = describeDialogue(morrowEvents);

    expect(salResolved.hasRenderableDialogue).toBe(true);
    expect(salResolved.shopIds).toEqual([1]);
    expect(morrowResolved.hasRenderableDialogue).toBe(true);
    expect(morrowResolved.shopIds).toEqual([4]);
  });

  it("preserves Buy/Sell routing for every EB shop clerk with custom dialogue", () => {
    const checked: Array<{ npcId: number; storeId: number }> = [];
    const broken: Array<{ npcId: number; storeId: number; actual: number[] }> = [];
    for (const npc of world.npcs) {
      if (!npc.interactable || npc.visible === false || !npc.textPointer) {
        continue;
      }
      const storeId = EB_SHOP_STORE_BY_REFERENCE.get(npc.textPointer);
      if (storeId === undefined) {
        continue;
      }
      const events = interactionEvents(npc, FALLBACK_REFERENCE, unsetFlags, runtimeCustomDialogue, libLookup, scripts);
      const shopIds = describeDialogue(events).shopIds;
      checked.push({ npcId: npc.npcId, storeId });
      if (!shopIds.includes(storeId)) {
        broken.push({ npcId: npc.npcId, storeId, actual: shopIds });
      }
    }

    expect(checked).toHaveLength(45);
    expect(new Set(checked.map((entry) => entry.storeId)).size).toBe(42);
    expect(broken).toEqual([]);
  });

  it("wires hospital, hotel, and phone NPCs to service events", () => {
    const hospital = world.npcs.find((npc) => npc.npcId === 115 && npc.interactable);
    const hotel = world.npcs.find((npc) => npc.npcId === 58 && npc.interactable);
    const phone = world.npcs.find((npc) => npc.npcId === 60 && npc.interactable);
    expect(hospital, "EB npc 115 (hospital greeter) missing/non-interactable").toBeDefined();
    expect(hotel, "EB npc 58 (hotel clerk) missing/non-interactable").toBeDefined();
    expect(phone, "EB npc 60 (phone) missing/non-interactable").toBeDefined();

    const hospitalEvents = interactionEvents(hospital!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    const hotelEvents = interactionEvents(hotel!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    const phoneEvents = interactionEvents(phone!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);

    expect(describeDialogue(hospitalEvents).hasRenderableDialogue).toBe(true);
    expect(hospitalEvents.map((event) => event.kind)).toEqual(["dialogue", "service", "setFlag"]);
    expect(hospitalEvents.find((event) => event.kind === "service")).toEqual({ kind: "service", service: "hospital" });

    expect(describeDialogue(hotelEvents).hasRenderableDialogue).toBe(true);
    expect(hotelEvents.map((event) => event.kind)).toEqual(["dialogue", "service", "setFlag"]);
    expect(hotelEvents.find((event) => event.kind === "service")).toEqual({ kind: "service", service: "hotel", cost: 100 });

    expect(describeDialogue(phoneEvents).hasRenderableDialogue).toBe(true);
    expect(phoneEvents.map((event) => event.kind)).toEqual(["dialogue", "service", "setFlag"]);
    expect(phoneEvents.find((event) => event.kind === "service")).toEqual({ kind: "service", service: "phone" });
  });

  it("wires the opening-house proof-token bowl to dialogue and a one-time charm handoff", () => {
    const bowl = world.npcs.find((npc) => npc.npcId === 35 && npc.interactable);
    expect(bowl, "EB npc 35 (proof-token bowl) missing/non-interactable").toBeDefined();

    const firstEvents = interactionEvents(bowl!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    expect(describeDialogue(firstEvents).hasRenderableDialogue).toBe(true);
    expect(firstEvents.map((event) => event.kind)).toEqual(["dialogue", "give", "setFlag"]);
    expect(firstEvents.find((event) => event.kind === "give")).toEqual({
      kind: "give",
      char: 1,
      item: 54
    });

    const repeatFlags: FlagReader = { has: (flag) => flag === "npc:35:talked", isSet: () => false };
    const repeatEvents = interactionEvents(bowl!, FALLBACK_REFERENCE, repeatFlags, customLookup, libLookup);
    expect(repeatEvents.map((event) => event.kind)).toEqual(["dialogue", "setFlag"]);
  });

  it("wires the named neighbor (added NPC 100102 / Bonkle) through a library ref", () => {
    const bonkle = addedNpcs.npcs.find((npc) => npc.id === 100102);
    expect(bonkle?.interaction?.ref).toBe("interior:neighbor-house-v0");
    const events = addedNpcInteractionEvents(
      { npcId: bonkle!.id, interaction: bonkle!.interaction },
      libLookup
    );
    expect(describeDialogue(events).hasRenderableDialogue).toBe(true);
  });

  it("applies byTextPointer overrides on EB NPCs whose pointer matches an authored beat", () => {
    // EB npc 143 carries textPointer data_20.l_0xc65efc which has a byTextPointer override.
    const npc = world.npcs.find((entry) => entry.npcId === 143 && entry.interactable);
    expect(npc, "EB npc 143 expected to be interactable").toBeDefined();
    const overrideKey = npc!.textPointer;
    expect(overrideKey && customDialogue.byTextPointer[overrideKey]).toBeTruthy();
    const events = interactionEvents(npc!, FALLBACK_REFERENCE, unsetFlags, customLookup, libLookup);
    const dialogue = events.find((event) => event.kind === "dialogue");
    expect(dialogue && "pages" in dialogue && dialogue.pages && dialogue.pages.length > 0).toBeTruthy();
  });

  it("covers every world NPC with an authored override or generated Drifella bark", () => {
    const missing: number[] = [];
    let authoredByNpcId = 0;
    let authoredByTextPointer = 0;
    let generated = 0;

    for (const npc of world.npcs) {
      const key = String(npc.npcId);
      const entry = runtimeCustomDialogue.byNpcId[key];
      if (!entry) {
        missing.push(npc.npcId);
        continue;
      }
      if (customDialogue.byNpcId[key]) {
        authoredByNpcId += 1;
        expect(entry).toBe(customDialogue.byNpcId[key]);
        continue;
      }
      if (npc.textPointer && customDialogue.byTextPointer[npc.textPointer]) {
        authoredByTextPointer += 1;
        continue;
      }

      generated += 1;
      expect(isGeneratedDrifellaBarkEntry(entry)).toBe(true);
      expect(entry.pages).toEqual([drifellaBarkForNpcId(npc.npcId, drifellaBarks.phrases)]);
    }

    expect(missing).toEqual([]);
    expect(authoredByNpcId + authoredByTextPointer + generated).toBe(world.npcs.length);
    // Sanity floor only: authoring dialogue MOVES NPCs from generated to authored,
    // so this count falls as voicing progresses (886 as of 2026-07-13). The real
    // invariants are the two asserts above (nothing missing, full coverage). The
    // floor just catches the bark generator dying outright.
    expect(generated).toBeGreaterThan(500);
  });
});

describe("qa npc-dialogue: dialogue-box fit at native viewport", () => {
  // Native EarthBound viewport is 512x448; the dialogue window shows 4 lines.
  const VISIBLE_LINES = 4;
  const PAD_X = 12 * EB_UI_SCALE;
  const PAD_Y = 9 * EB_UI_SCALE;
  const lineHeight = ebTextLineHeight({ lineSpacing: EB_TEXT_LINE_SPACING });
  const rect = dialogueWindowRect({
    screen: { width: 512, height: 448 },
    sideMargin: 8 * EB_UI_SCALE,
    bottomMargin: 8 * EB_UI_SCALE,
    paddingX: PAD_X,
    paddingY: PAD_Y,
    lineHeight,
    visibleLines: VISIBLE_LINES
  });
  const textWidth = dialogueTextWidth(rect, PAD_X);

  const wrappedLineCount = (text: string): number =>
    measureBitmapTextForFontId(font, font.primaryFontId, text, {
      scale: EB_BITMAP_TEXT_SCALE,
      maxWidth: textWidth,
      lineSpacing: EB_TEXT_LINE_SPACING,
      lineHeight
    }).lineCount;

  const authoredPages: Array<{ location: string; text: string }> = [];
  for (const [id, entry] of Object.entries(customDialogue.byNpcId)) {
    entry.pages?.forEach((text, index) => authoredPages.push({ location: `byNpcId.${id}#${index}`, text }));
  }
  for (const [pointer, entry] of Object.entries(customDialogue.byTextPointer)) {
    entry.pages?.forEach((text, index) => authoredPages.push({ location: `byTextPointer.${pointer}#${index}`, text }));
  }
  for (const [ref, entry] of Object.entries(dialogueLibrary.entries)) {
    entry.pages.forEach((text, index) => authoredPages.push({ location: `library.${ref}#${index}`, text }));
  }
  for (const npc of addedNpcs.npcs) {
    npc.interaction?.pages?.forEach((text, index) =>
      authoredPages.push({ location: `added.${npc.id}#${index}`, text })
    );
  }

  it("has authored pages to measure", () => {
    expect(authoredPages.length).toBeGreaterThan(100);
  });

  it("keeps every authored page within the 4-line dialogue window", () => {
    const overflowing = authoredPages
      .map((page) => ({ ...page, lines: wrappedLineCount(page.text) }))
      .filter((page) => page.lines > VISIBLE_LINES)
      .map((page) => `${page.location} (${page.lines} lines)`);
    expect(overflowing).toEqual([]);
  });
});

describe("qa npc-dialogue: EB fallback coverage", () => {
  it("resolves every interactable EB NPC textPointer to non-error script text", () => {
    const seen = new Set<string>();
    const unresolvable: string[] = [];
    for (const npc of world.npcs) {
      if (!npc.interactable || !npc.textPointer) {
        continue;
      }
      if (seen.has(npc.textPointer)) {
        continue;
      }
      seen.add(npc.textPointer);
      const pages = buildDialogueForReference(scripts, npc.textPointer);
      const joined = pages.map((page) => page.text).join("");
      if (joined.includes("No imported script text") || joined.includes("could not be loaded")) {
        unresolvable.push(`${npc.textPointer} (npc ${npc.npcId})`);
      }
    }
    expect(seen.size).toBeGreaterThan(500);
    expect(unresolvable).toEqual([]);
  });
});
