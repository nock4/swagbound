import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { SpriteOverridesSchema, OverworldEnemySkinsSchema, EnemyNameFamiliesSchema, expandOverworldEnemySkins } from "@eb/schemas";
const ROOT = "/Users/nickgeorge-studio/Projects/coilsnake-tutorial-experiment";
async function main() {
  const base = SpriteOverridesSchema.parse(JSON.parse(await readFile(resolve(ROOT, "content/sprite-overrides.json"), "utf8")));
  const skins = OverworldEnemySkinsSchema.parse(JSON.parse(await readFile(resolve(ROOT, "content/overworld-enemy-skins.json"), "utf8")));
  const families = EnemyNameFamiliesSchema.parse(JSON.parse(await readFile(resolve(ROOT, "content/enemy-name-families.json"), "utf8")));
  const merged = SpriteOverridesSchema.parse({ ...base, overworldByEnemyId: expandOverworldEnemySkins(skins, families) });
  // asset existence check for the reassigned crowd images
  const imgs = new Set<string>();
  for (const v of Object.values((merged as { bySpriteGroup?: Record<string,{image:string}> }).bySpriteGroup ?? {})) imgs.add(v.image);
  for (const img of imgs) await access(resolve(ROOT, "apps/game/public", img.replace(/^\//,"")));
  await writeFile(resolve(ROOT, "apps/game/public/generated/sprite-overrides.json"), JSON.stringify(merged, null, 2) + "\n", "utf8");
  console.log("regenerated generated/sprite-overrides.json | bySpriteGroup imgs verified on disk:", imgs.size, "| overworldByEnemyId:", Object.keys((merged as {overworldByEnemyId?:object}).overworldByEnemyId ?? {}).length);
}
main().catch(e => { console.error(e); process.exit(1); });
