import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BattleDataSchema,
  SCHEMA_VERSION,
  type BattleBackground,
  type BattleData,
  type BattleGroup,
  type ValidationIssue
} from "@eb/schemas";
import { parseIntKeyedYaml, parseYamlInteger } from "./coilsnakeYaml";

export const BATTLE_FILE = "battle.json";
export const BATTLE_SPRITE_DIR = "assets/battle/sprites";
export const BATTLE_BACKGROUND_DIR = "assets/battle/backgrounds";

const MAX_NON_BOSS_ENEMIES = 6;
const MAX_BATTLE_GROUPS = 3;
const LOW_LEVEL_MAX = 10;
const LOW_LEVEL_BOSS_MAX = 12;
const MAX_LOW_LEVEL_BOSS_ENEMIES = 5;
const MAX_BOSS_GROUPS_PER_ENEMY = 1;
const STORY_BOSS_ENEMY_IDS = [131, 130, 37, 214] as const;
const TOWN_MAP = "onett";
const MAP_ENEMY_PLACEMENT_WIDTH = 128;
const ENCOUNTER_CELLS_PER_SECTOR_X = 4;
const ENCOUNTER_CELLS_PER_SECTOR_Y = 2;
const BATTLE_SCROLL_UNITS_PER_PIXEL = 256;
const BATTLE_SCROLL_FRAMES_PER_SECOND = 60;
const BATTLE_RIPPLE_AMPLITUDE_UNITS_PER_PIXEL = 1024;
const BATTLE_RIPPLE_FREQUENCY_UNITS_PER_RADIAN = 4096;

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
  referencedBattleGroupIds?: Iterable<number>;
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

