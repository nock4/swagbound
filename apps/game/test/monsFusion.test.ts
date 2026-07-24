import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MonAbilitiesSchema,
  MonFusionSchema,
  MonsRegistrySchema,
  type MonsRegistryEntry
} from "@eb/schemas";
import {
  createOwnedMon,
  executeFusion,
  monXpForLevel,
  resolveFusion,
  resolveFusionWithAccident
} from "../src/monsModel";

const registry = MonsRegistrySchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mons-registry.json"), "utf8")
));
const abilities = MonAbilitiesSchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-abilities.json"), "utf8")
));
const fusion = MonFusionSchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-fusion.json"), "utf8")
));

function byRace(race: string, tier?: number): MonsRegistryEntry {
  return registry.mons.find((mon) =>
    mon.race === race &&
    !mon.secretRare &&
    (tier === undefined || mon.tier === tier)
  )!;
}

function fusionParents() {
  const a = byRace("Angel", 2);
  const b = byRace("Demon", 2);
  return {
    a: { entry: a, owned: createOwnedMon(a) },
    b: { entry: b, owned: createOwnedMon(b) }
  };
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("advanced mon fusion mechanics", () => {
  it("adds sacrifice levels and its highest-tier eligible skill outside the normal pick cap", () => {
    const { a, b } = fusionParents();
    const normal = resolveFusion(a, b, registry, fusion, abilities, new Set());
    const sacrificeEntry = registry.mons.find((mon) =>
      mon.race === "Demon" &&
      !mon.secretRare &&
      mon.id !== b.entry.id &&
      mon.baseLevel <= 25
    )!;
    const sacrifice = {
      entry: sacrificeEntry,
      owned: createOwnedMon(sacrificeEntry, {
        level: 25,
        xp: monXpForLevel(25)
      })
    };

    const preview = resolveFusion(
      a,
      b,
      registry,
      fusion,
      abilities,
      new Set(),
      sacrifice
    );

    expect(preview.sacrifice).toBe(sacrifice);
    expect(preview.sacrificeBonus).toEqual({
      bonusLevels: 5,
      bonusSkill: "tantrum-royale"
    });
    expect(preview.projectedLevel).toBe(normal.projectedLevel! + 5);

    const normalPicks = preview.inheritable!.slice(0, 3);
    const fused = executeFusion(preview, normalPicks)!;
    expect(fused.owned.level).toBe(preview.projectedLevel);
    expect(fused.owned.inherited).toEqual([
      ...normalPicks.slice(0, 2),
      "tantrum-royale"
    ]);
  });

  it("keeps elementless and same-element abilities while excluding off-element inheritance", () => {
    const { a, b } = fusionParents();
    const basePreview = resolveFusion(a, b, registry, fusion, abilities, new Set());
    const resultElement = basePreview.result!.element;
    const elementless = Object.entries(abilities.abilities)
      .find(([, ability]) => ability.element === undefined)![0];
    const sameElement = Object.entries(abilities.abilities)
      .find(([, ability]) => ability.element === resultElement)![0];
    const offElement = Object.entries(abilities.abilities)
      .find(([, ability]) => ability.element !== undefined && ability.element !== resultElement)![0];
    const withAffinityMoves = {
      ...a,
      owned: {
        ...a.owned,
        inherited: [elementless, sameElement, offElement]
      }
    };

    const preview = resolveFusion(
      withAffinityMoves,
      b,
      registry,
      fusion,
      abilities,
      new Set()
    );

    expect(preview.inheritable).toContain(elementless);
    expect(preview.inheritable).toContain(sameElement);
    expect(preview.inheritable).not.toContain(offElement);
  });

  it("uses a seeded rng to force a deterministic stronger accident result", () => {
    const { a, b } = fusionParents();
    const normal = resolveFusion(a, b, registry, fusion, abilities, new Set());
    const forceAccident = () => resolveFusionWithAccident(
      a,
      b,
      registry,
      fusion,
      abilities,
      new Set(),
      undefined,
      seededRng(0x5eed),
      1
    );

    const accident = forceAccident();
    expect(accident.accident).toBe(true);
    expect(accident.result!.id).not.toBe(normal.result!.id);
    expect(accident.result!.race).toBe(normal.result!.race);
    expect(accident.result!.tier).toBe(normal.result!.tier + 1);
    expect(forceAccident()).toEqual(accident);
  });
});
