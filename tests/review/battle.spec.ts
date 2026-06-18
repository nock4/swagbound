import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture
} from "./gameHarness";

type BattleDebug = {
  mode: "battle";
  phase:
    | "enter-transition"
    | "menu"
    | "enemy-rolling"
    | "player-rolling"
    | "victory-summary"
    | "exit-transition"
    | "win"
    | "lose"
    | "flee";
  transitionPhase: "none" | "enter" | "summary" | "exit";
  menuIndex: number;
  targetIndex: number;
  turnOrder: Array<{ side: "party" | "enemy"; index: number }>;
  currentActor: { side: "party" | "enemy"; index: number } | null;
  lastEnemyAction: {
    enemyIndex: number;
    actionIndex: number;
    actionId: number;
    actionType: number | null;
    target: number | null;
  } | null;
  party: BattleCombatantDebug[];
  enemies: BattleCombatantDebug[];
  background: {
    animated: boolean;
    mode: "horizontal-smooth" | "horizontal-interlaced" | "vertical-compression" | "none";
    scrollX: number;
    scrollY: number;
    warpSample: number;
  };
  player?: {
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  enemy?: BattleCombatantDebug;
  outcome: "ongoing" | "win" | "lose";
  victorySummary: {
    expGained: number;
    moneyGained: number;
    drops: Array<{ enemyId: number; itemId: number; itemName: string; recipientCharId: number }>;
    levelUps: Array<{ charId: number; name: string; fromLevel: number; toLevel: number }>;
  } | null;
};

type BattleCombatantDebug = {
  hpDisplayed: number;
  hpTarget: number;
  isRolling: boolean;
  alive: boolean;
};

type BattleRun = {
  initial: BattleDebug;
  final: BattleDebug;
  enemyDisplayedTotals: number[];
  partyDisplayedTotals: number[];
  enemyDisplayedByIndex: number[][];
  targetedEnemyIndexes: number[];
  sawEnemyDisplayedDecreaseByIndex: boolean[];
  sawEnemyRolling: boolean;
  sawPartyHpDecrease: boolean;
  sawVictorySummary: boolean;
  sawExitTransition: boolean;
};

test("enters battle and BASH rolls the enemy HP odometer to a win", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const run = await runBattleToWin(page);

  expect(run.initial.enemies.some((enemy) => enemy.hpDisplayed > 0)).toBe(true);
  expect(run.sawEnemyRolling, "an enemy HP odometer should animate during at least one attack").toBe(true);
  expect(run.enemyDisplayedTotals.some((value) => value < totalDisplayed(run.initial.enemies))).toBe(true);
  expect(run.enemyDisplayedTotals.at(-1)).toBe(0);
  expect(run.final.outcome).toBe("win");
  expect(run.sawVictorySummary, "victory summary should appear before battle exit").toBe(true);
  expect(run.sawExitTransition, "victory summary should dismiss into the exit transition").toBe(true);
  expect(run.final.victorySummary?.expGained).toBeGreaterThanOrEqual(0);
  expect(run.final.victorySummary?.moneyGained).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(run.final.victorySummary?.drops)).toBe(true);
  expect(Array.isArray(run.final.victorySummary?.levelUps)).toBe(true);
  expect(run.final.enemies.every((enemy) => enemy.hpDisplayed === 0)).toBe(true);
  for (const index of initiallyLivingEnemyIndexes(run.initial)) {
    expect(run.targetedEnemyIndexes, `enemy index ${index} should be targeted before win`).toContain(index);
    expect(run.sawEnemyDisplayedDecreaseByIndex[index], `enemy index ${index} displayed HP should strictly decrease`).toBe(true);
  }
  expectNeverIncreases(run.enemyDisplayedTotals, "enemy total displayed HP");
  assertNoRuntimeIssues(issues);
});

test("player takes counter-damage during the fight", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const run = await runBattleToWin(page);

  expect(run.initial.party.some((member) => member.hpDisplayed > 0)).toBe(true);
  expect(run.initial.party.every((member) => Number.isFinite(member.hpDisplayed))).toBe(true);
  expect(run.initial.party.every((member) => Number.isFinite(member.hpTarget))).toBe(true);
  expect(run.sawPartyHpDecrease, "party displayed HP should decrease after a counter-hit").toBe(true);
  expectNeverIncreases(run.partyDisplayedTotals, "party total displayed HP");
  assertNoRuntimeIssues(issues);
});

test("no console/page errors during a battle", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await runBattleToWin(page);
  assertNoRuntimeIssues(issues);
});

