import type Phaser from "phaser";
import type { FontCollection, FontGlyphSheet } from "@eb/schemas";

export type GlyphSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GlyphLayout = GlyphSourceRect & {
  char: string;
  glyphIndex: number;
  draw: boolean;
  dx: number;
  dy: number;
};

export type BitmapTextLayout = {
  glyphs: GlyphLayout[];
  width: number;
  height: number;
  lineCount: number;
};

export type ProcessedFontImage = {
  imageData: ImageData;
  background: { r: number; g: number; b: number; a: number };
  backgroundPixels: number;
  glyphPixels: number;
  firstGlyphPixel?: { x: number; y: number };
  verified: boolean;
};

export type PreparedBitmapFont = {
  collection: FontCollection;
  sheet: FontGlyphSheet;
  rawTextureKey: string;
  textureKey: string;
};

export type BitmapTextOptions = {
  scale?: number;
  tint?: number;
  lineSpacing?: number;
  maxWidth?: number;
};

const DEFAULT_TINT = 0xf8fafc;

export function primaryFontSheet(font: FontCollection | undefined): FontGlyphSheet | undefined {
  return font?.fonts.find((sheet) => sheet.id === font.primaryFontId);
}

export function rawBitmapFontTextureKey(sheet: Pick<FontGlyphSheet, "id">): string {
  return `earthbound-font-raw-${sheet.id}`;
}

export function processedBitmapFontTextureKey(sheet: Pick<FontGlyphSheet, "id">): string {
  return `earthbound-font-processed-${sheet.id}`;
}

export function bitmapFontFrameName(glyphIndex: number): string {
  return `glyph-${glyphIndex}`;
}

export function queueBitmapFontAssets(scene: Phaser.Scene, font: FontCollection | undefined): void {
  const sheet = primaryFontSheet(font);
  if (!sheet) {
    return;
  }
  const key = rawBitmapFontTextureKey(sheet);
  if (!scene.textures.exists(key)) {
    scene.load.image(key, `/generated/${sheet.file}`);
  }
}

export function glyphIndexForCodepoint(
  codepoint: number,
  font: Pick<FontCollection, "charCodeOffset">,
  sheet: Pick<FontGlyphSheet, "glyphCount">
): number {
  const glyphIndex = codepoint - font.charCodeOffset;
  return Number.isInteger(glyphIndex) && glyphIndex >= 0 && glyphIndex < sheet.glyphCount ? glyphIndex : 0;
}

export function glyphSourceRect(
  glyphIndex: number,
  sheet: Pick<FontGlyphSheet, "columns" | "cellWidth" | "cellHeight">
): GlyphSourceRect {
  return {
    x: (glyphIndex % sheet.columns) * sheet.cellWidth,
    y: Math.floor(glyphIndex / sheet.columns) * sheet.cellHeight,
    width: sheet.cellWidth,
    height: sheet.cellHeight
  };
}

export function glyphAdvance(
  glyphIndex: number,
  sheet: Pick<FontGlyphSheet, "widths">,
  scale = 1
): number {
  return (sheet.widths[glyphIndex] ?? sheet.widths[0] ?? 0) * integerScale(scale);
}

export function measureBitmapText(
  font: FontCollection,
  sheet: FontGlyphSheet,
  text: string,
  options: BitmapTextOptions = {}
): { width: number; height: number; lineCount: number } {
  const layout = layoutBitmapText(font, sheet, text, options);
  return { width: layout.width, height: layout.height, lineCount: layout.lineCount };
}

export function layoutBitmapText(
  font: FontCollection,
  sheet: FontGlyphSheet,
  text: string,
  options: BitmapTextOptions = {}
): BitmapTextLayout {
  const scale = integerScale(options.scale);
  const lineSpacing = Math.max(0, options.lineSpacing ?? 0);
  const lineHeight = sheet.cellHeight * scale + lineSpacing;
  const lines = wrapBitmapText(font, sheet, text, options.maxWidth, scale);
  const glyphs: GlyphLayout[] = [];
  let maxWidth = 0;

  lines.forEach((line, lineIndex) => {
    let penX = 0;
    for (const char of Array.from(line)) {
      const codepoint = char.codePointAt(0);
      const glyphIndex = codepoint === undefined ? 0 : glyphIndexForCodepoint(codepoint, font, sheet);
      const rect = glyphSourceRect(glyphIndex, sheet);
      const advance = glyphAdvance(glyphIndex, sheet, scale);
      glyphs.push({
        ...rect,
        char,
        glyphIndex,
        draw: glyphIndex !== 0,
        dx: penX,
        dy: lineIndex * lineHeight
      });
      penX += advance;
    }
    maxWidth = Math.max(maxWidth, penX);
  });

  return {
    glyphs,
    width: maxWidth,
    height: lines.length > 0 ? lines.length * sheet.cellHeight * scale + Math.max(0, lines.length - 1) * lineSpacing : 0,
    lineCount: lines.length
  };
}

