import { describe, expect, it } from "vitest";
import { equipBonusesForType, parseItemConfiguration } from "../src/itemsPsi";

describe("parseItemConfiguration equipment Argument", () => {
  it("captures the multi-line Argument list as a numeric array (not just Misc Flags)", () => {
    const yaml = [
      "17:",
      "  Action: 239",
      "  Argument:",
      "  - 110",
      "  - 0",
      "  - 0",
      "  - 1",
      "  Misc Flags:",
      "  - ness can use",
      "  Name: Legendary bat",
      "  Type: 16"
    ].join("\n");
    const entry = parseItemConfiguration(yaml).get(17);
    expect(entry?.argument).toEqual([110, 0, 0, 1]);
    expect(entry?.miscFlags).toEqual(["ness can use"]);
  });
});

describe("equipBonusesForType", () => {
  it("maps a weapon's Argument[0] to an offense bonus", () => {
    expect(equipBonusesForType(0x10, [110, 0, 0, 1])).toEqual({ offense: 110 });
  });

  it("maps armor's Argument[0] to a defense bonus", () => {
    expect(equipBonusesForType(0x1c, [40, 216, 13, 0])).toEqual({ defense: 40 });
  });

  it("returns undefined for a non-equippable item type", () => {
    expect(equipBonusesForType(0x00, [5, 0, 0, 0])).toBeUndefined();
  });

  it("returns undefined when there is no positive primary bonus", () => {
    expect(equipBonusesForType(0x10, [])).toBeUndefined();
    expect(equipBonusesForType(0x10, [0, 0, 0, 0])).toBeUndefined();
  });
});
