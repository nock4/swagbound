import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BattleRulesSchema,
  BackgroundOverridesSchema,
  DrifellaBarksSchema,
  EnemyNameFamiliesSchema,
  EnemyStatOverridesSchema,
  expandEnemyNameFamilies,
  expandOverworldEnemySkins,
  MusicManifestSchema,
  NpcOverridesSchema,
  OpeningCutsceneSchema,
  OverworldEnemySkinsSchema,
  PsiOverridesSchema,
  SpriteOverridesSchema,
  StoryTriggersSchema,
  CutscenesSchema,
  TileOverridesSchema,
  type BackgroundOverrideEntry,
  type SpriteOverride,
  type SpriteOverrides,
  type TileOverrides
} from "../packages/eb-schemas/src/index";
import { DEFAULT_GENERATED_OUT } from "../packages/content-builder/src/build";
import { convertProject } from "../packages/eb-converter/src/index";

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
export const OVERWORLD_ENEMY_SKINS_SOURCE = "content/overworld-enemy-skins.json";
export const BACKGROUND_OVERRIDES_SOURCE = "content/background-overrides.json";
export const BACKGROUND_OVERRIDES_OUTPUT = "background-overrides.json";
export const TILE_OVERRIDES_SOURCE = "content/tile-overrides.json";
export const TILE_OVERRIDES_OUTPUT = "tile-overrides.json";
export const ITEM_OVERRIDES_SOURCE = "content/item-overrides.json";
export const ITEM_OVERRIDES_OUTPUT = "item-overrides.json";
export const CHARACTER_OVERRIDES_SOURCE = "content/character-overrides.json";
export const CHARACTER_OVERRIDES_OUTPUT = "character-overrides.json";
export const PSI_OVERRIDES_SOURCE = "content/psi-overrides.json";
export const PSI_OVERRIDES_OUTPUT = "psi-overrides.json";
export const ENEMY_NAME_FAMILIES_SOURCE = "content/enemy-name-families.json";
export const ENEMY_OVERRIDES_OUTPUT = "enemy-overrides.json";
export const ENEMY_STAT_OVERRIDES_SOURCE = "content/enemy-stat-overrides.json";
export const ENEMY_STAT_OVERRIDES_OUTPUT = "enemy-stat-overrides.json";
export const BATTLE_RULES_SOURCE = "content/battle-rules.json";
export const BATTLE_RULES_OUTPUT = "battle-rules.json";
export const STORY_TRIGGERS_SOURCE = "content/triggers.json";
export const STORY_TRIGGERS_OUTPUT = "triggers.json";
export const CUTSCENES_SOURCE = "content/cutscenes.json";
export const CUTSCENES_OUTPUT = "cutscenes.json";
export const MUSIC_MANIFEST_SOURCE = "content/music-manifest.json";
export const MUSIC_MANIFEST_OUTPUT = "music-manifest.json";
export const DRIFELLA_BARKS_SOURCE = "content/drifella-barks.json";
export const DRIFELLA_BARKS_OUTPUT = "drifella-barks.json";
export const OPENING_CUTSCENE_SOURCE = "content/opening-cutscene.json";
export const OPENING_CUTSCENE_OUTPUT = "opening-cutscene.json";
const GAME_PUBLIC_ROOT = "apps/game/public";

/**
 * Canonical EB generated-data build: full world plus battle, party, item, font,
 * window, encounter, PSI, and shop data in the shared generated output.
 */
export async function buildEbFullWorldDefault() {
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
    tileOverrides,
    tileOverridePublicRoot: resolve(GAME_PUBLIC_ROOT)
  });
  await copyContentOverlaysToGenerated(EB_FULL_WORLD_OUT);
  return result;
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
  await validateOpeningCutscene(OPENING_CUTSCENE_SOURCE);
  await validateNpcOverrides(NPC_OVERRIDES_SOURCE);
  await validateEnemyStatOverrides(ENEMY_STAT_OVERRIDES_SOURCE);
  await Promise.all([
    copyJsonToGenerated(STORY_TRIGGERS_SOURCE, out, STORY_TRIGGERS_OUTPUT),
    copyJsonToGenerated(CUTSCENES_SOURCE, out, CUTSCENES_OUTPUT),
    copyJsonToGenerated(ADDED_NPCS_SOURCE, out, ADDED_NPCS_OUTPUT),
    copyJsonToGenerated(CUSTOM_DIALOGUE_SOURCE, out, CUSTOM_DIALOGUE_OUTPUT),
    copyJsonToGenerated(SWAGBOUND_DIALOGUE_LIBRARY_SOURCE, out, SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT),
    generateSpriteOverridesWithOverworldSkins(out, SPRITE_OVERRIDES_OUTPUT),
    copyJsonToGenerated(NPC_OVERRIDES_SOURCE, out, NPC_OVERRIDES_OUTPUT),
    copyJsonToGenerated(BACKGROUND_OVERRIDES_SOURCE, out, BACKGROUND_OVERRIDES_OUTPUT),
    copyJsonToGenerated(TILE_OVERRIDES_SOURCE, out, TILE_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ITEM_OVERRIDES_SOURCE, out, ITEM_OVERRIDES_OUTPUT),
    copyJsonToGenerated(CHARACTER_OVERRIDES_SOURCE, out, CHARACTER_OVERRIDES_OUTPUT),
    copyJsonToGenerated(PSI_OVERRIDES_SOURCE, out, PSI_OVERRIDES_OUTPUT),
    generateEnemyOverridesFromFamilies(ENEMY_NAME_FAMILIES_SOURCE, out, ENEMY_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ENEMY_STAT_OVERRIDES_SOURCE, out, ENEMY_STAT_OVERRIDES_OUTPUT),
    copyJsonToGenerated(BATTLE_RULES_SOURCE, out, BATTLE_RULES_OUTPUT),
    copyJsonToGenerated(MUSIC_MANIFEST_SOURCE, out, MUSIC_MANIFEST_OUTPUT),
    copyJsonToGenerated(DRIFELLA_BARKS_SOURCE, out, DRIFELLA_BARKS_OUTPUT),
    copyOptionalJsonToGenerated(OPENING_CUTSCENE_SOURCE, out, OPENING_CUTSCENE_OUTPUT)
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
    overworldByEnemyId: expandOverworldEnemySkins(skins, families)
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

async function validateOpeningCutscene(source: string): Promise<void> {
  if (!(await fileExists(source))) {
    return;
  }
  OpeningCutsceneSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateNpcOverrides(source: string): Promise<void> {
  NpcOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateEnemyStatOverrides(source: string): Promise<void> {
  EnemyStatOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
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
  const result = await buildEbFullWorldDefault();
  const world = result.world;
  if (!("mode" in world && world.mode === "full")) {
    throw new Error("EB full-world default build produced non-full world output.");
  }
  console.log(JSON.stringify({
    ok: result.manifest.errors.length === 0,
    sourceProject: result.manifest.sourceProject.path,
    out: EB_FULL_WORLD_OUT,
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
