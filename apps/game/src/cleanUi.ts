import type Phaser from "phaser";
import type { CanvasRect } from "./windowLayout";
import { EB_WINDOW_FRAMES, type EbWindowFrame } from "./windowFrames.generated";

/** Pixel thickness of the EarthBound window frame (corner tile + edge tile are 8x8). */
export const EB_WINDOW_BORDER = 8;

let activeWindowFlavorIndex = 0;

/** Select which EarthBound window flavor (0-6) the shared panels render with. */
export function setActiveWindowFlavorIndex(index: number): void {
  activeWindowFlavorIndex = EB_WINDOW_FRAMES[index] ? index : 0;
}

export function activeEbWindowFrame(): EbWindowFrame {
  return EB_WINDOW_FRAMES[activeWindowFlavorIndex] ?? EB_WINDOW_FRAMES[0];
}

/**
 * Draw an authentic EarthBound window: an opaque interior plus the ROM-extracted
 * 8px beveled frame (per-row edge color bands + the 8x8 corner grid, mirrored into
 * each corner). Edges are constant along their axis, so the bands render as solid
 * fills with no tiling artifact. `fillColor` overrides the flavor interior.
 */
export function drawEbWindow(
  graphics: Phaser.GameObjects.Graphics,
  rect: CanvasRect,
  frame: EbWindowFrame = activeEbWindowFrame(),
  fillColor?: number,
  fillAlpha = 1
): void {
  const B = EB_WINDOW_BORDER;
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  graphics.fillStyle(fillColor ?? frame.interior, fillAlpha);
  graphics.fillRect(x, y, w, h);
  if (w < B * 2 + 2 || h < B * 2 + 2) {
    graphics.lineStyle(1, frame.edge[3] ?? 0xffffff, 1);
    graphics.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
    return;
  }
  const innerW = w - B * 2;
  const innerH = h - B * 2;
  for (let i = 0; i < B; i += 1) {
    const color = frame.edge[i] ?? frame.interior;
    graphics.fillStyle(color, 1);
    graphics.fillRect(x + B, y + i, innerW, 1); // top edge row
    graphics.fillRect(x + B, y + h - B + i, innerW, 1); // bottom edge row (profile is symmetric)
    graphics.fillRect(x + i, y + B, 1, innerH); // left edge col
    graphics.fillRect(x + w - B + i, y + B, 1, innerH); // right edge col
  }
  drawEbCorner(graphics, frame, x, y, false, false);
  drawEbCorner(graphics, frame, x + w - B, y, true, false);
  drawEbCorner(graphics, frame, x, y + h - B, false, true);
  drawEbCorner(graphics, frame, x + w - B, y + h - B, true, true);
}

function drawEbCorner(
  graphics: Phaser.GameObjects.Graphics,
  frame: EbWindowFrame,
  ox: number,
  oy: number,
  flipH: boolean,
  flipV: boolean
): void {
  const B = EB_WINDOW_BORDER;
  for (let r = 0; r < B; r += 1) {
    const sr = flipV ? B - 1 - r : r;
    const row = frame.corner[sr];
    let c = 0;
    while (c < B) {
      const color = row[flipH ? B - 1 - c : c];
      if (color === null || color === undefined) {
        c += 1;
        continue;
      }
      let run = 1;
      while (c + run < B && row[flipH ? B - 1 - (c + run) : c + run] === color) {
        run += 1;
      }
      graphics.fillStyle(color, 1);
      graphics.fillRect(ox + c, oy + r, run, 1);
      c += run;
    }
  }
}

export const CLEAN_UI_FONT_FAMILY = "'EarthBound Dialogue Gold', 'Pixelify Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const CLEAN_UI_PRIMARY = "#EEF1F6";
export const CLEAN_UI_SECONDARY = "#9AA3B2";
// Text color for the inverted (selected) row: dark, to read on the opaque white selection fill.
export const CLEAN_UI_SELECTION_TEXT = "#0a0a0a";
// Numeric companion (graphics fillStyle takes a hex number) for the caret drawn on that row.
export const CLEAN_UI_SELECTION_CARET = 0x0a0a0a;
// EarthBound-parity windows: opaque near-black interior (EB "Plain" flavor 0 =
// rgb 16,16,16), square corners, crisp white frame with a beveled inner shadow.
export const CLEAN_UI_PANEL_FILL = 0x101010;
export const CLEAN_UI_PANEL_ALPHA = 1;
export const CLEAN_UI_PANEL_BORDER = 0xffffff;
export const CLEAN_UI_PANEL_BORDER_ALPHA = 1;
export const CLEAN_UI_PANEL_BORDER_WIDTH = 2;
// Inner bevel line just inside the white frame, for the EB window's recessed depth.
export const CLEAN_UI_PANEL_BEVEL = 0x585868;
export const CLEAN_UI_SELECTION_ALPHA = 0.14;
export const CLEAN_UI_HP = 0x5dca7a;
export const CLEAN_UI_PP = 0x4d9bdc;
export const CLEAN_UI_TRACK = 0xffffff;
export const CLEAN_UI_TRACK_ALPHA = 0.12;
export const CLEAN_UI_PANEL_RADIUS = 0;
export const CLEAN_UI_SELECTION_RADIUS = 0;
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
  // Every shared panel now renders as the authentic EarthBound nine-slice window
  // (active flavor). The legacy border/radius options are kept in the signature for
  // callers but no longer used; fillColor still overrides the flavor interior.
  drawEbWindow(graphics, rect, activeEbWindowFrame(), options.fillColor, options.fillAlpha ?? 1);
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
