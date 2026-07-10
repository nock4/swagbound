import type { WindowCollection, WindowLayout } from "@eb/schemas";

export const EB_UI_SCALE = 2;
export const EB_WINDOW_TILE_PX = 8;
export const EB_BITMAP_TEXT_SCALE = 2;
export const EB_NATIVE_GLYPH_HEIGHT_PX = EB_WINDOW_TILE_PX;
export const EB_TEXT_LINE_SPACING = 8;

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenSize = {
  width: number;
  height: number;
};

export type ContentFitWindowOptions = {
  x: number;
  y: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  lineCount?: number;
  extraHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
};

export type TextLineHeightOptions = {
  glyphHeight?: number;
  textScale?: number;
  lineSpacing?: number;
};

export type DialogueWindowRectOptions = {
  screen: ScreenSize;
  sideMargin: number;
  bottomMargin: number;
  paddingX: number;
  paddingY: number;
  visibleLines: number;
  lineHeight: number;
  /** Anchor the box to the top of the screen instead of the bottom. */
  topAnchored?: boolean;
};

export type DialogueVisibleLineCountOptions = {
  text: string;
  wrapWidth: number;
  maxVisibleLines: number;
  wrapLineCount: (text: string, wrapWidth: number) => number;
};

export type MenuWindowRectOptions = {
  screen: ScreenSize;
  x: number;
  y: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  leftMargin?: number;
  rightMargin: number;
  bottomMargin: number;
  minWidth: number;
  maxVisibleItems: number;
  titleLines?: number;
  titleGap?: number;
};

export type BattleWindowRectOptions = {
  screen: ScreenSize;
  x: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  bottomMargin: number;
  leftMargin: number;
  rightMargin: number;
  minWidth: number;
  maxWidth?: number;
  maxHeight?: number;
};

export type BattleMenuListRect = CanvasRect & {
  visibleStart: number;
  visibleCount: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
};

export type BattleMenuCascadeLayoutOptions = {
  screen: ScreenSize;
  commandLabels: string[];
  submenuLabels?: string[];
  descriptionLines?: string[];
  selectedSubmenuIndex?: number;
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  leftMargin: number;
  topMargin: number;
  rightMargin: number;
  bottomMargin: number;
  cascadeOverlap: number;
  submenuOffsetY: number;
  descriptionGap: number;
  minCommandWidth: number;
  minSubmenuWidth: number;
  minDescriptionWidth: number;
  commandExtraHeight?: number;
  maxMenuWidth?: number;
  maxDescriptionWidth?: number;
  descriptionPaddingX?: number;
  descriptionPaddingY?: number;
};

export type BattleMenuCascadeLayout = {
  command?: BattleMenuListRect;
  submenu?: BattleMenuListRect;
  description?: CanvasRect;
};

export type BattleStatusCardRect = CanvasRect & {
  index: number;
  active: boolean;
};

export type BattleStatusDigitBoxRect = CanvasRect & {
  digitIndex: number;
  digit: string;
};

export type BattleStatusCardContentRectOptions = {
  card: CanvasRect;
  frameThickness: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
};

export type WindowInnerContentRectOptions = {
  rect: CanvasRect;
  frameThickness: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
};

export type BattleStatusCardRectsOptions = {
  screen: ScreenSize;
  memberCount: number;
  activeIndex?: number | null;
  sideMargin: number;
  bottomMargin: number;
  gap: number;
  cardHeight: number;
  minCardWidth: number;
  maxCardWidth: number;
  activeLift: number;
};

export type BattleStatusDigitBoxRectsOptions = {
  card: CanvasRect;
  value: number;
  digitCount: number;
  digitWidth: number;
  digitHeight: number;
  gap: number;
  rightPadding: number;
  y: number;
  leftPadding?: number;
};

export function windowLayoutToCanvasRect(
  layout: Pick<WindowLayout, "width" | "height" | "xOffset" | "yOffset">,
  scale = EB_UI_SCALE
): CanvasRect {
  const unit = EB_WINDOW_TILE_PX * scale;
  return {
    x: layout.xOffset * unit,
    y: layout.yOffset * unit,
    width: layout.width * unit,
    height: layout.height * unit
  };
}

