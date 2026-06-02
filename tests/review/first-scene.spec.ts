import { expect, type Page, test } from "@playwright/test";

type FirstSceneDebug = {
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
  targetReference: string;
  player?: { x: number; y: number };
  npc?: { x: number; y: number };
  prompt: string;
  distanceToNpc?: number;
  inInteractionRange: boolean;
  movementBounds: { minX: number; maxX: number; minY: number; maxY: number };
  statusLines: string[];
  metadataLines: string[];
  tutorial?: {
    steps: number;
    passed: number;
    failed: number;
    blocked: number;
    unknown: number;
  };
  resolveStatus: string;
};

type RuntimeIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

test("first scene loads import status and plays imported dialogue", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);

  const initial = await waitForDebug(page);
  expect(initial.statusLines.join("\n")).toContain("First Scene: CoilSnake Import");
  expect(initial.statusLines.join("\n")).toContain("Project: found");
  expect(initial.statusLines.join("\n")).toContain("Scripts: 1 files");
  expect(initial.statusLines.join("\n")).toContain("NPC refs: 2");
  expect(initial.metadataLines.join("\n")).toContain("SpriteGroups/005.png: detected");
  expect(initial.resolveStatus).toBe("script + npc ref");

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2_850);
  await page.keyboard.up("ArrowRight");

  await expect.poll(() => readDebug(page), {
    message: "approaching the marker should show an interaction hint"
  }).toMatchObject({
    inInteractionRange: true,
    prompt: "Space/Enter: talk to the imported script marker"
  });

  await page.keyboard.press("Enter");

  await expect.poll(() => readDebug(page), {
    message: "interacting with marker should open imported dialogue"
  }).toMatchObject({
    dialogueOpen: true,
    dialogueText: "@Hello World!",
    targetReference: "robot.hello_world"
  });

  expect(issues).toEqual({ consoleErrors: [], pageErrors: [] });
});

test("dialogue advances, closes, and prevents movement while open", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await walkToNpc(page);
  await page.keyboard.press("Space");

  const openState = await waitForDebug(page, (state) => state.dialogueOpen);
  expect(openState.dialogueText).toBe("@Hello World!");
  expect(openState.dialoguePageCount).toBe(1);

  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(450);
  await page.keyboard.up("ArrowLeft");
  const lockedState = await readRequiredDebug(page);
  expect(lockedState.player).toEqual(openState.player);

  await page.keyboard.press("Enter");
  await expect.poll(() => readDebug(page), {
    message: "final dialogue page should close on advance"
  }).toMatchObject({ dialogueOpen: false });

  await page.keyboard.press("Space");
  await waitForDebug(page, (state) => state.dialogueOpen);
  await page.keyboard.press("Backspace");
  await expect.poll(() => readDebug(page), {
    message: "Backspace should close dialogue"
  }).toMatchObject({ dialogueOpen: false });

  expect(issues).toEqual({ consoleErrors: [], pageErrors: [] });
});

test("exploratory input sweep keeps the player bounded and stable", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const moves = [
    ["ArrowLeft", 2_200],
    ["ArrowUp", 1_600],
    ["ArrowRight", 4_400],
    ["ArrowDown", 2_600],
    ["KeyA", 500],
    ["KeyW", 500],
    ["KeyD", 500],
    ["KeyS", 500]
  ] as const;

  for (const [key, duration] of moves) {
    await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    await page.keyboard.up(key);
    const state = await readRequiredDebug(page);
    assertPlayerInBounds(state);
    expect(state.dialogueOpen).toBe(false);
    expect(state.targetReference).toBe("robot.hello_world");
  }

  await page.keyboard.press("Enter");
  const finalState = await readRequiredDebug(page);
  assertPlayerInBounds(finalState);
  expect(finalState.targetReference).toBe("robot.hello_world");
  expect(issues).toEqual({ consoleErrors: [], pageErrors: [] });
});

async function gotoFirstScene(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await waitForDebug(page, (state) => state.targetReference === "robot.hello_world");
}

async function walkToNpc(page: Page): Promise<void> {
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(2_850);
  await page.keyboard.up("ArrowRight");
  await waitForDebug(page, (state) => state.inInteractionRange);
}

function attachRuntimeIssueCapture(page: Page): RuntimeIssues {
  const issues: RuntimeIssues = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    issues.pageErrors.push(error.message);
  });
  return issues;
}

function assertPlayerInBounds(state: FirstSceneDebug): void {
  expect(state.player, "debug state should include player position").toBeDefined();
  if (!state.player) {
    return;
  }
  expect(state.player.x).toBeGreaterThanOrEqual(state.movementBounds.minX);
  expect(state.player.x).toBeLessThanOrEqual(state.movementBounds.maxX);
  expect(state.player.y).toBeGreaterThanOrEqual(state.movementBounds.minY);
  expect(state.player.y).toBeLessThanOrEqual(state.movementBounds.maxY);
}

async function waitForDebug(page: Page, predicate: (state: FirstSceneDebug) => boolean = () => true): Promise<FirstSceneDebug> {
  await expect.poll(async () => {
    const state = await readDebug(page);
    return state ? predicate(state) : false;
  }, {
    message: "first scene debug state should reach expected condition"
  }).toBe(true);
  return readRequiredDebug(page);
}

async function readRequiredDebug(page: Page): Promise<FirstSceneDebug> {
  const state = await readDebug(page);
  expect(state, "first scene debug state should exist").toBeDefined();
  return state as FirstSceneDebug;
}

async function readDebug(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<FirstSceneDebug | undefined> {
  return page.evaluate(() => (globalThis as unknown as { __firstSceneDebug?: FirstSceneDebug }).__firstSceneDebug);
}
