import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CharacterCollectionSchema, PsiCollectionSchema, PsiOverridesSchema } from "@eb/schemas";

describe("psi override content", () => {
  it("parses and covers in-slice learned skills with short replacement names", async () => {
    const psi = PsiCollectionSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/psi.json"), "utf8")
    ));
    const characters = CharacterCollectionSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/characters.json"), "utf8")
    ));
    const overrides = PsiOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/psi-overrides.json"), "utf8")
    ));
    const psiById = new Map(psi.psi.map((entry) => [entry.id, entry]));
    const startingLevelByCharId = new Map(characters.characters.map((entry) => [entry.id, entry.level]));
    const requiredIds = [...new Set([
      ...learnedIdsForCharAtOrBelowLevel(psi.psi, 0, 12),
      ...psi.psi
        .filter((entry) => entry.learnedBy.some((learned) => (startingLevelByCharId.get(learned.charId) ?? -1) >= learned.level))
        .map((entry) => entry.id)
    ])].sort((a, b) => a - b);

    const overrideIds = Object.keys(overrides.byPsiId).map(Number).sort((a, b) => a - b);
    expect(overrideIds).toEqual(expect.arrayContaining(requiredIds));
    expect(learnedIdsForCharAtOrBelowLevel(psi.psi, 0, 12)).toEqual([1, 23, 27, 31, 43]);
    expect(overrides.byPsiId["1"]?.name).toBe("Static");
    expect(overrides.byPsiId["23"]?.name).toBe("Wake Up");
    expect(overrides.byPsiId["27"]?.name).toBe("Decompile");
    expect(overrides.byPsiId["31"]?.name).toBe("Firewall");
    expect(overrides.byPsiId["43"]?.name).toBe("Lull");

    for (const id of overrideIds) {
      const override = overrides.byPsiId[String(id)];
      const generated = psiById.get(id);
      expect(generated, `override psi ${id} must resolve`).toBeDefined();
      expect(override).toBeDefined();
      if (override?.name === undefined) {
        continue;
      }
      expect(override.name.trim()).toBe(override.name);
      expect(override.name.length).toBeGreaterThan(0);
      expect(override.name.length).toBeLessThanOrEqual(18);
      expect(override.name).not.toMatch(/[@\u0000-\u001f\u007f]/);
      expect(override.name).not.toContain("/Users/");
      expect(override.name).not.toBe(generated?.name.trim());
      expect(override.name).not.toMatch(/^\[|[?]/);
      expect(override.name.toLowerCase()).not.toContain("psi");
    }
  });
});

function learnedIdsForCharAtOrBelowLevel(
  psiList: Array<{ id: number; learnedBy: Array<{ charId: number; level: number }> }>,
  charId: number,
  maxLevel: number
): number[] {
  return psiList
    .filter((entry) => entry.learnedBy.some((learned) => learned.charId === charId && learned.level <= maxLevel))
    .map((entry) => entry.id)
    .sort((a, b) => a - b);
}