export function processFontImageData(imageData: ImageData): ProcessedFontImage {
  const data = imageData.data;
  const background = {
    r: data[0] ?? 0,
    g: data[1] ?? 0,
    b: data[2] ?? 0,
    a: data[3] ?? 0
  };
  let backgroundPixels = 0;
  let glyphPixels = 0;
  let firstGlyphPixel: { x: number; y: number } | undefined;

  for (let offset = 0; offset < data.length; offset += 4) {
    const isBackground =
      data[offset] === background.r &&
      data[offset + 1] === background.g &&
      data[offset + 2] === background.b &&
      data[offset + 3] === background.a;
    if (isBackground) {
      data[offset + 3] = 0;
      backgroundPixels += 1;
      continue;
    }

    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = 255;
    if (!firstGlyphPixel) {
      const pixel = offset / 4;
      firstGlyphPixel = {
        x: pixel % imageData.width,
        y: Math.floor(pixel / imageData.width)
      };
    }
    glyphPixels += 1;
  }

  const backgroundAlpha = data[3] ?? 255;
  const glyphOffset = firstGlyphPixel ? ((firstGlyphPixel.y * imageData.width + firstGlyphPixel.x) * 4) : -1;
  const glyphVerified = glyphOffset >= 0 &&
    data[glyphOffset] === 255 &&
    data[glyphOffset + 1] === 255 &&
    data[glyphOffset + 2] === 255 &&
    data[glyphOffset + 3] === 255;

  return {
    imageData,
    background,
    backgroundPixels,
    glyphPixels,
    firstGlyphPixel,
    verified: backgroundAlpha === 0 && glyphVerified
  };
}

export function prepareBitmapFont(scene: Phaser.Scene, font: FontCollection | undefined): PreparedBitmapFont | undefined {
  const sheet = primaryFontSheet(font);
  if (!font || !sheet) {
    return undefined;
  }
  const rawTextureKey = rawBitmapFontTextureKey(sheet);
  if (!scene.textures.exists(rawTextureKey)) {
    return undefined;
  }

  const textureKey = processedBitmapFontTextureKey(sheet);
  if (!scene.textures.exists(textureKey) && !createProcessedTexture(scene, rawTextureKey, textureKey, sheet)) {
    return undefined;
  }

  const texture = scene.textures.get(textureKey);
  for (let glyphIndex = 0; glyphIndex < sheet.glyphCount; glyphIndex += 1) {
    const frameName = bitmapFontFrameName(glyphIndex);
    if (!texture.has(frameName)) {
      const rect = glyphSourceRect(glyphIndex, sheet);
      texture.add(frameName, 0, rect.x, rect.y, rect.width, rect.height);
    }
  }

  return { collection: font, sheet, rawTextureKey, textureKey };
}

export function drawText(
  scene: Phaser.Scene,
  font: PreparedBitmapFont,
  x: number,
  y: number,
  text: string,
  options: BitmapTextOptions = {}
): Phaser.GameObjects.Container {
  const bitmapText = new BitmapFontText(scene, font, x, y, text, options);
  return bitmapText.container;
}