type BattleActionRecord = {
  id: number;
  actionType: number;
  target: number;
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

type BossSelection = {
  enemyIds: number[];
  groupIds: number[];
  ungroupedEnemyIds: number[];
};

type BattleSourceTables = {
  enemyConfig: ReturnType<typeof parseIntKeyedYaml>;
  battleActions: Map<number, BattleActionRecord>;
  enemyGroups: Map<number, EnemyGroupRecord>;
  mapEnemyGroups: Map<number, MapEnemyGroupRecord>;
  onettSectors: Set<number>;
  placements: Array<{ cell: number; mapEnemyGroup: number; x: number; y: number }>;
};

// CoilSnake-master/coilsnake/assets/structures/eb.yml BATTLE_ACTION_TABLE.
// These are generic enum labels from table metadata, not action names/text.
const BATTLE_TARGET_VALUES = new Map([
  ["none", 0],
  ["one", 1],
  ["random", 2],
  ["row", 3],
  ["all", 4]
]);

const BATTLE_ACTION_TYPE_VALUES = new Map([
  ["nothing", 0],
  ["physical (affected by shields and defending)", 1],
  ["physical (unaffected by shields and defending)", 2],
  ["psi", 3],
  ["item", 4],
  ["other", 5]
]);

export async function buildBattleData(options: BattleBuildOptions): Promise<BattleData> {
  assertBattleInputs(options.projectAbs);
  const tables: BattleSourceTables = {
    enemyConfig: parseIntKeyedYaml(await readFile(path.join(options.projectAbs, "enemy_configuration_table.yml"), "utf8")),
    battleActions: await readBattleActions(path.join(options.projectAbs, "battle_action_table.yml")),
    enemyGroups: await readEnemyGroups(path.join(options.projectAbs, "enemy_groups.yml")),
    mapEnemyGroups: await readMapEnemyGroups(path.join(options.projectAbs, "map_enemy_groups.yml")),
    onettSectors: await readTownMapSectors(path.join(options.projectAbs, "map_sectors.yml"), TOWN_MAP),
    placements: await readMapEnemyPlacements(path.join(options.projectAbs, "map_enemy_placement.yml"))
  };

  const warnings: ValidationIssue[] = [];
  const referencedBattleGroupIds = uniqueSorted([...(options.referencedBattleGroupIds ?? [])]);
  let extraEnemyIds: number[] = [];
  const selected = referencedBattleGroupIds.length > 0
    ? selectReferencedBattleGroups(tables, referencedBattleGroupIds, options.projectAbs, warnings)
    : (() => {
      const bossSelection = selectLowLevelBosses(tables, warnings);
      extraEnemyIds = bossSelection.enemyIds;
      return mergeBattleSelections(
        selectOnettBattleGroups(tables) ?? selectFallbackBattleGroups(tables, warnings),
        bossSelection
      );
    })();
  const selectedWithStoryGroups = mergeStoryBattleGroups(selected, selectStoryBossBattleGroups(tables));
  const battleGroupRecords = selectedWithStoryGroups.battleGroupIds.map((id) => requireMapEntry(tables.enemyGroups, id, "enemy_groups.yml"));
  const enemyIds = uniqueSorted([
    ...battleGroupRecords.flatMap((group) => positiveEnemyIds(group)),
    ...extraEnemyIds
  ]);

  const enemies = enemyIds.map((id) =>
    enemyToBattleEnemy(id, requireMapEntry(tables.enemyConfig, id, "enemy_configuration_table.yml"), tables.battleActions)
  );
  const groups: BattleGroup[] = battleGroupRecords.map((group) => ({
    id: group.id,
    background1: group.background1,
    background2: group.background2,
    enemyIds: uniqueSorted(positiveEnemyIds(group).filter((id) => enemyIds.includes(id)))
  }));
  const backgroundIds = uniqueSorted(groups.flatMap((group) => [group.background1, group.background2]));
  const backgrounds = await readBattleBackgroundAnimations(options.projectAbs, backgroundIds);

  const copied = await copyBattleAssets({
    projectAbs: options.projectAbs,
    outAbs: options.outAbs,
    enemyIds,
    backgroundIds
  });

  return BattleDataSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: options.displayPath,
    selection: {
      method: selectedWithStoryGroups.method,
      townMap: selectedWithStoryGroups.fallbackUsed ? undefined : TOWN_MAP,
      mapEnemyGroupIds: selectedWithStoryGroups.mapEnemyGroupIds,
      battleGroupIds: selectedWithStoryGroups.battleGroupIds,
      placementCellMapping: "map_enemy_placement key is a 128-wide 2x2-tile encounter grid; sector = floor(cellX/4), floor(cellY/2).",
      fallbackUsed: selectedWithStoryGroups.fallbackUsed
    },
    statMapping: {
      level: "enemy_configuration_table.yml Level",
      hp: "enemy_configuration_table.yml HP",
      defense: "enemy_configuration_table.yml Defense",
      offense: "enemy_configuration_table.yml Offense",
      speed: "enemy_configuration_table.yml Speed",
      experience: "enemy_configuration_table.yml Experience points",
      money: "enemy_configuration_table.yml Money",
      bossFlag: "enemy_configuration_table.yml Boss Flag",
      actions: "enemy_configuration_table.yml Action 1-4 plus Action 1-4 Argument; numeric actionType/target decoded from battle_action_table.yml",
      itemDropped: "enemy_configuration_table.yml Item Dropped",
      itemRarity: "enemy_configuration_table.yml Item Rarity as numerator/denominator odds"
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
    backgrounds,
    counts: {
      enemies: enemies.length,
      groups: groups.length,
      spriteFiles: copied.spriteFiles,
      backgroundFiles: copied.backgroundFiles
    },
    warnings
  });
}

