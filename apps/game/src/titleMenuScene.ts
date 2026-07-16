import Phaser from "phaser";
import type { MusicManifest } from "@eb/schemas";
import { getSharedMusic } from "./sharedMusic";
import { musicDisabledBySearch, type Music } from "./audio/music";
import { CONFIRM_KEY_NAMES, MENU_DOWN_KEY_NAMES, MENU_UP_KEY_NAMES, registerDiscreteKeys } from "./inputModel";
import {
  CLEAN_UI_FONT_FAMILY,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SELECTION_CARET,
  CLEAN_UI_SELECTION_TEXT,
  createCleanText,
  drawCleanCaret,
  drawCleanPanel,
  drawCleanSelection
} from "./cleanUi";
import {
  WAR_SLIDE_FIRST_ZOOM_LEG_MS,
  WAR_SLIDE_REVEAL_FADE_MS,
  WAR_STATIC_REVEAL_MS,
  WAR_STATIC_TEXTURE_CYCLE_MS,
  titlePromptVisible,
  type TitleMenuPhase
} from "./titleMenuTiming";
import { validateImportedSaveBlob, type SaveSlotPersistence } from "./saveState";

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
  saveSlot?: number;
  saveSlots?: SaveSlotPersistence;
  refreshContinueTarget?: () => TitleMenuTarget | null;
  musicManifest?: MusicManifest;
}

const TITLE_SLIDE_KEY = "title-slide";
const WAR_SLIDE_KEY = "war-slide";
const WAR_STATIC_TEXTURE_KEY_PREFIX = "war-slide-static";
const MENU_CUE = "menu";
const PRE_TITLE_GATE_FADE_MS = 300;
const WAR_STATIC_TEXTURE_COUNT = 6;
const WAR_STATIC_TEXTURE_WIDTH = 128;
const WAR_STATIC_TEXTURE_HEIGHT = 112;
const MENU_CUE_FADE_MS = 70;
const MENU_ROW_H = 34;
const MENU_PANEL_W = 220;
const MENU_PANEL_BOTTOM_MARGIN = 28;
const MENU_MESSAGE_MS = 2200;
// Dark, brooding track for the opening war-against-milady slide and fresh-game
// opening. It stays alive across the title-to-world handoff.
const WAR_CUE = "intro";

type Phase = TitleMenuPhase;

/**
 * Boot-time title + intro-slide sequence and main menu.
 *
 *   pre-title gate  →  "war against milady" slide (WAR_CUE starts here)  → (Z) →  SWAGBOUND title slide
 *                                                                             → (Z) →  main menu: NEW GAME / CONTINUE
 *
 * NEW GAME runs the intro cinematic + opening cutscene; CONTINUE loads the save.
 */
export class TitleMenuScene extends Phaser.Scene {
  private newGameTarget!: TitleMenuTarget;
  private continueTarget: TitleMenuTarget | null = null;
  private hasSave = false;
  private saveSlot = 0;
  private saveSlots?: SaveSlotPersistence;
  private refreshContinueTarget?: () => TitleMenuTarget | null;
  private musicManifest?: MusicManifest;

  private phase: Phase = "title";
  private slide?: Phaser.GameObjects.Image;
  private prompt?: Phaser.GameObjects.Text;
  private promptClockMs = 0;
  private transitioning = false;
  private music?: Music;
  private warSlideOverlay?: Phaser.GameObjects.Rectangle;
  private warSlideTweens: Phaser.Tweens.Tween[] = [];
  private warSlideRevealTween?: Phaser.Tweens.Tween;
  private promptFadeActive = false;
  private warStaticTextureKeys: string[] = [];
  private warStaticImage?: Phaser.GameObjects.Image;
  private warStaticTween?: Phaser.Tweens.Tween;
  private warStaticCycle?: Phaser.Time.TimerEvent;