export function findWindowLayout(
  window: WindowCollection | undefined,
  id: number
): WindowLayout | undefined {
  return window?.layouts?.find((layout) => layout.id === id);
}

export function canvasRectForWindowId(
  window: WindowCollection | undefined,
  id: number,
  fallback: CanvasRect
): CanvasRect {
  const layout = findWindowLayout(window, id);
  return layout ? windowLayoutToCanvasRect(layout) : fallback;
}

export function ebTextLineHeight(options: TextLineHeightOptions = {}): number {
  const glyphHeight = Math.max(1, Math.ceil(options.glyphHeight ?? EB_NATIVE_GLYPH_HEIGHT_PX));
  const textScale = Math.max(1, Math.round(options.textScale ?? EB_BITMAP_TEXT_SCALE));
  const lineSpacing = Math.max(0, Math.ceil(options.lineSpacing ?? EB_TEXT_LINE_SPACING));
  return glyphHeight * textScale + lineSpacing;
}

export function contentFitWindowRect(options: ContentFitWindowOptions): CanvasRect {
  const labelWidth = Math.max(0, ...options.labels.map((label) => Math.ceil(options.measureText(label))));
  const lineCount = Math.max(0, Math.ceil(options.lineCount ?? options.labels.length));
  const width = clampDimension(
    labelWidth + options.paddingX * 2,
    options.minWidth,
    options.maxWidth
  );
  const height = clampDimension(
    lineCount * options.lineHeight + options.paddingY * 2 + (options.extraHeight ?? 0),
    options.minHeight,
    options.maxHeight
  );
  return {
    x: Math.round(options.x),
    y: Math.round(options.y),
    width,
    height
  };
}

export function dialogueWindowRect(options: DialogueWindowRectOptions): CanvasRect {
  const sideMargin = Math.max(0, Math.ceil(options.sideMargin));
  const bottomMargin = Math.max(0, Math.ceil(options.bottomMargin));
  const visibleLines = Math.max(1, Math.ceil(options.visibleLines));
  const width = Math.min(
    Math.max(1, Math.floor(options.screen.width)),
    Math.max(1, Math.floor(options.screen.width - sideMargin * 2))
  );
  const maxHeight = Math.max(
    1,
    Math.min(
      Math.max(1, Math.floor(options.screen.height - bottomMargin)),
      Math.floor(options.screen.height / 3)
    )
  );
  const height = clampDimension(
    visibleLines * options.lineHeight + options.paddingY * 2,
    1,
    maxHeight
  );
  const y = options.topAnchored
    ? bottomMargin
    : Math.max(0, Math.round(options.screen.height - height - bottomMargin));
  return {
    x: Math.min(sideMargin, Math.max(0, Math.floor(options.screen.width - width))),
    y,
    width,
    height
  };
}

export function dialogueTextWidth(rect: Pick<CanvasRect, "width">, paddingX: number): number {
  return Math.max(1, Math.floor(rect.width - Math.max(0, paddingX) * 2));
}

export function dialogueVisibleLineCount(options: DialogueVisibleLineCountOptions): number {
  const maxVisibleLines = Math.max(1, Math.ceil(options.maxVisibleLines));
  const wrapWidth = Math.max(1, Math.floor(options.wrapWidth));
  const wrappedLines = Math.max(1, Math.ceil(options.wrapLineCount(options.text, wrapWidth)));
  return Math.min(maxVisibleLines, wrappedLines);
}