async function runBattleToWin(page: Page): Promise<BattleRun> {
  const initial = await gotoGeneratedBattle(page);
  const initialEnemyDisplayed = totalDisplayed(initial.enemies);
  const initialPartyDisplayed = totalDisplayed(initial.party);
  const enemyDisplayedTotals = [initialEnemyDisplayed];
  const partyDisplayedTotals = [initialPartyDisplayed];
  const enemyDisplayedByIndex = initial.enemies.map((enemy) => [enemy.hpDisplayed]);
  const sawEnemyDisplayedDecreaseByIndex = initial.enemies.map(() => false);
  const targetedEnemyIndexes = new Set<number>();
  let sawEnemyRolling = initial.enemies.some((enemy) => enemy.isRolling);
  let sawPartyHpDecrease = false;
  let sawVictorySummary = false;
  let sawExitTransition = false;
  let final = initial;
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    let state = await readRequiredBattleDebug(page);
    final = state;
    const enemyDisplayed = totalDisplayed(state.enemies);
    const partyDisplayed = totalDisplayed(state.party);
    enemyDisplayedTotals.push(enemyDisplayed);
    // Only sample party HP while the fight is ongoing: winning triggers a
    // level-up that legitimately RAISES party HP, which must not count against
    // the monotonic-decrease (counter-damage) check below.
    if (state.outcome !== "win") {
      partyDisplayedTotals.push(partyDisplayed);
    }
    recordEnemyDisplayed(
      enemyDisplayedByIndex,
      sawEnemyDisplayedDecreaseByIndex,
      state.enemies
    );
    sawEnemyRolling ||= state.enemies.some((enemy) => enemy.isRolling);
    sawPartyHpDecrease ||= partyDisplayed < initialPartyDisplayed;
    sawVictorySummary ||= state.phase === "victory-summary" && Boolean(state.victorySummary);
    sawExitTransition ||= state.phase === "exit-transition";

    if (state.enemies.every((enemy) => enemy.hpDisplayed === 0)) {
      expect(state.outcome).toBe("win");
    }

    if (state.outcome === "win" && state.enemies.every((enemy) => enemy.hpDisplayed === 0) && state.phase === "victory-summary") {
      final = await dismissVictorySummary(page);
      sawExitTransition ||= final.phase === "exit-transition";
      return {
        initial,
        final,
        enemyDisplayedTotals,
        partyDisplayedTotals,
        enemyDisplayedByIndex,
        targetedEnemyIndexes: [...targetedEnemyIndexes],
        sawEnemyDisplayedDecreaseByIndex,
        sawEnemyRolling,
        sawPartyHpDecrease,
        sawVictorySummary,
        sawExitTransition
      };
    }

    expect(state.outcome, "battle should not end in a loss or flee while driving BASH").not.toBe("lose");
    expect(state.phase, "battle should not flee while driving BASH").not.toBe("flee");

    if (state.phase === "menu") {
      expect(state.menuIndex, "BASH should stay selected for each confirm").toBe(0);
      state = await selectViableEnemyTarget(page, state);
      expect(state.enemies[state.targetIndex]?.alive, "BASH target should be a living enemy").toBe(true);
      targetedEnemyIndexes.add(state.targetIndex);
      await page.keyboard.press("Space");
    }
    await page.waitForTimeout(80);
  }

  await expect.poll(async () => {
    const state = await readRequiredBattleDebug(page);
    return state.outcome === "win" && state.enemies.every((enemy) => enemy.hpDisplayed === 0);
  }, {
    message: "battle should finish with every enemy displayed HP at zero",
    timeout: 2_000,
    intervals: [100, 150, 250]
  }).toBe(true);

  final = await readRequiredBattleDebug(page);
  enemyDisplayedTotals.push(totalDisplayed(final.enemies));
  partyDisplayedTotals.push(totalDisplayed(final.party));
  recordEnemyDisplayed(
    enemyDisplayedByIndex,
    sawEnemyDisplayedDecreaseByIndex,
    final.enemies
  );
  sawEnemyRolling ||= final.enemies.some((enemy) => enemy.isRolling);
  sawPartyHpDecrease ||= totalDisplayed(final.party) < initialPartyDisplayed;
  sawVictorySummary ||= final.phase === "victory-summary" && Boolean(final.victorySummary);
  if (final.phase === "victory-summary") {
    final = await dismissVictorySummary(page);
    sawExitTransition ||= final.phase === "exit-transition";
  }
  return {
    initial,
    final,
    enemyDisplayedTotals,
    partyDisplayedTotals,
    enemyDisplayedByIndex,
    targetedEnemyIndexes: [...targetedEnemyIndexes],
    sawEnemyDisplayedDecreaseByIndex,
    sawEnemyRolling,
    sawPartyHpDecrease,
    sawVictorySummary,
    sawExitTransition
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
      state.outcome === "ongoing" &&
      state.menuIndex === 0 &&
      state.party.length > 0 &&
      state.enemies.length > 0 &&
      state.enemies.some((enemy) => enemy.hpDisplayed > 0) &&
      state.party.every((member) => Number.isFinite(member.hpDisplayed)) &&
      state.enemies.every((enemy) => Number.isFinite(enemy.hpDisplayed))
    );
  }, {
    message: "battle debug state should initialize",
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

async function dismissVictorySummary(page: Page): Promise<BattleDebug> {
  await page.keyboard.press("Space");
  await expect.poll(async () => {
    const state = await readBattleDebug(page);
    return state?.phase === "exit-transition" && state.outcome === "win";
  }, {
    message: "victory summary should dismiss into the battle exit transition",
    timeout: 1_000,
    intervals: [20, 40, 80, 120]
  }).toBe(true);
  const state = await readRequiredBattleDebug(page);
  expect(state.outcome).toBe("win");
  expect(state.phase).toBe("exit-transition");
  return state;
}

function expectBattleNumbers(state: BattleDebug): void {
  expect(Number.isFinite(state.menuIndex)).toBe(true);
  expect(Number.isFinite(state.targetIndex)).toBe(true);
  expect(["none", "enter", "summary", "exit"]).toContain(state.transitionPhase);
  expect(Array.isArray(state.turnOrder)).toBe(true);
  expect(state.party.length).toBeGreaterThan(0);
  expect(state.enemies.length).toBeGreaterThan(0);
  expect(typeof state.background.animated).toBe("boolean");
  expect(["horizontal-smooth", "horizontal-interlaced", "vertical-compression", "none"]).toContain(state.background.mode);
  expect(Number.isFinite(state.background.scrollX)).toBe(true);
  expect(Number.isFinite(state.background.scrollY)).toBe(true);
  expect(Number.isFinite(state.background.warpSample)).toBe(true);
  if (state.lastEnemyAction) {
    expect(Number.isInteger(state.lastEnemyAction.enemyIndex)).toBe(true);
    expect(Number.isInteger(state.lastEnemyAction.actionIndex)).toBe(true);
    expect(Number.isInteger(state.lastEnemyAction.actionId)).toBe(true);
    expect(state.lastEnemyAction.actionType === null || Number.isInteger(state.lastEnemyAction.actionType)).toBe(true);
    expect(state.lastEnemyAction.target === null || Number.isInteger(state.lastEnemyAction.target)).toBe(true);
  }
  for (const member of [...state.party, ...state.enemies]) {
    expect(Number.isFinite(member.hpDisplayed)).toBe(true);
    expect(Number.isFinite(member.hpTarget)).toBe(true);
    expect(typeof member.isRolling).toBe("boolean");
    expect(typeof member.alive).toBe("boolean");
  }
}

function expectNeverIncreases(values: number[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index], `${label} should not increase`).toBeLessThanOrEqual(values[index - 1]);
  }
}

