import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  readRequiredDebug,
  waitForDebug,
  type FirstSceneDebug
} from "./gameHarness";

const DEFAULT_FULL_SPAWN = { x: 2296, y: 3040 };
const CANONICAL_FULL_SPAWN = { x: 2112, y: 1768 };
const DOOR_APPROACH_SPAWN = { x: 5484, y: 6900 };
const DOOR_TRIGGER = { x: 5480, y: 6872 };
// CU-DEST: door destinations are 8px warp-grid units (x8). This solid-celled door
// now resolves to a walkable interior destination; the runtime footprint-centres it
// onto the nearest clear cell for the actual landing.
const DOOR_DESTINATION = { x: 5144, y: 544 };
const DOOR_LANDING = { x: 5152, y: 552 };

test("fresh full-world boot stays at the canonical control start", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoFullWorld(page);

  expect(initial.player).toEqual(CANONICAL_FULL_SPAWN);
  expect(initial.lastDoor).toBeUndefined();
  expect(initial.newGameStartup?.status).not.toBe("running");
  expect(initial.newGameStartup?.finalPlayer).toEqual(CANONICAL_FULL_SPAWN);
  expect(initial.newGameStartup?.finalPlayerControllable).toBe(true);
  assertNoRuntimeIssues(issues);
});

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

test("solid-cell door trigger teleports from Onett exterior onto walkable ground", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  const initial = await gotoFullWorld(page, DOOR_APPROACH_SPAWN);
  const initialChunk = requireChunk(initial);

  expect(initial.player).toEqual(DOOR_APPROACH_SPAWN);
  expect(initial.lastDoor).toBeUndefined();

  const teleported = await holdKeyUntil(page, "ArrowUp", (state) =>
    state.lastDoor?.to.x === DOOR_LANDING.x &&
    state.lastDoor.to.y === DOOR_LANDING.y,
    "walking up should trigger the known solid-celled Onett door"
  );

  expect(teleported.lastDoor).toBeDefined();
  const lastDoor = teleported.lastDoor!;
  await expectSolidAt(page, DOOR_TRIGGER, true);
  // CU-DEST: the x8-scaled destination is itself walkable (the fix), and the landing is too
  await expectSolidAt(page, DOOR_DESTINATION, false);
  expect(lastDoor.to).toEqual(DOOR_LANDING);
  await expectSolidAt(page, lastDoor.to, false);
  expect(teleported.player).toEqual(lastDoor.to);
  expect(requireChunk(teleported)).not.toEqual(initialChunk);
  assertNoRuntimeIssues(issues);
});

async function gotoFullWorld(page: Page, spawn?: { x: number; y: number }): Promise<FirstSceneDebug> {
  const params = new URLSearchParams({ noEncounters: "1", nointro: "1" });
  if (spawn) {
    params.set("spawn", `${spawn.x},${spawn.y}`);
  }
  const query = `?${params.toString()}`;
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

async function expectSolidAt(page: Page, point: { x: number; y: number }, expected: boolean): Promise<void> {
  const solid = await page.evaluate(({ x, y }) => {
    const hook = (globalThis as typeof globalThis & { __solidAt?: (px: number, py: number) => boolean }).__solidAt;
    return hook?.(x, y);
  }, point);
  expect(solid, `expected solidAt(${point.x},${point.y}) to be ${expected}`).toBe(expected);
}
