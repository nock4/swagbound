import { expect, type Page } from "@playwright/test";

export type FirstSceneDebug = {
  mode: "world" | "fallback" | "error";
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
  targetReference: string;
  player?: { x: number; y: number };
  npc?: { x: number; y: number };
  npcs?: Array<{ id: number; x: number; y: number; interactable: boolean; visible: boolean }>;
  prompt: string;
  facing?: string;
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
  world?: {
    available: boolean;
    originTile?: { x: number; y: number };
    widthPixels?: number;
    heightPixels?: number;
    npcCount: number;
    visibleNpcCount: number;
    assetsLoaded: boolean;
    npc744WorldPixel?: { x: number; y: number };
    playerSpawn?: { x: number; y: number };
  };
  error?: {
    title: string;
    message: string;
  };
};

export type RuntimeIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

export async function gotoFirstScene(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await waitForDebug(page, (state) => state.targetReference === "robot.hello_world" || Boolean(state.error));
}

/**
 * Walks the player toward the tutorial NPC using the published debug state,
 * axis by axis, with a stuck detector that tries the perpendicular axis.
 * Works in both the world scene (collision) and the fallback scene.
 */
export async function walkToNpc(page: Page): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastPosition = "";
  let stuckRetries = 0;

  while (Date.now() < deadline) {
    const state = await readDebug(page);
    if (!state?.player || !state.npc) {
      await page.waitForTimeout(200);
      continue;
    }
    if (state.inInteractionRange) {
      return;
    }
    const dx = state.npc.x - state.player.x;
    const dy = state.npc.y - state.player.y;
    const positionKey = `${Math.round(state.player.x)},${Math.round(state.player.y)}`;
    const stuck = positionKey === lastPosition;
    lastPosition = positionKey;

    let key: string;
    const preferHorizontal = Math.abs(dx) >= Math.abs(dy);
    if (stuck && stuckRetries < 6) {
      // Try the perpendicular axis to slide around an obstacle.
      stuckRetries += 1;
      key = preferHorizontal
        ? (dy > 0 ? "ArrowDown" : "ArrowUp")
        : (dx > 0 ? "ArrowRight" : "ArrowLeft");
    } else {
      stuckRetries = 0;
      key = preferHorizontal
        ? (dx > 0 ? "ArrowRight" : "ArrowLeft")
        : (dy > 0 ? "ArrowDown" : "ArrowUp");
    }

    await page.keyboard.down(key);
    await page.waitForTimeout(240);
    await page.keyboard.up(key);
  }
  const finalState = await readDebug(page);
  expect(finalState?.inInteractionRange, "player should reach the tutorial NPC interaction range").toBe(true);
}

export function attachRuntimeIssueCapture(page: Page): RuntimeIssues {
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

export function assertNoRuntimeIssues(issues: RuntimeIssues): void {
  expect(issues).toEqual({ consoleErrors: [], pageErrors: [] });
}

export function assertPlayerInBounds(state: FirstSceneDebug): void {
  expect(state.player, "debug state should include player position").toBeDefined();
  if (!state.player) {
    return;
  }
  expect(state.player.x).toBeGreaterThanOrEqual(state.movementBounds.minX);
  expect(state.player.x).toBeLessThanOrEqual(state.movementBounds.maxX);
  expect(state.player.y).toBeGreaterThanOrEqual(state.movementBounds.minY);
  expect(state.player.y).toBeLessThanOrEqual(state.movementBounds.maxY);
}

/**
 * Samples the game canvas and counts distinct colors — proves the scene
 * renders real imagery rather than a blank or single-color frame.
 * Requires the CANVAS renderer (the game is configured with Phaser.CANVAS).
 */
export async function countCanvasColors(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      return 0;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return 0;
    }
    const colors = new Set<number>();
    const step = 8;
    const image = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        const offset = (y * canvas.width + x) * 4;
        colors.add((image[offset] << 16) | (image[offset + 1] << 8) | image[offset + 2]);
      }
    }
    return colors.size;
  });
}

export async function waitForDebug(page: Page, predicate: (state: FirstSceneDebug) => boolean = () => true): Promise<FirstSceneDebug> {
  await expect.poll(async () => {
    const state = await readDebug(page);
    return state ? predicate(state) : false;
  }, {
    message: "first scene debug state should reach expected condition"
  }).toBe(true);
  return readRequiredDebug(page);
}

export async function readRequiredDebug(page: Page): Promise<FirstSceneDebug> {
  const state = await readDebug(page);
  expect(state, "first scene debug state should exist").toBeDefined();
  return state as FirstSceneDebug;
}

export async function readDebug(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<FirstSceneDebug | undefined> {
  return page.evaluate(() => (globalThis as unknown as { __firstSceneDebug?: FirstSceneDebug }).__firstSceneDebug);
}