function totalDisplayed(combatants: BattleCombatantDebug[]): number {
  return combatants.reduce((sum, combatant) => sum + combatant.hpDisplayed, 0);
}

async function selectViableEnemyTarget(page: Page, state: BattleDebug): Promise<BattleDebug> {
  let current = state;
  for (let attempt = 0; attempt <= current.enemies.length; attempt += 1) {
    const desiredTargets = desiredTargetIndexes(current);
    if (desiredTargets.includes(current.targetIndex)) {
      return current;
    }
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(40);
    current = await readRequiredBattleDebug(page);
  }
  return current;
}

function recordEnemyDisplayed(
  histories: number[][],
  sawDecreaseByIndex: boolean[],
  enemies: BattleCombatantDebug[]
): void {
  enemies.forEach((enemy, index) => {
    const history = histories[index] ?? [];
    const previous = history.at(-1);
    if (previous !== undefined && enemy.hpDisplayed < previous) {
      sawDecreaseByIndex[index] = true;
    }
    history.push(enemy.hpDisplayed);
    histories[index] = history;
  });
}

function initiallyLivingEnemyIndexes(state: BattleDebug): number[] {
  return state.enemies.flatMap((enemy, index) => (enemy.hpDisplayed > 0 ? [index] : []));
}

function desiredTargetIndexes(state: BattleDebug): number[] {
  const withRemainingTargetHp = state.enemies.flatMap((enemy, index) =>
    enemy.alive && enemy.hpTarget > 0 ? [index] : []
  );
  if (withRemainingTargetHp.length > 0) {
    return withRemainingTargetHp;
  }
  return state.enemies.flatMap((enemy, index) => (enemy.alive ? [index] : []));
}
