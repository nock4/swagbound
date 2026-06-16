import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  await copyDialogueDataToGenerated(EB_FULL_WORLD_OUT);
  return result;
}

async function copyJsonToGenerated(source: string, out: string, outputName: string): Promise<void> {
  const target = resolve(out, outputName);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(source), target);
}

async function copyDialogueDataToGenerated(out: string): Promise<void> {
  await Promise.all([
    copyJsonToGenerated(ADDED_NPCS_SOURCE, out, ADDED_NPCS_OUTPUT),
    copyJsonToGenerated(CUSTOM_DIALOGUE_SOURCE, out, CUSTOM_DIALOGUE_OUTPUT),
    copyJsonToGenerated(SWAGBOUND_DIALOGUE_LIBRARY_SOURCE, out, SWAGBOUND_DIALOGUE_LIBRARY_OUTPUT)
  ]);
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