  private menuItems: { label: string; run: () => void }[] = [];
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private menuPanel?: Phaser.GameObjects.Graphics;
  private menuMessage?: Phaser.GameObjects.Text;
  private menuMessageTimer?: Phaser.Time.TimerEvent;
  private importInput?: HTMLInputElement;
  private activeImportReader?: FileReader;
  private readonly exportObjectUrls = new Set<string>();
  private cursor = 0;
  private readonly confirmPointerInput = () => this.confirm();
  private readonly gateKeyInput = () => this.releaseGate();
  private readonly gateGamepadInput = () => this.releaseGate();
  private readonly importFileChangeInput = (event: Event) => this.handleImportFileChange(event);

  constructor() {
    super("title-menu");
  }

  init(data: TitleMenuData): void {
    this.newGameTarget = data.newGameTarget;
    this.continueTarget = data.continueTarget ?? null;
    this.hasSave = data.hasSave;
    this.saveSlot = data.saveSlot ?? 0;
    this.saveSlots = data.saveSlots;
    this.refreshContinueTarget = data.refreshContinueTarget;
    this.musicManifest = data.musicManifest;
    this.phase = "gate";
    this.cursor = 0;
    this.menuItems = [];
    this.menuTexts = [];
    this.promptClockMs = 0;
    this.promptFadeActive = false;
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
    this.createWarStaticTextures();
    // Queue the cue now for browsers that allow autoplay, then retry on the first
    // gate gesture before the war slide is allowed onto the screen.
    this.playCurrentPhaseMusic();
    void this.music.preload(MENU_CUE);
    this.prompt = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "PRESS ANY BUTTON", {
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
    this.input.keyboard?.on("keydown", this.gateKeyInput);
    this.input.gamepad?.on("down", this.gateGamepadInput);

    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown", this.gateKeyInput);
      this.input.gamepad?.off("down", this.gateGamepadInput);
      this.killWarSlideAnimation();
      this.killWarStaticReveal();
      this.removeWarStaticTextures();
      this.input.off("pointerdown", this.confirmPointerInput);
      this.cleanupDomSaveControls();
      this.clearMenuMessage(true);
      this.destroyMenuObjects();
    });

