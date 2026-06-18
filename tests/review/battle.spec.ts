import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  tapKeyUntil,
  waitForDebug
} from "./gameHarness";

type BattleSfxCueDebug =
  | "menuMove"
  | "menuConfirm"
  | "menuCancel"
  | "swing"
  | "hit"
  | "smash"
  | "miss"
  | "psi"
  | "heal"
  | "hpTick"
  | "enemyDown"
  | "run"
  | "victory";

type BattleDebug = {
  mode: "battle";
  phase:
    | "enter-transition"
    | "menu"
    | "command-input"
    | "execution"
    | "enemy-rolling"
    | "player-rolling"
    | "victory-summary"
    | "exit-transition"
    | "win"
    | "lose"
    | "flee";
  transitionPhase: "none" | "enter" | "summary" | "exit";
  menuIndex: number;
  roundNumber: number;
  commandIndex: number;
  command: "BASH" | "GOODS" | "AUTO" | "PSI" | "SPY" | "PRAY" | "MIRROR" | "DEFEND" | "RUN";
  targetIndex: number;
  partyTargetIndex: number;
  submenu: "command" | "psi" | "goods" | "target";
  submenuIndex: number;
  selection: string;
  turnOrder: Array<{ side: "party" | "enemy"; index: number }>;
  currentActor: { side: "party" | "enemy"; index: number } | null;
  inputMemberIndex: number | null;
  queuedCount: number;
  executionStepIndex: number;
  executionStepCount: number;
  executionMessage: string;
  lastSfx: BattleSfxCueDebug | null;
  sfxCount: number;
  fx: {
    shakeCount: number;
    sparkCount: number;
    flashCount: number;
    lungeCount: number;
  };
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
  pp: number;
  maxPp: number;
  inventoryCount: number;
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
  sawHpTickSfx: boolean;
  sawVictorySfx: boolean;
  sawVictorySummary: boolean;
  sawExitTransition: boolean;
  sawShakeFx: boolean;
  sawSparkFx: boolean;
  sawFlashFx: boolean;
  sawLungeFx: boolean;
};

test("enters battle and BASH rolls the enemy HP odometer to a win", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const run = await runBattleToWin(page);

  expect(run.initial.enemies.some((enemy) => enemy.hpDisplayed > 0)).toBe(true);
  expect(run.sawEnemyRolling, "an enemy HP odometer should animate during at least one attack").toBe(true);
  expect(run.sawHpTickSfx, "rolling HP/PP should dispatch hpTick SFX").toBe(true);
  expect(run.sawShakeFx, "damaging steps should trigger screen shake").toBe(true);
  expect(run.sawSparkFx, "damaging steps should trigger hit sparks").toBe(true);
  expect(run.sawFlashFx, "attacks and victory should trigger flash overlays").toBe(true);
  expect(run.enemyDisplayedTotals.some((value) => value < totalDisplayed(run.initial.enemies))).toBe(true);
  expect(run.enemyDisplayedTotals.at(-1)).toBe(0);
  expect(run.final.outcome).toBe("win");
  expect(run.sawVictorySfx, "winning should dispatch victory SFX").toBe(true);
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
  expect(run.sawLungeFx, "enemy attacks should trigger an attacker lunge").toBe(true);
  expectNeverIncreases(run.partyDisplayedTotals, "party total displayed HP");
  assertNoRuntimeIssues(issues);
});

test("no console/page errors during a battle", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await runBattleToWin(page);
  assertNoRuntimeIssues(issues);
});

test("solo command input queues BASH before execution", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoBattleCommandInput(page);

  expect(initial.party).toHaveLength(1);
  expect(initial.inputMemberIndex).toBe(0);
  expect(initial.queuedCount).toBe(0);
  expect(initial.submenu).toBe("command");
  expect(initial.command).toBe("BASH");
  expect(initial.executionStepIndex).toBe(-1);

  const execution = await tapBattleKeyUntil(page, "Space", (state) =>
    state.phase === "execution" &&
    state.inputMemberIndex === null &&
    state.queuedCount === 1 &&
    state.executionStepIndex >= 0 &&
    state.executionStepCount > 0 &&
    state.sfxCount > initial.sfxCount + 1 &&
    isExecutionBattleSfx(state.lastSfx)
  );

  expect(execution.party).toHaveLength(1);
  expect(execution.targetIndex).toBe(0);
  expect(execution.enemies[execution.targetIndex]?.alive ?? false).toBe(true);

  const result = await watchExecutionWithoutCommandMenu(page);
  expect(result.sawExecution, "round should enter execution").toBe(true);
  expect(result.executionStepIndexes.some((index) => index >= 0)).toBe(true);
  expectRoundResolved(result.final);
  assertNoRuntimeIssues(issues);
});

