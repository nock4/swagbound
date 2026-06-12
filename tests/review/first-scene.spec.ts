import { expect, test } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  assertPlayerInBounds,
  attachRuntimeIssueCapture,
  countCanvasColors,
  gotoFirstScene,
  readDebug,
  readRequiredDebug,
  waitForDebug,
  walkToNpc
} from "./gameHarness";

test("world scene renders imported map and plays imported dialogue", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);

  const initial = await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.player));
  expect(initial.statusLines.join("\n")).toContain("Your First Hack: CoilSnake Import");
  expect(initial.statusLines.join("\n")).toContain("Project: found");
  expect(initial.statusLines.join("\n")).toContain("Scripts: 1 files");
  expect(initial.statusLines.join("\n")).toContain("NPC refs: 5");
  expect(initial.resolveStatus).toBe("script + npc ref");
  expect(initial.world).toMatchObject({ available: true, assetsLoaded: true });
  expect(initial.npc, "tutorial NPC should be placed in the scene").toBeDefined();

  // The scene must render real imagery, not a blank canvas.
  expect(await countCanvasColors(page)).toBeGreaterThan(8);

  await walkToNpc(page);
  await page.keyboard.press("Enter");

  await expect.poll(() => readDebug(page), {
    message: "interacting with the robot should open imported dialogue"
  }).toMatchObject({
    dialogueOpen: true,
    dialogueText: "@Hello World!",
    targetReference: "robot.hello_world"
  });

  assertNoRuntimeIssues(issues);
});

test("npc placement and region geometry match generated world data", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const state = await waitForDebug(page, (s) => s.mode === "world" && Boolean(s.npc));

  const worldJson = await (await page.request.get("/generated/world.json")).json() as {
    region: { originTile: { x: number; y: number }; widthPixels: number; heightPixels: number };
    npcs: Array<{ npcId: number; worldPixel: { x: number; y: number }; regionPixel: { x: number; y: number } }>;
  };
  const npc744 = worldJson.npcs.find((npc) => npc.npcId === 744);
  expect(npc744, "world.json should contain NPC 744").toBeDefined();

  // Region is sector-aligned and the scene placement mirrors the data.
  expect(worldJson.region.originTile.x % 8).toBe(0);
  expect(worldJson.region.originTile.y % 4).toBe(0);
  expect(state.npc).toEqual(npc744?.regionPixel);
  expect(state.world?.npc744WorldPixel).toEqual(npc744?.worldPixel);
  expect(npc744?.worldPixel).toEqual({
    x: worldJson.region.originTile.x * 32 + (npc744?.regionPixel.x ?? 0),
    y: worldJson.region.originTile.y * 32 + (npc744?.regionPixel.y ?? 0)
  });

  // Player spawned on walkable ground inside the region.
  assertPlayerInBounds(state);
  assertNoRuntimeIssues(issues);
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

  await page.waitForTimeout(250); // human-paced gap before reopening
  await page.keyboard.press("Space");
  await waitForDebug(page, (state) => state.dialogueOpen);
  await page.keyboard.press("Backspace");
  await expect.poll(() => readDebug(page), {
    message: "Backspace should close dialogue"
  }).toMatchObject({ dialogueOpen: false });

  assertNoRuntimeIssues(issues);
});

test("exploratory input sweep keeps the player bounded by imported collision", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.player));

  const moves = [
    ["ArrowLeft", 1_600],
    ["ArrowUp", 1_200],
    ["ArrowRight", 2_400],
    ["ArrowDown", 1_600],
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

  const finalState = await readRequiredDebug(page);
  assertPlayerInBounds(finalState);
  expect(finalState.mode).toBe("world");
  assertNoRuntimeIssues(issues);
});

test("generated public JSON stays free of ROM names and absolute paths", async ({ page }) => {
  await gotoFirstScene(page);
  const manifest = await (await page.request.get("/generated/manifest.json")).json() as { files: Record<string, string> };
  const files = ["manifest.json", ...Object.values(manifest.files)];
  const forbidden = /EarthBound \(USA\)|\.sfc|\/Users\//;

  for (const file of files) {
    const body = await (await page.request.get(`/generated/${file}`)).text();
    expect(forbidden.test(body), `${file} must not leak ROM names or absolute paths`).toBe(false);
  }
});
