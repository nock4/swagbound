import Phaser from "phaser";
import type { SpriteSheet, WorldChunked, WorldChunkedNpc } from "@eb/schemas";
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
  readonly dialogue = new DialogueController();
  private readonly gameFlags = new GameFlags();
  targetReference = TARGET_REFERENCE;
  prompt = "";
  assetsLoaded = false;
  debugPanelVisible = false;

  constructor() {
    super("chunked-world");
  }

  init(data: { gameData: GameData }): void {
    this.data_ = data.gameData;
    this.world_ = data.gameData.world as WorldChunked;
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
    this.assetsLoaded = world.chunks.some((chunk) => Boolean(chunk.background || chunk.foreground));
    if (!this.assetsLoaded) {
      this.scene.start("fallback", { gameData: this.data_, reason: "full-world chunk assets missing" });
      return;
    }

    this.cameras.main.setBackgroundColor("#000000");
    this.targetReference = chooseReference(this.data_);
    this.indexChunks();
    this.indexNpcPlacements();

    this.solidRows = world.collision.solidRows;
    this.collisionCellSize = world.collision.cellSize;
    this.collisionWidth = world.collision.width;
    this.collisionHeight = world.collision.height;

    const spawn = this.clampSpawn(this.parseSpawnOverride() ?? world.player.spawnWorldPixel);
    this.playerFrames = this.framesForGroup(world.player.spriteGroup);
    this.playerState = createPlayerState(spawn.x, spawn.y, "down", this.playerFrames);
    this.player = this.spawnActor(spawn.x, spawn.y, world.player.spriteGroup, "down");

    const bounds = this.movementBounds();
    this.cameras.main.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
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
    this.stepNpcs(delta);

    if (this.dialogue.open && !this.playerState.inputLocked) {
      lockPlayer(this.playerState, this.playerFrames);
    } else if (!this.dialogue.open && this.playerState.inputLocked) {
      unlockPlayer(this.playerState);
    }

    stepPlayer(this.playerState, this.readInput(), {
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y, { includeNpcs: true }),
      frames: this.playerFrames
    });

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
      if (!npc.visible) {
        return;
      }
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
        if (this.npcRuntimes.has(placement.key) || !shouldSpawnForChunk(placement.chunk, center)) {
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
      state: createNpcState(npc.worldPixel.x, npc.worldPixel.y, facing, behaviorForNpc(npc.npcId), frames),
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
    if (this.dialogue.open) {
      this.prompt = "Space/Enter: advance | Esc/Backspace: close";
    } else if (this.interactionTarget()) {
      this.prompt = "Space/Enter: talk";
    } else if (this.inRange()) {
      this.prompt = "Turn toward the NPC, then press Space/Enter";
    } else {
      this.prompt = "Move with Arrow keys/WASD. Approach an NPC to talk.";
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
      unlockPlayer(this.playerState);
      this.restoreActiveNpc();
    }
    this.publish();
  }

  private openDialogue(): void {
    const target = this.interactionTarget();
    const npc = [...this.npcRuntimes.values()].find((runtime) => runtime.data.npcId === target?.id);
    if (!npc) {
      return;
    }
    this.pauseNpcForDialogue(npc);
    this.runEvents(interactionEvents(npc.data, this.targetReference, this.gameFlags));
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private runEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case "dialogue":
          this.dialogue.start(buildDialogueForReference(this.data_.scripts, event.reference));
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
    if (!this.dialogue.open) {
      return;
    }
    this.dialogue.close();
    unlockPlayer(this.playerState);
    this.restoreActiveNpc();
    this.updatePrompt();
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
      `chunks loaded: ${this.loadedChunkCount()} | active NPCs: ${this.npcRuntimes.size}`
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
      visible: npc.data.visible,
      facing: npc.state.player.facing,
      moving: npc.state.player.moving,
      behaviorKind: npc.state.behavior.kind,
      paused: npc.state.paused
    }));
    const state: FirstSceneDebug = {
      mode: "world",
      dialogueOpen: this.dialogue.open,
      dialogueText: this.dialogue.open ? this.dialogue.currentText : this.dialogue.pages[this.dialogue.pageIndex]?.text ?? "",
      dialoguePageIndex: this.dialogue.pageIndex,
      dialoguePageCount: this.dialogue.pages.length,
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
      loadedChunkCount: this.loadedChunkCount(),
      activeNpcCount: this.npcRuntimes.size,
      currentChunk: this.currentChunk,
      canInteract: Boolean(target),
      interactionTargetId: target?.id,
      activeNpcId: this.dialogue.open ? this.activeNpcDialogue?.id : undefined,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: this.movementBounds(),
      statusLines: this.statusLines(),
      metadataLines: this.metadataLines(),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      dialogueCounters: { opens: this.dialogue.opens, advances: this.dialogue.advances, closes: this.dialogue.closes },
      flags: this.gameFlags.list(),
      world: {
        available: world.available,
        widthPixels: world.mapWidthTiles * world.tileSize,
        heightPixels: world.mapHeightTiles * world.tileSize,
        npcCount: world.counts.npcs,
        visibleNpcCount: world.counts.visibleNpcs,
        assetsLoaded: this.assetsLoaded,
        npc744WorldPixel: world.npcs.find((npc) => npc.npcId === 744)?.worldPixel,
        playerSpawn: world.player.spawnWorldPixel
      }
    };
    publishDebug(state);
  }
}
