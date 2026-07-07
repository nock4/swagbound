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
    const names = new Set<string>();
    const rumorNpcUses = new Map<number, number>();
    for (const check of checks.checks) {
      expect(check.personality).toMatchObject({
        bit: expect.any(String),
        tic: expect.any(String)
      });
      expect(check.reactions.correct.length).toBeGreaterThanOrEqual(3);
      expect(check.reactions.cleared.length).toBeGreaterThanOrEqual(2);
      expect(check.reactions.failed.length).toBeGreaterThanOrEqual(2);

      const displayName = drifellaDisplayName(check);
      expect(check.drifellaName).toBe(displayName);
      expect(displayName.trim().split(/\s+/).length).toBeLessThanOrEqual(2);
      names.add(displayName);

      const binderHints = check.hints.filter((hint) => hint.kind === "binder");
      const rumorHints = check.hints.filter((hint) => hint.kind === "rumorNpc");
      expect(check.hints).toHaveLength(2);
      expect(binderHints).toHaveLength(1);
      expect(rumorHints).toHaveLength(1);
      const rumorHint = rumorHints[0];
      if (rumorHint?.kind !== "rumorNpc") {
        throw new Error(`${check.id} is missing a rumor NPC hint`);
      }
      expect(rumorHint.page).toEqual(expect.any(String));
      expect(rumorHint.page.trim().length).toBeGreaterThan(0);
      rumorNpcUses.set(rumorHint.npcId, (rumorNpcUses.get(rumorHint.npcId) ?? 0) + 1);

      expect(check.retry.checkpointAt).toBe(check.tier >= 3 ? 1 : null);
    }
    expect(names.size).toBe(checks.checks.length);
    expect(Math.max(...rumorNpcUses.values())).toBeLessThanOrEqual(2);
  });
});

function readGeneratedJson(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../public/generated/${file}`, import.meta.url), "utf8"));
}
