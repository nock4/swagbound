import type Phaser from "phaser";
import type { CanvasRect } from "./windowLayout";

export const CLEAN_UI_FONT_FAMILY = "'Pixelify Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const CLEAN_UI_PRIMARY = "#EEF1F6";
export const CLEAN_UI_SECONDARY = "#9AA3B2";
// Text color for the inverted (selected) row: dark, to read on the opaque white selection fill.
export const CLEAN_UI_SELECTION_TEXT = "#0a0a0a";
// Numeric companion (graphics fillStyle takes a hex number) for the caret drawn on that row.
export const CLEAN_UI_SELECTION_CARET = 0x0a0a0a;
export const CLEAN_UI_PANEL_FILL = 0x080a10;
export const CLEAN_UI_PANEL_ALPHA = 0.9;
export const CLEAN_UI_PANEL_BORDER = 0xffffff;
export const CLEAN_UI_PANEL_BORDER_ALPHA = 0.85;
export const CLEAN_UI_PANEL_BORDER_WIDTH = 2;
export const CLEAN_UI_SELECTION_ALPHA = 0.14;
export const CLEAN_UI_HP = 0x5dca7a;
export const CLEAN_UI_PP = 0x4d9bdc;
export const CLEAN_UI_TRACK = 0xffffff;
export const CLEAN_UI_TRACK_ALPHA = 0.12;
export const CLEAN_UI_PANEL_RADIUS = 9;
export const CLEAN_UI_SELECTION_RADIUS = 5;
export const CLEAN_UI_GRID_COLUMNS = 3;

export type CleanTextWeight = 400 | 500;

export type CleanTextOptions = {
  fontSize?: number;
  color?: string;
  weight?: CleanTextWeight;
  lineSpacing?: number;
  fixedWidth?: number;
  fixedHeight?: number;
  align?: "left" | "center" | "right";
  wordWrapWidth?: number;
  resolution?: number;
};

export type CleanPanelPadding = {
  x: number;
  y: number;
};

export type CleanPanelOptions = {
  radius?: number;
  fillColor?: number;
  fillAlpha?: number;
  borderColor?: number;
  borderAlpha?: number;
  borderWidth?: number;
};

export type BattleCommandGridPosition = {
  row: number;
  col: number;
};

export type BattleCommandGridDirection = "left" | "right" | "up" | "down";

export type CleanGridCell = CanvasRect & BattleCommandGridPosition & {
  index: number;
};

export function createCleanText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: CleanTextOptions = {}
): Phaser.GameObjects.Text {
  const fontSize = Math.max(11, Math.round(options.fontSize ?? 14));
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: CLEAN_UI_FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: options.color ?? CLEAN_UI_PRIMARY,
    fontStyle: options.weight === 500 ? "500" : "400",
    lineSpacing: Math.max(0, Math.round(options.lineSpacing ?? 0)),
    resolution: options.resolution ?? cleanTextResolution()
  };
  if (options.fixedWidth !== undefined) {
    style.fixedWidth = Math.max(1, Math.round(options.fixedWidth));
  }
  if (options.fixedHeight !== undefined) {
    style.fixedHeight = Math.max(1, Math.round(options.fixedHeight));
  }
  if (options.align) {
    style.align = options.align;
  }
  if (options.wordWrapWidth !== undefined) {
    style.wordWrap = { width: Math.max(1, Math.round(options.wordWrapWidth)), useAdvancedWrap: true };
  }
  const object = scene.add.text(x, y, text, style);
  object.setResolution(style.resolution ?? cleanTextResolution());
  return object;
}

export function cleanTextStyle(options: CleanTextOptions = {}): Phaser.Types.GameObjects.Text.TextStyle {
  const fontSize = Math.max(11, Math.round(options.fontSize ?? 14));
  return {
    fontFamily: CLEAN_UI_FONT_FAMILY,
    fontSize: `${fontSize}px`,
    color: options.color ?? CLEAN_UI_PRIMARY,
    fontStyle: options.weight === 500 ? "500" : "400",
    lineSpacing: Math.max(0, Math.round(options.lineSpacing ?? 0)),
    resolution: options.resolution ?? cleanTextResolution(),
    ...(options.fixedWidth !== undefined ? { fixedWidth: Math.max(1, Math.round(options.fixedWidth)) } : {}),
    ...(options.fixedHeight !== undefined ? { fixedHeight: Math.max(1, Math.round(options.fixedHeight)) } : {}),
    ...(options.align ? { align: options.align } : {}),
    ...(options.wordWrapWidth !== undefined
      ? { wordWrap: { width: Math.max(1, Math.round(options.wordWrapWidth)), useAdvancedWrap: true } }
      : {})
  };
}

