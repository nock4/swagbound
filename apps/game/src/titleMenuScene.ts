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
import {
  WAR_SLIDE_FIRST_ZOOM_LEG_MS,
  WAR_SLIDE_REVEAL_FADE_MS,
  titlePromptVisible,
  type TitleMenuPhase
} from "./titleMenuTiming";

/** Where a menu choice sends the player. */
export interface TitleMenuTarget {
  sceneKey: string;
  data: object;
  keepMusicPlaying?: boolean;
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
const WAR_STOP_FADE_MS = 70;
const TITLE_MUSIC_ATTACK_FADE_MS = 40;
// Dark, brooding track for the opening war-against-milady slide (Nate Young); Glass
// Chime (MENU_CUE) is held back until the menu.
const WAR_CUE = "intro";

type Phase = TitleMenuPhase;

/**
 * Boot-time title + intro-slide sequence and main menu.
 *
 *   "war against milady" slide (Glass Chime starts here)  → (Z) →  SWAGBOUND title slide
 *                                                          → (Z) →  main menu: NEW GAME / CONTINUE
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
  private audioUnlockCleanup?: () => void;
  private warSlideOverlay?: Phaser.GameObjects.Rectangle;
  private warSlideTweens: Phaser.Tweens.Tween[] = [];

  private menuItems: { label: string; run: () => void }[] = [];
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuPanel?: Phaser.GameObjects.Graphics;
  private cursor = 0;
  private readonly confirmPointerInput = () => this.confirm();

  constructor() {
    super("title-menu");
  }

  init(data: TitleMenuData): void {
    this.newGameTarget = data.newGameTarget;
    this.continueTarget = data.continueTarget ?? null;
    this.hasSave = data.hasSave;
    this.musicManifest = data.musicManifest;
    this.phase = "war";
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
    // War-against-milady slide opens the sequence with the dark WAR_CUE; Glass Chime
    // holds until the menu.
    this.showSlide(WAR_SLIDE_KEY);
    // Queue the cue now for browsers that allow autoplay, then retry on the first
    // gesture without taking the event away from normal title/menu input.
    this.playCurrentPhaseMusic();
    void this.music.preload(MENU_CUE);
    this.installFirstGestureAudioUnlock();
    this.prompt = this.add
      .text(this.scale.width / 2, this.scale.height - 30, "PRESS  Z  TO  BEGIN", {
        fontFamily: CLEAN_UI_FONT_FAMILY,
        fontSize: "16px",
        color: "#ffffff"
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 2, "#000000", 4)
      .setAlpha(0);

    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirm());
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveCursor(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveCursor(1));
    this.input.on("pointerdown", this.confirmPointerInput);

    this.events.once("shutdown", () => {
      this.audioUnlockCleanup?.();
      this.killWarSlideAnimation();
      this.input.off("pointerdown", this.confirmPointerInput);
    });

    document.getElementById("game-loading")?.remove();
    this.cameras.main.fadeIn(WAR_SLIDE_REVEAL_FADE_MS, 0, 0, 0);
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
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.promptClockMs / 380));
    this.prompt.setAlpha(titlePromptVisible(this.phase, this.promptClockMs) ? pulse : 0);
  }

  private showSlide(key: string): void {
    this.killWarSlideAnimation();
    this.slide?.destroy();
    const image = this.add.image(this.scale.width / 2, this.scale.height / 2, key).setDepth(0);
    // Contain-fit: show the whole slide (letterboxed) so the baked-in title text is never cropped.
    const scale = Math.min(this.scale.width / image.width, this.scale.height / image.height);
    image.setScale(scale);
    this.slide = image;
    if (key === WAR_SLIDE_KEY) {
      this.animateWarSlide(image, scale);
    }
  }

  private animateWarSlide(image: Phaser.GameObjects.Image, containScale: number): void {
    const centerY = this.scale.height / 2;
    const driftY = Math.max(8, Math.round(this.scale.height * 0.025));
    image.setScale(containScale);
    image.setY(centerY);
    const driftTween = this.tweens.add({
      targets: image,
      scale: containScale * 1.08,
      y: centerY - driftY,
      duration: WAR_SLIDE_FIRST_ZOOM_LEG_MS,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
    const overlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.1)
      .setOrigin(0)
      .setDepth(1);
    const pulseTween = this.tweens.add({
      targets: overlay,
      alpha: 0.18,
      duration: 5200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1
    });
    this.warSlideOverlay = overlay;
    this.warSlideTweens = [driftTween, pulseTween];
  }

  private killWarSlideAnimation(): void {
    for (const tween of this.warSlideTweens) {
      tween.stop();
    }
    this.warSlideTweens = [];
    this.warSlideOverlay?.destroy();
    this.warSlideOverlay = undefined;
  }

  private installFirstGestureAudioUnlock(): void {
    this.audioUnlockCleanup?.();
    let cleanedUp = false;
    const unlockMusic = () => {
      this.playCurrentPhaseMusic();
      this.music?.resume();
      cleanup();
    };
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      this.input.off("pointerdown", unlockMusic);
      this.input.keyboard?.off("keydown", unlockMusic);
      this.input.gamepad?.off("down", unlockMusic);
      globalThis.removeEventListener?.("gamepadconnected", unlockMusic);
      if (this.audioUnlockCleanup === cleanup) {
        this.audioUnlockCleanup = undefined;
      }
    };
    this.input.once("pointerdown", unlockMusic);
    this.input.keyboard?.once("keydown", unlockMusic);
    this.input.gamepad?.once("down", unlockMusic);
    globalThis.addEventListener?.("gamepadconnected", unlockMusic, { once: true });
    this.audioUnlockCleanup = cleanup;
  }

  private playCurrentPhaseMusic(options?: { fadeMs?: number }): void {
    const cue = this.phase === "war" ? WAR_CUE : MENU_CUE;
    void this.music?.play(cue, options);
  }

  private confirm(): void {
    if (this.transitioning) {
      return;
    }
    if (this.phase === "war") {
      this.music?.stop(WAR_STOP_FADE_MS);
      this.fadeSwap(() => {
        this.phase = "title";
        this.showSlide(TITLE_SLIDE_KEY);
        // Glass Chime (Inoyamaland) starts sharply with the SWAGBOUND title slide.
        this.playCurrentPhaseMusic({ fadeMs: TITLE_MUSIC_ATTACK_FADE_MS });
        this.prompt?.setText("PRESS  Z");
        this.prompt?.setDepth(10);
      });
      return;
    }
    if (this.phase === "title") {
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
    if (!target.keepMusicPlaying) {
      this.music?.stop(420);
    }
    cam.fadeOut(420, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(target.sceneKey, target.data);
    });
  }
}
