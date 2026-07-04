import Phaser from "phaser";
import type { MusicManifest } from "@eb/schemas";
import { getSharedMusic } from "./sharedMusic";
import { musicDisabledBySearch, type Music } from "./audio/music";
import { CONFIRM_KEY_NAMES, MENU_DOWN_KEY_NAMES, MENU_UP_KEY_NAMES, registerDiscreteKeys } from "./inputModel";
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

/** Where a menu choice sends the player. */
export interface TitleMenuTarget {
  sceneKey: string;
  data: object;
}

export interface TitleMenuData {
  /** Fresh-game target (intro cinematic or opening cutscene → world). */
  newGameTarget: TitleMenuTarget;
  /** Continue target (world with the loaded save), or null when no save exists. */
  continueTarget?: TitleMenuTarget | null;
  hasSave: boolean;
  musicManifest?: MusicManifest;
}

const TITLE_SLIDE_KEY = "title-slide";
const WAR_SLIDE_KEY = "war-slide";
const MENU_CUE = "menu";

type Phase = "title" | "war" | "menu";

/**
 * Boot-time title + intro-slide sequence and main menu.
 *
 *   title slide  → (Z) →  "war against milady" slide (Glass Chime starts here)
 *                → (Z) →  main menu: NEW GAME / CONTINUE
 *
 * NEW GAME runs the intro cinematic + opening cutscene; CONTINUE loads the save.
 */
export class TitleMenuScene extends Phaser.Scene {
  private newGameTarget!: TitleMenuTarget;
  private continueTarget: TitleMenuTarget | null = null;
  private hasSave = false;
  private musicManifest?: MusicManifest;

  private phase: Phase = "title";
  private slide?: Phaser.GameObjects.Image;
  private prompt?: Phaser.GameObjects.Text;
  private promptClockMs = 0;
  private transitioning = false;
  private music?: Music;

  private menuItems: { label: string; run: () => void }[] = [];
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuPanel?: Phaser.GameObjects.Graphics;
  private cursor = 0;

  constructor() {
    super("title-menu");
  }

  init(data: TitleMenuData): void {
    this.newGameTarget = data.newGameTarget;
    this.continueTarget = data.continueTarget ?? null;
    this.hasSave = data.hasSave;
    this.musicManifest = data.musicManifest;
    this.phase = "title";
    this.cursor = 0;
    this.menuItems = [];
    this.menuTexts = [];
    this.promptClockMs = 0;
  }

  preload(): void {
    this.load.image(TITLE_SLIDE_KEY, "/assets/ui/title-slide.png");
    this.load.image(WAR_SLIDE_KEY, "/assets/ui/war-slide.png");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    this.music = getSharedMusic(this.registry, this.musicManifest, {
      muted: musicDisabledBySearch(globalThis.location?.search)
    });
    this.showSlide(TITLE_SLIDE_KEY);
    this.prompt = this.add
      .text(this.scale.width / 2, this.scale.height - 30, "PRESS  Z  TO  BEGIN", {
        fontFamily: CLEAN_UI_FONT_FAMILY,
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 2, "#000000", 4);

    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirm());
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveCursor(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveCursor(1));
    this.input.on("pointerdown", () => this.confirm());

    this.events.once("shutdown", () => {
      this.input.off("pointerdown");
    });

    this.cameras.main.fadeIn(600, 0, 0, 0);
  }

