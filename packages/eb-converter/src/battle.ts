import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BattleDataSchema,
  SCHEMA_VERSION,
  type BattleData,
  type BattleGroup,
  type ValidationIssue
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";

export const BATTLE_FILE = "battle.json";
export const BATTLE_SPRITE_DIR = "assets/battle/sprites";
export const BATTLE_BACKGROUND_DIR = "assets/battle/backgrounds";

const MAX_ENEMIES = 6;
const MAX_BATTLE_GROUPS = 3;
const LOW_LEVEL_MAX = 10;
const TOWN_MAP = "onett";
const MAP_ENEMY_PLACEMENT_WIDTH = 128;
const ENCOUNTER_CELLS_PER_SECTOR_X = 4;
const ENCOUNTER_CELLS_PER_SECTOR_Y = 2;

const BATTLE_SPRITE_SIZES = [
  [32, 32],
  [64, 32],
  [32, 64],
  [64, 64],
  [128, 64],
  [128, 128]
] as const;

type BattleBuildOptions = {
  projectAbs: string;
  outAbs: string;
  displayPath: string;
};

type EnemyGroupEntry = {
  amount: number;
  enemy: number;
};

type EnemyGroupRecord = {
  id: number;
  background1: number;
  background2: number;
  enemies: EnemyGroupEntry[];
};

type MapEnemySubgroupEntry = {
  group: number;
  probability: number;
};

type MapEnemyGroupRecord = {
  id: number;
  entries: MapEnemySubgroupEntry[];
};

type PlacementStats = {
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  sectors: Set<number>;
};

type Candidate = {
  method: string;
  fallbackUsed: boolean;
  mapEnemyGroupIds: number[];
  battleGroupIds: number[];
};

type BattleSourceTables = {
  enemyConfig: ReturnType<typeof parseIntKeyedYaml>;
  enemyGroups: Map<number, EnemyGroupRecord>;
  mapEnemyGroups: Map<number, MapEnemyGroupRecord>;
  onettSectors: Set<number>;
  placements: Array<{ cell: number; mapEnemyGroup: number; x: number; y: number }>;
};

export async function buildBattleData(options: BattleBuildOptions): Promise<BattleData> {
  assertBattleInputs(options.projectAbs);
  const tables: BattleSourceTables = {
    enemyConfig: parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "enemy_configuration_table.yml"), "utf8")),
    enemyGroups: await readEnemyGroups(path.join(options.projectAbs, "enemy_groups.yml")),
    mapEnemyGroups: await readMapEnemyGroups(path.join(options.projectAbs, "map_enemy_groups.yml")),
    onettSectors: await readTownMapSectors(path.join(options.projectAbs, "map_sectors.yml"), TOWN_MAP),
    placements: await readMapEnemyPlacements(path.join(options.projectAbs, "map_enemy_placement.yml"))
  };

  const warnings: ValidationIssue[] = [];
  const selected = selectOnettBattleGroups(tables) ?? selectFallbackBattleGroups(tables, warnings);
  const battleGroupRecords = selected.battleGroupIds.map((id) => requireMapEntry(tables.enemyGroups, id, "enemy_groups.yml"));
  const enemyIds = uniqueSorted(battleGroupRecords.flatMap((group) => positiveEnemyIds(group))).slice(0, MAX_ENEMIES);

  const enemies = enemyIds.map((id) => enemyToBattleEnemy(id, requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml")));
  const groups: BattleGroup[] = battleGroupRecords.map((group) => ({
    id: group.id,
    background1: group.background1,
    background2: group.background2,
    enemyIds: uniqueSorted(positiveEnemyIds(group).filter((id) => enemyIds.includes(id)))
  }));

  const copied = await copyBattleAssets({
    projectAbs: options.projectAbs,
    outAbs: options.outAbs,
    enemyIds,
    backgroundIds: uniqueSorted(groups.flatMap((group) => [group.background1, group.background2]))
  });

  return BattleDataSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: options.displayPath,
    selection: {
      method: selected.method,
      townMap: selected.fallbackUsed ? undefined : TOWN_MAP,
      mapEnemyGroupIds: selected.mapEnemyGroupIds,
      battleGroupIds: selected.battleGroupIds,
      placementCellMapping: "map_enemy_placement key is a 128-wide 2x2-tile encounter grid; sector = floor(cellX/4), floor(cellY/2).",
      fallbackUsed: selected.fallbackUsed
    },
    statMapping: {
      level: "enemy_configuration_table.yml Level",
      hp: "enemy_configuration_table.yml HP",
      defense: "enemy_configuration_table.yml Defense",
      offense: "enemy_configuration_table.yml Offense",
      experience: "enemy_configuration_table.yml Experience points",
      bossFlag: "enemy_configuration_table.yml Boss Flag",
      actions: "enemy_configuration_table.yml Action 1-4 plus Action 1-4 Argument",
      itemDropped: "enemy_configuration_table.yml Item Dropped"
    },
    spriteFormat: {
      source: "CoilSnake-master/coilsnake/model/eb/sprites.py EbBattleSprite",
      fileType: "indexed PNG exported per enemy as BattleSprites/<enemy id>.png",
      indexedPaletteBits: 4,
      transparentPaletteIndex: 0,
      allowedSizes: BATTLE_SPRITE_SIZES
    },
    assetLayout: {
      spriteDir: BATTLE_SPRITE_DIR,
      backgroundDir: BATTLE_BACKGROUND_DIR,
      spriteFilePattern: "<zero-padded enemy id>.png",
      backgroundFilePattern: "<zero-padded background id>.png"
    },
    enemies,
    groups,
    counts: {
      enemies: enemies.length,
      groups: groups.length,
      spriteFiles: copied.spriteFiles,
      backgroundFiles: copied.backgroundFiles
    },
    warnings
  });
}

