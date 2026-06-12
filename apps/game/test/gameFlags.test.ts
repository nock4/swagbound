import { describe, expect, it } from "vitest";
import { GameFlags, talkedFlag } from "../src/gameFlags";

describe("GameFlags", () => {
  it("sets, checks, lists, and clears session flags", () => {
    const flags = new GameFlags();

    expect(flags.has("npc:745:talked")).toBe(false);

    flags.set("npc:745:talked");
    flags.set("npc:745:talked");
    flags.set("quest:sample");

    expect(flags.has("npc:745:talked")).toBe(true);
    expect(flags.has("missing")).toBe(false);
    expect(flags.list()).toEqual(["npc:745:talked", "quest:sample"]);

    flags.clear();

    expect(flags.has("npc:745:talked")).toBe(false);
    expect(flags.list()).toEqual([]);
  });
});

describe("talkedFlag", () => {
  it("returns the canonical NPC talked flag", () => {
    expect(talkedFlag(745)).toBe("npc:745:talked");
  });
});
