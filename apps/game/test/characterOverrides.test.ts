import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CharacterCollectionSchema, CharacterOverridesSchema } from "@eb/schemas";

describe("character override content", () => {
  it("parses and resolves the in-slice hero name", async () => {
    const characters = CharacterCollectionSchema.parse(JSON.parse(
      await readFile(resolve("apps/game/public/generated/characters.json"), "utf8")
    ));
    const overrides = CharacterOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/character-overrides.json"), "utf8")
    ));
    const hero = characters.characters.find((character) => character.id === 0);
    expect(hero).toBeDefined();
    expect(overrides.byCharId[String(hero!.id)]?.name).toBe("Bosch");
    expect(overrides.byCharId["1"]?.name).toBe("Cloak");
    expect(overrides.byCharId["2"]).toBeUndefined();
    expect(overrides.byCharId["3"]).toBeUndefined();
  });
});