function assertBattleInputs(projectAbs: string): void {
  const required = [
    "enemy_configuration_table.yml",
    "enemy_groups.yml",
    "map_enemy_groups.yml",
    "map_enemy_placement.yml",
    "map_sectors.yml",
    "BattleSprites",
    "BattleBGs"
  ];
  for (const relativePath of required) {
    if (!existsSync(path.join(projectAbs, relativePath))) {
      throw new Error(`Battle extraction requires ${relativePath}.`);
    }
  }
}

function selectOnettBattleGroups(tables: BattleSourceTables): Candidate | undefined {
  if (tables.onettSectors.size === 0) {
    return undefined;
  }

  const placementStats = new Map<number, PlacementStats>();
  for (const placement of tables.placements) {
    if (placement.mapEnemyGroup === 0) {
      continue;
    }
    const sectorId = Math.floor(placement.y / ENCOUNTER_CELLS_PER_SECTOR_Y) * 32
      + Math.floor(placement.x / ENCOUNTER_CELLS_PER_SECTOR_X);
    if (!tables.onettSectors.has(sectorId)) {
      continue;
    }
    const stats = placementStats.get(placement.mapEnemyGroup) ?? {
      count: 0,
      minX: placement.x,
      maxX: placement.x,
      minY: placement.y,
      maxY: placement.y,
      sectors: new Set<number>()
    };
    stats.count += 1;
    stats.minX = Math.min(stats.minX, placement.x);
    stats.maxX = Math.max(stats.maxX, placement.x);
    stats.minY = Math.min(stats.minY, placement.y);
    stats.maxY = Math.max(stats.maxY, placement.y);
    stats.sectors.add(sectorId);
    placementStats.set(placement.mapEnemyGroup, stats);
  }

  const candidates = [...placementStats.entries()]
    .map(([mapEnemyGroupId, stats]) => {
      const mapEnemyGroup = tables.mapEnemyGroups.get(mapEnemyGroupId);
      if (!mapEnemyGroup) {
        return undefined;
      }
      const battleGroupIds = orderedBattleGroupIds(mapEnemyGroup);
      const enemyIds = uniqueSorted(battleGroupIds.flatMap((id) => {
        const group = tables.enemyGroups.get(id);
        return group ? positiveEnemyIds(group) : [];
      }));
      const levels = enemyIds.map((id) => numericField(requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml"), "Level"));
      const allNonBoss = enemyIds.every((id) => !booleanField(requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml"), "Boss Flag"));
      if (
        enemyIds.length === 0 ||
        enemyIds.length > MAX_ENEMIES ||
        levels.some((level) => Number.isNaN(level)) ||
        levels.some((level) => level < 1) ||
        Math.max(...levels) > LOW_LEVEL_MAX ||
        !allNonBoss
      ) {
        return undefined;
      }
      return {
        mapEnemyGroupId,
        stats,
        battleGroupIds,
        maxLevel: Math.max(...levels)
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) =>
      a.maxLevel - b.maxLevel ||
      b.stats.count - a.stats.count ||
      a.mapEnemyGroupId - b.mapEnemyGroupId
    );

  const selected = candidates[0];
  if (!selected) {
    return undefined;
  }

  return {
    method: "town-map-sector-intersection",
    fallbackUsed: false,
    mapEnemyGroupIds: [selected.mapEnemyGroupId],
    battleGroupIds: selected.battleGroupIds.slice(0, MAX_BATTLE_GROUPS)
  };
}

function selectFallbackBattleGroups(tables: BattleSourceTables, warnings: ValidationIssue[]): Candidate {
  warnings.push(issue(
    "warning",
    "battle_onett_selection_fallback",
    "No bounded low-level non-boss Onett encounter set could be derived; selected lowest-level non-boss battle groups.",
    "map_enemy_placement.yml"
  ));

  const candidates = [...tables.enemyGroups.values()]
    .map((group) => {
      const enemyIds = positiveEnemyIds(group);
      const levels = enemyIds.map((id) => numericField(requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml"), "Level"));
      const allNonBoss = enemyIds.every((id) => !booleanField(requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml"), "Boss Flag"));
      if (enemyIds.length === 0 || levels.some((level) => level < 1) || !allNonBoss) {
        return undefined;
      }
      return {
        group,
        enemyIds,
        maxLevel: Math.max(...levels)
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => a.maxLevel - b.maxLevel || a.group.id - b.group.id);

  const battleGroupIds: number[] = [];
  const enemyIds = new Set<number>();
  for (const candidate of candidates) {
    const nextEnemyIds = new Set([...enemyIds, ...candidate.enemyIds]);
    if (nextEnemyIds.size > MAX_ENEMIES) {
      continue;
    }
    battleGroupIds.push(candidate.group.id);
    candidate.enemyIds.forEach((id) => enemyIds.add(id));
    if (battleGroupIds.length >= MAX_BATTLE_GROUPS) {
      break;
    }
  }
  if (battleGroupIds.length === 0) {
    throw new Error("No non-boss battle groups were available for battle extraction.");
  }
  return {
    method: "lowest-level-non-boss-fallback",
    fallbackUsed: true,
    mapEnemyGroupIds: [],
    battleGroupIds
  };
}

function enemyToBattleEnemy(id: number, entry: Record<string, string>) {
  return {
    id,
    name: entry.Name ?? "",
    // CoilSnake hides the internal deduplicated Battle Sprite column in project
    // YAML and exports render-ready BattleSprites/<enemy id>.png files instead.
    spriteId: id,
    level: numericField(entry, "Level"),
    hp: numericField(entry, "HP"),
    defense: numericField(entry, "Defense"),
    offense: numericField(entry, "Offense"),
    experience: numericField(entry, "Experience points"),
    bossFlag: booleanField(entry, "Boss Flag"),
    actions: [1, 2, 3, 4].map((index) => ({
      id: numericField(entry, `Action ${index}`),
      arg: numericField(entry, `Action ${index} Argument`)
    })),
    itemDropped: nullableNumericField(entry, "Item Dropped")
  };
}

async function copyBattleAssets(options: {
  projectAbs: string;
  outAbs: string;
  enemyIds: number[];
  backgroundIds: number[];
}): Promise<{ spriteFiles: number; backgroundFiles: number }> {
  const spriteOut = path.join(options.outAbs, BATTLE_SPRITE_DIR);
  const backgroundOut = path.join(options.outAbs, BATTLE_BACKGROUND_DIR);
  await mkdir(spriteOut, { recursive: true });
  await mkdir(backgroundOut, { recursive: true });

  let spriteFiles = 0;
  for (const enemyId of options.enemyIds) {
    const file = `${pad3(enemyId)}.png`;
    const source = path.join(options.projectAbs, "BattleSprites", file);
    if (!existsSync(source)) {
      throw new Error(`Missing referenced battle sprite asset: BattleSprites/${file}`);
    }
    await copyFile(source, path.join(spriteOut, file));
    spriteFiles += 1;
  }

  let backgroundFiles = 0;
  for (const backgroundId of options.backgroundIds) {
    const file = `${pad3(backgroundId)}.png`;
    const source = path.join(options.projectAbs, "BattleBGs", file);
    if (!existsSync(source)) {
      throw new Error(`Missing referenced battle background asset: BattleBGs/${file}`);
    }
    await copyFile(source, path.join(backgroundOut, file));
    backgroundFiles += 1;
  }

  return { spriteFiles, backgroundFiles };
}

async function readEnemyGroups(file: string): Promise<Map<number, EnemyGroupRecord>> {
  const groups = new Map<number, EnemyGroupRecord>();
  let current: EnemyGroupRecord | undefined;
  let inEnemies = false;

  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const idMatch = /^(\d+|0x[0-9a-f]+):\s*$/i.exec(line);
    if (idMatch) {
      current = {
        id: parseYamlInteger(idMatch[1]),
        background1: 0,
        background2: 0,
        enemies: []
      };
      groups.set(current.id, current);
      inEnemies = false;
      continue;
    }
    if (!current) {
      continue;
    }
    const backgroundMatch = /^ {2}Background ([12]):\s*(\d+|0x[0-9a-f]+)\s*$/i.exec(line);
    if (backgroundMatch) {
      current[backgroundMatch[1] === "1" ? "background1" : "background2"] = parseYamlInteger(backgroundMatch[2]);
      continue;
    }
    if (/^ {2}Enemies:/.test(line)) {
      inEnemies = true;
      continue;
    }
    const enemyMatch = /Amount:\s*(\d+|0x[0-9a-f]+),\s*Enemy:\s*(\d+|0x[0-9a-f]+)/i.exec(line);
    if (inEnemies && enemyMatch) {
      current.enemies.push({
        amount: parseYamlInteger(enemyMatch[1]),
        enemy: parseYamlInteger(enemyMatch[2])
      });
    }
  }

  return groups;
}

async function readMapEnemyGroups(file: string): Promise<Map<number, MapEnemyGroupRecord>> {
  const groups = new Map<number, MapEnemyGroupRecord>();
  let current: MapEnemyGroupRecord | undefined;
  let inSubgroup = false;

  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const idMatch = /^(\d+|0x[0-9a-f]+):\s*$/i.exec(line);
    if (idMatch) {
      current = { id: parseYamlInteger(idMatch[1]), entries: [] };
      groups.set(current.id, current);
      inSubgroup = false;
      continue;
    }
    if (!current) {
      continue;
    }
    const subgroupMatch = /^ {2}Sub-Group [12]:/.exec(line);
    if (subgroupMatch) {
      inSubgroup = !line.includes("{}");
      continue;
    }
    const entryMatch = /^ {4}\d+:\s*\{Enemy Group:\s*(\d+|0x[0-9a-f]+),\s*Probability:\s*(\d+|0x[0-9a-f]+)\}/i.exec(line);
    if (inSubgroup && entryMatch) {
      current.entries.push({
        group: parseYamlInteger(entryMatch[1]),
        probability: parseYamlInteger(entryMatch[2])
      });
    }
  }

  return groups;
}

async function readMapEnemyPlacements(file: string): Promise<Array<{ cell: number; mapEnemyGroup: number; x: number; y: number }>> {
  const placements = [];
  let cell = 0;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const idMatch = /^(\d+|0x[0-9a-f]+):\s*$/i.exec(line);
    if (idMatch) {
      cell = parseYamlInteger(idMatch[1]);
      continue;
    }
    const groupMatch = /^ {2}Enemy Map Group:\s*(\d+|0x[0-9a-f]+)\s*$/i.exec(line);
    if (groupMatch) {
      placements.push({
        cell,
        mapEnemyGroup: parseYamlInteger(groupMatch[1]),
        x: cell % MAP_ENEMY_PLACEMENT_WIDTH,
        y: Math.floor(cell / MAP_ENEMY_PLACEMENT_WIDTH)
      });
    }
  }
  return placements;
}

async function readTownMapSectors(file: string, townMap: string): Promise<Set<number>> {
  const sectors = new Set<number>();
  let currentId: number | undefined;
  let current: Record<string, string> = {};
  const commit = () => {
    if (
      currentId !== undefined &&
      (current["Town Map Image"] ?? current["Town Map"] ?? "").toLowerCase() === townMap
    ) {
      sectors.add(currentId);
    }
  };

  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const idMatch = /^(\d+|0x[0-9a-f]+):\s*$/i.exec(line);
    if (idMatch) {
      commit();
      currentId = parseYamlInteger(idMatch[1]);
      current = {};
      continue;
    }
    const fieldMatch = /^ {2}([^:]+):\s*(.*)$/.exec(line);
    if (fieldMatch && currentId !== undefined) {
      current[fieldMatch[1].trim()] = fieldMatch[2].trim();
    }
  }
  commit();
  return sectors;
}

function orderedBattleGroupIds(mapEnemyGroup: MapEnemyGroupRecord): number[] {
  return uniqueInOrder(
    [...mapEnemyGroup.entries]
      .sort((a, b) => b.probability - a.probability || a.group - b.group)
      .map((entry) => entry.group)
  );
}

function positiveEnemyIds(group: EnemyGroupRecord): number[] {
  return group.enemies.filter((entry) => entry.amount > 0).map((entry) => entry.enemy);
}

function numericField(entry: Record<string, string>, field: string): number {
  const parsed = parseYamlInteger(entry[field]);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid or missing numeric battle field "${field}".`);
  }
  return parsed;
}

function nullableNumericField(entry: Record<string, string>, field: string): number | null {
  const value = entry[field]?.trim();
  if (!value || /^(?:none|null)$/i.test(value)) {
    return null;
  }
  const parsed = parseYamlInteger(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid nullable numeric battle field "${field}".`);
  }
  return parsed;
}

function booleanField(entry: Record<string, string>, field: string): boolean {
  const value = entry[field]?.trim().toLowerCase();
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new Error(`Invalid or missing boolean battle field "${field}".`);
}

function requireMapEntry<K, V>(map: Map<K, V>, key: K, source: string): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${source} entry for id ${String(key)}.`);
  }
  return value;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function uniqueInOrder(values: number[]): number[] {
  const seen = new Set<number>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function issue(severity: ValidationIssue["severity"], code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}