export class BitmapFontText {
  readonly container: Phaser.GameObjects.Container;
  private text = "";
  private options: Required<Pick<BitmapTextOptions, "scale" | "tint" | "lineSpacing">> & Pick<BitmapTextOptions, "maxWidth">;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly font: PreparedBitmapFont,
    x: number,
    y: number,
    text: string,
    options: BitmapTextOptions = {}
  ) {
    this.options = normalizeTextOptions(options);
    this.container = scene.add.container(x, y);
    this.setText(text);
  }

  setText(text: string): this {
    if (text === this.text && this.container.length > 0) {
      return this;
    }
    this.text = text;
    this.container.removeAll(true);
    const layout = layoutBitmapText(this.font.collection, this.font.sheet, text, this.options);
    const scale = this.options.scale;
    for (const glyph of layout.glyphs) {
      if (!glyph.draw) {
        continue;
      }
      const image = this.scene.add.image(
        glyph.dx,
        glyph.dy,
        this.font.textureKey,
        bitmapFontFrameName(glyph.glyphIndex)
      ).setOrigin(0, 0).setScale(scale).setTint(this.options.tint);
      this.container.add(image);
    }
    this.container.setSize(layout.width, layout.height);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.container.setPosition(x, y);
    return this;
  }

  setDepth(depth: number): this {
    this.container.setDepth(depth);
    return this;
  }

  setVisible(visible: boolean): this {
    this.container.setVisible(visible);
    return this;
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

function wrapBitmapText(
  font: FontCollection,
  sheet: FontGlyphSheet,
  text: string,
  maxWidth: number | undefined,
  scale: number
): string[] {
  if (!Number.isFinite(maxWidth) || (maxWidth ?? 0) <= 0) {
    return text.split("\n");
  }
  const widthLimit = maxWidth as number;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const token of paragraph.match(/\S+\s*|\s+/g) ?? [""]) {
      const candidate = line + token;
      if (line.length > 0 && textWidth(font, sheet, candidate, scale) > widthLimit) {
        lines.push(line.trimEnd());
        line = token.trimStart();
        while (line.length > 0 && textWidth(font, sheet, line, scale) > widthLimit) {
          const split = splitTokenForWidth(font, sheet, line, widthLimit, scale);
          lines.push(split.head);
          line = split.tail;
        }
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function splitTokenForWidth(
  font: FontCollection,
  sheet: FontGlyphSheet,
  token: string,
  maxWidth: number,
  scale: number
): { head: string; tail: string } {
  let width = 0;
  let count = 0;
  const chars = Array.from(token);
  for (const char of chars) {
    const codepoint = char.codePointAt(0);
    const glyphIndex = codepoint === undefined ? 0 : glyphIndexForCodepoint(codepoint, font, sheet);
    const advance = glyphAdvance(glyphIndex, sheet, scale);
    if (count > 0 && width + advance > maxWidth) {
      break;
    }
    width += advance;
    count += 1;
  }
  return {
    head: chars.slice(0, Math.max(1, count)).join(""),
    tail: chars.slice(Math.max(1, count)).join("")
  };
}

function textWidth(font: FontCollection, sheet: FontGlyphSheet, text: string, scale: number): number {
  let width = 0;
  for (const char of Array.from(text)) {
    const codepoint = char.codePointAt(0);
    const glyphIndex = codepoint === undefined ? 0 : glyphIndexForCodepoint(codepoint, font, sheet);
    width += glyphAdvance(glyphIndex, sheet, scale);
  }
  return width;
}

function createProcessedTexture(
  scene: Phaser.Scene,
  rawTextureKey: string,
  textureKey: string,
  sheet: FontGlyphSheet
): boolean {
  const source = scene.textures.get(rawTextureKey).getSourceImage();
  if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
    return false;
  }

  const canvas = document.createElement("canvas");
  canvas.width = sheet.imageWidth;
  canvas.height = sheet.imageHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return false;
  }
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, sheet.imageWidth, sheet.imageHeight);
  const result = processFontImageData(context.getImageData(0, 0, sheet.imageWidth, sheet.imageHeight));
  if (!result.verified) {
    return false;
  }
  context.clearRect(0, 0, sheet.imageWidth, sheet.imageHeight);
  context.putImageData(result.imageData, 0, 0);
  scene.textures.addCanvas(textureKey, canvas);
  return true;
}

function normalizeTextOptions(
  options: BitmapTextOptions
): Required<Pick<BitmapTextOptions, "scale" | "tint" | "lineSpacing">> & Pick<BitmapTextOptions, "maxWidth"> {
  return {
    scale: integerScale(options.scale),
    tint: options.tint ?? DEFAULT_TINT,
    lineSpacing: Math.max(0, options.lineSpacing ?? 0),
    ...(options.maxWidth !== undefined ? { maxWidth: options.maxWidth } : {})
  };
}

function integerScale(scale = 1): number {
  return Math.max(1, Math.round(scale));
}
