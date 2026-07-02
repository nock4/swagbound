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
        if (!this.host.isActorMoveActive()) {
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
        this.phase = "move";
        return true;
      }
      default: {
        const exhaustive: never = step;
        return Boolean(exhaustive);
      }
    }
  }
}
