import Phaser from "phaser";
import type { FontCollection, WindowCollection } from "@eb/schemas";
import {
  drawText,
  measureBitmapText,
  prepareBitmapFont,
  queueBitmapFontAssets,
  type PreparedBitmapFont
} from "./bitmapFont";
import { publishDebug } from "./state";
import {
  drawWindowFrame,
  prepareWindowFrames,
  queueWindowFrameAssets,
  type PreparedWindowFrames
} from "./windowFrame";
import { CANCEL_KEY_NAMES, CONFIRM_KEY_NAMES, registerDiscreteKeys } from "./inputModel";

export type IntroBeat =
  | { kind: "fade"; dir: "in" | "out"; ms: number }
  | { kind: "fadeOut"; ms: number }
  | { kind: "wait"; ms: number }
  | { kind: "hold"; ms: number }
  | { kind: "nightSky"; ms: number }
  | { kind: "meteor"; ms: number }
  | { kind: "flash"; ms: number }
  | { kind: "shake"; ms: number }
  | { kind: "text"; ms: number };

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

export const INTRO_TEXT_LINES = [
  "A streak of light falls through the night.",
  "Your story begins."
] as const;

export const INTRO_TEXT = INTRO_TEXT_LINES.join("\n");

export const DEFAULT_INTRO_BEATS: readonly IntroBeat[] = [
  { kind: "nightSky", ms: 600 },
  { kind: "meteor", ms: 900 },
  { kind: "flash", ms: 350 },
  { kind: "shake", ms: 500 },
  { kind: "text", ms: 2500 },
  { kind: "fadeOut", ms: 500 }
] as const;

type IntroSceneData = {
  beats?: readonly IntroBeat[];
  nextSceneKey?: string;
  nextSceneData?: object & { gameData?: IntroChromeData };
  gameData?: IntroChromeData;
  font?: FontCollection;
  window?: WindowCollection;
};

type IntroChromeData = {
  font?: FontCollection;
  window?: WindowCollection;
};

const INTRO_DEPTH = 1_000_000;
const INTRO_BACKGROUND = "#10141b";
const INTRO_BASE_WIDTH = 512;
const INTRO_BASE_HEIGHT = 448;
const SKY_BLEED = 12;
const TEXT_BOX_HEIGHT = 112;
const TEXT_BOX_MARGIN_X = 20;
const TEXT_BOX_BOTTOM_MARGIN = 44;
const TEXT_PADDING_X = 28;
const INTRO_TEXT_SCALE = 2;
const INTRO_TEXT_LINE_SPACING = 6;
const MONO = "Menlo, Consolas, monospace";

export class IntroScene extends Phaser.Scene {
  private state: IntroState = createIntroState();
  private font?: FontCollection;
  private window?: WindowCollection;
  private bitmapFont?: PreparedBitmapFont;
  private windowFrames?: PreparedWindowFrames;
  private stage?: Phaser.GameObjects.Container;
  private meteor?: Phaser.GameObjects.Graphics;
  private textBox?: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Rectangle;
  private nextSceneKey = "chunked-world";
  private nextSceneData?: object;
  private finalized = false;

  constructor() {
    super("intro");
  }

  init(data: IntroSceneData = {}): void {
    this.state = createIntroState(data.beats ?? DEFAULT_INTRO_BEATS);
    const chromeData = extractIntroChromeData(data);
    this.font = chromeData.font;
    this.window = chromeData.window;
    this.bitmapFont = undefined;
    this.windowFrames = undefined;
    this.stage = undefined;
    this.meteor = undefined;
    this.textBox = undefined;
    this.overlay = undefined;
    this.nextSceneKey = data.nextSceneKey ?? "chunked-world";
    this.nextSceneData = data.nextSceneData;
    this.finalized = false;
  }

  preload(): void {
    try {
      queueBitmapFontAssets(this, this.font);
      queueWindowFrameAssets(this, this.window);
    } catch (error) {
      console.warn("Intro scene chrome assets unavailable; using fallback text.", error);
    }
  }

