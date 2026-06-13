import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  readRequiredDebug,
  waitForDebug,
  type FirstSceneDebug
} from "./gameHarness";

const DEFAULT_FULL_SPAWN = { x: 2296, y: 3040 };
const DOOR_APPROACH_SPAWN = { x: 5484, y: 6900 };
const DOOR_DESTINATION = { x: 643, y: 68 };

test("boots the chunked full-world scene and streams chunks while walking", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoFullWorld(page, DEFAULT_FULL_SPAWN);
  const initialLoaded = initial.loadedChunkCount ?? 0;
  const initialChunk = requireChunk(initial);

  expect(initial.world).toMatchObject({
    available: true,
    widthPixels: 8192,
    heightPixels: 10240,
    assetsLoaded: true
  });
  expect(initial.statusLines.join("\n")).toContain("World: full 256x320 tiles");
  expect(initialLoaded).toBeGreaterThan(0);

  const moved = await holdKeyUntil(page, "ArrowRight", (state) => {
    const chunk = state.currentChunk;
    return Boolean(
      chunk &&
      (chunk.cx !== initialChunk.cx || chunk.cy !== initialChunk.cy) &&
      (state.loadedChunkCount ?? 0) > initialLoaded
    );
  }, "walking should enter a neighboring chunk and load more chunks");

  expect(requireChunk(moved)).not.toEqual(initialChunk);
  expect(moved.loadedChunkCount ?? 0).toBeGreaterThan(initialLoaded);
  assertNoRuntimeIssues(issues);
});

test("streams visible NPCs in and out as the player moves", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoFullWorld(page, DEFAULT_FULL_SPAWN);
  const initialActive = initial.activeNpcCount ?? 0;

  expect(initialActive).toBeGreaterThan(0);

  const moved = await holdKeyUntil(page, "ArrowRight", (state) =>
    (state.activeNpcCount ?? 0) > 0 && state.activeNpcCount !== initialActive,
    "active NPC count should change after streaming into another chunk"
  );

  expect(moved.activeNpcCount).not.toBe(initialActive);
  expect(moved.activeNpcCount ?? 0).toBeGreaterThan(0);
  assertNoRuntimeIssues(issues);
});

test("door trigger teleports from Onett exterior into the destination map area", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoFullWorld(page, DOOR_APPROACH_SPAWN);
  const initialChunk = requireChunk(initial);

  const teleported = await holdKeyUntil(page, "ArrowUp", (state) =>
    state.lastDoor?.to.x === DOOR_DESTINATION.x &&
    state.lastDoor.to.y === DOOR_DESTINATION.y,
    "walking up should trigger the known Onett door"
  );

  expect(teleported.lastDoor?.to).toEqual(DOOR_DESTINATION);
  expect(requireChunk(teleported)).not.toEqual(initialChunk);
  assertNoRuntimeIssues(issues);
});

async function gotoFullWorld(page: Page, spawn?: { x: number; y: number }): Promise<FirstSceneDebug> {
  const query = spawn ? `?spawn=${spawn.x},${spawn.y}` : "";
  await page.goto(appUrl(query));
  await expect(page.locator("canvas")).toBeVisible();
  return waitForDebug(page, (state) =>
    state.mode === "world" &&
    state.world?.assetsLoaded === true &&
    state.statusLines.some((line) => line.startsWith("World: full ")) &&
    Boolean(state.currentChunk)
  );
}

function appUrl(query: string): string {
  return `/${query}`;
}

async function holdKeyUntil(
  page: Page,
  key: string,
  predicate: (state: FirstSceneDebug) => boolean,
  message: string
): Promise<FirstSceneDebug> {
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => predicate(await readRequiredDebug(page)), {
      message,
      timeout: 8_000,
      intervals: [100, 150, 250, 500]
    }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  await page.waitForTimeout(150);
  return readRequiredDebug(page);
}

function requireChunk(state: FirstSceneDebug): { cx: number; cy: number } {
  expect(state.currentChunk, "debug state should include currentChunk").toBeDefined();
  return state.currentChunk as { cx: number; cy: number };
}
