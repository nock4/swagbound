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
    expect(checks.checks.length).toBe(26);
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