  create(): void {
    try {
      this.cameras.main.setBackgroundColor(INTRO_BACKGROUND);
      this.bitmapFont = prepareBitmapFont(this, this.font);
      this.windowFrames = prepareWindowFrames(this, this.window);
      this.buildCinematicStage();
      this.overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000)
        .setOrigin(0, 0)
        .setDepth(INTRO_DEPTH)
        .setAlpha(introOverlayAlpha(this.state));
      this.applyVisualState();
      registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.skip());
      registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.skip());
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

  private buildCinematicStage(): void {
    this.stage = this.add.container(0, 0).setDepth(INTRO_DEPTH - 10);

    const sky = this.add.graphics();
    drawNightSky(sky, this.scale.width, this.scale.height);
    this.stage.add(sky);

    this.meteor = this.add.graphics();
    this.stage.add(this.meteor);

    this.textBox = this.createTextBox();
    this.stage.add(this.textBox);
  }

  private createTextBox(): Phaser.GameObjects.Container {
    const width = Math.min(this.scale.width - TEXT_BOX_MARGIN_X * 2, INTRO_BASE_WIDTH - TEXT_BOX_MARGIN_X * 2);
    const height = TEXT_BOX_HEIGHT;
    const x = Math.round((this.scale.width - width) / 2);
    const y = Math.max(16, this.scale.height - height - TEXT_BOX_BOTTOM_MARGIN);
    const host = this.add.container(0, 0).setVisible(false);

    if (this.windowFrames) {
      host.add(drawWindowFrame(this, this.windowFrames, x, y, width, height, { scale: INTRO_TEXT_SCALE }));
    } else {
      const fallbackFrame = this.add.graphics();
      fallbackFrame.fillStyle(0x0f172a, 0.94);
      fallbackFrame.fillRect(x, y, width, height);
      fallbackFrame.lineStyle(2, 0xe5e7eb, 0.85);
      fallbackFrame.strokeRect(x + 1, y + 1, width - 2, height - 2);
      fallbackFrame.lineStyle(1, 0x64748b, 0.9);
      fallbackFrame.strokeRect(x + 5, y + 5, width - 10, height - 10);
      host.add(fallbackFrame);
    }

    const maxTextWidth = width - TEXT_PADDING_X * 2;
    if (this.bitmapFont && this.windowFrames) {
      const measured = measureBitmapText(this.bitmapFont.collection, this.bitmapFont.sheet, INTRO_TEXT, {
        scale: INTRO_TEXT_SCALE,
        lineSpacing: INTRO_TEXT_LINE_SPACING,
        maxWidth: maxTextWidth
      });
      const textX = x + TEXT_PADDING_X;
      const textY = y + Math.round((height - measured.height) / 2);
      host.add(drawText(this, this.bitmapFont, textX, textY, INTRO_TEXT, {
        scale: INTRO_TEXT_SCALE,
        tint: 0xf8fafc,
        lineSpacing: INTRO_TEXT_LINE_SPACING,
        maxWidth: maxTextWidth
      }));
    } else {
      host.add(this.add.text(x + TEXT_PADDING_X, y + 30, INTRO_TEXT, {
        fontFamily: MONO,
        fontSize: "18px",
        color: "#f8fafc",
        lineSpacing: 8,
        wordWrap: { width: maxTextWidth }
      }));
    }

    return host;
  }

  private applyVisualState(): void {
    const shake = introShakeOffset(this.state);
    this.stage?.setVisible(!this.state.complete);
    this.stage?.setPosition(shake.x, shake.y);
    this.textBox?.setVisible(shouldShowIntroText(this.state));
    this.drawMeteor();
    this.overlay?.setFillStyle(introOverlayColor(this.state));
    this.overlay?.setAlpha(introOverlayAlpha(this.state));
  }

  private drawMeteor(): void {
    if (!this.meteor) {
      return;
    }
    this.meteor.clear();
    if (currentIntroBeat(this.state)?.kind !== "meteor") {
      return;
    }

    const progress = introBeatProgress(this.state);
    const head = introMeteorPosition(progress, this.scale.width, this.scale.height);
    const midTail = introMeteorPosition(progress - 0.08, this.scale.width, this.scale.height);
    const farTail = introMeteorPosition(progress - 0.2, this.scale.width, this.scale.height);

    this.meteor.lineStyle(10, 0x60a5fa, 0.18);
    this.meteor.lineBetween(farTail.x, farTail.y, head.x, head.y);
    this.meteor.lineStyle(5, 0xdbeafe, 0.55);
    this.meteor.lineBetween(midTail.x, midTail.y, head.x, head.y);
    this.meteor.lineStyle(2, 0xffffff, 0.95);
    this.meteor.lineBetween(midTail.x, midTail.y, head.x, head.y);
    this.meteor.fillStyle(0xfff7cc, 1);
    this.meteor.fillCircle(head.x, head.y, 4);
    this.meteor.fillStyle(0xffffff, 0.9);
    this.meteor.fillCircle(head.x - 1, head.y - 1, 2);
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
  if (beat.kind === "flash") {
    return introFlashAlpha(introBeatProgress(state));
  }
  if (beat.kind === "fadeOut") {
    return introBeatProgress(state);
  }
  if (beat.kind !== "fade") {
    return 0;
  }
  const progress = introBeatProgress(state);
  return beat.dir === "in" ? 1 - progress : progress;
}

