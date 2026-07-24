import { describe, expect, it } from "vitest";
import {
  Compendium,
  validateCompendiumSnapshot,
  type CompendiumSaveSnapshot
} from "../src/compendium";
import { monXpForLevel, type OwnedMon } from "../src/monsModel";

function ownedMon(registryId: string, level: number, inherited: string[] = []): OwnedMon {
  return {
    registryId,
    level,
    xp: monXpForLevel(level),
    bond: 12,
    inherited
  };
}

describe("Compendium", () => {
  it("keeps the highest level, unions inherited moves, and counts ownership", () => {
    const compendium = new Compendium();
    compendium.register(ownedMon("mon:pixie", 8, ["move:heal", "move:wind"]));
    compendium.register(ownedMon("mon:pixie", 14, ["move:wind", "move:ice"]));
    compendium.register(ownedMon("mon:pixie", 6, ["move:fire"]));

    expect(compendium.count()).toBe(1);
    expect(compendium.has("mon:pixie")).toBe(true);
    expect(compendium.get("mon:pixie")).toEqual({
      registryId: "mon:pixie",
      level: 14,
      inherited: ["move:heal", "move:wind", "move:ice", "move:fire"],
      timesOwned: 3
    });
  });

  it("resummons a fresh mon at the registered level and skills with zero bond", () => {
    const compendium = new Compendium();
    compendium.register(ownedMon("mon:jack-frost", 18, ["move:bufu", "move:media"]));

    const first = compendium.resummon("mon:jack-frost");
    const second = compendium.resummon("mon:jack-frost");

    expect(first).toEqual({
      registryId: "mon:jack-frost",
      level: 18,
      xp: monXpForLevel(18),
      bond: 0,
      inherited: ["move:bufu", "move:media"]
    });
    expect(first).not.toBe(second);
    expect(first?.inherited).not.toBe(second?.inherited);
    expect(first).not.toHaveProperty("lineage");
    expect(compendium.resummon("mon:missing")).toBeUndefined();
    expect(compendium.count()).toBe(1);
  });

  it("scales resummon cost with level", () => {
    const compendium = new Compendium();
    const atLevel = (level: number) => ({
      registryId: `mon:level-${level}`,
      level,
      inherited: [],
      timesOwned: 1
    });

    expect(compendium.resummonCost(atLevel(1))).toBe(Math.round(40 + 1 * 1 * 1.5));
    expect(compendium.resummonCost(atLevel(10))).toBe(Math.round(40 + 10 * 10 * 1.5));
    expect(compendium.resummonCost(atLevel(20))).toBeGreaterThan(
      compendium.resummonCost(atLevel(10))
    );
  });

  it("round-trips a deep, registry-sorted snapshot", () => {
    const source = new Compendium();
    source.register(ownedMon("mon:zeta", 5, ["move:z"]));
    source.register(ownedMon("mon:alpha", 9, ["move:a"]));
    const snapshot = source.snapshot();

    expect(snapshot.entries.map((entry) => entry.registryId)).toEqual(["mon:alpha", "mon:zeta"]);

    const restored = new Compendium();
    restored.restore(snapshot);
    expect(restored.snapshot()).toEqual(snapshot);

    snapshot.entries[0].inherited.push("move:mutated");
    expect(restored.get("mon:alpha")?.inherited).toEqual(["move:a"]);
    restored.restore(undefined);
    expect(restored.snapshot()).toEqual({ entries: [] });
  });
});

describe("validateCompendiumSnapshot", () => {
  it.each([
    ["missing registryId", { entries: [{ level: 1, inherited: [], timesOwned: 1 }] }],
    ["empty registryId", { entries: [{ registryId: "", level: 1, inherited: [], timesOwned: 1 }] }],
    ["level zero", { entries: [{ registryId: "mon:a", level: 0, inherited: [], timesOwned: 1 }] }],
    ["bad level type", { entries: [{ registryId: "mon:a", level: "1", inherited: [], timesOwned: 1 }] }],
    ["bad inherited type", { entries: [{ registryId: "mon:a", level: 1, inherited: "move:a", timesOwned: 1 }] }],
    ["bad inherited item", { entries: [{ registryId: "mon:a", level: 1, inherited: [7], timesOwned: 1 }] }],
    ["bad timesOwned type", { entries: [{ registryId: "mon:a", level: 1, inherited: [], timesOwned: true }] }],
    ["timesOwned zero", { entries: [{ registryId: "mon:a", level: 1, inherited: [], timesOwned: 0 }] }],
    ["entries not an array", { entries: {} }]
  ])("rejects malformed input: %s", (_label, value) => {
    expect(validateCompendiumSnapshot(value)).toBeNull();
  });

  it("accepts a valid snapshot", () => {
    const snapshot: CompendiumSaveSnapshot = {
      entries: [
        {
          registryId: "mon:pixie",
          level: 12,
          inherited: ["move:heal", "move:wind"],
          timesOwned: 3
        }
      ]
    };

    expect(validateCompendiumSnapshot(snapshot)).toEqual(snapshot);
  });
});
