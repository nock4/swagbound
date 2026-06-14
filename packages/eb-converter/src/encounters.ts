import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  EncountersSchema,
  SCHEMA_VERSION,
  type EncounterMapGroup,
  type EncounterSector,
  type Encounters,
  type ValidationIssue
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";
import {
  DEFAULT_MAP_HEIGHT_TILES,
  DEFAULT_MAP_WIDTH_TILES,
  SECTOR_HEIGHT_TILES,
  SECTOR_WIDTH_TILES
} from "./world";

export const ENCOUNTERS_FILE = "encounters.json";

const ENCOUNTER_CELLS_PER_SECTOR_X = 4;
const ENCOUNTER_CELLS_PER_SECTOR_Y = 2;

type Issue = ValidationIssue;

export type EncounterBuildResult = {
  encounters?: Encounters;
  referencedBattleGroupIds: number[];
  warnings: Issue[];
};

export type EncounterMapGroupRecord = {
  id: number;
  eventFlag: number;
  subGroups: Array<{
    index: 1 | 2;
    rate: number;
    candidates: Array<{
      enemyGroup: number;
      probability: number;
    }>;
  }>;
};

export type EncounterResolutionOptions = {
  mapWidthTiles: number;
  mapHeightTiles: number;
  placements: Map<number, number>;
  mapGroups: Map<number, EncounterMapGroupRecord>;
  placementMode?: "auto" | "sector" | "encounter-cell";
};

export type EncounterResolution = {
  sectorWidthTiles: number;
  sectorHeightTiles: number;
  sectorsPerRow: number;
  sectors: Record<string, EncounterSector>;
  referencedBattleGroupIds: number[];
  mapGroupIds: number[];
  sourcePlacementCells: number;
  mixedSectors: number;
  warnings: Issue[];
};

function issue(severity: Issue["severity"], code: string, message: string, issuePath?: string): Issue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}

export async function buildEncounterData(options: {
  projectAbs: string;
  displayPath: string;
  mapWidthTiles?: number;
  mapHeightTiles?: number;
}): Promise<EncounterBuildResult> {
  const warnings: Issue[] = [];
  const placementFile = path.join(options.projectAbs, "map_enemy_placement.yml");
  const mapGroupsFile = path.join(options.projectAbs, "map_enemy_groups.yml");
  const missing = [
    ["map_enemy_placement.yml", placementFile],
    ["map_enemy_groups.yml", mapGroupsFile]
  ].filter(([, file]) => !existsSync(file));

  if (missing.length > 0) {
    warnings.push(issue(
      "warning",
      "encounters_missing_tables",
      `Overworld encounters skipped; missing ${missing.map(([relative]) => relative).join(", ")}.`,
      missing[0][0]
    ));
    return { referencedBattleGroupIds: [], warnings };
  }

  const mapSize = await resolveMapSize(options.projectAbs, options.mapWidthTiles, options.mapHeightTiles, warnings);
  if (!mapSize) {
    return { referencedBattleGroupIds: [], warnings };
  }

  const resolution = resolveEncounterSectors({
    mapWidthTiles: mapSize.mapWidthTiles,
    mapHeightTiles: mapSize.mapHeightTiles,
    placements: await readMapEnemyPlacement(placementFile),
    mapGroups: await readEncounterMapGroups(mapGroupsFile)
  });
  warnings.push(...resolution.warnings);

  const encounters = EncountersSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: options.displayPath,
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
    warnings
  });

  return {
    encounters,
    referencedBattleGroupIds: resolution.referencedBattleGroupIds,
    warnings: encounters.warnings
  };
}

export function sectorIndexFromSector(sectorCol: number, sectorRow: number, sectorsPerRow: number): number {
  return sectorRow * sectorsPerRow + sectorCol;
}

export function sectorIndexFromTile(tileX: number, tileY: number, sectorsPerRow: number): number {
  return sectorIndexFromSector(
    Math.floor(tileX / SECTOR_WIDTH_TILES),
    Math.floor(tileY / SECTOR_HEIGHT_TILES),
    sectorsPerRow
  );
}

