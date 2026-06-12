import Phaser from "phaser";
import type { WorldNpc, WorldRegion } from "@eb/schemas";
import {
  buildDialogueForReference,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  resolveStatus,
  TARGET_REFERENCE,
  type GameData
} from "./loader";
import { DialogueController, publishDebug, type DebugNpc, type FirstSceneDebug } from "./state";

export const PLAYER_SPEED = 110; // world pixels per second
export const INTERACTION_DISTANCE = 28; // world pixels between feet positions
const WALK_FRAME_MS = 150;

/**
 * Frame layout of CoilSnake sprite-group sheets (4 columns of 16x24 frames):
 * two walk frames per facing — up, down, left, right, then diagonals.
 * Verified visually against the locally rendered sheets (groups 1 and 5).
 */
const DIRECTION_FRAMES: Record<string, [number, number]> = {
  up: [0, 1],
  down: [2, 3],
  left: [4, 5],
  right: [6, 7]
};

type NpcRuntime = {
  data: WorldNpc;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

export class WorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldRegion;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerFrames: [number, number] = DIRECTION_FRAMES.down;
  private facing: "up" | "down" | "left" | "right" = "down";
  private walkClock = 0;
  private moving = false;
  private npcRuntimes: NpcRuntime[] = [];
  private solidRows: string[] = [];
  private collisionCellSize = 8;
  private collisionWidth = 0;
  private collisionHeight = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  readonly dialogue = new DialogueController();
  targetReference = TARGET_REFERENCE;
  prompt = "";
  assetsLoaded = false;
  debugPanelVisible = false;

  constructor() {
    super("world");
  }

  init(data: { gameData: GameData }): void {
    this.data_ = data.gameData;
    this.world_ = data.gameData.world as WorldRegion;
  }

  preload(): void {
    const world = this.world_;
    if (world.images) {
      this.load.image("world-bg", `/generated/${world.images.background}`);
      this.load.image("world-fg", `/generated/${world.images.foreground}`);
    }
    for (const sheet of this.data_.sprites?.sheets ?? []) {
      this.load.spritesheet(`sheet-${sheet.groupId}`, `/generated/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight
      });
    }
  }

  create(): void {
    const world = this.world_;
    this.assetsLoaded = this.textures.exists("world-bg");

    if (!this.assetsLoaded) {
      // Asset files missing although world.json was valid: degrade gracefully.
      this.scene.start("fallback", { gameData: this.data_, reason: "world assets missing" });
      return;
    }

    this.cameras.main.setBackgroundColor("#000000");
    this.add.image(0, 0, "world-bg").setOrigin(0, 0).setDepth(0);
    if (this.textures.exists("world-fg")) {
      // Foreground (high-priority minitiles) renders above all actors.
      this.add.image(0, 0, "world-fg").setOrigin(0, 0).setDepth(100000);
    }

    if (world.collision) {
      this.solidRows = world.collision.solidRows;
      this.collisionCellSize = world.collision.cellSize;
      this.collisionWidth = world.collision.width;
      this.collisionHeight = world.collision.height;
    }

    this.targetReference = chooseReference(this.data_);

    for (const npc of world.npcs) {
      if (!npc.visible) {
        continue;
      }
      this.npcRuntimes.push({ data: npc, sprite: this.spawnActor(npc.regionPixel.x, npc.regionPixel.y, npc.spriteGroup, npc.direction ?? "down") });
    }

    const spawn = world.player?.spawnRegionPixel ?? { x: 64, y: 64 };
    this.player = this.spawnActor(spawn.x, spawn.y, world.player?.spriteGroup, "down");

    const width = world.region?.widthPixels ?? 1024;
    const height = world.region?.heightPixels ?? 1024;
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on("keydown-SPACE", () => this.handleAdvance());
    this.input.keyboard?.on("keydown-ENTER", () => this.handleAdvance());
    this.input.keyboard?.on("keydown-ESC", () => this.closeDialogue());
    this.input.keyboard?.on("keydown-BACKSPACE", () => this.closeDialogue());
    this.input.keyboard?.on("keydown-F1", () => {
      this.debugPanelVisible = !this.debugPanelVisible;
    });

    this.scene.launch("ui", { worldSceneKey: "world" });
    this.publish();
  }

  private spawnActor(
    x: number,
    y: number,
    spriteGroup: number | undefined,
    direction: string
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const key = spriteGroup !== undefined ? `sheet-${spriteGroup}` : undefined;
    if (key && this.textures.exists(key)) {
      const frames = DIRECTION_FRAMES[direction] ?? DIRECTION_FRAMES.down;
      const sprite = this.add.sprite(x, y, key, frames[0]);
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(y);
      return sprite;
    }
    const placeholder = this.add.rectangle(x, y - 12, 16, 24, 0x9aa7b8).setStrokeStyle(1, 0xe2e8f0);
    placeholder.setOrigin(0.5, 0.5);
    placeholder.setDepth(y);
    return placeholder;
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    if (!this.dialogue.open) {
      this.movePlayer(delta);
    } else {
      this.moving = false;
    }
    this.animatePlayer(delta);
    this.player.setDepth(this.player.y);
    this.updatePrompt();
    this.publish();
  }

  private movePlayer(delta: number): void {
    const player = this.player as Phaser.GameObjects.Sprite;
    const left = this.cursors?.left?.isDown || this.keys?.A?.isDown;
    const right = this.cursors?.right?.isDown || this.keys?.D?.isDown;
    const up = this.cursors?.up?.isDown || this.keys?.W?.isDown;
    const down = this.cursors?.down?.isDown || this.keys?.S?.isDown;

    let dx = (right ? 1 : 0) - (left ? 1 : 0);
    let dy = (down ? 1 : 0) - (up ? 1 : 0);
    this.moving = dx !== 0 || dy !== 0;
    if (!this.moving) {
      return;
    }

    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }
    const step = (PLAYER_SPEED * delta) / 1000;

    // Facing follows the dominant axis.
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      this.facing = dx > 0 ? "right" : "left";
    } else if (dy !== 0) {
      this.facing = dy > 0 ? "down" : "up";
    }
    this.playerFrames = DIRECTION_FRAMES[this.facing];

    const width = this.world_.region?.widthPixels ?? 0;
    const height = this.world_.region?.heightPixels ?? 0;
    const tryX = Phaser.Math.Clamp(player.x + dx * step, 8, width - 8);
    if (!this.blocked(tryX, player.y)) {
      player.x = tryX;
    }
    const tryY = Phaser.Math.Clamp(player.y + dy * step, 12, height - 1);
    if (!this.blocked(player.x, tryY)) {
      player.y = tryY;
    }
  }

  /** Feet-box collision against the imported surface grid plus NPC bodies. */
  private blocked(x: number, y: number): boolean {
    const corners: Array<[number, number]> = [
      [x - 7, y - 10],
      [x + 6, y - 10],
      [x - 7, y - 1],
      [x + 6, y - 1]
    ];
    for (const [px, py] of corners) {
      const cx = Math.floor(px / this.collisionCellSize);
      const cy = Math.floor(py / this.collisionCellSize);
      if (cx < 0 || cy < 0 || cx >= this.collisionWidth || cy >= this.collisionHeight) {
        return true;
      }
      if (this.solidRows[cy]?.[cx] === "1") {
        return true;
      }
    }
    for (const npc of this.npcRuntimes) {
      const nx = npc.data.regionPixel.x;
      const ny = npc.data.regionPixel.y;
      if (Math.abs(x - nx) < 14 && y > ny - 18 && y < ny + 10) {
        return true;
      }
    }
    return false;
  }

  private animatePlayer(delta: number): void {
    const player = this.player;
    if (!player || !(player instanceof Phaser.GameObjects.Sprite)) {
      return;
    }
    if (this.moving) {
      this.walkClock += delta;
      const frame = this.playerFrames[Math.floor(this.walkClock / WALK_FRAME_MS) % 2];
      player.setFrame(frame);
    } else {
      this.walkClock = 0;
      player.setFrame(this.playerFrames[0]);
    }
  }

  private tutorialNpc(): NpcRuntime | undefined {
    return this.npcRuntimes.find((npc) => npc.data.npcId === 744) ?? this.npcRuntimes.find((npc) => npc.data.interactable);
  }

  private distanceToTutorialNpc(): number | undefined {
    const npc = this.tutorialNpc();
    if (!npc || !this.player) {
      return undefined;
    }
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.data.regionPixel.x, npc.data.regionPixel.y);
  }

  private inRange(): boolean {
    const distance = this.distanceToTutorialNpc();
    return distance !== undefined && distance < INTERACTION_DISTANCE;
  }

  private updatePrompt(): void {
    if (this.dialogue.open) {
      this.prompt = "Space/Enter: advance | Esc/Backspace: close";
    } else if (this.inRange()) {
      this.prompt = "Space/Enter: talk to the imported script marker";
    } else {
      this.prompt = "Move with Arrow keys/WASD. Approach the robot to talk.";
    }
  }

  handleAdvance(): void {
    if (!this.dialogue.open) {
      if (this.inRange() && this.dialogue.canOpen()) {
        this.openDialogue();
      }
      return;
    }
    this.dialogue.advance();
    this.publish();
  }

  private openDialogue(): void {
    const npc = this.tutorialNpc();
    const reference = npc?.data.textPointer && npc.data.npcId === 744 ? npc.data.textPointer : this.targetReference;
    this.dialogue.start(buildDialogueForReference(this.data_.scripts, reference));
    this.updatePrompt();
    this.publish();
  }

  closeDialogue(): void {
    if (!this.dialogue.open) {
      return;
    }
    this.dialogue.close();
    this.updatePrompt();
    this.publish();
  }

  statusLines(): string[] {
    return buildStatusLines(this.data_);
  }

  metadataLines(): string[] {
    return buildMetadataLines(this.data_);
  }

  private publish(): void {
    const world = this.world_;
    const npc744 = this.tutorialNpc();
    const distance = this.distanceToTutorialNpc();
    const npcs: DebugNpc[] = world.npcs.map((npc) => ({
      id: npc.npcId,
      x: npc.regionPixel.x,
      y: npc.regionPixel.y,
      interactable: npc.interactable,
      visible: npc.visible
    }));
    const state: FirstSceneDebug = {
      mode: "world",
      dialogueOpen: this.dialogue.open,
      dialogueText: this.dialogue.open ? this.dialogue.currentText : this.dialogue.pages[this.dialogue.pageIndex]?.text ?? "",
      dialoguePageIndex: this.dialogue.pageIndex,
      dialoguePageCount: this.dialogue.pages.length,
      targetReference: this.targetReference,
      player: this.player ? { x: this.player.x, y: this.player.y } : undefined,
      npc: npc744 ? { x: npc744.data.regionPixel.x, y: npc744.data.regionPixel.y } : undefined,
      npcs,
      prompt: this.prompt,
      facing: this.facing,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: {
        minX: 8,
        maxX: (world.region?.widthPixels ?? 0) - 8,
        minY: 12,
        maxY: (world.region?.heightPixels ?? 0) - 1
      },
      statusLines: this.statusLines(),
      metadataLines: this.metadataLines(),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      dialogueCounters: { opens: this.dialogue.opens, advances: this.dialogue.advances, closes: this.dialogue.closes },
      world: {
        available: world.available,
        originTile: world.region?.originTile,
        widthPixels: world.region?.widthPixels,
        heightPixels: world.region?.heightPixels,
        npcCount: world.counts.npcs,
        visibleNpcCount: world.counts.visibleNpcs,
        assetsLoaded: this.assetsLoaded,
        npc744WorldPixel: world.npcs.find((npc) => npc.npcId === 744)?.worldPixel,
        playerSpawn: world.player?.spawnRegionPixel
      }
    };
    publishDebug(state);
  }
}
