import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SpriteOverridesSchema, type SpriteOverride, type SpriteOverrides } from "../packages/eb-schemas/src/index";
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
  await Promise.all([
    copyJsonToGenerated(ADDED_NPCS_SOURCE, out, ADDED_NPCS_OUTPUT),
    copyJsonToGenerated(CUSTOM_DIALOGUE_SOURCE, out, CUSTOM_DIALOGUE_OUTPUT),
    copyJsonToGenerated(SWAGBOUND_DIALOGUE_LIBRARY_SOURCE, out, SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT),
    copyJsonToGenerated(SPRITE_OVERRIDES_SOURCE, out, SPRITE_OVERRIDES_OUTPUT)
  ]);
}

async function validateSpriteOverrideImages(source: string): Promise<void> {
  const raw = JSON.parse(await readFile(resolve(source), "utf8"));
  const overrides = SpriteOverridesSchema.parse(raw);
  await Promise.all(spriteOverrideEntries(overrides).map(async (override) => {
    const publicRoot = resolve(GAME_PUBLIC_ROOT);
    const imagePath = resolve(publicRoot, override.image);
    const relativeImagePath = relative(publicRoot, imagePath);
    if (relativeImagePath.startsWith("..") || isAbsolute(relativeImagePath)) {
      throw new Error(`Sprite override image escapes ${GAME_PUBLIC_ROOT}: ${override.image}`);
    }
    await access(imagePath);
  }));
}

function spriteOverrideEntries(overrides: SpriteOverrides): SpriteOverride[] {
  return [
    overrides.player,
    ...Object.values(overrides.byNpcId ?? {}),
    ...Object.values(overrides.byEnemyId ?? {})
  ].filter((override): override is SpriteOverride => Boolean(override));
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
