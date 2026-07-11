import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  AttestationBattlesSchema,
  ArchivistSpotsSchema,
  BattleRulesSchema,
  BackgroundOverridesSchema,
  CardNftsSchema,
  DrifellaBarksSchema,
  DrifellaSourceChecksSchema,
  EnemyActionEffectsSchema,
  EnemyNameFamiliesSchema,
  FgOverridesSchema,
  BossBattleDialogueSchema,
  EnemyStatOverridesSchema,
  expandEnemyNameFamilies,
  expandOverworldEnemySkins,
  KeyItemsSchema,
  MusicManifestSchema,
  NavmeshSchema,
  NpcMovementPatternsSchema,
  NpcOverridesSchema,
  ObjectivesSchema,
  OpeningCutsceneSchema,
  OverworldInteractablesSchema,
  OverworldEnemySkinsSchema,
  PsiOverridesSchema,
  RoamerZoneCapsSchema,
  SpriteOverridesSchema,
  FlagMapSchema,
  StoryItemsSchema,
  StoryTriggersSchema,
  CutscenesSchema,
  TileOverridesSchema,
  UsabilityMatrixSchema,
  type BackgroundOverrideEntry,
  type SpriteOverride,
  type SpriteOverrides,
  type TileOverrides
} from "../packages/eb-schemas/src/index";
import { DEFAULT_GENERATED_OUT } from "../packages/content-builder/src/build";
import { convertProject, parseFgPredicate } from "../packages/eb-converter/src/index";
import type { FgPredicateVersion, ForegroundPredicateSummary } from "../packages/eb-converter/src/world";

