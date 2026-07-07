import Phaser from "phaser";
import {
  CLEAN_UI_FONT_FAMILY,
  CLEAN_UI_PANEL_ALPHA,
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_PANEL_BORDER_ALPHA,
  CLEAN_UI_PANEL_BORDER_WIDTH,
  CLEAN_UI_PANEL_FILL,
  CLEAN_UI_PANEL_RADIUS,
  CLEAN_UI_SELECTION_TEXT
} from "./cleanUi";
import { CONFIRM_KEY_NAMES, MENU_DOWN_KEY_NAMES, MENU_UP_KEY_NAMES, registerDiscreteKeys } from "./inputModel";
import { buildFreshBedroomWorldTarget, buildTitleMenuData, readContinueWorldTarget } from "./gameStartTargets";
import type { GameData } from "./loader";
import type { SaveSlotPersistence } from "./saveState";
import type { TitleMenuTarget } from "./titleMenuScene";

const MESSAGE = "The record notes an interruption.";
const MESSAGE_FADE_MS = 2000;
const MESSAGE_HOLD_MS = 850;
const DEFAULT_SAVE_SLOT = 0;

type GameOverChoice = {
  label: "CONTINUE" | "TITLE";
  run: () => void;
};

export class GameOverScene extends Phaser.Scene {
  private gameData?: GameData;
  private saveSlot = DEFAULT_SAVE_SLOT;
  private saveSlots?: SaveSlotPersistence;
  private choices: GameOverChoice[] = [];
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private cursorText?: Phaser.GameObjects.Text;
  private panel?: Phaser.GameObjects.Graphics;
  private cursor = 0;
  private menuReady = false;
  private transitioning = false;

  constructor() {
    super("game-over");
  }

  init(data: {
    gameData?: GameData;
    saveSlot?: number;
    saveSlots?: SaveSlotPersistence;
  }): void {
    this.gameData = data.gameData;
    this.saveSlot = Number.isInteger(data.saveSlot) && (data.saveSlot as number) >= 0
      ? data.saveSlot as number
      : DEFAULT_SAVE_SLOT;
    this.saveSlots = data.saveSlots;
    this.choices = [];
    this.choiceTexts = [];
    this.cursor = 0;
    this.menuReady = false;
    this.transitioning = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveCursor(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveCursor(1));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirm());

    const message = this.add
      .text(this.scale.width / 2, Math.round(this.scale.height * 0.38), MESSAGE, {
        fontFamily: CLEAN_UI_FONT_FAMILY,
        fontSize: "18px",
        color: "#ffffff",
        align: "center",
        wordWrap: { width: this.scale.width - 72 }
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: message,
      alpha: 1,
      duration: MESSAGE_FADE_MS,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.time.delayedCall(MESSAGE_HOLD_MS, () => this.showMenu());
      }
    });
  }

  private showMenu(): void {
    if (this.menuReady) {
      return;
    }
    this.menuReady = true;
    this.choices = [
      { label: "CONTINUE", run: () => this.go(this.continueTarget()) },
      { label: "TITLE", run: () => this.go(this.titleTarget()) }
    ];

    const rowH = 32;
    const panelW = 184;
    const panelH = 18 + this.choices.length * rowH;
    const panelX = Math.round((this.scale.width - panelW) / 2);
    const panelY = Math.round(this.scale.height * 0.58);

    this.panel = this.add.graphics().setDepth(10);
    this.cursorText = this.add
      .text(panelX + 24, panelY + 9 + rowH / 2, ">", {
        fontFamily: CLEAN_UI_FONT_FAMILY,
        fontSize: "18px",
        color: CLEAN_UI_SELECTION_TEXT
      })
      .setOrigin(0.5)
      .setDepth(12);
    this.choiceTexts = this.choices.map((choice, i) => this.add
      .text(panelX + 48, panelY + 9 + rowH * i + rowH / 2, choice.label, {
        fontFamily: CLEAN_UI_FONT_FAMILY,
        fontSize: "18px",
        color: "#ffffff"
      })
      .setOrigin(0, 0.5)
      .setDepth(12));
    this.renderSelection();
  }

  private renderSelection(): void {
    if (!this.panel || !this.cursorText) {
      return;
    }
    const rowH = 32;
    const panelW = 184;
    const panelH = 18 + this.choices.length * rowH;
    const panelX = Math.round((this.scale.width - panelW) / 2);
    const panelY = Math.round(this.scale.height * 0.58);
    const selectedY = panelY + 9 + rowH * this.cursor;

    this.panel.clear();
    this.panel.fillStyle(CLEAN_UI_PANEL_FILL, CLEAN_UI_PANEL_ALPHA);
    this.panel.fillRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    this.panel.lineStyle(CLEAN_UI_PANEL_BORDER_WIDTH, CLEAN_UI_PANEL_BORDER, CLEAN_UI_PANEL_BORDER_ALPHA);
    this.panel.strokeRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    this.panel.fillStyle(0xffffff, 0.95);
    this.panel.fillRoundedRect(panelX + 8, selectedY + 2, panelW - 16, rowH - 4, CLEAN_UI_PANEL_RADIUS);

    this.cursorText.setPosition(panelX + 24, selectedY + rowH / 2);
    this.choiceTexts.forEach((text, i) => {
      text.setColor(i === this.cursor ? CLEAN_UI_SELECTION_TEXT : "#ffffff");
    });
  }

  private moveCursor(delta: number): void {
    if (!this.menuReady || this.choices.length === 0 || this.transitioning) {
      return;
    }
    this.cursor = (this.cursor + delta + this.choices.length) % this.choices.length;
    this.renderSelection();
  }

  private confirm(): void {
    if (!this.menuReady || this.transitioning) {
      return;
    }
    this.choices[this.cursor]?.run();
  }

  private continueTarget(): TitleMenuTarget {
    if (!this.gameData) {
      return { sceneKey: "boot", data: {} };
    }
    return readContinueWorldTarget(this.gameData, {
      saveSlot: this.saveSlot,
      saveSlots: this.saveSlots
    }) ?? buildFreshBedroomWorldTarget(this.gameData, {
      saveSlot: this.saveSlot,
      saveSlots: this.saveSlots
    });
  }

  private titleTarget(): TitleMenuTarget {
    if (!this.gameData) {
      return { sceneKey: "boot", data: {} };
    }
    return {
      sceneKey: "title-menu",
      data: buildTitleMenuData(this.gameData, {
        saveSlot: this.saveSlot,
        saveSlots: this.saveSlots
      })
    };
  }

  private go(target: TitleMenuTarget): void {
    if (this.transitioning) {
      return;
    }
    this.transitioning = true;
    this.cameras.main.fadeOut(360, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(target.sceneKey, target.data);
    });
  }
}
