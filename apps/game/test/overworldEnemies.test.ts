import { describe, expect, it } from "vitest";
import type { EncounterSector } from "@eb/schemas";
import { selectSectorEnemyGroup, sectorSpawnBudget, touchAdvantage } from "../src/overworldEnemies";

const sector = (over: Partial<EncounterSector> = {}): EncounterSector => ({
  mapGroup: 4,
  eventFlag: 0,
  subGroups: [
    { rate: 5, candidates: [{ enemyGroup: 3, probability: 6 }, { enemyGroup: 2, probability: 2 }] }
  ],
  ...over
}) as EncounterSector;

describe("selectSectorEnemyGroup", () => {
  it("returns null for a missing or safe sector", () => {
    expect(selectSectorEnemyGroup(undefined, () => 0)).toBeNull();
    expect(selectSectorEnemyGroup(sector({ subGroups: [] }), () => 0)).toBeNull();
  });

  it("picks a candidate enemy group (weighted)", () => {
    // needle 0 -> first sub-group, first candidate (enemyGroup 3).
    expect(selectSectorEnemyGroup(sector(), () => 0)).toBe(3);
    // needle near the top of the candidate range -> second candidate (enemyGroup 2).
    expect(selectSectorEnemyGroup(sector(), () => 0.99)).toBe(2);
  });

  it("honours the sector event-flag gate", () => {
    const gated = sector({ eventFlag: 132 });
    expect(selectSectorEnemyGroup(gated, () => 0, { isFlagSet: () => false })).toBeNull();
    expect(selectSectorEnemyGroup(gated, () => 0, { isFlagSet: (flag) => flag === 132 })).toBe(3);
  });
});

describe("sectorSpawnBudget", () => {
  it("is 0 for safe sectors", () => {
    expect(sectorSpawnBudget(undefined)).toBe(0);
    expect(sectorSpawnBudget(sector({ subGroups: [] }))).toBe(0);
  });

  it("keeps at least one roamer for any danger sector and caps the rest", () => {
    expect(sectorSpawnBudget(sector())).toBeGreaterThanOrEqual(1);
    const dense = sector({ subGroups: [{ rate: 99, candidates: [{ enemyGroup: 3, probability: 1 }] }] });
    expect(sectorSpawnBudget(dense, { maxPerSector: 2 })).toBe(2);
    expect(sectorSpawnBudget(dense, { maxPerSector: 4 })).toBe(4);
  });

  it("respects the event-flag gate", () => {
    expect(sectorSpawnBudget(sector({ eventFlag: 132 }))).toBe(0);
  });
});

describe("touchAdvantage (green/red swirl geometry)", () => {
  const enemyAbove = { x: 0, y: 0 };
  const playerBelow = { x: 0, y: 10 };

  it("gives the party first strike when walking into the enemy's back", () => {
    // Player walks up into an enemy that is also facing up (its back to the player).
    expect(touchAdvantage({ ...playerBelow, facing: "up" }, { ...enemyAbove, facing: "up" })).toBe("partyFirstStrike");
  });

  it("gives the enemy first strike when it hits the player's back", () => {
    // Player faces down (back to the enemy above); enemy faces down into them.
    expect(touchAdvantage({ ...playerBelow, facing: "down" }, { ...enemyAbove, facing: "down" })).toBe("enemyFirstStrike");
  });

  it("is neutral for a head-on collision", () => {
    expect(touchAdvantage({ ...playerBelow, facing: "up" }, { ...enemyAbove, facing: "down" })).toBe("normal");
  });

  it("is neutral when overlapping (no direction)", () => {
    expect(touchAdvantage({ x: 5, y: 5, facing: "up" }, { x: 5, y: 5, facing: "down" })).toBe("normal");
  });
});
