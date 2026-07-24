import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ITEM_WORKS_CARD_OUTPUT,
  MOVE_CARDS,
  canTeach,
  moveCardById,
  teachMoveCard
} from "../src/moveCards";
import type { OwnedMon } from "../src/monsModel";

const mon = (inherited: string[] = []): OwnedMon => ({
  registryId: "test-mon",
  level: 5,
  xp: 100,
  bond: 3,
  inherited
});

describe("move cards", () => {
  it("has complete card text, real ability ids, and no em dashes", () => {
    const generated = JSON.parse(
      readFileSync(
        new URL("../public/generated/mons/mon-abilities.json", import.meta.url),
        "utf8"
      )
    ) as { abilities: Record<string, unknown> };

    expect(MOVE_CARDS.length).toBeGreaterThanOrEqual(10);
    expect(MOVE_CARDS.length).toBeLessThanOrEqual(14);
    expect(new Set(MOVE_CARDS.map((card) => card.id)).size).toBe(MOVE_CARDS.length);

    for (const card of MOVE_CARDS) {
      expect(card.name.trim()).not.toBe("");
      expect(card.desc.trim()).not.toBe("");
      expect(card.abilityId.trim()).not.toBe("");
      expect(card.desc.includes(String.fromCharCode(8212))).toBe(false);
      expect(generated.abilities).toHaveProperty(card.abilityId);
    }
  });

  it("round-trips every card id", () => {
    for (const card of MOVE_CARDS) {
      expect(moveCardById(card.id)).toBe(card);
    }
    expect(moveCardById("move-card-missing")).toBeUndefined();
  });

  it("reports already-known for an ability in the known list", () => {
    const card = MOVE_CARDS[0];
    expect(canTeach(mon(), card, [card.abilityId])).toEqual({
      ok: false,
      reason: "already-known"
    });
    expect(canTeach(mon(), card, [])).toEqual({ ok: true });
  });

  it("also reports already-known for an inherited ability", () => {
    const card = MOVE_CARDS[0];
    expect(canTeach(mon([card.abilityId]), card, [])).toEqual({
      ok: false,
      reason: "already-known"
    });
  });

  it("appends without duplicating and does not mutate the input", () => {
    const card = MOVE_CARDS[0];
    const input = mon(["small-mend"]);
    const originalInherited = input.inherited;

    const taught = teachMoveCard(input, card);

    expect(taught).not.toBe(input);
    expect(taught.inherited).not.toBe(originalInherited);
    expect(taught.inherited).toEqual(["small-mend", card.abilityId]);
    expect(input.inherited).toEqual(["small-mend"]);

    const taughtAgain = teachMoveCard(taught, card);
    expect(taughtAgain).not.toBe(taught);
    expect(taughtAgain.inherited).toEqual(["small-mend", card.abilityId]);
    expect(taughtAgain.inherited.filter((id) => id === card.abilityId)).toHaveLength(1);
    expect(taught.inherited).toEqual(["small-mend", card.abilityId]);
  });

  it("only exposes existing cards as Item Works output", () => {
    expect(ITEM_WORKS_CARD_OUTPUT.length).toBeGreaterThan(MOVE_CARDS.length / 2);
    for (const id of ITEM_WORKS_CARD_OUTPUT) {
      expect(moveCardById(id), id).toBeDefined();
    }
  });
});
