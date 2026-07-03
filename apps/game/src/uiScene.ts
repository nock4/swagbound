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
  statusBarFillFraction
} from "./cleanUi";
import type { DialogueTextRun } from "./dialogueRenderer";
import {
  type CanvasRect,
  battleStatusCardRects,
  dialogueTextWidth,
  dialogueWindowRect,
  menuWindowRect
} from "./windowLayout";
import {
  menuCursorVisible
} from "./battleVisuals";
import type { OverworldStatusHudMember, OverworldStatusHudView } from "./overworldStatusHud";
import { statusAilmentBadge } from "./statusEffects";

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
const OVERWORLD_HUD_CARD_MIN_WIDTH = 112;
const OVERWORLD_HUD_CARD_MAX_WIDTH = 160;
const OVERWORLD_HUD_CONTENT_PADDING_X = 10;
const OVERWORLD_HUD_CONTENT_PADDING_Y = 8;
const OVERWORLD_HUD_NAME_FONT_SIZE = 13;
const OVERWORLD_HUD_BADGE_FONT_SIZE = 11;
const OVERWORLD_HUD_LABEL_FONT_SIZE = 11;
const OVERWORLD_HUD_VALUE_FONT_SIZE = 12;
const OVERWORLD_HUD_HP_ROW_Y = 23;
const OVERWORLD_HUD_PP_ROW_Y = 47;
const OVERWORLD_HUD_LABEL_WIDTH = 20;
const OVERWORLD_HUD_BAR_HEIGHT = 5;
const OVERWORLD_HUD_BAR_X = 28;
const OVERWORLD_HUD_BAR_VALUE_GAP = 4;

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
  private hudGraphics?: Phaser.GameObjects.Graphics;
  private hudFieldGraphics?: Phaser.GameObjects.Graphics;
  private hudAccentGraphics?: Phaser.GameObjects.Graphics;
  private hudTexts: OverworldHudTextSet[] = [];
  private hudLayoutSignature = "";
  private menuGraphics?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuCursorSlots: MenuCursorSlot[] = [];
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
    this.hudGraphics = this.add.graphics().setDepth(8);
    this.hudFieldGraphics = this.add.graphics().setDepth(8.5);
    this.hudAccentGraphics = this.add.graphics().setDepth(9);
    this.menuGraphics = this.add.graphics().setDepth(14);
    this.menuCursorGraphics = this.add.graphics().setDepth(16);
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
    this.input.keyboard?.on("keydown-C", () => this.copyDebugText());
    this.copyButton = button;
  }

  update(): void {
    const world = this.scene.get(this.worldSceneKey) as (WorldScene & {
      overworldStatusHud?: () => OverworldStatusHudView;
    }) | undefined;
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
    const hudView = world.overworldStatusHud?.();
    const visibleHudView = promptVisible && hudView?.visible ? hudView : undefined;
    const signature = `${open}|${JSON.stringify(textRuns)}|${footer}|${showAdvanceIndicator}|${world.prompt}|${promptVisible}|${panelVisible}|${runtimeLines.join("/")}|${JSON.stringify(menuScreens)}|${JSON.stringify(hudView)}`;
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
    this.positionMenuHint(Boolean(visibleHudView));
    this.drawDialogue(open, text, textRuns, footer, showAdvanceIndicator);
    this.drawPanel(panelVisible ? [...world.statusLines(), "", ...world.metadataLines(), "", ...runtimeLines] : []);
    this.drawOverworldHud(visibleHudView);
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
      for (const screen of candidate) {
        const rect = this.menuRect(screen, x);
        if (rect.x + rect.width > rightEdge) {
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
      this.drawHudStatusBar(fieldGraphics, this.hudStatusBarMetrics(content, "hp"), member.hp, member.maxHp, CLEAN_UI_HP);
      this.drawHudStatusBar(fieldGraphics, this.hudStatusBarMetrics(content, "pp"), member.pp, member.maxPp, CLEAN_UI_PP);
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
    const badgeWidth = Math.min(48, Math.max(34, Math.floor(content.width * 0.34)));
    const nameWidth = Math.max(1, content.width - badgeWidth - 4);
    return {
      name: this.createHudText(content.x, content.y, "", nameWidth, OVERWORLD_HUD_NAME_FONT_SIZE, 500).setDepth(9.5),
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
    textSet.name.setText(this.fitCleanText(member.name, textSet.name.width || content.width, OVERWORLD_HUD_NAME_FONT_SIZE));
    textSet.badges.setText(this.fitCleanText(badgeText, textSet.badges.width || 48, OVERWORLD_HUD_BADGE_FONT_SIZE));
    textSet.hpLabel.setText("HP");
    textSet.ppLabel.setText("PP");
    textSet.hpValue.setText(`${member.hp}/${member.maxHp}`);
    textSet.ppValue.setText(`${member.pp}/${member.maxPp}`);
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
    const valueWidth = Math.min(58, Math.max(42, Math.floor(content.width * 0.38)));
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
