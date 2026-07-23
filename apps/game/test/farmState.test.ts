import { describe, expect, it } from "vitest";
import {
  DECOR_CATALOG,
  FARM_CATALOG,
  FarmState,
  type FarmBuildingKind,
  type FarmDecorKind
} from "../src/farmState";
import { GameFlags } from "../src/gameFlags";
import { PartyState } from "../src/partyState";
import {
  SAVE_STATE_SCHEMA_VERSION,
  applySaveState,
  captureSaveState,
  deserializeSaveState,
  serializeSaveState
} from "../src/saveState";

const FARM_BUILDING_KINDS: FarmBuildingKind[] = [
  "monBarn",
  "trainingYard",
  "itemWorks",
  "snackKitchen",
  "monBath",
  "gachaShrine",
  "billboard",
  "fusionAltar",
  "riddleArchive"
];

const FARM_DECOR_KINDS: FarmDecorKind[] = [
  "fenceH",
  "fenceV",
  "pathTile",
  "lamp",
  "statueMon",
  "topiary",
  "ranchFlag",
  "bench",
  "crate",
  "well"
];

describe("FarmState", () => {
  it("provides a sane catalog entry for every building and decor kind", () => {
    expect(Object.keys(FARM_CATALOG).sort()).toEqual([...FARM_BUILDING_KINDS].sort());
    expect(Object.keys(DECOR_CATALOG).sort()).toEqual([...FARM_DECOR_KINDS].sort());

    for (const kind of FARM_BUILDING_KINDS) {
      const entry = FARM_CATALOG[kind];
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.desc.length).toBeGreaterThan(0);
      expect(entry.desc).not.toContain("\u2014");
      expect(entry.price.length).toBeGreaterThanOrEqual(1);
      expect(entry.price.length).toBeLessThanOrEqual(3);
      expect(entry.price.every((price) => Number.isInteger(price) && price >= 0)).toBe(true);
      expect(entry.footprint.w).toBeGreaterThan(0);
      expect(entry.footprint.h).toBeGreaterThan(0);
      expect(entry.footprint.w % 8).toBe(0);
      expect(entry.footprint.h % 8).toBe(0);
      expect(entry.value).toBeGreaterThan(0);
    }

    for (const kind of FARM_DECOR_KINDS) {
      const entry = DECOR_CATALOG[kind];
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.desc.length).toBeGreaterThan(0);
      expect(entry.desc).not.toContain("\u2014");
      expect(entry.price).toBeGreaterThanOrEqual(10);
      expect(entry.price).toBeLessThanOrEqual(60);
      expect(entry.footprint.w).toBeGreaterThan(0);
      expect(entry.footprint.h).toBeGreaterThan(0);
      expect(entry.footprint.w % 8).toBe(0);
      expect(entry.footprint.h % 8).toBe(0);
      expect(entry.value).toBeGreaterThan(0);
    }
  });

  it("handles coins, placement, upgrades, assignments, progress, and removal", () => {
    const farm = new FarmState();
    farm.addCoins(600);
    expect(farm.spendCoins(125)).toBe(true);
    expect(farm.swagCoins).toBe(475);
    expect(farm.spendCoins(500)).toBe(false);
    expect(farm.swagCoins).toBe(475);

    const barn = farm.placeBuilding("monBarn", { x: 11, y: 19 });
    const works = farm.placeBuilding("itemWorks", { x: 80, y: 96 });
    const kitchen = farm.placeBuilding("snackKitchen", { x: 160, y: 96 });
    const lamp = farm.placeDecor("lamp", { x: 21, y: 35 });
    expect(barn).toMatchObject({ id: "b1", tier: 1, cell: { x: 8, y: 16 } });
    expect(works.id).toBe("b2");
    expect(kitchen.id).toBe("b3");
    expect(lamp).toMatchObject({ id: "d1", cell: { x: 24, y: 32 } });

    expect(farm.upgradeBuilding(barn.id)).toBe(true);
    expect(farm.upgradeBuilding(barn.id)).toBe(true);
    expect(farm.upgradeBuilding(barn.id)).toBe(false);
    expect(farm.buildingById(barn.id)?.tier).toBe(3);

    expect(farm.assignMon(barn.id, "mon:cozy")).toBe(true);
    expect(farm.assignMon(works.id, "mon:cozy")).toBe(false);
    expect(farm.recallMon(barn.id, "mon:missing")).toBe(false);
    expect(farm.recallMon(barn.id, "mon:cozy")).toBe(true);
    expect(farm.assignMon(works.id, "mon:cozy")).toBe(true);
    expect(farm.recallMon("mon:cozy")).toBe(true);
    expect(farm.assignMon(works.id, "mon:cozy")).toBe(true);

    works.jobRecipeId = "recipe:useful-thing";
    farm.tickStep();
    expect(barn.progressSteps).toBe(1);
    expect(works.progressSteps).toBe(1);
    expect(kitchen.progressSteps).toBe(0);
    expect(farm.swagRating()).toBe(
      FARM_CATALOG.monBarn.value +
      FARM_CATALOG.itemWorks.value +
      FARM_CATALOG.snackKitchen.value +
      DECOR_CATALOG.lamp.value
    );

    expect(farm.removeById(lamp.id)).toBe(true);
    expect(farm.removeById(lamp.id)).toBe(false);
  });

  it("round-trips a deep snapshot and continues stable ids", () => {
    const source = new FarmState();
    source.addCoins(900);
    const barn = source.placeBuilding("monBarn", { x: 24, y: 40 });
    barn.jobRecipeId = "recipe:hay";
    source.assignMon(barn.id, "mon:one");
    source.placeDecor("well", { x: 88, y: 104 });
    source.tickStep();

    const snapshot = source.snapshot();
    const restored = new FarmState();
    restored.restore(snapshot);
    expect(restored.snapshot()).toEqual(snapshot);

    snapshot.buildings[0].cell.x = 999;
    snapshot.buildings[0].assignedMonIds.push("mon:mutated");
    snapshot.decor[0].cell.y = 999;
    expect(restored.buildings[0].cell.x).toBe(24);
    expect(restored.buildings[0].assignedMonIds).toEqual(["mon:one"]);
    expect(restored.decor[0].cell.y).toBe(104);
    expect(restored.placeBuilding("trainingYard", { x: 0, y: 0 }).id).toBe("b2");
    expect(restored.placeDecor("bench", { x: 0, y: 0 }).id).toBe("d2");
  });

  it("migrates a v2 blob forward and restores an empty farm", () => {
    const migrated = deserializeSaveState(JSON.stringify(validSaveBody(2)));
    expect(migrated?.schemaVersion).toBe(SAVE_STATE_SCHEMA_VERSION);
    expect(migrated?.farmState).toBeUndefined();

    const farm = new FarmState();
    farm.addCoins(50);
    farm.placeBuilding("monBarn", { x: 0, y: 0 });
    const player = applySaveState(migrated, {
      flags: new GameFlags(),
      partyState: new PartyState(),
      farmState: farm
    });
    expect(player).not.toBeNull();
    expect(farm.snapshot()).toEqual({ swagCoins: 0, buildings: [], decor: [] });
  });

  it("validates and restores a v3 farm snapshot", () => {
    const source = new FarmState();
    source.addCoins(725);
    const building = source.placeBuilding("itemWorks", { x: 32, y: 48 });
    building.jobRecipeId = "recipe:widget";
    source.assignMon(building.id, "mon:worker");
    source.placeDecor("ranchFlag", { x: 96, y: 112 });

    const save = captureSaveState({
      flags: new GameFlags(),
      partyState: new PartyState(),
      player: { mode: "chunked", x: 12, y: 34, facing: "down" },
      farmState: source
    });
    const parsed = deserializeSaveState(serializeSaveState(save));
    expect(parsed?.farmState).toEqual(source.snapshot());

    const restored = new FarmState();
    expect(applySaveState(parsed, {
      flags: new GameFlags(),
      partyState: new PartyState(),
      farmState: restored
    })).toEqual({ mode: "chunked", x: 12, y: 34, facing: "down" });
    expect(restored.snapshot()).toEqual(source.snapshot());
  });

  it.each([
    ["bad building kind", { swagCoins: 10, buildings: [building({ kind: "shed" })], decor: [] }],
    ["negative coins", { swagCoins: -1, buildings: [], decor: [] }],
    ["tier four", { swagCoins: 10, buildings: [building({ tier: 4 })], decor: [] }]
  ])("rejects malformed farm state: %s", (_label, farmState) => {
    expect(deserializeSaveState(JSON.stringify({
      ...validSaveBody(SAVE_STATE_SCHEMA_VERSION),
      farmState
    }))).toBeNull();
  });
});

function validSaveBody(schemaVersion: number): Record<string, unknown> {
  return {
    schemaVersion,
    flags: { strings: [], numeric: [] },
    party: {
      wallet: 0,
      partyIds: [],
      inventory: [],
      equipped: []
    },
    player: {
      mode: "chunked",
      x: 0,
      y: 0,
      facing: "down"
    }
  };
}

function building(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "b1",
    kind: "monBarn",
    tier: 1,
    cell: { x: 0, y: 0 },
    progressSteps: 0,
    assignedMonIds: [],
    ...overrides
  };
}
