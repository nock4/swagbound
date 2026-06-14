import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EncountersSchema } from "@eb/schemas";
import {
  buildEncounterData,
  readEncounterMapGroups,
  resolveEncounterSectors,
  sectorIndexFromTile,
  type EncounterMapGroupRecord
} from "../src/encounters";

describe("overworld encounter extraction", () => {
  it("resolves sector placements through enemy map groups into weighted candidates", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-encounters-"));
    try {
      const mapGroupsFile = path.join(temp, "map_enemy_groups.yml");
      await writeFile(mapGroupsFile, [
        "2:",
        "  Event Flag: 7",
        "  Sub-Group 1:",
        "    0: {Enemy Group: 20, Probability: 3}",
        "    1: {Enemy Group: 21, Probability: 5}",
        "    2: {Enemy Group: 22, Probability: 0}",
        "  Sub-Group 1 Rate: 9",
        "  Sub-Group 2: {}",
        "  Sub-Group 2 Rate: 0",
        ""
      ].join("\n"), "utf8");

      const resolution = resolveEncounterSectors({
        mapWidthTiles: 32,
        mapHeightTiles: 8,
        placements: new Map([
          [0, 0],
          [5, 2]
        ]),
        mapGroups: await readEncounterMapGroups(mapGroupsFile),
        placementMode: "sector"
      });

      expect(resolution.sectorsPerRow).toBe(4);
      expect(sectorIndexFromTile(8, 4, resolution.sectorsPerRow)).toBe(5);
      expect(resolution.referencedBattleGroupIds).toEqual([20, 21]);
      expect(resolution.sectors).toEqual({
        "5": {
          mapGroup: 2,
          eventFlag: 7,
          subGroups: [{
            rate: 9,
            candidates: [
              { enemyGroup: 20, probability: 3 },
              { enemyGroup: 21, probability: 5 }
            ]
          }]
        }
      });

      const parsed = EncountersSchema.parse({
        schemaVersion: "test",
        sourceProjectPath: "synthetic",
        sectorWidthTiles: resolution.sectorWidthTiles,
        sectorHeightTiles: resolution.sectorHeightTiles,
        sectorsPerRow: resolution.sectorsPerRow,
        sectors: resolution.sectors,
        counts: {
          sectors: Object.keys(resolution.sectors).length,
          mapGroups: resolution.mapGroupIds.length,
          enemyGroups: resolution.referencedBattleGroupIds.length,
          sourcePlacementCells: resolution.sourcePlacementCells,
          mixedSectors: resolution.mixedSectors
        },
        warnings: resolution.warnings
      });
      expect(parsed.counts).toMatchObject({
        sectors: 1,
        mapGroups: 1,
        enemyGroups: 2,
        sourcePlacementCells: 2,
        mixedSectors: 0
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("folds source encounter cells into world sectors and preserves mixed map groups", () => {
    const mapGroups = new Map<number, EncounterMapGroupRecord>([
      [2, group(2, 7, 9, [{ enemyGroup: 20, probability: 3 }])],
      [3, group(3, 8, 11, [{ enemyGroup: 30, probability: 4 }])]
    ]);

    const resolution = resolveEncounterSectors({
      mapWidthTiles: 16,
      mapHeightTiles: 4,
      placements: new Map([
        [0, 2],
        [1, 3],
        [8, 3],
        [9, 0]
      ]),
      mapGroups,
      placementMode: "encounter-cell"
    });

    expect(resolution.sectorsPerRow).toBe(2);
    expect(resolution.mixedSectors).toBe(1);
    expect(resolution.referencedBattleGroupIds).toEqual([20, 30]);
    expect(resolution.sectors["0"]).toMatchObject({
      mapGroup: 3,
      eventFlag: 8,
      subGroups: [{ rate: 11, candidates: [{ enemyGroup: 30, probability: 4 }] }]
    });
    expect(resolution.sectors["0"].mapGroups).toEqual([
      {
        mapGroup: 3,
        eventFlag: 8,
        subGroups: [{ rate: 11, candidates: [{ enemyGroup: 30, probability: 4 }] }],
        cellCount: 2
      },
      {
        mapGroup: 2,
        eventFlag: 7,
        subGroups: [{ rate: 9, candidates: [{ enemyGroup: 20, probability: 3 }] }],
        cellCount: 1
      }
    ]);
    expect(resolution.warnings.some((warning) => warning.code === "encounters_mixed_source_cells")).toBe(true);
  });

  it("skips gracefully when encounter source tables are absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-encounters-missing-"));
    try {
      const result = await buildEncounterData({
        projectAbs: temp,
        displayPath: "synthetic",
        mapWidthTiles: 16,
        mapHeightTiles: 4
      });

      expect(result.encounters).toBeUndefined();
      expect(result.referencedBattleGroupIds).toEqual([]);
      expect(result.warnings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "encounters_missing_tables" })
      ]));
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

function group(
  id: number,
  eventFlag: number,
  rate: number,
  candidates: Array<{ enemyGroup: number; probability: number }>
): EncounterMapGroupRecord {
  return {
    id,
    eventFlag,
    subGroups: [
      { index: 1, rate, candidates },
      { index: 2, rate: 0, candidates: [] }
    ]
  };
}