export function menuWindowRect(options: MenuWindowRectOptions): CanvasRect {
  const leftMargin = Math.max(0, Math.ceil(options.leftMargin ?? 0));
  const rightMargin = Math.max(0, Math.ceil(options.rightMargin));
  const titleLines = Math.max(0, Math.ceil(options.titleLines ?? 0));
  const titleGap = titleLines > 0 ? Math.max(0, Math.ceil(options.titleGap ?? 0)) : 0;
  const maxHeight = Math.max(
    options.lineHeight + options.paddingY * 2,
    Math.floor(options.screen.height - options.y - options.bottomMargin)
  );
  const maxItemLines = Math.max(
    1,
    Math.floor((maxHeight - options.paddingY * 2 - titleLines * options.lineHeight - titleGap) / options.lineHeight)
  );
  const visibleItemCount = Math.min(
    Math.max(0, options.labels.length - titleLines),
    Math.max(1, options.maxVisibleItems),
    maxItemLines
  );
  const lineCount = visibleItemCount + titleLines;
  const maxScreenWidth = Math.max(1, Math.floor(options.screen.width - leftMargin - rightMargin));
  const maxWidth = Math.max(1, maxScreenWidth);
  const minWidth = Math.min(Math.max(1, Math.ceil(options.minWidth)), maxWidth);
  const rect = contentFitWindowRect({
    x: options.x,
    y: options.y,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount,
    extraHeight: titleGap,
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth,
    maxWidth,
    maxHeight
  });
  return clampRectToScreen(rect, options.screen, {
    left: leftMargin,
    right: rightMargin,
    top: options.y,
    bottom: options.bottomMargin
  });
}

export function battleWindowRect(options: BattleWindowRectOptions): CanvasRect {
  const screenMaxWidth = Math.max(1, Math.floor(options.screen.width - options.leftMargin - options.rightMargin));
  const maxWidth = Math.min(screenMaxWidth, Math.max(1, Math.floor(options.maxWidth ?? screenMaxWidth)));
  const minWidth = Math.min(Math.max(1, Math.ceil(options.minWidth)), maxWidth);
  const maxHeight = Math.max(
    options.lineHeight + options.paddingY * 2,
    Math.floor(options.maxHeight ?? (options.screen.height - options.bottomMargin))
  );
  const rect = contentFitWindowRect({
    x: options.x,
    y: 0,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount: Math.max(1, options.labels.length),
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth,
    maxWidth,
    maxHeight
  });
  const y = Math.max(0, Math.round(options.screen.height - rect.height - options.bottomMargin));
  return clampRectToScreen({ ...rect, y }, options.screen, {
    left: options.leftMargin,
    right: options.rightMargin,
    top: 0,
    bottom: options.bottomMargin
  });
}