export function drawCleanPanel(
  graphics: Phaser.GameObjects.Graphics,
  rect: CanvasRect,
  options: CleanPanelOptions = {}
): void {
  const radius = Math.max(0, Math.round(options.radius ?? CLEAN_UI_PANEL_RADIUS));
  const borderWidth = Math.max(1, Math.round(options.borderWidth ?? CLEAN_UI_PANEL_BORDER_WIDTH));
  graphics.fillStyle(options.fillColor ?? CLEAN_UI_PANEL_FILL, options.fillAlpha ?? CLEAN_UI_PANEL_ALPHA);
  graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, radius);
  // Stroke inset by half the line width so a thicker border stays inside the panel box.
  const inset = borderWidth / 2;
  graphics.lineStyle(borderWidth, options.borderColor ?? CLEAN_UI_PANEL_BORDER, options.borderAlpha ?? CLEAN_UI_PANEL_BORDER_ALPHA);
  graphics.strokeRoundedRect(rect.x + inset, rect.y + inset, Math.max(1, rect.width - borderWidth), Math.max(1, rect.height - borderWidth), radius);
}

export function drawCleanSelection(graphics: Phaser.GameObjects.Graphics, rect: CanvasRect, opaque = false): void {
  // opaque = the inverted row fill (solid white, dark text drawn on top); default = a soft highlight
  // for single-block lists (e.g. the battle submenu) and status accents, where text stays light.
  graphics.fillStyle(CLEAN_UI_PANEL_BORDER, opaque ? 1 : CLEAN_UI_SELECTION_ALPHA);
  graphics.fillRoundedRect(rect.x, rect.y, rect.width, rect.height, CLEAN_UI_SELECTION_RADIUS);
}

export function drawCleanCaret(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  height: number,
  color = CLEAN_UI_PANEL_BORDER,
  alpha = 0.9
): void {
  const centerY = Math.round(y + height / 2);
  const halfHeight = Math.max(3, Math.round(Math.min(10, height - 2) / 2));
  graphics.fillStyle(color, alpha);
  graphics.fillTriangle(
    Math.round(x),
    centerY - halfHeight,
    Math.round(x),
    centerY + halfHeight,
    Math.round(x + halfHeight + 2),
    centerY
  );
}

export function cleanPanelInnerRect(rect: CanvasRect, padding: number | CleanPanelPadding): CanvasRect {
  const normalized = typeof padding === "number"
    ? { x: padding, y: padding }
    : padding;
  const paddingX = Math.max(0, Math.round(normalized.x));
  const paddingY = Math.max(0, Math.round(normalized.y));
  const insetX = Math.min(Math.floor(Math.max(0, rect.width - 1) / 2), paddingX);
  const insetY = Math.min(Math.floor(Math.max(0, rect.height - 1) / 2), paddingY);
  return {
    x: Math.round(rect.x + insetX),
    y: Math.round(rect.y + insetY),
    width: Math.max(1, Math.round(rect.width - insetX * 2)),
    height: Math.max(1, Math.round(rect.height - insetY * 2))
  };
}

export function cleanLineHeight(fontSize = 14, lineSpacing = 2): number {
  return Math.ceil(Math.max(11, fontSize) * 1.2 + Math.max(0, lineSpacing));
}

