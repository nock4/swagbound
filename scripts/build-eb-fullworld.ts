import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BattleRulesSchema,
  BackgroundOverridesSchema,
  EnemyOverridesSchema,
  PsiOverridesSchema,
  SpriteOverridesSchema,
  type BackgroundOverrideEntry,
  type SpriteOverride,
  type SpriteOverrides
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
export const BACKGROUND_OVERRIDES_SOURCE = "content/background-overrides.json";
export const BACKGROUND_OVERRIDES_OUTPUT = "background-overrides.json";
export const ITEM_OVERRIDES_SOURCE = "content/item-overrides.json";
export const ITEM_OVERRIDES_OUTPUT = "item-overrides.json";
export const CHARACTER_OVERRIDES_SOURCE = "content/character-overrides.json";
export const CHARACTER_OVERRIDES_OUTPUT = "character-overrides.json";
export const PSI_OVERRIDES_SOURCE = "content/psi-overrides.json";
export const PSI_OVERRIDES_OUTPUT = "psi-overrides.json";
export const ENEMY_OVERRIDES_SOURCE = "content/enemy-overrides.json";
export const ENEMY_OVERRIDES_OUTPUT = "enemy-overrides.json";
export const BATTLE_RULES_SOURCE = "content/battle-rules.json";
export const BATTLE_RULES_OUTPUT = "battle-rules.json";
const GAME_PUBLIC_ROOT = "apps/game/public";

/**
 * Canonical EB generated-data build: full world plus battle, party, item, font,
 * window, encounter, PSI, and shop data in the shared generated output.
 */
export async function buildEbFullWorldDefault() {
  const result = await convertProject({
    project: EB_FULL_WORLD_PROJECT,
    worldMode: EB_FULL_WORLD_MODE,
    out: EB_FULL_WORLD_OUT,
    battle: true,
    characters: true,
    items: true,
    shops: true,
    font: true,
    window: true
  });
  await copyContentOverlaysToGenerated(EB_FULL_WORLD_OUT);
  return result;
}

async function copyJsonToGenerated(source: string, out: string, outputName: string): Promise<void> {
  const target = resolve(out, outputName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(source), target);
}

async function copyContentOverlaysToGenerated(out: string): Promise<void> {
  await validateSpriteOverrideImages(SPRITE_OVERRIDES_SOURCE);
  await validateBackgroundOverrideImages(BACKGROUND_OVERRIDES_SOURCE);
  await validatePsiOverrides(PSI_OVERRIDES_SOURCE);
  await validateEnemyOverrides(ENEMY_OVERRIDES_SOURCE);
  await validateBattleRules(BATTLE_RULES_SOURCE);
  await Promise.all([
    copyJsonToGenerated(ADDED_NPCS_SOURCE, out, ADDED_NPCS_OUTPUT),
    copyJsonToGenerated(CUSTOM_DIALOGUE_SOURCE, out, CUSTOM_DIALOGUE_OUTPUT),
    copyJsonToGenerated(SWAGBOUND_DIALOGUE_LIBRARY_SOURCE, out, SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT),
    copyJsonToGenerated(SPRITE_OVERRIDES_SOURCE, out, SPRITE_OVERRIDES_OUTPUT),
    copyJsonToGenerated(BACKGROUND_OVERRIDES_SOURCE, out, BACKGROUND_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ITEM_OVERRIDES_SOURCE, out, ITEM_OVERRIDES_OUTPUT),
    copyJsonToGenerated(CHARACTER_OVERRIDES_SOURCE, out, CHARACTER_OVERRIDES_OUTPUT),
    copyJsonToGenerated(PSI_OVERRIDES_SOURCE, out, PSI_OVERRIDES_OUTPUT),
    copyJsonToGenerated(ENEMY_OVERRIDES_SOURCE, out, ENEMY_OVERRIDES_OUTPUT),
    copyJsonToGenerated(BATTLE_RULES_SOURCE, out, BATTLE_RULES_OUTPUT)
  ]);
}

async function validatePsiOverrides(source: string): Promise<void> {
  PsiOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateEnemyOverrides(source: string): Promise<void> {
  EnemyOverridesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateBattleRules(source: string): Promise<void> {
  BattleRulesSchema.parse(JSON.parse(await readFile(resolve(source), "utf8")));
}

async function validateSpriteOverrideImages(source: string): Promise<void> {
  const raw = JSON.parse(await readFile(resolve(source), "utf8"));
  const overrides = SpriteOverridesSchema.parse(raw);
  await Promise.all(spriteOverrideEntries(overrides).map(async (override) => {
    await validatePublicAssetImage(override.image, "Sprite override image");
  }));
}

function spriteOverrideEntries(overrides: SpriteOverrides): SpriteOverride[] {
  return [
    overrides.player,
    ...Object.values(overrides.byNpcId ?? {}),
    ...Object.values(overrides.bySpriteGroup ?? {}),
    ...Object.values(overrides.byEnemyId ?? {})
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
