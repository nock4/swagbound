import Phaser from "phaser";
import { isNpcVisibleForEventFlags, type ItemData, type SpriteSheet, type WorldChunked, type WorldChunkedNpc } from "@eb/schemas";
import { resolveDoorTrigger, type DoorTriggerState } from "./doorTriggers";
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
  ACTIVE_CHUNK_RADIUS,
  RETAIN_CHUNK_RADIUS,
  chunkForWorldPixel,
  chunkKey,
  chunkPixelSize,
  chunkRing,
  shouldDespawnForChunk,
  shouldSpawnForChunk,
  type ChunkCoord,
  type ChunkGrid
} from "./chunkStreaming";
import { interactionEvents, type GameEvent } from "./eventRunner";
import { RuntimeEventHost, RuntimeEventSequence, type EventWarpDestination } from "./eventHost";
import { GameFlags } from "./gameFlags";
import { behaviorForNpc } from "./npcBehaviors";
import {
  createNpcState,
  facingToward,
  stepNpc,
  type NpcRuntimeState
} from "./npcController";
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
  type Facing,
  type InteractionCandidate,
  type MoveInput,
  type PlayerState
} from "./playerController";
import { PLAYER_SPEED, INTERACTION_DISTANCE } from "./worldScene";
import { DialogueController, publishDebug, type DebugNpc, type FirstSceneDebug } from "./state";
import { createDialogueResolver, textSpeedCpsFromSearch } from "./dialogueRenderer";
import { PartyState } from "./partyState";
import {
  applySaveState,
  captureSaveState,
  serializeSaveState,
  type SavePlayerSnapshot,
  type SaveSlotPersistence,
  type SaveState
} from "./saveState";
import {
  buildMenuScreens,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  menuRenderStack,
  moveMenu,
  openMenu,
  parseMenuAction,
  MAIN_MENU_ID,
  type MenuDebugState,
  type MenuRenderScreen,
  type MenuScreen,
  type MenuState
} from "./menuModel";
import { buildPartyMember, type PartyMember } from "./characterModel";

type ChunkLayer = "background" | "foreground";
type WorldChunk = WorldChunked["chunks"][number];

type StreamedChunk = {
  chunk: WorldChunk;
  background?: Phaser.GameObjects.Image;
  foreground?: Phaser.GameObjects.Image;
};

type NpcPlacement = {
  key: string;
  data: WorldChunkedNpc;
  chunk: ChunkCoord;
};

