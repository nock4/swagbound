import Phaser from "phaser";
import type { FontCollection, WindowCollection } from "@eb/schemas";
import type { WorldScene } from "./worldScene";
import type { MenuRenderScreen } from "./menuModel";
import {
  BitmapFontText,
  measureBitmapText,
  prepareBitmapFont,
  queueBitmapFontAssets,
  type BitmapTextRun,
  type BitmapTextOptions,
  type PreparedBitmapFont
} from "./bitmapFont";
import {
  drawWindowFrame,
  prepareWindowFrames,
  queueWindowFrameAssets,
  windowFrameName,
  type PreparedWindowFrames
} from "./windowFrame";
import { WINDOW_FLAVOR_CHANGE_EVENT, activeWindowFlavorId } from "./windowSettings";
import {
  EB_BITMAP_TEXT_SCALE,
  EB_TEXT_LINE_SPACING,
  EB_UI_SCALE,
  type CanvasRect,
  dialogueTextWidth,
  dialogueWindowRect,
  ebTextLineHeight,
  menuWindowRect
} from "./windowLayout";
import {
  MENU_CURSOR_GUTTER_PX,
  menuCursorVisible,
  selectionArrowTriangle
} from "./battleVisuals";

const MONO = "Menlo, Consolas, monospace";
const UI_LINE_SPACING = EB_TEXT_LINE_SPACING;
const DIALOGUE_HORIZONTAL_PADDING = 12 * EB_UI_SCALE;
const DIALOGUE_VERTICAL_PADDING = 9 * EB_UI_SCALE;
const DIALOGUE_VISIBLE_LINES = 4;
const DIALOGUE_BOTTOM_MARGIN = 8 * EB_UI_SCALE;
const DIALOGUE_SIDE_MARGIN = 8 * EB_UI_SCALE;
const MENU_LEFT = 8 * EB_UI_SCALE;
const MENU_TOP = 8 * EB_UI_SCALE;
const MENU_RIGHT_MARGIN = 8 * EB_UI_SCALE;
const MENU_BOTTOM_MARGIN = 8 * EB_UI_SCALE;
const MENU_GAP = 4 * EB_UI_SCALE;
const MENU_HORIZONTAL_PADDING = 8 * EB_UI_SCALE;
const MENU_VERTICAL_PADDING = 7 * EB_UI_SCALE;
const MENU_TITLE_GAP = 4 * EB_UI_SCALE;
const MENU_MAX_VISIBLE_ITEMS = 8;
type GameText = Phaser.GameObjects.Text | BitmapFontText;
type MenuCursorSlot = {
  x: number;
  rowTop: number;
  rowHeight: number;
};

/**
 * Camera-independent overlay: dialogue window, interaction prompt, and the
 * F1 debug panel. Runs at native canvas resolution above the zoomed world.
 */
export class UiScene extends Phaser.Scene {
  private worldSceneKey = "world";
  private font?: FontCollection;
  private window?: WindowCollection;
  private bitmapFont?: PreparedBitmapFont;
  private windowFrames?: PreparedWindowFrames;
  private boxGraphics?: Phaser.GameObjects.Graphics;
  private dialogueWindow?: Phaser.GameObjects.Container;
  private dialogueText?: GameText;
  private footerText?: GameText;
  private moreArrow?: Phaser.GameObjects.Image;
  private moreArrowTween?: Phaser.Tweens.Tween;
  private promptText?: Phaser.GameObjects.Text;
  private panelGraphics?: Phaser.GameObjects.Graphics;
  private panelText?: Phaser.GameObjects.Text;
  private badgeText?: Phaser.GameObjects.Text;
  private menuGraphics?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuWindows: Phaser.GameObjects.Container[] = [];
  private menuTexts: GameText[] = [];
  private menuCursorSlots: MenuCursorSlot[] = [];
  private windowFlavorListener?: () => void;
  private lastSignature = "";

  constructor() {
    super("ui");
  }

