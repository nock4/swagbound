import type { DialoguePage, TutorialStatus } from "@eb/schemas";
import type { BattleSfxCue } from "./audio/battleSfx";
import type { BattleCommand, EncounterAdvantage } from "./battleLogic";
import type { MenuDebugState } from "./menuModel";
import {
  DefaultResolver,
  INSTANT_TEXT_SPEED_CPS,
  confirmActionForReveal,
  renderPageToText,
  renderPageToTextRuns,
  revealTextRuns,
  revealState,
  type DialogueTextRun,
  type DialogueResolver,
  type RevealState
} from "./dialogueRenderer";

export type SceneMode = "world" | "fallback" | "error" | "battle" | "intro";
export type BattlePhase =
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

export type BattleTransitionPhase = "none" | "enter" | "summary" | "exit";

export type BattleActorDebug = {
  side: "party" | "enemy";
  index: number;
};

export type BattleCombatantDebug = {
  hpDisplayed: number;
  hpTarget: number;
  isRolling: boolean;
  alive: boolean;
  pp: number;
  maxPp: number;
  inventoryCount: number;
};

export type BattleEnemyCombatantDebug = BattleCombatantDebug & {
  flashActive: boolean;
  flashIntensity: number;
  wobble: {
    dx: number;
    dy: number;
  };
};

export type BattleVictoryDebug = {
  expGained: number;
  moneyGained: number;
  drops: Array<{
    enemyId: number;
    itemId: number;
    itemName: string;
    recipientCharId: number;
  }>;
  levelUps: Array<{
    charId: number;
    name: string;
    fromLevel: number;
    toLevel: number;
  }>;
};

export type LastEnemyActionDebug = {
  enemyIndex: number;
  actionIndex: number;
  actionId: number;
  actionType: number | null;
  target: number | null;
};

export type BattleBackgroundDebug = {
  animated: boolean;
  mode: "horizontal-smooth" | "horizontal-interlaced" | "vertical-compression" | "none";
  scrollX: number;
  scrollY: number;
  warpSample: number;
};

export type BattleFxDebug = {
  shakeCount: number;
  sparkCount: number;
  flashCount: number;
  lungeCount: number;
};

export type BattleDebug = {
  mode: "battle";
  phase: BattlePhase;
  transitionPhase: BattleTransitionPhase;
  encounterAdvantage: EncounterAdvantage;
  autoMode: boolean;
  menuIndex: number;
  roundNumber: number;
  commandIndex: number;
  command: BattleCommand;
  submenu: "command" | "psi" | "goods" | "target";
  submenuIndex: number;
  selection: string;
  targetIndex: number;
  partyTargetIndex: number;
  turnOrder: BattleActorDebug[];
  currentActor: BattleActorDebug | null;
  inputMemberIndex: number | null;
  queuedCount: number;
  executionStepIndex: number;
  executionStepCount: number;
  executionMessage: string;
  lastSfx: BattleSfxCue | null;
  sfxCount: number;
  firedSfx: BattleSfxCue[];
  fx: BattleFxDebug;
  lastEnemyAction: LastEnemyActionDebug | null;
  party: BattleCombatantDebug[];
  enemies: BattleEnemyCombatantDebug[];
  background: BattleBackgroundDebug;
  windowLoaded?: boolean;
  defaultFlavorId?: number;
  activeFlavorId?: number;
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
  victorySummary: BattleVictoryDebug | null;
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

export type NewGameStartupSkipReason = "save_present" | "missing_ref";

export type NewGameStartupDecision =
  | { run: true; reference: string }
  | { run: false; skippedReason: NewGameStartupSkipReason };

export type NewGameStartupRunDebug = {
  attempted: boolean;
  started: boolean;
  reference?: string;
  skippedReason?: NewGameStartupSkipReason | "unresolved_ref";
  status: "skipped" | "running" | "completed" | "aborted";
  truncated: boolean;
  truncatedReason?: string;
  abortedReason?: string;
  fallbackApplied: boolean;
  fallbackReason?: string;
  effectsDispatched: number;
  effectsByKind: Partial<Record<string, number>>;
  records: {
    warps: number;
    warpNoops: number;
    battles: number;
    battleNoops: number;
    shops: number;
    audio: number;
    unsupported: number;
    unsupportedByKind: Partial<Record<string, number>>;
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

export type IntroDebug = {
  mode: "intro";
  introActive: boolean;
  introBeatIndex: number;
  introBeatKind?: string;
  introSkippable: boolean;
  introComplete: boolean;
};

export type CutsceneMoveDebug = {
  active: boolean;
  actor?: string;
  target?: { x: number; y: number };
  arrived: boolean;
  timedOut?: boolean;
  elapsedMs?: number;
  position?: { x: number; y: number };
};

export type OverworldDebug = {
  mode: "world" | "fallback" | "error";
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
  cutsceneMove?: CutsceneMoveDebug;
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
  fontLoaded?: boolean;
  primaryFontId?: number;
  windowLoaded?: boolean;
  defaultFlavorId?: number;
  activeFlavorId?: number;
  tutorial?: TutorialStatus["counts"];
  resolveStatus: string;
  dialogueCounters?: { opens: number; advances: number; closes: number };
  flags?: string[];
  flagsNumCount?: number;
  hasSave?: boolean;
  lastSavedAt?: string;
  restoredFromSave?: boolean;
  eventExecutor?: {
    running: boolean;
    currentEffectKind?: string;
    effectsDispatched: number;
    effectsByKind: Partial<Record<string, number>>;
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
      shops: number;
      audio: number;
      actorMoves: number;
      actorMoveNoops: number;
      unsupported: number;
      unsupportedByKind: Partial<Record<string, number>>;
      lastWarpDest?: number;
      lastTeleportStyle?: number;
      lastBattleGroup?: number;
      lastShopStoreId?: number;
      lastAudioKind?: string;
      lastActorMoveActor?: string;
      lastUnsupportedKind?: string;
    };
  };
  newGameStartup?: NewGameStartupRunDebug;
  partyState?: {
    wallet: number;
    bank: number;
    inventoryChars: number;
    inventoryItems: number;
    partyCount: number;
  };
  shopOpen?: boolean;
  activeShopStoreId?: number;
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

export type FirstSceneDebug = OverworldDebug | BattleDebug | IntroDebug;

export function shouldRunNewGameStartup(options: {
  hasSave: boolean;
  startupRef?: string;
}): NewGameStartupDecision {
  if (options.hasSave) {
    return { run: false, skippedReason: "save_present" };
  }
  if (!options.startupRef) {
    return { run: false, skippedReason: "missing_ref" };
  }
  return { run: true, reference: options.startupRef };
}

export function publishDebug(state: FirstSceneDebug): void {
  (globalThis as Record<string, unknown>).__firstSceneDebug = state;
}

export function publishNewGameStartupRecord(record: NewGameStartupRunDebug): void {
  (globalThis as Record<string, unknown>).__newGameStartupRun = record;
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

  get currentTextRuns(): DialogueTextRun[] {
    return renderPageToTextRuns(this.pages[this.pageIndex], this.resolver);
  }

  get revealedText(): string {
    return this.currentRevealState.revealedText;
  }

  get revealedTextRuns(): DialogueTextRun[] {
    return revealTextRuns(this.currentTextRuns, this.currentRevealState.revealedChars);
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