function selectReferencedBattleGroups(
  tables: BattleSourceTables,
  referencedBattleGroupIds: number[],
  projectAbs: string,
  warnings: ValidationIssue[]
): Candidate {
  const missingGroupIds: number[] = [];
  const emptyGroupIds: number[] = [];
  const missingEnemyIds = new Set<number>();
  const missingSpriteEnemyIds = new Set<number>();
  const missingBackgroundIds = new Set<number>();
  const selected: number[] = [];

  for (const groupId of referencedBattleGroupIds) {
    const group = tables.enemyGroups.get(groupId);
    if (!group) {
      missingGroupIds.push(groupId);
      continue;
    }
    const enemyIds = uniqueSorted(positiveEnemyIds(group));
    if (enemyIds.length === 0) {
      emptyGroupIds.push(groupId);
      continue;
    }
    const missingEnemies = enemyIds.filter((enemyId) => !tables.enemyConfig.has(enemyId));
    if (missingEnemies.length > 0) {
      missingEnemies.forEach((enemyId) => missingEnemyIds.add(enemyId));
      continue;
    }
    const missingSprites = enemyIds.filter((enemyId) =>
      !existsSync(path.join(projectAbs, "BattleSprites", `${pad3(enemyId)}.png`))
    );
    if (missingSprites.length > 0) {
      missingSprites.forEach((enemyId) => missingSpriteEnemyIds.add(enemyId));
      continue;
    }
    const missingBackgrounds = [group.background1, group.background2].filter((backgroundId) =>
      !existsSync(path.join(projectAbs, "BattleBGs", `${pad3(backgroundId)}.png`))
    );
    if (missingBackgrounds.length > 0) {
      missingBackgrounds.forEach((backgroundId) => missingBackgroundIds.add(backgroundId));
      continue;
    }
    selected.push(groupId);
  }

  if (missingGroupIds.length > 0) {
    warnings.push(issue(
      "warning",
      "battle_missing_referenced_groups",
      `Skipped ${missingGroupIds.length} encounter-referenced enemy group(s) missing from enemy_groups.yml.`,
      "enemy_groups.yml"
    ));
  }
  if (emptyGroupIds.length > 0) {
    warnings.push(issue(
      "warning",
      "battle_empty_referenced_groups",
      `Skipped ${emptyGroupIds.length} encounter-referenced enemy group(s) with no positive enemy entries.`,
      "enemy_groups.yml"
    ));
  }
  if (missingEnemyIds.size > 0) {
    warnings.push(issue(
      "warning",
      "battle_missing_referenced_enemy_config",
      `Skipped encounter groups referencing ${missingEnemyIds.size} enemy id(s) missing from enemy_configuration_table.yml.`,
      "enemy_configuration_table.yml"
    ));
  }
  if (missingSpriteEnemyIds.size > 0) {
    warnings.push(issue(
      "warning",
      "battle_missing_referenced_sprites",
      `Skipped encounter groups referencing ${missingSpriteEnemyIds.size} enemy sprite asset(s) missing from BattleSprites.`,
      "BattleSprites"
    ));
  }
  if (missingBackgroundIds.size > 0) {
    warnings.push(issue(
      "warning",
      "battle_missing_referenced_backgrounds",
      `Skipped encounter groups referencing ${missingBackgroundIds.size} background asset(s) missing from BattleBGs.`,
      "BattleBGs"
    ));
  }
  if (selected.length === 0) {
    warnings.push(issue(
      "warning",
      "battle_no_referenced_groups_resolved",
      "No encounter-referenced battle groups could be resolved; battle.json was emitted empty.",
      "enemy_groups.yml"
    ));
  }

  return {
    method: "encounter-referenced-full-world",
    fallbackUsed: false,
    mapEnemyGroupIds: [],
    battleGroupIds: uniqueSorted(selected)
  };
}