export function introOverlayColor(state: IntroState): number {
  return currentIntroBeat(state)?.kind === "flash" ? 0xffffff : 0x000000;
}

export function introMeteorPosition(
  progress: number,
  width = INTRO_BASE_WIDTH,
  height = INTRO_BASE_HEIGHT
): { x: number; y: number } {
  const t = smoothStep(clamp01(progress));
  const safeWidth = positiveOrDefault(width, INTRO_BASE_WIDTH);
  const safeHeight = positiveOrDefault(height, INTRO_BASE_HEIGHT);
  const start = {
    x: safeWidth * 0.24,
    y: safeHeight * 0.08
  };
  const end = {
    x: safeWidth * 0.72,
    y: safeHeight * 0.58
  };
  return {
    x: clamp(lerp(start.x, end.x, t), 0, safeWidth),
    y: clamp(lerp(start.y, end.y, t), 0, safeHeight)
  };
}

export function introFlashAlpha(progress: number): number {
  return clamp01(Math.sin(clamp01(progress) * Math.PI)) * 0.88;
}

export function introShakeOffset(state: IntroState): { x: number; y: number } {
  if (currentIntroBeat(state)?.kind !== "shake") {
    return { x: 0, y: 0 };
  }
  const progress = introBeatProgress(state);
  const decay = 1 - progress;
  return {
    x: Math.round(Math.sin(progress * Math.PI * 12) * 5 * decay),
    y: Math.round(Math.cos(progress * Math.PI * 10) * 4 * decay)
  };
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

function shouldShowIntroText(state: IntroState): boolean {
  const beatKind = currentIntroBeat(state)?.kind;
  return beatKind === "text" || beatKind === "fadeOut";
}

function drawNightSky(graphics: Phaser.GameObjects.Graphics, width: number, height: number): void {
  const safeWidth = positiveOrDefault(width, INTRO_BASE_WIDTH);
  const safeHeight = positiveOrDefault(height, INTRO_BASE_HEIGHT);
  const left = -SKY_BLEED;
  const top = -SKY_BLEED;
  const drawWidth = safeWidth + SKY_BLEED * 2;
  const drawHeight = safeHeight + SKY_BLEED * 2;
  const bands = 14;

  graphics.clear();
  for (let band = 0; band < bands; band += 1) {
    const t = band / Math.max(1, bands - 1);
    const color = mixColor(0x050814, 0x182a52, t);
    graphics.fillStyle(color, 1);
    graphics.fillRect(left, top + (drawHeight / bands) * band, drawWidth, Math.ceil(drawHeight / bands) + 1);
  }

  graphics.fillStyle(0xffffff, 0.72);
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 73 + 31) % safeWidth;
    const y = 18 + ((index * 47 + 19) % Math.max(1, Math.floor(safeHeight * 0.58)));
    const size = index % 9 === 0 ? 2 : 1;
    const alpha = index % 5 === 0 ? 0.95 : 0.62;
    graphics.fillStyle(0xffffff, alpha);
    graphics.fillRect(x, y, size, size);
  }
}

function extractIntroChromeData(data: IntroSceneData): IntroChromeData {
  return {
    font: data.font ?? data.gameData?.font ?? data.nextSceneData?.gameData?.font,
    window: data.window ?? data.gameData?.window ?? data.nextSceneData?.gameData?.window
  };
}

function sanitizeDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function positiveOrDefault(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixColor(start: number, end: number, t: number): number {
  const r = Math.round(lerp((start >> 16) & 0xff, (end >> 16) & 0xff, t));
  const g = Math.round(lerp((start >> 8) & 0xff, (end >> 8) & 0xff, t));
  const b = Math.round(lerp(start & 0xff, end & 0xff, t));
  return (r << 16) | (g << 8) | b;
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