export function battleMenuCascadeLayout(options: BattleMenuCascadeLayoutOptions): BattleMenuCascadeLayout {
  const leftMargin = Math.max(0, Math.ceil(options.leftMargin));
  const topMargin = Math.max(0, Math.ceil(options.topMargin));
  const rightMargin = Math.max(0, Math.ceil(options.rightMargin));
  const bottomMargin = Math.max(0, Math.ceil(options.bottomMargin));
  const bottomLimit = Math.max(topMargin + 1, Math.floor(options.screen.height - bottomMargin));
  const maxMenuWidth = Math.max(
    1,
    Math.min(
      Math.floor(options.maxMenuWidth ?? options.screen.width),
      Math.floor(options.screen.width - leftMargin - rightMargin)
    )
  );
  const command = options.commandLabels.length > 0
    ? battleMenuListRect({
      screen: options.screen,
      x: leftMargin,
      y: topMargin,
      labels: options.commandLabels,
      selectedIndex: 0,
      visibleCount: options.commandLabels.length,
      measureText: options.measureText,
      lineHeight: options.lineHeight,
      paddingX: options.paddingX,
      paddingY: options.paddingY,
      extraHeight: options.commandExtraHeight,
      minWidth: options.minCommandWidth,
      maxWidth: maxMenuWidth,
      leftMargin,
      topMargin,
      rightMargin,
      bottomMargin
    })
    : undefined;

  const submenuLabels = options.submenuLabels ?? [];
  // When an info strip will render under the stack, the scrollable list must
  // RESERVE its height up front - otherwise a max-load list (50-entry PSI) runs
  // to the same bottom limit and the strip has nowhere to go but on top of it.
  const willRenderDescription = (options.descriptionLines ?? []).length > 0;
  const descriptionLineCount = Math.max(1, (options.descriptionLines ?? []).length);
  const descriptionReserve = willRenderDescription
    ? options.lineHeight * descriptionLineCount +
      (options.descriptionPaddingY ?? options.paddingY) * 2 +
      Math.max(0, options.descriptionGap) +
      Math.max(0, options.cascadeOverlap) +
      4
    : 0;
  const submenu = command && submenuLabels.length > 0
    ? battleScrollableMenuListRect({
      screen: options.screen,
      x: command.x + Math.max(0, command.width - Math.max(0, options.cascadeOverlap)),
      y: command.y + Math.max(0, options.submenuOffsetY),
      labels: submenuLabels,
      selectedIndex: options.selectedSubmenuIndex ?? 0,
      measureText: options.measureText,
      lineHeight: options.lineHeight,
      paddingX: options.paddingX,
      paddingY: options.paddingY,
      minWidth: options.minSubmenuWidth,
      maxWidth: maxMenuWidth,
      leftMargin,
      topMargin,
      rightMargin,
      bottomMargin: bottomMargin + descriptionReserve
    })
    : undefined;

  const descriptionLines = options.descriptionLines ?? [];
  // The info strip sits below the DEEPEST open window: anchoring on the command
  // window alone paints it over tall submenus (a 50-entry PSI list at max load).
  const descriptionAnchorBottom = Math.max(
    command ? command.y + command.height : 0,
    submenu ? submenu.y + submenu.height : 0
  );
  const description = command && descriptionLines.length > 0
    ? battleDescriptionRect({
      screen: options.screen,
      x: command.x,
      y: Math.min(
        descriptionAnchorBottom - Math.max(0, options.cascadeOverlap) + Math.max(0, options.descriptionGap),
        Math.max(
          topMargin,
          bottomLimit - options.lineHeight * descriptionLineCount - (options.descriptionPaddingY ?? options.paddingY) * 2
        )
      ),
      labels: descriptionLines,
      measureText: options.measureText,
      lineHeight: options.lineHeight,
      paddingX: options.descriptionPaddingX ?? options.paddingX,
      paddingY: options.descriptionPaddingY ?? options.paddingY,
      minWidth: Math.max(options.minDescriptionWidth, command.width),
      maxWidth: Math.min(
        Math.max(1, options.maxDescriptionWidth ?? maxMenuWidth),
        Math.floor(options.screen.width - leftMargin - rightMargin)
      ),
      leftMargin,
      topMargin,
      rightMargin,
      bottomMargin
    })
    : undefined;

  return { command, submenu, description };
}

export function battleStatusCardRects(options: BattleStatusCardRectsOptions): BattleStatusCardRect[] {
  const memberCount = Math.min(4, Math.max(0, Math.floor(options.memberCount)));
  if (memberCount <= 0) {
    return [];
  }
  const sideMargin = Math.max(0, Math.ceil(options.sideMargin));
  const gap = Math.max(0, Math.ceil(options.gap));
  const availableWidth = Math.max(1, Math.floor(options.screen.width - sideMargin * 2 - gap * (memberCount - 1)));
  const maxFitWidth = Math.max(1, Math.floor(availableWidth / memberCount));
  const minCardWidth = Math.min(Math.max(1, Math.ceil(options.minCardWidth)), maxFitWidth);
  const preferredCardWidth = Math.min(Math.max(1, Math.ceil(options.maxCardWidth)), maxFitWidth);
  const cardWidth = Math.max(minCardWidth, preferredCardWidth);
  const totalWidth = cardWidth * memberCount + gap * (memberCount - 1);
  const xStart = clampNumber(Math.round((options.screen.width - totalWidth) / 2), sideMargin, Math.max(sideMargin, options.screen.width - sideMargin - totalWidth));
  const cardHeight = Math.max(1, Math.ceil(options.cardHeight));
  const bottomMargin = Math.max(0, Math.ceil(options.bottomMargin));
  const activeLift = Math.max(0, Math.ceil(options.activeLift));
  const activeIndex = options.activeIndex ?? -1;
  const baseY = Math.max(0, Math.floor(options.screen.height - bottomMargin - cardHeight));

  return Array.from({ length: memberCount }, (_, index) => {
    const active = index === activeIndex;
    return {
      index,
      active,
      x: xStart + index * (cardWidth + gap),
      y: Math.max(0, baseY - (active ? activeLift : 0)),
      width: cardWidth,
      height: cardHeight
    };
  });
}

