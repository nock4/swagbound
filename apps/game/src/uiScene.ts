import Phaser from "phaser";
import type { FontCollection, WindowCollection } from "@eb/schemas";
import type { WorldScene } from "./worldScene";
import type { MenuRenderScreen } from "./menuModel";
import {
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_TEXT,
  CLEAN_UI_SELECTION_CARET,
  cleanLineHeight,
  cleanPanelInnerRect,
  createCleanText,
  drawCleanCaret,
  drawCleanPanel,
  drawCleanSelection,
  estimateCleanTextWidth
} from "./cleanUi";
import type { DialogueTextRun } from "./dialogueRenderer";
import {
  type CanvasRect,
  dialogueTextWidth,
  dialogueWindowRect,
  menuWindowRect
} from "./windowLayout";
import {
  menuCursorVisible
} from "./battleVisuals";

const UI_LINE_SPACING = 2;
const DIALOGUE_FONT_SIZE = 15;
const FOOTER_FONT_SIZE = 11;
const MENU_FONT_SIZE = 14;
const MENU_TITLE_FONT_SIZE = 13;
const DEBUG_FONT_SIZE = 11;
const DIALOGUE_HORIZONTAL_PADDING = 18;
const DIALOGUE_VERTICAL_PADDING = 12;
const DIALOGUE_VISIBLE_LINES = 3;
const DIALOGUE_BOTTOM_MARGIN = 12;
const DIALOGUE_SIDE_MARGIN = 12;
const DIALOGUE_MORE_ARROW_BOB_PX = 2;
const MENU_LEFT = 12;
const MENU_TOP = 12;
const MENU_RIGHT_MARGIN = 12;
const MENU_BOTTOM_MARGIN = 12;
const MENU_GAP = 8;
const MENU_HORIZONTAL_PADDING = 12;
const MENU_VERTICAL_PADDING = 10;
const MENU_TITLE_GAP = 5;
const MENU_CARET_GUTTER_PX = 12;
const MENU_MAX_VISIBLE_ITEMS = 8;
type MenuCursorSlot = {
  x: number;
  rowTop: number;
  width: number;
  rowHeight: number;
};

const DEBUG_COPY_LABEL = "[ Copy ]";
const DEBUG_COPIED_LABEL = "[ Copied! ]";

/** Copy debug-panel text to the clipboard so it can be pasted into a bug report. */
function copyTextToClipboard(text: string): void {
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (clip?.writeText) {
    clip.writeText(text).catch(() => fallbackCopyText(text));
  } else {
    fallbackCopyText(text);
  }
  // Console mirror: a no-clipboard fallback path the user can still select from.
  if (typeof console !== "undefined") {
    console.info("[debug] panel copied:\n" + text);
  }
}

function fallbackCopyText(text: string): void {
  if (typeof document === "undefined") {
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // best-effort; clipboard may be unavailable in this context
  }
  document.body.removeChild(textarea);
}

/**
 * Camera-independent overlay: dialogue window, interaction prompt, and the
 * F1 debug panel. Runs at native canvas resolution above the zoomed world.
 */
export class UiScene extends Phaser.Scene {
  private worldSceneKey = "world";
  private font?: FontCollection;
  private window?: WindowCollection;
  private boxGraphics?: Phaser.GameObjects.Graphics;
  private dialogueText?: Phaser.GameObjects.Text;
  private footerText?: Phaser.GameObjects.Text;
  private moreArrow?: Phaser.GameObjects.Graphics;
  private moreArrowTween?: Phaser.Tweens.Tween;
  private promptText?: Phaser.GameObjects.Text;
  private panelGraphics?: Phaser.GameObjects.Graphics;
  private panelText?: Phaser.GameObjects.Text;
  private badgeText?: Phaser.GameObjects.Text;
  private menuHintText?: Phaser.GameObjects.Text;
  private menuGraphics?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuCursorSlots: MenuCursorSlot[] = [];
  private lastSignature = "";
  private copyButton?: Phaser.GameObjects.Text;
  private panelDebugText = "";
  private copyResetEvent?: Phaser.Time.TimerEvent;

  constructor() {
    super("ui");
  }

  init(data: { worldSceneKey?: string; font?: FontCollection; window?: WindowCollection }): void {
    this.worldSceneKey = data.worldSceneKey ?? "world";
    this.font = data.font;
    this.window = data.window;
    this.lastSignature = "";
  }

