import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  readRequiredDebug,
  waitForDebug,
  type FirstSceneDebug
} from "./gameHarness";

// The Onett police hall (data_15 cop row, npcs 73-77). Spawning here drops the
// player inside the cutscene's area trigger.
const POLICE_HALL_SPAWN = { x: 7512, y: 260 };
const POLICE_DONE_FLAG = "signal:police-dispersed";
const POLICE_ONCE_FLAG = "cutscene:onett-police-disperse";

test("onett police cutscene fires on entry, files the cops out, and completes", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoWorld(page, POLICE_HALL_SPAWN);
  expect(initial.flags ?? []).not.toContain(POLICE_DONE_FLAG);

  // The area trigger fires on spawn; tapping Z advances the dialogue, then the
  // cops file out the door one by one and the once + done flags are set.
  const done = await tapKeyUntil(
    page,
    "KeyZ",
    (state) => (state.flags ?? []).includes(POLICE_DONE_FLAG),
    "the police cutscene should set its done flag once the cops disperse"
  );
  expect(done.flags).toContain(POLICE_DONE_FLAG);
  expect(done.flags).toContain(POLICE_ONCE_FLAG);
  assertNoRuntimeIssues(issues);
});

async function gotoWorld(page: Page, spawn: { x: number; y: number }): Promise<FirstSceneDebug> {
  const params = new URLSearchParams({ noEncounters: "1", nointro: "1", spawn: `${spawn.x},${spawn.y}` });
  await page.goto(`/?${params.toString()}`);
  await expect(page.locator("canvas")).toBeVisible();
  return waitForDebug(page, (state) =>
    state.mode === "world" && state.world?.assetsLoaded === true && Boolean(state.currentChunk)
  );
}

async function tapKeyUntil(
  page: Page,
  key: string,
  predicate: (state: FirstSceneDebug) => boolean,
  message: string
): Promise<FirstSceneDebug> {
  await expect
    .poll(
      async () => {
        const state = await readRequiredDebug(page);
        if (predicate(state)) {
          return true;
        }
        await page.keyboard.press(key);
        return predicate(await readRequiredDebug(page));
      },
      { message, timeout: 25_000, intervals: [200, 300, 400, 500] }
    )
    .toBe(true);
  return readRequiredDebug(page);
}
