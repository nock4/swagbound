import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CardNftsSchema,
  DrifellaSourceChecksSchema
} from "@eb/schemas";
import { drifellaDisplayName } from "./sourceCheckModel";

describe("source check generated content", () => {
  it("parses the generated card registry and source checks with the committed schemas", () => {
    const cards = CardNftsSchema.parse(readGeneratedJson("card-nfts.json"));
    const checks = DrifellaSourceChecksSchema.parse(readGeneratedJson("drifella-source-checks.json"));

    expect(cards.cards.length).toBe(95);
    // 95 original Source Checks + 13 new ones for the overnight-regen Anchor96 Drifellas
    // (drifella2-6735.. etc.). The 13 reuse existing reward cards until 13 more cards are
    // intook into the registry (known card-supply follow-up), so the cardId-exists check
    // below still holds.
    expect(checks.checks.length).toBe(108);
    expect(checks.checks.every((check) => cards.cards.some((card) => card.id === check.rewards.cardId))).toBe(true);
    for (const check of checks.checks) {
      expect(check.personality).toMatchObject({
        bit: expect.any(String),
        tic: expect.any(String)
      });
      expect(check.reactions.correct.length).toBeGreaterThanOrEqual(3);
      expect(check.reactions.cleared.length).toBeGreaterThanOrEqual(2);
      expect(check.reactions.failed.length).toBeGreaterThanOrEqual(2);
      // Name is derived from the sprite id (single source of truth), not stored.
      expect(drifellaDisplayName(check)).toMatch(/^Drifella \d+$/);
    }
  });
});

function readGeneratedJson(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../public/generated/${file}`, import.meta.url), "utf8"));
}
