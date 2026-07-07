import { describe, expect, it } from "vitest";
import type { EncounterSector } from "@eb/schemas";
import {
  ENCOUNTER_RATE_DENOMINATOR,
  rollEncounter,
  sectorIndexForTile
} from "../src/encounterLogic";

describe("encounter sector math", () => {
  it("uses row * sectorsPerRow + col for YY-1 sector indexes", () => {
    const grid = { sectorWidthTiles: 8, sectorHeightTiles: 4, sectorsPerRow: 32 };

    expect(sectorIndexForTile(0, 0, grid)).toBe(0);
    expect(sectorIndexForTile(7, 3, grid)).toBe(0);
    expect(sectorIndexForTile(8, 0, grid)).toBe(1);
    expect(sectorIndexForTile(0, 4, grid)).toBe(32);
    expect(sectorIndexForTile(17, 9, grid)).toBe(66);
  });
});

describe("encounter rolls", () => {
  it("uses rate over 128 as the per-step hit chance", () => {
    const sector = encounterSector({ rate: 1, candidates: [{ enemyGroup: 10, probability: 1 }] });

    expect(rollEncounter(sector, sequence([1 / ENCOUNTER_RATE_DENOMINATOR]))).toBeNull();
    expect(rollEncounter(sector, sequence([0, 0]))).toEqual({ enemyGroup: 10 });
  });

  it("checks each subgroup in order and rolls candidates by probability weight", () => {
    const sector = encounterSector({
      subGroups: [
        { rate: 1, candidates: [{ enemyGroup: 10, probability: 1 }] },
        {
          rate: 128,
          candidates: [
            { enemyGroup: 20, probability: 1 },
            { enemyGroup: 21, probability: 3 }
          ]
        }
      ]
    });

    expect(rollEncounter(sector, sequence([0.99, 0, 0.24]))).toEqual({ enemyGroup: 20 });
    expect(rollEncounter(sector, sequence([0.99, 0, 0.25]))).toEqual({ enemyGroup: 21 });
    expect(rollEncounter(sector, sequence([0.99, 0, 1]))).toEqual({ enemyGroup: 21 });
  });

  it("honors numeric event flag gates without consuming RNG when blocked", () => {
    const sector = encounterSector({
      eventFlag: 7,
      rate: 128,
      candidates: [{ enemyGroup: 30, probability: 1 }]
    });
    const blockedRng = () => {
      throw new Error("blocked flag must not roll");
    };

    expect(rollEncounter(sector, blockedRng, { isFlagSet: () => false })).toBeNull();
    expect(rollEncounter(sector, sequence([0, 0]), { isFlagSet: (flag) => flag === 7 })).toEqual({ enemyGroup: 30 });
  });

  it("returns null for missing sectors and missed rolls", () => {
    const sector = encounterSector({ rate: 2, candidates: [{ enemyGroup: 40, probability: 1 }] });

    expect(rollEncounter(undefined, sequence([0]))).toBeNull();
    expect(rollEncounter(sector, sequence([0.5]))).toBeNull();
  });

  it("filters story bosses, unescapable groups, and zone-capped groups before picking candidates", () => {
    const sector = encounterSector({
      rate: 128,
      candidates: [
        { enemyGroup: 55, probability: 99 },
        { enemyGroup: 450, probability: 99 },
        { enemyGroup: 384, probability: 99 },
        { enemyGroup: 3, probability: 1 }
      ]
    });

    expect(rollEncounter(sector, sequence([0, 0.5]), {
      battleRules: { unescapableGroups: [450] },
      roamerZoneCaps: {
        schema: "swagbound.roamer-zone-caps.v1",
        zones: [{
          id: "act1",
          rect: { x: 0, y: 0, w: 4096, h: 4096 },
          allowedGroups: [1, 2, 3]
        }]
      },
      worldPixel: { x: 2112, y: 1760 }
    })).toEqual({ enemyGroup: 3 });
  });
});

function encounterSector(options: {
  mapGroup?: number;
  eventFlag?: number;
  rate?: number;
  candidates?: Array<{ enemyGroup: number; probability: number }>;
  subGroups?: EncounterSector["subGroups"];
} = {}): EncounterSector {
  return {
    mapGroup: options.mapGroup ?? 1,
    eventFlag: options.eventFlag ?? 0,
    subGroups: options.subGroups ?? [{
      rate: options.rate ?? 128,
      candidates: options.candidates ?? [{ enemyGroup: 1, probability: 1 }]
    }]
  };
}

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}
