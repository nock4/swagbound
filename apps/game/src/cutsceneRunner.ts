import type { CutsceneStep, EventActorMoveSelector } from "@eb/schemas";
import type { CutsceneSoundId } from "./cutsceneSfx";

export type CutsceneFacing = "up" | "down" | "left" | "right";

/**
 * Side-effect surface the runner drives. The scene implements it; the runner
 * itself stays pure + unit-testable against a mock.
 */
export interface CutsceneHost {
  /** Begin moving an actor toward a world-pixel target. Returns true if the move started. */
  startActorMove(actor: EventActorMoveSelector, to: { x: number; y: number }, run: boolean): boolean;
  /** True while a move started via startActorMove is still in flight. */
  isActorMoveActive(): boolean;
  /** Optional budget for the currently active move, usually based on route distance. */
  currentActorMoveTimeoutMs?(): number | undefined;
  /** Called when the active move exceeds its budget; implementations should snap to the destination. */
  timeoutActorMove?(actor: EventActorMoveSelector, to: { x: number; y: number }, elapsedMs: number, timeoutMs: number): void;
  /** Optional fallback used when no active-move budget is provided. */
  actorPosition?(actor: EventActorMoveSelector): { x: number; y: number } | undefined;
  faceActor(actor: EventActorMoveSelector, dir: CutsceneFacing): void;
  setActorVisible(actor: EventActorMoveSelector, visible: boolean): void;
  startDialogue(pages: readonly string[]): void;
  isDialogueOpen(): boolean;
  setGameFlag(flag: string): void;
  clearGameFlag(flag: string): void;
  setEventFlag(flag: number, set: boolean): void;
  playSound(id: CutsceneSoundId): void;
  warp(to: { x: number; y: number }): void;
}

type CutscenePhase = "running" | "wait" | "move" | "dialogue" | "done";
type MoveStep = Extract<CutsceneStep, { op: "moveActor" }>;

const CUTSCENE_MOVE_MIN_TIMEOUT_MS = 2_000;
const CUTSCENE_MOVE_TIMEOUT_PX_PER_SECOND = 30;

export function cutsceneMoveTimeoutMsForDistance(distancePx: number): number {
  const distance = Number.isFinite(distancePx) ? Math.max(0, distancePx) : 0;
  return Math.max(CUTSCENE_MOVE_MIN_TIMEOUT_MS, (distance / CUTSCENE_MOVE_TIMEOUT_PX_PER_SECOND) * 1000);
}

export function cutsceneMoveTimeoutMs(from: { x: number; y: number } | undefined, to: { x: number; y: number }): number {
  if (!from) {
    return CUTSCENE_MOVE_MIN_TIMEOUT_MS;
  }
  return cutsceneMoveTimeoutMsForDistance(Math.hypot(to.x - from.x, to.y - from.y));
}

/**
 * Runs an authored cutscene's step sequence frame-by-frame. Instantaneous steps
 * (face / show / hide / flag / sound / warp) apply immediately and chain; blocking
 * steps (moveActor / wait / dialogue) pause the sequence until their condition
 * clears. A moveActor that can't start (actor missing) is skipped rather than
 * soft-locking. When the last step finishes, onComplete fires once.
 */
export class CutsceneRunner {
  private index = 0;
  private waitMs = 0;
  private phase: CutscenePhase = "running";
  private moveElapsedMs = 0;
  private moveTimeoutMs = CUTSCENE_MOVE_MIN_TIMEOUT_MS;
  private moveStep?: MoveStep;

  constructor(
    private readonly steps: readonly CutsceneStep[],
    private readonly host: CutsceneHost,
    private readonly onComplete?: () => void
  ) {
    this.beginFromCurrent();
  }

  get running(): boolean {
    return this.phase !== "done";
  }

  /** Index of the step currently in flight (for debug/telemetry). */
  get currentIndex(): number {
    return this.index;
  }

  abort(): void {
    if (this.phase === "done") {
      return;
    }
    this.applyRemainingTerminalState();
    this.phase = "done";
    this.onComplete?.();
  }

