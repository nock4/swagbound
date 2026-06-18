import { expect, type Page } from "@playwright/test";

export type FirstSceneDebug = {
  mode: "world" | "fallback" | "error" | "battle" | "intro";
  introActive?: boolean;
  introBeatIndex?: number;
  introBeatKind?: string;
  introSkippable?: boolean;
  introComplete?: boolean;
  phase?:
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
  transitionPhase?: "none" | "enter" | "summary" | "exit";
  menuIndex?: number;
  commandIndex?: number;
  command?: "BASH" | "GOODS" | "AUTO" | "PSI" | "SPY" | "PRAY" | "MIRROR" | "DEFEND" | "RUN";
  submenu?: "command" | "psi" | "goods" | "target";
  submenuIndex?: number;
  selection?: string;
  targetIndex?: number;
  partyTargetIndex?: number;
  turnOrder?: Array<{ side: "party" | "enemy"; index: number }>;
  currentActor?: { side: "party" | "enemy"; index: number } | null;
  inputMemberIndex?: number | null;
  queuedCount?: number;
  executionStepIndex?: number;
  executionStepCount?: number;
  executionMessage?: string;
  lastEnemyAction?: {
    enemyIndex: number;
    actionIndex: number;
    actionId: number;
    actionType: number | null;
    target: number | null;
  } | null;
  party?: Array<{
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
    alive: boolean;
    pp?: number;
    maxPp?: number;
    inventoryCount?: number;
  }>;
  enemies?: Array<{
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
    alive: boolean;
    pp?: number;
    maxPp?: number;
    inventoryCount?: number;
  }>;
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
  revealComplete?: boolean;
  revealedText?: string;
  targetReference: string;
  player?: {
    x: number;
    y: number;
    name?: string;
    hpDisplayed?: number;
    hpTarget?: number;
    isRolling?: boolean;
  };
  enemy?: {
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  outcome?: "ongoing" | "win" | "lose";
  victorySummary?: {
    expGained: number;
    moneyGained: number;
    drops: Array<{ enemyId: number; itemId: number; itemName: string; recipientCharId: number }>;
    levelUps: Array<{ charId: number; name: string; fromLevel: number; toLevel: number }>;
  } | null;
  npc?: { x: number; y: number };
  npcs?: Array<{
    id: number;
    x: number;
    y: number;
    interactable: boolean;
    visible: boolean;
    facing: string;
    moving: boolean;
    behaviorKind: string;
    paused: boolean;
  }>;
  prompt: string;
  facing?: string;
  moving?: boolean;
  animKey?: string;
  animFrame?: number;
  inputLocked?: boolean;
  lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  doorFadeActive?: boolean;
  doorFadePhase?: "none" | "fade-out" | "fade-in";
  loadedChunkCount?: number;
  activeNpcCount?: number;
  collisionOverlay?: boolean;
  currentChunk?: { cx: number; cy: number };
  currentSectorIndex?: number;
  encounterEnabled?: boolean;
  encounterCooldownMs?: number;
  encounterSeed?: number;
  lastEncounterGroup?: number;
  returnContextActive?: boolean;
  /** Facing-aware: an interactable NPC is in front and in range. */
  canInteract?: boolean;
  interactionTargetId?: number;
  activeNpcId?: number;
  distanceToNpc?: number;
  /** Radius-only proximity to the nearest interactable NPC. */
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
  flags?: string[];
  flagsNumCount?: number;
  hasSave?: boolean;
  lastSavedAt?: string;
  restoredFromSave?: boolean;
  eventExecutor?: {
    running: boolean;
    currentEffectKind?: string;
    effectsDispatched: number;
    effectsByKind?: Record<string, number>;
    result?: {
      status: "completed" | "aborted";
      truncated: boolean;
      truncatedReason?: string;
      commandsVisited: number;
      jumps: number;
      reason?: string;
    };
    records: {
      warps: number;
      warpNoops: number;
      battles: number;
      battleNoops: number;
      shops?: number;
      audio: number;
      unsupported?: number;
      unsupportedByKind?: Record<string, number>;
      lastWarpDest?: number;
      lastTeleportStyle?: number;
      lastBattleGroup?: number;
      lastShopStoreId?: number;
      lastAudioKind?: string;
      lastUnsupportedKind?: string;
    };
  };
  newGameStartup?: {
    attempted: boolean;
    started: boolean;
    reference?: string;
    skippedReason?: string;
    status: "skipped" | "running" | "completed" | "aborted";
    truncated: boolean;
    truncatedReason?: string;
    abortedReason?: string;
    fallbackApplied: boolean;
    fallbackReason?: string;
    effectsDispatched: number;
    effectsByKind: Record<string, number>;
    records: {
      warps: number;
      warpNoops: number;
      battles: number;
      battleNoops: number;
      shops: number;
      audio: number;
      unsupported?: number;
      unsupportedByKind?: Record<string, number>;
      lastWarpDest?: number;
      lastTeleportStyle?: number;
      lastBattleGroup?: number;
      lastShopStoreId?: number;
      lastAudioKind?: string;
      lastUnsupportedKind?: string;
    };
    initialPlayer?: { x: number; y: number };
    finalPlayer?: { x: number; y: number };
    finalPlayerControllable: boolean;
  };
  partyState?: {
    wallet: number;
    inventoryChars: number;
    inventoryItems: number;
    partyCount: number;
  };
  menu?: {
    open: boolean;
    stack: string[];
    cursorIndex: number;
    currentItemId?: string;
  };
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
  await page.goto("/?noEncounters=1&nointro=1");
  await expect(page.locator("canvas")).toBeVisible();
  await waitForDebug(page, (state) => state.targetReference === "robot.hello_world" || Boolean(state.error));
}

/**
 * Walks the player toward the requested NPC using the published debug state,
 * axis by axis, with a stuck detector that tries the perpendicular axis.
 * Stops once the player can actually interact with that NPC in the world
 * scene, radius-only for the default tutorial NPC in the fallback scene.
 */
export async function walkToNpc(page: Page, npcId = 744): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastPosition = "";
  let stuckRetries = 0;

  while (Date.now() < deadline) {
    const state = await readDebug(page);
    const targetNpc = state?.npcs?.find((npc) => npc.id === npcId) ?? (npcId === 744 ? state?.npc : undefined);
    if (!state?.player || !targetNpc) {
      await page.waitForTimeout(200);
      continue;
    }
    if (state.canInteract && state.interactionTargetId === npcId) {
      return;
    }
    if (!state.npcs?.length && npcId === 744 && (state.canInteract ?? state.inInteractionRange)) {
      return;
    }
    const dx = targetNpc.x - state.player.x;
    const dy = targetNpc.y - state.player.y;
    const targetDistance = Math.hypot(dx, dy);
    const positionKey = `${Math.round(state.player.x)},${Math.round(state.player.y)}`;
    const stuck = positionKey === lastPosition;
    lastPosition = positionKey;

    let key: string;
    // In radius the player only needs to turn/nudge, so tap briefly; from
    // farther away, hold longer to cover ground.
    let holdMs = targetDistance <= 32 ? 70 : 240;
    const preferHorizontal = Math.abs(dx) >= Math.abs(dy);
    if (stuck) {
      // Cycle through detours: perpendicular toward the NPC, perpendicular
      // away from it, then backtrack. Concave map pockets (a cliff between
      // player and NPC) need the away/backtrack moves to get around. This
      // also applies in radius: the dominant-axis nudge can be wall-blocked
      // right under a ledge, and only a detour breaks the livelock.
      stuckRetries += 1;
      const detours = preferHorizontal
        ? [dy >= 0 ? "ArrowDown" : "ArrowUp", dy >= 0 ? "ArrowUp" : "ArrowDown", dx > 0 ? "ArrowLeft" : "ArrowRight"]
        : [dx >= 0 ? "ArrowRight" : "ArrowLeft", dx >= 0 ? "ArrowLeft" : "ArrowRight", dy > 0 ? "ArrowUp" : "ArrowDown"];
      key = detours[(stuckRetries - 1) % detours.length];
      holdMs = 320; // long enough to clear a tile-sized obstacle corner
    } else {
      stuckRetries = 0;
      key = preferHorizontal
        ? (dx > 0 ? "ArrowRight" : "ArrowLeft")
        : (dy > 0 ? "ArrowDown" : "ArrowUp");
    }

    await page.keyboard.down(key);
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(key);
    if (targetDistance <= 32) {
      await page.waitForTimeout(120); // let facing/canInteract publish settle
    }
  }
  const finalState = await readDebug(page);
  const reachedTarget = finalState?.canInteract === true && finalState.interactionTargetId === npcId;
  const reachedFallbackTutorial = !finalState?.npcs?.length && npcId === 744 && (finalState?.canInteract ?? finalState?.inInteractionRange);
  expect(reachedTarget || reachedFallbackTutorial, `player should reach NPC ${npcId} and face it`).toBe(true);
}

/** Holds a key for `ms`, samples the debug state mid-hold, then releases. */
export async function sampleWhileHolding(page: Page, key: string, ms: number): Promise<FirstSceneDebug> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  const state = await readRequiredDebug(page);
  await page.keyboard.up(key);
  return state;
}

/**
 * Taps a key in short presses until the debug state satisfies the predicate,
 * then returns the latest state (callers assert on it). A single timed tap
 * can be swallowed when the render loop is starved (both key events land
 * between frames), so retry instead of holding longer.
 */
export async function tapKeyUntil(
  page: Page,
  key: string,
  predicate: (state: FirstSceneDebug) => boolean,
  attempts = 8
): Promise<FirstSceneDebug> {
  let state: FirstSceneDebug = await readRequiredDebug(page);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.keyboard.down(key);
    await page.waitForTimeout(70);
    await page.keyboard.up(key);
    await page.waitForTimeout(130);
    state = await readRequiredDebug(page);
    if (predicate(state)) {
      return state;
    }
  }
  return state;
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