  create(): void {
    this.boxGraphics = this.add.graphics().setDepth(10);
    this.dialogueText = createCleanText(this, 0, 0, "", {
      fontSize: DIALOGUE_FONT_SIZE,
      color: CLEAN_UI_PRIMARY,
      lineSpacing: UI_LINE_SPACING,
      wordWrapWidth: this.dialogueTextWidth()
    }).setDepth(11);
    this.footerText = createCleanText(this, 0, 0, "", {
      fontSize: FOOTER_FONT_SIZE,
      color: CLEAN_UI_SECONDARY
    }).setDepth(11);
    this.promptText = createCleanText(this, 12, 10, "", {
      fontSize: 11,
      color: CLEAN_UI_PRIMARY
    }).setDepth(11);
    this.panelGraphics = this.add.graphics().setDepth(12);
    this.panelText = createCleanText(this, 0, 0, "", {
      fontSize: DEBUG_FONT_SIZE,
      color: CLEAN_UI_PRIMARY,
      lineSpacing: 3
    }).setDepth(13);
    // The "F1: debug" badge + Copy chip are dev tooling — hidden in production builds.
    if (import.meta.env.DEV) {
      this.badgeText = createCleanText(this, this.scale.width - 12, 10, "` or F1: debug", {
        fontSize: 11,
        color: CLEAN_UI_SECONDARY
      }).setOrigin(1, 0).setDepth(11);
      this.createCopyButton();
    }
    // Persistent control hint so the command menu (Talk/Goods/PSI/Equip/Check/Status) is
    // discoverable from the overworld. Always shipped (not dev-only); shown only while walking
    // — hidden whenever a menu or dialogue is already up (see update()).
    this.menuHintText = createCleanText(this, this.scale.width - 12, this.scale.height - 12, "M: Menu", {
      fontSize: 11,
      color: CLEAN_UI_SECONDARY
    }).setOrigin(1, 1).setDepth(11);
    this.menuGraphics = this.add.graphics().setDepth(14);
    this.menuCursorGraphics = this.add.graphics().setDepth(16);
  }

