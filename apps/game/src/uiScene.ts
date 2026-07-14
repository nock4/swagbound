import Phaser from "phaser";
import type { FontCollection, WindowCollection } from "@eb/schemas";
import type { WorldScene } from "./worldScene";
import type { MenuRenderScreen } from "./menuModel";
import {
  CLEAN_UI_PRIMARY,
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_TEXT,
  CLEAN_UI_SELECTION_CARET,
  CLEAN_UI_HP,
  CLEAN_UI_PP,
  CLEAN_UI_TRACK,
  CLEAN_UI_TRACK_ALPHA,
  cleanLineHeight,
  cleanPanelInnerRect,
  createCleanText,
  drawCleanCaret,
  drawCleanPanel,
  drawCleanSelection,
  estimateCleanTextWidth,
  formatCleanOdometerValue,
  statusBarFillFraction
} from "./cleanUi";
import type { DialogueChoiceState } from "./state";
import {
  type CanvasRect,
  battleStatusCardRects,
  menuWindowRect
} from "./windowLayout";
import {
  menuCursorVisible
} from "./battleVisuals";
import type { OverworldStatusHudMember, OverworldStatusHudView } from "./overworldStatusHud";
import { statusAilmentBadge } from "./statusEffects";
import {
  TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS,
  TALK_WINDOW_DIALOGUE_LINE_SPACING_CSS,
  TALK_WINDOW_PANEL_RECT_CSS,
  TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS,
  TALK_WINDOW_TEXT_HEIGHT_CSS,
  TALK_WINDOW_VISIBLE_LINES,
  TALK_WINDOW_WRAP_WIDTH_CSS,
  visibleDialogueLines
} from "./ebWindowMetrics";
export { visibleDialogueLines } from "./ebWindowMetrics";

const UI_LINE_SPACING = 6;
const MENU_FONT_SIZE = 14;
const MENU_TITLE_FONT_SIZE = 13;
const DEBUG_FONT_SIZE = 11;
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
// Grid-menu (columned screens like the 3x3 Command menu) layout.
const MENU_GRID_COL_GAP = 10;
const MENU_GRID_ROW_EXTRA = 6;
const MENU_GRID_CELL_INSET = 4;
const MENU_OBJECTIVE_GAP = 7;
const CHOICE_FONT_SIZE = 14;
const CHOICE_HORIZONTAL_PADDING = 12;
const CHOICE_VERTICAL_PADDING = 10;
const CHOICE_CARET_GUTTER_PX = 14;
const CHOICE_GAP = 8;
const CHOICE_MIN_WIDTH = 76;
type MenuCursorSlot = {
  x: number;
  rowTop: number;
  width: number;
  rowHeight: number;
};

type MenuGridMetrics = {
  columns: number;
  rows: number;
  visibleStartRow: number;
  visibleRows: number;
  columnWidths: number[];
  rowHeight: number;
  contentWidth: number;
};

type OverworldHudTextSet = {
  name: Phaser.GameObjects.Text;
  badges: Phaser.GameObjects.Text;
  hpLabel: Phaser.GameObjects.Text;
  ppLabel: Phaser.GameObjects.Text;
  hpValue: Phaser.GameObjects.Text;
  ppValue: Phaser.GameObjects.Text;
};

type BinderOverlayCard = {
  id: string;
  name: string;
  image: string;
  caption: string;
};

const DEBUG_COPY_LABEL = "[ Copy ]";
const DEBUG_COPIED_LABEL = "[ Copied! ]";
const OVERWORLD_HUD_CARD_SIDE_MARGIN = 10;
const OVERWORLD_HUD_CARD_BOTTOM_MARGIN = 8;
const OVERWORLD_HUD_CARD_GAP = 8;
const OVERWORLD_HUD_CARD_HEIGHT = 78;
// Narrow, near-square cards so all four party members fit across the screen with room
// to spare (4 x 96 + gaps + margins well under the 512px native width).
const OVERWORLD_HUD_CARD_MIN_WIDTH = 84;
const OVERWORLD_HUD_CARD_MAX_WIDTH = 96;
const OVERWORLD_HUD_CONTENT_PADDING_X = 10;
const OVERWORLD_HUD_CONTENT_PADDING_Y = 8;
const OVERWORLD_HUD_NAME_FONT_SIZE = 13;
const OVERWORLD_HUD_BADGE_FONT_SIZE = 11;
const OVERWORLD_HUD_LABEL_FONT_SIZE = 11;
const OVERWORLD_HUD_VALUE_FONT_SIZE = 17;
const OVERWORLD_HUD_HP_ROW_Y = 23;
const OVERWORLD_HUD_PP_ROW_Y = 47;
const OVERWORLD_HUD_LABEL_WIDTH = 20;
const OVERWORLD_HUD_BAR_HEIGHT = 5;
const OVERWORLD_HUD_BAR_X = 28;
const OVERWORLD_HUD_BAR_VALUE_GAP = 4;

function isDomInputFocused(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const active = document.activeElement as HTMLElement | null;
  return Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable));
}

