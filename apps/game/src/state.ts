import type { DialoguePage, TutorialStatus } from "@eb/schemas";
import type { MenuDebugState } from "./menuModel";
import {
  DefaultResolver,
  INSTANT_TEXT_SPEED_CPS,
  confirmActionForReveal,
  renderPageToText,
  revealState,
  type DialogueResolver,
  type RevealState
} from "./dialogueRenderer";

export type SceneMode = "world" | "fallback" | "error" | "battle";
export type BattlePhase = "menu" | "enemy-rolling" | "player-rolling" | "win" | "lose" | "flee";

export type BattleDebug = {
  mode: "battle";
  phase: BattlePhase;
  menuIndex: number;
  player: {
    name: string;
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  enemy: {
    hpDisplayed: number;
    hpTarget: number;
    isRolling: boolean;
  };
  outcome: "ongoing" | "win" | "lose";
};

export type DebugNpc = {
  id: number;
  x: number;
  y: number;
  interactable: boolean;
  visible: boolean;
  facing: string;
  moving: boolean;
  behaviorKind: string;
  paused: boolean;
};

export type OverworldDebug = {
  mode: Exclude<SceneMode, "battle">;
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
  revealComplete?: boolean;
  revealedText?: string;
  targetReference: string;
  player?: { x: number; y: number };
  npc?: { x: number; y: number };
  npcs?: DebugNpc[];
  prompt: string;
  facing?: string;
  moving?: boolean;
  animKey?: string;
  animFrame?: number;
  inputLocked?: boolean;
  lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  loadedChunkCount?: number;
  activeNpcCount?: number;
  currentChunk?: { cx: number; cy: number };
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
  tutorial?: TutorialStatus["counts"];
  resolveStatus: string;
  dialogueCounters?: { opens: number; advances: number; closes: number };
  flags?: string[];
  flagsNumCount?: number;
  eventExecutor?: {
    running: boolean;
    currentEffectKind?: string;
    effectsDispatched: number;
    records: {
      warps: number;
      warpNoops: number;
      battles: number;
      battleNoops: number;
      audio: number;
      lastWarpDest?: number;
      lastTeleportStyle?: number;
      lastBattleGroup?: number;
      lastAudioKind?: string;
    };
  };
  partyState?: {
    wallet: number;
    inventoryChars: number;
    inventoryItems: number;
    partyCount: number;
  };
  menu?: MenuDebugState;
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
  error?: { title: string; message: string };
};

export type FirstSceneDebug = OverworldDebug | BattleDebug;

export function publishDebug(state: FirstSceneDebug): void {
  (globalThis as Record<string, unknown>).__firstSceneDebug = state;
}

export function publishBattleDebug(state: BattleDebug): void {
  (globalThis as Record<string, unknown>).__battleDebug = state;
  publishDebug(state);
}

/** Dialogue runtime shared between the world scene and the UI overlay. */
export class DialogueController {
  pages: DialoguePage[] = [];
  pageIndex = 0;
  open = false;
  opens = 0;
  advances = 0;
  closes = 0;
  /**
   * Minimum time between opening and the first advance (and between
   * advances). Prevents a single mashed/double-dispatched confirm key from
   * opening and instantly closing a one-page dialogue.
   */
  static readonly ADVANCE_COOLDOWN_MS = 150;
  /**
   * Minimum time after a close before a confirm key may reopen the dialogue.
   * Covers the mirror case: an advance that closes the last page must not be
   * followed by an instant reopen from the same key burst.
   */
  static readonly REOPEN_COOLDOWN_MS = 75;
  private lastTransitionAt = 0;
  private resolver: DialogueResolver = DefaultResolver;
  private textSpeedCps = INSTANT_TEXT_SPEED_CPS;
  private pageStartedAt = 0;
  private revealForcedComplete = false;

  constructor(options: { resolver?: DialogueResolver; textSpeedCps?: number } = {}) {
    this.resolver = options.resolver ?? DefaultResolver;
    this.textSpeedCps = options.textSpeedCps ?? INSTANT_TEXT_SPEED_CPS;
  }

  setResolver(resolver: DialogueResolver): void {
    this.resolver = resolver;
  }

  setTextSpeedCps(cps: number): void {
    this.textSpeedCps = cps;
  }

  /** True when enough time has passed since the last transition to open. */
  canOpen(): boolean {
    return Date.now() - this.lastTransitionAt >= DialogueController.REOPEN_COOLDOWN_MS;
  }

  start(pages: DialoguePage[]): void {
    this.pages = pages;
    this.pageIndex = 0;
    this.open = true;
    this.opens += 1;
    this.resetReveal(Date.now());
  }

  /** Advances a page; returns false when the dialogue closed instead. */
  advance(): boolean {
    if (!this.open) {
      return false;
    }
    const now = Date.now();
    if (now - this.lastTransitionAt < DialogueController.ADVANCE_COOLDOWN_MS) {
      return true; // ignore bounced confirm presses right after a transition
    }

    if (confirmActionForReveal(this.revealStateAt(now).revealComplete) === "completeReveal") {
      this.revealForcedComplete = true;
      this.lastTransitionAt = now;
      return true;
    }

    this.advances += 1;
    this.lastTransitionAt = now;
    if (this.pageIndex + 1 >= this.pages.length) {
      this.close();
      return false;
    }
    this.pageIndex += 1;
    this.resetReveal(now);
    return true;
  }

  close(): void {
    if (this.open) {
      this.closes += 1;
      this.lastTransitionAt = Date.now();
    }
    this.open = false;
    this.pageIndex = 0;
    this.revealForcedComplete = false;
  }

  get currentText(): string {
    return renderPageToText(this.pages[this.pageIndex], this.resolver);
  }

  get revealedText(): string {
    return this.currentRevealState.revealedText;
  }

  get revealComplete(): boolean {
    return this.currentRevealState.revealComplete;
  }

  get currentRevealState(): RevealState {
    return this.revealStateAt(Date.now());
  }

  get isLastPage(): boolean {
    return this.pageIndex >= this.pages.length - 1;
  }

  private resetReveal(now: number): void {
    this.lastTransitionAt = now;
    this.pageStartedAt = now;
    this.revealForcedComplete = false;
  }

  private revealStateAt(now: number): RevealState {
    const fullText = this.currentText;
    if (!this.open || this.revealForcedComplete) {
      return revealState(fullText, 0, INSTANT_TEXT_SPEED_CPS);
    }
    return revealState(fullText, now - this.pageStartedAt, this.textSpeedCps);
  }
}