export const EB_FULL_WORLD_PROJECT = "external/coilsnake-full";
export const EB_FULL_WORLD_MODE = "full";
export const EB_FULL_WORLD_OUT = DEFAULT_GENERATED_OUT;
export const ADDED_NPCS_SOURCE = "content/added-npcs.json";
export const ADDED_NPCS_OUTPUT = "added-npcs.json";
export const CUSTOM_DIALOGUE_SOURCE = "content/custom-dialogue.json";
export const CUSTOM_DIALOGUE_OUTPUT = "custom-dialogue.json";
export const SWAGBOUND_DIALOGUE_LIBRARY_SOURCE = "content/swagbound-dialogue-library.json";
export const SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT = "swagbound-dialogue-library.json";
export const SPRITE_OVERRIDES_SOURCE = "content/sprite-overrides.json";
export const SPRITE_OVERRIDES_OUTPUT = "sprite-overrides.json";
export const NPC_OVERRIDES_SOURCE = "content/npc-overrides.json";
export const NPC_OVERRIDES_OUTPUT = "npc-overrides.json";
export const NPC_MOVEMENT_PATTERNS_SOURCE = "content/npc-movement-patterns.json";
export const NPC_MOVEMENT_PATTERNS_OUTPUT = "npc-movement-patterns.json";
export const OVERWORLD_ENEMY_SKINS_SOURCE = "content/overworld-enemy-skins.json";
export const BACKGROUND_OVERRIDES_SOURCE = "content/background-overrides.json";
export const BACKGROUND_OVERRIDES_OUTPUT = "background-overrides.json";
export const TILE_OVERRIDES_SOURCE = "content/tile-overrides.json";
export const TILE_OVERRIDES_OUTPUT = "tile-overrides.json";
export const ITEM_OVERRIDES_SOURCE = "content/item-overrides.json";
export const ITEM_OVERRIDES_OUTPUT = "item-overrides.json";
export const CONDIMENT_PAIRS_SOURCE = "content/condiment-pairs.json";
export const CONDIMENT_PAIRS_OUTPUT = "condiment-pairs.json";
export const KEY_ITEMS_SOURCE = "content/key-items.json";
export const KEY_ITEMS_OUTPUT = "key-items.json";
export const STORY_ITEMS_SOURCE = "content/story-items.json";
export const STORY_ITEMS_OUTPUT = "story-items.json";
export const FLAG_MAP_SOURCE = "content/flag-map.json";
export const FLAG_MAP_OUTPUT = "flag-map.json";
export const TIMED_DELIVERY_SOURCE = "content/timed-delivery.json";
export const TIMED_DELIVERY_OUTPUT = "timed-delivery.json";
export const CHARACTER_OVERRIDES_SOURCE = "content/character-overrides.json";
export const CHARACTER_OVERRIDES_OUTPUT = "character-overrides.json";
export const PSI_OVERRIDES_SOURCE = "content/psi-overrides.json";
export const PSI_OVERRIDES_OUTPUT = "psi-overrides.json";
export const ENEMY_NAME_FAMILIES_SOURCE = "content/enemy-name-families.json";
export const ENEMY_OVERRIDES_OUTPUT = "enemy-overrides.json";
export const ENEMY_STAT_OVERRIDES_SOURCE = "content/enemy-stat-overrides.json";
export const ENEMY_STAT_OVERRIDES_OUTPUT = "enemy-stat-overrides.json";
export const BOSS_BATTLE_DIALOGUE_SOURCE = "content/boss-battle-dialogue.json";
export const BOSS_BATTLE_DIALOGUE_OUTPUT = "boss-battle-dialogue.json";
export const ENEMY_ACTION_EFFECTS_SOURCE = "content/enemy-action-effects.json";
export const ENEMY_ACTION_EFFECTS_OUTPUT = "enemy-action-effects.json";
export const BATTLE_RULES_SOURCE = "content/battle-rules.json";
export const BATTLE_RULES_OUTPUT = "battle-rules.json";
export const ROAMER_ZONE_CAPS_SOURCE = "content/roamer-zone-caps.json";
export const ROAMER_ZONE_CAPS_OUTPUT = "roamer-zone-caps.json";
export const STORY_TRIGGERS_SOURCE = "content/triggers.json";
export const STORY_TRIGGERS_OUTPUT = "triggers.json";
export const CUTSCENES_SOURCE = "content/cutscenes.json";
export const CUTSCENES_OUTPUT = "cutscenes.json";
export const MUSIC_MANIFEST_SOURCE = "content/music-manifest.json";
export const MUSIC_MANIFEST_OUTPUT = "music-manifest.json";
// Derived from external/coilsnake map_sectors+map_music via scripts/gen-sector-music.mjs.
export const SECTOR_MUSIC_SOURCE = "content/sector-music.json";
export const SECTOR_MUSIC_OUTPUT = "sector-music.json";
export const COLLISION_OVERRIDES_SOURCE = "content/collision-overrides.json";
export const COLLISION_OVERRIDES_OUTPUT = "collision-overrides.json";
export const FG_OVERRIDES_SOURCE = "content/fg-overrides.json";
export const FG_OVERRIDES_OUTPUT = "fg-overrides.json";
export const DRIFELLA_BARKS_SOURCE = "content/drifella-barks.json";
export const DRIFELLA_BARKS_OUTPUT = "drifella-barks.json";
export const ARCHIVIST_SPOTS_SOURCE = "content/archivist-spots.json";
export const ARCHIVIST_SPOTS_OUTPUT = "archivist-spots.json";
export const OPENING_CUTSCENE_SOURCE = "content/opening-cutscene.json";
export const OPENING_CUTSCENE_OUTPUT = "opening-cutscene.json";
export const OVERWORLD_INTERACTABLES_SOURCE = "content/overworld-interactables.json";
export const OVERWORLD_INTERACTABLES_OUTPUT = "overworld-interactables.json";
export const CARD_NFTS_SOURCE = "content/card-nfts.json";
export const CARD_NFTS_OUTPUT = "card-nfts.json";
export const DRIFELLA_SOURCE_CHECKS_SOURCE = "content/drifella-source-checks.json";
export const DRIFELLA_SOURCE_CHECKS_OUTPUT = "drifella-source-checks.json";
export const ATTESTATION_BATTLES_SOURCE = "content/attestation-battles.json";
export const ATTESTATION_BATTLES_OUTPUT = "attestation-battles.json";
export const OBJECTIVES_SOURCE = "content/objectives.json";
export const OBJECTIVES_OUTPUT = "objectives.json";
export const NAVMESH_SOURCE = "content/navmesh.json";
export const NAVMESH_OUTPUT = "navmesh.json";
export const USABILITY_MATRIX_SOURCE = "content/usability-matrix.json";
export const USABILITY_MATRIX_OUTPUT = "usability-matrix.json";
const GAME_PUBLIC_ROOT = "apps/game/public";
const FG_V2_SUMMARY_OUTPUT = "tmp/fg-v2/summary.json";
const execFileAsync = promisify(execFile);

