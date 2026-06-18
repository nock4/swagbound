import type Phaser from "phaser";
import type {
  BattleBackground,
  BattleBackgroundDistortion,
  BattleBackgroundScroll
} from "@eb/schemas";

export const MAX_BATTLE_BACKGROUND_WARP_PX = 8;

const WARP_SAMPLE_ROW = 96;

export type DistortionMode =
  | "horizontal-smooth"
  | "horizontal-interlaced"
  | "vertical-compression"
  | "none";

export type BattleBackgroundDebug = {
  animated: boolean;
  mode: DistortionMode;
  scrollX: number;
  scrollY: number;
  warpSample: number;
};

export type BattleBackgroundRowSample = {
  sourceX: number;
  sourceY: number;
};

export type AnimatedBattleBackgroundHandle = {
  update(now: number): BattleBackgroundDebug;
  debug(): BattleBackgroundDebug;
  destroy(): void;
};

const STATIC_BACKGROUND_DEBUG: BattleBackgroundDebug = {
  animated: false,
  mode: "none",
  scrollX: 0,
  scrollY: 0,
  warpSample: 0
};

export function staticBattleBackgroundDebug(): BattleBackgroundDebug {
  return { ...STATIC_BACKGROUND_DEBUG };
}

export function scrollOffset(now: number, scroll: BattleBackgroundScroll | undefined): { x: number; y: number } {
  const seconds = finiteNumber(now) / 1000;
  return {
    x: finiteNumber(scroll?.x) * seconds,
    y: finiteNumber(scroll?.y) * seconds
  };
}

export function rowOffset(y: number, now: number, distortion: BattleBackgroundDistortion | undefined): number {
  if (!distortion) {
    return 0;
  }
  const amplitude = clamp(Math.abs(finiteNumber(distortion.amplitude)), 0, MAX_BATTLE_BACKGROUND_WARP_PX);
  const frequency = finiteNumber(distortion.frequency);
  const speed = finiteNumber(distortion.speed);
  if (amplitude === 0 || frequency === 0) {
    return 0;
  }
  return amplitude * Math.sin(frequency * finiteNumber(y) + speed * finiteNumber(now) / 1000);
}

