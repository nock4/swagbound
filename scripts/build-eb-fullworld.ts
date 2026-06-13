import { pathToFileURL } from "node:url";
import { DEFAULT_GENERATED_OUT } from "../packages/content-builder/src/build";
import { convertProject } from "../packages/eb-converter/src/index";

export const EB_FULL_WORLD_PROJECT = "external/coilsnake-full";
export const EB_FULL_WORLD_MODE = "full";
export const EB_FULL_WORLD_OUT = DEFAULT_GENERATED_OUT;

export async function buildEbFullWorldDefault() {
  return convertProject({
    project: EB_FULL_WORLD_PROJECT,
    worldMode: EB_FULL_WORLD_MODE,
    out: EB_FULL_WORLD_OUT
  });
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
