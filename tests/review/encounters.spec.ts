import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  readRequiredDebug,
  waitForDebug,
  type FirstSceneDebug
} from "./gameHarness";
import { walkableFootprintClear } from "../../apps/game/src/collisionFootprint";

type ForceEncounterResult =
  | { started: true; enemyGroup: number }
  | { started: false; reason: string; enemyGroup?: number };

test("forced field encounter round-trips from overworld to battle and back", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const spawn = await firstEncounterSpawn(page);

  await page.goto(`/?encounterSeed=12345&spawn=${spawn.x},${spawn.y}&nointro=1`);
  await expect(page.locator("canvas")).toBeVisible();
  const initial = await waitForDebug(page, (state) =>
    state.mode === "world" &&
    state.encounterEnabled === true &&
    state.currentSectorIndex === spawn.sectorIndex &&
    Boolean(state.player)
  );
  expect(initial.returnContextActive).toBe(false);

  const forceResult = await page.evaluate((): ForceEncounterResult => {
    const hook = (globalThis as unknown as {
      __forceEncounter?: (groupId?: number) => ForceEncounterResult;
    }).__forceEncounter;
    return hook ? hook() : { started: false, reason: "missing __forceEncounter" };
  });
  expect(forceResult).toMatchObject({ started: true });

  const battle = await waitForDebug(page, (state) =>
    state.mode === "battle" &&
    state.outcome === "ongoing" &&
    (state.enemies?.length ?? 0) > 0 &&
    (state.party?.length ?? 0) > 0
  );
  expect(battle.mode).toBe("battle");

  await chooseRunAndFlee(page);

  const returned = await waitForDebug(page, (state) =>
    state.mode === "world" &&
    state.returnContextActive === true &&
    state.lastEncounterGroup === forceResult.enemyGroup &&
    (state.encounterCooldownMs ?? 0) > 0 &&
    state.inputLocked === false &&
    Boolean(state.player)
  );

  expect(returned.player?.x).toBeCloseTo(initial.player!.x, 3);
  expect(returned.player?.y).toBeCloseTo(initial.player!.y, 3);
  expect(returned.encounterEnabled).toBe(true);
  expect(returned.currentSectorIndex).toBe(spawn.sectorIndex);
  assertNoRuntimeIssues(issues);
});

async function chooseRunAndFlee(page: Page): Promise<FirstSceneDebug> {
  await waitForDebug(page, (state) => state.mode === "battle" && state.phase === "menu" && state.currentActor?.side === "party");
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const state = await readRequiredDebug(page);
    if (state.command === "RUN") {
      await page.keyboard.press("Space");
      await waitForDebug(page, (next) => next.mode === "battle" && next.phase === "flee");
      await page.keyboard.press("Space");
      return state;
    }
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(80);
  }
  const final = await readRequiredDebug(page);
  expect(final.command, "battle menu should be able to select RUN").toBe("RUN");
  return final;
}

async function firstEncounterSpawn(page: Page): Promise<{ x: number; y: number; sectorIndex: number }> {
  const encounters = await (await page.request.get("/generated/encounters.json")).json() as {
    sectorWidthTiles: number;
    sectorHeightTiles: number;
    sectorsPerRow: number;
    sectors: Record<string, {
      subGroups: Array<{ candidates: Array<{ enemyGroup: number; probability: number }> }>;
    }>;
  };
  const world = await (await page.request.get("/generated/world.json")).json() as {
    tileSize: number;
    collision: { cellSize: number; width: number; height: number; solidRows: string[] };
  };
  for (const key of Object.keys(encounters.sectors)) {
    const sector = encounters.sectors[key];
    if (!sector?.subGroups.some((subGroup) => subGroup.candidates.length > 0)) {
      continue;
    }
    const sectorIndex = Number(key);
    const col = sectorIndex % encounters.sectorsPerRow;
    const row = Math.floor(sectorIndex / encounters.sectorsPerRow);
    const minTileX = col * encounters.sectorWidthTiles;
    const minTileY = row * encounters.sectorHeightTiles;
    for (let tileY = minTileY; tileY < minTileY + encounters.sectorHeightTiles; tileY += 1) {
      for (let tileX = minTileX; tileX < minTileX + encounters.sectorWidthTiles; tileX += 1) {
        const point = {
          x: tileX * world.tileSize + Math.floor(world.tileSize / 2),
          y: tileY * world.tileSize + world.tileSize - 1
        };
        if (!surfaceBlocked(point, world.collision)) {
          return { ...point, sectorIndex };
        }
      }
    }
  }
  throw new Error("generated encounters should include a walkable sector with candidates");
}

function surfaceBlocked(
  point: { x: number; y: number },
  collision: { cellSize: number; width: number; height: number; solidRows: string[] }
): boolean {
  return !walkableFootprintClear(point, collision.solidRows, collision);
}