/**
 * Canonical EB generated-data build: full world plus battle, party, item, font,
 * window, encounter, PSI, and shop data in the shared generated output.
 */
export async function buildEbFullWorldDefault(options: { fgPredicate?: FgPredicateVersion } = {}) {
  // v2 (column-scoped south gating + beside-edge crop) is the shipped default as of
  // the FG Converter v2 pass; rebuild with --fg-predicate=v1 (or FG_PREDICATE=v1)
  // to roll back to the original walk-behind bake.
  const fgPredicate = options.fgPredicate ?? "v2";
  const tileOverrides = await readTileOverrides(TILE_OVERRIDES_SOURCE);
  const result = await convertProject({
    project: EB_FULL_WORLD_PROJECT,
    worldMode: EB_FULL_WORLD_MODE,
    out: EB_FULL_WORLD_OUT,
    battle: true,
    characters: true,
    items: true,
    shops: true,
    font: true,
    window: true,
    fgPredicate,
    tileOverrides,
    tileOverridePublicRoot: resolve(GAME_PUBLIC_ROOT)
  });
  await regenerateUsabilityMatrix();
  await copyContentOverlaysToGenerated(EB_FULL_WORLD_OUT);
  if (fgPredicate === "v2") {
    await writeFgV2Summary(result.foregroundSummary);
  }
  return result;
}

function parseBuildArgs(argv: string[]): { fgPredicate: FgPredicateVersion } {
  let fgPredicate = parseFgPredicate(process.env.FG_PREDICATE);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fg-predicate") {
      fgPredicate = parseFgPredicate(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith("--fg-predicate=")) {
      fgPredicate = parseFgPredicate(arg.slice("--fg-predicate=".length));
    }
  }
  return { fgPredicate };
}

