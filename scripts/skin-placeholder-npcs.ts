import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AddedNpcsSchema,
  SpriteOverridesSchema,
  type AddedNpcs,
  type SpriteOverride,
  type SpriteOverrides
} from "../packages/eb-schemas/src/index";

const DEFAULT_ADDED_NPCS_JSON = "content/added-npcs.json";
const DEFAULT_SPRITE_OVERRIDES_JSON = "content/sprite-overrides.json";
const PLACEHOLDER_NPC_DISPLAY_HEIGHT = 24;
const PLACEHOLDER_NPC_SKINS = [
  "assets/swagbound/npc/npc-neighbor.png",
  "assets/swagbound/npc/npc-kid.png"
] as const;

export function singleFrameNpcOverride(image: string): SpriteOverride {
  return {
    image,
    frameWidth: 80,
    frameHeight: 80,
    animations: {
      down: [0],
      left: [0],
      right: [0],
      up: [0]
    },
    displayHeight: PLACEHOLDER_NPC_DISPLAY_HEIGHT,
    originX: 0.5,
    originY: 1
  };
}

export function buildPlaceholderNpcSpriteOverrides(
  addedNpcs: AddedNpcs,
  current: SpriteOverrides
): SpriteOverrides {
  const byNpcId = { ...(current.byNpcId ?? {}) };
  for (const npc of addedNpcs.npcs) {
    delete byNpcId[String(npc.id)];
  }
  addedNpcs.npcs.forEach((npc, index) => {
    byNpcId[String(npc.id)] = singleFrameNpcOverride(
      PLACEHOLDER_NPC_SKINS[index % PLACEHOLDER_NPC_SKINS.length]
    );
  });
  return SpriteOverridesSchema.parse({
    ...current,
    byNpcId
  });
}

async function readAddedNpcs(path: string): Promise<AddedNpcs> {
  return AddedNpcsSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
}

async function readSpriteOverrides(path: string): Promise<SpriteOverrides> {
  return SpriteOverridesSchema.parse(JSON.parse(await readFile(resolve(path), "utf8")));
}

async function main(): Promise<void> {
  const addedNpcsPath = process.argv[2] ?? DEFAULT_ADDED_NPCS_JSON;
  const spriteOverridesPath = process.argv[3] ?? DEFAULT_SPRITE_OVERRIDES_JSON;
  const addedNpcs = await readAddedNpcs(addedNpcsPath);
  const current = await readSpriteOverrides(spriteOverridesPath);
  const next = buildPlaceholderNpcSpriteOverrides(addedNpcs, current);
  await writeFile(resolve(spriteOverridesPath), `${JSON.stringify(next, null, 2)}\n`);
  console.log(JSON.stringify({
    output: spriteOverridesPath,
    byNpcId: Object.keys(next.byNpcId ?? {}).length,
    placeholderNpcs: addedNpcs.npcs.length,
    skins: PLACEHOLDER_NPC_SKINS,
    displayHeight: PLACEHOLDER_NPC_DISPLAY_HEIGHT
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
