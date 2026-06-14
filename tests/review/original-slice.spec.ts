import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  countCanvasColors,
  readRequiredDebug,
  sampleWhileHolding,
  waitForDebug,
  walkToNpc,
  type FirstSceneDebug
} from "./gameHarness";

const ORIGINAL_NPC_ID = 2001;
const FIRST_PAGE = "Bosch! Wake up. Your phone minted something at 4am, and it is signed with your name.";
const SECOND_PAGE = "The payload just says 'Swag is eternal.' You didn't write that. Somebody beat you to being you.";

test("original content slice renders, moves, and plays original multi-page dialogue", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoOriginalSlice(page);

  expect(initial.world).toMatchObject({
    available: true,
    widthPixels: 640,
    heightPixels: 512,
    npcCount: 4,
    visibleNpcCount: 4,
    assetsLoaded: true
  });
  expect(initial.statusLines.join("\n")).toContain("World: 20x16 tiles @ (0,0) | NPCs: 4/4");
  expect(initial.targetReference).toBe("slice.biscuit");
  expect(initial.npcs?.map((npc) => npc.id).sort()).toEqual([2001, 2002, 2003, 2004]);
  expect(await countCanvasColors(page)).toBeGreaterThan(8);

  const moved = await sampleWhileHolding(page, "ArrowRight", 350);
  expect(moved.player?.x ?? 0).toBeGreaterThan(initial.player?.x ?? 0);

  await walkToNpc(page, ORIGINAL_NPC_ID);
  await page.keyboard.press("Space");
  const open = await waitForDebug(page, (state) =>
    state.dialogueOpen &&
    state.activeNpcId === ORIGINAL_NPC_ID &&
    state.dialogueText === FIRST_PAGE
  );
  expect(open.dialoguePageCount).toBe(2);
  expect(open.dialoguePageIndex).toBe(0);

  await page.waitForTimeout(180);
  await page.keyboard.press("Enter");
  const second = await waitForDebug(page, (state) =>
    state.dialogueOpen &&
    state.activeNpcId === ORIGINAL_NPC_ID &&
    state.dialogueText === SECOND_PAGE
  );
  expect(second.dialoguePageIndex).toBe(1);

  await page.waitForTimeout(180);
  await page.keyboard.press("Enter");
  await waitForDebug(page, (state) => !state.dialogueOpen);

  assertNoRuntimeIssues(issues);
});

async function gotoOriginalSlice(page: Page): Promise<FirstSceneDebug> {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/?noEncounters=1&nointro=1");
  await expect(page.locator("canvas")).toBeVisible();
  return waitForDebug(page, (state) =>
    state.mode === "world" &&
    state.world?.assetsLoaded === true &&
    state.world.widthPixels === 640 &&
    state.world.heightPixels === 512 &&
    state.targetReference === "slice.biscuit" &&
    Boolean(state.npcs?.some((npc) => npc.id === ORIGINAL_NPC_ID))
  );
}
