import Phaser from "phaser";
import { isNpcVisibleForEventFlags, type BattleEnemy, type DialoguePage, type EventEffect, type ItemData, type SpriteOverride, type SpriteSheet, type WorldChunked, type WorldChunkedNpc } from "@eb/schemas";
import { rollEncounter, sectorIndexForTile } from "./encounterLogic";
import { createStatefulRng, seedFromSearch, type StatefulRng } from "./seededRng";
import type { BattleReturnContext, BattleReturnSource, ChunkedWorldRestore } from "./battleReturn";
import {
  battleRngSeedForGroup,
  computeEncounterAdvantage,
  createBattleRng,
  createBattleState,
  resolveInstantWinRewards,
  type EncounterAdvantage,
  type InstantWinRewardOptions
} from "./battleLogic";
import {
  resolveAdjacentDoorIntentTrigger,
  resolveDoorWarpLanding,
  resolveDoorIntentTrigger,
  type DoorIntentDirection,
  type DoorWarpLanding,
  type DoorTriggerResult,
  type DoorTriggerState
} from "./doorTriggers";
import {
  buildInlineDialoguePages,
  buildAddedWorldNpcs,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  isAddedWorldChunkedNpc,
  resolveStatus,
  TARGET_REFERENCE,
  type AddedWorldChunkedNpc,
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
import {
  cellInRange,
  collisionOverlaySolidCells,
  pointInRect,
  solidAtWorldPixel,
  surfaceAtCell,
  surfaceAtWorldPixel,
  SURFACE_WATER_MASK,
  visibleCollisionCellRange,
  worldPixelToCollisionCell,
  type CollisionGrid,
  type WorldRect
} from "./collisionOverlay";
import {
  addedNpcInteractionEvents,
  dispatchInteractionEvents,
  interactionEvents,
  type DialogueEvent,
  type GameEvent,
  type HealEvent
} from "./eventRunner";
import {
  resolveScriptedDialoguePages,
  startScriptedBeatDialogue
} from "./scriptedDialogueResolver";
import {
  resolveTeleportDestination,
  RuntimeEventHost,
  RuntimeEventSequence,
  type EventHostDebug,
  type EventWarpDestination
} from "./eventHost";
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
  type DirectionFrameSequence,
  type DirectionFrames,
  type Facing,
  type InteractionCandidate,
  type MoveInput,
  type PlayerState
} from "./playerController";
import { PLAYER_SPEED, INTERACTION_DISTANCE } from "./worldScene";
import {
  DialogueController,
  publishDebug,
  publishNewGameStartupRecord,
  shouldRunNewGameStartup,
  type DebugNpc,
  type FirstSceneDebug,
  type NewGameStartupRunDebug
} from "./state";
import { createDialogueResolver, textSpeedCpsFromSearch } from "./dialogueRenderer";
import {
  INTRO_ACTOR_VM_STUBS,
  INTRO_BEDROOM_OPENING_DONE_FLAG,
  INTRO_FIRST_BOSS_DONE_FLAG,
  INTRO_METEOR_BEAT_FIRED_FLAG,
  decideIntroFirstBossBeatFire,
  decideIntroMeteorBattleTransition,
  decideIntroMeteorBeatFire,
  resolveIntroFirstBossBeatStart,
  resolveIntroMeteorBeatStart,
  type IntroFirstBossBeatStart,
  type IntroMeteorBeatStart,
  type NewGameOpeningStart
} from "./newGameOpening";
import { PartyState, type PartyStateSnapshot } from "./partyState";
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
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  menuRenderStack,
  moveMenu,
  openMenu,
  parseMenuAction,
  resolveTalkMenuAction,
  MAIN_MENU_ID,
  TALK_MENU_ACTION_ID,
  shopRootScreenId,
  type MenuAction,
  type MenuDebugState,
  type MenuRenderScreen,
  type MenuScreen,
  type MenuState
} from "./menuModel";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import { buildPartyMember, type PartyMember } from "./characterModel";
import { activeWindowFlavorId } from "./windowSettings";
import { PLAYER_FOOT_BOX, walkableFootprintClear } from "./collisionFootprint";
import {
  PLAYER_SPRITE_OVERRIDE_SHEET_KEY,
  spriteOverrideAssetUrl,
  spriteOverrideDirectionFrames,
  spriteOverrideForNpcId,
  spriteOverrideForSpriteGroup,
  spriteOverrideFrame,
  spriteOverrideGroupEntries,
  spriteOverrideGroupSheetKey,
  spriteOverrideNpcEntries,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteOverrideScale,
  spriteOverrideSheet,
  spriteOverrideSpriteGroupFromSheetKey,
  type SpriteOverrideSheet
} from "./spriteOverrides";
import { spriteBottomY, spriteSortDepth } from "./renderDepth";
import {
  resolveConnectedRoomBounds,
  resolveSectorAreaBounds,
  roomMaskContainsWorldPoint,
  sectorCoordForWorldPixel,
  type ConnectedRoomBounds
} from "./roomBounds";
import {
  advanceMapTransition,
  beginMapTransition,
  idleMapTransition,
  isMapTransitionActive,
  transitionKindForDoorType,
  transitionOverlayAlpha,
  transitionSfxCueForEvent,
  type MapTransitionEvent,
  type MapTransitionState,
  type TransitionKind,
  type TransitionSfxCue
} from "./mapTransition";
import { createTransitionSfx, type TransitionSfx } from "./audio/transitionSfx";

type ChunkLayer = "background" | "foreground";
type WorldChunk = WorldChunked["chunks"][number];

type StreamedChunk = {
  chunk: WorldChunk;
  background?: Phaser.GameObjects.Image;
  foreground?: Phaser.GameObjects.Image;
};

type RuntimeNpcData = WorldChunkedNpc | AddedWorldChunkedNpc;

type NpcPlacement = {
  key: string;
  data: RuntimeNpcData;
  chunk: ChunkCoord;
};

