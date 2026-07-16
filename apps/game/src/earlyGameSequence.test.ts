import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AddedNpcsSchema,
  CutscenesSchema,
  EarlyGameSequenceSchema,
  OpeningClaritySchema,
  SpriteOverridesSchema
} from "@eb/schemas";
import {
  openingOwnedNpcEnabled,
  openingWakeCompletionFlags,
  openingWakeDialoguePages,
  resolveEarlyGameDialogueInteraction,
  suppressOwnedOpeningClarity
} from "./earlyGameSequence";
import { applyOpeningClaritySprites } from "./openingClarity";

const sequence = EarlyGameSequenceSchema.parse(readContent("early-game-sequence.json"));
const openingClarity = OpeningClaritySchema.parse(readContent("opening-clarity.json"));
const narrativeRedesign = OpeningClaritySchema.parse(readContent("narrative-redesign.json"));
const baseSpriteOverrides = SpriteOverridesSchema.parse(readContent("sprite-overrides.json"));
const addedNpcs = AddedNpcsSchema.parse(readContent("added-npcs.json"));
const cutscenes = CutscenesSchema.parse(readContent("cutscenes.json"));
const intro2Cutscenes = cutscenes.cutscenes.filter((cutscene) => cutscene.id.startsWith("intro2-"));

const OPENING_DIALOGUE = {
  wake: [
    "Bosch, get up! You gotta see this!",
    "Something came down on the hill. Meet me outside."
  ],
  "witness-1": ["It just fell. No sound. Things that fall make a sound."],
  "witness-2": ["Did anyone else hear it say something?"],
  "witness-3": ["I want to go home and I am not going home."],
  "meteor-manifestation": ["milady"],
  "mifella-going-home": ["Okay. Okay okay okay. Home. We should be home."],
  "home-scene": [
    "MiFella replays his photos of the crowd.",
    "MiFella echoes the word once under his breath.",
    "Everyone up there felt so together."
  ]
} as const;

const NIGHT_CAST_IDS = [910200, 910201, 910202, 910203, 910204, 910205] as const;

