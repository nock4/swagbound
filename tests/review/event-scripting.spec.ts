import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  gotoFirstScene,
  waitForDebug,
  walkToNpc,
  type FirstSceneDebug
} from "./gameHarness";

const GREETER_NPC_ID = 745;
const ROBOT_NPC_ID = 744;
const GREETER_TALKED_FLAG = "npc:745:talked";
const ROBOT_TALKED_FLAG = "npc:744:talked";
const GREETER_PAGE_1 = "@Beep boop. I greet, therefore I am.";
const GREETER_PAGE_2 = "@New parts arrive tomorrow. Come back then.";
const GREETER_REPEAT = "@Told you already. Parts. Tomorrow.";
const ROBOT_HELLO = "@Hello World!";
const ADVANCE_DELAY_MS = 225;
const REOPEN_DELAY_MS = 275;

function flagsOf(state: FirstSceneDebug): string[] {
  return state.flags ?? [];
}

function flagCount(state: FirstSceneDebug, flag: string): number {
  return flagsOf(state).filter((item) => item === flag).length;
}

async function openNpcDialogue(
  page: Page,
  npcId: number,
  predicate: (state: FirstSceneDebug) => boolean = () => true
): Promise<FirstSceneDebug> {
  await walkToNpc(page, npcId);
  await waitForDebug(page, (state) => state.canInteract === true && state.interactionTargetId === npcId);
  await page.keyboard.press("Space");
  return waitForDebug(page, (state) => state.dialogueOpen && state.activeNpcId === npcId && predicate(state));
}

async function advanceDialogueWithSpace(
  page: Page,
  predicate: (state: FirstSceneDebug) => boolean
): Promise<FirstSceneDebug> {
  await page.waitForTimeout(ADVANCE_DELAY_MS);
  await page.keyboard.press("Space");
  return waitForDebug(page, predicate);
}

async function closeDialogueWithEscape(page: Page): Promise<FirstSceneDebug> {
  await page.keyboard.press("Escape");
  return waitForDebug(page, (state) => !state.dialogueOpen);
}

async function completeFirstGreeterInteraction(page: Page): Promise<FirstSceneDebug> {
  const page1 = await openNpcDialogue(
    page,
    GREETER_NPC_ID,
    (state) => state.dialoguePageCount === 2 && state.dialoguePageIndex === 0 && state.dialogueText === GREETER_PAGE_1
  );
  expect(page1.dialoguePageCount).toBe(2);
  expect(page1.dialoguePageIndex).toBe(0);
  expect(page1.dialogueText).toBe(GREETER_PAGE_1);

  const page2 = await advanceDialogueWithSpace(
    page,
    (state) => state.dialogueOpen && state.activeNpcId === GREETER_NPC_ID && state.dialoguePageIndex === 1
  );
  expect(page2.dialogueText).toBe(GREETER_PAGE_2);

  return advanceDialogueWithSpace(
    page,
    (state) => !state.dialogueOpen && flagsOf(state).includes(GREETER_TALKED_FLAG)
  );
}

test("greeter dialogue pages with imported next command", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.npcs?.some((npc) => npc.id === GREETER_NPC_ID)));

  const page1 = await openNpcDialogue(
    page,
    GREETER_NPC_ID,
    (state) => state.dialoguePageCount === 2 && state.dialoguePageIndex === 0 && state.dialogueText === GREETER_PAGE_1
  );
  expect(page1.dialoguePageCount).toBe(2);
  expect(page1.dialoguePageIndex).toBe(0);
  expect(page1.dialogueText).toBe(GREETER_PAGE_1);

  const page2 = await advanceDialogueWithSpace(
    page,
    (state) => state.dialogueOpen && state.activeNpcId === GREETER_NPC_ID && state.dialoguePageIndex === 1
  );
  expect(page2.dialoguePageCount).toBe(2);
  expect(page2.dialogueText).toBe(GREETER_PAGE_2);

  await advanceDialogueWithSpace(page, (state) => !state.dialogueOpen);
  assertNoRuntimeIssues(issues);
});

test("repeat interaction uses the imported second text pointer", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.npcs?.some((npc) => npc.id === GREETER_NPC_ID)));

  const completed = await completeFirstGreeterInteraction(page);
  expect(flagCount(completed, GREETER_TALKED_FLAG)).toBe(1);

  await page.waitForTimeout(REOPEN_DELAY_MS);
  const repeatOpen = await openNpcDialogue(
    page,
    GREETER_NPC_ID,
    (state) => state.dialoguePageCount === 1 && state.dialogueText === GREETER_REPEAT
  );
  expect(repeatOpen.dialogueText).toBe(GREETER_REPEAT);
  expect(repeatOpen.dialoguePageCount).toBe(1);

  await closeDialogueWithEscape(page);
  await page.waitForTimeout(REOPEN_DELAY_MS);
  await walkToNpc(page, ROBOT_NPC_ID);
  const robotReady = await waitForDebug(
    page,
    (state) => state.canInteract === true && state.interactionTargetId === ROBOT_NPC_ID
  );
  expect(flagsOf(robotReady)).not.toContain(ROBOT_TALKED_FLAG);

  await page.keyboard.press("Space");
  const robotOpen = await waitForDebug(
    page,
    (state) => state.dialogueOpen && state.activeNpcId === ROBOT_NPC_ID && state.dialogueText === ROBOT_HELLO
  );
  expect(robotOpen.dialoguePageCount).toBe(1);

  await closeDialogueWithEscape(page);
  assertNoRuntimeIssues(issues);
});

test("first interaction state is flag-free", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const fresh = await waitForDebug(
    page,
    (state) => state.mode === "world" && Boolean(state.npcs?.some((npc) => npc.id === GREETER_NPC_ID))
  );
  expect(flagsOf(fresh)).not.toContain(GREETER_TALKED_FLAG);

  await walkToNpc(page, GREETER_NPC_ID);
  await waitForDebug(page, (state) => state.canInteract === true && state.interactionTargetId === GREETER_NPC_ID);
  await page.keyboard.press("Space");
  const opened = await waitForDebug(
    page,
    (state) => (
      state.dialogueOpen &&
      state.activeNpcId === GREETER_NPC_ID &&
      flagsOf(state).includes(GREETER_TALKED_FLAG) &&
      state.dialoguePageIndex === 0 &&
      state.dialoguePageCount === 2 &&
      state.dialogueText === GREETER_PAGE_1
    )
  );
  expect(opened.dialoguePageIndex).toBe(0);
  expect(opened.dialoguePageCount).toBe(2);
  expect(opened.dialogueText).toBe(GREETER_PAGE_1);

  await closeDialogueWithEscape(page);
  assertNoRuntimeIssues(issues);
});