type NpcRuntime = {
  key: string;
  data: RuntimeNpcData;
  state: NpcRuntimeState;
  frames: DirectionFrameSequence;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

type NpcSpriteOverrideResolution = {
  source: "npc" | "spriteGroup";
  id: number;
  key: string;
  override: SpriteOverrideSheet;
};

type SortableActor = Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;

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

type DoorWarpOptions = {
  instant?: boolean;
  kind?: TransitionKind;
  triggerWorldPixel?: { x: number; y: number };
};

type DoorFadePhase = "none" | "fade-out" | "fade-in";

const DOOR_FADE_OVERLAY_DEPTH = 1_000_000;
const COLLISION_OVERLAY_DEPTH = 150_000;
const ENCOUNTER_RETURN_COOLDOWN_MS = 1_500;
const ROOM_MASK_EDGE_INSET_SCREEN_PX = 0.5;

type TilePoint = { x: number; y: number };
type ForceEncounterResult =
  | { started: true; enemyGroup: number; advantage: EncounterAdvantage }
  | { started: false; reason: string; enemyGroup?: number; advantage?: EncounterAdvantage };

export class ChunkedWorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldChunked;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerState!: PlayerState;
  private playerFrames: DirectionFrameSequence = CANONICAL_DIRECTION_FRAMES;
  private npcPlacementsByChunk = new Map<string, NpcPlacement[]>();
  private npcRuntimes = new Map<string, NpcRuntime>();
  private activeNpcDialogue?: ActiveNpcDialogue;
  private chunkByKey = new Map<string, WorldChunk>();
  private chunkObjects = new Map<string, StreamedChunk>();
  private loadingTextureKeys = new Set<string>();
  private loadingSheetGroups = new Set<number>();
  private loadingNpcOverrideIds = new Set<number>();
  private loadingSpriteGroupOverrideIds = new Set<number>();
  private currentChunk?: ChunkCoord;
  private activeRoomBounds?: ConnectedRoomBounds;
  private activeRoomSectorKey?: string;
  private roomMaskGraphics?: Phaser.GameObjects.Graphics;
  private roomMask?: Phaser.Display.Masks.GeometryMask;
  private solidRows: string[] = [];
  private surfaceRows: string[] = [];
  private collisionCellSize = 8;
  private collisionWidth = 0;
  private collisionHeight = 0;
  private collisionOverlay?: Phaser.GameObjects.Graphics;
  private collisionOverlayEnabled = false;
  private solidAtHook?: (x: number, y: number) => boolean;
  private surfaceAtHook?: (x: number, y: number) => number;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doorTriggerState: DoorTriggerState = { suppressUntilClear: false };
  private lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  private warnedInvalidDoorWarps = new Set<string>();
  private doorFadePhase: DoorFadePhase = "none";
  private doorFadeOverlay?: Phaser.GameObjects.Rectangle;
  private doorTransitionState: MapTransitionState = idleMapTransition();
  private activeDoorWarp?: {
    destination: EventWarpDestination;
    landing: DoorWarpLanding;
    options: DoorWarpOptions;
  };
  readonly dialogue = new DialogueController();
  private readonly gameFlags = new GameFlags();
  private readonly partyState = new PartyState();
  private readonly transitionSfx: TransitionSfx = createTransitionSfx();
  private menuState: MenuState = closedMenu();
  private menuScreens = new Map<string, MenuScreen>();
  private activeShopStoreId?: number;
  private eventSequence?: RuntimeEventSequence;
  private bootSaveState?: SaveState;
  private saveSlot = 0;
  private saveSlots?: SaveSlotPersistence;
  private restoreState?: ChunkedWorldRestore;
  private returnContextActive = false;
  private hasSave = false;
  private lastSavedAt?: string;
  private restoredFromSave = false;
  private encounterEnabled = false;
  private encounterCooldownMs = 0;
  private encounterRng: StatefulRng = createStatefulRng(0);
  private encounterSeed = 0;
  private currentSectorIndex?: number;
  private lastPlayerTile?: TilePoint;
  private lastEncounterGroup?: number;
  private forceEncounterHook?: (groupId?: number, advantage?: unknown) => ForceEncounterResult;
  private newGameStartupRecord?: NewGameStartupRunDebug;
  private startupRunActive = false;
  private startupRunFinalized = false;
  private startupMode: "startup" | "opening" = "startup";
  private startupInitialSpawn?: { x: number; y: number };
  private startupFallbackReason?: string;
  private newGameOpening?: NewGameOpeningStart;
  private introMeteorBeat?: IntroMeteorBeatStart;
  private introFirstBossBeat?: IntroFirstBossBeatStart;
  private warnedIntroMeteorSkips = new Set<string>();
  private warnedIntroFirstBossSkips = new Set<string>();
  private warnedIntroActorVmStubs = new Set<string>();
  private pendingScriptedDialogueComplete?: () => void;
  private pendingInteractionShopStoreId?: number;
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
    restore?: ChunkedWorldRestore;
    newGameOpening?: NewGameOpeningStart;
  }): void {
    this.data_ = data.gameData;
    this.world_ = data.gameData.world as WorldChunked;
    this.resetRuntimeStateForStart();
    this.bootSaveState = data.saveState ?? undefined;
    this.saveSlot = Number.isInteger(data.saveSlot) && (data.saveSlot as number) >= 0 ? data.saveSlot as number : 0;
    this.saveSlots = data.saveSlots;
    this.restoreState = data.restore;
    this.newGameOpening = data.newGameOpening;
    this.returnContextActive = Boolean(data.restore);
    this.hasSave = Boolean(this.bootSaveState) || Boolean(this.saveSlots?.hasSave(this.saveSlot));
    this.lastSavedAt = this.bootSaveState?.savedAt;
    this.restoredFromSave = false;
    this.doorFadePhase = "none";
    this.doorTransitionState = idleMapTransition();
    this.activeDoorWarp = undefined;
    this.lastPlayerTile = undefined;
    this.currentSectorIndex = undefined;
    const disabledByQuery = encountersDisabledBySearch(globalThis.location?.search);
    const canEncounter = Boolean(data.gameData.encounters && data.gameData.battle);
    const restoredEncounter = data.restore?.encounter;
    this.encounterEnabled = canEncounter && !disabledByQuery && (restoredEncounter?.enabled ?? true);
    this.encounterCooldownMs = Math.max(0, restoredEncounter?.cooldownMs ?? 0);
    this.encounterSeed = restoredEncounter?.rngSeed ?? seedFromSearch(globalThis.location?.search, "encounterSeed");
    this.encounterRng = createStatefulRng(this.encounterSeed);
    this.lastEncounterGroup = restoredEncounter?.lastEncounterGroup;
  }

  preload(): void {
    const playerOverride = spriteOverrideSheet(this.playerSpriteOverride());
    if (playerOverride) {
      this.load.spritesheet(PLAYER_SPRITE_OVERRIDE_SHEET_KEY, spriteOverrideAssetUrl(playerOverride.image), {
        frameWidth: playerOverride.frameWidth,
        frameHeight: playerOverride.frameHeight
      });
    }
    for (const [npcId, override] of spriteOverrideNpcEntries(this.data_.spriteOverrides)) {
      const sheetOverride = spriteOverrideSheet(override);
      if (!sheetOverride) {
        continue;
      }
      this.load.spritesheet(spriteOverrideNpcSheetKey(npcId), spriteOverrideAssetUrl(sheetOverride.image), {
        frameWidth: sheetOverride.frameWidth,
        frameHeight: sheetOverride.frameHeight
      });
    }
    for (const [spriteGroup, override] of spriteOverrideGroupEntries(this.data_.spriteOverrides)) {
      const sheetOverride = spriteOverrideSheet(override);
      if (!sheetOverride) {
        continue;
      }
      this.load.spritesheet(
        spriteOverrideGroupSheetKey(spriteGroup, sheetOverride.image),
        spriteOverrideAssetUrl(sheetOverride.image),
        {
          frameWidth: sheetOverride.frameWidth,
          frameHeight: sheetOverride.frameHeight
        }
      );
    }
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
    this.surfaceRows = world.collision.surfaceRows;
    this.collisionCellSize = world.collision.cellSize;
    this.collisionWidth = world.collision.width;
    this.collisionHeight = world.collision.height;
    this.collisionOverlayEnabled = this.initialCollisionOverlayEnabled();
    this.registerCollisionDebugGlobals();
    this.resolveIntroMeteorBeatForStart();
    this.resolveIntroFirstBossBeatForStart();

    const restoredPlayer = this.restoreState ? undefined : this.applyInitialSave();
    const returnPlayer = this.applyReturnRestore();
    // Act 1 is solo: if nothing (save/intro) populated the party, default to the
    // first hero (Bosch) so menus + battle status never fall back to the full roster.
    if (this.partyState.party().length === 0) {
      this.ensureIntroSoloParty();
    }
    const spawn = this.clampSpawn(
      returnPlayer ?? restoredPlayer ?? this.parseSpawnOverride() ?? this.newGameOpening?.spawn ?? world.player.spawnWorldPixel
    );
    const playerFacing = returnPlayer?.facing ?? restoredPlayer?.facing ?? "down";
    this.playerFrames = this.framesForPlayer(world.player.spriteGroup);
    this.playerState = createPlayerState(spawn.x, spawn.y, playerFacing, this.playerFrames);
    this.player = this.spawnPlayerActor(spawn.x, spawn.y, world.player.spriteGroup, playerFacing);
    this.syncEncounterTileState();

    const bounds = this.movementBounds();
    this.cameras.main.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
    this.cameras.main.setZoom(2);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;
    this.refreshRoomBounds(true);
    this.events.once("shutdown", () => {
      this.destroyDoorFadeOverlay();
      this.destroyCollisionOverlay();
      this.destroyRoomMask();
      this.unregisterForceEncounter();
      this.unregisterCollisionDebugGlobals();
    });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.registerTransitionSfxResume();
    this.refreshMenuScreens();
    this.input.keyboard?.on("keydown-M", () => this.openCommandMenu());
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveMenuCursor(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveMenuCursor(1));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.handleConfirm());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.handleCancel());
    this.input.keyboard?.on("keydown-P", () => this.handleSaveKey());
    this.input.keyboard?.on("keydown-F1", () => {
      this.debugPanelVisible = !this.debugPanelVisible;
    });
    this.input.keyboard?.on("keydown-F2", () => this.setCollisionOverlayEnabled(!this.collisionOverlayEnabled));

    this.load.on("filecomplete", (key: string) => {
      this.loadingTextureKeys.delete(key);
      const sheetGroup = this.groupIdFromSheetKey(key);
      const overrideNpcId = spriteOverrideNpcIdFromSheetKey(key);
      const overrideSpriteGroup = spriteOverrideSpriteGroupFromSheetKey(key);
      if (sheetGroup !== undefined) {
        this.loadingSheetGroups.delete(sheetGroup);
        this.refreshNpcSprites();
      }
      if (overrideNpcId !== undefined) {
        this.loadingNpcOverrideIds.delete(overrideNpcId);
        this.refreshNpcSprites();
      }
      if (overrideSpriteGroup !== undefined) {
        this.loadingSpriteGroupOverrideIds.delete(overrideSpriteGroup);
        this.refreshNpcSprites();
      }
      this.materializeRetainedChunks();
      this.publish();
    });
    this.load.on("loaderror", (file: { key?: string }) => {
      if (file.key) {
        this.loadingTextureKeys.delete(file.key);
        const sheetGroup = this.groupIdFromSheetKey(file.key);
        const overrideNpcId = spriteOverrideNpcIdFromSheetKey(file.key);
        const overrideSpriteGroup = spriteOverrideSpriteGroupFromSheetKey(file.key);
        if (sheetGroup !== undefined) {
          this.loadingSheetGroups.delete(sheetGroup);
        }
        if (overrideNpcId !== undefined) {
          this.loadingNpcOverrideIds.delete(overrideNpcId);
        }
        if (overrideSpriteGroup !== undefined) {
          this.loadingSpriteGroupOverrideIds.delete(overrideSpriteGroup);
        }
      }
    });

    this.refreshStreaming(true);
    this.applyInteriorRoomMask();
    this.updateCollisionOverlay();
    this.updatePrompt();
    this.scene.launch("ui", { worldSceneKey: "chunked-world", font: this.data_.font, window: this.data_.window });
    this.registerForceEncounter();
    if (!this.restoreState) {
      this.maybeStartNewGameStartup(spawn);
    }
    this.publish();
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    this.partyState.tickMeters(delta);
    this.encounterCooldownMs = Math.max(0, this.encounterCooldownMs - delta);
    if (this.menuState.open) {
      if (!this.playerState.inputLocked) {
        lockPlayer(this.playerState, this.playerFrames);
      }
      this.updatePrompt();
      this.updateCollisionOverlay();
      this.publish();
      return;
    }
    this.stepNpcs(delta);
    this.eventSequence?.update(delta);
    this.updateDoorTransition(delta);

    const inputOwned = this.dialogue.open || Boolean(this.eventSequence?.running) || this.isDoorFadeActive();
    if (inputOwned && !this.playerState.inputLocked) {
      lockPlayer(this.playerState, this.playerFrames);
    } else if (!inputOwned && this.playerState.inputLocked) {
      unlockPlayer(this.playerState);
    }

    const input = this.readInput();
    if (this.handleDoorIntentTrigger(input, delta)) {
      this.syncPlayerObject();
      this.updateCollisionOverlay();
      this.updatePrompt();
      this.publish();
      return;
    }

    stepPlayer(this.playerState, input, {
      deltaMs: delta,
      speed: PLAYER_SPEED,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y, { includeNpcs: true }),
      frames: this.playerFrames
    });
    this.syncPlayerObject();
    this.refreshRoomBounds();
    this.refreshStreaming();
    this.updateCollisionOverlay();
    if (this.maybeStartIntroMeteorBeat()) {
      return;
    }
    if (this.maybeStartIntroFirstBossBeat()) {
      return;
    }
    if (this.handleEncounterStep()) {
      return;
    }
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

  private resetRuntimeStateForStart(): void {
    this.destroyDoorFadeOverlay();
    this.unregisterForceEncounter();
    this.player = undefined;
    this.playerFrames = CANONICAL_DIRECTION_FRAMES;
    this.activeNpcDialogue = undefined;
    this.chunkByKey.clear();
    this.npcPlacementsByChunk.clear();
    this.npcRuntimes.clear();
    this.chunkObjects.clear();
    this.loadingTextureKeys.clear();
    this.loadingSheetGroups.clear();
    this.loadingNpcOverrideIds.clear();
    this.loadingSpriteGroupOverrideIds.clear();
    this.currentChunk = undefined;
    this.activeRoomBounds = undefined;
    this.activeRoomSectorKey = undefined;
    this.destroyRoomMask();
    this.cursors = undefined;
    this.keys = undefined;
    this.solidRows = [];
    this.surfaceRows = [];
    this.collisionCellSize = 8;
    this.collisionWidth = 0;
    this.collisionHeight = 0;
    this.destroyCollisionOverlay();
    this.collisionOverlayEnabled = false;
    this.unregisterCollisionDebugGlobals();
    this.doorTriggerState = { suppressUntilClear: false };
    this.lastDoor = undefined;
    this.doorFadePhase = "none";
    this.doorTransitionState = idleMapTransition();
    this.activeDoorWarp = undefined;
    this.dialogue.close();
    this.gameFlags.clear();
    this.partyState.restore(emptyPartyStateSnapshot());
    this.menuState = closedMenu();
    this.menuScreens.clear();
    this.activeShopStoreId = undefined;
    this.eventSequence = undefined;
    this.newGameStartupRecord = undefined;
    this.startupRunActive = false;
    this.startupRunFinalized = false;
    this.startupMode = "startup";
    this.startupInitialSpawn = undefined;
    this.startupFallbackReason = undefined;
    this.newGameOpening = undefined;
    this.introMeteorBeat = undefined;
    this.introFirstBossBeat = undefined;
    this.warnedIntroMeteorSkips.clear();
    this.warnedIntroFirstBossSkips.clear();
    this.warnedIntroActorVmStubs.clear();
    this.prompt = "";
    this.assetsLoaded = false;
    this.pendingInteractionShopStoreId = undefined;
  }

  private indexChunks(): void {
    this.chunkByKey.clear();
    for (const chunk of this.world_.chunks) {
      this.chunkByKey.set(chunkKey(chunk), chunk);
    }
  }

  private indexNpcPlacements(): void {
    this.npcPlacementsByChunk.clear();
    const addedNpcs = buildAddedWorldNpcs(this.data_.addedNpcs, this.world_.npcs);
    if (addedNpcs.length < this.data_.addedNpcs.npcs.length) {
      console.warn("Skipped added NPC overlay entries with colliding synthetic ids.");
    }
    const indexPlacement = (npc: RuntimeNpcData, keyPrefix: string, index: number): void => {
      const placement: NpcPlacement = {
        key: `${keyPrefix}:${npc.npcId}:${index}:${npc.worldPixel.x}:${npc.worldPixel.y}`,
        data: npc,
        chunk: chunkForWorldPixel(npc.worldPixel, this.grid())
      };
      const key = chunkKey(placement.chunk);
      this.npcPlacementsByChunk.set(key, [...(this.npcPlacementsByChunk.get(key) ?? []), placement]);
    };
    this.world_.npcs.forEach((npc, index) => indexPlacement(npc, "eb", index));
    addedNpcs.forEach((npc, index) => indexPlacement(npc, "added", index));
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
    this.applyNpcRoomVisibility();
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
    const existing = streamed[layer];
    if (existing && isLiveGameObject(existing)) {
      return;
    }
    if (!streamed.chunk[layer]) {
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
    this.applyRoomMaskToImage(image);
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

  private refreshRoomBounds(force = false): void {
    if (this.world_.sectors) {
      const sector = sectorCoordForWorldPixel(this.playerState, this.world_.sectors);
      const sectorKey = sector ? `${sector.sectorCol},${sector.sectorRow}` : undefined;
      if (!force && sectorKey && this.activeRoomSectorKey === sectorKey) {
        return;
      }
      this.activeRoomSectorKey = sectorKey;
      this.activeRoomBounds = resolveSectorAreaBounds(
        this.world_.sectors,
        this.solidRows,
        this.collisionGrid(),
        this.playerState
      );
      this.applyInteriorRoomMask();
      this.applyNpcRoomVisibility();
      return;
    }
    if (!force && this.playerInsideCachedRoomBounds()) {
      return;
    }
    this.activeRoomSectorKey = undefined;
    this.activeRoomBounds = resolveConnectedRoomBounds(this.solidRows, this.collisionGrid(), this.playerState, {
      surfaceRows: this.surfaceRows
    });
    this.applyInteriorRoomMask();
    this.applyNpcRoomVisibility();
  }

  private playerInsideCachedRoomBounds(): boolean {
    const room = this.activeRoomBounds;
    const cell = worldPixelToCollisionCell(this.playerState, this.collisionCellSize);
    if (!room || !cell) {
      return false;
    }
    const bounds = room.walkableCellBounds;
    return (
      cell.cellX >= bounds.minCellX &&
      cell.cellX <= bounds.maxCellX &&
      cell.cellY >= bounds.minCellY &&
      cell.cellY <= bounds.maxCellY
    );
  }

  private activeInteriorRoom(): ConnectedRoomBounds | undefined {
    return this.activeRoomBounds?.isInterior ? this.activeRoomBounds : undefined;
  }

  private applyInteriorRoomMask(): void {
    const room = this.activeInteriorRoom();
    if (!room) {
      this.clearRoomMaskFromChunks();
      this.roomMaskGraphics?.clear();
      return;
    }
    const mask = this.ensureRoomMask(room);
    for (const streamed of this.chunkObjects.values()) {
      this.applyRoomMaskToImage(streamed.background, mask);
      this.applyRoomMaskToImage(streamed.foreground, mask);
    }
  }

  private ensureRoomMask(room: ConnectedRoomBounds): Phaser.Display.Masks.GeometryMask {
    const graphics = this.roomMaskGraphics ?? this.make.graphics({}, false);
    this.roomMaskGraphics = graphics;
    graphics.clear();
    graphics.fillStyle(0xffffff, 1);
    const cellSize = this.collisionCellSize;
    const maskBounds = room.maskCellBounds;
    const edgeInset = this.roomMaskEdgeInsetWorldPixels();
    for (const range of room.maskCellRanges) {
      const x = Math.round(range.minCellX * cellSize);
      const y = Math.round(range.cellY * cellSize);
      const insetRight = maskBounds && range.maxCellX === maskBounds.maxCellX ? edgeInset : 0;
      const insetBottom = maskBounds && range.cellY === maskBounds.maxCellY ? edgeInset : 0;
      const width = Math.max(1, Math.round((range.maxCellX - range.minCellX + 1) * cellSize) - insetRight);
      const height = Math.max(1, Math.round(cellSize) - insetBottom);
      graphics.fillRect(x, y, width, height);
    }
    this.roomMask = this.roomMask ?? graphics.createGeometryMask();
    this.roomMask.setShape(graphics);
    return this.roomMask;
  }

  private roomMaskEdgeInsetWorldPixels(): number {
    const zoom = this.cameras.main.zoom > 0 ? this.cameras.main.zoom : 1;
    return ROOM_MASK_EDGE_INSET_SCREEN_PX / zoom;
  }

  private applyRoomMaskToImage(
    image: Phaser.GameObjects.Image | undefined,
    mask = this.roomMask
  ): void {
    if (!image || !isLiveGameObject(image)) {
      return;
    }
    if (!this.activeInteriorRoom() || !mask) {
      image.setVisible(true);
      image.clearMask(false);
      return;
    }
    image.setVisible(true);
    image.setMask(mask);
  }

  private clearRoomMaskFromChunks(): void {
    for (const streamed of this.chunkObjects.values()) {
      streamed.background?.clearMask(false);
      streamed.background?.setVisible(true);
      streamed.foreground?.clearMask(false);
      streamed.foreground?.setVisible(true);
    }
  }

  private destroyRoomMask(): void {
    this.clearRoomMaskFromChunks();
    this.roomMask?.destroy();
    this.roomMask = undefined;
    this.roomMaskGraphics?.destroy();
    this.roomMaskGraphics = undefined;
  }

  private chunkTextureKey(chunk: WorldChunk, layer: ChunkLayer): string {
    return `chunk-${layer}-${chunk.cx}-${chunk.cy}`;
  }

  private collisionGrid(): CollisionGrid {
    return {
      cellSize: this.collisionCellSize,
      width: this.collisionWidth,
      height: this.collisionHeight
    };
  }

  private setCollisionOverlayEnabled(enabled: boolean): void {
    this.collisionOverlayEnabled = enabled;
    this.registry.set("collisionOverlay", enabled);
    this.updateCollisionOverlay();
    this.publish();
  }

  private updateCollisionOverlay(): void {
    if (!this.collisionOverlayEnabled) {
      this.collisionOverlay?.clear();
      this.collisionOverlay?.setVisible(false);
      return;
    }
    const graphics = this.ensureCollisionOverlay();
    graphics.clear();

    const rect = this.collisionOverlayCameraRect();
    const range = visibleCollisionCellRange(rect, this.collisionGrid(), 1);
    if (!range) {
      return;
    }

    for (const cell of collisionOverlaySolidCells(this.solidRows, this.collisionGrid(), range)) {
      graphics.fillStyle(0xff2f2f, 0.35);
      graphics.fillRect(cell.x, cell.y, cell.size, cell.size);
    }

    const cellSize = this.collisionCellSize;
    for (let cellY = range.minCellY; cellY <= range.maxCellY; cellY += 1) {
      for (let cellX = range.minCellX; cellX <= range.maxCellX; cellX += 1) {
        const x = cellX * cellSize;
        const y = cellY * cellSize;
        if ((surfaceAtCell(this.surfaceRows, cellX, cellY) & SURFACE_WATER_MASK) !== 0) {
          graphics.fillStyle(0x2f80ff, 0.3);
          graphics.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    this.drawDoorOverlay(graphics, rect, range);
  }

  private ensureCollisionOverlay(): Phaser.GameObjects.Graphics {
    if (!this.collisionOverlay || !this.collisionOverlay.active) {
      this.collisionOverlay = this.add.graphics();
    }
    this.collisionOverlay
      .setPosition(0, 0)
      .setScrollFactor(1)
      .setDepth(COLLISION_OVERLAY_DEPTH)
      .setVisible(true);
    return this.collisionOverlay;
  }

  private destroyCollisionOverlay(): void {
    this.collisionOverlay?.destroy();
    this.collisionOverlay = undefined;
  }

  private collisionOverlayCameraRect(): WorldRect {
    const camera = this.cameras.main;
    const zoom = camera.zoom > 0 ? camera.zoom : 1;
    return {
      x: camera.scrollX,
      y: camera.scrollY,
      width: camera.width / zoom,
      height: camera.height / zoom
    };
  }

  private drawDoorOverlay(
    graphics: Phaser.GameObjects.Graphics,
    rect: WorldRect,
    range: ReturnType<typeof visibleCollisionCellRange>
  ): void {
    if (!range) {
      return;
    }
    const cellSize = this.collisionCellSize;
    for (const door of this.world_.doors) {
      const cell = worldPixelToCollisionCell(door.worldPixel, cellSize);
      if (!cell || !cellInRange(cell, range)) {
        continue;
      }

      const x = cell.cellX * cellSize;
      const y = cell.cellY * cellSize;
      graphics.fillStyle(0x00ff66, 0.25);
      graphics.fillRect(x, y, cellSize, cellSize);
      graphics.lineStyle(1, 0x00ff66, 0.95);
      graphics.strokeRect(x + 0.5, y + 0.5, Math.max(1, cellSize - 1), Math.max(1, cellSize - 1));

      if (pointInRect(door.destinationWorldPixel, rect)) {
        graphics.lineStyle(1, 0x00ff66, 0.45);
        graphics.beginPath();
        graphics.moveTo(door.worldPixel.x, door.worldPixel.y);
        graphics.lineTo(door.destinationWorldPixel.x, door.destinationWorldPixel.y);
        graphics.strokePath();
      }
    }
  }

  private initialCollisionOverlayEnabled(): boolean {
    const queryEnabled = collisionOverlayEnabledBySearch(globalThis.location?.search);
    const registryEnabled = normalizeCollisionOverlayFlag(this.registry.get("collisionOverlay"));
    return registryEnabled ?? queryEnabled;
  }

  private registerCollisionDebugGlobals(): void {
    const globals = globalThis as Record<string, unknown>;
    this.solidAtHook = (x: number, y: number) => solidAtWorldPixel(this.solidRows, { x, y }, this.collisionGrid());
    this.surfaceAtHook = (x: number, y: number) => surfaceAtWorldPixel(this.surfaceRows, { x, y }, this.collisionGrid());
    globals.__solidAt = this.solidAtHook;
    globals.__surfaceAt = this.surfaceAtHook;
  }

  private unregisterCollisionDebugGlobals(): void {
    const globals = globalThis as Record<string, unknown>;
    if (this.solidAtHook && globals.__solidAt === this.solidAtHook) {
      delete globals.__solidAt;
    }
    if (this.surfaceAtHook && globals.__surfaceAt === this.surfaceAtHook) {
      delete globals.__surfaceAt;
    }
    this.solidAtHook = undefined;
    this.surfaceAtHook = undefined;
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
        const override = this.npcSpriteOverrideResolution(placement.data.npcId, placement.data.spriteGroup);
        queued = (override
          ? this.requestNpcOverrideSheet(placement.data.npcId, placement.data.spriteGroup)
          : this.requestNpcSheet(placement.data.spriteGroup)) || queued;
        this.npcRuntimes.set(placement.key, this.createNpcRuntime(placement));
      }
    }
    this.applyNpcRoomVisibility();
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
    const frames = this.framesForNpc(npc.npcId, npc.spriteGroup);
    const facing = toFacing(npc.direction);
    return {
      key: placement.key,
      data: npc,
      state: createNpcState(npc.worldPixel.x, npc.worldPixel.y, facing, behaviorForNpc(npc.npcId, npc.movement), frames),
      frames,
      sprite: this.spawnNpcActor(npc.npcId, npc.worldPixel.x, npc.worldPixel.y, npc.spriteGroup, npc.direction)
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
    this.setActorSortDepth(actor);
    actor.setVisible(this.npcInsideActiveRoom(npc));
  }

  private applyNpcRoomVisibility(): void {
    for (const npc of this.npcRuntimes.values()) {
      npc.sprite?.setVisible(this.npcInsideActiveRoom(npc));
    }
  }

  private npcInsideActiveRoom(npc: NpcRuntime): boolean {
    const room = this.activeInteriorRoom();
    return !room || roomMaskContainsWorldPoint(room, npc.state.player, this.collisionGrid());
  }

  private refreshNpcSprites(): void {
    for (const npc of this.npcRuntimes.values()) {
      if (!npc.sprite || npc.sprite instanceof Phaser.GameObjects.Sprite) {
        continue;
      }
      const override = this.npcSpriteOverrideResolution(npc.data.npcId, npc.data.spriteGroup);
      const key = override
        ? override.key
        : npc.data.spriteGroup !== undefined ? `sheet-${npc.data.spriteGroup}` : undefined;
      if (!key || !this.textures.exists(key)) {
        continue;
      }
      npc.sprite.destroy();
      npc.sprite = this.spawnNpcActor(
        npc.data.npcId,
        npc.state.player.x,
        npc.state.player.y,
        npc.data.spriteGroup,
        npc.state.player.facing
      );
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

  private requestNpcOverrideSheet(npcId: number, spriteGroup: number | undefined): boolean {
    const resolution = this.npcSpriteOverrideResolution(npcId, spriteGroup);
    if (!resolution || this.textures.exists(resolution.key)) {
      return false;
    }
    if (resolution.source === "npc") {
      if (this.loadingNpcOverrideIds.has(resolution.id)) {
        return false;
      }
      this.loadingNpcOverrideIds.add(resolution.id);
    } else {
      if (this.loadingSpriteGroupOverrideIds.has(resolution.id)) {
        return false;
      }
      this.loadingSpriteGroupOverrideIds.add(resolution.id);
    }
    this.load.spritesheet(resolution.key, spriteOverrideAssetUrl(resolution.override.image), {
      frameWidth: resolution.override.frameWidth,
      frameHeight: resolution.override.frameHeight
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

  private playerSpriteOverride(): SpriteOverride | undefined {
    return this.data_.spriteOverrides?.player;
  }

  private npcSpriteOverrideResolution(
    npcId: number,
    spriteGroup: number | undefined
  ): NpcSpriteOverrideResolution | undefined {
    const npcOverride = spriteOverrideSheet(spriteOverrideForNpcId(this.data_.spriteOverrides, npcId));
    if (npcOverride) {
      return {
        source: "npc",
        id: npcId,
        key: spriteOverrideNpcSheetKey(npcId),
        override: npcOverride
      };
    }
    const spriteGroupOverride = spriteOverrideSheet(spriteOverrideForSpriteGroup(this.data_.spriteOverrides, spriteGroup));
    if (spriteGroupOverride && spriteGroup !== undefined) {
      return {
        source: "spriteGroup",
        id: spriteGroup,
        key: spriteOverrideGroupSheetKey(spriteGroup, spriteGroupOverride.image),
        override: spriteGroupOverride
      };
    }
    return undefined;
  }

  private framesForPlayer(spriteGroup: number | undefined): DirectionFrameSequence {
    const override = this.playerSpriteOverride();
    const sheetOverride = spriteOverrideSheet(override);
    return sheetOverride ? spriteOverrideDirectionFrames(sheetOverride) : this.framesForGroup(spriteGroup);
  }

  private framesForNpc(npcId: number, spriteGroup: number | undefined): DirectionFrameSequence {
    const resolution = this.npcSpriteOverrideResolution(npcId, spriteGroup);
    return resolution ? spriteOverrideDirectionFrames(resolution.override) : this.framesForGroup(spriteGroup);
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
      this.setActorSortDepth(sprite);
      return sprite;
    }
    return this.spawnPlaceholderActor(x, y);
  }

  private spawnPlaceholderActor(x: number, y: number): Phaser.GameObjects.Rectangle {
    const placeholder = this.add.rectangle(x, y, 16, 24, 0x9aa7b8).setStrokeStyle(1, 0xe2e8f0);
    placeholder.setOrigin(0.5, 1);
    this.setActorSortDepth(placeholder);
    return placeholder;
  }

  private spawnOverrideActor(
    x: number,
    y: number,
    direction: string | undefined,
    textureKey: string,
    override: SpriteOverrideSheet
  ): Phaser.GameObjects.Sprite {
    const facing = toFacing(direction);
    const sprite = this.add.sprite(x, y, textureKey, spriteOverrideFrame(facing, 0, override));
    sprite.setOrigin(override.originX ?? 0.5, override.originY ?? 1);
    sprite.setScale(spriteOverrideScale(override.displayHeight, override.frameHeight));
    this.setActorSortDepth(sprite);
    return sprite;
  }

  private spawnNpcActor(
    npcId: number,
    x: number,
    y: number,
    spriteGroup: number | undefined,
    direction: string | undefined
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const resolution = this.npcSpriteOverrideResolution(npcId, spriteGroup);
    if (resolution) {
      return this.textures.exists(resolution.key)
        ? this.spawnOverrideActor(x, y, direction, resolution.key, resolution.override)
        : this.spawnActor(x, y, spriteGroup, direction);
    }
    return this.spawnActor(x, y, spriteGroup, direction);
  }

  private spawnPlayerActor(
    x: number,
    y: number,
    spriteGroup: number | undefined,
    direction: string | undefined
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const override = spriteOverrideSheet(this.playerSpriteOverride());
    if (override && this.textures.exists(PLAYER_SPRITE_OVERRIDE_SHEET_KEY)) {
      return this.spawnOverrideActor(x, y, direction, PLAYER_SPRITE_OVERRIDE_SHEET_KEY, override);
    }
    return this.spawnActor(x, y, spriteGroup, direction);
  }

  private readInput(): MoveInput {
    return {
      left: Boolean(this.cursors?.left?.isDown || this.keys?.A?.isDown),
      right: Boolean(this.cursors?.right?.isDown || this.keys?.D?.isDown),
      up: Boolean(this.cursors?.up?.isDown || this.keys?.W?.isDown),
      down: Boolean(this.cursors?.down?.isDown || this.keys?.S?.isDown)
    };
  }

  private registerTransitionSfxResume(): void {
    const resume = () => this.transitionSfx.resume();
    this.input.once("pointerdown", resume);
    this.input.keyboard?.once("keydown", resume);
    this.events.once("shutdown", () => {
      this.input.off("pointerdown", resume);
      this.input.keyboard?.off("keydown", resume);
    });
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
        if (!this.npcInsideActiveRoom(npc)) {
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
    return !this.walkableFootprint({ x, y });
  }

  private walkableFootprint(point: { x: number; y: number }): boolean {
    return walkableFootprintClear(point, this.solidRows, this.collisionGrid());
  }

  private handleDoorIntentTrigger(input: MoveInput, deltaMs: number): boolean {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running || this.isDoorFadeActive()) {
      return false;
    }
    if (this.playerState.inputLocked) {
      return false;
    }
    const movement = this.doorIntentDirection(input);
    let result = resolveAdjacentDoorIntentTrigger(
      this.playerState,
      movement,
      this.world_.doors,
      this.doorTriggerState,
      this.collisionCellSize,
      { footBox: PLAYER_FOOT_BOX }
    );
    if (movement.dx === 0 && movement.dy === 0) {
      this.setDoorTriggerState(result);
      return false;
    }
    if (!result.door && !result.suppressUntilClear) {
      const intendedFeet = this.intendedMoveFeet(input, deltaMs);
      if (!intendedFeet) {
        this.setDoorTriggerState(result);
        return false;
      }
      result = resolveDoorIntentTrigger(
        this.playerState,
        intendedFeet,
        this.world_.doors,
        result,
        this.collisionCellSize
      );
    }
    this.setDoorTriggerState(result);
    if (!result.door) {
      return false;
    }
    this.applyDoorWarp({
      x: result.door.destinationWorldPixel.x,
      y: result.door.destinationWorldPixel.y,
      worldPixel: result.door.destinationWorldPixel,
      direction: result.door.direction
    }, {
      kind: transitionKindForDoorType(result.door.type),
      triggerWorldPixel: result.door.worldPixel
    });
    return true;
  }

  private setDoorTriggerState(result: DoorTriggerResult): void {
    this.doorTriggerState = result.suppressedDoorCell
      ? { suppressUntilClear: result.suppressUntilClear, suppressedDoorCell: result.suppressedDoorCell }
      : { suppressUntilClear: result.suppressUntilClear };
  }

  private doorIntentDirection(input: MoveInput): DoorIntentDirection {
    const dx = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) as DoorIntentDirection["dx"];
    const dy = ((input.down ? 1 : 0) - (input.up ? 1 : 0)) as DoorIntentDirection["dy"];
    const preferredAxis = this.doorIntentPreferredAxis(dx, dy);
    return preferredAxis ? { dx, dy, preferredAxis } : { dx, dy };
  }

  private doorIntentPreferredAxis(
    dx: DoorIntentDirection["dx"],
    dy: DoorIntentDirection["dy"]
  ): DoorIntentDirection["preferredAxis"] {
    if (dx === 0 || dy === 0) {
      return undefined;
    }
    if ((this.playerState.facing === "up" && dy < 0) || (this.playerState.facing === "down" && dy > 0)) {
      return "y";
    }
    if ((this.playerState.facing === "left" && dx < 0) || (this.playerState.facing === "right" && dx > 0)) {
      return "x";
    }
    return "x";
  }

  private intendedMoveFeet(input: MoveInput, deltaMs: number): { x: number; y: number } | undefined {
    if (this.playerState.inputLocked) {
      return undefined;
    }
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx === 0 && dy === 0) {
      return undefined;
    }
    const scale = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
    const step = (PLAYER_SPEED * deltaMs) / 1000;
    const bounds = this.movementBounds();
    return {
      x: clamp(this.playerState.x + dx * scale * step, bounds.minX, bounds.maxX),
      y: clamp(this.playerState.y + dy * scale * step, bounds.minY, bounds.maxY)
    };
  }

  private applyDoorWarp(destination: EventWarpDestination, options: DoorWarpOptions = {}): void {
    const landing = this.resolveWalkableWarpPoint(destination.worldPixel ?? destination);
    if (!landing.walkable) {
      this.warnInvalidDoorWarp(destination, landing.point, options.triggerWorldPixel);
      return;
    }
    if (options.instant) {
      this.applyDoorWarpInstant(destination, landing, options);
      return;
    }
    if (!this.beginDoorFade(destination, landing, options)) {
      this.applyDoorWarpInstant(destination, landing, options);
    }
  }

  private applyDoorWarpInstant(
    destination: EventWarpDestination,
    landing = this.resolveWalkableWarpPoint(destination.worldPixel ?? destination),
    options: DoorWarpOptions = {}
  ): boolean {
    if (!landing.walkable) {
      this.warnInvalidDoorWarp(destination, landing.point, options.triggerWorldPixel);
      return false;
    }
    const from = { x: this.playerState.x, y: this.playerState.y };
    const to = landing.point;
    const suppressedDoorCell = this.doorTriggerState.suppressedDoorCell;
    this.doorTriggerState = from.x === to.x && from.y === to.y && suppressedDoorCell
      ? { suppressUntilClear: true, suppressedDoorCell }
      : { suppressUntilClear: true };
    this.playerState.x = to.x;
    this.playerState.y = to.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.playerState.facing = destination.facing ?? toFacing(destination.direction, this.playerState.facing);
    this.playerState.walkClockMs = 0;
    this.playerState.animKey = `idle-${this.playerState.facing}`;
    this.playerState.animFrame = this.playerFrames[this.playerState.facing][0];
    this.lastDoor = { from, to };
    this.currentChunk = undefined;
    this.activeRoomBounds = undefined;
    if (this.player) {
      this.player.x = to.x;
      this.player.y = to.y;
      if (this.player instanceof Phaser.GameObjects.Sprite) {
        this.player.setFrame(this.playerState.animFrame);
      }
      this.setActorSortDepth(this.player);
    }
    this.refreshStreaming(true);
    this.syncEncounterTileState();
    this.refreshRoomBounds(true);
    this.cameras.main.centerOn(to.x, to.y);
    return true;
  }

  private beginDoorFade(
    destination: EventWarpDestination,
    landing: DoorWarpLanding,
    options: DoorWarpOptions = {}
  ): boolean {
    if (this.isDoorFadeActive()) {
      return false;
    }
    try {
      const transition = beginMapTransition(options.kind ?? "door");
      this.doorTransitionState = transition.state;
      this.activeDoorWarp = { destination, landing, options };
      this.doorFadePhase = this.doorFadePhaseForTransition(this.doorTransitionState);
      lockPlayer(this.playerState, this.playerFrames);
      this.syncDoorFadeOverlay();
      this.playTransitionSfxForEvents(transition.events);
      this.publish();
      return true;
    } catch {
      this.finishDoorFade();
      return false;
    }
  }

  private updateDoorTransition(deltaMs: number): void {
    if (!isMapTransitionActive(this.doorTransitionState)) {
      return;
    }
    const result = advanceMapTransition(this.doorTransitionState, deltaMs);
    this.doorTransitionState = result.state;
    this.doorFadePhase = this.doorFadePhaseForTransition(this.doorTransitionState);
    for (const event of result.events) {
      if (!this.handleDoorTransitionEvent(event)) {
        return;
      }
    }
    this.syncDoorFadeOverlay();
    this.publish();
  }

  private handleDoorTransitionEvent(event: MapTransitionEvent): boolean {
    try {
      if (event.type === "swap") {
        const warp = this.activeDoorWarp;
        if (!warp || !this.applyDoorWarpInstant(warp.destination, warp.landing, warp.options)) {
          this.finishDoorFade();
          return false;
        }
        return true;
      }
      this.playTransitionSfxForEvent(event);
      if (event.type === "complete") {
        this.finishDoorFade();
        return false;
      }
      return true;
    } catch {
      this.finishDoorFade();
      return false;
    }
  }

  private syncDoorFadeOverlay(): void {
    const overlay = this.ensureDoorFadeOverlay();
    const active = isMapTransitionActive(this.doorTransitionState);
    overlay.setSize(this.scale.width, this.scale.height);
    overlay.setVisible(active);
    overlay.setAlpha(transitionOverlayAlpha(this.doorTransitionState));
  }

  private playTransitionSfxForEvents(events: readonly MapTransitionEvent[]): void {
    for (const event of events) {
      this.playTransitionSfxForEvent(event);
    }
  }

  private playTransitionSfxForEvent(event: MapTransitionEvent): void {
    const cue = transitionSfxCueForEvent(event);
    if (cue) {
      this.playTransitionSfxCue(cue);
    }
  }

  private playTransitionSfxCue(cue: TransitionSfxCue): void {
    switch (cue) {
      case "doorOpen":
        this.transitionSfx.doorOpen();
        break;
      case "doorClose":
        this.transitionSfx.doorClose();
        break;
      case "footsteps":
        this.transitionSfx.footsteps();
        break;
      case "escalatorHum":
        this.transitionSfx.escalatorHum();
        break;
      case "whoosh":
        this.transitionSfx.whoosh();
        break;
    }
  }

  private finishDoorFade(): void {
    this.doorTransitionState = idleMapTransition();
    this.activeDoorWarp = undefined;
    this.doorFadeOverlay?.setAlpha(0);
    this.doorFadeOverlay?.setVisible(false);
    this.doorFadePhase = "none";
    if (this.canReleaseDoorFadeLock()) {
      unlockPlayer(this.playerState);
    }
    this.publish();
  }

  private ensureDoorFadeOverlay(): Phaser.GameObjects.Rectangle {
    if (this.doorFadeOverlay) {
      this.doorFadeOverlay.setSize(this.scale.width, this.scale.height);
      return this.doorFadeOverlay;
    }
    this.doorFadeOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DOOR_FADE_OVERLAY_DEPTH)
      .setAlpha(0)
      .setVisible(false);
    return this.doorFadeOverlay;
  }

  private destroyDoorFadeOverlay(): void {
    this.doorTransitionState = idleMapTransition();
    this.activeDoorWarp = undefined;
    this.doorFadeOverlay?.destroy();
    this.doorFadeOverlay = undefined;
    this.doorFadePhase = "none";
  }

  private isDoorFadeActive(): boolean {
    return isMapTransitionActive(this.doorTransitionState);
  }

  private doorFadePhaseForTransition(state: MapTransitionState): DoorFadePhase {
    if (!isMapTransitionActive(state)) {
      return "none";
    }
    return state.phase === "fadeIn" ? "fade-in" : "fade-out";
  }

  private canReleaseDoorFadeLock(): boolean {
    return !this.menuState.open && !this.dialogue.open && !this.eventSequence?.running;
  }

  private warnInvalidDoorWarp(
    destination: EventWarpDestination,
    resolved: { x: number; y: number },
    triggerWorldPixel?: { x: number; y: number }
  ): void {
    const raw = destination.worldPixel ?? destination;
    const triggerKey = triggerWorldPixel ? `${triggerWorldPixel.x},${triggerWorldPixel.y}` : `${this.playerState.x},${this.playerState.y}`;
    const warningKey = `${triggerKey}->${raw.x},${raw.y}`;
    if (this.warnedInvalidDoorWarps.has(warningKey)) {
      return;
    }
    this.warnedInvalidDoorWarps.add(warningKey);
    console.warn(
      "Door warp aborted: destination did not resolve to a walkable footprint.",
      {
        triggerWorldPixel: triggerWorldPixel ?? { x: this.playerState.x, y: this.playerState.y },
        destinationWorldPixel: { x: raw.x, y: raw.y },
        resolvedWorldPixel: resolved,
        direction: destination.direction
      }
    );
  }

  private actorBodyBlocked(x: number, y: number, bodyX: number, bodyY: number): boolean {
    return Math.abs(x - bodyX) < 14 && y > bodyY - 18 && y < bodyY + 10;
  }

  private interactionCandidates(): InteractionCandidate[] {
    return [...this.npcRuntimes.values()]
      .filter((npc) => this.npcInsideActiveRoom(npc))
      .map((npc) => ({
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
    const target = this.interactionTarget();
    if (this.menuState.open) {
      this.prompt = "Arrows: choose | Z: select | X: back";
    } else if (this.dialogue.open) {
      this.prompt = "Z: advance | X: close";
    } else if (target) {
      this.prompt = this.talkPrompt(target.id);
    } else if (this.inRange()) {
      this.prompt = "Turn to face them, then press Z";
    } else {
      this.prompt = "Move: Arrows/WASD. Approach someone, then press Z.";
    }
  }

  private talkPrompt(npcId: number): string {
    const name = this.npcName(npcId);
    return name ? `Z: talk to ${name}` : "Z: talk";
  }

  private npcName(npcId: number): string | undefined {
    const npc = [...this.npcRuntimes.values()].find((runtime) => runtime.data.npcId === npcId);
    const name = (npc?.data as { name?: unknown } | undefined)?.name;
    return typeof name === "string" && name.trim().length > 0 ? name.trim() : undefined;
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
        this.completeClosedDialogue();
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
    if (actionId === TALK_MENU_ACTION_ID) {
      this.handleTalkAction();
      return;
    }
    const action = parseMenuAction(actionId);
    if (!action) {
      this.showMenuResult("Nothing happened.");
      return;
    }
    if (action.kind === "save") {
      this.saveGame(true);
      return;
    }
    if (action.kind === "atm") {
      this.handleAtmAction(action);
      return;
    }
    if (action.kind === "shopBuy") {
      this.handleShopBuyAction(action);
      return;
    }
    if (action.kind === "shopSell") {
      this.handleShopSellAction(action);
      return;
    }
    if (action.kind === "shopCancel") {
      this.closeMenu();
      return;
    }
    if (action.kind === "itemUse") {
      this.handleItemUseAction(action);
      return;
    }
    this.handleEquipAction(action);
  }

  private handleTalkAction(): void {
    const decision = resolveTalkMenuAction({
      hasInteractionTarget: Boolean(this.interactionTarget()),
      dialogueCanOpen: this.dialogue.canOpen()
    });
    if (decision.kind === "message") {
      this.showMenuResult(decision.message);
      return;
    }
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.refreshMenuScreens();
    if (decision.kind === "openDialogue") {
      this.openDialogue();
      return;
    }
    this.closeMenu();
  }

  private handleAtmAction(action: Extract<MenuAction, { kind: "atm" }>): void {
    const amount = action.all
      ? (action.op === "deposit" ? this.partyState.wallet : this.partyState.bank)
      : action.amount ?? 0;
    const moved = this.partyState.applyAtm(action.op, amount);
    this.showMenuResult(moved > 0 ? "Done." : "No funds moved.");
  }

  private handleShopBuyAction(action: Extract<MenuAction, { kind: "shopBuy" }>): void {
    const shop = this.data_.shops?.shops.find((entry) => entry.id === action.storeId);
    if (!shop?.itemIds.includes(action.itemId)) {
      this.showMenuResult("Not for sale.");
      return;
    }
    const item = this.itemById(action.itemId) ?? fallbackShopItem(action.itemId);
    const result = this.partyState.buyItem(action.char, item);
    this.showMenuResult(result.ok ? "Bought." : "Not enough $swag.");
  }

  private handleShopSellAction(action: Extract<MenuAction, { kind: "shopSell" }>): void {
    if (this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't sell that.");
      return;
    }
    const item = this.itemById(action.itemId) ?? fallbackShopItem(action.itemId);
    const result = this.partyState.sellItem(action.char, item);
    this.showMenuResult(result.ok ? "Sold." : "You can't sell that.");
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
    this.activeShopStoreId = undefined;
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

  private closeMenu(): void {
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.refreshMenuScreens();
    if (!this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private cancelCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.menuState = cancelMenu(this.menuState);
    if (!this.menuState.open) {
      this.activeShopStoreId = undefined;
    }
    if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private refreshMenuScreens(): void {
    const resolver = createDialogueResolver(this.data_);
    const screens = buildMenuScreens(buildStatusViewModel({
      characters: this.data_.characters,
      partyState: this.partyState
    }), {
      characters: this.data_.characters,
      items: this.data_.items,
      psi: this.data_.psi,
      shops: this.data_.shops,
      partyState: this.partyState,
      resolver
    });
    if (this.activeShopStoreId !== undefined) {
      screens.push(...buildShopMenuScreens(buildShopViewModel({
        characters: this.data_.characters,
        items: this.data_.items,
        shops: this.data_.shops,
        partyState: this.partyState,
        resolver,
        storeId: this.activeShopStoreId
      })));
    }
    this.menuScreens = new Map(screens.map((screen) => [screen.id, screen]));
  }

  private openShopMenu(storeId: number): void {
    this.activeShopStoreId = Math.max(0, Math.floor(storeId));
    this.refreshMenuScreens();
    const root = this.menuScreens.get(shopRootScreenId(this.activeShopStoreId));
    if (!root) {
      this.activeShopStoreId = undefined;
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
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

  private applyReturnRestore(): (SavePlayerSnapshot & { mode: "chunked" }) | undefined {
    const restore = this.restoreState;
    if (!restore) {
      return undefined;
    }

    this.gameFlags.clear();
    for (const flag of restore.flags.strings) {
      this.gameFlags.set(flag);
    }
    for (const flag of restore.flags.numeric) {
      this.gameFlags.setNum(flag);
    }
    this.partyState.restore(restore.party);
    this.encounterCooldownMs = Math.max(this.encounterCooldownMs, restore.encounter.cooldownMs);
    this.encounterRng.setState(restore.encounter.rngSeed);
    this.encounterSeed = restore.encounter.rngSeed;
    this.lastEncounterGroup = restore.encounter.lastEncounterGroup;
    this.encounterEnabled = this.encounterEnabled && restore.encounter.enabled;

    const player = {
      mode: "chunked" as const,
      mapId: this.saveMapId(),
      x: restore.player.x,
      y: restore.player.y,
      facing: restore.player.facing
    };
    if (!this.isCompatibleSavePlayer(player) || !this.isPlayableWorldPoint(player)) {
      return undefined;
    }
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
    const events = this.interactionEventsForNpc(npc.data);
    if (events.length === 0) {
      return;
    }
    this.pauseNpcForDialogue(npc);
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents(events);
    this.updatePrompt();
    this.publish();
  }

  private interactionEventsForNpc(npc: RuntimeNpcData): GameEvent[] {
    if (isAddedWorldChunkedNpc(npc)) {
      return addedNpcInteractionEvents(
        { npcId: npc.npcId, interaction: npc.addedInteraction },
        this.data_.dialogueLibrary
      );
    }
    return interactionEvents(
      npc,
      this.targetReference,
      this.gameFlags,
      this.data_.customDialogue,
      this.data_.dialogueLibrary
    );
  }

  private runEvents(events: GameEvent[]): void {
    dispatchInteractionEvents(events, {
      startDialogue: (event) => this.startInteractionDialogue(event),
      setFlag: (flag) => this.gameFlags.set(flag),
      openShop: (storeId) => this.openShopMenu(storeId),
      deferShop: (storeId) => {
        this.pendingInteractionShopStoreId = storeId;
      },
      heal: (scope) => this.healParty(scope),
      save: () => this.saveGame(false),
      isDialogueActive: () => this.dialogue.open || Boolean(this.eventSequence?.running)
    });
  }

  private healParty(scope: HealEvent["scope"]): void {
    if (scope !== "full") {
      return;
    }
    this.partyState.restore();
    this.refreshMenuScreens();
    this.updatePrompt();
    this.publish();
  }

  private startInteractionDialogue(event: DialogueEvent): void {
    if (event.pages) {
      this.dialogue.start(buildInlineDialoguePages(event.pages));
    } else if (!this.startEventSequence(event.reference)) {
      this.dialogue.start(resolveScriptedDialoguePages(
        this.data_.customDialogue,
        this.data_.dialogueLibrary,
        this.data_.scripts,
        event.reference,
        this.gameFlags
      ));
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
      resolveWarpDestination: (dest, style) => this.resolveEventWarpDestination(dest, style),
      applyWarpDestination: (destination) => this.applyEventWarpDestination(destination),
      startBattle: (group) => this.startEventBattleForCurrentMode(group),
      openShop: (storeId) => this.openShopForCurrentMode(storeId),
      isEffectSupported: (effect) => this.isEventEffectSupportedForCurrentMode(effect),
      onUnsupportedEffect: (effect) => this.warnUnsupportedEventEffect(effect)
    });
    this.eventSequence = new RuntimeEventSequence(this.data_.scripts, host);
  }

  private startEventSequence(reference: string): boolean {
    return this.eventSequence?.start(reference, {
      onComplete: () => this.afterDialogueClosed()
    }) ?? false;
  }

  private maybeStartNewGameStartup(spawn: { x: number; y: number }): void {
    const opening = this.newGameOpening;
    const decision = shouldRunNewGameStartup({
      hasSave: this.hasSave,
      startupRef: opening?.eventRef ?? this.world_.player.newGameStartupRef
    });
    if (!decision.run) {
      this.startupMode = "startup";
      this.newGameStartupRecord = this.startupRecord({
        attempted: false,
        started: false,
        status: "skipped",
        skippedReason: decision.skippedReason,
        initialPlayer: spawn,
        finalPlayer: this.currentPlayerPoint(),
        finalPlayerControllable: this.isPlayerControllable()
      });
      publishNewGameStartupRecord(this.newGameStartupRecord);
      return;
    }

    this.startupRunActive = true;
    this.startupRunFinalized = false;
    this.startupMode = opening ? "opening" : "startup";
    this.startupInitialSpawn = spawn;
    this.startupFallbackReason = undefined;
    lockPlayer(this.playerState, this.playerFrames);
    this.newGameStartupRecord = this.startupRecord({
      attempted: true,
      started: true,
      reference: decision.reference,
      status: "running",
      initialPlayer: spawn,
      finalPlayer: this.currentPlayerPoint(),
      finalPlayerControllable: false
    });

    const started = this.eventSequence?.start(decision.reference, {
      onComplete: (result) => this.finalizeNewGameStartup(result)
    }) ?? false;
    if (!started) {
      this.startupRunActive = false;
      this.startupMode = "startup";
      unlockPlayer(this.playerState);
      this.newGameStartupRecord = this.startupRecord({
        attempted: true,
        started: false,
        reference: decision.reference,
        status: "skipped",
        skippedReason: "unresolved_ref",
        fallbackApplied: true,
        fallbackReason: "unresolved_ref",
        initialPlayer: spawn,
        finalPlayer: this.currentPlayerPoint(),
        finalPlayerControllable: this.isPlayerControllable()
      });
      publishNewGameStartupRecord(this.newGameStartupRecord);
      return;
    }

    if (this.startupRunActive && this.eventSequence?.running && this.startupMode === "startup") {
      this.abortStartupAtControlStart(decision.reference);
      return;
    }
    this.updatePrompt();
  }

  private finalizeNewGameStartup(result: NonNullable<EventHostDebug["result"]>): void {
    if (this.startupRunFinalized) {
      return;
    }
    this.startupRunFinalized = true;
    const completedOpening = this.startupMode === "opening";
    const reference = this.newGameStartupRecord?.reference ?? this.world_.player.newGameStartupRef;
    let fallbackApplied = false;
    let fallbackReason = this.startupFallbackReason;
    if (fallbackReason || !this.isPlayableWorldPoint(this.currentPlayerPoint())) {
      fallbackApplied = true;
      fallbackReason ??= "unsafe_final_player_position";
      this.restoreStartupSpawn();
    }
    this.startupRunActive = false;
    this.startupMode = "startup";
    if (completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
    }
    if (this.dialogue.open && result.status === "aborted") {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    const finalPlayer = this.currentPlayerPoint();
    this.newGameStartupRecord = this.startupRecord({
      attempted: true,
      started: true,
      ...(reference ? { reference } : {}),
      status: result.status,
      truncated: result.truncated,
      ...(result.truncatedReason ? { truncatedReason: result.truncatedReason } : {}),
      abortedReason: result.status === "aborted" ? result.reason : undefined,
      fallbackApplied,
      ...(fallbackReason ? { fallbackReason } : {}),
      initialPlayer: this.startupInitialSpawn,
      finalPlayer,
      finalPlayerControllable: this.isPlayerControllable(),
      eventDebug: this.eventSequence?.debug()
    });
    publishNewGameStartupRecord(this.newGameStartupRecord);
    this.updatePrompt();
    this.publish();
  }

  private applyEventWarpDestination(destination: EventWarpDestination): boolean | void {
    if (this.startupRunActive && this.startupMode === "startup") {
      return this.applyStartupWarpDestination(destination);
    }
    this.applyDoorWarp(destination, { kind: "teleport" });
  }

  private applyStartupWarpDestination(destination: EventWarpDestination): boolean {
    void destination;
    // New-game startup scripts may contain setup warps, but control starts at
    // the resolved spawn (?spawn override or generated canonical start).
    // Abort on the first position warp so input is released at the start point.
    return false;
  }

  private abortStartupAtControlStart(reference: string): void {
    if (this.startupRunFinalized) {
      return;
    }
    this.startupRunFinalized = true;
    const completedOpening = this.startupMode === "opening";
    this.eventSequence?.abort("startup_control_start");
    this.startupRunActive = false;
    this.startupMode = "startup";
    if (completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
    }
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    const eventDebug = this.eventSequence?.debug();
    const result = eventDebug?.result;
    this.newGameStartupRecord = this.startupRecord({
      attempted: true,
      started: true,
      reference,
      status: "aborted",
      abortedReason: result?.reason ?? "startup_control_start",
      initialPlayer: this.startupInitialSpawn,
      finalPlayer: this.currentPlayerPoint(),
      finalPlayerControllable: this.isPlayerControllable(),
      eventDebug
    });
    publishNewGameStartupRecord(this.newGameStartupRecord);
    this.updatePrompt();
    this.publish();
  }

  private startEventBattleForCurrentMode(group: number): boolean {
    if (this.startupRunActive) {
      return false;
    }
    return this.startEventBattle(group);
  }

  private resolveIntroMeteorBeatForStart(): void {
    this.introMeteorBeat = undefined;
    if (!this.newGameOpening) {
      return;
    }
    const resolution = resolveIntroMeteorBeatStart(this.world_, this.data_.scripts, this.data_.battle);
    if (resolution.resolved) {
      this.introMeteorBeat = resolution.start;
      return;
    }
    this.warnIntroMeteorSkip(resolution.reason);
  }

  private resolveIntroFirstBossBeatForStart(): void {
    this.introFirstBossBeat = undefined;
    const resolution = resolveIntroFirstBossBeatStart(this.world_, this.data_.scripts, this.data_.battle);
    if (resolution.resolved) {
      this.introFirstBossBeat = resolution.start;
      return;
    }
    this.warnIntroFirstBossSkip(resolution.reason);
  }

  private maybeStartIntroMeteorBeat(): boolean {
    const beat = this.introMeteorBeat;
    if (!beat || this.menuState.open || this.dialogue.open || this.eventSequence?.running || this.isDoorFadeActive()) {
      return false;
    }
    if (this.playerState.inputLocked) {
      return false;
    }
    const decision = decideIntroMeteorBeatFire({
      introActive: Boolean(this.newGameOpening),
      openingComplete: this.startupRunFinalized && !this.startupRunActive,
      playerInTriggerRegion: pointInRect(this.playerState, beat.trigger),
      alreadyFired: this.gameFlags.has(INTRO_METEOR_BEAT_FIRED_FLAG)
    });
    if (!decision.fire) {
      return false;
    }

    this.gameFlags.set(INTRO_METEOR_BEAT_FIRED_FLAG);
    lockPlayer(this.playerState, this.playerFrames);
    const startResult = startScriptedBeatDialogue({
      reference: beat.dialogueRef,
      customDialogue: this.data_.customDialogue,
      dialogueLibrary: this.data_.dialogueLibrary,
      onComplete: () => this.completeIntroMeteorDialogue(beat),
      startOverrideDialogue: (pages, onComplete) => this.startOverriddenScriptedDialogue(pages, onComplete),
      startEventSequence: (reference, onComplete) => this.eventSequence?.start(reference, { onComplete }) ?? false
    });
    if (startResult === "unavailable") {
      this.warnIntroMeteorSkip("dialogue_unavailable");
      this.finishIntroMeteorBeatWithoutBattle();
      return true;
    }
    this.updatePrompt();
    this.publish();
    return true;
  }

  private maybeStartIntroFirstBossBeat(): boolean {
    const beat = this.introFirstBossBeat;
    if (!beat || this.menuState.open || this.dialogue.open || this.eventSequence?.running || this.isDoorFadeActive()) {
      return false;
    }
    if (this.playerState.inputLocked) {
      return false;
    }
    const decision = decideIntroFirstBossBeatFire({
      bedroomOpeningComplete: this.gameFlags.has(INTRO_BEDROOM_OPENING_DONE_FLAG),
      meteorBeatComplete: this.gameFlags.has(INTRO_METEOR_BEAT_FIRED_FLAG) && !this.newGameOpening,
      playerInTriggerRegion: pointInRect(this.playerState, beat.trigger),
      alreadyDone: this.gameFlags.has(INTRO_FIRST_BOSS_DONE_FLAG)
    });
    if (!decision.fire) {
      return false;
    }

    lockPlayer(this.playerState, this.playerFrames);
    const startResult = startScriptedBeatDialogue({
      reference: beat.dialogueRef,
      customDialogue: this.data_.customDialogue,
      dialogueLibrary: this.data_.dialogueLibrary,
      onComplete: () => this.completeIntroFirstBossDialogue(beat),
      startOverrideDialogue: (pages, onComplete) => this.startOverriddenScriptedDialogue(pages, onComplete),
      startEventSequence: (reference, onComplete) => this.eventSequence?.start(reference, { onComplete }) ?? false
    });
    if (startResult === "unavailable") {
      this.warnIntroFirstBossSkip("dialogue_unavailable");
      this.finishIntroFirstBossBeatWithoutBattle();
      return true;
    }
    this.updatePrompt();
    this.publish();
    return true;
  }

  private startOverriddenScriptedDialogue(pages: DialoguePage[], onComplete: () => void): void {
    this.pendingScriptedDialogueComplete = onComplete;
    this.dialogue.start(pages);
  }

  private completeIntroMeteorDialogue(beat: IntroMeteorBeatStart): void {
    this.newGameOpening = undefined;
    this.warnIntroActorVmStubs();
    this.ensureIntroSoloParty();
    const battleStarted = this.startEventBattle(beat.battleGroupId);
    const transition = decideIntroMeteorBattleTransition({
      battleGroupResolved: true,
      battleStarted
    });
    if (transition.action === "battle") {
      return;
    }
    this.warnIntroMeteorSkip(transition.reason);
    this.finishIntroMeteorBeatWithoutBattle();
  }

  private completeIntroFirstBossDialogue(beat: IntroFirstBossBeatStart): void {
    if (!this.data_.battle || !this.battleGroupExists(beat.battleGroupId) || !this.player) {
      this.warnIntroFirstBossSkip("battle_unavailable");
      this.finishIntroFirstBossBeatWithoutBattle();
      return;
    }

    this.gameFlags.set(INTRO_FIRST_BOSS_DONE_FLAG);
    const battleStarted = this.startEventBattle(beat.battleGroupId);
    if (battleStarted) {
      return;
    }
    this.warnIntroFirstBossSkip("battle_start_failed");
    this.finishIntroFirstBossBeatWithoutBattle();
  }

  private ensureIntroSoloParty(): void {
    const firstCharacter = this.data_.characters?.characters[0];
    if (!firstCharacter) {
      return;
    }
    const snapshot = this.partyState.snapshot();
    this.partyState.restore({
      ...snapshot,
      partyIds: [firstCharacter.id]
    });
  }

  private finishIntroMeteorBeatWithoutBattle(): void {
    this.newGameOpening = undefined;
    this.afterDialogueClosed();
    this.updatePrompt();
    this.publish();
  }

  private finishIntroFirstBossBeatWithoutBattle(): void {
    this.afterDialogueClosed();
    this.updatePrompt();
    this.publish();
  }

  private warnIntroMeteorSkip(reason: string): void {
    if (this.warnedIntroMeteorSkips.has(reason)) {
      return;
    }
    this.warnedIntroMeteorSkips.add(reason);
    console.warn("Skipping new-game meteor intro beat.", reason);
  }

  private warnIntroFirstBossSkip(reason: string): void {
    if (this.warnedIntroFirstBossSkips.has(reason)) {
      return;
    }
    this.warnedIntroFirstBossSkips.add(reason);
    console.warn("Skipping reconstructed first-boss story beat.", reason);
  }

  private warnIntroActorVmStubs(): void {
    for (const stub of INTRO_ACTOR_VM_STUBS) {
      if (this.warnedIntroActorVmStubs.has(stub.id)) {
        continue;
      }
      this.warnedIntroActorVmStubs.add(stub.id);
      console.warn("Stubbed EarthBound actor-VM cutscene.", {
        id: stub.id,
        beat: stub.beat,
        reason: stub.reason
      });
    }
  }

  private openShopForCurrentMode(storeId: number): boolean | void {
    if (this.startupRunActive) {
      return false;
    }
    this.openShopMenu(storeId);
  }

  private isEventEffectSupportedForCurrentMode(effect: EventEffect): boolean {
    if (!this.startupRunActive || this.startupMode !== "opening") {
      return true;
    }
    switch (effect.kind) {
      case "text":
      case "pause":
      case "prompt":
      case "setFlag":
      case "unsetFlag":
      case "warp":
      case "teleport":
      case "anchorWarp":
      case "terminator":
        return true;
      default:
        return false;
    }
  }

  private warnUnsupportedEventEffect(effect: EventEffect): void {
    if (!this.startupRunActive || this.startupMode !== "opening") {
      return;
    }
    const detail = effect.kind === "control" ? effect.code ?? "control" : effect.kind;
    console.warn("Skipping unsupported new-game opening event op.", detail);
  }

  private handleEncounterStep(): boolean {
    const crossedTile = this.syncEncounterTileState();
    if (!crossedTile || !this.canRollEncounter()) {
      return false;
    }
    const result = rollEncounter(this.currentEncounterSector(), () => this.encounterRng.next(), {
      isFlagSet: (flag) => this.gameFlags.isSet(flag)
    });
    if (!result) {
      return false;
    }
    return this.startEncounterBattle(result.enemyGroup);
  }

  private canRollEncounter(): boolean {
    return this.encounterEnabled
      && this.encounterCooldownMs <= 0
      && Boolean(this.data_.encounters && this.data_.battle)
      && !this.menuState.open
      && !this.dialogue.open
      && !this.eventSequence?.running
      && !this.isDoorFadeActive();
  }

  private startEncounterBattle(group: number, forcedAdvantage?: EncounterAdvantage): boolean {
    const advantage = forcedAdvantage ?? this.encounterAdvantageForGroup(group);
    if (advantage === "instantWin") {
      return this.resolveInstantWinEncounter(group);
    }
    return this.startBattleWithReturn(group, "encounter", advantage);
  }

  private startBattleWithReturn(
    group: number,
    source: BattleReturnSource,
    encounterAdvantage: EncounterAdvantage = "normal"
  ): boolean {
    if (!this.data_.battle || !this.battleGroupExists(group) || !this.player) {
      return false;
    }
    this.lastEncounterGroup = group;
    this.scene.stop("ui");
    this.scene.start("battle", {
      battleData: this.data_.battle,
      groupId: group,
      characters: this.data_.characters,
      partyMembers: this.battlePartyMembers(),
      wallet: this.partyState.wallet,
      items: this.data_.items,
      psi: this.data_.psi,
      font: this.data_.font,
      window: this.data_.window,
      spriteOverrides: this.data_.spriteOverrides,
      backgroundOverrides: this.data_.backgroundOverrides,
      battleRules: this.data_.battleRules,
      encounterAdvantage,
      returnTo: this.battleReturnContext(group, source)
    });
    return true;
  }

  private encounterAdvantageForGroup(group: number): EncounterAdvantage {
    const party = this.battlePartyMembers();
    const enemies = this.enemiesForBattleGroup(group);
    return party && enemies.length > 0 ? computeEncounterAdvantage(party, enemies) : "normal";
  }

  private resolveInstantWinEncounter(group: number): boolean {
    if (!this.data_.battle || !this.battleGroupExists(group) || !this.player) {
      return false;
    }
    const enemies = this.enemiesForBattleGroup(group);
    if (enemies.length === 0) {
      return false;
    }
    const battle = createBattleState(enemies, {
      characters: this.data_.characters,
      partyMembers: this.battlePartyMembers(),
      wallet: this.partyState.wallet
    });
    const rewards = resolveInstantWinRewards(battle.party, enemies, instantWinRewardOptions({
      wallet: battle.wallet,
      roundNumber: battle.roundNumber,
      rng: createBattleRng(battleRngSeedForGroup(group, enemies)),
      items: this.data_.items?.items,
      psi: this.data_.psi?.psi
    }));
    this.partyState.applyBattleResult(rewards.state.party, rewards.state.wallet);
    this.lastEncounterGroup = group;
    this.encounterCooldownMs = ENCOUNTER_RETURN_COOLDOWN_MS;
    this.refreshMenuScreens();
    this.dialogue.start(buildInlineDialoguePages(["You won!"]));
    this.updatePrompt();
    this.publish();
    return true;
  }

  private battleReturnContext(group: number, source: BattleReturnSource): BattleReturnContext {
    return {
      sceneKey: "chunked-world",
      gameData: this.data_,
      saveSlot: this.saveSlot,
      saveSlots: this.saveSlots,
      restore: {
        player: {
          x: this.playerState.x,
          y: this.playerState.y,
          facing: this.playerState.facing
        },
        flags: {
          strings: this.gameFlags.list(),
          numeric: this.gameFlags.listNums()
        },
        party: this.partyState.snapshot(),
        encounter: {
          enabled: this.encounterEnabled,
          cooldownMs: ENCOUNTER_RETURN_COOLDOWN_MS,
          rngSeed: this.encounterRng.state(),
          lastEncounterGroup: group
        },
        source
      }
    };
  }

  private battlePartyMembers(): PartyMember[] | undefined {
    if (!this.data_.characters) {
      return undefined;
    }
    const all = this.partyState.applyToPartyMembers(this.data_.characters.characters.map(buildPartyMember));
    // Battle only the active party (Act 1 = solo Bosch); never the full roster.
    const activeIds = new Set(this.partyState.party());
    return activeIds.size > 0 ? all.filter((member) => activeIds.has(member.id)) : all;
  }

  private battleGroupExists(group: number): boolean {
    return Number.isInteger(group) && group >= 0 && Boolean(this.data_.battle?.groups.some((entry) => entry.id === group));
  }

  private enemiesForBattleGroup(group: number): BattleEnemy[] {
    const battle = this.data_.battle;
    const battleGroup = battle?.groups.find((entry) => entry.id === group);
    if (!battle || !battleGroup) {
      return [];
    }
    return battleGroup.enemyIds
      .map((enemyId) => battle.enemies.find((enemy) => enemy.id === enemyId))
      .filter((enemy): enemy is BattleEnemy => Boolean(enemy));
  }

  private registerForceEncounter(): void {
    this.forceEncounterHook = (groupId?: number, advantage?: unknown) => this.forceEncounter(groupId, advantage);
    (globalThis as Record<string, unknown>).__forceEncounter = this.forceEncounterHook;
  }

  private unregisterForceEncounter(): void {
    const globals = globalThis as Record<string, unknown>;
    if (this.forceEncounterHook && globals.__forceEncounter === this.forceEncounterHook) {
      delete globals.__forceEncounter;
    }
    this.forceEncounterHook = undefined;
  }

  private forceEncounter(groupId?: number, advantage?: unknown): ForceEncounterResult {
    const enemyGroup = normalizeOptionalGroupId(groupId) ?? this.firstEncounterGroupForCurrentSector();
    if (enemyGroup === undefined) {
      return { started: false, reason: "no encounter group available" };
    }
    const resolvedAdvantage = normalizeForcedEncounterAdvantage(advantage) ?? this.encounterAdvantageForGroup(enemyGroup);
    const started = this.startEncounterBattle(enemyGroup, resolvedAdvantage);
    return started
      ? { started: true, enemyGroup, advantage: resolvedAdvantage }
      : { started: false, enemyGroup, advantage: resolvedAdvantage, reason: "battle data unavailable for encounter group" };
  }

  private firstEncounterGroupForCurrentSector(): number | undefined {
    const sector = this.currentEncounterSector();
    return sector?.subGroups[0]?.candidates[0]?.enemyGroup;
  }

  private currentEncounterSector() {
    if (this.currentSectorIndex === undefined) {
      return undefined;
    }
    return this.data_.encounters?.sectors[String(this.currentSectorIndex)];
  }

  private syncEncounterTileState(): boolean {
    const tile = this.currentPlayerTile();
    const previous = this.lastPlayerTile;
    this.lastPlayerTile = tile;
    if (this.data_.encounters) {
      this.currentSectorIndex = sectorIndexForTile(tile.x, tile.y, this.data_.encounters);
    } else {
      this.currentSectorIndex = undefined;
    }
    return Boolean(previous && (previous.x !== tile.x || previous.y !== tile.y));
  }

  private currentPlayerTile(): TilePoint {
    return {
      x: Math.floor(this.playerState.x / this.world_.tileSize),
      y: Math.floor(this.playerState.y / this.world_.tileSize)
    };
  }

  private resolveEventWarpDestination(dest: number, style?: number): EventWarpDestination | undefined {
    return resolveTeleportDestination(this.data_.teleportDestinations, dest, style);
  }

  private startEventBattle(group: number): boolean {
    return this.startBattleWithReturn(group, "event");
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
    if (!this.menuState.open && !this.isDoorFadeActive()) {
      unlockPlayer(this.playerState);
    }
    this.restoreActiveNpc();
    this.refreshStreaming(true);
    if (this.pendingInteractionShopStoreId !== undefined) {
      const storeId = this.pendingInteractionShopStoreId;
      this.pendingInteractionShopStoreId = undefined;
      this.openShopMenu(storeId);
      return;
    }
    this.updatePrompt();
  }

  private completeClosedDialogue(): void {
    const onComplete = this.pendingScriptedDialogueComplete;
    this.pendingScriptedDialogueComplete = undefined;
    if (onComplete) {
      onComplete();
      return;
    }
    this.afterDialogueClosed();
  }

  private startupRecord(options: {
    attempted: boolean;
    started: boolean;
    reference?: string;
    skippedReason?: NewGameStartupRunDebug["skippedReason"];
    status: NewGameStartupRunDebug["status"];
    truncated?: boolean;
    truncatedReason?: string;
    abortedReason?: string;
    fallbackApplied?: boolean;
    fallbackReason?: string;
    eventDebug?: EventHostDebug;
    initialPlayer?: { x: number; y: number };
    finalPlayer?: { x: number; y: number };
    finalPlayerControllable: boolean;
  }): NewGameStartupRunDebug {
    const debug = options.eventDebug;
    const records = debug?.records ?? {
      warps: 0,
      warpNoops: 0,
      battles: 0,
      battleNoops: 0,
      shops: 0,
      audio: 0,
      unsupported: 0,
      unsupportedByKind: {}
    };
    return {
      attempted: options.attempted,
      started: options.started,
      ...(options.reference ? { reference: options.reference } : {}),
      ...(options.skippedReason ? { skippedReason: options.skippedReason } : {}),
      status: options.status,
      truncated: options.truncated ?? debug?.result?.truncated ?? false,
      ...(options.truncatedReason ?? debug?.result?.truncatedReason
        ? { truncatedReason: options.truncatedReason ?? debug?.result?.truncatedReason }
        : {}),
      ...(options.abortedReason ? { abortedReason: options.abortedReason } : {}),
      fallbackApplied: options.fallbackApplied ?? false,
      ...(options.fallbackReason ? { fallbackReason: options.fallbackReason } : {}),
      effectsDispatched: debug?.effectsDispatched ?? 0,
      effectsByKind: startupCoverageByKind(debug?.effectsByKind ?? {}),
      records: { ...records },
      ...(options.initialPlayer ? { initialPlayer: { ...options.initialPlayer } } : {}),
      ...(options.finalPlayer ? { finalPlayer: { ...options.finalPlayer } } : {}),
      finalPlayerControllable: options.finalPlayerControllable
    };
  }

  private currentPlayerPoint(): { x: number; y: number } {
    return { x: this.playerState.x, y: this.playerState.y };
  }

  private isPlayerControllable(): boolean {
    return !this.menuState.open
      && !this.dialogue.open
      && !this.eventSequence?.running
      && !this.isDoorFadeActive()
      && !this.playerState.inputLocked;
  }

  private isPlayableWorldPoint(point: { x: number; y: number }): boolean {
    const clamped = this.clampSpawn(point);
    if (clamped.x !== point.x || clamped.y !== point.y) {
      return false;
    }
    const chunk = this.chunkByKey.get(chunkKey(chunkForWorldPixel(point, this.grid())));
    if (!chunk || chunk.void) {
      return false;
    }
    return this.walkableFootprint(point);
  }

  private restoreStartupSpawn(): void {
    const spawn = this.startupInitialSpawn;
    if (!spawn) {
      return;
    }
    this.playerState.x = spawn.x;
    this.playerState.y = spawn.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.playerState.walkClockMs = 0;
    this.playerState.animKey = `idle-${this.playerState.facing}`;
    this.playerState.animFrame = this.playerFrames[this.playerState.facing][0];
    this.currentChunk = undefined;
    this.activeRoomBounds = undefined;
    if (this.player) {
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      if (this.player instanceof Phaser.GameObjects.Sprite) {
        this.player.setFrame(this.playerState.animFrame);
      }
      this.setActorSortDepth(this.player);
    }
    this.refreshStreaming(true);
    this.refreshRoomBounds(true);
    this.cameras.main.centerOn(spawn.x, spawn.y);
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
    this.pendingScriptedDialogueComplete = undefined;
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
      `collision overlay: ${this.collisionOverlayEnabled ? "on" : "off"}`,
      `door fade: ${this.doorFadePhase}`,
      `encounters: ${this.encounterEnabled ? "on" : "off"} | sector: ${this.currentSectorIndex ?? "?"} | cooldown: ${Math.ceil(this.encounterCooldownMs)}ms`,
      `wallet: ${this.partyState.wallet} | bank: ${this.partyState.bank} | shop: ${this.activeShopStoreId ?? "none"}`,
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

  private resolveWalkableWarpPoint(destination: { x: number; y: number }): DoorWarpLanding {
    return resolveDoorWarpLanding(
      this.clampSpawn(destination),
      this.solidRows,
      this.collisionGrid(),
      { maxRingCells: 8 }
    );
  }

  private syncPlayerObject(): void {
    if (!this.player) {
      return;
    }
    this.player.x = this.playerState.x;
    this.player.y = this.playerState.y;
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.player.setFrame(this.playerState.animFrame);
    }
    this.setActorSortDepth(this.player);
  }

  private setActorSortDepth(actor: SortableActor): void {
    actor.setDepth(spriteSortDepth(spriteBottomY({
      y: actor.y,
      originY: actor.originY,
      displayHeight: actor.displayHeight
    })));
  }

  private loadedChunkCount(): number {
    let count = 0;
    for (const streamed of this.chunkObjects.values()) {
      if (isLiveGameObject(streamed.background) || isLiveGameObject(streamed.foreground)) {
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
      doorFadeActive: this.isDoorFadeActive(),
      doorFadePhase: this.doorFadePhase,
      loadedChunkCount: this.loadedChunkCount(),
      activeNpcCount: this.npcRuntimes.size,
      collisionOverlay: this.collisionOverlayEnabled,
      currentChunk: this.currentChunk,
      currentSectorIndex: this.currentSectorIndex,
      encounterEnabled: this.encounterEnabled,
      encounterCooldownMs: Math.ceil(this.encounterCooldownMs),
      encounterSeed: this.encounterRng.state(),
      lastEncounterGroup: this.lastEncounterGroup,
      returnContextActive: this.returnContextActive,
      canInteract: Boolean(target),
      interactionTargetId: target?.id,
      activeNpcId: (this.dialogue.open || this.eventSequence?.running) ? this.activeNpcDialogue?.id : undefined,
      distanceToNpc: distance,
      inInteractionRange: this.inRange(),
      movementBounds: this.movementBounds(),
      statusLines: this.statusLines(),
      metadataLines: this.metadataLines(),
      fontLoaded: Boolean(this.data_.font),
      ...(this.data_.font ? { primaryFontId: this.data_.font.primaryFontId } : {}),
      windowLoaded: Boolean(this.data_.window),
      ...(this.data_.window ? {
        defaultFlavorId: this.data_.window.defaultFlavorId,
        activeFlavorId: activeWindowFlavorId(this.data_.window)
      } : {}),
      tutorial: this.data_.tutorialStatus?.counts,
      resolveStatus: resolveStatus(this.data_),
      dialogueCounters: { opens: this.dialogue.opens, advances: this.dialogue.advances, closes: this.dialogue.closes },
      flags: this.gameFlags.list(),
      flagsNumCount: this.gameFlags.listNums().length,
      hasSave: this.hasSave,
      ...(this.lastSavedAt ? { lastSavedAt: this.lastSavedAt } : {}),
      restoredFromSave: this.restoredFromSave,
      eventExecutor: this.eventSequence?.debug(),
      newGameStartup: this.newGameStartupRecord,
      partyState: this.partyState.counts(),
      shopOpen: this.menuState.open && this.activeShopStoreId !== undefined,
      ...(this.activeShopStoreId !== undefined ? { activeShopStoreId: this.activeShopStoreId } : {}),
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

function fallbackShopItem(itemId: number): Pick<ItemData, "id" | "cost"> {
  return { id: itemId, cost: 0 };
}

function isLiveGameObject<T extends Phaser.GameObjects.GameObject>(object: T | undefined): object is T {
  return Boolean(object?.active && object.scene);
}

function emptyPartyStateSnapshot(): PartyStateSnapshot {
  return {
    wallet: 0,
    bank: 0,
    partyIds: [],
    inventory: [],
    equipped: [],
    battleMembers: []
  };
}

function encountersDisabledBySearch(search: string | undefined): boolean {
  const params = new URLSearchParams(search ?? "");
  return params.get("noEncounters") === "1" || params.get("encounters") === "0";
}

function collisionOverlayEnabledBySearch(search: string | undefined): boolean {
  return normalizeCollisionOverlayFlag(new URLSearchParams(search ?? "").get("collisionOverlay")) ?? false;
}

function normalizeCollisionOverlayFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  return undefined;
}

function normalizeForcedEncounterAdvantage(value: unknown): EncounterAdvantage | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  switch (value.trim().toLowerCase()) {
    case "normal":
      return "normal";
    case "party":
    case "partyfirststrike":
    case "party-first-strike":
      return "partyFirstStrike";
    case "enemy":
    case "enemyfirststrike":
    case "enemy-first-strike":
      return "enemyFirstStrike";
    case "instant":
    case "instantwin":
    case "instant-win":
      return "instantWin";
    default:
      return undefined;
  }
}

function instantWinRewardOptions(options: {
  wallet: number;
  roundNumber: number;
  rng: () => number;
  items?: Array<Pick<ItemData, "id" | "name">>;
  psi?: InstantWinRewardOptions["psi"];
}): InstantWinRewardOptions {
  const result: InstantWinRewardOptions = {
    wallet: options.wallet,
    roundNumber: options.roundNumber,
    rng: options.rng
  };
  if (options.items) {
    result.items = options.items;
  }
  if (options.psi) {
    result.psi = options.psi;
  }
  return result;
}

function normalizeOptionalGroupId(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const group = Math.floor(value);
  return group >= 0 ? group : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function startupCoverageByKind(effectsByKind: Partial<Record<string, number>>): Partial<Record<string, number>> {
  const coverage: Partial<Record<string, number>> = {};
  for (const [kind, count] of Object.entries(effectsByKind)) {
    if (!count) {
      continue;
    }
    const bucket = startupCoverageBucket(kind);
    coverage[bucket] = (coverage[bucket] ?? 0) + count;
  }
  return coverage;
}

function startupCoverageBucket(kind: string): string {
  switch (kind) {
    case "setFlag":
    case "unsetFlag":
    case "event":
      return "flag";
    case "warp":
    case "teleport":
    case "anchorWarp":
      return "warp";
    case "give":
    case "take":
    case "money":
    case "atm":
    case "party":
    case "partyStat":
    case "inflict":
    case "learnPsi":
      return "party";
    case "music":
    case "sound":
    case "musicEffect":
      return "audio";
    case "text":
    case "prompt":
    case "pause":
    case "control":
    case "battle":
    case "shop":
    case "terminator":
      return kind;
    default:
      return "other";
  }
}