  /** A clickable [ Copy ] chip (top bar) that copies the live debug panel text. */
  private createCopyButton(): void {
    const badgeWidth = this.badgeText?.width ?? 90;
    const button = createCleanText(this, this.scale.width - 12 - badgeWidth - 14, 10, DEBUG_COPY_LABEL, {
      fontSize: 11,
      color: CLEAN_UI_SECONDARY
    }).setOrigin(1, 0).setDepth(13).setVisible(false);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerover", () => {
      if (button.text === DEBUG_COPY_LABEL) {
        button.setColor(CLEAN_UI_PRIMARY);
      }
    });
    button.on("pointerout", () => {
      if (button.text === DEBUG_COPY_LABEL) {
        button.setColor(CLEAN_UI_SECONDARY);
      }
    });
    button.on("pointerdown", () => this.copyDebugText());
    // Keyboard alias: C copies while the panel is open (no-op when it's empty).
    this.input.keyboard?.on("keydown-C", () => this.copyDebugText());
    this.copyButton = button;
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
    const promptVisible = !open && menuScreens.length === 0;
    const signature = `${open}|${JSON.stringify(textRuns)}|${footer}|${showAdvanceIndicator}|${world.prompt}|${promptVisible}|${panelVisible}|${runtimeLines.join("/")}|${JSON.stringify(menuScreens)}`;
    if (signature === this.lastSignature) {
      this.renderMenuCursors();
      return;
    }
    this.lastSignature = signature;

    this.promptText?.setText(promptVisible ? world.prompt : "");
    this.promptText?.setVisible(promptVisible);
    // Menu hint shares the prompt's visibility: only while walking, never over a menu/dialogue.
    this.menuHintText?.setVisible(promptVisible);
    this.drawDialogue(open, text, textRuns, footer, showAdvanceIndicator);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
    this.drawMenu(menuScreens);
    this.renderMenuCursors();
  }

  private drawDialogue(
    open: boolean,
    text: string,
    _textRuns: readonly DialogueTextRun[],
    footer: string,
    showAdvanceIndicator: boolean
  ): void {
    const graphics = this.boxGraphics;
    if (!graphics || !this.dialogueText || !this.footerText) {
      return;
    }
    graphics.clear();
    this.clearMoreArrow();
    if (!open) {
      this.dialogueText.setText("");
      this.footerText.setText("");
      return;
    }
    const rect = this.dialogueRect();
    const { x, y, width: boxWidth, height: boxHeight } = rect;

    drawCleanPanel(graphics, rect);

    this.dialogueText.setPosition(x + DIALOGUE_HORIZONTAL_PADDING, y + DIALOGUE_VERTICAL_PADDING);
    this.dialogueText.setWordWrapWidth(this.dialogueTextWidth(), true);
    this.dialogueText.setText(text);
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
    const arrow = this.add.graphics().setDepth(12);
    const arrowX = Math.round(x + boxWidth - DIALOGUE_HORIZONTAL_PADDING - 10);
    const arrowY = Math.round(y + boxHeight - DIALOGUE_VERTICAL_PADDING - 8);
    arrow.fillStyle(0xffffff, 0.82);
    arrow.fillTriangle(0, 0, 10, 0, 5, 7);
    arrow.setPosition(arrowX, arrowY);
    this.moreArrow = arrow;
    this.moreArrowTween = this.tweens.add({
      targets: arrow,
      y: arrowY + DIALOGUE_MORE_ARROW_BOB_PX,
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
      this.panelDebugText = "";
      this.copyButton?.setVisible(false);
      return;
    }
    const width = Math.min(this.scale.width - 24, 470);
    const height = lines.length * cleanLineHeight(DEBUG_FONT_SIZE, 3) + 22;
    const rect = { x: 12, y: 30, width, height };
    drawCleanPanel(graphics, rect);
    const inner = cleanPanelInnerRect(rect, { x: 12, y: 10 });
    this.panelText.setPosition(inner.x, inner.y);
    this.panelText.setText(lines.join("\n"));
    this.panelDebugText = lines.join("\n");
    this.copyButton?.setVisible(true);
  }

  private copyDebugText(): void {
    if (!this.panelDebugText || !this.copyButton) {
      return;
    }
    copyTextToClipboard(this.panelDebugText);
    this.copyResetEvent?.remove();
    this.copyButton.setText(DEBUG_COPIED_LABEL).setColor(CLEAN_UI_PRIMARY);
    this.copyResetEvent = this.time.delayedCall(1200, () => {
      this.copyButton?.setText(DEBUG_COPY_LABEL).setColor(CLEAN_UI_SECONDARY);
    });
  }

  private drawMenu(screens: MenuRenderScreen[]): void {
    const graphics = this.menuGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
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
      const textInset = MENU_HORIZONTAL_PADDING;
      const showTitle = screen.id !== "main";
      const titleTop = y + MENU_VERTICAL_PADDING;
      const itemTop = y + MENU_VERTICAL_PADDING + (showTitle ? this.menuLineHeight() + MENU_TITLE_GAP : 0);
      const itemBottomInset = MENU_VERTICAL_PADDING;
      const compact = screen.id === "status";
      const fontSize = compact ? 12 : MENU_FONT_SIZE;
      drawCleanPanel(graphics, rect);

      if (showTitle) {
        this.menuTexts.push(createCleanText(this, x + textInset, titleTop, screen.title, {
          fontSize: MENU_TITLE_FONT_SIZE,
          color: CLEAN_UI_PRIMARY,
          weight: 500
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
            x: x + textInset,
            rowTop: rowTop - 2,
            width: Math.max(1, boxWidth - textInset * 2),
            rowHeight: lineHeight
          });
        }
        const textWidth = Math.max(1, boxWidth - textInset * 2 - MENU_CARET_GUTTER_PX);
        this.menuTexts.push(createCleanText(this, x + textInset + MENU_CARET_GUTTER_PX, rowTop, label, {
          fontSize,
          color: selected ? CLEAN_UI_SELECTION_TEXT : (item.enabled ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY),
          weight: selected ? 500 : 400,
          fixedWidth: textWidth
        }).setDepth(selected ? 17 : 15));
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
      visibleLines: DIALOGUE_VISIBLE_LINES,
      topAnchored: true
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
      paddingX: MENU_HORIZONTAL_PADDING + MENU_CARET_GUTTER_PX,
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
    return estimateCleanTextWidth(text, MENU_FONT_SIZE);
  }

  private dialogueLineHeight(): number {
    return cleanLineHeight(DIALOGUE_FONT_SIZE, UI_LINE_SPACING);
  }

  private menuLineHeight(): number {
    return cleanLineHeight(MENU_FONT_SIZE, UI_LINE_SPACING);
  }

  private renderMenuCursors(): void {
    const graphics = this.menuCursorGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    for (const slot of this.menuCursorSlots) {
      drawCleanSelection(graphics, {
        x: slot.x,
        y: slot.rowTop,
        width: slot.width,
        height: slot.rowHeight
      }, true);
      if (menuCursorVisible(this.time.now)) {
        drawCleanCaret(graphics, slot.x + 3, slot.rowTop, slot.rowHeight, CLEAN_UI_SELECTION_CARET);
      }
    }
  }
}

function visibleItemStart(cursorIndex: number, itemCount: number, maxItems: number): number {
  if (maxItems <= 0 || itemCount <= maxItems) {
    return 0;
  }
  return Math.min(Math.max(0, cursorIndex - maxItems + 1), itemCount - maxItems);
}
