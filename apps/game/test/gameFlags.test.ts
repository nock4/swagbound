import { describe, expect, it } from "vitest";
import { GameFlags, flagAliasesFromMap, talkedFlag } from "../src/gameFlags";

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

  it("sets, unsets, lists, and clears numeric event flags", () => {
    const flags = new GameFlags();

    expect(flags.isSet(7)).toBe(false);
    expect(flags.listNums()).toEqual([]);

    flags.setNum(7);
    flags.setNum(3);
    flags.setNum(7);

    expect(flags.isSet(7)).toBe(true);
    expect(flags.isSet(3)).toBe(true);
    expect(flags.isSet(4)).toBe(false);
    expect(flags.listNums()).toEqual([3, 7]);

    flags.unsetNum(7);
    expect(flags.isSet(7)).toBe(false);
    expect(flags.listNums()).toEqual([3]);

    flags.clear();
    expect(flags.list()).toEqual([]);
    expect(flags.listNums()).toEqual([]);
  });
});

describe("talkedFlag", () => {
  it("returns the canonical NPC talked flag", () => {
    expect(talkedFlag(745)).toBe("npc:745:talked");
  });
});

describe("story-flag -> EB event-flag bridge", () => {
  it("setting an aliased story flag also raises its EB flags", () => {
    const flags = new GameFlags();
    flags.setAliases(new Map([["signal:clique_cleared", [64, 363]]]));
    flags.set("signal:clique_cleared");
    expect(flags.isSet(64)).toBe(true);
    expect(flags.isSet(363)).toBe(true);
    expect(flags.isSet(65)).toBe(false);
    flags.set("unmapped:flag");
    expect(flags.listNums()).toEqual([64, 363]);
  });

  it("back-fills EB flags for story flags set before aliases arrive (save restore order)", () => {
    const flags = new GameFlags();
    flags.set("signal:threshold_cleared");
    expect(flags.isSet(422)).toBe(false);
    flags.setAliases(new Map([["signal:threshold_cleared", [190, 422]]]));
    expect(flags.isSet(190)).toBe(true);
    expect(flags.isSet(422)).toBe(true);
  });

  it("flagAliasesFromMap adopts ebFlags and ignores candidates and empty entries", () => {
    const aliases = flagAliasesFromMap({
      entries: [
        { storyFlag: "a", ebFlags: [{ id: 12 }, { id: 14 }] },
        { storyFlag: "b", ebFlags: [] }
      ]
    });
    expect(aliases.get("a")).toEqual([12, 14]);
    expect(aliases.has("b")).toBe(false);
    expect(flagAliasesFromMap(undefined).size).toBe(0);
  });
});
