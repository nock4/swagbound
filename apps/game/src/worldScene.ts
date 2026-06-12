import Phaser from "phaser";
import type { SpriteSheet, WorldNpc, WorldRegion } from "@eb/schemas";
import {
  buildDialogueForReference,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  resolveStatus,
  TARGET_REFERENCE,
  type GameData
} from "./loader";
import {
  CANONICAL_DIRECTION_FRAMES,
  createPlayerState,
  findInteractionTarget,
  lockPlayer,
  nearestInteractable,
  stepPlayer,
  toFacing,
  unlockPlayer,
  type DirectionFrames,
  type InteractionCandidate,
  type MoveInput,
  type PlayerState
} from "./playerController";
import { DialogueController, publishDebug, type DebugNpc, type FirstSceneDebug } from "./state";

export const PLAYER_SPEED = 110; // world pixels per second
export const INTERACTION_DISTANCE = 28; // world pixels between feet positions

type NpcRuntime = {
  data: WorldNpc;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

export class WorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldRegion;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerState!: PlayerState;
  private playerFrames: DirectionFrames = CANONICAL_DIRECTION_FRAMES;
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
      this.npcRuntimes.push({
        data: npc,
        sprite: this.spawnActor(npc.regionPixel.x, npc.regionPixel.y, npc.spriteGroup, npc.direction)
      });
    }

    const spawn = world.player?.spawnRegionPixel ?? { x: 64, y: 64 };
    this.playerFrames = this.framesForGroup(world.player?.spriteGroup);
    this.playerState = createPlayerState(spawn.x, spawn.y, "down", this.playerFrames);
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

  /** Walk-frame mapping for a sprite group: generated metadata, else canonical. */
  private framesForGroup(spriteGroup: number | undefined): DirectionFrames {
    const sheet: SpriteSheet | undefined = this.data_.sprites?.sheets.find((item) => item.groupId === spriteGroup);
    const animations = sheet?.animations;
    if (animations?.up && animations.right && animations.down && animations.left) {
      return {
        up: animations.up,
        right: animations.right,
        down: animations.down,
        left: animations.left
      };
    }
    return CANONICAL_DIRECTION_FRAMES;
  }

  private spawnActor(
    x: number,
    y: number,
    spriteGroup: number | undefined,
    direction: string | undefined
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const key = spriteGroup !== undefined ? `sheet-${spriteGroup}` : undefined;
    if (key && this.textures.exists(key)) {
      const frames = this.framesForGroup(spriteGroup);
      const sprite = this.add.sprite(x, y, key, frames[toFacing(direction)][0]);
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
    // Dialogue owns the input: freeze movement and animation while open.
    if (this.dialogue.open && !this.playerState.inputLocked) {
      lockPlayer(this.playerState, this.playerFrames);
    } else if (!this.dialogue.open && this.playerState.inputLocked) {
      unlockPlayer(this.playerState);
    }

    stepPlayer(this.playerState, this.readInput(), {
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y),
      frames: this.playerFrames
    });

    this.player.x = this.playerState.x;
    this.player.y = this.playerState.y;
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.player.setFrame(this.playerState.animFrame);
    }
    this.player.setDepth(this.player.y);
    this.updatePrompt();
    this.publish();
  }

  private readInput(): MoveInput {
    return {
      left: Boolean(this.cursors?.left?.isDown || this.keys?.A?.isDown),
      right: Boolean(this.cursors?.right?.isDown || this.keys?.D?.isDown),
      up: Boolean(this.cursors?.up?.isDown || this.keys?.W?.isDown),
      down: Boolean(this.cursors?.down?.isDown || this.keys?.S?.isDown)
    };
  }

  private movementBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const width = this.world_.region?.widthPixels ?? 0;
    const height = this.world_.region?.heightPixels ?? 0;
    return { minX: 8, maxX: width - 8, minY: 12, maxY: height - 1 };
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

  private interactionCandidates(): InteractionCandidate[] {
    return this.npcRuntimes.map((npc) => ({
      id: npc.data.npcId,
      x: npc.data.regionPixel.x,
      y: npc.data.regionPixel.y,
      interactable: npc.data.interactable
    }));
  }

  /** The NPC the player is currently facing and close enough to talk to. */
  private interactionTarget(): InteractionCandidate | undefined {
    return findInteractionTarget(this.playerState, this.interactionCandidates(), {
      maxDistance: INTERACTION_DISTANCE
    })?.candidate;
  }

  private tutorialNpc(): NpcRuntime | undefined {
    return this.npcRuntimes.find((npc) => npc.data.npcId === 744) ?? this.npcRuntimes.find((npc) => npc.data.interactable);
  }

  private distanceToTutorialNpc(): number | undefined {
    const npc = this.tutorialNpc();
    if (!npc || !this.player) {
      return undefined;
    }
    return Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, npc.data.regionPixel.x, npc.data.regionPixel.y);
  }

  /** Radius-only proximity (facing not required) — used for prompts/debug. */
  private inRange(): boolean {
    return Boolean(nearestInteractable(this.playerState, this.interactionCandidates(), INTERACTION_DISTANCE));
  }

  private updatePrompt(): void {
    if (this.dialogue.open) {
      this.prompt = "Space/Enter: advance | Esc/Backspace: close";
    } else if (this.interactionTarget()) {
      this.prompt = "Space/Enter: talk to the robot";
    } else if (this.inRange()) {
      this.prompt = "Turn toward the robot, then press Space/Enter";
    } else {
      this.prompt = "Move with Arrow keys/WASD. Approach the robot to talk.";
    }
  }

  handleAdvance(): void {
    if (!this.dialogue.open) {
      if (this.interactionTarget() && this.dialogue.canOpen()) {
        this.openDialogue();
      }
      return;
    }
    this.dialogue.advance();
    if (!this.dialogue.open) {
      // Advancing past the last page closed the dialogue: release the lock
      // here (not in the next update tick) so the published state never shows
      // dialogueOpen=false with inputLocked=true.
      unlockPlayer(this.playerState);
    }
    this.publish();
  }

  private openDialogue(): void {
    const target = this.interactionTarget();
    const npc = this.npcRuntimes.find((runtime) => runtime.data.npcId === target?.id) ?? this.tutorialNpc();
    const pointer = npc?.data.textPointer;
    const reference = pointer && /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/.test(pointer) ? pointer : this.targetReference;
    this.dialogue.start(buildDialogueForReference(this.data_.scripts, reference));
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  closeDialogue(): void {
    if (!this.dialogue.open) {
      return;
    }
    this.dialogue.close();
    unlockPlayer(this.playerState);
    this.updatePrompt();
    this.publish();
  }

  statusLines(): string[] {
    return buildStatusLines(this.data_);
  }

  metadataLines(): string[] {
    return buildMetadataLines(this.data_);
  }

  /** Live controller state for the hidden F1 panel. */
  runtimeLines(): string[] {
    const state = this.playerState;
    return [
      "Player Runtime",
      `facing: ${state.facing} | moving: ${state.moving} | locked: ${state.inputLocked}`,
      `anim: ${state.animKey} frame ${state.animFrame}`,
      `feet: ${Math.round(state.x)},${Math.round(state.y)} | target: ${this.interactionTarget()?.id ?? "none"}`
    ];
  }

  private publish(): void {
    const world = this.world_;
    const npc744 = this.tutorialNpc();
    const distance = this.distanceToTutorialNpc();
    const target = this.interactionTarget();
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
      player: this.player ? { x: this.playerState.x, y: this.playerState.y } : undefined,
      npc: npc744 ? { x: npc744.data.regionPixel.x, y: npc744.data.regionPixel.y } : undefined,
      npcs,
      prompt: this.prompt,
      facing: this.playerState.facing,
      moving: this.playerState.moving,
      animKey: this.playerState.animKey,
      animFrame: this.playerState.animFrame,
      inputLocked: this.playerState.inputLocked,
      canInteract: Boolean(target),
      interactionTargetId: target?.id,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: this.movementBounds(),
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