async function writeFgV2Summary(summary: ForegroundPredicateSummary | undefined): Promise<void> {
  if (!summary) {
    throw new Error("FG predicate v2 build did not produce a foreground summary.");
  }
  const target = resolve(FG_V2_SUMMARY_OUTPUT);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    predicate: "v2",
    counts: {
      cellsPromotedV1Only: summary.v1Only,
      cellsPromotedV2Only: summary.v2Only,
      cellsPromotedBoth: summary.both
    }
  }, null, 2)}\n`, "utf8");
}

async function regenerateUsabilityMatrix(): Promise<void> {
  const { stdout, stderr } = await execFileAsync(process.execPath, ["scripts/gen-usability-matrix.mjs"], {
    cwd: resolve(".")
  });
  if (stdout) {
    process.stdout.write(stdout);
  }
  if (stderr) {
    process.stderr.write(stderr);
  }
}

async function copyJsonToGenerated(source: string, out: string, outputName: string): Promise<void> {
  const target = resolve(out, outputName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(source), target);
}

async function copyOptionalJsonToGenerated(source: string, out: string, outputName: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  await copyJsonToGenerated(source, out, outputName);
}

async function copyContentOverlaysToGenerated(out: string): Promise<void> {
  await validateBackgroundOverrideImages(BACKGROUND_OVERRIDES_SOURCE);
  await validateTileOverrides(TILE_OVERRIDES_SOURCE);
  await validatePsiOverrides(PSI_OVERRIDES_SOURCE);
  await validateBattleRules(BATTLE_RULES_SOURCE);
  await validateStoryTriggers(STORY_TRIGGERS_SOURCE);
  await validateCutscenes(CUTSCENES_SOURCE);
  await validateMusicManifest(MUSIC_MANIFEST_SOURCE);
  await validateDrifellaBarks(DRIFELLA_BARKS_SOURCE);
  await validateArchivistSpots(ARCHIVIST_SPOTS_SOURCE);
  await validateOpeningCutscene(OPENING_CUTSCENE_SOURCE);
  await validateOverworldInteractables(OVERWORLD_INTERACTABLES_SOURCE);
  await validateCardNfts(CARD_NFTS_SOURCE);
  await validateDrifellaSourceChecks(DRIFELLA_SOURCE_CHECKS_SOURCE);
  await validateAttestationBattles(ATTESTATION_BATTLES_SOURCE);
  await validateFgOverrides(FG_OVERRIDES_SOURCE);
  await validateObjectives(OBJECTIVES_SOURCE);
  await validateNavmesh(NAVMESH_SOURCE);
  await validateUsabilityMatrix(USABILITY_MATRIX_SOURCE);
  await validateNpcOverrides(NPC_OVERRIDES_SOURCE);
  await validateNpcMovementPatterns(NPC_MOVEMENT_PATTERNS_SOURCE);
  await validateEnemyStatOverrides(ENEMY_STAT_OVERRIDES_SOURCE);
  await validateKeyItems(KEY_ITEMS_SOURCE);
  await validateStoryItems(STORY_ITEMS_SOURCE);
  await validateFlagMap(FLAG_MAP_SOURCE);
  await validateBossBattleDialogue(BOSS_BATTLE_DIALOGUE_SOURCE);
  await validateEnemyActionEffects(ENEMY_ACTION_EFFECTS_SOURCE);
  await validateRoamerZoneCaps(ROAMER_ZONE_CAPS_SOURCE);
  await Promise.all([
    copyJsonToGenerated(STORY_TRIGGERS_SOURCE, out, STORY_TRIGGERS_OUTPUT),
    copyJsonToGenerated(CUTSCENES_SOURCE, out, CUTSCENES_OUTPUT),
    copyJsonToGenerated(ADDED_NPCS_SOURCE, out, ADDED_NPCS_OUTPUT),
    copyJsonToGenerated(CUSTOM_DIALOGUE_SOURCE, out, CUSTOM_DIALOGUE_OUTPUT),
    copyJsonToGenerated(SWAGBOUND_DIALOGUE_LIBRARY_SOURCE, out, SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT),
    generateSpriteOverridesWithOverworldSkins(out, SPRITE_OVERRIDES_OUTPUT),
    copyJsonToGenerated(NPC_OVERRIDES_SOURCE, out, NPC_OVERRIDES_OUTPUT),
    copyJsonToGenerated(NPC_MOVEMENT_PATTERNS_SOURCE, out, NPC_MOVEMENT_PATTERNS_OUTPUT),
    copyJsonToGenerated(BACKGROUND_OVERRIDES_SOURCE, out, BACKGROUND_OVERRIDES_OUTPUT),
    copyJsonToGenerated(TILE_OVERRIDES_SOURCE, out, TILE_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ITEM_OVERRIDES_SOURCE, out, ITEM_OVERRIDES_OUTPUT),
    copyJsonToGenerated(CONDIMENT_PAIRS_SOURCE, out, CONDIMENT_PAIRS_OUTPUT),
    copyJsonToGenerated(KEY_ITEMS_SOURCE, out, KEY_ITEMS_OUTPUT),
    copyJsonToGenerated(STORY_ITEMS_SOURCE, out, STORY_ITEMS_OUTPUT),
    copyJsonToGenerated(FLAG_MAP_SOURCE, out, FLAG_MAP_OUTPUT),
    copyJsonToGenerated(TIMED_DELIVERY_SOURCE, out, TIMED_DELIVERY_OUTPUT),
    copyJsonToGenerated(CHARACTER_OVERRIDES_SOURCE, out, CHARACTER_OVERRIDES_OUTPUT),
    copyJsonToGenerated(PSI_OVERRIDES_SOURCE, out, PSI_OVERRIDES_OUTPUT),
    generateEnemyOverridesFromFamilies(ENEMY_NAME_FAMILIES_SOURCE, out, ENEMY_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ENEMY_STAT_OVERRIDES_SOURCE, out, ENEMY_STAT_OVERRIDES_OUTPUT),
    copyOptionalJsonToGenerated(BOSS_BATTLE_DIALOGUE_SOURCE, out, BOSS_BATTLE_DIALOGUE_OUTPUT),
    copyOptionalJsonToGenerated(ENEMY_ACTION_EFFECTS_SOURCE, out, ENEMY_ACTION_EFFECTS_OUTPUT),
    copyJsonToGenerated(BATTLE_RULES_SOURCE, out, BATTLE_RULES_OUTPUT),
    copyJsonToGenerated(ROAMER_ZONE_CAPS_SOURCE, out, ROAMER_ZONE_CAPS_OUTPUT),
    copyJsonToGenerated(MUSIC_MANIFEST_SOURCE, out, MUSIC_MANIFEST_OUTPUT),
    copyOptionalJsonToGenerated(SECTOR_MUSIC_SOURCE, out, SECTOR_MUSIC_OUTPUT),
    copyOptionalJsonToGenerated(COLLISION_OVERRIDES_SOURCE, out, COLLISION_OVERRIDES_OUTPUT),
    copyOptionalJsonToGenerated(FG_OVERRIDES_SOURCE, out, FG_OVERRIDES_OUTPUT),
    copyJsonToGenerated(DRIFELLA_BARKS_SOURCE, out, DRIFELLA_BARKS_OUTPUT),
    copyJsonToGenerated(ARCHIVIST_SPOTS_SOURCE, out, ARCHIVIST_SPOTS_OUTPUT),
    copyOptionalJsonToGenerated(OPENING_CUTSCENE_SOURCE, out, OPENING_CUTSCENE_OUTPUT),
    copyOptionalJsonToGenerated(OVERWORLD_INTERACTABLES_SOURCE, out, OVERWORLD_INTERACTABLES_OUTPUT),
    copyOptionalJsonToGenerated(CARD_NFTS_SOURCE, out, CARD_NFTS_OUTPUT),
    copyOptionalJsonToGenerated(DRIFELLA_SOURCE_CHECKS_SOURCE, out, DRIFELLA_SOURCE_CHECKS_OUTPUT),
    copyOptionalJsonToGenerated(ATTESTATION_BATTLES_SOURCE, out, ATTESTATION_BATTLES_OUTPUT),
    copyJsonToGenerated(OBJECTIVES_SOURCE, out, OBJECTIVES_OUTPUT),
    copyJsonToGenerated(NAVMESH_SOURCE, out, NAVMESH_OUTPUT),
    copyJsonToGenerated(USABILITY_MATRIX_SOURCE, out, USABILITY_MATRIX_OUTPUT)
  ]);
}

/**
 * Write generated sprite-overrides: the committed content plus a generated
 * `overworldByEnemyId` map (Swagbound roaming-enemy skins) expanded from
 * content/overworld-enemy-skins.json (by family) + the enemy family roster.
 * Validates every referenced image exists in public assets.
 */
async function generateSpriteOverridesWithOverworldSkins(out: string, outputName: string): Promise<void> {
  const base = SpriteOverridesSchema.parse(JSON.parse(await readFile(resolve(SPRITE_OVERRIDES_SOURCE), "utf8")));
  const skins = OverworldEnemySkinsSchema.parse(JSON.parse(await readFile(resolve(OVERWORLD_ENEMY_SKINS_SOURCE), "utf8")));
  const families = EnemyNameFamiliesSchema.parse(JSON.parse(await readFile(resolve(ENEMY_NAME_FAMILIES_SOURCE), "utf8")));
  const merged = SpriteOverridesSchema.parse({
    ...base,
    // Family skins are the DEFAULT roaming-enemy overworld art; an explicit
    // overworldByEnemyId in the committed source wins (e.g. the good-new-sprites
    // refresh maps each enemy id to its per-creature overworld sprite).
    overworldByEnemyId: {
      ...expandOverworldEnemySkins(skins, families),
      ...(base.overworldByEnemyId ?? {})
    }
  });
  await Promise.all(
    spriteOverrideEntries(merged).map((override) => validatePublicAssetImage(override.image, "Sprite override image"))
  );
  const target = resolve(out, outputName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

/**
 * Generate the per-id enemy-overrides map from the canonical family roster and write
 * it to the generated output. The family file is the single committed source of
 * enemy naming; the id->name map is never hand-maintained, so it cannot drift.
 */
async function generateEnemyOverridesFromFamilies(source: string, out: string, outputName: string): Promise<void> {
  const families = EnemyNameFamiliesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
  const overrides = expandEnemyNameFamilies(families);
  const target = resolve(out, outputName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
}

async function validatePsiOverrides(source: string): Promise<void> {
  PsiOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateBattleRules(source: string): Promise<void> {
  BattleRulesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateRoamerZoneCaps(source: string): Promise<void> {
  RoamerZoneCapsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateEnemyActionEffects(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  EnemyActionEffectsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateCutscenes(source: string): Promise<void> {
  CutscenesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateStoryTriggers(source: string): Promise<void> {
  const triggers = StoryTriggersSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
  await Promise.all(
    (triggers.barriers ?? [])
      .filter((barrier): barrier is typeof barrier & { image: string } => Boolean(barrier.image))
      .map((barrier) => validatePublicAssetImage(barrier.image, "Story barrier image"))
  );
}

async function validateMusicManifest(source: string): Promise<void> {
  MusicManifestSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateDrifellaBarks(source: string): Promise<void> {
  DrifellaBarksSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateArchivistSpots(source: string): Promise<void> {
  const spots = ArchivistSpotsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
  const names = JSON.parse(await readFile(resolve("content/rom-truth/event-flags.json"), "utf8")).byId as Record<string, string>;
  for (const [index, spot] of spots.spots.entries()) {
    const expectedSpotId = index + 1;
    const expectedFlagName = `FLG_PHOTO_${expectedSpotId}`;
    if (spot.spotId !== expectedSpotId) {
      throw new Error(`archivist-spots entry ${index}: expected spotId ${expectedSpotId}, got ${spot.spotId}`);
    }
    if (spot.flag.name !== expectedFlagName) {
      throw new Error(`archivist-spots ${spot.spotId}: expected ${expectedFlagName}, got ${spot.flag.name}`);
    }
    if (names[String(spot.flag.id)] !== spot.flag.name) {
      throw new Error(`archivist-spots ${spot.spotId}: id ${spot.flag.id} is "${names[String(spot.flag.id)] ?? "missing"}" in rom-truth, not "${spot.flag.name}"`);
    }
    if (spot.locationLabel.includes("—") || spot.caption.includes("—")) {
      throw new Error(`archivist-spots ${spot.spotId}: player-facing text contains an em dash`);
    }
  }
  for (const line of spots.archivist.lines) {
    if (line.includes("—")) {
      throw new Error("archivist-spots: Archivist line contains an em dash");
    }
  }
}

async function validateOpeningCutscene(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  OpeningCutsceneSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateOverworldInteractables(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  OverworldInteractablesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateCardNfts(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  CardNftsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateDrifellaSourceChecks(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  DrifellaSourceChecksSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateAttestationBattles(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  AttestationBattlesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateFgOverrides(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  FgOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateObjectives(source: string): Promise<void> {
  ObjectivesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateNavmesh(source: string): Promise<void> {
  NavmeshSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateUsabilityMatrix(source: string): Promise<void> {
  UsabilityMatrixSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateNpcOverrides(source: string): Promise<void> {
  NpcOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateNpcMovementPatterns(source: string): Promise<void> {
  NpcMovementPatternsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateEnemyStatOverrides(source: string): Promise<void> {
  EnemyStatOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateKeyItems(source: string): Promise<void> {
  KeyItemsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateFlagMap(source: string): Promise<void> {
  const flagMap = FlagMapSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
  // Every mapped EB flag id must exist under the canonical name in rom-truth.
  const names = JSON.parse(await readFile(resolve("content/rom-truth/event-flags.json"), "utf8")).byId as Record<string, string>;
  for (const entry of flagMap.entries) {
    for (const flag of [...entry.ebFlags, ...entry.candidates]) {
      if (names[String(flag.id)] !== flag.name) {
        throw new Error(`flag-map ${entry.storyFlag}: id ${flag.id} is "${names[String(flag.id)] ?? "missing"}" in rom-truth, not "${flag.name}"`);
      }
    }
  }
}

async function validateStoryItems(source: string): Promise<void> {
  const storyItems = StoryItemsSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
  await Promise.all(storyItems.items.map((item) => validatePublicAssetImage(item.worldAsset, "Story item image")));
}

async function validateBossBattleDialogue(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  BossBattleDialogueSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function readTileOverrides(source: string): Promise<TileOverrides> {
  return TileOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateTileOverrides(source: string): Promise<void> {
  await readTileOverrides(source);
}

function spriteOverrideEntries(overrides: SpriteOverrides): SpriteOverride[] {
  return [
    overrides.player,
    ...Object.values(overrides.byNpcId ?? {}),
    ...Object.values(overrides.bySpriteGroup ?? {}),
    ...Object.values(overrides.byEnemyId ?? {}),
    ...Object.values(overrides.overworldByEnemyId ?? {})
  ].filter((override): override is SpriteOverride => Boolean(override));
}

async function validateBackgroundOverrideImages(source: string): Promise<void> {
  const raw = JSON.parse(await readFile(resolve(source), "utf8"));
  const overrides = BackgroundOverridesSchema.parse(raw);
  await Promise.all(backgroundOverrideEntries(overrides.entries).map(async (entry) => {
    await validatePublicAssetImage(entry.image, "Background override image");
  }));
}

function backgroundOverrideEntries(entries: Record<string, BackgroundOverrideEntry>): BackgroundOverrideEntry[] {
  return Object.values(entries);
}

async function validatePublicAssetImage(image: string, label: string): Promise<void> {
  const publicRoot = resolve(GAME_PUBLIC_ROOT);
  const imagePath = resolve(publicRoot, image);
  const relativeImagePath = relative(publicRoot, imagePath);
  if (relativeImagePath.startsWith("..") || isAbsolute(relativeImagePath)) {
    throw new Error(`${label} escapes ${GAME_PUBLIC_ROOT}: ${image}`);
  }
  await access(imagePath);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(resolve(path));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseBuildArgs(process.argv.slice(2));
  const result = await buildEbFullWorldDefault(args);
  const world = result.world;
  if (!("mode" in world && world.mode === "full")) {
    throw new Error("EB full-world default build produced non-full world output.");
  }
  console.log(JSON.stringify({
    ok: result.manifest.errors.length === 0,
    sourceProject: result.manifest.sourceProject.path,
    out: EB_FULL_WORLD_OUT,
    fgPredicate: args.fgPredicate,
    world: {
      available: world.available,
      mode: world.mode,
      widthTiles: world.mapWidthTiles,
      heightTiles: world.mapHeightTiles,
      npcs: world.counts.npcs,
      chunks: world.counts.chunks
    },
    counts: result.manifest.counts
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
