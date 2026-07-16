import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EarlyGameSequenceSchema,
  OpeningClaritySchema,
  SpriteOverridesSchema
} from "@eb/schemas";
import { suppressOwnedOpeningClarity } from "./earlyGameSequence";
import { applyOpeningClaritySprites } from "./openingClarity";

const sequence = EarlyGameSequenceSchema.parse(readContent("early-game-sequence.json"));
const openingClarity = OpeningClaritySchema.parse(readContent("opening-clarity.json"));
const narrativeRedesign = OpeningClaritySchema.parse(readContent("narrative-redesign.json"));
const baseSpriteOverrides = SpriteOverridesSchema.parse(readContent("sprite-overrides.json"));

describe("early game sequence ownership", () => {
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
    const playerFacingText = [
      ...sequence.flyover.captions,
      ...Object.values(sequence.dialogue).flat()
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
});

function readContent(file: string): unknown {
  return JSON.parse(readFileSync(resolve("content", file), "utf8"));
}