  update(deltaMs: number): void {
    const dt = Math.max(0, deltaMs);
    switch (this.phase) {
      case "wait":
        this.waitMs -= dt;
        if (this.waitMs <= 0) {
          this.next();
        }
        break;
      case "move":
        this.moveElapsedMs += dt;
        if (!this.host.isActorMoveActive()) {
          this.clearMoveWait();
          this.next();
        } else if (this.moveElapsedMs >= this.moveTimeoutMs && this.moveStep) {
          this.timeoutActiveMove();
          this.next();
        }
        break;
      case "dialogue":
        if (!this.host.isDialogueOpen()) {
          this.next();
        }
        break;
      default:
        break;
    }
  }

  private next(): void {
    this.index += 1;
    this.beginFromCurrent();
  }

  private clearMoveWait(): void {
    this.moveElapsedMs = 0;
    this.moveTimeoutMs = CUTSCENE_MOVE_MIN_TIMEOUT_MS;
    this.moveStep = undefined;
  }

  /** Run instantaneous steps until a blocking step or the end of the sequence. */
  private beginFromCurrent(): void {
    while (this.index < this.steps.length) {
      if (this.executeStep(this.steps[this.index])) {
        return; // blocking step: phase set, resume in update()
      }
      this.index += 1;
    }
    this.phase = "done";
    this.onComplete?.();
  }

  /** Returns true if the step blocks (and has set the phase to wait on). */
  private executeStep(step: CutsceneStep): boolean {
    switch (step.op) {
      case "faceActor":
        this.host.faceActor(step.actor, step.dir);
        return false;
      case "showActor":
        this.host.setActorVisible(step.actor, true);
        return false;
      case "hideActor":
        this.host.setActorVisible(step.actor, false);
        return false;
      case "setFlag":
        this.host.setGameFlag(step.flag);
        return false;
      case "clearFlag":
        this.host.clearGameFlag(step.flag);
        return false;
      case "eventFlag":
        this.host.setEventFlag(step.flag, step.set);
        return false;
      case "sound":
        this.host.playSound(step.id);
        return false;
      case "warp":
        this.host.warp(step.to);
        return false;
      case "wait":
        this.waitMs = step.ms;
        this.phase = "wait";
        return true;
      case "dialogue":
        this.host.startDialogue(step.pages);
        this.phase = "dialogue";
        return true;
      case "moveActor": {
        const started = this.host.startActorMove(step.actor, step.to, step.run === true);
        if (!started) {
          return false; // skip, don't soft-lock
        }
        this.moveStep = step;
        this.moveElapsedMs = 0;
        this.moveTimeoutMs = this.host.currentActorMoveTimeoutMs?.()
          ?? cutsceneMoveTimeoutMs(this.host.actorPosition?.(step.actor), step.to);
        this.phase = "move";
        return true;
      }
      default: {
        const exhaustive: never = step;
        return Boolean(exhaustive);
      }
    }
  }

  private timeoutActiveMove(): void {
    const step = this.moveStep;
    if (!step) {
      return;
    }
    if (this.host.timeoutActorMove) {
      this.host.timeoutActorMove(step.actor, step.to, this.moveElapsedMs, this.moveTimeoutMs);
    } else {
      console.warn("[cutscene runner] moveActor timed out", {
        actor: step.actor,
        to: step.to,
        elapsedMs: Math.round(this.moveElapsedMs),
        timeoutMs: Math.round(this.moveTimeoutMs)
      });
    }
    this.clearMoveWait();
  }

  private applyRemainingTerminalState(): void {
    for (let i = this.index; i < this.steps.length; i += 1) {
      const step = this.steps[i];
      switch (step.op) {
        case "showActor":
          this.host.setActorVisible(step.actor, true);
          break;
        case "hideActor":
          this.host.setActorVisible(step.actor, false);
          break;
        case "setFlag":
          this.host.setGameFlag(step.flag);
          break;
        case "clearFlag":
          this.host.clearGameFlag(step.flag);
          break;
        case "eventFlag":
          this.host.setEventFlag(step.flag, step.set);
          break;
        default:
          break;
      }
    }
  }
}
