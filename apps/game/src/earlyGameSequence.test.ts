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
  // 2026-07-18: the hill cast is six Milady manifestations, each saying only the
  // one word; a lone Little Swag World traveler on the path names the confusion.
  "witness-1": ["milady"],
  "witness-2": ["milady"],
  "witness-3": ["milady"],
  "meteor-manifestation": ["milady"],
  "mifella-going-home": [
    "MiFella: I got my picture. Let's go home, Bosch.",
    "MiFella: It's so late. We should be home and asleep."
  ],
  "home-scene": [
    "MiFella replays his photos of the crowd.",
    "MiFella echoes the word once under his breath.",
    "Everyone up there felt so together."
  ],
  "mifella-outside": [
    "MiFella: There you are! It came down on the hill, I watched it happen!",
    "MiFella: Come on, follow me!"
  ],
  "meteor-inspect": [
    "The meteor sits in its crater, still warm.",
    "If you lean close, the hum almost sorts itself into a word."
  ],
  "witness-4": ["milady"],
  "witness-5": ["milady"],
  "lsw-witness": [
    "A traveler in a Little Swag World bucket hat has stopped dead on the path, staring up at the ring of figures around the crater.",
    "\"Twin. TWIN. What ARE those things? They just stand there saying the one word at the rock. 'milady.' Over and over.\"",
    "\"I came up from the source world this morning. I have never heard that word in my life. So why does it sound like it already knows mine?\""
  ],
  // Strawberry prologue prop examine lines (bedroom).
  "prologue-cake": ["The cake leans like it gave up halfway through being a cake."],
  "prologue-corner": ["A corner of the cake, on the floor. The five second rule feels generous tonight."],
  "prologue-picture": ["The picture hangs a little crooked. It always does. You always fix it."],
  "prologue-mifella": ["MiFella, mid-laugh about something. For tonight, nothing is wrong."]
} as const;

// 910200-910205 = original night cast; 910206 = MiFella outside the house
// (dashes uphill); 910207 = the landed meteor prop. 2026-07-18: 910208/910209 =
// two more meteor Miladys (six total); 910210 = the LSW traveler on the path.
const NIGHT_CAST_IDS = [910200, 910201, 910202, 910203, 910204, 910205] as const;
// 2026-07-19: 910220-910223 are the STRAWBERRY prologue props (cake, fallen corner,
// crooked picture, MiFella actor) - bedroom actors that share the opening allowlist so
// they survive the pre-wake phase gate; gated to spawn only on the `prologue:active` flag.
const OWNED_NPC_IDS = [
  ...NIGHT_CAST_IDS, 910206, 910207, 910208, 910209, 910210,
  910220, 910221, 910222, 910223
] as const;

describe("early game sequence ownership", () => {
  it("preserves exact draft copy and ownership", () => {
    expect(typeof sequence.phaseGatesEnabled).toBe("boolean");
    expect(sequence.dialogue).toEqual(OPENING_DIALOGUE);
    expect(sequence.ownership.dialogueKeys).toEqual(Object.keys(OPENING_DIALOGUE));
    expect(sequence.ownership.npcIds).toEqual(OWNED_NPC_IDS);
    expect(sequence.nightCast?.allowNpcIds).toEqual(OWNED_NPC_IDS);
    expect(sequence.ownership.spriteOverrideNpcIds).toEqual([
      14, 15, 16, 21, ...OWNED_NPC_IDS
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

    for (const npcId of OWNED_NPC_IDS) {
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
    // Six manifestations on the hill (each saying the one word) + the traveler
    // repeating it once = seven lowercase "milady", zero capitalized.
    expect(playerFacingText.match(/\bmilady\b/g) ?? []).toHaveLength(7);
    expect(playerFacingText.match(/\bMilady\b/g) ?? []).toHaveLength(0);
  });

  it("schema-validates and casts the owned opening actors with shared dialogue refs", () => {
    const nightCast = addedNpcs.npcs.filter((npc) => OWNED_NPC_IDS.includes(npc.id as never));
    const expectedSprites: Record<string, string> = {
      "910200": "assets/swagbound/overworld-npc/mifella-001-ow.png",
      // 2026-07-18: the crater is ringed by six distinct Milady manifestations
      // (910201-910204 + 910208-910209); 910210 is the LSW traveler.
      "910201": "assets/swagbound/overworld-npc/malady-002-ow.png",
      "910202": "assets/swagbound/overworld-npc/malady-005-ow.png",
      "910203": "assets/swagbound/overworld-npc/gns-malady-003-ow.png",
      "910204": "assets/swagbound/overworld-npc/malady-001-ow.png",
      "910205": "assets/swagbound/overworld-npc/mifella-001-ow.png",
      "910206": "assets/swagbound/overworld-npc/mifella-001-ow.png",
      "910207": "assets/swagbound/props/meteor-ow.png",
      "910208": "assets/swagbound/overworld-npc/gns-malady-001-ow.png",
      "910209": "assets/swagbound/overworld-npc/gns-malady-002-ow.png",
      "910210": "assets/swagbound/overworld-npc/gns-lsw-312-ow.png",
      // Strawberry prologue props (bedroom).
      "910220": "assets/swagbound/props/strawberry-cake.png",
      "910221": "assets/swagbound/props/strawberry-corner.png",
      "910222": "assets/swagbound/props/crooked-picture.png",
      "910223": "assets/swagbound/overworld-npc/mifella-001-ow.png"
    };
    const expectedBlockFlags: Record<string, string[] | undefined> = {
      "910206": ["intro:outside-dash-done", "intro:morning"],
      // The landed meteor stays on the hill permanently.
      "910207": undefined,
      // Strawberry prologue props vanish once the prologue is done.
      "910220": ["prologue:done"],
      "910221": ["prologue:done"],
      "910222": ["prologue:done"],
      "910223": ["prologue:done"]
    };

    expect(nightCast.map((npc) => npc.id)).toEqual(OWNED_NPC_IDS);
    for (const npc of nightCast) {
      const key = String(npc.id);
      expect(npc.blockFlags, `npc ${key}`).toEqual(
        key in expectedBlockFlags ? expectedBlockFlags[key] : ["intro:morning"]
      );
      expect(baseSpriteOverrides.byNpcId?.[key]?.image).toBe(expectedSprites[key]);
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
      "intro2-dawn",
      "intro2-outside-dash"
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