test("multi-member command input supports backtracking and ally recovery targeting before execution", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoBattleCommandInput(page, 3);

  expect(initial.party).toHaveLength(3);
  expect(initial.inputMemberIndex).toBe(0);
  expect(initial.queuedCount).toBe(0);
  expect(initial.command).toBe("BASH");
  expect(initial.enemies[initial.targetIndex]?.alive ?? false).toBe(true);

  let state = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "command" &&
    debug.lastSfx === "menuConfirm" &&
    debug.sfxCount > initial.sfxCount
  );
  expect(state.currentActor).toEqual({ side: "party", index: 1 });
  expect(state.command).toBe("BASH");

  state = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 2 &&
    debug.queuedCount === 2 &&
    debug.submenu === "command" &&
    debug.lastSfx === "menuConfirm" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.currentActor).toEqual({ side: "party", index: 2 });

  state = await tapBattleKeyUntil(page, "Escape", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "command" &&
    debug.lastSfx === "menuCancel" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.currentActor).toEqual({ side: "party", index: 1 });
  expect(state.command).toBe("BASH");

  state = await tapBattleKeyUntil(page, "ArrowRight", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "command" &&
    debug.command === "GOODS" &&
    debug.lastSfx === "menuMove" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.menuIndex).toBe(1);

  state = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "goods" &&
    debug.selection === "item:0:103" &&
    debug.lastSfx === "menuConfirm" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.party[1]?.inventoryCount).toBeGreaterThanOrEqual(1);

  state = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "target" &&
    debug.selection === "target:item:0:103" &&
    debug.partyTargetIndex === 0 &&
    debug.lastSfx === "menuConfirm" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.party[state.partyTargetIndex]?.alive ?? false).toBe(true);

  state = await tapBattleKeyUntil(page, "ArrowRight", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 1 &&
    debug.queuedCount === 1 &&
    debug.submenu === "target" &&
    debug.selection === "target:item:0:103" &&
    debug.partyTargetIndex === 1 &&
    debug.lastSfx === "menuMove" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.targetIndex).toBe(0);
  expect(state.party[state.partyTargetIndex]?.alive ?? false).toBe(true);

  state = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "command-input" &&
    debug.inputMemberIndex === 2 &&
    debug.queuedCount === 2 &&
    debug.submenu === "command" &&
    debug.lastSfx === "menuConfirm" &&
    debug.sfxCount > state.sfxCount
  );
  expect(state.currentActor).toEqual({ side: "party", index: 2 });

  const execution = await tapBattleKeyUntil(page, "Space", (debug) =>
    debug.phase === "execution" &&
    debug.inputMemberIndex === null &&
    debug.queuedCount === 3 &&
    debug.executionStepIndex >= 0 &&
    debug.executionStepCount >= 3
  );
  expect(execution.party).toHaveLength(3);
  expect(execution.executionStepCount).toBeGreaterThanOrEqual(3);

  const result = await watchExecutionWithoutCommandMenu(page, 3);
  expect(result.sawExecution, "round should execute after all party commands are queued").toBe(true);
  expect(result.executionStepIndexes.some((index) => index >= 0)).toBe(true);
  expectRoundResolved(result.final);
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
  let sawHpTickSfx = initial.lastSfx === "hpTick";
  let sawVictorySfx = initial.lastSfx === "victory";
  let sawVictorySummary = false;
  let sawExitTransition = false;
  let sawShakeFx = false;
  let sawSparkFx = false;
  let sawFlashFx = false;
  let sawLungeFx = false;
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
    sawHpTickSfx ||= state.lastSfx === "hpTick";
    sawVictorySfx ||= state.lastSfx === "victory";
    sawVictorySummary ||= state.phase === "victory-summary" && Boolean(state.victorySummary);
    sawExitTransition ||= state.phase === "exit-transition";
    sawShakeFx ||= state.fx.shakeCount > initial.fx.shakeCount;
    sawSparkFx ||= state.fx.sparkCount > initial.fx.sparkCount;
    sawFlashFx ||= state.fx.flashCount > initial.fx.flashCount;
    sawLungeFx ||= state.fx.lungeCount > initial.fx.lungeCount;

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
        sawHpTickSfx,
        sawVictorySfx,
        sawVictorySummary,
        sawExitTransition,
        sawShakeFx,
        sawSparkFx,
        sawFlashFx,
        sawLungeFx
      };
    }

    expect(state.outcome, "battle should not end in a loss or flee while driving BASH").not.toBe("lose");
    expect(state.phase, "battle should not flee while driving BASH").not.toBe("flee");

    if (state.phase === "command-input") {
      if (state.submenu === "command") {
        expect(state.menuIndex, "BASH should stay selected for each command confirm").toBe(0);
      }
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
  sawHpTickSfx ||= final.lastSfx === "hpTick";
  sawVictorySfx ||= final.lastSfx === "victory";
  sawVictorySummary ||= final.phase === "victory-summary" && Boolean(final.victorySummary);
  sawShakeFx ||= final.fx.shakeCount > initial.fx.shakeCount;
  sawSparkFx ||= final.fx.sparkCount > initial.fx.sparkCount;
  sawFlashFx ||= final.fx.flashCount > initial.fx.flashCount;
  sawLungeFx ||= final.fx.lungeCount > initial.fx.lungeCount;
  if (final.phase === "victory-summary") {
    final = await dismissVictorySummary(page);
    sawExitTransition ||= final.phase === "exit-transition";
    sawShakeFx ||= final.fx.shakeCount > initial.fx.shakeCount;
    sawSparkFx ||= final.fx.sparkCount > initial.fx.sparkCount;
    sawFlashFx ||= final.fx.flashCount > initial.fx.flashCount;
    sawLungeFx ||= final.fx.lungeCount > initial.fx.lungeCount;
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
    sawHpTickSfx,
    sawVictorySfx,
    sawVictorySummary,
    sawExitTransition,
    sawShakeFx,
    sawSparkFx,
    sawFlashFx,
    sawLungeFx
  };
}