export function battleStatusCardContentRect(options: BattleStatusCardContentRectOptions): CanvasRect {
  return windowInnerContentRect({
    rect: options.card,
    frameThickness: options.frameThickness,
    paddingX: options.paddingX,
    paddingTop: options.paddingTop,
    paddingBottom: options.paddingBottom
  });
}

export function windowInnerContentRect(options: WindowInnerContentRectOptions): CanvasRect {
  const frameThickness = Math.max(0, Math.ceil(options.frameThickness));
  const paddingX = Math.max(0, Math.ceil(options.paddingX));
  const paddingTop = Math.max(0, Math.ceil(options.paddingTop));
  const paddingBottom = Math.max(0, Math.ceil(options.paddingBottom));
  const insetX = Math.min(
    Math.floor(Math.max(0, options.rect.width - 1) / 2),
    frameThickness + paddingX
  );
  const insetTop = Math.min(
    Math.floor(Math.max(0, options.rect.height - 1) / 2),
    frameThickness + paddingTop
  );
  const insetBottom = Math.min(
    Math.floor(Math.max(0, options.rect.height - insetTop - 1)),
    frameThickness + paddingBottom
  );
  return {
    x: Math.round(options.rect.x + insetX),
    y: Math.round(options.rect.y + insetTop),
    width: Math.max(1, Math.floor(options.rect.width - insetX * 2)),
    height: Math.max(1, Math.floor(options.rect.height - insetTop - insetBottom))
  };
}

export function battleStatusDigitBoxRects(options: BattleStatusDigitBoxRectsOptions): BattleStatusDigitBoxRect[] {
  const digitCount = Math.max(1, Math.floor(options.digitCount));
  const leftPadding = Math.max(0, Math.ceil(options.leftPadding ?? 0));
  const rightPadding = Math.max(0, Math.ceil(options.rightPadding));
  const availableWidth = Math.max(
    digitCount,
    Math.floor(options.card.width - leftPadding - rightPadding)
  );
  const requestedGap = Math.max(0, Math.ceil(options.gap));
  const maxGap = digitCount > 1
    ? Math.max(0, Math.floor((availableWidth - digitCount) / (digitCount - 1)))
    : 0;
  const gap = Math.min(requestedGap, maxGap);
  const requestedDigitWidth = Math.max(1, Math.ceil(options.digitWidth));
  const maxDigitWidth = Math.max(1, Math.floor((availableWidth - gap * (digitCount - 1)) / digitCount));
  const digitWidth = Math.min(requestedDigitWidth, maxDigitWidth);
  const digitHeight = Math.max(1, Math.ceil(Math.min(options.digitHeight, options.card.height)));
  const totalWidth = digitWidth * digitCount + gap * (digitCount - 1);
  const startX = Math.round(options.card.x + options.card.width - rightPadding - totalWidth);
  const maxY = Math.round(options.card.y + options.card.height - digitHeight);
  const y = clampNumber(Math.round(options.y), Math.round(options.card.y), maxY);
  const digits = odometerDigits(options.value, digitCount);

  return digits.map((digit, index) => ({
    digitIndex: index,
    digit,
    x: startX + index * (digitWidth + gap),
    y,
    width: digitWidth,
    height: digitHeight
  }));
}

function battleScrollableMenuListRect(options: {
  screen: ScreenSize;
  x: number;
  y: number;
  labels: string[];
  selectedIndex: number;
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  extraHeight?: number;
  minWidth: number;
  maxWidth: number;
  leftMargin: number;
  topMargin: number;
  rightMargin: number;
  bottomMargin: number;
}): BattleMenuListRect {
  const maxRows = Math.max(
    1,
    Math.floor((options.screen.height - options.bottomMargin - options.y - options.paddingY * 2) / options.lineHeight)
  );
  const visibleCount = Math.max(1, Math.min(options.labels.length, maxRows));
  const selectedIndex = clampNumber(Math.floor(options.selectedIndex), 0, Math.max(0, options.labels.length - 1));
  const visibleStart = scrollStart(options.labels.length, selectedIndex, visibleCount);
  return battleMenuListRect({
    ...options,
    selectedIndex,
    visibleCount,
    visibleStart
  });
}

