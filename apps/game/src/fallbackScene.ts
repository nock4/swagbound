import Phaser from "phaser";
import {
  buildDialogueForReference,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  resolveStatus,
  statusPanelTitle,
  type GameData
} from "./loader";
import { DialogueController, publishDebug, type FirstSceneDebug } from "./state";
import { textSpeedCpsFromSearch } from "./dialogueRenderer";
import { activeWindowFlavorId } from "./windowSettings";
import { CANCEL_KEY_NAMES, CONFIRM_KEY_NAMES, registerDiscreteKeys } from "./inputModel";

const MONO = "Menlo, Consolas, monospace";
const INTERACTION_DISTANCE = 128;

/**
 * Primitive bounded scene used only when world.json (or its assets) are
 * unavailable. Keeps a minimal observable scene so the app never hard-fails.
 */
export class FallbackScene extends Phaser.Scene {
  private data_!: GameData;
  private reason = "world data unavailable";
  private player?: Phaser.GameObjects.Rectangle;
  private npcMarker?: Phaser.GameObjects.Arc;
  private promptText?: Phaser.GameObjects.Text;
  private dialogueText?: Phaser.GameObjects.Text;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly dialogue = new DialogueController();
  private targetReference = "robot.hello_world";

  constructor() {
    super("fallback");
  }

  init(data: { gameData: GameData; reason?: string }): void {
    this.data_ = data.gameData;
    this.reason = data.reason ?? "world data unavailable";
  }

  create(): void {
    const width = this.scale.width;
    this.dialogue.setTextSpeedCps(textSpeedCpsFromSearch(globalThis.location?.search));
    this.cameras.main.setBackgroundColor("#10141b");
    this.targetReference = chooseReference(this.data_);

    const graphics = this.add.graphics();
    graphics.fillStyle(0x16202c, 1);
    graphics.fillRoundedRect(24, 64, width - 48, 240, 8);
    graphics.lineStyle(2, 0x4b6478, 0.8);
    graphics.strokeRoundedRect(24, 64, width - 48, 240, 8);

    this.add.text(24, 14, statusPanelTitle(this.data_), {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc"
    });
    this.add.text(24, 36, `World render unavailable (${this.reason}). Showing placeholder field.`, {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#fbbf24"
    });

    this.player = this.add.rectangle(96, 184, 18, 22, 0x7dd3fc).setStrokeStyle(2, 0xe0f2fe);
    this.npcMarker = this.add.circle(width - 120, 184, 14, 0xfacc15).setStrokeStyle(3, 0xfef3c7);

    this.promptText = this.add.text(24, 316, "", {
      fontFamily: MONO,
      fontSize: "12px",
      color: "#e5e7eb"
    });
    this.dialogueText = this.add.text(36, 360, "", {
      fontFamily: MONO,
      fontSize: "13px",
      color: "#ffffff",
      lineSpacing: 5,
      wordWrap: { width: width - 96 }
    });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.handleAdvance());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.closeDialogue());
    this.publish();
  }

  update(_: number, delta: number): void {
    if (!this.player || this.dialogue.open) {
      this.dialogueText?.setText(this.dialogue.open ? this.dialogue.revealedText : "");
      this.publish();
      return;
    }
    const speed = 160 * (delta / 1000);
    const left = this.cursors?.left?.isDown || this.keys?.A?.isDown;
    const right = this.cursors?.right?.isDown || this.keys?.D?.isDown;
    const up = this.cursors?.up?.isDown || this.keys?.W?.isDown;
    const down = this.cursors?.down?.isDown || this.keys?.S?.isDown;
    this.player.x = Phaser.Math.Clamp(this.player.x + (right ? speed : 0) - (left ? speed : 0), 44, this.scale.width - 44);
    this.player.y = Phaser.Math.Clamp(this.player.y + (down ? speed : 0) - (up ? speed : 0), 88, 284);
    this.publish();
  }

  private distance(): number | undefined {
    if (!this.player || !this.npcMarker) {
      return undefined;
    }
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npcMarker.x, this.npcMarker.y);
  }

  private inRange(): boolean {
    const distance = this.distance();
    return distance !== undefined && distance < INTERACTION_DISTANCE;
  }

  private handleAdvance(): void {
    if (!this.dialogue.open) {
      if (this.inRange() && this.dialogue.canOpen()) {
        this.dialogue.start(buildDialogueForReference(this.data_.scripts, this.targetReference));
      }
      this.render();
      return;
    }
    this.dialogue.advance();
    this.render();
  }

  private closeDialogue(): void {
    this.dialogue.close();
    this.render();
  }

  private render(): void {
    this.dialogueText?.setText(this.dialogue.open ? this.dialogue.revealedText : "");
    this.publish();
  }

  private publish(): void {
    const distance = this.distance();
    this.promptText?.setText(this.dialogue.open
      ? "Z: advance | X: close"
      : this.inRange()
        ? "Z: talk"
        : "Move: Arrows/WASD. Approach someone, then press Z.");
    const state: FirstSceneDebug = {
      mode: "fallback",
      dialogueOpen: this.dialogue.open,
      dialogueText: this.dialogue.currentText,
      dialoguePageIndex: this.dialogue.pageIndex,
      dialoguePageCount: this.dialogue.pages.length,
      revealComplete: this.dialogue.revealComplete,
      revealedText: this.dialogue.open ? this.dialogue.revealedText : "",
      targetReference: this.targetReference,
      player: this.player ? { x: this.player.x, y: this.player.y } : undefined,
      npc: this.npcMarker ? { x: this.npcMarker.x, y: this.npcMarker.y } : undefined,
      prompt: this.promptText?.text ?? "",
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: { minX: 44, maxX: this.scale.width - 44, minY: 88, maxY: 284 },
      statusLines: buildStatusLines(this.data_),
      metadataLines: buildMetadataLines(this.data_),
      fontLoaded: Boolean(this.data_.font),
      ...(this.data_.font ? { primaryFontId: this.data_.font.primaryFontId } : {}),
      windowLoaded: Boolean(this.data_.window),
      ...(this.data_.window ? {
        defaultFlavorId: this.data_.window.defaultFlavorId,
        activeFlavorId: activeWindowFlavorId(this.data_.window)
      } : {}),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      world: this.data_.world
        ? {
            available: this.data_.world.available,
            npcCount: this.data_.world.counts.npcs,
            visibleNpcCount: this.data_.world.counts.visibleNpcs,
            assetsLoaded: false
          }
        : undefined
    };
    publishDebug(state);
  }
}
