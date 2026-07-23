import { describe, expect, it } from "vitest";
import {
  NEEDS_CREW,
  resolveProductionCycle,
  stepsForCycle
} from "../src/farmProduction";
import {
  FarmState,
  type FarmBuildingKind,
  type PlacedBuilding
} from "../src/farmState";

function building(kind: FarmBuildingKind, tier = 1): PlacedBuilding {
  return {
    id: `test:${kind}`,
    kind,
    tier,
    cell: { x: 0, y: 0 },
    progressSteps: 0,
    assignedMonIds: []
  };
}

describe("Mons Ranch production", () => {
  it.each([
    ["itemWorks", 1, 300],
    ["itemWorks", 2, 220],
    ["itemWorks", 3, 150],
    ["snackKitchen", 1, 260],
    ["snackKitchen", 2, 190],
    ["snackKitchen", 3, 190],
    ["trainingYard", 1, 200],
    ["trainingYard", 2, 150],
    ["trainingYard", 3, 110],
    ["monBath", 1, 240],
    ["monBath", 2, 180],
    ["monBath", 3, 180]
  ] as const)("uses the %s tier %i cycle threshold", (kind, tier, expected) => {
    expect(stepsForCycle(building(kind, tier))).toBe(expected);
  });

  it.each([
    "monBarn",
    "gachaShrine",
    "billboard",
    "fusionAltar",
    "riddleArchive"
  ] as const)("%s has no production threshold", (kind) => {
    expect(stepsForCycle(building(kind))).toBeUndefined();
  });

  it.each([
    ["ash", 147],
    ["steel", 148],
    ["frost", 106],
    ["earth", 101],
    ["crystal", 101],
    ["arcana", 232],
    ["ooze", 123],
    ["grave", 233],
    ["rubber", 88]
  ] as const)("maps the %s Item Works element to item %i", (element, itemId) => {
    expect(resolveProductionCycle(building("itemWorks"), [element])).toEqual({
      kind: "item",
      itemId
    });
  });

  it.each([
    ["an empty crew", []],
    ["an empty element", [""]],
    ["an unknown element", ["unknown"]]
  ])("uses the default Item Works output for %s", (_label, crewElements) => {
    expect(resolveProductionCycle(building("itemWorks"), crewElements)).toEqual({
      kind: "item",
      itemId: 88
    });
  });

  it("uses the first recognized Item Works element, even when another is more frequent", () => {
    expect(resolveProductionCycle(building("itemWorks"), ["ash", "steel", "steel"])).toEqual({
      kind: "item",
      itemId: 147
    });
  });

  it.each([
    [1, 90],
    [2, 233],
    [3, 233]
  ])("returns the tier %i Snack Kitchen burger", (tier, itemId) => {
    expect(resolveProductionCycle(building("snackKitchen", tier), [])).toEqual({
      kind: "item",
      itemId
    });
  });

  it.each([
    [1, 12],
    [2, 20],
    [3, 32]
  ])("returns the tier %i Training Yard XP amount %i", (tier, xp) => {
    expect(resolveProductionCycle(building("trainingYard", tier), [])).toEqual({
      kind: "training",
      xp
    });
  });

  it("returns bond production for the Mon Bath", () => {
    expect(resolveProductionCycle(building("monBath"), [])).toEqual({ kind: "bond" });
  });

  it.each([
    "monBarn",
    "gachaShrine",
    "billboard",
    "fusionAltar",
    "riddleArchive"
  ] as const)("%s does not resolve a production result", (kind) => {
    expect(resolveProductionCycle(building(kind), [])).toBeUndefined();
  });

  it("requires crew for exactly the four producing work buildings", () => {
    expect([...NEEDS_CREW].sort()).toEqual([
      "itemWorks",
      "monBath",
      "snackKitchen",
      "trainingYard"
    ]);
  });

  it("crosses a full Item Works cycle and documents tickStep's crew-blind job gate", () => {
    const farm = new FarmState();
    const staffed = farm.placeBuilding("itemWorks", { x: 0, y: 0 });
    expect(farm.assignMon(staffed.id, "mon:worker")).toBe(true);
    staffed.jobRecipeId = "crew";

    const idleWithoutCrew = farm.placeBuilding("itemWorks", { x: 96, y: 0 });
    const activeWithoutCrew = farm.placeBuilding("itemWorks", { x: 192, y: 0 });
    activeWithoutCrew.jobRecipeId = "crew";

    const threshold = stepsForCycle(staffed);
    expect(threshold).toBe(300);

    for (let step = 0; step < threshold! - 1; step += 1) {
      farm.tickStep();
    }

    expect(staffed.progressSteps).toBe(threshold! - 1);
    expect(staffed.progressSteps).toBeLessThan(threshold!);
    expect(idleWithoutCrew.progressSteps).toBe(0);
    expect(activeWithoutCrew.progressSteps).toBe(threshold! - 1);

    farm.tickStep();

    expect(staffed.progressSteps).toBe(threshold);
    expect(activeWithoutCrew.progressSteps).toBe(threshold);
    // tickStep is crew-blind: a non-empty jobRecipeId advances even with no crew.
    // resolveRanchProduction owns the separate NEEDS_CREW check and resets this
    // unstaffed building at the threshold without producing an output.
  });
});