  init(data: { worldSceneKey?: string; font?: FontCollection; window?: WindowCollection }): void {
    this.worldSceneKey = data.worldSceneKey ?? "world";
    this.font = data.font;
    this.window = data.window;
    this.bitmapFont = undefined;
    this.windowFrames = undefined;
    this.lastSignature = "";
  }

  preload(): void {
    queueBitmapFontAssets(this, this.font);
    queueWindowFrameAssets(this, this.window);
  }

  create(): void {
    this.bitmapFont = prepareBitmapFont(this, this.font);
    this.refreshWindowFrames();
    this.windowFlavorListener = () => this.handleWindowFlavorChanged();
    globalThis.addEventListener?.(WINDOW_FLAVOR_CHANGE_EVENT, this.windowFlavorListener);
    this.events.once("shutdown", () => {
      if (this.windowFlavorListener) {
        globalThis.removeEventListener?.(WINDOW_FLAVOR_CHANGE_EVENT, this.windowFlavorListener);
        this.windowFlavorListener = undefined;
      }
    });
    this.boxGraphics = this.add.graphics().setDepth(10);
    this.dialogueText = this.createGameText(0, 0, "", {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc",
      lineSpacing: UI_LINE_SPACING,
      wordWrap: { width: this.dialogueTextWidth() }
    }, {
      scale: EB_BITMAP_TEXT_SCALE,
      tint: 0xf8fafc,
      lineSpacing: UI_LINE_SPACING,
      lineHeight: this.dialogueLineHeight(),
      maxWidth: this.dialogueTextWidth()
    }).setDepth(11);
    this.footerText = this.createGameText(0, 0, "", {
      fontFamily: MONO,
      fontSize: "10px",
      color: "#cbd5e1"
    }, {
      scale: EB_BITMAP_TEXT_SCALE,
      tint: 0xcbd5e1,
      lineHeight: this.dialogueLineHeight()
    }).setDepth(11);
    this.promptText = this.add.text(12, 10, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#e5e7eb",
      backgroundColor: "#0f172acc",
      padding: { x: 6, y: 3 }
    }).setDepth(11);
    this.badgeText = this.add.text(this.scale.width - 12, 10, "F1: debug", {
      fontFamily: MONO,
      fontSize: "10px",
      color: "#94a3b8",
      backgroundColor: "#0f172aa0",
      padding: { x: 5, y: 2 }
    }).setOrigin(1, 0).setDepth(11);
    this.panelGraphics = this.add.graphics().setDepth(12);
    this.panelText = this.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#d8e4ef",
      lineSpacing: 3
    }).setDepth(13);
    this.menuGraphics = this.add.graphics().setDepth(14);
    this.menuCursorGraphics = this.add.graphics().setDepth(16);
  }

  private handleWindowFlavorChanged(): void {
    this.refreshWindowFrames();
    this.lastSignature = "";
  }

  private refreshWindowFrames(): void {
    this.windowFrames = prepareWindowFrames(this, this.window, activeWindowFlavorId(this.window));
  }

  update(): void {
    const world = this.scene.get(this.worldSceneKey) as WorldScene | undefined;
    if (!world) {
      return;
    }

    const open = world.dialogue.open;
    const text = open ? world.dialogue.revealedText : "";
    const textRuns = open ? world.dialogue.revealedTextRuns : [];
    const showAdvanceIndicator = open && world.dialogue.revealComplete;
    const footer = open
      ? (!world.dialogue.revealComplete
          ? "Z: finish | X: close"
          : (world.dialogue.isLastPage ? "Z/X: close" : "Z: next | X: close"))
      : "";
    const panelVisible = world.debugPanelVisible;
    const runtimeLines = panelVisible ? world.runtimeLines() : [];
    const menuScreens = world.menuRenderStack();
    const signature = `${open}|${JSON.stringify(textRuns)}|${footer}|${showAdvanceIndicator}|${world.prompt}|${panelVisible}|${runtimeLines.join("/")}|${JSON.stringify(menuScreens)}`;
    if (signature === this.lastSignature) {
      this.renderMenuCursors();
      return;
    }
    this.lastSignature = signature;

    this.promptText?.setText(world.prompt);
    this.drawDialogue(open, text, textRuns, footer, showAdvanceIndicator);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
    this.drawMenu(menuScreens);
    this.renderMenuCursors();
  }

  private drawDialogue(
    open: boolean,
    text: string,
    textRuns: readonly BitmapTextRun[],
    footer: string,
    showAdvanceIndicator: boolean
  ): void {
    const graphics = this.boxGraphics;
    if (!graphics || !this.dialogueText || !this.footerText) {
      return;
    }
    graphics.clear();
    this.dialogueWindow?.destroy(true);
    this.dialogueWindow = undefined;
    this.clearMoreArrow();
    if (!open) {
      this.setGameText(this.dialogueText, "");
      this.footerText.setText("");
      return;
    }
    const rect = this.dialogueRect();
    const { x, y, width: boxWidth, height: boxHeight } = rect;

    this.dialogueWindow = this.drawWindowFrameOrFallback(graphics, x, y, boxWidth, boxHeight, 6, 10);

    this.dialogueText.setPosition(x + DIALOGUE_HORIZONTAL_PADDING, y + DIALOGUE_VERTICAL_PADDING);
    this.setGameText(this.dialogueText, text, textRuns);
    const arrowShown = showAdvanceIndicator && this.drawMoreArrow(x, y, boxWidth, boxHeight);
    if (arrowShown) {
      this.footerText.setText("");
    } else {
      const footerWidth = this.measureTextWidth(footer);
      this.footerText.setPosition(
        x + boxWidth - DIALOGUE_HORIZONTAL_PADDING - footerWidth,
        y + boxHeight - DIALOGUE_VERTICAL_PADDING - this.dialogueLineHeight()
      );
      this.footerText.setText(footer);
    }
  }

  private drawMoreArrow(x: number, y: number, boxWidth: number, boxHeight: number): boolean {
    if (!this.windowFrames || !this.textures.exists(this.windowFrames.textureKey)) {
      return false;
    }
    const frameName = windowFrameName("moreArrow");
    if (!this.textures.get(this.windowFrames.textureKey).has(frameName)) {
      return false;
    }
    const arrowWidth = this.windowFrames.flavor.moreArrow.w * EB_UI_SCALE;
    const arrowHeight = this.windowFrames.flavor.moreArrow.h * EB_UI_SCALE;
    const arrowX = Math.round(x + boxWidth - DIALOGUE_HORIZONTAL_PADDING - arrowWidth);
    const arrowY = Math.round(y + boxHeight - DIALOGUE_VERTICAL_PADDING - arrowHeight);
    const arrow = this.add.image(arrowX, arrowY, this.windowFrames.textureKey, frameName)
      .setOrigin(0, 0)
      .setScale(EB_UI_SCALE)
      .setDepth(12);
    this.moreArrow = arrow;
    this.moreArrowTween = this.tweens.add({
      targets: arrow,
      y: arrowY + 2,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut"
    });
    return true;
  }

  private clearMoreArrow(): void {
    this.moreArrowTween?.stop();
    this.moreArrowTween?.remove();
    this.moreArrowTween = undefined;
    this.moreArrow?.destroy();
    this.moreArrow = undefined;
  }

  private drawPanel(lines: string[]): void {
    const graphics = this.panelGraphics;
    if (!graphics || !this.panelText) {
      return;
    }
    graphics.clear();
    if (lines.length === 0) {
      this.panelText.setText("");
      return;
    }
    const width = Math.min(this.scale.width - 24, 470);
    const height = lines.length * 15 + 22;
    this.drawWindow(graphics, 12, 30, width, height, 6);
    this.panelText.setPosition(24, 41);
    this.panelText.setText(lines.join("\n"));
  }

  private drawMenu(screens: MenuRenderScreen[]): void {
    const graphics = this.menuGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    for (const window of this.menuWindows) {
      window.destroy(true);
    }
    this.menuWindows = [];
    for (const text of this.menuTexts) {
      text.destroy();
    }
    this.menuTexts = [];
    this.menuCursorSlots = [];
    if (screens.length === 0) {
      this.menuCursorGraphics?.clear();
      return;
    }

    let nextX = MENU_LEFT;
    screens.forEach((screen) => {
      const rect = this.menuRect(screen, nextX);
      const { x, y, width: boxWidth, height: boxHeight } = rect;
      const textInset = this.windowFrames ? MENU_HORIZONTAL_PADDING : 14;
      const showTitle = screen.id !== "main";
      const titleTop = y + MENU_VERTICAL_PADDING;
      const itemTop = y + MENU_VERTICAL_PADDING + (showTitle ? this.menuLineHeight() + MENU_TITLE_GAP : 0);
      const itemBottomInset = 14;
      const compact = screen.id === "status";
      const fontSize = compact ? "10px" : "13px";
      const menuWindow = this.drawWindowFrameOrFallback(graphics, x, y, boxWidth, boxHeight, 6, 14);
      if (menuWindow) {
        this.menuWindows.push(menuWindow);
      }

      if (showTitle) {
        this.menuTexts.push(this.createGameText(x + textInset, titleTop, screen.title, {
          fontFamily: MONO,
          fontSize: "12px",
          color: "#f8fafc"
        }, {
          scale: EB_BITMAP_TEXT_SCALE,
          tint: 0xf8fafc,
          lineHeight: this.menuLineHeight()
        }).setDepth(15));
      }

      const lineHeight = this.menuLineHeight();
      const maxItems = Math.max(0, Math.floor((boxHeight - (itemTop - y) - itemBottomInset) / lineHeight));
      const start = visibleItemStart(screen.cursorIndex, screen.items.length, maxItems);
      const visibleItems = screen.items.slice(start, start + maxItems);
      visibleItems.forEach((item, itemIndex) => {
        const selected = item.selected && item.enabled;
        const label = item.label;
        const rowTop = itemTop + itemIndex * lineHeight;
        if (selected) {
          this.menuCursorSlots.push({
            x: x + textInset + 1,
            rowTop,
            rowHeight: lineHeight
          });
        }
        const textWidth = Math.max(1, boxWidth - textInset * 2 - MENU_CURSOR_GUTTER_PX);
        this.menuTexts.push(this.createGameText(x + textInset + MENU_CURSOR_GUTTER_PX, rowTop, label, {
          fontFamily: MONO,
          fontSize,
          color: item.enabled ? "#f8fafc" : "#94a3b8",
          fixedWidth: textWidth
        }, {
          scale: EB_BITMAP_TEXT_SCALE,
          tint: item.enabled ? 0xf8fafc : 0x94a3b8,
          lineHeight: this.menuLineHeight(),
          maxWidth: textWidth
        }).setDepth(15));
      });
      nextX = Math.min(this.scale.width - MENU_RIGHT_MARGIN - 64, x + boxWidth + MENU_GAP);
    });
  }

  private dialogueRect(): CanvasRect {
    return dialogueWindowRect({
      screen: { width: this.scale.width, height: this.scale.height },
      sideMargin: DIALOGUE_SIDE_MARGIN,
      bottomMargin: DIALOGUE_BOTTOM_MARGIN,
      paddingX: DIALOGUE_HORIZONTAL_PADDING,
      paddingY: DIALOGUE_VERTICAL_PADDING,
      lineHeight: this.dialogueLineHeight(),
      visibleLines: DIALOGUE_VISIBLE_LINES
    });
  }

  private dialogueTextWidth(): number {
    return dialogueTextWidth(this.dialogueRect(), DIALOGUE_HORIZONTAL_PADDING);
  }

  private menuRect(screen: MenuRenderScreen, x: number): CanvasRect {
    const showTitle = screen.id !== "main";
    const lineHeight = this.menuLineHeight();
    const itemLabels = screen.items.map((item) => item.label);
    const labels = showTitle ? [screen.title, ...itemLabels] : itemLabels;

    return menuWindowRect({
      screen: { width: this.scale.width, height: this.scale.height },
      x,
      y: MENU_TOP,
      labels,
      measureText: (label) => this.measureTextWidth(label),
      lineHeight,
      paddingX: MENU_HORIZONTAL_PADDING + MENU_CURSOR_GUTTER_PX,
      paddingY: MENU_VERTICAL_PADDING,
      leftMargin: MENU_LEFT,
      rightMargin: MENU_RIGHT_MARGIN,
      bottomMargin: MENU_BOTTOM_MARGIN,
      minWidth: 64,
      maxVisibleItems: MENU_MAX_VISIBLE_ITEMS,
      titleLines: showTitle ? 1 : 0,
      titleGap: MENU_TITLE_GAP
    });
  }

  private measureTextWidth(text: string): number {
    if (this.bitmapFont) {
      return measureBitmapText(this.bitmapFont.collection, this.bitmapFont.sheet, text, {
        scale: EB_BITMAP_TEXT_SCALE
      }).width;
    }
    return text.length * 8;
  }

  private dialogueLineHeight(): number {
    return ebTextLineHeight({ lineSpacing: UI_LINE_SPACING });
  }

  private menuLineHeight(): number {
    return ebTextLineHeight({ lineSpacing: UI_LINE_SPACING });
  }

  private setGameText(target: GameText, text: string, runs?: readonly BitmapTextRun[]): void {
    if (target instanceof BitmapFontText && runs) {
      target.setRuns(runs);
      return;
    }
    target.setText(text);
  }

  private renderMenuCursors(): void {
    const graphics = this.menuCursorGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (!menuCursorVisible(this.time.now)) {
      return;
    }
    for (const slot of this.menuCursorSlots) {
      this.drawMenuCursorArrow(graphics, slot);
    }
  }

  private drawMenuCursorArrow(graphics: Phaser.GameObjects.Graphics, slot: MenuCursorSlot): void {
    const triangle = selectionArrowTriangle(slot.x, slot.rowTop, slot.rowHeight);
    graphics.fillStyle(0xf8fafc, 1);
    graphics.fillTriangle(triangle.x1, triangle.y1, triangle.x2, triangle.y2, triangle.x3, triangle.y3);
    graphics.lineStyle(1, 0x111827, 1);
    graphics.strokeTriangle(triangle.x1, triangle.y1, triangle.x2, triangle.y2, triangle.x3, triangle.y3);
  }

  private createGameText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    bitmapOptions: BitmapTextOptions = {}
  ): GameText {
    if (this.bitmapFont) {
      return new BitmapFontText(this, this.bitmapFont, x, y, text, bitmapOptions);
    }
    return this.add.text(x, y, text, style);
  }

  private drawWindowFrameOrFallback(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    depth: number
  ): Phaser.GameObjects.Container | undefined {
    if (this.windowFrames) {
      return drawWindowFrame(this, this.windowFrames, x, y, width, height, { scale: EB_UI_SCALE }).setDepth(depth);
    }
    this.drawWindow(graphics, x, y, width, height, radius);
    return undefined;
  }

  private drawWindow(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    graphics.fillStyle(0x0a0f1e, 0.97);
    graphics.fillRoundedRect(x, y, width, height, radius);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, Math.max(1, radius - 1));
    graphics.lineStyle(1, 0x64748b, 1);
    graphics.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, Math.max(1, radius - 2));
  }
}

function visibleItemStart(cursorIndex: number, itemCount: number, maxItems: number): number {
  if (maxItems <= 0 || itemCount <= maxItems) {
    return 0;
  }
  return Math.min(Math.max(0, cursorIndex - maxItems + 1), itemCount - maxItems);
}
