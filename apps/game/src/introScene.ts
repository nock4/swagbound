import Phaser from "phaser";
import { publishDebug } from "./state";

export type IntroBeat =
  | { kind: "fade"; dir: "in" | "out"; ms: number }
  | { kind: "wait"; ms: number }
  | { kind: "hold"; ms: number };

export type IntroState = {
  beats: readonly IntroBeat[];
  beatIndex: number;
  elapsedMs: number;
  complete: boolean;
  skipped: boolean;
};

export type IntroStartDecision =
  | { startIntro: true }
  | { startIntro: false; reason: "disabled" | "save_present" };

export type IntroDisableOptions = {
  search?: string;
  registryFlag?: unknown;
};

export const DEFAULT_INTRO_BEATS: readonly IntroBeat[] = [
  { kind: "fade", dir: "in", ms: 300 },
  { kind: "hold", ms: 180 },
  { kind: "fade", dir: "out", ms: 300 }
] as const;

type IntroSceneData = {
  beats?: readonly IntroBeat[];
  nextSceneKey?: string;
  nextSceneData?: object;
};

const INTRO_DEPTH = 1_000_000;
const INTRO_BACKGROUND = "#10141b";

export class IntroScene extends Phaser.Scene {
  private state: IntroState = createIntroState();
  private overlay?: Phaser.GameObjects.Rectangle;
  private nextSceneKey = "chunked-world";
  private nextSceneData?: object;
  private finalized = false;

  constructor() {
    super("intro");
  }

  init(data: IntroSceneData = {}): void {
    this.state = createIntroState(data.beats ?? DEFAULT_INTRO_BEATS);
    this.nextSceneKey = data.nextSceneKey ?? "chunked-world";
    this.nextSceneData = data.nextSceneData;
    this.finalized = false;
  }

  create(): void {
    try {
      this.cameras.main.setBackgroundColor(INTRO_BACKGROUND);
      this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000)
        .setOrigin(0, 0)
        .setDepth(INTRO_DEPTH)
        .setAlpha(introOverlayAlpha(this.state));
      this.input.keyboard?.on("keydown-SPACE", () => this.skip());
      this.input.keyboard?.on("keydown-ENTER", () => this.skip());
      this.input.keyboard?.on("keydown-ESC", () => this.skip());
      this.publish();
      if (this.state.complete) {
        this.complete();
      }
    } catch (error) {
      this.fallbackToWorld(error);
    }
  }

  update(_: number, deltaMs: number): void {
    if (this.finalized) {
      return;
    }
    try {
      this.state = advanceIntro(this.state, deltaMs);
      this.applyVisualState();
      this.publish();
      if (this.state.complete) {
        this.complete();
      }
    } catch (error) {
      this.fallbackToWorld(error);
    }
  }

  private skip(): void {
    if (this.finalized) {
      return;
    }
    this.state = skipIntro(this.state);
    this.applyVisualState();
    this.publish();
    this.complete();
  }

  private complete(): void {
    if (this.finalized) {
      return;
    }
    this.finalized = true;
    this.publish();
    this.scene.start(this.nextSceneKey, this.nextSceneData);
  }

  private fallbackToWorld(error: unknown): void {
    console.error("Intro scene failed; continuing to world.", error);
    this.finalized = true;
    this.scene.start(this.nextSceneKey, this.nextSceneData);
  }

  private applyVisualState(): void {
    this.overlay?.setAlpha(introOverlayAlpha(this.state));
  }

  private publish(): void {
    publishDebug({
      mode: "intro",
      introActive: !this.finalized,
      introBeatIndex: Math.min(this.state.beatIndex, this.state.beats.length),
      introBeatKind: currentIntroBeat(this.state)?.kind,
      introSkippable: !this.state.complete,
      introComplete: this.state.complete
    });
  }
}

export function createIntroState(beats: readonly IntroBeat[] = DEFAULT_INTRO_BEATS): IntroState {
  return {
    beats: [...beats],
    beatIndex: 0,
    elapsedMs: 0,
    complete: beats.length === 0,
    skipped: false
  };
}

export function advanceIntro(state: IntroState, dtMs: number): IntroState {
  const beats = state.beats;
  let beatIndex = state.beatIndex;
  let elapsedMs = Math.max(0, state.elapsedMs);
  let remainingMs = sanitizeDuration(dtMs);
  let complete = state.complete || beatIndex >= beats.length;

  while (!complete) {
    const beat = beats[beatIndex];
    if (!beat) {
      complete = true;
      elapsedMs = 0;
      break;
    }

    const durationMs = durationForBeat(beat);
    if (durationMs <= 0) {
      beatIndex += 1;
      elapsedMs = 0;
      complete = beatIndex >= beats.length;
      continue;
    }

    const nextElapsedMs = elapsedMs + remainingMs;
    if (nextElapsedMs < durationMs) {
      elapsedMs = nextElapsedMs;
      remainingMs = 0;
      break;
    }

    remainingMs = nextElapsedMs - durationMs;
    beatIndex += 1;
    elapsedMs = 0;
    complete = beatIndex >= beats.length;
    if (remainingMs <= 0 && !complete) {
      break;
    }
  }

  return {
    ...state,
    beatIndex,
    elapsedMs,
    complete
  };
}

export function skipIntro(state: IntroState): IntroState {
  return {
    ...state,
    beatIndex: state.beats.length,
    elapsedMs: 0,
    complete: true,
    skipped: true
  };
}

export function currentIntroBeat(state: IntroState): IntroBeat | undefined {
  return state.complete ? undefined : state.beats[state.beatIndex];
}

export function introBeatProgress(state: IntroState): number {
  const beat = currentIntroBeat(state);
  if (!beat) {
    return 1;
  }
  const durationMs = durationForBeat(beat);
  if (durationMs <= 0) {
    return 1;
  }
  return clamp01(state.elapsedMs / durationMs);
}

export function introOverlayAlpha(state: IntroState): number {
  const beat = currentIntroBeat(state);
  if (!beat) {
    return state.complete ? 1 : 0;
  }
  if (beat.kind !== "fade") {
    return 0;
  }
  const progress = introBeatProgress(state);
  return beat.dir === "in" ? 1 - progress : progress;
}

export function shouldStartIntro(options: { hasSave: boolean; disabled: boolean }): IntroStartDecision {
  if (options.disabled) {
    return { startIntro: false, reason: "disabled" };
  }
  if (options.hasSave) {
    return { startIntro: false, reason: "save_present" };
  }
  return { startIntro: true };
}

export function isIntroDisabled(options: IntroDisableOptions): boolean {
  if (isTruthyFlag(options.registryFlag)) {
    return true;
  }
  const value = new URLSearchParams(options.search ?? "").get("nointro");
  return isTruthyFlag(value);
}

function durationForBeat(beat: IntroBeat): number {
  return sanitizeDuration(beat.ms);
}

function sanitizeDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}
