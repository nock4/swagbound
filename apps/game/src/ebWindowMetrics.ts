import type { CanvasRect } from "./windowLayout";

// EarthBound ROM Dialog Window Attributes Table id 1, checked in at
// content/rom-truth/window-attributes.json and frame-verified against EB.
export const TALK_WINDOW_SCALE = 2;
export const TALK_WINDOW_NATIVE_CELL_RECT = {
  x: 96,
  y: 8,
  width: 152,
  height: 64
} as const;
export const TALK_WINDOW_NATIVE_VISIBLE_BORDER_RECT = {
  x: 100,
  y: 9,
  width: 144,
  height: 60
} as const;
export const TALK_WINDOW_VISIBLE_LINES = 3;
export const TALK_WINDOW_LINE_PITCH_CSS = 32;
export const TALK_WINDOW_TEXT_PADDING_FROM_CELL_EDGE_CSS = {
  x: 18,
  y: 20
} as const;
export const TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS = 26;
export const TALK_WINDOW_DIALOGUE_LINE_SPACING_CSS = Math.max(
  0,
  TALK_WINDOW_LINE_PITCH_CSS - TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS
);

function scaleRect(rect: CanvasRect): CanvasRect {
  return {
    x: rect.x * TALK_WINDOW_SCALE,
    y: rect.y * TALK_WINDOW_SCALE,
    width: rect.width * TALK_WINDOW_SCALE,
    height: rect.height * TALK_WINDOW_SCALE
  };
}

export const TALK_WINDOW_CELL_RECT_CSS = scaleRect(TALK_WINDOW_NATIVE_CELL_RECT);
export const TALK_WINDOW_VISIBLE_BORDER_RECT_CSS = scaleRect(TALK_WINDOW_NATIVE_VISIBLE_BORDER_RECT);

// drawCleanPanel/drawEbWindowFrame paints the frame flush to the supplied rect,
// so the runtime panel rect is the 2x visible-border target.
export const TALK_WINDOW_PANEL_RECT_CSS = TALK_WINDOW_VISIBLE_BORDER_RECT_CSS;

export const TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS = {
  x: TALK_WINDOW_CELL_RECT_CSS.x + TALK_WINDOW_TEXT_PADDING_FROM_CELL_EDGE_CSS.x - TALK_WINDOW_PANEL_RECT_CSS.x,
  y: TALK_WINDOW_CELL_RECT_CSS.y + TALK_WINDOW_TEXT_PADDING_FROM_CELL_EDGE_CSS.y - TALK_WINDOW_PANEL_RECT_CSS.y
} as const;

export const TALK_WINDOW_WRAP_WIDTH_CSS = Math.max(
  1,
  TALK_WINDOW_VISIBLE_BORDER_RECT_CSS.width - TALK_WINDOW_TEXT_PADDING_FROM_CELL_EDGE_CSS.x * 2
);

export function visibleDialogueLines(lines: string[], max: number): string[] {
  const visibleCount = Math.max(1, Math.trunc(max));
  if (lines.length <= visibleCount) {
    return lines;
  }
  return lines.slice(lines.length - visibleCount);
}