function battleMenuListRect(options: {
  screen: ScreenSize;
  x: number;
  y: number;
  labels: string[];
  selectedIndex: number;
  visibleCount: number;
  visibleStart?: number;
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  extraHeight?: number;
  minWidth: number;
  maxWidth: number;
  leftMargin: number;
  topMargin: number;
  rightMargin: number;
  bottomMargin: number;
}): BattleMenuListRect {
  const visibleCount = Math.max(1, Math.min(options.labels.length, Math.ceil(options.visibleCount)));
  const visibleStart = clampNumber(Math.floor(options.visibleStart ?? 0), 0, Math.max(0, options.labels.length - visibleCount));
  const rect = contentFitWindowRect({
    x: options.x,
    y: options.y,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount: visibleCount,
    extraHeight: options.extraHeight,
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
    maxHeight: Math.max(
      options.lineHeight + options.paddingY * 2,
      Math.floor(options.screen.height - options.bottomMargin - options.y)
    )
  });
  const clamped = clampRectToScreen(rect, options.screen, {
    left: options.leftMargin,
    right: options.rightMargin,
    top: options.topMargin,
    bottom: options.bottomMargin
  });
  return {
    ...clamped,
    visibleStart,
    visibleCount,
    hasMoreBefore: visibleStart > 0,
    hasMoreAfter: visibleStart + visibleCount < options.labels.length
  };
}

function battleDescriptionRect(options: {
  screen: ScreenSize;
  x: number;
  y: number;
  labels: string[];
  measureText: (text: string) => number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  minWidth: number;
  maxWidth: number;
  leftMargin: number;
  topMargin: number;
  rightMargin: number;
  bottomMargin: number;
}): CanvasRect {
  const rect = contentFitWindowRect({
    x: options.x,
    y: options.y,
    labels: options.labels,
    measureText: options.measureText,
    lineHeight: options.lineHeight,
    lineCount: Math.max(1, options.labels.length),
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
    maxHeight: Math.max(
      options.lineHeight + options.paddingY * 2,
      Math.floor(options.screen.height - options.bottomMargin - options.y)
    )
  });
  return clampRectToScreen(rect, options.screen, {
    left: options.leftMargin,
    right: options.rightMargin,
    top: options.topMargin,
    bottom: options.bottomMargin
  });
}

function scrollStart(rowCount: number, selectedIndex: number, visibleCount: number): number {
  return Math.min(
    Math.max(0, selectedIndex - visibleCount + 1),
    Math.max(0, rowCount - visibleCount)
  );
}

function clampDimension(value: number, minValue = 0, maxValue = Number.POSITIVE_INFINITY): number {
  const min = Math.max(0, Math.ceil(minValue));
  const max = Math.max(min, Math.floor(maxValue));
  return Math.max(min, Math.min(max, Math.ceil(value)));
}

function clampRectToScreen(
  rect: CanvasRect,
  screen: ScreenSize,
  margins: { left: number; right: number; top: number; bottom: number }
): CanvasRect {
  const width = Math.min(rect.width, Math.max(1, Math.floor(screen.width - margins.left - margins.right)));
  const height = Math.min(rect.height, Math.max(1, Math.floor(screen.height - margins.top - margins.bottom)));
  const maxX = Math.max(margins.left, Math.floor(screen.width - margins.right - width));
  const maxY = Math.max(margins.top, Math.floor(screen.height - margins.bottom - height));
  return {
    x: clampNumber(Math.round(rect.x), margins.left, maxX),
    y: clampNumber(Math.round(rect.y), margins.top, maxY),
    width,
    height
  };
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function odometerDigits(value: number, digitCount: number): string[] {
  const maxValue = 10 ** digitCount - 1;
  const normalized = Number.isFinite(value)
    ? Math.max(0, Math.min(maxValue, Math.floor(value)))
    : 0;
  return String(normalized).padStart(digitCount, "0").split("");
}