type NpcRuntime = {
  key: string;
  data: WorldChunkedNpc;
  state: NpcRuntimeState;
  frames: DirectionFrames;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

type ActiveNpcDialogue = {
  key: string;
  id: number;
  restoreFacing: Facing;
};

type BlockedOptions = {
  ignoreNpcId?: number;
  includePlayer?: boolean;
  includeNpcs?: boolean;
};

export class ChunkedWorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldChunked;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerState!: PlayerState;
  private playerFrames: DirectionFrames = CANONICAL_DIRECTION_FRAMES;
  private npcPlacementsByChunk = new Map<string, NpcPlacement[]>();
  private npcRuntimes = new Map<string, NpcRuntime>();
  private activeNpcDialogue?: ActiveNpcDialogue;
  private chunkByKey = new Map<string, WorldChunk>();
  private chunkObjects = new Map<string, StreamedChunk>();
  private loadingTextureKeys = new Set<string>();
  private loadingSheetGroups = new Set<number>();
  private currentChunk?: ChunkCoord;
  private solidRows: string[] = [];
  private collisionCellSize = 8;
  private collisionWidth = 0;
  private collisionHeight = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doorTriggerState: DoorTriggerState = { suppressUntilClear: false };
  private lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  readonly dialogue = new DialogueController();
  private readonly gameFlags = new GameFlags();
  private readonly partyState = new PartyState();
  private menuState: MenuState = closedMenu();
  private menuScreens = new Map<string, MenuScreen>();
  private eventSequence?: RuntimeEventSequence;
  private bootSaveState?: SaveState;
  private saveSlot = 0;
  private saveSlots?: SaveSlotPersistence;
  private hasSave = false;
  private lastSavedAt?: string;
  private restoredFromSave = false;
  targetReference = TARGET_REFERENCE;
  prompt = "";
  assetsLoaded = false;
  debugPanelVisible = false;

  constructor() {
    super("chunked-world");
  }

  init(data: {
    gameData: GameData;
    saveState?: SaveState | null;
    saveSlot?: number;
    saveSlots?: SaveSlotPersistence;
  }): void {
    this.data_ = data.gameData;
    this.world_ = data.gameData.world as WorldChunked;
    this.bootSaveState = data.saveState ?? undefined;
    this.saveSlot = Number.isInteger(data.saveSlot) && (data.saveSlot as number) >= 0 ? data.saveSlot as number : 0;
    this.saveSlots = data.saveSlots;
    this.hasSave = Boolean(this.bootSaveState) || Boolean(this.saveSlots?.hasSave(this.saveSlot));
    this.lastSavedAt = this.bootSaveState?.savedAt;
    this.restoredFromSave = false;
  }

  preload(): void {
    const playerSheet = this.sheetForGroup(this.world_.player.spriteGroup);
    if (playerSheet) {
      this.load.spritesheet(`sheet-${playerSheet.groupId}`, `/generated/${playerSheet.file}`, {
        frameWidth: playerSheet.frameWidth,
        frameHeight: playerSheet.frameHeight
      });
    }
  }

  create(): void {
    const world = this.world_;
    this.dialogue.setTextSpeedCps(textSpeedCpsFromSearch(globalThis.location?.search));
    this.dialogue.setResolver(createDialogueResolver(this.data_));
    this.assetsLoaded = world.chunks.some((chunk) => Boolean(chunk.background || chunk.foreground));
    if (!this.assetsLoaded) {
      this.scene.start("fallback", { gameData: this.data_, reason: "full-world chunk assets missing" });
      return;
    }

    this.cameras.main.setBackgroundColor("#000000");
    this.targetReference = chooseReference(this.data_);
    this.configureEventRuntime();
    this.indexChunks();
    this.indexNpcPlacements();

    this.solidRows = world.collision.solidRows;
    this.collisionCellSize = world.collision.cellSize;
    this.collisionWidth = world.collision.width;
    this.collisionHeight = world.collision.height;

    const restoredPlayer = this.applyInitialSave();
    const spawn = this.clampSpawn(restoredPlayer ?? this.parseSpawnOverride() ?? world.player.spawnWorldPixel);
    const playerFacing = restoredPlayer?.facing ?? "down";
    this.playerFrames = this.framesForGroup(world.player.spriteGroup);
    this.playerState = createPlayerState(spawn.x, spawn.y, playerFacing, this.playerFrames);
    this.player = this.spawnActor(spawn.x, spawn.y, world.player.spriteGroup, playerFacing);

    const bounds = this.movementBounds();
    this.cameras.main.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.refreshMenuScreens();
    this.input.keyboard?.on("keydown-M", () => this.openCommandMenu());
    this.input.keyboard?.on("keydown-UP", () => this.moveMenuCursor(-1));
    this.input.keyboard?.on("keydown-DOWN", () => this.moveMenuCursor(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.handleConfirm());
    this.input.keyboard?.on("keydown-ENTER", () => this.handleConfirm());
    this.input.keyboard?.on("keydown-ESC", () => this.handleCancel());
    this.input.keyboard?.on("keydown-BACKSPACE", () => this.handleCancel());
    this.input.keyboard?.on("keydown-P", () => this.handleSaveKey());
    this.input.keyboard?.on("keydown-F1", () => {
      this.debugPanelVisible = !this.debugPanelVisible;
    });

    this.load.on("filecomplete", (key: string) => {
      this.loadingTextureKeys.delete(key);
      const sheetGroup = this.groupIdFromSheetKey(key);
      if (sheetGroup !== undefined) {
        this.loadingSheetGroups.delete(sheetGroup);
        this.refreshNpcSprites();
      }
      this.materializeRetainedChunks();
      this.publish();
    });
    this.load.on("loaderror", (file: { key?: string }) => {
      if (file.key) {
        this.loadingTextureKeys.delete(file.key);
        const sheetGroup = this.groupIdFromSheetKey(file.key);
        if (sheetGroup !== undefined) {
          this.loadingSheetGroups.delete(sheetGroup);
        }
      }
    });

    this.refreshStreaming(true);
    this.updatePrompt();
    this.scene.launch("ui", { worldSceneKey: "chunked-world" });
    this.publish();
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    this.partyState.tickMeters(delta);
    if (this.menuState.open) {
      if (!this.playerState.inputLocked) {
        lockPlayer(this.playerState, this.playerFrames);
      }
      this.updatePrompt();
      this.publish();
      return;
    }
    this.stepNpcs(delta);
    this.eventSequence?.update(delta);

    const inputOwned = this.dialogue.open || Boolean(this.eventSequence?.running);
    if (inputOwned && !this.playerState.inputLocked) {
      lockPlayer(this.playerState, this.playerFrames);
    } else if (!inputOwned && this.playerState.inputLocked) {
      unlockPlayer(this.playerState);
    }

    stepPlayer(this.playerState, this.readInput(), {
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y, { includeNpcs: true }),
      frames: this.playerFrames
    });
    this.handleDoorTrigger();

    this.player.x = this.playerState.x;
    this.player.y = this.playerState.y;
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.player.setFrame(this.playerState.animFrame);
    }
    this.player.setDepth(this.player.y);
    this.refreshStreaming();
    this.updatePrompt();
    this.publish();
  }

  private grid(): ChunkGrid {
    return {
      mapWidthTiles: this.world_.mapWidthTiles,
      mapHeightTiles: this.world_.mapHeightTiles,
      tileSize: this.world_.tileSize,
      chunkSizeTiles: this.world_.chunkSizeTiles
    };
  }

  private indexChunks(): void {
    this.chunkByKey.clear();
    for (const chunk of this.world_.chunks) {
      this.chunkByKey.set(chunkKey(chunk), chunk);
    }
  }

  private indexNpcPlacements(): void {
    this.npcPlacementsByChunk.clear();
    this.world_.npcs.forEach((npc, index) => {
      const placement: NpcPlacement = {
        key: `${npc.npcId}:${index}:${npc.worldPixel.x}:${npc.worldPixel.y}`,
        data: npc,
        chunk: chunkForWorldPixel(npc.worldPixel, this.grid())
      };
      const key = chunkKey(placement.chunk);
      this.npcPlacementsByChunk.set(key, [...(this.npcPlacementsByChunk.get(key) ?? []), placement]);
    });
  }

  private refreshStreaming(force = false): void {
    const nextChunk = chunkForWorldPixel(this.playerState, this.grid());
    if (
      !force &&
      this.currentChunk &&
      this.currentChunk.cx === nextChunk.cx &&
      this.currentChunk.cy === nextChunk.cy
    ) {
      return;
    }
    this.currentChunk = nextChunk;
    this.requestActiveChunks(nextChunk);
    this.unloadChunksOutsideRetain(nextChunk);
    this.despawnHiddenNpcs();
    this.spawnNpcsForActiveChunks(nextChunk);
    this.despawnNpcsOutsideRetain(nextChunk);
  }

  private requestActiveChunks(center: ChunkCoord): void {
    let queued = false;
    for (const coord of chunkRing(center, ACTIVE_CHUNK_RADIUS, this.grid())) {
      queued = this.requestChunk(coord) || queued;
    }
    this.materializeRetainedChunks();
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }
  }

  private requestChunk(coord: ChunkCoord): boolean {
    const key = chunkKey(coord);
    const chunk = this.chunkByKey.get(key);
    if (!chunk || chunk.void) {
      return false;
    }
    if (!this.chunkObjects.has(key)) {
      this.chunkObjects.set(key, { chunk });
    }
    const backgroundQueued = this.requestLayer(chunk, "background");
    const foregroundQueued = this.requestLayer(chunk, "foreground");
    return backgroundQueued || foregroundQueued;
  }

  private requestLayer(chunk: WorldChunk, layer: ChunkLayer): boolean {
    const file = chunk[layer];
    if (!file) {
      return false;
    }
    const key = this.chunkTextureKey(chunk, layer);
    if (this.textures.exists(key) || this.loadingTextureKeys.has(key)) {
      return false;
    }
    this.loadingTextureKeys.add(key);
    this.load.image(key, `/generated/${file}`);
    return true;
  }

  private materializeRetainedChunks(): void {
    if (!this.currentChunk) {
      return;
    }
    for (const [key, streamed] of this.chunkObjects) {
      if (!this.isChunkRetained(streamed.chunk, this.currentChunk)) {
        continue;
      }
      this.materializeChunkLayer(key, streamed, "background");
      this.materializeChunkLayer(key, streamed, "foreground");
    }
  }

  private materializeChunkLayer(key: string, streamed: StreamedChunk, layer: ChunkLayer): void {
    if (streamed[layer] || !streamed.chunk[layer]) {
      return;
    }
    const textureKey = this.chunkTextureKey(streamed.chunk, layer);
    if (!this.textures.exists(textureKey)) {
      return;
    }
    const size = chunkPixelSize(this.grid());
    const image = this.add.image(streamed.chunk.cx * size, streamed.chunk.cy * size, textureKey)
      .setOrigin(0, 0)
      .setDepth(layer === "background" ? 0 : 100000);
    streamed[layer] = image;
    this.chunkObjects.set(key, streamed);
  }

  private unloadChunksOutsideRetain(center: ChunkCoord): void {
    for (const [key, streamed] of this.chunkObjects) {
      if (this.isChunkRetained(streamed.chunk, center)) {
        continue;
      }
      streamed.background?.destroy();
      streamed.foreground?.destroy();
      this.chunkObjects.delete(key);
    }
  }

  private isChunkRetained(chunk: WorldChunk, center: ChunkCoord): boolean {
    return Math.max(Math.abs(chunk.cx - center.cx), Math.abs(chunk.cy - center.cy)) <= RETAIN_CHUNK_RADIUS;
  }

  private chunkTextureKey(chunk: WorldChunk, layer: ChunkLayer): string {
    return `chunk-${layer}-${chunk.cx}-${chunk.cy}`;
  }

  private spawnNpcsForActiveChunks(center: ChunkCoord): void {
    let queued = false;
    for (const coord of chunkRing(center, ACTIVE_CHUNK_RADIUS, this.grid())) {
      for (const placement of this.npcPlacementsByChunk.get(chunkKey(coord)) ?? []) {
        if (
          this.npcRuntimes.has(placement.key) ||
          !this.isNpcVisible(placement.data) ||
          !shouldSpawnForChunk(placement.chunk, center)
        ) {
          continue;
        }
        queued = this.requestNpcSheet(placement.data.spriteGroup) || queued;
        this.npcRuntimes.set(placement.key, this.createNpcRuntime(placement));
      }
    }
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }
  }

  private despawnHiddenNpcs(): void {
    for (const [key, runtime] of this.npcRuntimes) {
      if (this.isNpcVisible(runtime.data)) {
        continue;
      }
      runtime.sprite?.destroy();
      this.npcRuntimes.delete(key);
      if (this.activeNpcDialogue?.key === key) {
        this.dialogue.close();
        this.eventSequence?.abort();
        unlockPlayer(this.playerState);
        this.activeNpcDialogue = undefined;
      }
    }
  }

  private despawnNpcsOutsideRetain(center: ChunkCoord): void {
    for (const [key, runtime] of this.npcRuntimes) {
      const coord = chunkForWorldPixel(runtime.data.worldPixel, this.grid());
      if (!shouldDespawnForChunk(coord, center)) {
        continue;
      }
      runtime.sprite?.destroy();
      this.npcRuntimes.delete(key);
      if (this.activeNpcDialogue?.key === key) {
        this.dialogue.close();
        this.eventSequence?.abort();
        unlockPlayer(this.playerState);
        this.activeNpcDialogue = undefined;
      }
    }
  }

  private createNpcRuntime(placement: NpcPlacement): NpcRuntime {
    const npc = placement.data;
    const frames = this.framesForGroup(npc.spriteGroup);
    const facing = toFacing(npc.direction);
    return {
      key: placement.key,
      data: npc,
      state: createNpcState(npc.worldPixel.x, npc.worldPixel.y, facing, behaviorForNpc(npc.npcId, npc.movement), frames),
      frames,
      sprite: this.spawnActor(npc.worldPixel.x, npc.worldPixel.y, npc.spriteGroup, npc.direction)
    };
  }

  private stepNpcs(deltaMs: number): void {
    for (const npc of this.npcRuntimes.values()) {
      stepNpc(npc.state, {
        deltaMs,
        bounds: this.movementBounds(),
        blocked: (x, y) => this.blocked(x, y, {
          ignoreNpcId: npc.data.npcId,
          includePlayer: true,
          includeNpcs: true
        }),
        frames: npc.frames
      });
      this.syncNpc(npc);
    }
  }

  private syncNpc(npc: NpcRuntime): void {
    const actor = npc.sprite;
    if (!actor) {
      return;
    }
    actor.x = npc.state.player.x;
    actor.y = npc.state.player.y;
    if (actor instanceof Phaser.GameObjects.Sprite) {
      actor.setFrame(npc.state.player.animFrame);
    }
    actor.setDepth(npc.state.player.y);
  }

  private refreshNpcSprites(): void {
    for (const npc of this.npcRuntimes.values()) {
      if (!npc.sprite || npc.sprite instanceof Phaser.GameObjects.Sprite || npc.data.spriteGroup === undefined) {
        continue;
      }
      const key = `sheet-${npc.data.spriteGroup}`;
      if (!this.textures.exists(key)) {
        continue;
      }
      npc.sprite.destroy();
      npc.sprite = this.spawnActor(npc.state.player.x, npc.state.player.y, npc.data.spriteGroup, npc.state.player.facing);
      this.syncNpc(npc);
    }
  }

  private requestNpcSheet(spriteGroup: number | undefined): boolean {
    if (spriteGroup === undefined || this.textures.exists(`sheet-${spriteGroup}`) || this.loadingSheetGroups.has(spriteGroup)) {
      return false;
    }
    const sheet = this.sheetForGroup(spriteGroup);
    if (!sheet) {
      return false;
    }
    this.loadingSheetGroups.add(spriteGroup);
    this.load.spritesheet(`sheet-${spriteGroup}`, `/generated/${sheet.file}`, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight
    });
    return true;
  }

  private groupIdFromSheetKey(key: string): number | undefined {
    const match = /^sheet-(\d+)$/.exec(key);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  private sheetForGroup(spriteGroup: number | undefined): SpriteSheet | undefined {
    return this.data_.sprites?.sheets.find((item) => item.groupId === spriteGroup);
  }

  private framesForGroup(spriteGroup: number | undefined): DirectionFrames {
    const animations = this.sheetForGroup(spriteGroup)?.animations;
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

  private isNpcVisible(npc: Pick<WorldChunkedNpc, "showSprite" | "eventFlag">): boolean {
    return isNpcVisibleForEventFlags(npc.showSprite, npc.eventFlag, this.gameFlags);
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
    const placeholder = this.add.rectangle(x, y, 16, 24, 0x9aa7b8).setStrokeStyle(1, 0xe2e8f0);
    placeholder.setOrigin(0.5, 1);
    placeholder.setDepth(y);
    return placeholder;
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
    const width = this.world_.mapWidthTiles * this.world_.tileSize;
    const height = this.world_.mapHeightTiles * this.world_.tileSize;
    return { minX: 8, maxX: width - 8, minY: 12, maxY: height - 1 };
  }

  private blocked(x: number, y: number, options: BlockedOptions = {}): boolean {
    if (this.surfaceBlocked(x, y)) {
      return true;
    }
    if (options.includePlayer && this.player && this.actorBodyBlocked(x, y, this.playerState.x, this.playerState.y)) {
      return true;
    }
    if (options.includeNpcs ?? true) {
      for (const npc of this.npcRuntimes.values()) {
        if (npc.data.npcId === options.ignoreNpcId) {
          continue;
        }
        if (this.actorBodyBlocked(x, y, npc.state.player.x, npc.state.player.y)) {
          return true;
        }
      }
    }
    return false;
  }

  private surfaceBlocked(x: number, y: number): boolean {
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
    return false;
  }

  private handleDoorTrigger(): void {
    // Phase-2 owns eventFlag gating. This slice treats every imported trigger as active.
    const result = resolveDoorTrigger(
      this.playerState,
      this.world_.doors,
      this.doorTriggerState,
      this.collisionCellSize
    );
    this.doorTriggerState = { suppressUntilClear: result.suppressUntilClear };
    if (!result.door) {
      return;
    }

    this.applyDoorWarp({
      x: result.door.destinationWorldPixel.x,
      y: result.door.destinationWorldPixel.y,
      direction: result.door.direction
    });
  }

  private applyDoorWarp(destination: EventWarpDestination): void {
    const from = { x: this.playerState.x, y: this.playerState.y };
    const to = this.clampSpawn(destination);
    this.playerState.x = to.x;
    this.playerState.y = to.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.playerState.facing = toFacing(destination.direction, this.playerState.facing);
    this.playerState.walkClockMs = 0;
    this.playerState.animKey = `idle-${this.playerState.facing}`;
    this.playerState.animFrame = this.playerFrames[this.playerState.facing][0];
    this.lastDoor = { from, to };
    this.currentChunk = undefined;
    this.refreshStreaming(true);
    this.cameras.main.centerOn(to.x, to.y);
    if (this.player) {
      this.player.x = to.x;
      this.player.y = to.y;
      if (this.player instanceof Phaser.GameObjects.Sprite) {
        this.player.setFrame(this.playerState.animFrame);
      }
      this.player.setDepth(to.y);
    }
  }

  private actorBodyBlocked(x: number, y: number, bodyX: number, bodyY: number): boolean {
    return Math.abs(x - bodyX) < 14 && y > bodyY - 18 && y < bodyY + 10;
  }

  private interactionCandidates(): InteractionCandidate[] {
    return [...this.npcRuntimes.values()].map((npc) => ({
      id: npc.data.npcId,
      x: npc.state.player.x,
      y: npc.state.player.y,
      interactable: npc.data.interactable
    }));
  }

  private interactionTarget(): InteractionCandidate | undefined {
    return findInteractionTarget(this.playerState, this.interactionCandidates(), {
      maxDistance: INTERACTION_DISTANCE
    })?.candidate;
  }

  private tutorialNpc(): NpcRuntime | undefined {
    return [...this.npcRuntimes.values()].find((npc) => npc.data.npcId === 744)
      ?? [...this.npcRuntimes.values()].find((npc) => npc.data.interactable);
  }

  private distanceToTutorialNpc(): number | undefined {
    const npc = this.tutorialNpc();
    if (!npc || !this.player) {
      return undefined;
    }
    return Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, npc.state.player.x, npc.state.player.y);
  }

  private inRange(): boolean {
    return Boolean(nearestInteractable(this.playerState, this.interactionCandidates(), INTERACTION_DISTANCE));
  }

  private updatePrompt(): void {
    if (this.menuState.open) {
      this.prompt = "Arrows: choose | Space/Enter: select | Esc/Backspace: back";
    } else if (this.dialogue.open) {
      this.prompt = "Space/Enter: advance | Esc/Backspace: close";
    } else if (this.interactionTarget()) {
      this.prompt = "Space/Enter: talk";
    } else if (this.inRange()) {
      this.prompt = "Turn toward the NPC, then press Space/Enter";
    } else {
      this.prompt = "Move with Arrow keys/WASD. Approach an NPC to talk.";
    }
  }

  private handleConfirm(): void {
    if (this.menuState.open) {
      this.confirmCommandMenu();
      return;
    }
    this.handleAdvance();
  }

  private handleCancel(): void {
    if (this.menuState.open) {
      this.cancelCommandMenu();
      return;
    }
    this.closeDialogue();
  }

  handleAdvance(): void {
    if (!this.dialogue.open) {
      if (this.eventSequence?.running) {
        return;
      }
      if (this.interactionTarget() && this.dialogue.canOpen()) {
        this.openDialogue();
      }
      return;
    }
    this.dialogue.advance();
    if (!this.dialogue.open) {
      if (this.eventSequence?.running) {
        this.eventSequence.confirm();
      } else {
        this.afterDialogueClosed();
      }
    }
    this.publish();
  }

  private openCommandMenu(): void {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running) {
      return;
    }
    this.refreshMenuScreens();
    const root = this.menuScreens.get(MAIN_MENU_ID);
    if (!root) {
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private moveMenuCursor(delta: number): void {
    if (!this.menuState.open) {
      return;
    }
    this.menuState = moveMenu(this.menuState, delta);
    this.publish();
  }

  private confirmCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.refreshMenuScreens();
    const result = confirmMenu(this.menuState, (id) => this.menuScreens.get(id));
    this.menuState = result.state;
    if (result.actionId) {
      this.handleMenuAction(result.actionId);
      return;
    }
    this.updatePrompt();
    this.publish();
  }

  private handleMenuAction(actionId: string): void {
    const action = parseMenuAction(actionId);
    if (!action) {
      this.showMenuResult("Nothing happened.");
      return;
    }
    if (action.kind === "save") {
      this.saveGame(true);
      return;
    }
    if (action.kind === "itemUse") {
      this.handleItemUseAction(action);
      return;
    }
    this.handleEquipAction(action);
  }

  private handleItemUseAction(action: Extract<ReturnType<typeof parseMenuAction>, { kind: "itemUse" }>): void {
    const item = this.itemById(action.itemId);
    const target = this.partyMemberById(action.targetChar);
    if (!item || this.partyState.inventory(action.ownerChar)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't use that.");
      return;
    }
    const result = this.partyState.useItem({
      ownerChar: action.ownerChar,
      targetChar: action.targetChar,
      item,
      targetVitals: vitalsForPartyMember(target)
    });
    this.showMenuResult(result.ok ? "Used." : "You can't use that.");
  }

  private handleEquipAction(action: Extract<ReturnType<typeof parseMenuAction>, { kind: "equip" }>): void {
    const item = this.itemById(action.itemId);
    if (!item || this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't equip that.");
      return;
    }
    const result = this.partyState.equip(action.char, item);
    this.showMenuResult(result.ok ? (result.equipped ? "Equipped." : "Unequipped.") : "You can't equip that.");
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.data_.items?.items.find((item) => item.id === itemId);
  }

  private partyMemberById(charId: number): PartyMember | undefined {
    return this.data_.characters?.characters.map(buildPartyMember).find((member) => member.id === charId);
  }

  private showMenuResult(message: string): void {
    this.menuState = closedMenu();
    this.refreshMenuScreens();
    this.dialogue.start([{
      text: message,
      ended: false,
      unknownCommands: [],
      segments: [{ kind: "text", value: message }]
    }]);
    this.updatePrompt();
    this.publish();
  }

  private cancelCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.menuState = cancelMenu(this.menuState);
    if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private refreshMenuScreens(): void {
    const resolver = createDialogueResolver(this.data_);
    this.menuScreens = new Map(buildMenuScreens(buildStatusViewModel({
      characters: this.data_.characters,
      partyState: this.partyState
    }), {
      characters: this.data_.characters,
      items: this.data_.items,
      psi: this.data_.psi,
      partyState: this.partyState,
      resolver
    }).map((screen) => [screen.id, screen]));
  }

  menuRenderStack(): MenuRenderScreen[] {
    return menuRenderStack(this.menuState);
  }

  menuDebugState(): MenuDebugState {
    return menuDebugState(this.menuState);
  }

  private handleSaveKey(): void {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running || !this.player) {
      return;
    }
    this.saveGame(false);
  }

  private saveGame(showResult: boolean): void {
    const savedAt = new Date().toISOString();
    const save = captureSaveState({
      flags: this.gameFlags,
      partyState: this.partyState,
      player: this.currentPlayerSnapshot(),
      savedAt
    });
    const blob = serializeSaveState(save);
    const saved = blob ? this.saveSlots?.saveToSlot(this.saveSlot, blob) ?? false : false;
    if (saved) {
      this.hasSave = true;
      this.lastSavedAt = savedAt;
    } else {
      this.hasSave = Boolean(this.saveSlots?.hasSave(this.saveSlot));
    }
    if (showResult) {
      this.showMenuResult(saved ? "Saved." : "Save unavailable.");
      return;
    }
    this.updatePrompt();
    this.publish();
  }

  private applyInitialSave(): SavePlayerSnapshot | undefined {
    if (!this.bootSaveState || !this.isCompatibleSavePlayer(this.bootSaveState.player)) {
      return undefined;
    }
    const player = applySaveState(this.bootSaveState, {
      flags: this.gameFlags,
      partyState: this.partyState
    });
    if (!player) {
      return undefined;
    }
    this.restoredFromSave = true;
    this.hasSave = true;
    this.lastSavedAt = this.bootSaveState.savedAt;
    return player;
  }

  private isCompatibleSavePlayer(player: SavePlayerSnapshot): boolean {
    return player.mode === "chunked" && player.mapId === this.saveMapId();
  }

  private currentPlayerSnapshot(): SavePlayerSnapshot {
    return {
      mode: "chunked",
      mapId: this.saveMapId(),
      x: this.playerState.x,
      y: this.playerState.y,
      facing: this.playerState.facing
    };
  }

  private saveMapId(): string {
    return [
      "chunked",
      `${this.world_.mapWidthTiles}x${this.world_.mapHeightTiles}`,
      `tile${this.world_.tileSize}`,
      `chunk${this.world_.chunkSizeTiles}`
    ].join(":");
  }

  private openDialogue(): void {
    const target = this.interactionTarget();
    const npc = [...this.npcRuntimes.values()].find((runtime) => runtime.data.npcId === target?.id);
    if (!npc) {
      return;
    }
    this.pauseNpcForDialogue(npc);
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents(interactionEvents(npc.data, this.targetReference, this.gameFlags));
    this.updatePrompt();
    this.publish();
  }

  private runEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case "dialogue":
          if (!this.startEventSequence(event.reference)) {
            this.dialogue.start(buildDialogueForReference(this.data_.scripts, event.reference, this.gameFlags));
          }
          break;
        case "setFlag":
          this.gameFlags.set(event.flag);
          break;
      }
    }
  }

  private pauseNpcForDialogue(npc: NpcRuntime): void {
    this.restoreActiveNpc();
    this.activeNpcDialogue = { key: npc.key, id: npc.data.npcId, restoreFacing: npc.state.player.facing };
    npc.state.paused = true;
    this.setNpcIdleFacing(npc, facingToward(npc.state.player.x, npc.state.player.y, this.playerState.x, this.playerState.y));
  }

  private configureEventRuntime(): void {
    const host = new RuntimeEventHost({
      dialogue: this.dialogue,
      flags: this.gameFlags,
      partyState: this.partyState,
      scene: this,
      resolveWarpDestination: (dest, style) => this.resolveEventWarpDestination(dest, style),
      applyWarpDestination: (destination) => this.applyDoorWarp(destination),
      startBattle: (group) => this.startEventBattle(group)
    });
    this.eventSequence = new RuntimeEventSequence(this.data_.scripts, host);
  }

  private startEventSequence(reference: string): boolean {
    return this.eventSequence?.start(reference, {
      onComplete: () => this.afterDialogueClosed()
    }) ?? false;
  }

  private resolveEventWarpDestination(dest: number, style?: number): EventWarpDestination | undefined {
    void dest;
    void style;
    // Generated effects carry teleport table ids; world.json does not yet expose that table.
    return undefined;
  }

  private startEventBattle(group: number): boolean {
    if (!this.data_.battle) {
      return false;
    }
    this.scene.stop("ui");
    this.scene.start("battle", { battleData: this.data_.battle, groupId: group });
    return true;
  }

  private restoreActiveNpc(): void {
    if (!this.activeNpcDialogue) {
      return;
    }
    const active = this.activeNpcDialogue;
    const npc = this.npcRuntimes.get(active.key);
    if (npc) {
      this.setNpcIdleFacing(npc, active.restoreFacing);
      npc.state.paused = false;
    }
    this.activeNpcDialogue = undefined;
  }

  private afterDialogueClosed(): void {
    unlockPlayer(this.playerState);
    this.restoreActiveNpc();
    this.refreshStreaming(true);
    this.updatePrompt();
  }

  private setNpcIdleFacing(npc: NpcRuntime, facing: Facing): void {
    npc.state.player.facing = facing;
    npc.state.player.moving = false;
    npc.state.player.velocityX = 0;
    npc.state.player.velocityY = 0;
    npc.state.player.walkClockMs = 0;
    npc.state.player.animKey = `idle-${facing}`;
    npc.state.player.animFrame = npc.frames[facing][0];
    this.syncNpc(npc);
  }

  closeDialogue(): void {
    if (!this.dialogue.open && !this.eventSequence?.running) {
      return;
    }
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.eventSequence?.abort();
    this.afterDialogueClosed();
    this.publish();
  }

  statusLines(): string[] {
    return buildStatusLines(this.data_);
  }

  metadataLines(): string[] {
    return buildMetadataLines(this.data_);
  }

  runtimeLines(): string[] {
    const state = this.playerState;
    return [
      "Player Runtime",
      `facing: ${state.facing} | moving: ${state.moving} | locked: ${state.inputLocked}`,
      `anim: ${state.animKey} frame ${state.animFrame}`,
      `feet: ${Math.round(state.x)},${Math.round(state.y)} | chunk: ${this.currentChunk?.cx ?? "?"},${this.currentChunk?.cy ?? "?"} | target: ${this.interactionTarget()?.id ?? "none"}`,
      `chunks loaded: ${this.loadedChunkCount()} | active NPCs: ${this.npcRuntimes.size}`,
      `save: ${this.hasSave ? "yes" : "no"} | restored: ${this.restoredFromSave ? "yes" : "no"}`
    ];
  }

  private parseSpawnOverride(): { x: number; y: number } | undefined {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("spawn");
    if (!raw) {
      return undefined;
    }
    const [x, y] = raw.split(",").map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return undefined;
    }
    return { x, y };
  }

  private clampSpawn(spawn: { x: number; y: number }): { x: number; y: number } {
    const bounds = this.movementBounds();
    return {
      x: Math.min(Math.max(spawn.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(spawn.y, bounds.minY), bounds.maxY)
    };
  }

  private loadedChunkCount(): number {
    let count = 0;
    for (const streamed of this.chunkObjects.values()) {
      if (streamed.background || streamed.foreground) {
        count += 1;
      }
    }
    return count;
  }

  private publish(): void {
    const world = this.world_;
    const npc744 = this.tutorialNpc();
    const distance = this.distanceToTutorialNpc();
    const target = this.interactionTarget();
    const npcs: DebugNpc[] = [...this.npcRuntimes.values()].map((npc) => ({
      id: npc.data.npcId,
      x: npc.state.player.x,
      y: npc.state.player.y,
      interactable: npc.data.interactable,
      visible: this.isNpcVisible(npc.data),
      facing: npc.state.player.facing,
      moving: npc.state.player.moving,
      behaviorKind: npc.state.behavior.kind,
      paused: npc.state.paused
    }));
    const state: FirstSceneDebug = {
      mode: "world",
      dialogueOpen: this.dialogue.open,
      dialogueText: this.dialogue.currentText,
      dialoguePageIndex: this.dialogue.pageIndex,
      dialoguePageCount: this.dialogue.pages.length,
      revealComplete: this.dialogue.revealComplete,
      revealedText: this.dialogue.open ? this.dialogue.revealedText : "",
      targetReference: this.targetReference,
      player: this.player ? { x: this.playerState.x, y: this.playerState.y } : undefined,
      npc: npc744 ? { x: npc744.state.player.x, y: npc744.state.player.y } : undefined,
      npcs,
      prompt: this.prompt,
      facing: this.playerState.facing,
      moving: this.playerState.moving,
      animKey: this.playerState.animKey,
      animFrame: this.playerState.animFrame,
      inputLocked: this.playerState.inputLocked,
      lastDoor: this.lastDoor,
      loadedChunkCount: this.loadedChunkCount(),
      activeNpcCount: this.npcRuntimes.size,
      currentChunk: this.currentChunk,
      canInteract: Boolean(target),
      interactionTargetId: target?.id,
      activeNpcId: (this.dialogue.open || this.eventSequence?.running) ? this.activeNpcDialogue?.id : undefined,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: this.movementBounds(),
      statusLines: this.statusLines(),
      metadataLines: this.metadataLines(),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      dialogueCounters: { opens: this.dialogue.opens, advances: this.dialogue.advances, closes: this.dialogue.closes },
      flags: this.gameFlags.list(),
      flagsNumCount: this.gameFlags.listNums().length,
      hasSave: this.hasSave,
      ...(this.lastSavedAt ? { lastSavedAt: this.lastSavedAt } : {}),
      restoredFromSave: this.restoredFromSave,
      eventExecutor: this.eventSequence?.debug(),
      partyState: this.partyState.counts(),
      menu: this.menuDebugState(),
      world: {
        available: world.available,
        widthPixels: world.mapWidthTiles * world.tileSize,
        heightPixels: world.mapHeightTiles * world.tileSize,
        npcCount: world.counts.npcs,
        visibleNpcCount: world.npcs.filter((npc) => this.isNpcVisible(npc)).length,
        assetsLoaded: this.assetsLoaded,
        npc744WorldPixel: world.npcs.find((npc) => npc.npcId === 744)?.worldPixel,
        playerSpawn: world.player.spawnWorldPixel
      }
    };
    publishDebug(state);
  }
}

function vitalsForPartyMember(member: PartyMember | undefined): {
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
} {
  return {
    hp: member?.hp ?? 40,
    maxHp: member?.maxHp ?? 40,
    pp: member?.pp ?? 0,
    maxPp: member?.maxPp ?? 0
  };
}