function assertBattleInputs(projectAbs: string): void {
  const required = [
    "enemy_configuration_table.yml",
    "battle_action_table.yml",
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
        enemyIds.length > MAX_NON_BOSS_ENEMIES ||
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
    if (nextEnemyIds.size > MAX_NON_BOSS_ENEMIES) {
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

function selectLowLevelBosses(tables: BattleSourceTables, warnings: ValidationIssue[]): BossSelection {
  const bosses = [...tables.enemyConfig.entries()]
    .map(([id, entry]) => ({
      id,
      level: numericField(entry, "Level"),
      bossFlag: booleanField(entry, "Boss Flag")
    }))
    .filter((enemy) => enemy.bossFlag && enemy.level >= 1 && enemy.level <= LOW_LEVEL_BOSS_MAX)
    .sort((a, b) => a.level - b.level || a.id - b.id)
    .slice(0, MAX_LOW_LEVEL_BOSS_ENEMIES);

  const groupIds: number[] = [];
  const ungroupedEnemyIds: number[] = [];
  for (const boss of bosses) {
    const groups = groupsReferencingEnemy(tables.enemyGroups, boss.id);
    if (groups.length === 0) {
      ungroupedEnemyIds.push(boss.id);
      continue;
    }
    groupIds.push(...groups.slice(0, MAX_BOSS_GROUPS_PER_ENEMY).map((group) => group.id));
  }

  if (ungroupedEnemyIds.length > 0) {
    warnings.push(issue(
      "warning",
      "battle_low_level_boss_without_group",
      `Low-level boss-flag enemy ids without positive enemy_groups.yml references: ${ungroupedEnemyIds.join(", ")}.`,
      "enemy_groups.yml"
    ));
  }

  return {
    enemyIds: bosses.map((boss) => boss.id),
    groupIds: uniqueInOrder(groupIds),
    ungroupedEnemyIds
  };
}

function mergeBattleSelections(base: Candidate, bosses: BossSelection): Candidate {
  return {
    ...base,
    method: bosses.enemyIds.length > 0 ? `${base.method}+low-level-boss-flag-groups` : base.method,
    battleGroupIds: uniqueInOrder([...base.battleGroupIds, ...bosses.groupIds])
  };
}

function selectStoryBossBattleGroups(tables: BattleSourceTables): number[] {
  return uniqueInOrder(STORY_BOSS_ENEMY_IDS.flatMap((enemyId) => {
    if (!tables.enemyConfig.has(enemyId)) {
      return [];
    }
    return groupsReferencingEnemy(tables.enemyGroups, enemyId).slice(0, 1).map((group) => group.id);
  }));
}

function mergeStoryBattleGroups(base: Candidate, groupIds: number[]): Candidate {
  if (groupIds.length === 0) {
    return base;
  }
  return {
    ...base,
    method: `${base.method}+story-boss-groups`,
    battleGroupIds: uniqueInOrder([...base.battleGroupIds, ...groupIds])
  };
}

function groupsReferencingEnemy(enemyGroups: Map<number, EnemyGroupRecord>, enemyId: number): EnemyGroupRecord[] {
  return [...enemyGroups.values()]
    .filter((group) => positiveEnemyIds(group).includes(enemyId))
    .sort((a, b) =>
      positiveEnemyIds(a).length - positiveEnemyIds(b).length ||
      a.id - b.id
    );
}

function enemyToBattleEnemy(id: number, entry: Record<string, string>, battleActions: Map<number, BattleActionRecord>) {
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
    speed: numericField(entry, "Speed"),
    experience: numericField(entry, "Experience points"),
    money: numericField(entry, "Money"),
    bossFlag: booleanField(entry, "Boss Flag"),
    actions: [1, 2, 3, 4].map((index) => {
      const actionId = numericField(entry, `Action ${index}`);
      const action = requireMapEntry(battleActions, actionId, "battle_action_table.yml");
      return {
        id: actionId,
        arg: numericField(entry, `Action ${index} Argument`),
        actionId,
        actionType: action.actionType,
        target: action.target
      };
    }),
    itemDropped: nullableNumericField(entry, "Item Dropped"),
    itemRarity: rarityField(entry, "Item Rarity")
  };
}

async function readBattleActions(file: string): Promise<Map<number, BattleActionRecord>> {
  const rows = parseIntKeyedYaml(await readFile(file, "utf8"));
  const actions = new Map<number, BattleActionRecord>();
  for (const [id, row] of rows) {
    actions.set(id, {
      id,
      actionType: enumField(row, "Action type", BATTLE_ACTION_TYPE_VALUES),
      target: enumField(row, "Target", BATTLE_TARGET_VALUES)
    });
  }
  return actions;
}

async function readBattleBackgroundAnimations(projectAbs: string, backgroundIds: number[]): Promise<BattleBackground[]> {
  const dataRows = await readOptionalIntKeyedYaml(path.join(projectAbs, "bg_data_table.yml"));
  const scrollingRows = await readOptionalIntKeyedYaml(path.join(projectAbs, "bg_scrolling_table.yml"));
  const distortionRows = await readOptionalIntKeyedYaml(path.join(projectAbs, "bg_distortion_table.yml"));

  return backgroundIds.map((id) => {
    const dataRow = dataRows.get(id);
    if (!dataRow) {
      return { id };
    }
    const scroll = resolveBackgroundScroll(dataRow, scrollingRows);
    const distortion = resolveBackgroundDistortion(dataRow, distortionRows);
    return {
      id,
      ...(scroll ? { scroll } : {}),
      ...(distortion ? { distortion } : {})
    };
  });
}

async function readOptionalIntKeyedYaml(file: string): Promise<ReturnType<typeof parseIntKeyedYaml>> {
  if (!existsSync(file)) {
    return new Map();
  }
  return parseIntKeyedYaml(await readFile(file, "utf8"));
}

function resolveBackgroundScroll(
  dataRow: Record<string, string>,
  scrollingRows: ReturnType<typeof parseIntKeyedYaml>
): BattleBackground["scroll"] | undefined {
  let x = 0;
  let y = 0;
  for (let index = 1; index <= 4; index += 1) {
    const rowId = optionalNumericField(dataRow, `Scrolling Movement ${index}`);
    if (rowId === undefined || rowId <= 0) {
      continue;
    }
    const row = scrollingRows.get(rowId);
    if (!row) {
      continue;
    }
    const horizontal = optionalNumericField(row, "Horizontal Movement");
    const vertical = optionalNumericField(row, "Vertical Movement");
    if (horizontal === undefined || vertical === undefined) {
      continue;
    }
    x += signed16(horizontal) / BATTLE_SCROLL_UNITS_PER_PIXEL * BATTLE_SCROLL_FRAMES_PER_SECOND;
    y += signed16(vertical) / BATTLE_SCROLL_UNITS_PER_PIXEL * BATTLE_SCROLL_FRAMES_PER_SECOND;
  }
  if (isEffectivelyZero(x) && isEffectivelyZero(y)) {
    return undefined;
  }
  return {
    x: roundBattleNumber(x),
    y: roundBattleNumber(y)
  };
}

function resolveBackgroundDistortion(
  dataRow: Record<string, string>,
  distortionRows: ReturnType<typeof parseIntKeyedYaml>
): BattleBackground["distortion"] | undefined {
  for (let index = 1; index <= 4; index += 1) {
    const rowId = optionalNumericField(dataRow, `Distortion ${index}`);
    if (rowId === undefined || rowId <= 0) {
      continue;
    }
    const row = distortionRows.get(rowId);
    if (!row) {
      continue;
    }
    const amplitude = optionalNumericField(row, "Ripple Amplitude");
    const frequency = optionalNumericField(row, "Ripple Frequency");
    const speed = optionalNumericField(row, "Speed");
    if (amplitude === undefined || frequency === undefined || speed === undefined) {
      continue;
    }
    const normalizedAmplitude = amplitude / BATTLE_RIPPLE_AMPLITUDE_UNITS_PER_PIXEL;
    const normalizedFrequency = frequency / BATTLE_RIPPLE_FREQUENCY_UNITS_PER_RADIAN;
    if (normalizedAmplitude <= 0 || normalizedFrequency <= 0) {
      continue;
    }
    return {
      kind: row.Type?.trim() || "unknown",
      amplitude: roundBattleNumber(normalizedAmplitude),
      frequency: roundBattleNumber(normalizedFrequency),
      speed: roundBattleNumber(speed)
    };
  }
  return undefined;
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

function optionalNumericField(entry: Record<string, string>, field: string): number | undefined {
  const parsed = parseYamlInteger(entry[field]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function enumField(entry: Record<string, string>, field: string, values: Map<string, number>): number {
  const raw = entry[field]?.trim();
  const parsed = parseYamlInteger(raw);
  if (!Number.isNaN(parsed)) {
    if (![...values.values()].includes(parsed)) {
      throw new Error(`Invalid battle enum value "${raw}" for "${field}".`);
    }
    return parsed;
  }
  const value = values.get(raw?.toLowerCase() ?? "");
  if (value === undefined) {
    throw new Error(`Invalid or missing battle enum field "${field}".`);
  }
  return value;
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

function rarityField(entry: Record<string, string>, field: string): { numerator: number; denominator: number } | null {
  const value = entry[field]?.trim();
  if (!value || /^(?:none|null)$/i.test(value)) {
    return null;
  }
  const match = /^(\d+|0x[0-9a-f]+)\s*\/\s*(\d+|0x[0-9a-f]+)$/i.exec(value);
  if (!match) {
    throw new Error(`Invalid battle rarity field "${field}".`);
  }
  const numerator = parseYamlInteger(match[1]);
  const denominator = parseYamlInteger(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    throw new Error(`Invalid battle rarity field "${field}".`);
  }
  return {
    numerator: Math.max(0, Math.floor(numerator)),
    denominator: Math.max(1, Math.floor(denominator))
  };
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

function signed16(value: number): number {
  const normalized = value & 0xffff;
  return normalized >= 0x8000 ? normalized - 0x10000 : normalized;
}

function roundBattleNumber(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isEffectivelyZero(value: number): boolean {
  return Math.abs(value) < 0.0005;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function issue(severity: ValidationIssue["severity"], code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}