/** Width reserved at the card's top-right for status-ailment badges (only when present). */
function hudBadgeReserveWidth(contentWidth: number): number {
  return Math.min(30, Math.max(16, Math.floor(contentWidth * 0.24)));
}

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
  private moreArrow?: Phaser.GameObjects.Graphics;
  private moreArrowTween?: Phaser.Tweens.Tween;
  private promptText?: Phaser.GameObjects.Text;
  private panelGraphics?: Phaser.GameObjects.Graphics;
  private panelText?: Phaser.GameObjects.Text;
  private badgeText?: Phaser.GameObjects.Text;
  private menuHintText?: Phaser.GameObjects.Text;
  private hudGraphics?: Phaser.GameObjects.Graphics;
  private hudFieldGraphics?: Phaser.GameObjects.Graphics;
  private hudAccentGraphics?: Phaser.GameObjects.Graphics;
  private hudTexts: OverworldHudTextSet[] = [];
  private hudLayoutSignature = "";
  private menuGraphics?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuCursorSlots: MenuCursorSlot[] = [];
  private choiceGraphics?: Phaser.GameObjects.Graphics;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private lastSignature = "";
  private copyButton?: Phaser.GameObjects.Text;
  private panelDebugText = "";
  private copyResetEvent?: Phaser.Time.TimerEvent;
  private binderOverlayGraphics?: Phaser.GameObjects.Graphics;
  private binderOverlayImage?: Phaser.GameObjects.Image;
  private binderOverlayTexts: Phaser.GameObjects.Text[] = [];
  private binderOverlayTextureKey?: string;
  private binderOverlayClose?: () => void;

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
      fontSize: TALK_WINDOW_DIALOGUE_FONT_SIZE_CSS,
      color: CLEAN_UI_PRIMARY,
      lineSpacing: TALK_WINDOW_DIALOGUE_LINE_SPACING_CSS,
      wordWrapWidth: this.dialogueTextWidth()
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
      const stamp = typeof __BUILD_STAMP__ === "string" ? __BUILD_STAMP__ : "?";
      this.badgeText = createCleanText(this, this.scale.width - 12, 10, `b:${stamp} | \` or F1: debug`, {
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
    this.hudGraphics = this.add.graphics().setDepth(8);
    this.hudFieldGraphics = this.add.graphics().setDepth(8.5);
    this.hudAccentGraphics = this.add.graphics().setDepth(9);
    this.menuGraphics = this.add.graphics().setDepth(14);
    this.menuCursorGraphics = this.add.graphics().setDepth(16);
    this.choiceGraphics = this.add.graphics().setDepth(13);
    this.binderOverlayGraphics = this.add.graphics().setDepth(80);
  }

  showBinderCardOverlay(card: BinderOverlayCard, onClose: () => void): void {
    this.closeBinderCardOverlay(false);
    this.binderOverlayClose = onClose;
    this.binderOverlayTextureKey = `binder-overlay-${card.id}`;
    this.drawBinderCardOverlay(card);
    // Register the "any key closes" listener on the NEXT frame — otherwise the
    // same keydown that opened the overlay (dispatched to this scene too) closes
    // it instantly, since the confirm fires on the world scene's keyboard.
    this.time.delayedCall(150, () => {
      if (this.binderOverlayClose) {
        this.input.keyboard?.once("keydown", () => this.closeBinderCardOverlay(true));
      }
    });
    if (!this.textures.exists(this.binderOverlayTextureKey)) {
      const loadingKey = this.binderOverlayTextureKey;
      this.load.image(loadingKey, card.image.startsWith("/") ? card.image : `/${card.image}`);
      this.load.once("complete", () => {
        if (this.binderOverlayTextureKey === loadingKey) {
          this.drawBinderCardOverlay(card);
        }
      });
      if (!this.load.isLoading()) {
        this.load.start();
      }
    }
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
    this.input.keyboard?.on("keydown-C", () => {
      if (!isDomInputFocused()) this.copyDebugText();
    });
    this.copyButton = button;
  }

  update(): void {
    const world = this.scene.get(this.worldSceneKey) as (WorldScene & {
      overworldStatusHud?: () => OverworldStatusHudView;
      cinematicActive?: () => boolean;
    }) | undefined;
    if (!world) {
      return;
    }

    const open = world.dialogue.open;
    const choice = world.dialogue.choice;
    const choiceOpen = Boolean(choice);
    const text = open ? world.dialogue.revealedText : "";
    const fullText = open ? world.dialogue.currentText : "";
    const textRuns = open ? world.dialogue.revealedTextRuns : [];
    const showAdvanceIndicator = open && world.dialogue.revealComplete && !world.dialogue.isLastPage;
    const panelVisible = world.debugPanelVisible;
    const runtimeLines = panelVisible ? world.runtimeLines() : [];
    const menuScreens = world.menuRenderStack();
    // During a cinematic (e.g. the new-game night flyover + bedroom wake-up) the whole
    // gameplay HUD is suppressed so nothing breaks the shot.
    const cinematic = Boolean(world.cinematicActive?.());
    const promptVisible = !open && !choiceOpen && menuScreens.length === 0 && !cinematic;
    const hudView = world.overworldStatusHud?.();
    // EarthBound shows the party status window only while a menu is open, not while
    // walking the overworld. (Previously this rendered during free movement.)
    const visibleHudView = menuScreens.length > 0 && hudView?.visible ? hudView : undefined;
    const signature = `${open}|${fullText}|${JSON.stringify(textRuns)}|${showAdvanceIndicator}|${JSON.stringify(choice)}|${world.prompt}|${promptVisible}|${cinematic}|${panelVisible}|${runtimeLines.join("/")}|${JSON.stringify(menuScreens)}|${JSON.stringify(hudView)}`;
    if (signature === this.lastSignature) {
      this.drawOverworldHud(visibleHudView);
      this.renderMenuCursors();
      return;
    }
    this.lastSignature = signature;

    this.promptText?.setText(promptVisible ? world.prompt : "");
    this.promptText?.setVisible(promptVisible);
    // Menu hint shares the prompt's visibility: only while walking, never over a menu/dialogue.
    this.menuHintText?.setVisible(promptVisible);
    // The dev badge stays up even during cinematics: every evidence screenshot
    // must carry the build stamp (docs/qa/goal-prompts.md Definition of Done),
    // and cinematics are exactly where staleness bugs hide. DEV-only object.
    this.badgeText?.setVisible(true);
    this.positionMenuHint(Boolean(visibleHudView));
    this.drawDialogue(open, text, showAdvanceIndicator);
    this.drawChoice(choice);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
    this.drawOverworldHud(visibleHudView);
    this.drawMenu(menuScreens);
    this.renderMenuCursors();
  }

  private drawDialogue(
    open: boolean,
    text: string,
    showAdvanceIndicator: boolean
  ): void {
    const graphics = this.boxGraphics;
    if (!graphics || !this.dialogueText) {
      return;
    }
    graphics.clear();
    this.clearMoreArrow();
    if (!open) {
      this.dialogueText.setText("");
      return;
    }
    const rect = this.dialogueRect();
    const { x, y, width: boxWidth, height: boxHeight } = rect;

    drawCleanPanel(graphics, rect);

    this.dialogueText.setPosition(
      x + TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS.x,
      y + TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS.y
    );
    this.dialogueText.setWordWrapWidth(this.dialogueTextWidth(), true);
    // Fixed dimensions are the final containment guard: even if browser font
    // metrics differ slightly from Phaser's wrapping estimate, glyphs cannot
    // paint across the dialogue frame.
    this.dialogueText.setFixedSize(this.dialogueTextWidth(), TALK_WINDOW_TEXT_HEIGHT_CSS);
    this.dialogueText.setText(
      visibleDialogueLines(this.dialogueText.getWrappedText(text), TALK_WINDOW_VISIBLE_LINES).join("\n")
    );
    if (showAdvanceIndicator) {
      this.drawMoreArrow(x, y, boxWidth, boxHeight);
    }
  }

  private drawChoice(choice: DialogueChoiceState | undefined): void {
    const graphics = this.choiceGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    for (const text of this.choiceTexts) {
      text.destroy();
    }
    this.choiceTexts = [];
    if (!choice || choice.options.length === 0) {
      return;
    }

    const lineHeight = cleanLineHeight(CHOICE_FONT_SIZE, UI_LINE_SPACING);
    const widest = choice.options.reduce((max, option) => {
      return Math.max(max, estimateCleanTextWidth(option.label, CHOICE_FONT_SIZE));
    }, 0);
    const width = Math.max(
      CHOICE_MIN_WIDTH,
      widest + CHOICE_HORIZONTAL_PADDING * 2 + CHOICE_CARET_GUTTER_PX
    );
    const height = CHOICE_VERTICAL_PADDING * 2 + lineHeight * choice.options.length;
    const dialogueRect = this.dialogueRect();
    const x = Math.round(Math.max(0, dialogueRect.x + TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS.x));
    // EB places the selection window BELOW the top-anchored text
    // window; anchoring above would clamp into the box and cover the message.
    const y = Math.round(Math.min(
      this.scale.height - height - 12,
      dialogueRect.y + dialogueRect.height + CHOICE_GAP
    ));
    const rect = { x, y, width, height };
    drawCleanPanel(graphics, rect);

    choice.options.forEach((option, index) => {
      const rowTop = y + CHOICE_VERTICAL_PADDING + index * lineHeight;
      const selected = index === choice.selectedIndex;
      if (selected) {
        drawCleanSelection(graphics, {
          x: x + CHOICE_HORIZONTAL_PADDING,
          y: rowTop - 2,
          width: width - CHOICE_HORIZONTAL_PADDING * 2,
          height: lineHeight
        }, true);
        drawCleanCaret(
          graphics,
          x + CHOICE_HORIZONTAL_PADDING + 3,
          rowTop - 2,
          lineHeight,
          CLEAN_UI_SELECTION_CARET
        );
      }
      this.choiceTexts.push(createCleanText(
        this,
        x + CHOICE_HORIZONTAL_PADDING + CHOICE_CARET_GUTTER_PX,
        rowTop,
        option.label,
        {
          fontSize: CHOICE_FONT_SIZE,
          color: selected ? CLEAN_UI_SELECTION_TEXT : CLEAN_UI_PRIMARY,
          fixedWidth: Math.max(1, width - CHOICE_HORIZONTAL_PADDING * 2 - CHOICE_CARET_GUTTER_PX),
          weight: selected ? 500 : 400
        }
      ).setDepth(selected ? 15 : 14));
    });
  }

  private drawMoreArrow(x: number, y: number, boxWidth: number, boxHeight: number): boolean {
    const arrow = this.add.graphics().setDepth(12);
    const arrowX = Math.round(x + boxWidth - TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS.x - 10);
    const arrowY = Math.round(y + boxHeight - TALK_WINDOW_TEXT_INSET_FROM_PANEL_CSS.y - 8);
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

    // Drop leading panels that would overflow the screen so the deepest (active)
    // panel always fits without overlapping its parents. Cascading works for the
    // shallow 2-deep menus; the binder's 3-deep drill-down with wide labels
    // ("LITTLE SWAG WORLD - 0/18") overflows 512px and used to collide.
    const visibleScreens = this.fitMenuScreens(screens);

    let nextX = MENU_LEFT;
    visibleScreens.forEach((screen) => {
      const rect = this.menuRect(screen, nextX);
      const { x, y, width: boxWidth, height: boxHeight } = rect;
      const textInset = MENU_HORIZONTAL_PADDING;
      const showTitle = screen.id !== "main";
      const titleTop = y + MENU_VERTICAL_PADDING;
      const objectiveLines = this.menuObjectiveLines(screen);
      const objectiveTop = y + MENU_VERTICAL_PADDING + (showTitle ? this.menuLineHeight() + MENU_TITLE_GAP : 0);
      const objectiveHeight = objectiveLines.length > 0
        ? objectiveLines.length * this.menuLineHeight() + MENU_OBJECTIVE_GAP
        : 0;
      const itemTop = objectiveTop + objectiveHeight;
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

      objectiveLines.forEach((line, lineIndex) => {
        this.menuTexts.push(createCleanText(
          this,
          x + textInset + MENU_CARET_GUTTER_PX,
          objectiveTop + lineIndex * this.menuLineHeight(),
          line,
          {
            fontSize: MENU_TITLE_FONT_SIZE,
            color: CLEAN_UI_SECONDARY,
            fixedWidth: Math.max(1, boxWidth - textInset * 2 - MENU_CARET_GUTTER_PX)
          }
        ).setDepth(15));
      });

      // Grid screens (the 3x3 Command menu) lay items in a row-major grid; the
      // selection highlight boxes the whole cell. Lists keep the vertical path below.
      if (screen.columns && screen.columns > 1) {
        const metrics = this.menuGridMetrics(screen);
        screen.items.forEach((item, index) => {
          const position = menuGridPosition(index, screen.items.length, metrics.columns, screen.gridOrder);
          if (position.row < metrics.visibleStartRow || position.row >= metrics.visibleStartRow + metrics.visibleRows) {
            return;
          }
          const visibleRow = position.row - metrics.visibleStartRow;
          const cellX = x + textInset + menuGridColumnOffset(metrics, position.col);
          const cellY = itemTop + visibleRow * metrics.rowHeight;
          const cellWidth = metrics.columnWidths[position.col] ?? metrics.columnWidths[0] ?? 1;
          const selected = item.selected && item.enabled;
          if (selected) {
            this.menuCursorSlots.push({
              x: cellX,
              rowTop: cellY - 2,
              width: cellWidth,
              rowHeight: this.menuLineHeight()
            });
          }
          const labelX = screen.gridKind === "psi-strengths" && position.col === 0
            ? cellX
            : cellX + MENU_CARET_GUTTER_PX;
          const textWidth = Math.max(1, cellWidth - (labelX - cellX));
          this.menuTexts.push(createCleanText(this, labelX, cellY, item.label, {
            fontSize,
            color: item.textColor ?? (selected ? CLEAN_UI_SELECTION_TEXT : (item.enabled ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY)),
            weight: selected ? 500 : 400,
            fixedWidth: textWidth,
            align: screen.gridKind === "psi-strengths" && position.col > 0 ? "center" : "left"
          }).setDepth(selected ? 17 : 15));
        });
        this.drawMenuScrollMarkers(graphics, rect, metrics.visibleStartRow > 0, metrics.visibleStartRow + metrics.visibleRows < metrics.rows);
        if (screen === visibleScreens[visibleScreens.length - 1]) {
          this.drawMenuSideInfo(screen, rect);
        }
        nextX = x + boxWidth + MENU_GAP;
        return;
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
          color: item.textColor ?? (selected ? CLEAN_UI_SELECTION_TEXT : (item.enabled ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY)),
          weight: selected ? 500 : 400,
          fixedWidth: textWidth
        }).setDepth(selected ? 17 : 15));
      });
      if (screen === visibleScreens[visibleScreens.length - 1]) {
        this.drawMenuScrollMarkers(graphics, rect, start > 0, start + visibleItems.length < screen.items.length);
        this.drawMenuSideInfo(screen, rect);
      }
      nextX = x + boxWidth + MENU_GAP;
    });
  }

  /** Keep the longest suffix of the screen stack whose cascaded panels fit on screen. */
  private fitMenuScreens(screens: MenuRenderScreen[]): MenuRenderScreen[] {
    if (screens.length <= 1) {
      return screens;
    }
    const rightEdge = this.scale.width - MENU_RIGHT_MARGIN;
    for (let dropped = 0; dropped < screens.length - 1; dropped += 1) {
      const candidate = screens.slice(dropped);
      let x = MENU_LEFT;
      let fits = true;
      for (const [index, screen] of candidate.entries()) {
        const rect = this.menuRect(screen, x);
        const right = index === candidate.length - 1
          ? this.menuScreenRightWithSideInfo(screen, rect)
          : rect.x + rect.width;
        if (right > rightEdge) {
          fits = false;
          break;
        }
        x = rect.x + rect.width + MENU_GAP;
      }
      if (fits) {
        return candidate;
      }
    }
    return screens.slice(screens.length - 1);
  }

  private drawBinderCardOverlay(card: BinderOverlayCard): void {
    const graphics = this.binderOverlayGraphics;
    const key = this.binderOverlayTextureKey;
    if (!graphics || !key) {
      return;
    }
    graphics.clear();
    for (const text of this.binderOverlayTexts) {
      text.destroy();
    }
    this.binderOverlayTexts = [];
    this.binderOverlayImage?.destroy();
    this.binderOverlayImage = undefined;

    graphics.fillStyle(0x000000, 0.72);
    graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    const captionRect = { x: 54, y: 344, width: 404, height: 70 };
    drawCleanPanel(graphics, captionRect);

    if (this.textures.exists(key)) {
      const image = this.add.image(this.scale.width / 2, 176, key).setDepth(82);
      const scale = Math.min(1.3, 256 / Math.max(1, image.height), 220 / Math.max(1, image.width));
      image.setScale(scale);
      this.binderOverlayImage = image;
    } else {
      graphics.lineStyle(2, CLEAN_UI_PANEL_BORDER, 0.78);
      graphics.strokeRoundedRect(176, 56, 160, 224, 6);
    }

    const inner = cleanPanelInnerRect(captionRect, { x: 14, y: 10 });
    this.binderOverlayTexts.push(createCleanText(this, inner.x, inner.y, card.name, {
      fontSize: 15,
      color: CLEAN_UI_PRIMARY,
      fixedWidth: inner.width,
      align: "center",
      weight: 500
    }).setDepth(83));
    this.binderOverlayTexts.push(createCleanText(this, inner.x, inner.y + 26, card.caption, {
      fontSize: 13,
      color: CLEAN_UI_SECONDARY,
      fixedWidth: inner.width,
      wordWrapWidth: inner.width,
      align: "center"
    }).setDepth(83));
  }

  private closeBinderCardOverlay(notify: boolean): void {
    this.binderOverlayGraphics?.clear();
    this.binderOverlayImage?.destroy();
    this.binderOverlayImage = undefined;
    for (const text of this.binderOverlayTexts) {
      text.destroy();
    }
    this.binderOverlayTexts = [];
    const key = this.binderOverlayTextureKey;
    if (key && this.textures.exists(key)) {
      this.textures.remove(key);
    }
    this.binderOverlayTextureKey = undefined;
    const onClose = this.binderOverlayClose;
    this.binderOverlayClose = undefined;
    if (notify) {
      onClose?.();
    }
  }

  private positionMenuHint(hudVisible: boolean): void {
    const y = hudVisible
      ? this.scale.height - OVERWORLD_HUD_CARD_BOTTOM_MARGIN - OVERWORLD_HUD_CARD_HEIGHT - 6
      : this.scale.height - 12;
    this.menuHintText?.setPosition(this.scale.width - 12, Math.max(12, y));
  }

  private drawOverworldHud(view: OverworldStatusHudView | undefined): void {
    const graphics = this.hudGraphics;
    const fieldGraphics = this.hudFieldGraphics;
    const accentGraphics = this.hudAccentGraphics;
    if (!graphics || !fieldGraphics || !accentGraphics) {
      return;
    }
    graphics.clear();
    fieldGraphics.clear();
    accentGraphics.clear();
    const members = view?.members.slice(0, 4) ?? [];
    if (!view?.visible || members.length === 0) {
      this.setHudTextsVisible(false);
      return;
    }

    const cards = battleStatusCardRects({
      screen: { width: this.scale.width, height: this.scale.height },
      memberCount: members.length,
      activeIndex: null,
      sideMargin: OVERWORLD_HUD_CARD_SIDE_MARGIN,
      bottomMargin: OVERWORLD_HUD_CARD_BOTTOM_MARGIN,
      gap: OVERWORLD_HUD_CARD_GAP,
      cardHeight: OVERWORLD_HUD_CARD_HEIGHT,
      minCardWidth: OVERWORLD_HUD_CARD_MIN_WIDTH,
      maxCardWidth: OVERWORLD_HUD_CARD_MAX_WIDTH,
      activeLift: 0
    });
    this.ensureHudTextLayout(cards);

    cards.forEach((card, index) => {
      const member = members[index];
      const textSet = this.hudTexts[index];
      if (!member || !textSet) {
        return;
      }
      drawCleanPanel(graphics, card, { borderWidth: 2, borderAlpha: 0.5 });
      if (member.danger) {
        const pulse = 0.22 + Math.sin(this.time.now / 115) * 0.08;
        accentGraphics.fillStyle(0xffffff, pulse);
        accentGraphics.fillRoundedRect(card.x + 4, card.y + 4, Math.max(1, card.width - 8), Math.max(1, card.height - 8), 5);
        accentGraphics.lineStyle(1, 0xffffff, 0.5 + Math.sin(this.time.now / 140) * 0.2);
        accentGraphics.strokeRoundedRect(card.x + 4.5, card.y + 4.5, Math.max(1, card.width - 9), Math.max(1, card.height - 9), 5);
      }
      const content = this.hudCardContentRect(card);
      this.updateHudTextSet(textSet, member, content);
      // EarthBound status windows show HP/PP as rolling odometer numbers, no bars —
      // the value text (member.hp is the rolling displayed vital) already rolls.
    });
  }

  private ensureHudTextLayout(cards: CanvasRect[]): void {
    const signature = JSON.stringify(cards.map((card) => ({
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height
    })));
    if (signature === this.hudLayoutSignature && this.hudTexts.length === cards.length) {
      this.setHudTextsVisible(true);
      return;
    }
    this.hudLayoutSignature = signature;
    for (const textSet of this.hudTexts) {
      textSet.name.destroy();
      textSet.badges.destroy();
      textSet.hpLabel.destroy();
      textSet.ppLabel.destroy();
      textSet.hpValue.destroy();
      textSet.ppValue.destroy();
    }
    this.hudTexts = cards.map((card) => this.createHudTextSet(card));
  }

  private createHudTextSet(card: CanvasRect): OverworldHudTextSet {
    const content = this.hudCardContentRect(card);
    const hpMetrics = this.hudStatusBarMetrics(content, "hp");
    const ppMetrics = this.hudStatusBarMetrics(content, "pp");
    const badgeWidth = hudBadgeReserveWidth(content.width);
    return {
      // Name box spans the full card width; updateHudTextSet only shortens the fitted
      // text when status badges are actually present, so full names show otherwise.
      name: this.createHudText(content.x, content.y, "", content.width, OVERWORLD_HUD_NAME_FONT_SIZE, 500).setDepth(9.5),
      badges: this.createHudText(content.x + content.width - badgeWidth, content.y + 1, "", badgeWidth, OVERWORLD_HUD_BADGE_FONT_SIZE, 500, "right").setDepth(9.5),
      hpLabel: this.createHudText(content.x, hpMetrics.labelY, "HP", OVERWORLD_HUD_LABEL_WIDTH, OVERWORLD_HUD_LABEL_FONT_SIZE, 500).setDepth(9.5),
      ppLabel: this.createHudText(content.x, ppMetrics.labelY, "PP", OVERWORLD_HUD_LABEL_WIDTH, OVERWORLD_HUD_LABEL_FONT_SIZE, 500).setDepth(9.5),
      hpValue: this.createHudText(hpMetrics.valueX, hpMetrics.valueY, "", hpMetrics.valueWidth, OVERWORLD_HUD_VALUE_FONT_SIZE, 400, "right").setDepth(9.5),
      ppValue: this.createHudText(ppMetrics.valueX, ppMetrics.valueY, "", ppMetrics.valueWidth, OVERWORLD_HUD_VALUE_FONT_SIZE, 400, "right").setDepth(9.5)
    };
  }

  private createHudText(
    x: number,
    y: number,
    text: string,
    width: number,
    fontSize: number,
    weight: 400 | 500,
    align: "left" | "right" = "left"
  ): Phaser.GameObjects.Text {
    return createCleanText(this, x, y, text, {
      fontSize,
      color: weight === 500 ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY,
      fixedWidth: width,
      weight,
      align
    });
  }

  private updateHudTextSet(
    textSet: OverworldHudTextSet,
    member: OverworldStatusHudMember,
    content: CanvasRect
  ): void {
    const badgeText = member.statuses.map((entry) => statusAilmentBadge(entry.ailment)).join(" ");
    const nameMaxWidth = badgeText.trim().length > 0
      ? Math.max(1, content.width - hudBadgeReserveWidth(content.width) - 4)
      : content.width;
    textSet.name.setText(this.fitCleanText(member.name, nameMaxWidth, OVERWORLD_HUD_NAME_FONT_SIZE));
    textSet.badges.setText(this.fitCleanText(badgeText, textSet.badges.width || 48, OVERWORLD_HUD_BADGE_FONT_SIZE));
    textSet.hpLabel.setText("HP");
    textSet.ppLabel.setText("PP");
    textSet.hpValue.setText(formatCleanOdometerValue(member.hp));
    textSet.ppValue.setText(formatCleanOdometerValue(member.pp));
    const hpAlpha = member.danger ? 0.7 + Math.sin(this.time.now / 120) * 0.25 : 1;
    textSet.hpValue.setAlpha(hpAlpha);
    textSet.hpLabel.setAlpha(hpAlpha);
  }

  private setHudTextsVisible(visible: boolean): void {
    if (!visible) {
      this.hudLayoutSignature = "";
    }
    for (const textSet of this.hudTexts) {
      textSet.name.setVisible(visible);
      textSet.badges.setVisible(visible);
      textSet.hpLabel.setVisible(visible);
      textSet.ppLabel.setVisible(visible);
      textSet.hpValue.setVisible(visible);
      textSet.ppValue.setVisible(visible);
    }
  }

  private hudCardContentRect(card: CanvasRect): CanvasRect {
    return cleanPanelInnerRect(card, {
      x: OVERWORLD_HUD_CONTENT_PADDING_X,
      y: OVERWORLD_HUD_CONTENT_PADDING_Y
    });
  }

  private hudStatusBarMetrics(content: CanvasRect, row: "hp" | "pp"): {
    labelY: number;
    valueX: number;
    valueY: number;
    valueWidth: number;
    barX: number;
    barY: number;
    barWidth: number;
    barHeight: number;
  } {
    const rowY = content.y + (row === "hp" ? OVERWORLD_HUD_HP_ROW_Y : OVERWORLD_HUD_PP_ROW_Y);
    // No bars anymore: the odometer number gets the whole row width after the HP/PP label.
    const valueWidth = Math.min(50, Math.max(42, Math.floor(content.width * 0.42)));
    const barX = content.x + OVERWORLD_HUD_BAR_X;
    const valueX = content.x + content.width - valueWidth;
    const barWidth = Math.max(12, valueX - OVERWORLD_HUD_BAR_VALUE_GAP - barX);
    return {
      labelY: rowY - 1,
      valueX,
      valueY: rowY - 2,
      valueWidth,
      barX,
      barY: rowY + 13,
      barWidth,
      barHeight: OVERWORLD_HUD_BAR_HEIGHT
    };
  }

  private drawHudStatusBar(
    graphics: Phaser.GameObjects.Graphics,
    metrics: ReturnType<UiScene["hudStatusBarMetrics"]>,
    current: number,
    max: number,
    fillColor: number
  ): void {
    graphics.fillStyle(CLEAN_UI_TRACK, CLEAN_UI_TRACK_ALPHA);
    graphics.fillRoundedRect(metrics.barX, metrics.barY, metrics.barWidth, metrics.barHeight, 3);
    const fillWidth = Math.round(metrics.barWidth * statusBarFillFraction(current, max));
    if (fillWidth <= 0) {
      return;
    }
    graphics.fillStyle(fillColor, 0.95);
    graphics.fillRoundedRect(metrics.barX, metrics.barY, fillWidth, metrics.barHeight, 3);
  }

  private fitCleanText(text: string, maxWidth: number, fontSize: number): string {
    if (estimateCleanTextWidth(text, fontSize) <= maxWidth) {
      return text;
    }
    const suffix = "...";
    let fitted = text;
    while (fitted.length > 0 && estimateCleanTextWidth(fitted + suffix, fontSize) > maxWidth) {
      fitted = fitted.slice(0, -1);
    }
    return fitted.length > 0 ? fitted + suffix : "";
  }

  private dialogueRect(): CanvasRect {
    return TALK_WINDOW_PANEL_RECT_CSS;
  }

  private dialogueTextWidth(): number {
    return TALK_WINDOW_WRAP_WIDTH_CSS;
  }

  /** Shared cell metrics for a columned (grid) menu, used by sizing + drawing. */
  private menuGridMetrics(screen: MenuRenderScreen): MenuGridMetrics {
    const columns = Math.max(1, Math.trunc(screen.columns ?? 1));
    const rows = Math.max(1, Math.ceil(screen.items.length / columns));
    const selectedIndex = Math.max(0, screen.cursorIndex);
    const selectedRow = menuGridPosition(selectedIndex, screen.items.length, columns, screen.gridOrder).row;
    const maxVisibleRows = Math.max(1, Math.trunc(screen.maxVisibleRows ?? rows));
    const visibleRows = Math.max(1, Math.min(rows, maxVisibleRows));
    const visibleStartRow = visibleItemStart(selectedRow, rows, visibleRows);
    const columnWidths = Array.from({ length: columns }, (_, col) => {
      const labels = screen.items.flatMap((item, index) => {
        const position = menuGridPosition(index, screen.items.length, columns, screen.gridOrder);
        return position.col === col ? [item.label] : [];
      });
      const widest = labels.reduce((max, label) => Math.max(max, this.measureTextWidth(label)), 0);
      const caretWidth = screen.gridKind === "psi-strengths" && col === 0 ? 0 : MENU_CARET_GUTTER_PX;
      const minWidth = screen.gridKind === "psi-strengths" && col > 0 ? 24 : 0;
      return Math.max(minWidth, widest + caretWidth + MENU_GRID_CELL_INSET * 2);
    });
    const rowHeight = this.menuLineHeight() + MENU_GRID_ROW_EXTRA;
    const contentWidth = columnWidths.reduce((total, width) => total + width, 0) + MENU_GRID_COL_GAP * Math.max(0, columns - 1);
    return { columns, rows, visibleStartRow, visibleRows, columnWidths, rowHeight, contentWidth };
  }

  private menuObjectiveTextWidth(): number {
    return Math.max(1, this.scale.width - MENU_LEFT - MENU_RIGHT_MARGIN - MENU_HORIZONTAL_PADDING * 2 - MENU_CARET_GUTTER_PX);
  }

  private menuObjectiveLines(screen: MenuRenderScreen): string[] {
    const text = screen.objectiveText?.trim();
    void text; // NEXT line removed per Nick: exploration over hand-holding
    return [];
  }

  private wrapMenuText(text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.measureTextWidth(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines;
  }

  private menuRect(screen: MenuRenderScreen, x: number): CanvasRect {
    const showTitle = screen.id !== "main";
    if (screen.columns && screen.columns > 1) {
      const metrics = this.menuGridMetrics(screen);
      const titleHeight = showTitle ? this.menuLineHeight() + MENU_TITLE_GAP : 0;
      const objectiveLines = this.menuObjectiveLines(screen);
      const objectiveHeight = objectiveLines.length > 0
        ? objectiveLines.length * this.menuLineHeight() + MENU_OBJECTIVE_GAP
        : 0;
      const gridWidth = MENU_HORIZONTAL_PADDING * 2 + metrics.contentWidth;
      const objectiveWidth = objectiveLines.length > 0
        ? MENU_HORIZONTAL_PADDING * 2 + MENU_CARET_GUTTER_PX + this.menuObjectiveTextWidth()
        : 0;
      return {
        x,
        y: MENU_TOP,
        width: Math.max(gridWidth, objectiveWidth),
        height: MENU_VERTICAL_PADDING * 2 + titleHeight + objectiveHeight + metrics.visibleRows * metrics.rowHeight
      };
    }
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

  private menuScreenRightWithSideInfo(screen: MenuRenderScreen, rect: CanvasRect): number {
    const sideInfo = this.menuSideInfoRect(screen, rect);
    return sideInfo ? sideInfo.x + sideInfo.width : rect.x + rect.width;
  }

  private menuActiveInfo(screen: MenuRenderScreen): { title?: string; lines: string[] } | undefined {
    const selectedInfo = screen.items.find((item) => item.selected && item.infoLines && item.infoLines.length > 0)?.infoLines;
    const lines = selectedInfo ?? screen.sideInfoLines;
    if (!lines || lines.length === 0) {
      return undefined;
    }
    return {
      ...(screen.sideInfoTitle ? { title: screen.sideInfoTitle } : {}),
      lines
    };
  }

  private menuSideInfoRect(screen: MenuRenderScreen, anchor: CanvasRect): CanvasRect | undefined {
    const info = this.menuActiveInfo(screen);
    if (!info) {
      return undefined;
    }
    const x = anchor.x + anchor.width + MENU_GAP;
    const maxWidth = Math.max(1, this.scale.width - x - MENU_RIGHT_MARGIN);
    const labels = info.title ? [info.title, ...info.lines] : info.lines;
    const measuredWidth = labels.reduce((max, label) => Math.max(max, this.measureTextWidth(label)), 0);
    const width = Math.min(
      maxWidth,
      Math.max(64, measuredWidth + (MENU_HORIZONTAL_PADDING + MENU_CARET_GUTTER_PX) * 2)
    );
    const maxHeight = Math.max(this.menuLineHeight() + MENU_VERTICAL_PADDING * 2, this.scale.height - anchor.y - MENU_BOTTOM_MARGIN);
    const height = Math.min(maxHeight, MENU_VERTICAL_PADDING * 2 + labels.length * this.menuLineHeight());
    return {
      x,
      y: anchor.y,
      width,
      height
    };
  }

  private drawMenuSideInfo(screen: MenuRenderScreen, anchor: CanvasRect): void {
    const info = this.menuActiveInfo(screen);
    const rect = this.menuSideInfoRect(screen, anchor);
    if (!info || !rect) {
      return;
    }
    const graphics = this.menuGraphics;
    if (!graphics) {
      return;
    }
    drawCleanPanel(graphics, rect);
    const labels = info.title ? [info.title, ...info.lines] : info.lines;
    const textRect = cleanPanelInnerRect(rect, {
      x: MENU_HORIZONTAL_PADDING,
      y: MENU_VERTICAL_PADDING
    });
    labels.forEach((line, index) => {
      this.menuTexts.push(createCleanText(this, textRect.x, textRect.y + index * this.menuLineHeight(), line, {
        fontSize: index === 0 && info.title ? MENU_TITLE_FONT_SIZE : MENU_FONT_SIZE,
        color: index === 0 && info.title ? CLEAN_UI_SECONDARY : CLEAN_UI_PRIMARY,
        fixedWidth: textRect.width,
        weight: index === 0 && info.title ? 500 : 400
      }).setDepth(16));
    });
  }

  private drawMenuScrollMarkers(
    graphics: Phaser.GameObjects.Graphics,
    rect: CanvasRect,
    hasMoreBefore: boolean,
    hasMoreAfter: boolean
  ): void {
    const x = Math.round(rect.x + rect.width - MENU_HORIZONTAL_PADDING + 2);
    if (hasMoreBefore) {
      const y = Math.round(rect.y + 8);
      graphics.fillStyle(CLEAN_UI_PANEL_BORDER, 0.76);
      graphics.fillTriangle(x, y, x - 5, y + 6, x + 5, y + 6);
    }
    if (hasMoreAfter) {
      const y = Math.round(rect.y + rect.height - 8);
      graphics.fillStyle(CLEAN_UI_PANEL_BORDER, 0.76);
      graphics.fillTriangle(x, y, x - 5, y - 6, x + 5, y - 6);
    }
  }

  private measureTextWidth(text: string): number {
    return estimateCleanTextWidth(text, MENU_FONT_SIZE);
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

function menuGridColumnOffset(metrics: MenuGridMetrics, col: number): number {
  return metrics.columnWidths.slice(0, Math.max(0, col)).reduce((total, width) => total + width + MENU_GRID_COL_GAP, 0);
}

function menuGridPosition(
  index: number,
  itemCount: number,
  columns: number,
  order: MenuRenderScreen["gridOrder"] = "row-major"
): { row: number; col: number } {
  const normalizedColumns = Math.max(1, columns);
  const normalizedIndex = Math.max(0, Math.min(Math.floor(index), Math.max(0, itemCount - 1)));
  const rows = Math.max(1, Math.ceil(Math.max(0, itemCount) / normalizedColumns));
  if (order === "column-major") {
    return {
      row: normalizedIndex % rows,
      col: Math.floor(normalizedIndex / rows)
    };
  }
  return {
    row: Math.floor(normalizedIndex / normalizedColumns),
    col: normalizedIndex % normalizedColumns
  };
}