export function resolveEncounterSectors(options: EncounterResolutionOptions): EncounterResolution {
  const sectorsPerRow = Math.max(1, Math.floor(options.mapWidthTiles / SECTOR_WIDTH_TILES));
  const sectorRows = Math.max(1, Math.floor(options.mapHeightTiles / SECTOR_HEIGHT_TILES));
  const sectorMapGroups = options.placementMode === "sector" || (
    (options.placementMode ?? "auto") === "auto" &&
    maxMapKey(options.placements) < sectorsPerRow * sectorRows
  )
    ? mapDirectSectorPlacements(options.placements, sectorsPerRow, sectorRows)
    : mapEncounterCellPlacements(options.placements, sectorsPerRow, sectorRows);

  const warnings: Issue[] = [];
  const sectors: Record<string, EncounterSector> = {};
  const referencedBattleGroupIds = new Set<number>();
  const mapGroupIds = new Set<number>();
  const missingMapGroups = new Set<number>();
  let mixedSectors = 0;

  for (const [sectorIndex, counts] of [...sectorMapGroups.entries()].sort((a, b) => a[0] - b[0])) {
    const resolvedGroups = [...counts.entries()]
      .filter(([mapGroup]) => mapGroup > 0)
      .map(([mapGroup, cellCount]) => {
        const record = options.mapGroups.get(mapGroup);
        if (!record) {
          missingMapGroups.add(mapGroup);
          return undefined;
        }
        const output = encounterMapGroupToOutput(record);
        if (!output) {
          return undefined;
        }
        return { ...output, cellCount };
      })
      .filter((item): item is EncounterMapGroup & { cellCount: number } => item !== undefined)
      .sort((a, b) => b.cellCount - a.cellCount || a.mapGroup - b.mapGroup);

    if (resolvedGroups.length === 0) {
      continue;
    }
    if (resolvedGroups.length > 1) {
      mixedSectors += 1;
    }

    const primary = resolvedGroups[0];
    mapGroupIds.add(primary.mapGroup);
    for (const group of resolvedGroups) {
      mapGroupIds.add(group.mapGroup);
      for (const subGroup of group.subGroups) {
        for (const candidate of subGroup.candidates) {
          referencedBattleGroupIds.add(candidate.enemyGroup);
        }
      }
    }

    sectors[String(sectorIndex)] = {
      mapGroup: primary.mapGroup,
      eventFlag: primary.eventFlag,
      subGroups: primary.subGroups,
      ...(resolvedGroups.length > 1 ? { mapGroups: resolvedGroups } : {})
    };
  }

  if (missingMapGroups.size > 0) {
    warnings.push(issue(
      "warning",
      "encounters_missing_map_groups",
      `Skipped ${missingMapGroups.size} referenced enemy map group(s) missing from map_enemy_groups.yml.`,
      "map_enemy_groups.yml"
    ));
  }
  if (mixedSectors > 0) {
    warnings.push(issue(
      "info",
      "encounters_mixed_source_cells",
      `${mixedSectors} world sector(s) contain multiple nonzero source encounter cells; mapGroups preserves the folded candidates.`,
      "map_enemy_placement.yml"
    ));
  }

  return {
    sectorWidthTiles: SECTOR_WIDTH_TILES,
    sectorHeightTiles: SECTOR_HEIGHT_TILES,
    sectorsPerRow,
    sectors,
    referencedBattleGroupIds: [...referencedBattleGroupIds].sort((a, b) => a - b),
    mapGroupIds: [...mapGroupIds].sort((a, b) => a - b),
    sourcePlacementCells: options.placements.size,
    mixedSectors,
    warnings
  };
}

async function resolveMapSize(
  projectAbs: string,
  mapWidthTiles: number | undefined,
  mapHeightTiles: number | undefined,
  warnings: Issue[]
): Promise<{ mapWidthTiles: number; mapHeightTiles: number } | undefined> {
  if (mapWidthTiles !== undefined && mapHeightTiles !== undefined) {
    return { mapWidthTiles, mapHeightTiles };
  }

  const mapTilesFile = path.join(projectAbs, "map_tiles.map");
  if (!existsSync(mapTilesFile)) {
    warnings.push(issue(
      "warning",
      "encounters_missing_map_tiles",
      "Overworld encounters skipped; map_tiles.map is needed to bound sector indices.",
      "map_tiles.map"
    ));
    return undefined;
  }

  const rows = (await readFile(mapTilesFile, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).filter(Boolean))
    .filter((row) => row.length > 0);
  return {
    mapWidthTiles: mapWidthTiles ?? rows[0]?.length ?? DEFAULT_MAP_WIDTH_TILES,
    mapHeightTiles: mapHeightTiles ?? (rows.length || DEFAULT_MAP_HEIGHT_TILES)
  };
}

async function readMapEnemyPlacement(file: string): Promise<Map<number, number>> {
  const rows = parseIntKeyedYaml(await readFile(file, "utf8"));
  const placements = new Map<number, number>();
  for (const [index, row] of rows) {
    const mapGroup = parseYamlInteger(row["Enemy Map Group"]);
    if (!Number.isNaN(mapGroup)) {
      placements.set(index, mapGroup);
    }
  }
  return placements;
}