  /** Fade to black, run the swap, fade back in — with an input guard during the fade. */
  private fadeSwap(swap: () => void): void {
    if (this.transitioning) {
      return;
    }
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.fadeOut(240, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      swap();
      cam.fadeIn(240, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
        this.transitioning = false;
      });
    });
  }

  update(_time: number, delta: number): void {
    if (!this.prompt) {
      return;
    }
    this.promptClockMs += delta;
    // Gentle blink on the "press" prompt while a slide is showing.
    this.prompt.setAlpha(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.promptClockMs / 380)));
  }

  private showSlide(key: string): void {
    this.slide?.destroy();
    const image = this.add.image(this.scale.width / 2, this.scale.height / 2, key).setDepth(0);
    // Cover-fit: fill the screen, cropping overflow.
    const scale = Math.max(this.scale.width / image.width, this.scale.height / image.height);
    image.setScale(scale);
    this.slide = image;
  }

  private confirm(): void {
    if (this.transitioning) {
      return;
    }
    if (this.phase === "title") {
      this.fadeSwap(() => {
        this.phase = "war";
        this.showSlide(WAR_SLIDE_KEY);
        // Glass Chime (Inoyamaland) begins on the "war against milady" slide.
        void this.music?.play(MENU_CUE);
        this.prompt?.setText("PRESS  Z");
        this.prompt?.setDepth(10);
      });
      return;
    }
    if (this.phase === "war") {
      this.phase = "menu";
      this.buildMenu();
      return;
    }
    this.menuItems[this.cursor]?.run();
  }

  private buildMenu(): void {
    this.prompt?.destroy();
    this.prompt = undefined;

    this.menuItems = [{ label: "NEW GAME", run: () => this.go(this.newGameTarget) }];
    if (this.continueTarget && this.hasSave) {
      this.menuItems.push({ label: "CONTINUE", run: () => this.go(this.continueTarget as TitleMenuTarget) });
    }
    this.cursor = 0;

    const rowH = 34;
    const panelW = 220;
    const panelH = 18 + this.menuItems.length * rowH;
    const panelX = Math.round((this.scale.width - panelW) / 2);
    const panelY = Math.round(this.scale.height - panelH - 28);

    const panel = this.add.graphics().setDepth(20);
    panel.fillStyle(CLEAN_UI_PANEL_FILL, CLEAN_UI_PANEL_ALPHA);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    panel.lineStyle(CLEAN_UI_PANEL_BORDER_WIDTH, CLEAN_UI_PANEL_BORDER, CLEAN_UI_PANEL_BORDER_ALPHA);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    this.menuPanel = panel;

    this.menuTexts = this.menuItems.map((item, i) => {
      const y = panelY + 9 + rowH * i + rowH / 2;
      return this.add
        .text(this.scale.width / 2, y, item.label, {
          fontFamily: CLEAN_UI_FONT_FAMILY,
          fontSize: "18px",
          color: "#ffffff"
        })
        .setOrigin(0.5)
        .setDepth(22);
    });
    this.renderSelection();
  }

  private renderSelection(): void {
    if (!this.menuPanel) {
      return;
    }
    const rowH = 34;
    const panelW = 220;
    const panelX = Math.round((this.scale.width - panelW) / 2);
    const panelH = 18 + this.menuItems.length * rowH;
    const panelY = Math.round(this.scale.height - panelH - 28);

    // Redraw panel + inverted selection row (white fill, dark text).
    const panel = this.menuPanel;
    panel.clear();
    panel.fillStyle(CLEAN_UI_PANEL_FILL, CLEAN_UI_PANEL_ALPHA);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    panel.lineStyle(CLEAN_UI_PANEL_BORDER_WIDTH, CLEAN_UI_PANEL_BORDER, CLEAN_UI_PANEL_BORDER_ALPHA);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, CLEAN_UI_PANEL_RADIUS);
    const selY = panelY + 9 + rowH * this.cursor;
    panel.fillStyle(0xffffff, 0.95);
    panel.fillRoundedRect(panelX + 8, selY + 2, panelW - 16, rowH - 4, 6);

    this.menuTexts.forEach((text, i) => {
      text.setColor(i === this.cursor ? CLEAN_UI_SELECTION_TEXT : "#ffffff");
    });
  }

  private moveCursor(delta: number): void {
    if (this.phase !== "menu" || this.menuItems.length === 0) {
      return;
    }
    this.cursor = (this.cursor + delta + this.menuItems.length) % this.menuItems.length;
    this.renderSelection();
  }

  private go(target: TitleMenuTarget): void {
    if (this.transitioning) {
      return;
    }
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.fadeOut(420, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(target.sceneKey, target.data);
    });
  }
}