    document.getElementById("game-loading")?.remove();
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
    if (!this.prompt || this.promptFadeActive) {
      return;
    }
    this.promptClockMs += delta;
    // Gentle blink on the "press" prompt while a slide is showing.
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.promptClockMs / 380));
    this.prompt.setAlpha(titlePromptVisible(this.phase, this.promptClockMs) ? pulse : 0);
  }

  private showSlide(key: string, alpha = 1): void {
    this.killWarSlideAnimation();
    this.killWarStaticReveal();
    this.slide?.destroy();
    const image = this.add.image(this.scale.width / 2, this.scale.height / 2, key).setDepth(0).setAlpha(alpha);
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
    this.warSlideRevealTween?.stop();
    this.warSlideRevealTween = undefined;
    this.warSlideOverlay?.destroy();
    this.warSlideOverlay = undefined;
  }

  private releaseGate(): void {
    if (this.phase !== "gate" || this.transitioning) {
      return;
    }
    this.transitioning = true;
    this.promptFadeActive = true;
    this.playCurrentPhaseMusic();
    this.music?.resume();
    const prompt = this.prompt;
    if (!prompt) {
      this.time.delayedCall(PRE_TITLE_GATE_FADE_MS, () => this.beginWarSlideReveal());
      return;
    }
    this.tweens.add({
      targets: prompt,
      alpha: 0,
      duration: PRE_TITLE_GATE_FADE_MS,
      onComplete: () => this.beginWarSlideReveal()
    });
  }

  private beginWarSlideReveal(): void {
    this.phase = "war";
    this.transitioning = false;
    this.promptFadeActive = false;
    this.promptClockMs = 0;
    this.prompt?.setText("PRESS  Z  TO  BEGIN");
    this.prompt?.setPosition(this.scale.width / 2, this.scale.height - 30);
    this.prompt?.setDepth(10);
    this.prompt?.setAlpha(0);
    this.showSlide(WAR_SLIDE_KEY, 0);
    if (this.slide) {
      this.warSlideRevealTween = this.tweens.add({
        targets: this.slide,
        alpha: 1,
        duration: WAR_SLIDE_REVEAL_FADE_MS,
        ease: "Linear",
        onComplete: () => {
          this.warSlideRevealTween = undefined;
        }
      });
    }
    this.startWarStaticReveal();
  }

  private createWarStaticTextures(): void {
    this.removeWarStaticTextures();
    for (let i = 0; i < WAR_STATIC_TEXTURE_COUNT; i += 1) {
      const key = `${WAR_STATIC_TEXTURE_KEY_PREFIX}-${i}`;
      const canvas = document.createElement("canvas");
      canvas.width = WAR_STATIC_TEXTURE_WIDTH;
      canvas.height = WAR_STATIC_TEXTURE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        continue;
      }
      const imageData = context.createImageData(WAR_STATIC_TEXTURE_WIDTH, WAR_STATIC_TEXTURE_HEIGHT);
      for (let p = 0; p < imageData.data.length; p += 4) {
        const color = saturatedStaticPixel();
        imageData.data[p] = color.r;
        imageData.data[p + 1] = color.g;
        imageData.data[p + 2] = color.b;
        imageData.data[p + 3] = 255;
      }
      context.putImageData(imageData, 0, 0);
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
      const texture = this.textures.addCanvas(key, canvas);
      if (texture) {
        this.warStaticTextureKeys.push(key);
      }
    }
  }

  private removeWarStaticTextures(): void {
    for (const key of this.warStaticTextureKeys) {
      if (this.textures.exists(key)) {
        this.textures.remove(key);
      }
    }
    this.warStaticTextureKeys = [];
  }

  private startWarStaticReveal(): void {
    if (this.warStaticTextureKeys.length === 0) {
      return;
    }
    this.killWarStaticReveal();
    let frame = 0;
    const image = this.add
      .image(this.scale.width / 2, this.scale.height / 2, this.warStaticTextureKeys[frame])
      .setDepth(5)
      .setAlpha(1);
    const scale = Math.max(this.scale.width / WAR_STATIC_TEXTURE_WIDTH, this.scale.height / WAR_STATIC_TEXTURE_HEIGHT);
    image.setScale(scale);
    this.warStaticImage = image;
    this.warStaticCycle = this.time.addEvent({
      delay: WAR_STATIC_TEXTURE_CYCLE_MS,
      loop: true,
      callback: () => {
        frame = (frame + 1) % this.warStaticTextureKeys.length;
        this.warStaticImage?.setTexture(this.warStaticTextureKeys[frame]);
      }
    });
    this.warStaticTween = this.tweens.add({
      targets: image,
      alpha: 0,
      duration: WAR_STATIC_REVEAL_MS,
      ease: "Quad.easeIn",
      onComplete: () => this.killWarStaticReveal()
    });
  }

  private killWarStaticReveal(): void {
    this.warStaticCycle?.remove(false);
    this.warStaticCycle = undefined;
    this.warStaticTween?.stop();
    this.warStaticTween = undefined;
    this.warStaticImage?.destroy();
    this.warStaticImage = undefined;
  }

  private playCurrentPhaseMusic(options?: { fadeMs?: number }): void {
    const cue = this.phase === "war" || this.phase === "gate" ? WAR_CUE : MENU_CUE;
    void this.music?.play(cue, options);
  }

  private confirm(): void {
    if (this.transitioning) {
      return;
    }
    if (this.phase === "gate") {
      this.releaseGate();
      return;
    }
    if (this.phase === "war") {
      this.killWarStaticReveal();
      this.fadeSwap(() => {
        this.phase = "title";
        this.playCurrentPhaseMusic({ fadeMs: MENU_CUE_FADE_MS });
        this.showSlide(TITLE_SLIDE_KEY);
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

  private buildMenu(preferredLabel?: string): void {
    this.prompt?.destroy();
    this.prompt = undefined;

    this.destroyMenuObjects();
    this.menuItems = [{ label: "NEW GAME", run: () => this.go(this.newGameTarget) }];
    if (this.continueTarget && this.hasSave) {
      this.menuItems.push({ label: "CONTINUE", run: () => this.go(this.continueTarget as TitleMenuTarget) });
    }
    if (this.hasExportableSave()) {
      this.menuItems.push({ label: "EXPORT SAVE", run: () => this.exportSave() });
    }
    this.menuItems.push({ label: "IMPORT SAVE", run: () => this.openImportPicker() });

    const preferredIndex = preferredLabel ? this.menuItems.findIndex((item) => item.label === preferredLabel) : -1;
    this.cursor = preferredIndex >= 0 ? preferredIndex : Math.min(this.cursor, this.menuItems.length - 1);

    const { panelX, panelY, panelW, panelH } = this.menuLayout();
    const panel = this.add.graphics().setDepth(20);
    drawCleanPanel(panel, { x: panelX, y: panelY, width: panelW, height: panelH });
    this.menuPanel = panel;

    this.menuTexts = this.menuItems.map((item, i) => {
      const y = panelY + 9 + MENU_ROW_H * i + MENU_ROW_H / 2;
      return this.add
        .text(panelX + 52, y, item.label, {
          fontFamily: CLEAN_UI_FONT_FAMILY,
          fontSize: "18px",
          color: "#ffffff"
        })
        .setOrigin(0, 0.5)
        .setDepth(22);
    });
    this.renderSelection();
  }

  private renderSelection(): void {
    if (!this.menuPanel) {
      return;
    }
    const { panelX, panelY, panelW, panelH } = this.menuLayout();

    // Redraw panel + inverted selection row (white fill, dark text).
    const panel = this.menuPanel;
    panel.clear();
    drawCleanPanel(panel, { x: panelX, y: panelY, width: panelW, height: panelH });
    const selY = panelY + 9 + MENU_ROW_H * this.cursor;
    drawCleanSelection(panel, { x: panelX + 12, y: selY + 2, width: panelW - 24, height: MENU_ROW_H - 4 }, true);
    drawCleanCaret(panel, panelX + 18, selY + 2, MENU_ROW_H - 4, CLEAN_UI_SELECTION_CARET);

    this.menuTexts.forEach((text, i) => {
      text.setColor(i === this.cursor ? CLEAN_UI_SELECTION_TEXT : "#ffffff");
    });
  }

  private menuLayout(): { panelX: number; panelY: number; panelW: number; panelH: number } {
    const panelW = MENU_PANEL_W;
    const panelH = 18 + this.menuItems.length * MENU_ROW_H;
    return {
      panelX: Math.round((this.scale.width - panelW) / 2),
      panelY: Math.round(this.scale.height - panelH - MENU_PANEL_BOTTOM_MARGIN),
      panelW,
      panelH
    };
  }

  private destroyMenuObjects(): void {
    this.menuPanel?.destroy();
    this.menuPanel = undefined;
    for (const text of this.menuTexts) {
      text.destroy();
    }
    this.menuTexts = [];
  }

  private hasExportableSave(): boolean {
    return this.rawSaveBlob() !== null;
  }

  private rawSaveBlob(): string | null {
    return this.saveSlots?.loadFromSlot(this.saveSlot) ?? null;
  }

  private exportSave(): void {
    const raw = this.rawSaveBlob();
    if (raw === null) {
      this.refreshSaveMenuState("IMPORT SAVE");
      this.showMenuMessage("NO SAVE FOUND", "error");
      return;
    }
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
      this.showMenuMessage("EXPORT FAILED", "error");
      return;
    }
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    this.exportObjectUrls.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = saveExportFileName();
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.time.delayedCall(1000, () => this.revokeExportObjectUrl(url));
  }

  private openImportPicker(): void {
    if (typeof document === "undefined" || typeof FileReader === "undefined") {
      this.showMenuMessage("IMPORT FAILED", "error");
      return;
    }
    this.cleanupImportInput();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.display = "none";
    input.addEventListener("change", this.importFileChangeInput, { once: true });
    document.body.appendChild(input);
    this.importInput = input;
    input.click();
  }

  private handleImportFileChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.cleanupImportInput();
    if (!file) {
      return;
    }
    const reader = new FileReader();
    this.activeImportReader = reader;
    reader.onload = () => {
      if (this.activeImportReader !== reader) {
        return;
      }
      this.activeImportReader = undefined;
      this.importRawSave(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => {
      if (this.activeImportReader !== reader) {
        return;
      }
      this.activeImportReader = undefined;
      this.showMenuMessage("IMPORT FAILED", "error");
    };
    reader.readAsText(file);
  }

  private importRawSave(raw: string | null): void {
    const validation = validateImportedSaveBlob(raw);
    if (!validation.ok) {
      this.showMenuMessage("SAVE FILE INVALID", "error");
      return;
    }
    if (!this.saveSlots?.saveToSlot(this.saveSlot, validation.blob)) {
      this.showMenuMessage("IMPORT FAILED", "error");
      return;
    }
    this.refreshSaveMenuState("CONTINUE");
    this.showMenuMessage("SAVE IMPORTED");
  }

  private refreshSaveMenuState(preferredLabel?: string): void {
    this.continueTarget = this.refreshContinueTarget?.() ?? this.continueTarget;
    this.hasSave = this.continueTarget !== null;
    if (this.phase === "menu") {
      this.buildMenu(preferredLabel);
    }
  }

  private showMenuMessage(message: string, tone: "default" | "error" = "default"): void {
    this.menuMessageTimer?.remove(false);
    this.menuMessageTimer = undefined;
    const { panelY, panelW } = this.menuLayout();
    const y = Math.max(18, panelY - 14);
    if (!this.menuMessage) {
      this.menuMessage = createCleanText(this, this.scale.width / 2, y, message, {
        fontSize: 14,
        fixedWidth: panelW + 48,
        align: "center"
      })
        .setOrigin(0.5, 1)
        .setDepth(23)
        .setShadow(0, 2, "#000000", 4);
    }
    this.menuMessage
      .setText(message)
      .setPosition(this.scale.width / 2, y)
      .setColor(tone === "error" ? "#fca5a5" : CLEAN_UI_PRIMARY)
      .setVisible(true)
      .setAlpha(1);
    this.menuMessageTimer = this.time.delayedCall(MENU_MESSAGE_MS, () => {
      this.menuMessage?.setVisible(false);
      this.menuMessageTimer = undefined;
    });
  }

  private clearMenuMessage(destroy = false): void {
    this.menuMessageTimer?.remove(false);
    this.menuMessageTimer = undefined;
    if (destroy) {
      this.menuMessage?.destroy();
      this.menuMessage = undefined;
      return;
    }
    this.menuMessage?.setVisible(false);
  }

  private cleanupDomSaveControls(): void {
    this.cleanupImportInput();
    this.abortImportReader();
    if (typeof URL !== "undefined") {
      for (const url of this.exportObjectUrls) {
        URL.revokeObjectURL(url);
      }
    }
    this.exportObjectUrls.clear();
  }

  private cleanupImportInput(): void {
    this.importInput?.removeEventListener("change", this.importFileChangeInput);
    this.importInput?.remove();
    this.importInput = undefined;
  }

  private abortImportReader(): void {
    const reader = this.activeImportReader;
    if (!reader) {
      return;
    }
    reader.onload = null;
    reader.onerror = null;
    if (reader.readyState === FileReader.LOADING) {
      reader.abort();
    }
    this.activeImportReader = undefined;
  }

  private revokeExportObjectUrl(url: string): void {
    if (!this.exportObjectUrls.delete(url)) {
      return;
    }
    if (typeof URL === "undefined") {
      return;
    }
    URL.revokeObjectURL(url);
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

function saturatedStaticPixel(): { r: number; g: number; b: number } {
  const hot = 210 + Math.floor(Math.random() * 46);
  const mid = 40 + Math.floor(Math.random() * 176);
  const cold = Math.floor(Math.random() * 36);
  switch (Math.floor(Math.random() * 6)) {
    case 0:
      return { r: hot, g: mid, b: cold };
    case 1:
      return { r: hot, g: cold, b: mid };
    case 2:
      return { r: mid, g: hot, b: cold };
    case 3:
      return { r: cold, g: hot, b: mid };
    case 4:
      return { r: mid, g: cold, b: hot };
    default:
      return { r: cold, g: mid, b: hot };
  }
}

function saveExportFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `swagbound-save-${year}-${month}-${day}.json`;
}
