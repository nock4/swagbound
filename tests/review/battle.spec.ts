import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture
} from "./gameHarness";

type BattleDebug = {
  mode: "battle";
  phase: "menu" | "enemy-rolling" | "player-rolling" | "win" | "lose" | "flee";
  menuIndex: number;
  player: {
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  enemy: {
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  outcome: "ongoing" | "win" | "lose";
};

type BattleRun = {
  initial: BattleDebug;
  final: BattleDebug;
  enemyDisplayed: number[];
  playerDisplayed: number[];
  sawEnemyRolling: boolean;
  sawPlayerHpDecrease: boolean;
};

test("enters battle and BASH rolls the enemy HP odometer to a win", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const run = await runBattleToWin(page);

  expect(run.initial.enemy.hpDisplayed).toBeGreaterThan(0);
  expect(run.sawEnemyRolling, "enemy HP odometer should animate during at least one attack").toBe(true);
  expect(run.enemyDisplayed.some((value) => value < run.initial.enemy.hpDisplayed)).toBe(true);
  expect(run.enemyDisplayed.at(-1)).toBe(0);
  expect(run.final.outcome).toBe("win");
  expect(run.final.enemy.hpDisplayed).toBe(0);
  expectNeverIncreases(run.enemyDisplayed, "enemy displayed HP");
  assertNoRuntimeIssues(issues);
});

test("player takes counter-damage during the fight", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const run = await runBattleToWin(page);

  expect(run.initial.player.hpDisplayed).toBeGreaterThan(0);
  expect(Number.isFinite(run.initial.player.hpDisplayed)).toBe(true);
  expect(Number.isFinite(run.initial.player.hpTarget)).toBe(true);
  expect(run.sawPlayerHpDecrease, "player displayed HP should decrease after a counter-hit").toBe(true);
  expectNeverIncreases(run.playerDisplayed, "player displayed HP");
  assertNoRuntimeIssues(issues);
});

test("no console/page errors during a battle", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await runBattleToWin(page);
  assertNoRuntimeIssues(issues);
});

async function runBattleToWin(page: Page): Promise<BattleRun> {
  const initial = await gotoGeneratedBattle(page);
  const enemyDisplayed = [initial.enemy.hpDisplayed];
  const playerDisplayed = [initial.player.hpDisplayed];
  let sawEnemyRolling = initial.enemy.isRolling;
  let sawPlayerHpDecrease = false;
  let final = initial;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const state = await readRequiredBattleDebug(page);
    final = state;
    enemyDisplayed.push(state.enemy.hpDisplayed);
    playerDisplayed.push(state.player.hpDisplayed);
    sawEnemyRolling ||= state.enemy.isRolling;
    sawPlayerHpDecrease ||= state.player.hpDisplayed < initial.player.hpDisplayed;

    if (state.enemy.hpDisplayed === 0) {
      expect(state.outcome).toBe("win");
    }

    if (state.outcome === "win" && state.enemy.hpDisplayed === 0) {
      return {
        initial,
        final: state,
        enemyDisplayed,
        playerDisplayed,
        sawEnemyRolling,
        sawPlayerHpDecrease
      };
    }

    expect(state.outcome, "battle should not end in a loss or flee while driving BASH").not.toBe("lose");
    expect(state.phase, "battle should not flee while driving BASH").not.toBe("flee");

    if (state.phase === "menu") {
      expect(state.menuIndex, "BASH should stay selected for each confirm").toBe(0);
      await page.keyboard.press("Space");
    }
    await page.waitForTimeout(80);
  }

  await expect.poll(async () => {
    const state = await readRequiredBattleDebug(page);
    return state.outcome === "win" && state.enemy.hpDisplayed === 0;
  }, {
    message: "battle should finish with enemy displayed HP at zero",
    timeout: 2_000,
    intervals: [100, 150, 250]
  }).toBe(true);

  final = await readRequiredBattleDebug(page);
  enemyDisplayed.push(final.enemy.hpDisplayed);
  playerDisplayed.push(final.player.hpDisplayed);
  sawEnemyRolling ||= final.enemy.isRolling;
  sawPlayerHpDecrease ||= final.player.hpDisplayed < initial.player.hpDisplayed;
  return {
    initial,
    final,
    enemyDisplayed,
    playerDisplayed,
    sawEnemyRolling,
    sawPlayerHpDecrease
  };
}

async function gotoGeneratedBattle(page: Page): Promise<BattleDebug> {
  const groupId = await readFirstBattleGroupId(page);
  await page.goto(`/?battle=${groupId}`);
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(async () => {
    const state = await readBattleDebug(page);
    return Boolean(
      state &&
      state.mode === "battle" &&
      state.phase === "menu" &&
      state.outcome === "ongoing" &&
      state.menuIndex === 0 &&
      state.enemy.hpDisplayed > 0 &&
      Number.isFinite(state.player.hpDisplayed) &&
      Number.isFinite(state.enemy.hpDisplayed)
    );
  }, {
    message: "battle debug state should reach the menu",
    timeout: 10_000,
    intervals: [100, 150, 250, 500]
  }).toBe(true);

  const state = await readRequiredBattleDebug(page);
  expectBattleNumbers(state);
  return state;
}

async function readFirstBattleGroupId(page: Page): Promise<number> {
  const response = await page.request.get("/generated/battle.json");
  expect(response.ok(), "generated battle data should be available").toBe(true);
  const data = await response.json() as { groups?: Array<{ id?: unknown }> };
  const id = data.groups?.[0]?.id;
  expect(typeof id, "generated battle data should include a numeric group id").toBe("number");
  expect(Number.isInteger(id)).toBe(true);
  expect(id).toBeGreaterThanOrEqual(0);
  return id as number;
}

async function readRequiredBattleDebug(page: Page): Promise<BattleDebug> {
  const state = await readBattleDebug(page);
  expect(state, "battle debug state should exist").toBeDefined();
  expect(state?.mode).toBe("battle");
  expectBattleNumbers(state as BattleDebug);
  return state as BattleDebug;
}

async function readBattleDebug(page: Page): Promise<BattleDebug | undefined> {
  return page.evaluate(() => (globalThis as unknown as { __battleDebug?: BattleDebug }).__battleDebug);
}

function expectBattleNumbers(state: BattleDebug): void {
  expect(Number.isFinite(state.menuIndex)).toBe(true);
  expect(Number.isFinite(state.player.hpDisplayed)).toBe(true);
  expect(Number.isFinite(state.player.hpTarget)).toBe(true);
  expect(Number.isFinite(state.enemy.hpDisplayed)).toBe(true);
  expect(Number.isFinite(state.enemy.hpTarget)).toBe(true);
  expect(typeof state.player.isRolling).toBe("boolean");
  expect(typeof state.enemy.isRolling).toBe("boolean");
}

function expectNeverIncreases(values: number[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index], `${label} should not increase`).toBeLessThanOrEqual(values[index - 1]);
  }
}