export function estimateCleanTextWidth(text: string, fontSize = 14, weight: CleanTextWeight = 400): number {
  const weightMultiplier = weight === 500 ? 1.03 : 1;
  const width = Array.from(text).reduce((sum, char) => {
    if (char === "\n") {
      return sum;
    }
    if (char === " ") {
      return sum + fontSize * 0.34;
    }
    if ("ilI.,:;!'|".includes(char)) {
      return sum + fontSize * 0.32;
    }
    if ("mwMW@#$%&".includes(char)) {
      return sum + fontSize * 0.86;
    }
    if (char >= "A" && char <= "Z") {
      return sum + fontSize * 0.68;
    }
    if (char >= "0" && char <= "9") {
      return sum + fontSize * 0.58;
    }
    return sum + fontSize * 0.56;
  }, 0);
  return Math.ceil(width * weightMultiplier);
}

export function battleCommandGridPosition(index: number, columns = CLEAN_UI_GRID_COLUMNS): BattleCommandGridPosition {
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const normalizedIndex = Math.max(0, Math.floor(index));
  return {
    row: Math.floor(normalizedIndex / normalizedColumns),
    col: normalizedIndex % normalizedColumns
  };
}

export function battleCommandGridIndex(
  row: number,
  col: number,
  count: number,
  columns = CLEAN_UI_GRID_COLUMNS
): number {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (normalizedCount <= 0) {
    return 0;
  }
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.ceil(normalizedCount / normalizedColumns));
  const normalizedRow = modulo(Math.floor(row), rowCount);
  const rowLength = commandGridRowLength(normalizedRow, normalizedCount, normalizedColumns);
  const normalizedCol = modulo(Math.floor(col), rowLength);
  return Math.min(normalizedCount - 1, normalizedRow * normalizedColumns + normalizedCol);
}

export function moveBattleCommandGridIndex(
  index: number,
  count: number,
  direction: BattleCommandGridDirection,
  columns = CLEAN_UI_GRID_COLUMNS
): number {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (normalizedCount <= 0) {
    return 0;
  }
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const current = battleCommandGridPosition(clamp(index, 0, normalizedCount - 1), normalizedColumns);
  if (direction === "left" || direction === "right") {
    const rowLength = commandGridRowLength(current.row, normalizedCount, normalizedColumns);
    const delta = direction === "left" ? -1 : 1;
    return battleCommandGridIndex(current.row, current.col + delta, normalizedCount, normalizedColumns);
  }
  const rowCount = Math.max(1, Math.ceil(normalizedCount / normalizedColumns));
  const delta = direction === "up" ? -1 : 1;
  const nextRow = modulo(current.row + delta, rowCount);
  const nextRowLength = commandGridRowLength(nextRow, normalizedCount, normalizedColumns);
  return battleCommandGridIndex(nextRow, Math.min(current.col, nextRowLength - 1), normalizedCount, normalizedColumns);
}

export function cleanGridCells(
  content: CanvasRect,
  count: number,
  columns = CLEAN_UI_GRID_COLUMNS,
  gapX = 8,
  gapY = 8
): CleanGridCell[] {
  const normalizedCount = Math.max(0, Math.floor(count));
  if (normalizedCount <= 0) {
    return [];
  }
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const rows = Math.max(1, Math.ceil(normalizedCount / normalizedColumns));
  const normalizedGapX = Math.max(0, Math.round(gapX));
  const normalizedGapY = Math.max(0, Math.round(gapY));
  const cellWidth = Math.max(1, Math.floor((content.width - normalizedGapX * (normalizedColumns - 1)) / normalizedColumns));
  const cellHeight = Math.max(1, Math.floor((content.height - normalizedGapY * (rows - 1)) / rows));
  return Array.from({ length: normalizedCount }, (_, index) => {
    const position = battleCommandGridPosition(index, normalizedColumns);
    return {
      index,
      ...position,
      x: Math.round(content.x + position.col * (cellWidth + normalizedGapX)),
      y: Math.round(content.y + position.row * (cellHeight + normalizedGapY)),
      width: cellWidth,
      height: cellHeight
    };
  });
}

export function statusBarFillFraction(current: number, max: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return clamp(current / max, 0, 1);
}

function commandGridRowLength(row: number, count: number, columns: number): number {
  return Math.max(1, Math.min(columns, count - row * columns));
}

function cleanTextResolution(): number {
  const ratio = globalThis.devicePixelRatio;
  return Number.isFinite(ratio) ? Math.max(1, Math.min(3, ratio)) : 1;
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
