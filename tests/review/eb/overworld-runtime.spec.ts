import { expect, test, type Page } from "@playwright/test";
import {
  assertNoRuntimeIssues,
  attachRuntimeIssueCapture,
  gotoFirstScene,
  readRequiredDebug,
  sampleWhileHolding,
  tapKeyUntil,
  waitForDebug,
  walkToNpc
} from "../gameHarness";

type WalkPair = [number, number];
type PlayerAnimations = Record<"up" | "right" | "down" | "left", WalkPair>;

/** Reads the player's walk-frame pairs from the generated data contract. */
async function loadPlayerAnimations(page: Page): Promise<PlayerAnimations> {
  const world = await (await page.request.get("/generated/world.json")).json() as {
    player?: { spriteGroup: number };
  };
  const sprites = await (await page.request.get("/generated/sprites.json")).json() as {
    sheets: Array<{ groupId: number; animations?: PlayerAnimations }>;
  };
  const sheet = sprites.sheets.find((item) => item.groupId === world.player?.spriteGroup);
  expect(sheet?.animations, "player sheet should carry animations metadata").toBeDefined();
  return sheet?.animations as PlayerAnimations;
}

test("walking animation and facing match the movement direction", async ({ page }, testInfo) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.player));
  const animations = await loadPlayerAnimations(page);

  const directions = [
    { key: "ArrowLeft", facing: "left" },
    { key: "ArrowRight", facing: "right" },
    { key: "ArrowUp", facing: "up" },
    { key: "ArrowDown", facing: "down" }
  ] as const;

  for (const direction of directions) {
    const pair = animations[direction.facing];
    const heldState = await sampleWhileHolding(page, direction.key, 400);
    expect(heldState.facing, `${direction.facing}: facing while walking`).toBe(direction.facing);
    expect(heldState.moving, `${direction.facing}: moving while held`).toBe(true);
    expect(heldState.animKey, `${direction.facing}: walk animation key`).toBe(`walk-${direction.facing}`);
    expect(pair, `${direction.facing}: frame must come from this facing's pair`).toContain(heldState.animFrame);

    await page.screenshot({ path: testInfo.outputPath(`walk-${direction.facing}.png`) });

    // Idle: last facing persists and the actor rests on that facing's lead frame.
    await page.waitForTimeout(150);
    const idleState = await readRequiredDebug(page);
    expect(idleState.moving, `${direction.facing}: stops on release`).toBe(false);
    expect(idleState.facing, `${direction.facing}: idle facing persists`).toBe(direction.facing);
    expect(idleState.animKey, `${direction.facing}: idle animation key`).toBe(`idle-${direction.facing}`);
    expect(idleState.animFrame, `${direction.facing}: idle rests on the lead frame`).toBe(pair[0]);
  }

  assertNoRuntimeIssues(issues);
});

test("interaction requires facing the NPC, not just standing near it", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await walkToNpc(page);

  const facingState = await readRequiredDebug(page);
  expect(facingState.canInteract, "after walking up, the NPC should be in front").toBe(true);
  expect(facingState.interactionTargetId).toBe(744);
  expect(facingState.prompt).toContain("Z: talk");

  // Turn away on the perpendicular axis: the facing changes while the player
  // barely moves. If the tap drifts the player out of the radius (the walker
  // may have stopped right at the boundary), re-approach and try again.
  let turnedAway: Awaited<ReturnType<typeof readRequiredDebug>> | undefined;
  for (let attempt = 0; attempt < 3 && !turnedAway; attempt += 1) {
    await walkToNpc(page);
    const near = await readRequiredDebug(page);
    const dx = (near.npc?.x ?? 0) - (near.player?.x ?? 0);
    const dy = (near.npc?.y ?? 0) - (near.player?.y ?? 0);
    const awayKey = Math.abs(dx) >= Math.abs(dy)
      ? (dy >= 0 ? "ArrowUp" : "ArrowDown")
      : (dx >= 0 ? "ArrowLeft" : "ArrowRight");
    const candidate = await tapKeyUntil(page, awayKey, (state) => state.canInteract === false);
    if (candidate.canInteract === false && candidate.inInteractionRange) {
      turnedAway = candidate;
    }
  }
  expect(turnedAway, "player should end up near the NPC while facing away").toBeDefined();
  expect(turnedAway?.inInteractionRange, "player should still be within radius").toBe(true);
  expect(turnedAway?.prompt).toContain("Turn to face them");

  // Confirm press while facing away must NOT open dialogue.
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  expect((await readRequiredDebug(page)).dialogueOpen).toBe(false);

  // Face the robot again (re-approach handles any geometry): talking works.
  await walkToNpc(page);
  expect((await readRequiredDebug(page)).canInteract).toBe(true);
  await page.keyboard.press("Space");
  const openState = await waitForDebug(page, (state) => state.dialogueOpen);
  expect(openState.dialogueText).toBe("Hello World!");

  // Close, then verify the NPC stays interactable for a follow-up talk.
  await page.keyboard.press("Escape");
  await waitForDebug(page, (state) => !state.dialogueOpen);
  await page.waitForTimeout(250); // human-paced gap (reopen cooldown)
  await page.keyboard.press("Enter");
  await waitForDebug(page, (state) => state.dialogueOpen);
  await page.keyboard.press("Escape");
  await waitForDebug(page, (state) => !state.dialogueOpen);

  assertNoRuntimeIssues(issues);
});

test("dialogue locks input and freezes the walk animation", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  await walkToNpc(page);
  await page.keyboard.press("Space");
  const openState = await waitForDebug(page, (state) => state.dialogueOpen);

  const heldState = await sampleWhileHolding(page, "ArrowUp", 450);
  expect(heldState.dialogueOpen).toBe(true);
  expect(heldState.inputLocked, "input should be locked while dialogue is open").toBe(true);
  expect(heldState.moving, "held keys must not move the player").toBe(false);
  expect(heldState.animKey?.startsWith("idle-"), "animation should rest on an idle frame").toBe(true);
  expect(heldState.player).toEqual(openState.player);
  expect(heldState.facing, "facing must not change while locked").toBe(openState.facing);

  await page.keyboard.press("Escape");
  const closedState = await waitForDebug(page, (state) => !state.dialogueOpen);
  expect(closedState.inputLocked).toBe(false);

  assertNoRuntimeIssues(issues);
});

test("spawn is on walkable ground and movement cannot tunnel into the NPC", async ({ page }) => {
  const issues = attachRuntimeIssueCapture(page);
  await gotoFirstScene(page);
  const initial = await waitForDebug(page, (state) => state.mode === "world" && Boolean(state.player));
  expect(initial.world?.playerSpawn).toEqual(initial.player);

  // Drive straight into the NPC: the body blocks, feet never overlap.
  await walkToNpc(page);
  const npcState = await readRequiredDebug(page);
  await page.keyboard.down(npcState.npc!.x < npcState.player!.x ? "ArrowLeft" : "ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up(npcState.npc!.x < npcState.player!.x ? "ArrowLeft" : "ArrowRight");
  const pressed = await readRequiredDebug(page);
  const gap = Math.abs(pressed.player!.x - pressed.npc!.x);
  expect(gap, "NPC body should keep the player from overlapping").toBeGreaterThanOrEqual(13);

  assertNoRuntimeIssues(issues);
});
