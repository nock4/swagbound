// One-off: regenerate apps/game/public/generated/sprite-overrides.json from
// content/sprite-overrides.json + overworld-enemy-skins + enemy-name-families,
// mirroring generateSpriteOverridesWithOverworldSkins in build-eb-fullworld.ts
// (validates every referenced image exists in public assets). Avoids the full
// world rebuild that re-encodes chunk PNGs.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  SpriteOverridesSchema,
  OverworldEnemySkinsSchema,
  EnemyNameFamiliesSchema,
  expandOverworldEnemySkins,
  type SpriteOverrides,
  type SpriteOverride
} from "../packages/eb-schemas/src/index";

const GAME_PUBLIC_ROOT = "apps/game/public";
const OUT = "apps/game/public/generated";
const SPRITE_OVERRIDES_SOURCE = "content/sprite-overrides.json";
const OVERWORLD_ENEMY_SKINS_SOURCE = "content/overworld-enemy-skins.json";
const ENEMY_NAME_FAMILIES_SOURCE = "content/enemy-name-families.json";

function spriteOverrideEntries(overrides: SpriteOverrides): SpriteOverride[] {
  return [
    overrides.player,
    ...Object.values(overrides.byNpcId ?? {}),
    ...Object.values(overrides.bySpriteGroup ?? {}),
    ...Object.values(overrides.byEnemyId ?? {}),
    ...Object.values(overrides.overworldByEnemyId ?? {})
  ].filter((o): o is SpriteOverride => Boolean(o));
}

async function validatePublicAssetImage(image: string, label: string): Promise<void> {
  const publicRoot = resolve(GAME_PUBLIC_ROOT);
  const imagePath = resolve(publicRoot, image);
  const rel = relative(publicRoot, imagePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`${label} escapes ${GAME_PUBLIC_ROOT}: ${image}`);
  }
  await access(imagePath);
}

async function main(): Promise<void> {
  const base = SpriteOverridesSchema.parse(JSON.parse(await readFile(resolve(SPRITE_OVERRIDES_SOURCE), "utf8")));
  const skins = OverworldEnemySkinsSchema.parse(JSON.parse(await readFile(resolve(OVERWORLD_ENEMY_SKINS_SOURCE), "utf8")));
  const families = EnemyNameFamiliesSchema.parse(JSON.parse(await readFile(resolve(ENEMY_NAME_FAMILIES_SOURCE), "utf8")));
  const merged = SpriteOverridesSchema.parse({
    ...base,
    overworldByEnemyId: {
      ...expandOverworldEnemySkins(skins, families),
      ...(base.overworldByEnemyId ?? {})
    }
  });
  await Promise.all(
    spriteOverrideEntries(merged).map((o) => validatePublicAssetImage(o.image, "Sprite override image"))
  );
  const target = resolve(OUT, "sprite-overrides.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log("wrote", target, "with", Object.keys(merged.overworldByEnemyId ?? {}).length, "overworldByEnemyId entries");
}

main().catch((e) => { console.error(e); process.exit(1); });