async function gotoGeneratedBattle(page: Page, partySize = 1): Promise<BattleDebug> {
  const groupId = await readFirstBattleGroupId(page);
  const partyParam = partySize === 1 ? "" : `&party=${partySize}`;
  await page.goto(`/?battle=${groupId}${partyParam}`);
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(async () => {
    const state = await readBattleDebug(page);
    return Boolean(
      state &&
      state.mode === "battle" &&
      state.outcome === "ongoing" &&
      state.menuIndex === 0 &&
      state.party.length === partySize &&
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

async function gotoBattleCommandInput(page: Page, partySize = 1): Promise<BattleDebug> {
  await gotoGeneratedBattle(page, partySize);
  return waitForBattleDebug(page, (state) =>
    state.phase === "command-input" &&
    state.inputMemberIndex === 0 &&
    state.queuedCount === 0 &&
    state.party.length === partySize &&
    state.submenu === "command"
  );
}

async function waitForBattleDebug(
  page: Page,
  predicate: (state: BattleDebug) => boolean
): Promise<BattleDebug> {
  const state = (await waitForDebug(page, (debug) =>
    debug.mode === "battle" && predicate(debug as unknown as BattleDebug)
  )) as unknown as BattleDebug;
  expectBattleNumbers(state);
  return state;
}

async function tapBattleKeyUntil(
  page: Page,
  key: string,
  predicate: (state: BattleDebug) => boolean,
  attempts = 10
): Promise<BattleDebug> {
  const state = (await tapKeyUntil(page, key, (debug) =>
    debug.mode === "battle" && predicate(debug as unknown as BattleDebug),
  attempts)) as unknown as BattleDebug;
  expect(state.mode).toBe("battle");
  expectBattleNumbers(state);
  expect(predicate(state), `${key} should drive battle debug to the expected state`).toBe(true);
  return state;
}

async function watchExecutionWithoutCommandMenu(
  page: Page,
  expectedQueuedCount?: number
): Promise<{ final: BattleDebug; sawExecution: boolean; executionStepIndexes: number[] }> {
  const executionStepIndexes: number[] = [];
  let sawExecution = false;
  let final = await readRequiredBattleDebug(page);
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const state = await readRequiredBattleDebug(page);
    final = state;
    if (state.phase === "execution") {
      sawExecution = true;
      executionStepIndexes.push(state.executionStepIndex);
      expect(state.executionMessage.trim(), "execution should expose the current narration text").not.toBe("");
      expect(state.inputMemberIndex, "command input should be closed throughout execution").toBeNull();
      if (expectedQueuedCount !== undefined) {
        expect(state.queuedCount).toBe(expectedQueuedCount);
      }
      await page.waitForTimeout(60);
      continue;
    }
    if (sawExecution) {
      return { final, sawExecution, executionStepIndexes };
    }
    await page.waitForTimeout(60);
  }

  expect(sawExecution, "battle should spend time in execution").toBe(true);
  return { final, sawExecution, executionStepIndexes };
}

function expectRoundResolved(state: BattleDebug): void {
  if (state.outcome === "ongoing") {
    expect(state.phase).toBe("command-input");
    expect(state.inputMemberIndex).toBe(0);
    expect(state.queuedCount).toBe(0);
    return;
  }
  expect(state.outcome).toBe("win");
  expect(["victory-summary", "exit-transition", "win"]).toContain(state.phase);
}

async function readFirstBattleGroupId(page: Page): Promise<number> {
  const response = await page.request.get("/generated/battle.json");
  expect(response.ok(), "generated battle data should be available").toBe(true);
  const data = await response.json() as { groups?: Array<{ id?: unknown; enemyIds?: unknown }> };
  const group = data.groups?.find((entry) =>
    typeof entry.id === "number" &&
    Array.isArray(entry.enemyIds) &&
    entry.enemyIds.length > 0
  );
  const id = group?.id;
  expect(typeof id, "generated battle data should include a numeric group id with enemies").toBe("number");
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
  expect(Number.isInteger(state.roundNumber)).toBe(true);
  expect(state.roundNumber).toBeGreaterThanOrEqual(1);
  expect(Number.isFinite(state.targetIndex)).toBe(true);
  expect(state.inputMemberIndex === null || Number.isInteger(state.inputMemberIndex)).toBe(true);
  expect(Number.isInteger(state.queuedCount)).toBe(true);
  expect(Number.isInteger(state.executionStepIndex)).toBe(true);
  expect(Number.isInteger(state.executionStepCount)).toBe(true);
  expect(typeof state.executionMessage).toBe("string");
  expect(state.lastSfx === null || typeof state.lastSfx === "string").toBe(true);
  expect(Number.isInteger(state.sfxCount)).toBe(true);
  expect(state.sfxCount).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(state.fx.shakeCount)).toBe(true);
  expect(Number.isInteger(state.fx.sparkCount)).toBe(true);
  expect(Number.isInteger(state.fx.flashCount)).toBe(true);
  expect(Number.isInteger(state.fx.lungeCount)).toBe(true);
  expect(state.fx.shakeCount).toBeGreaterThanOrEqual(0);
  expect(state.fx.sparkCount).toBeGreaterThanOrEqual(0);
  expect(state.fx.flashCount).toBeGreaterThanOrEqual(0);
  expect(state.fx.lungeCount).toBeGreaterThanOrEqual(0);
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

function isExecutionBattleSfx(cue: BattleSfxCueDebug | null): boolean {
  return cue === "swing" ||
    cue === "hit" ||
    cue === "smash" ||
    cue === "miss" ||
    cue === "psi" ||
    cue === "heal" ||
    cue === "enemyDown" ||
    cue === "run" ||
    cue === "hpTick";
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