export async function readEncounterMapGroups(file: string): Promise<Map<number, EncounterMapGroupRecord>> {
  const groups = new Map<number, EncounterMapGroupRecord>();
  let current: EncounterMapGroupRecord | undefined;
  let currentSubGroup: 1 | 2 | undefined;

  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const idMatch = /^(\d+|0x[0-9a-f]+):\s*$/i.exec(line);
    if (idMatch) {
      current = {
        id: parseYamlInteger(idMatch[1]),
        eventFlag: 0,
        subGroups: [
          { index: 1, rate: 0, candidates: [] },
          { index: 2, rate: 0, candidates: [] }
        ]
      };
      groups.set(current.id, current);
      currentSubGroup = undefined;
      continue;
    }
    if (!current) {
      continue;
    }

    const eventFlagMatch = /^ {2}Event Flag:\s*(\d+|0x[0-9a-f]+)\s*$/i.exec(line);
    if (eventFlagMatch) {
      current.eventFlag = parseYamlInteger(eventFlagMatch[1]);
      continue;
    }

    const subgroupMatch = /^ {2}Sub-Group ([12]):\s*(\{\})?\s*$/i.exec(line);
    if (subgroupMatch) {
      currentSubGroup = subgroupMatch[2] ? undefined : parseYamlInteger(subgroupMatch[1]) as 1 | 2;
      continue;
    }

    const rateMatch = /^ {2}Sub-Group ([12]) Rate:\s*(\d+|0x[0-9a-f]+)\s*$/i.exec(line);
    if (rateMatch) {
      const subGroup = current.subGroups[parseYamlInteger(rateMatch[1]) - 1];
      if (subGroup) {
        subGroup.rate = parseYamlInteger(rateMatch[2]);
      }
      continue;
    }

    const entryMatch = /^ {4}\d+:\s*\{Enemy Group:\s*(\d+|0x[0-9a-f]+),\s*Probability:\s*(\d+|0x[0-9a-f]+)\}/i.exec(line);
    if (currentSubGroup !== undefined && entryMatch) {
      current.subGroups[currentSubGroup - 1].candidates.push({
        enemyGroup: parseYamlInteger(entryMatch[1]),
        probability: parseYamlInteger(entryMatch[2])
      });
    }
  }

  return groups;
}

function mapDirectSectorPlacements(
  placements: Map<number, number>,
  sectorsPerRow: number,
  sectorRows: number
): Map<number, Map<number, number>> {
  const sectors = new Map<number, Map<number, number>>();
  for (const [sectorIndex, mapGroup] of placements) {
    const sectorCol = sectorIndex % sectorsPerRow;
    const sectorRow = Math.floor(sectorIndex / sectorsPerRow);
    if (sectorCol >= sectorsPerRow || sectorRow >= sectorRows) {
      continue;
    }
    sectors.set(sectorIndex, new Map([[mapGroup, 1]]));
  }
  return sectors;
}

function mapEncounterCellPlacements(
  placements: Map<number, number>,
  sectorsPerRow: number,
  sectorRows: number
): Map<number, Map<number, number>> {
  const sectors = new Map<number, Map<number, number>>();
  const placementCellsPerRow = sectorsPerRow * ENCOUNTER_CELLS_PER_SECTOR_X;
  for (const [cellIndex, mapGroup] of placements) {
    const cellX = cellIndex % placementCellsPerRow;
    const cellY = Math.floor(cellIndex / placementCellsPerRow);
    const sectorCol = Math.floor(cellX / ENCOUNTER_CELLS_PER_SECTOR_X);
    const sectorRow = Math.floor(cellY / ENCOUNTER_CELLS_PER_SECTOR_Y);
    if (sectorCol >= sectorsPerRow || sectorRow >= sectorRows) {
      continue;
    }
    const sectorIndex = sectorIndexFromSector(sectorCol, sectorRow, sectorsPerRow);
    const counts = sectors.get(sectorIndex) ?? new Map<number, number>();
    counts.set(mapGroup, (counts.get(mapGroup) ?? 0) + 1);
    sectors.set(sectorIndex, counts);
  }
  return sectors;
}

function encounterMapGroupToOutput(record: EncounterMapGroupRecord): EncounterMapGroup | undefined {
  const subGroups = record.subGroups
    .filter((subGroup) => subGroup.rate > 0)
    .map((subGroup) => ({
      rate: subGroup.rate,
      candidates: subGroup.candidates
        .filter((candidate) => candidate.probability > 0)
        .map((candidate) => ({
          enemyGroup: candidate.enemyGroup,
          probability: candidate.probability
        }))
    }))
    .filter((subGroup) => subGroup.candidates.length > 0);

  if (subGroups.length === 0) {
    return undefined;
  }
  return {
    mapGroup: record.id,
    eventFlag: record.eventFlag,
    subGroups
  };
}

function maxMapKey(map: Map<number, unknown>): number {
  let max = -1;
  for (const key of map.keys()) {
    max = Math.max(max, key);
  }
  return max;
}
