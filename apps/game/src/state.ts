import type { DialoguePage, TutorialStatus } from "@eb/schemas";

export type SceneMode = "world" | "fallback" | "error";

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

export type FirstSceneDebug = {
  mode: SceneMode;
  dialogueOpen: boolean;
  dialogueText: string;
  dialoguePageIndex: number;
  dialoguePageCount: number;
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

export function publishDebug(state: FirstSceneDebug): void {
  (globalThis as Record<string, unknown>).__firstSceneDebug = state;
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

  /** True when enough time has passed since the last transition to open. */
  canOpen(): boolean {
    return Date.now() - this.lastTransitionAt >= DialogueController.REOPEN_COOLDOWN_MS;
  }

  start(pages: DialoguePage[]): void {
    this.pages = pages;
    this.pageIndex = 0;
    this.open = true;
    this.opens += 1;
    this.lastTransitionAt = Date.now();
  }

  /** Advances a page; returns false when the dialogue closed instead. */
  advance(): boolean {
    if (!this.open) {
      return false;
    }
    if (Date.now() - this.lastTransitionAt < DialogueController.ADVANCE_COOLDOWN_MS) {
      return true; // ignore bounced confirm presses right after a transition
    }
    this.advances += 1;
    this.lastTransitionAt = Date.now();
    if (this.pageIndex + 1 >= this.pages.length) {
      this.close();
      return false;
    }
    this.pageIndex += 1;
    return true;
  }

  close(): void {
    if (this.open) {
      this.closes += 1;
      this.lastTransitionAt = Date.now();
    }
    this.open = false;
    this.pageIndex = 0;
  }

  get currentText(): string {
    return this.pages[this.pageIndex]?.text ?? "";
  }

  get isLastPage(): boolean {
    return this.pageIndex >= this.pages.length - 1;
  }
}