export function normalizeDistortionMode(kind: string | undefined): DistortionMode {
  if (!kind) {
    return "none";
  }
  const normalized = kind
    .trim()
    .toLowerCase()
    .replace(/[,_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized || normalized === "none" || normalized.includes("unknown")) {
    return "none";
  }
  const tokens = new Set(normalized.split(" "));
  if (tokens.has("horizontal")) {
    return tokens.has("interlaced") ? "horizontal-interlaced" : "horizontal-smooth";
  }
  if (tokens.has("vertical")) {
    return "vertical-compression";
  }
  return "none";
}

export function rowSampleOffsets(
  mode: DistortionMode,
  y: number,
  now: number,
  distortion: BattleBackgroundDistortion | undefined,
  scrollX: number,
  scrollY: number,
  width: number,
  height: number
): BattleBackgroundRowSample {
  const shift = rowOffset(y, now, distortion);
  const safeWidth = Math.max(1, Math.floor(finiteNumber(width)));
  const safeHeight = Math.max(1, Math.floor(finiteNumber(height)));
  let sourceX = finiteNumber(scrollX);
  let sourceY = finiteNumber(y) + finiteNumber(scrollY);

  if (mode === "horizontal-smooth") {
    sourceX += shift;
  } else if (mode === "horizontal-interlaced") {
    sourceX += Math.floor(finiteNumber(y)) % 2 === 0 ? shift : -shift;
  } else if (mode === "vertical-compression") {
    sourceY += shift;
  }

  return {
    sourceX: wrapInteger(sourceX, safeWidth),
    sourceY: wrapInteger(sourceY, safeHeight)
  };
}

export function hasAnimatedBattleBackground(background: BattleBackground | undefined): boolean {
  if (!background) {
    return false;
  }
  const scroll = background.scroll;
  const distortion = background.distortion;
  const mode = normalizeDistortionMode(distortion?.kind);
  return Boolean(
    (scroll && (!isZero(scroll.x) || !isZero(scroll.y))) ||
    (distortion && mode !== "none" && distortion.amplitude > 0 && distortion.frequency > 0 && !isZero(distortion.speed))
  );
}

export function createAnimatedBattleBackground(
  scene: Phaser.Scene,
  sourceTextureKey: string,
  background: BattleBackground | undefined,
  displayWidth: number,
  displayHeight: number
): AnimatedBattleBackgroundHandle | undefined {
  if (!background || !hasAnimatedBattleBackground(background)) {
    return undefined;
  }
  const source = scene.textures.get(sourceTextureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return undefined;
  }
  const width = Math.max(1, Math.floor(source.width));
  const height = Math.max(1, Math.floor(source.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return undefined;
  }
  context.imageSmoothingEnabled = false;

  const textureKey = `${sourceTextureKey}-animated`;
  if (scene.textures.exists(textureKey)) {
    scene.textures.remove(textureKey);
  }
  const texture = scene.textures.addCanvas(textureKey, canvas);
  if (!texture) {
    return undefined;
  }
  const image = scene.add.image(0, 0, textureKey).setOrigin(0, 0).setDisplaySize(displayWidth, displayHeight);
  const handle = new CanvasAnimatedBattleBackground(textureKey, source, context, texture, image, background);
  handle.update(scene.time.now);
  return handle;
}

class CanvasAnimatedBattleBackground implements AnimatedBattleBackgroundHandle {
  private currentDebug = staticBattleBackgroundDebug();

  constructor(
    private readonly textureKey: string,
    private readonly source: HTMLImageElement | HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
    private readonly texture: Phaser.Textures.CanvasTexture,
    private readonly image: Phaser.GameObjects.Image,
    private readonly background: BattleBackground
  ) {}

  update(now: number): BattleBackgroundDebug {
    this.currentDebug = drawBattleBackgroundFrame(this.context, this.source, this.background, now);
    this.texture.refresh();
    return this.debug();
  }

  debug(): BattleBackgroundDebug {
    return { ...this.currentDebug };
  }

  destroy(): void {
    this.image.destroy();
    this.texture.manager.remove(this.textureKey);
  }
}

function drawBattleBackgroundFrame(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  background: BattleBackground,
  now: number
): BattleBackgroundDebug {
  const width = context.canvas.width;
  const height = context.canvas.height;
  const scroll = scrollOffset(now, background.scroll);
  const scrollX = wrapNumber(scroll.x, width);
  const scrollY = wrapNumber(scroll.y, height);
  const mode = normalizeDistortionMode(background.distortion?.kind);

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y += 1) {
    const { sourceX, sourceY } = rowSampleOffsets(mode, y, now, background.distortion, scrollX, scrollY, width, height);
    drawWrappedRow(context, source, sourceX, sourceY, y, width);
  }

  return {
    animated: true,
    mode,
    scrollX: roundDebug(scrollX),
    scrollY: roundDebug(scrollY),
    warpSample: roundDebug(rowOffset(Math.min(height - 1, WARP_SAMPLE_ROW), now, background.distortion))
  };
}

function drawWrappedRow(
  context: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  destY: number,
  width: number
): void {
  const firstWidth = width - sourceX;
  context.drawImage(source, sourceX, sourceY, firstWidth, 1, 0, destY, firstWidth, 1);
  if (sourceX > 0) {
    context.drawImage(source, 0, sourceY, sourceX, 1, firstWidth, destY, sourceX, 1);
  }
}

function finiteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isZero(value: number): boolean {
  return Math.abs(value) < 0.0005;
}

function wrapNumber(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function wrapInteger(value: number, size: number): number {
  return Math.floor(wrapNumber(Math.round(value), size));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundDebug(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