describe("early game sequence ownership", () => {
  it("preserves exact draft copy and ownership", () => {
    expect(typeof sequence.phaseGatesEnabled).toBe("boolean");
    expect(sequence.dialogue).toEqual(OPENING_DIALOGUE);
    expect(sequence.ownership.dialogueKeys).toEqual(Object.keys(OPENING_DIALOGUE));
    expect(sequence.ownership.npcIds).toEqual(NIGHT_CAST_IDS);
    expect(sequence.nightCast?.allowNpcIds).toEqual(NIGHT_CAST_IDS);
    expect(sequence.ownership.spriteOverrideNpcIds).toEqual([
      14, 15, 16, 21, ...NIGHT_CAST_IDS
    ]);
  });

  it("uses the authored wake only when gates are enabled and sets both completion markers", () => {
    const enabled = { ...sequence, phaseGatesEnabled: true };
    const disabled = { ...sequence, phaseGatesEnabled: false };

    expect(openingWakeDialoguePages(disabled)).toBeUndefined();
    expect(openingWakeCompletionFlags(disabled)).toEqual([]);
    expect(openingWakeDialoguePages(enabled)).toEqual(OPENING_DIALOGUE.wake);
    expect(openingWakeCompletionFlags(enabled)).toEqual([
      "intro:flyover-done",
      "intro:wake-done"
    ]);
  });

  it("gates owned opening NPC visibility on phaseGatesEnabled", () => {
    const enabled = { ...sequence, phaseGatesEnabled: true };
    const disabled = { ...sequence, phaseGatesEnabled: false };

    for (const npcId of NIGHT_CAST_IDS) {
      expect(openingOwnedNpcEnabled(disabled, npcId)).toBe(false);
      expect(openingOwnedNpcEnabled(enabled, npcId)).toBe(true);
    }
    expect(openingOwnedNpcEnabled(disabled, 102313)).toBe(true);
    expect(openingOwnedNpcEnabled(enabled, 102313)).toBe(true);
  });

  it("suppresses owned legacy sprite contributions before resolving overlays", () => {
    const suppressedOpeningClarity = suppressOwnedOpeningClarity(
      openingClarity,
      sequence,
      "opening-clarity",
      false
    );
    const suppressedNarrativeRedesign = suppressOwnedOpeningClarity(
      narrativeRedesign,
      sequence,
      "narrative-redesign",
      false
    );
    const resolved = applyOpeningClaritySprites(
      applyOpeningClaritySprites(baseSpriteOverrides, suppressedOpeningClarity),
      suppressedNarrativeRedesign
    );

    for (const npcId of sequence.ownership.spriteOverrideNpcIds.map(String)) {
      expect(suppressedOpeningClarity?.spriteOverrides.byNpcId).not.toHaveProperty(npcId);
      expect(suppressedNarrativeRedesign?.spriteOverrides.byNpcId).not.toHaveProperty(npcId);
      const suppressedContributions = [
        openingClarity.spriteOverrides.byNpcId[npcId],
        narrativeRedesign.spriteOverrides.byNpcId[npcId]
      ].filter((entry) => entry !== undefined);
      for (const contribution of suppressedContributions) {
        expect(resolved?.byNpcId?.[npcId]).not.toEqual(contribution);
      }
    }
  });

  it("keeps new opening caption and dialogue copy free of denied terms", () => {
    const cutscenePages = intro2Cutscenes.flatMap((cutscene) =>
      cutscene.steps.flatMap((step) => step.op === "dialogue" ? step.pages : [])
    );
    const playerFacingText = [
      ...sequence.flyover.captions,
      ...Object.values(sequence.dialogue).flat(),
      ...cutscenePages
    ].join("\n");
    const denied = [
      "derivative",
      "Remilia",
      "network",
      "Milady",
      "Public Version",
      "Public Bosch",
      "\u2014"
    ];

    for (const term of denied) {
      expect(playerFacingText).not.toContain(term);
    }
    expect(playerFacingText.match(/\bmilady\b/g) ?? []).toHaveLength(1);
    expect(playerFacingText.match(/\bMilady\b/g) ?? []).toHaveLength(0);
  });

  it("schema-validates and casts the six owned night actors with shared dialogue refs", () => {
    const nightCast = addedNpcs.npcs.filter((npc) => NIGHT_CAST_IDS.includes(npc.id as never));
    const expectedSprites: Record<string, string> = {
      "910200": "assets/swagbound/overworld-npc/mifella-001-ow.png",
      "910201": "assets/swagbound/overworld-npc/lsw-1038-ow.png",
      "910202": "assets/swagbound/overworld-npc/lsw-1120-ow.png",
      "910203": "assets/swagbound/overworld-npc/lsw-1144-ow.png",
      "910204": "assets/swagbound/overworld-npc/malady-001-ow.png",
      "910205": "assets/swagbound/overworld-npc/mifella-001-ow.png"
    };

    expect(nightCast.map((npc) => npc.id)).toEqual(NIGHT_CAST_IDS);
    for (const npc of nightCast) {
      expect(npc.blockFlags).toEqual(["intro:morning"]);
      expect(baseSpriteOverrides.byNpcId?.[String(npc.id)]?.image).toBe(expectedSprites[String(npc.id)]);
    }

    const manifestation = nightCast.find((npc) => npc.id === 910204);
    expect(manifestation?.interaction).toEqual({ ref: "meteor-manifestation" });
    expect(resolveEarlyGameDialogueInteraction(manifestation?.interaction, sequence)).toEqual({
      pages: ["milady"]
    });
    expect(JSON.stringify(nightCast).match(/\bmilady\b/g) ?? []).toHaveLength(0);
  });

  it("schema-validates the three intro2 cutscenes and their phase transitions", () => {
    expect(intro2Cutscenes.map((cutscene) => cutscene.id)).toEqual([
      "intro2-meteor-gathering",
      "intro2-home-scene",
      "intro2-dawn"
    ]);

    const meteor = intro2Cutscenes[0];
    expect(meteor.trigger).toEqual({
      kind: "area",
      area: { x: 1984, y: 32, w: 192, h: 192 }
    });
    expect(meteor.requireFlags).toEqual(["intro:wake-done"]);
    expect(meteor.blockFlags).toEqual(["intro:meteor-seen"]);
    expect(meteor.steps.at(-1)).toEqual({ op: "setFlag", flag: "intro:meteor-seen" });

    const home = intro2Cutscenes[1];
    expect(home.requireFlags).toEqual(["intro:meteor-seen"]);
    expect(home.blockFlags).toEqual(["intro:returned-home", "intro:morning"]);
    expect(home.steps[0]).toEqual({ op: "setFlag", flag: "intro:returned-home" });
    expect(home.steps).toContainEqual({
      op: "moveActor",
      actor: { npcId: 910205 },
      to: { x: 7784, y: 336 }
    });
    expect(home.steps.at(-1)).toEqual({ op: "setFlag", flag: "intro:home-scene-done" });

    const dawn = intro2Cutscenes[2];
    expect(dawn.requireFlags).toEqual(["intro:home-scene-done"]);
    expect(dawn.blockFlags).toEqual(["intro:morning"]);
    expect(dawn.steps).toContainEqual({ op: "setFlag", flag: "intro:morning" });
    expect(dawn.steps).toContainEqual({ op: "setFlag", flag: "signal:cold-signal-seen" });
  });

  it("rejects duplicate ownership and inline sprite overrides before build copy", () => {
    const duplicateOwnership = structuredClone(sequence);
    duplicateOwnership.ownership.spriteOverrideNpcIds.push(14);
    const inlineSpriteOverride = {
      ...sequence,
      spriteOverrides: { byNpcId: { "14": {} } }
    };

    expect(EarlyGameSequenceSchema.safeParse(duplicateOwnership).success).toBe(false);
    expect(EarlyGameSequenceSchema.safeParse(inlineSpriteOverride).success).toBe(false);
  });

  it("allowlists Bosch's exterior house door for the night route", () => {
    expect(sequence.nightDoors?.allowWorldPixels).toContainEqual([2648, 336]);
  });
});

function readContent(file: string): unknown {
  return JSON.parse(readFileSync(resolve("content", file), "utf8"));
}
