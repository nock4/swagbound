import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EnemyActionEffectsSchema } from "../packages/eb-schemas/src/index";
import { BATTLE_FILE, buildBattleData } from "../packages/eb-converter/src/battle";
import { buildEncounterData } from "../packages/eb-converter/src/encounters";

const EB_PROJECT = "external/coilsnake-full";
const GENERATED_OUT = "apps/game/public/generated";
const ENEMY_ACTION_EFFECTS_SOURCE = "content/enemy-action-effects.json";
const ENEMY_ACTION_EFFECTS_OUTPUT = "enemy-action-effects.json";
const GENERATED_WORLD = "apps/game/public/generated/world.json";
const FORMATION_REGRESSION_GROUP_IDS = [0];

type GeneratedWorldSize = {
  mapWidthTiles?: number;
  mapHeightTiles?: number;
};

async function readGeneratedWorldSize(): Promise<GeneratedWorldSize> {
  try {
    const world = JSON.parse(await readFile(resolve(GENERATED_WORLD), "utf8")) as {
      mapWidthTiles?: unknown;
      mapHeightTiles?: unknown;
    };
    return {
      ...(Number.isInteger(world.mapWidthTiles) ? { mapWidthTiles: world.mapWidthTiles as number } : {}),
      ...(Number.isInteger(world.mapHeightTiles) ? { mapHeightTiles: world.mapHeightTiles as number } : {})
    };
  } catch {
    return {};
  }
}

async function copyEnemyActionEffects(outAbs: string): Promise<void> {
  const source = resolve(ENEMY_ACTION_EFFECTS_SOURCE);
  EnemyActionEffectsSchema.parse(JSON.parse(await readFile(source, "utf8")));
  const target = resolve(outAbs, ENEMY_ACTION_EFFECTS_OUTPUT);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function main(): Promise<void> {
  const projectAbs = resolve(EB_PROJECT);
  const outAbs = resolve(GENERATED_OUT);
  const tempOut = await mkdtemp(join(tmpdir(), "eb-battle-data-"));
  try {
    const worldSize = await readGeneratedWorldSize();
    const encounterBuild = await buildEncounterData({
      projectAbs,
      displayPath: EB_PROJECT,
      ...worldSize
    });
    const referencedBattleGroupIds = [...new Set([
      ...FORMATION_REGRESSION_GROUP_IDS,
      ...encounterBuild.referencedBattleGroupIds
    ])].sort((left, right) => left - right);
    const battle = await buildBattleData({
      projectAbs,
      outAbs: tempOut,
      displayPath: EB_PROJECT,
      referencedBattleGroupIds
    });
    await mkdir(outAbs, { recursive: true });
    await writeFile(resolve(outAbs, BATTLE_FILE), `${JSON.stringify(battle, null, 2)}\n`, "utf8");
    await copyEnemyActionEffects(outAbs);
    console.log(JSON.stringify({
      ok: true,
      out: GENERATED_OUT,
      battle: {
        enemies: battle.counts.enemies,
        groups: battle.counts.groups,
        warnings: battle.warnings.length
      },
      encounters: {
        referencedBattleGroups: referencedBattleGroupIds.length,
        warnings: encounterBuild.warnings.length
      },
      copied: [BATTLE_FILE, ENEMY_ACTION_EFFECTS_OUTPUT]
    }, null, 2));
  } finally {
    await rm(tempOut, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
