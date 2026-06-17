import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AddedNpcsSchema,
  CustomDialogueSchema,
  SwagboundDialogueLibrarySchema,
  WorldChunkedSchema,
  FontCollectionSchema,
  ScriptCollectionSchema
} from "@eb/schemas";
import {
  addedNpcInteractionEvents,
  interactionEvents,
  type GameEvent,
  type FlagReader
} from "../src/eventRunner";
import { buildDialogueForReference } from "../src/loader";
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
const world = WorldChunkedSchema.parse(read("apps/game/public/generated/world.json"));
const font = FontCollectionSchema.parse(read("apps/game/public/generated/font.json"));
const scripts = ScriptCollectionSchema.parse(read("apps/game/public/generated/scripts.json"));

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
  it("wires interaction for all 81 added NPCs and resolves each to renderable dialogue", () => {
    expect(addedNpcs.npcs).toHaveLength(81);
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
