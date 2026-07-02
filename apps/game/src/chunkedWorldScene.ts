import Phaser from "phaser";
import { type BattleEnemy, type Cutscene, type DialoguePage, type EventActorMoveSelector, type EventEffect, type ItemData, type OverworldInteractable, type ScriptCollection, type ScriptCommand, type SpriteOverride, type SpriteSheet, type StoryBarrier, type StoryTrigger, type WorldChunked, type WorldChunkedNpc } from "@eb/schemas";
import { barrierBlocksPoint, isBarrierActive, isOnce, pointInArea, resolveStoryGateReturn, resolveSuppression, selectActiveBossGates, selectStoryTrigger, triggerFiredFlag } from "./storyTriggers";
import { CutsceneRunner, type CutsceneFacing, type CutsceneHost } from "./cutsceneRunner";
import { sectorIndexForTile } from "./encounterLogic";
import { selectSectorEnemyGroup, sectorSpawnBudget, touchAdvantage } from "./overworldEnemies";
import { createStatefulRng, seedFromSearch, type StatefulRng } from "./seededRng";
import type { BattleReturnContext, BattleReturnSource, ChunkedWorldRestore, PendingStoryGate } from "./battleReturn";
import {
  battleRngSeedForGroup,
  computeEncounterAdvantage,
  createBattleRng,
  createBattleState,
  resolveInstantWinRewards,
  type EncounterAdvantage,
  type InstantWinRewardOptions,
  type PlayerCombatantOptions
} from "./battleLogic";
import { expandBattleGroupEnemies } from "./battleGroups";
import {
  messageDoorDialogueReference,
  resolveAdjacentDoorIntentTrigger,
  resolveDoorWarpLanding,
  resolveDoorIntentTrigger,
  type DoorIntentDirection,
  type DoorWarpLanding,
  type DoorTriggerResult,
  type DoorTriggerState
} from "./doorTriggers";
import {
  applyNpcOverride,
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
  type HealEvent,
  type ServiceKind
} from "./eventRunner";
import {
  resolveScriptedDialoguePages,
  startScriptedBeatDialogue
} from "./scriptedDialogueResolver";
import { OpeningCutsceneActorHoldSet } from "./openingCutsceneActorHold";
import {
  resolveTeleportDestination,
  RuntimeEventHost,
  RuntimeEventSequence,
  normalizeActorMoveSelector,
  type EventHostDebug,
  type EventWarpDestination,
  type NormalizedActorMoveSelector
} from "./eventHost";
import { GameFlags } from "./gameFlags";
import { behaviorForNpc, interactionEventsHaveServiceEffect } from "./npcBehaviors";
import { cutsceneNpcHiddenFlag, isNpcVisibleForRuntimeFlags } from "./npcVisibility";
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
  type CutsceneMoveDebug,
  type NewGameStartupRunDebug,
  type OverworldInteractableDebug,
  type OverworldInteractionTargetDebug
} from "./state";
import { createDialogueResolver, textSpeedCpsFromSearch } from "./dialogueRenderer";
import {
  AUTHORED_OPENING_CUTSCENE_REF,
  INTRO_ACTOR_VM_STUBS,
  INTRO_BEDROOM_OPENING_DONE_FLAG,
  INTRO_METEOR_BEAT_FIRED_FLAG,
  buildOpeningCutsceneScript,
  decideIntroMeteorBattleTransition,
  decideIntroMeteorBeatFire,
  resolveIntroMeteorBeatStart,
  type IntroMeteorBeatStart,
  type NewGameOpeningStart
} from "./newGameOpening";
import { equipmentSlotForItemType, PartyState, type PartyStateSnapshot } from "./partyState";
import { createBattleSfx, type BattleSfx, type BattleSfxCue } from "./audio/battleSfx";
import { STATUS_AILMENTS, type StatusAilment } from "./statusEffects";
import type { OverworldStatusHudView } from "./overworldStatusHud";
import {
  applySaveState,
  captureSaveState,
  deserializeSaveState,
  serializeSaveState,
  type SavePlayerSnapshot,
  type SaveSlotPersistence,
  type SaveState
} from "./saveState";
import {
  buildMenuScreens,
  buildHospitalServiceScreen,
  buildHotelServiceScreen,
  buildPhoneServiceScreens,
  buildShopEquipPromptScreen,
  buildAtmScreen,
  buildShopMenuScreens,
  buildShopViewModel,
  buildStatusViewModel,
  ATM_MENU_ID,
  HOSPITAL_SERVICE_MENU_ID,
  HOTEL_SERVICE_MENU_ID,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  menuRenderStack,
  moveMenu,
  openMenu,
  parseMenuAction,
  refreshMenuStackScreens,
  resolveTalkMenuAction,
  MAIN_MENU_ID,
  PHONE_SERVICE_MENU_ID,
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
import {
  defaultVisualStateInputs,
  resolvePlayerVisualState,
  type ResolvedVisualState,
  type VisualStateInputs
} from "./playerVisualState";
import { drawSwirl } from "./transitions";
import { activeWindowFlavorId } from "./windowSettings";
import { PLAYER_FOOT_BOX, walkableFootprintClear } from "./collisionFootprint";
import {
  FOLLOWER_SPRITE_OVERRIDE_SHEET_KEY,
  PLAYER_SPRITE_OVERRIDE_SHEET_KEY,
  spriteOverrideAssetUrl,
  spriteOverrideDirectionFrames,
  spriteOverrideEnemyOverworldSheetKey,
  spriteOverrideForEnemyOverworld,
  spriteOverrideForNpcId,
  spriteOverrideForSpriteGroup,
  spriteOverrideFrame,
  spriteOverrideGroupEntries,
  spriteOverrideGroupSheetKey,
  spriteOverrideNpcEntries,
  spriteWalkBobOffset,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteOverrideScale,
  stableAssetPathHash,
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
import { createTransitionSfx, type InteractionSfxCue, type TransitionSfx } from "./audio/transitionSfx";
import { createMusic, musicDisabledBySearch, type Music } from "./audio/music";
import { getSharedMusic } from "./sharedMusic";
import { advanceCutsceneActorTowardTarget } from "./cutsceneActorMovement";
import { cutsceneSoundLabel, resolveCutsceneSfxCue, type CutsceneSoundId, type CutsceneSfxCue } from "./cutsceneSfx";
import {
  isInteriorMusicSector,
  overworldMusicCueForSector,
  type OverworldMusicCue
} from "./worldMusic";
import { publishAuditionTarget, type AuditionLocation } from "./musicAuditioner";
import {
  overworldInteractableEvents,
  overworldInteractableIsOpened
} from "./overworldInteractables";

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

/** A visible roaming overworld enemy that starts a battle on contact with the player. */
type OverworldEnemyRuntime = {
  key: string;
  enemyGroup: number;
  spriteGroup: number | undefined;
  state: NpcRuntimeState;
  frames: DirectionFrameSequence;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  /** Texture key to render once loaded (Swagbound skin key or `sheet-<group>`). */
  textureKey?: string;
  /** Present when skinned with Swagbound overworld art (else falls back to EB sprite group). */
  skin?: SpriteOverrideSheet;
  /** Time remaining before this roamer can start a battle on contact (post-spawn grace). */
  contactGraceMs: number;
};

type BossGateRuntime = {
  triggerId: string;
  trigger: StoryTrigger;
  enemyGroup: number;
  spriteGroup: number | undefined;
  frames: DirectionFrameSequence;
  textureKey?: string;
  skin?: SpriteOverrideSheet;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
  facing: Facing;
  armed: boolean;
};

type NpcSpriteOverrideResolution = {
  source: "npc" | "spriteGroup";
  id: number;
  key: string;
  override: SpriteOverrideSheet;
};

type SortableActor = Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;

type FollowerRuntime = {
  joinOrder: number;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  frames: DirectionFrameSequence;
  pos: { x: number; y: number };
  walkPhase: number;
};

type ActiveNpcDialogue = {
  key: string;
  id: number;
  restoreFacing: Facing;
};

type WorldInteractionKind = "npc" | OverworldInteractable["kind"];

type WorldInteractionCandidate = InteractionCandidate & {
  id: number;
  key: string;
  targetKind: WorldInteractionKind;
  label?: string;
  npcId?: number;
  interactableId?: string;
};

type ActorMoveEffect = Extract<EventEffect, { kind: "actorMove" }>;

type CutsceneMoveState = {
  actor: NormalizedActorMoveSelector;
  actorLabel: string;
  npcKey?: string;
  restoreNpcPaused?: boolean;
  holdNpcUntilStartupFinalize?: boolean;
  target: { x: number; y: number };
  run: boolean;
  elapsedMs: number;
  maxDurationMs: number;
};

type CutsceneMoveActorRuntime = {
  state: PlayerState;
  frames: DirectionFrameSequence;
  sync: () => void;
};

type BlockedOptions = {
  ignoreNpcId?: number;
  includePlayer?: boolean;
  includeNpcs?: boolean;
  // When set, NPCs whose body already overlaps this point are ignored, so an
  // actor that ends up co-located with an NPC (door-warp spawn, scripted move)
  // can always walk free instead of being trapped in every direction.
  escapeOverlapAt?: { x: number; y: number };
};

type DoorWarpOptions = {
  instant?: boolean;
  kind?: TransitionKind;
  triggerWorldPixel?: { x: number; y: number };
};

type DoorFadePhase = "none" | "fade-out" | "fade-in";

const DOOR_FADE_OVERLAY_DEPTH = 1_000_000;
// The EB battle-encounter swirl: a colored spiral covers the overworld to black, THEN we switch to the
// battle scene (which reveals from black). Sits above everything, including the door-fade overlay.
const ENCOUNTER_SWIRL_MS = 620;
const ENCOUNTER_SWIRL_DEPTH = 1_500_000;
const COLLISION_OVERLAY_DEPTH = 150_000;
// Head/companion overlays render just above the foreground occluder layer (depth 100_000) so a mushroom
// cap / sweat / possession ghost shows on the character, but stay below the door-fade + UI overlays.
const PLAYER_OVERLAY_DEPTH = 110_000;
const ENCOUNTER_RETURN_COOLDOWN_MS = 1_500;
// Visible overworld enemies (EarthBound-style touch-to-battle): tuning.
const OVERWORLD_ENEMY_GLOBAL_CAP = 4;
const OVERWORLD_ENEMY_SPAWN_INTERVAL_MS = 900;
const OVERWORLD_ENEMY_CONTACT_PX = 12;
const BOSS_GATE_CONTACT_PX = 14;
const BOSS_GATE_ARM_DIST_PX = 32;
const OVERWORLD_CAMERA_ZOOM = 2;
// Cap on the interior zoom-to-fill so short rooms don't blow up; rooms shorter
// than (viewport / this) keep a small centered letterbox instead of over-zooming.
const INTERIOR_CAMERA_MAX_ZOOM = 3.5;
// Spawn band kept fully ON-SCREEN (camera shows ~128x112 world px from the player
// at zoom 2) so a roamer is always visible before it can reach you — never an
// off-screen "random" touch. Min keeps it off the player's feet.
const OVERWORLD_ENEMY_MIN_SPAWN_DIST_PX = 80;
const OVERWORLD_ENEMY_MAX_SPAWN_DIST_PX = 104;
// A freshly spawned roamer cannot start a battle until the player has had a beat to
// see it appear (prevents a spawn-then-instant-contact that would feel random).
const OVERWORLD_ENEMY_CONTACT_GRACE_MS = 600;
const OVERWORLD_ENEMY_DESPAWN_DIST_PX = 320;
const OVERWORLD_ENEMY_WANDER_RADIUS_PX = 40;
const OVERWORLD_ENEMY_WANDER_SPEED_PX_PER_SEC = 30;
const OVERWORLD_ENEMY_SPAWN_ATTEMPTS = 8;
const LOW_HP_DANGER_FRACTION = 1 / 8;
const LOW_HP_DANGER_BEEP_INTERVAL_MS = 820;
const ROOM_MASK_EDGE_INSET_SCREEN_PX = 0.5;
const CUTSCENE_ACTOR_MOVE_ARRIVAL_PX = 2;
const CUTSCENE_ACTOR_MOVE_TIMEOUT_MS = 8_000;
const CUTSCENE_ACTOR_RUN_MULTIPLIER = 1.5;
const CUTSCENE_MOVE_DEMO_REFERENCE = "cutsceneMoveDemo.main";
const DEFAULT_HOTEL_REST_COST = 100;

type TilePoint = { x: number; y: number };
type ForceEncounterResult =
  | { started: true; enemyGroup: number; advantage: EncounterAdvantage }
  | { started: false; reason: string; enemyGroup?: number; advantage?: EncounterAdvantage };

type ActiveServiceState =
  | { kind: ServiceKind; cost?: number }
  | { kind: "shop-equip"; storeId: number; char: number; inventorySlot: number; itemId: number; itemName: string };

type ServiceDebugState = {
  active?: ActiveServiceState;
  lastResult?: {
    kind: ActiveServiceState["kind"];
    message: string;
    cost?: number;
    wallet: number;
    bank: number;
    storageItems: number;
  };
};

type MenuSfxCue = Extract<BattleSfxCue, "menuMove" | "menuConfirm" | "menuCancel">;

export class ChunkedWorldScene extends Phaser.Scene {
  private data_!: GameData;
  private world_!: WorldChunked;
  private player?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private playerState!: PlayerState;
  private playerFrames: DirectionFrameSequence = CANONICAL_DIRECTION_FRAMES;
  // 2nd party member (Cloak) trailing the player. Driven by a delayed trail of the player's path.
  private followers: FollowerRuntime[] = [];
  private followerTrail: Array<{ x: number; y: number; facing: PlayerState["facing"] }> = [];
  private spriteWalkBobClockMs = 0;
  private npcPlacementsByChunk = new Map<string, NpcPlacement[]>();
  private npcRuntimes = new Map<string, NpcRuntime>();
  private serviceInteractionCache = new Map<string, boolean>();
  private activeNpcDialogue?: ActiveNpcDialogue;
  private presentInteractableSprites = new Map<string, Phaser.GameObjects.Rectangle>();
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
  /** Debug/cutscene-forced overrides merged over the live visual-state inputs (see playerVisualState). */
  private forcedVisualState: Partial<VisualStateInputs> = {};
  private lastResolvedVisualState?: ResolvedVisualState;
  private lastVisualApplied: { scale: number; alpha: number; tint: number | null } = { scale: 1, alpha: 1, tint: null };
  private lastVisualSheetSwapped = false;
  private playerInvertActive = false;
  /** Head-mounted/companion overlay sprites (sweat/mushroom/possession), keyed by overlay name. */
  private overlaySprites = new Map<string, Phaser.GameObjects.Sprite>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private doorTriggerState: DoorTriggerState = { suppressUntilClear: false };
  private lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  private warnedInvalidDoorWarps = new Set<string>();
  private doorFadePhase: DoorFadePhase = "none";
  private doorFadeOverlay?: Phaser.GameObjects.Rectangle;
  /** Deferred battle start: while set, the overworld plays the colored encounter swirl, then switches. */
  private pendingBattleStart?: { sceneKey: string; params: Record<string, unknown> };
  private encounterSwirlMs = 0;
  private encounterSwirlGfx?: Phaser.GameObjects.Graphics;
  private lastDialogueRevealedChars = 0;
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
  private readonly menuSfx: BattleSfx = createBattleSfx();
  private menuSfxCalls: MenuSfxCue[] = [];
  private menuSfxCount = 0;
  private interactionSfxCalls: InteractionSfxCue[] = [];
  private interactionSfxCount = 0;
  private music: Music = createMusic();
  private currentOverworldMusicCue?: OverworldMusicCue;
  /** When set (by a story trigger's `music` field), overrides sector-based overworld music. */
  private forcedOverworldMusicCue?: OverworldMusicCue;
  private menuState: MenuState = closedMenu();
  private menuScreens = new Map<string, MenuScreen>();
  private activeShopStoreId?: number;
  private activeService?: ActiveServiceState;
  private lastServiceResult?: ServiceDebugState["lastResult"];
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
  private dangerHeartbeatElapsedMs = LOW_HP_DANGER_BEEP_INTERVAL_MS;
  private poisonStepTicks = 0;
  private poisonHpLost = 0;
  private bossGateActors = new Map<string, BossGateRuntime>();
  private overworldEnemies = new Map<string, OverworldEnemyRuntime>();
  private overworldEnemySeq = 0;
  private overworldEnemySpawnCooldownMs = 0;
  private loadingEnemySkinKeys = new Set<string>();
  private forceEncounterHook?: (groupId?: number, advantage?: unknown) => ForceEncounterResult;
  private newGameStartupRecord?: NewGameStartupRunDebug;
  private startupRunActive = false;
  private startupRunFinalized = false;
  private startupMode: "startup" | "opening" = "startup";
  private startupInitialSpawn?: { x: number; y: number };
  private startupFallbackReason?: string;
  private authoredOpeningCutsceneRunActive = false;
  private readonly openingCutsceneActorHolds = new OpeningCutsceneActorHoldSet();
  private newGameOpening?: NewGameOpeningStart;
  private introMeteorBeat?: IntroMeteorBeatStart;
  private warnedIntroMeteorSkips = new Set<string>();
  private warnedIntroActorVmStubs = new Set<string>();
  private warnedStoryTriggerSkips = new Set<string>();
  private suppressedTriggerId?: string;
  private barrierSprites = new Map<string, Phaser.GameObjects.Image>();
  private loadingBarrierKeys = new Set<string>();
  private pendingScriptedDialogueComplete?: () => void;
  private pendingInteractionShopStoreId?: number;
  private pendingInteractionService?: { service: ServiceKind; cost?: number };
  private cutsceneMove?: CutsceneMoveState;
  private cutsceneRunner?: CutsceneRunner;
  private activeCutsceneId?: string;
  private suppressedCutsceneId?: string;
  private readonly cutsceneVisibilityOverride = new Map<number, boolean>();
  private cutsceneMoveDebug: CutsceneMoveDebug = { active: false, arrived: false };
  private cutsceneMoveDemoHook?: (npcId: number | string, x: number, y: number, run?: boolean) => boolean;
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
    this.music = getSharedMusic(this.registry, data.gameData.musicManifest, {
      muted: musicDisabledBySearch(globalThis.location?.search)
    });
    // Dev music-auditioner bridge: lets the Track Lab panel mute this scene's
    // music while a candidate track auditions, and read where the player is.
    publishAuditionTarget({
      setGameMusicEnabled: (enabled) => this.music.setEnabled(enabled),
      getLocation: () => this.auditionLocation()
    });
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
    this.dangerHeartbeatElapsedMs = LOW_HP_DANGER_BEEP_INTERVAL_MS;
    this.poisonStepTicks = 0;
    this.poisonHpLost = 0;
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
    for (const follower of this.followerSpriteOverrides()) {
      this.load.spritesheet(this.followerSpriteSheetKey(follower.joinOrder), spriteOverrideAssetUrl(follower.sheet.image), {
        frameWidth: follower.sheet.frameWidth,
        frameHeight: follower.sheet.frameHeight
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
    // Faithful per-state hero sheets + shared overlay assets (forward-compatible: no-op until a skin
    // supplies them). The visual-state render path swaps to these when present, else approximates.
    type StateSheets = Record<string, { image: string; frameWidth: number; frameHeight: number }> | undefined;
    const playerStates = this.playerSpriteOverride()?.states as StateSheets;
    for (const [name, sheet] of Object.entries(playerStates ?? {})) {
      if (sheet) {
        this.load.spritesheet(this.playerStateSheetKey(name), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
      }
    }
    for (const follower of this.followerSpriteOverrides()) {
      const followerStates = follower.sheet.states as StateSheets;
      for (const [name, sheet] of Object.entries(followerStates ?? {})) {
        if (sheet) {
          this.load.spritesheet(this.followerStateSheetKey(follower.joinOrder, name), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
        }
      }
    }
    const overlays = this.data_.spriteOverrides?.overlays as Record<string, { image: string; frameWidth: number; frameHeight: number }> | undefined;
    for (const [name, sheet] of Object.entries(overlays ?? {})) {
      if (sheet) {
        this.load.spritesheet(this.overlaySheetKey(name), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
      }
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
    this.applyCollisionOverrides();
    this.collisionOverlayEnabled = this.initialCollisionOverlayEnabled();
    this.registerCollisionDebugGlobals();
    this.resolveIntroMeteorBeatForStart();

    const restoredPlayer = this.restoreState ? undefined : this.applyInitialSave();
    const returnPlayer = this.applyReturnRestore();
    // Act 1 is solo: if nothing (save/intro) populated the party, default to the
    // first hero (Bosch) so menus + battle status never fall back to the full roster.
    if (this.partyState.party().length === 0) {
      this.ensureIntroParty();
    }
    // Seed baseline vitals so field poison + the overworld HUD have a HP/PP target
    // from the start (vitals are otherwise only recorded on damage/battle entry).
    this.partyState.ensureVitalsFor(this.overworldHudPartyMembers());
    const spawn = this.clampSpawn(
      returnPlayer ?? restoredPlayer ?? this.parseSpawnOverride() ?? this.newGameOpening?.spawn ?? world.player.spawnWorldPixel
    );
    const playerFacing = returnPlayer?.facing ?? restoredPlayer?.facing ?? "down";
    this.playerFrames = this.framesForPlayer(world.player.spriteGroup);
    this.playerState = createPlayerState(spawn.x, spawn.y, playerFacing, this.playerFrames);
    this.player = this.spawnPlayerActor(spawn.x, spawn.y, world.player.spriteGroup, playerFacing);
    this.spawnFollower(spawn, playerFacing);
    this.spawnPresentInteractables();
    this.syncEncounterTileState();

    const bounds = this.movementBounds();
    this.cameras.main.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
    this.cameras.main.setZoom(OVERWORLD_CAMERA_ZOOM);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;
    this.refreshRoomBounds(true);
    this.events.once("shutdown", () => {
      this.music.stop();
      publishAuditionTarget(null);
      this.destroyDoorFadeOverlay();
      this.destroyCollisionOverlay();
      this.destroyRoomMask();
      this.unregisterCutsceneMoveDemoGlobal();
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
    // Debug toggles (panel + collision overlay) are dev-only — not wired in production builds.
    // F1 toggles the debug panel; backtick (`) is a Mac-friendly alias since the
    // top-row F-keys default to hardware controls (brightness) on macOS.
    if (import.meta.env.DEV) {
      const toggleDebugPanel = () => {
        this.debugPanelVisible = !this.debugPanelVisible;
      };
      this.input.keyboard?.on("keydown-F1", toggleDebugPanel);
      this.input.keyboard?.on("keydown-BACKTICK", toggleDebugPanel);
      this.input.keyboard?.on("keydown-F2", () => this.setCollisionOverlayEnabled(!this.collisionOverlayEnabled));
    }

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
    if (this.newGameOpening) {
      this.playOverworldMusicCue("intro", true);
    } else {
      this.syncOverworldMusicCue(true);
    }
    this.registerCutsceneMoveDemoGlobal();
    this.registerForceEncounter();
    if (!this.restoreState) {
      this.maybeStartNewGameStartup(spawn);
    }
    this.applyDebugFlags();
    this.syncPresentInteractableSprites();
    this.publish();
  }

  /** Dev affordance: ?flags=a,b,c pre-sets story flags so gated content is reachable. */
  private applyDebugFlags(): void {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("flags");
    if (!raw) {
      return;
    }
    for (const flag of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
      this.gameFlags.set(flag);
    }
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    this.spriteWalkBobClockMs += delta;
    this.partyState.tickMeters(delta);
    this.updateDangerHeartbeat(delta);
    this.tickDialogueBlip();
    this.encounterCooldownMs = Math.max(0, this.encounterCooldownMs - delta);
    // Encounter swirl owns the frame while it covers the overworld, then switches to battle.
    if (this.tickEncounterSwirl(delta)) {
      this.publish();
      return;
    }
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
    this.stepCutsceneMove(delta);
    this.updateDoorTransition(delta);

    this.cutsceneRunner?.update(delta);
    if (this.cutsceneRunner?.running) {
      // A content cutscene owns the scene: keep the player locked, sync the actor
      // being driven, and skip movement + world-trigger processing this frame.
      if (!this.playerState.inputLocked) {
        lockPlayer(this.playerState, this.playerFrames);
      }
      this.syncPlayerObject();
      this.updateCollisionOverlay();
      this.updatePrompt();
      this.publish();
      return;
    }

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
      blocked: (x, y) =>
        this.blocked(x, y, {
          includeNpcs: true,
          escapeOverlapAt: { x: this.playerState.x, y: this.playerState.y }
        }),
      frames: this.playerFrames
    });
    const playerSteppedTile = this.syncEncounterTileState();
    this.applyFieldPoisonForStep(playerSteppedTile);
    this.syncPlayerObject();
    this.refreshRoomBounds();
    this.syncOverworldMusicCue();
    this.refreshStreaming();
    this.updateCollisionOverlay();
    this.refreshBarrierSprites();
    if (this.maybeStartIntroMeteorBeat()) {
      return;
    }
    if (this.maybeStartCutscene()) {
      return;
    }
    if (this.maybeFireStoryTrigger()) {
      return;
    }
    if (this.manageBossGates(delta)) {
      return;
    }
    if (this.manageOverworldEnemies(delta)) {
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
    this.destroyPlayerOverlays();
    this.pendingBattleStart = undefined;
    this.encounterSwirlGfx?.destroy();
    this.encounterSwirlGfx = undefined;
    this.player = undefined;
    this.playerFrames = CANONICAL_DIRECTION_FRAMES;
    this.destroyFollowers();
    this.followerTrail = [];
    this.activeNpcDialogue = undefined;
    this.chunkByKey.clear();
    this.npcPlacementsByChunk.clear();
    this.npcRuntimes.clear();
    this.serviceInteractionCache.clear();
    this.destroyPresentInteractableSprites();
    this.clearOverworldEnemies();
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
    this.activeService = undefined;
    this.lastServiceResult = undefined;
    this.menuSfxCalls = [];
    this.menuSfxCount = 0;
    this.interactionSfxCalls = [];
    this.interactionSfxCount = 0;
    this.currentOverworldMusicCue = undefined;
    this.forcedOverworldMusicCue = undefined;
    this.eventSequence = undefined;
    this.newGameStartupRecord = undefined;
    this.startupRunActive = false;
    this.startupRunFinalized = false;
    this.startupMode = "startup";
    this.startupInitialSpawn = undefined;
    this.startupFallbackReason = undefined;
    this.authoredOpeningCutsceneRunActive = false;
    this.openingCutsceneActorHolds.clear();
    this.newGameOpening = undefined;
    this.introMeteorBeat = undefined;
    this.warnedIntroMeteorSkips.clear();
    this.warnedIntroActorVmStubs.clear();
    this.warnedStoryTriggerSkips.clear();
    this.suppressedTriggerId = undefined;
    for (const sprite of this.barrierSprites.values()) {
      sprite.destroy();
    }
    this.barrierSprites.clear();
    this.loadingBarrierKeys.clear();
    this.prompt = "";
    this.assetsLoaded = false;
    this.pendingInteractionShopStoreId = undefined;
    this.pendingInteractionService = undefined;
    this.cutsceneMove = undefined;
    this.cutsceneMoveDebug = { active: false, arrived: false };
    this.cutsceneRunner = undefined;
    this.activeCutsceneId = undefined;
    this.suppressedCutsceneId = undefined;
    this.cutsceneVisibilityOverride.clear();
    this.unregisterCutsceneMoveDemoGlobal();
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
    this.world_.npcs.forEach((npc, index) => {
      const overriddenNpc = applyNpcOverride(npc, this.data_.npcOverrides);
      if (overriddenNpc) {
        indexPlacement(overriddenNpc, "eb", index);
      }
    });
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
      this.updateCameraRoomBounds();
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
    this.updateCameraRoomBounds();
  }

  /**
   * Keep the camera locked inside an interior room so its masked edge never
   * reveals the black void around it (EB never scrolls past a room). Falls back
   * to the full map bounds in the overworld.
   */
  private updateCameraRoomBounds(): void {
    const camera = this.cameras.main;
    const room = this.activeInteriorRoom();
    if (room) {
      // Zoom in just enough that the room covers the viewport on its short axis,
      // so the masked edge never reveals the black void. Capped so small rooms
      // don't over-zoom; any residual gap is centered (symmetric, intentional).
      const fillZoom = Math.max(
        OVERWORLD_CAMERA_ZOOM,
        camera.width / room.rect.width,
        camera.height / room.rect.height
      );
      camera.setZoom(Math.min(fillZoom, INTERIOR_CAMERA_MAX_ZOOM));
      camera.setBounds(room.rect.x, room.rect.y, room.rect.width, room.rect.height, true);
      return;
    }
    camera.setZoom(OVERWORLD_CAMERA_ZOOM);
    const bounds = this.movementBounds();
    camera.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
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

  private syncOverworldMusicCue(force = false): void {
    if (this.forcedOverworldMusicCue) {
      this.playOverworldMusicCue(this.forcedOverworldMusicCue, force);
      return;
    }
    this.playOverworldMusicCue(
      overworldMusicCueForSector(
        this.data_.musicManifest,
        this.world_.sectors,
        this.playerState,
        false,
        this.data_.sectorMusic
      ),
      force
    );
  }

  private playOverworldMusicCue(cue: OverworldMusicCue, force = false): void {
    if (!force && this.currentOverworldMusicCue === cue) {
      return;
    }
    this.currentOverworldMusicCue = cue;
    void this.music.play(cue);
  }

  /** Soft per-character tick as typewriter dialogue reveals (skips whitespace, throttled). */
  private tickDialogueBlip(): void {
    if (!this.dialogue.open || this.dialogue.revealComplete) {
      this.lastDialogueRevealedChars = 0;
      return;
    }
    const state = this.dialogue.currentRevealState;
    const revealed = state.revealedChars;
    if (revealed < this.lastDialogueRevealedChars) {
      this.lastDialogueRevealedChars = revealed; // new page reset
    }
    if (revealed > this.lastDialogueRevealedChars) {
      const fresh = state.revealedText.slice(this.lastDialogueRevealedChars, revealed);
      if (revealed % 2 === 0 && /\S/.test(fresh)) {
        this.transitionSfx.textBlip();
      }
      this.lastDialogueRevealedChars = revealed;
    }
  }

  private playerInInteriorMusicSector(): boolean {
    return isInteriorMusicSector(this.world_.sectors, this.playerState);
  }

  /** Snapshot of where the player is, for the dev music-auditioner panel. */
  private auditionLocation(): AuditionLocation | null {
    // The dev panel polls this on a timer; during scene init/reset there is a
    // window where playerState (and world data) are not set yet. Bail to null
    // (the panel renders "no world scene") instead of dereferencing undefined.
    const playerState = this.playerState;
    const sectors = this.world_?.sectors;
    if (!playerState) {
      return null;
    }
    const sector = sectors ? sectorCoordForWorldPixel(playerState, sectors) : undefined;
    const sectorIndex = sector?.index ?? null;
    const areaId =
      sectorIndex !== null && sectors?.areaIds ? sectors.areaIds[sectorIndex] ?? null : null;
    return {
      cue: this.currentOverworldMusicCue ?? "—",
      sectorIndex,
      areaId,
      x: Math.round(playerState.x),
      y: Math.round(playerState.y)
    };
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

  /**
   * Force authored world-pixel rects solid. EarthBound's roof/behind-building cells
   * convert to walkable (surface-00, no priority — indistinguishable from grass), so
   * the player can walk on roofs. content/collision-overrides.json patches those cells.
   */
  private applyCollisionOverrides(): void {
    const overrides = this.data_.collisionOverrides;
    if (!overrides || overrides.solids.length === 0) return;
    const cs = this.collisionCellSize;
    const height = this.solidRows.length;
    if (height === 0) return;
    const width = this.solidRows[0].length;
    // Convert only the touched rows to mutable char arrays.
    const patched = new Map<number, string[]>();
    const rowChars = (row: number): string[] => {
      let chars = patched.get(row);
      if (!chars) { chars = this.solidRows[row].split(""); patched.set(row, chars); }
      return chars;
    };
    for (const rect of overrides.solids) {
      const c0 = Math.max(0, Math.floor(rect.x / cs));
      const c1 = Math.min(width - 1, Math.floor((rect.x + rect.w - 1) / cs));
      const r0 = Math.max(0, Math.floor(rect.y / cs));
      const r1 = Math.min(height - 1, Math.floor((rect.y + rect.h - 1) / cs));
      for (let r = r0; r <= r1; r += 1) {
        const chars = rowChars(r);
        for (let c = c0; c <= c1; c += 1) chars[c] = "1";
      }
    }
    for (const [row, chars] of patched) this.solidRows[row] = chars.join("");
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
    // Debug-only: full-heal the party — a between-fight convenience for the autonomous-play harness
    // (the player-facing rest is the in-world hotel at NPC 58). Nothing in normal play calls it.
    globals.__debugHeal = () => {
      this.partyState.fullRecover({ cureStatuses: true });
      this.refreshMenuScreens();
      this.publish();
    };
    // Debug-only: equip an item on a party member and read battle-resolved stats, for verifying
    // equipped-gear bonuses (weapons → offense, armor → defense). Nothing in normal play calls these.
    globals.__equip = (charId: number, itemId: number) => {
      const item = this.itemById(itemId);
      return item ? this.partyState.equip(charId, item) : { ok: false };
    };
    globals.__battleStats = (charId: number) => {
      const member = this.effectiveBattlePartyMembers()?.find((entry) => entry.id === charId);
      return member ? { offense: member.stats.offense, defense: member.stats.defense } : undefined;
    };
    globals.__overworldStatusHud = () => this.overworldStatusHud();
    globals.__setPartyStatus = (charId: number, ailment: StatusAilment, active = true) => {
      if (!STATUS_AILMENTS.includes(ailment)) {
        return { ok: false, reason: "unknown ailment" };
      }
      const statuses = active
        ? this.partyState.inflictStatus(charId, ailment)
        : this.partyState.cureStatus(charId, ailment);
      this.refreshMenuScreens();
      return { ok: true, charId, statuses, hud: this.overworldStatusHud() };
    };
    // Debug-only: force hero visual-state inputs (KO, ride, status, cutscene event, palette) so the
    // sprite-state render path can be exercised in-engine without reaching each in-game trigger.
    // e.g. __setPlayerVisualState({ event: "dead" }) or ({ status: { tiny: true } }); call with {} to clear.
    globals.__partyOp = (op: "add" | "remove", charId: number) => {
      this.partyState.partyOp(op, charId);
      this.handlePartyCompositionChanged();
      return this.partyState.party();
    };
    globals.__followerInfo = () => ({
      spawned: this.followers.length > 0,
      pos: this.followers[0]?.pos ? { ...this.followers[0].pos } : null,
      followers: this.followers.map((follower) => ({
        joinOrder: follower.joinOrder,
        pos: { ...follower.pos },
        textureKey: follower.sprite instanceof Phaser.GameObjects.Sprite ? follower.sprite.texture.key : null
      })),
      player: { x: this.playerState.x, y: this.playerState.y },
      textureLoaded: this.textures.exists(FOLLOWER_SPRITE_OVERRIDE_SHEET_KEY),
      overrideConfigured: this.followerSpriteOverrides().length > 0
    });
    globals.__setPlayerVisualState = (forced?: Partial<VisualStateInputs>) => {
      this.forcedVisualState = forced ?? {};
      this.applyPlayerVisualState();
      return this.lastResolvedVisualState;
    };
    globals.__playerVisualState = () => this.lastResolvedVisualState;
    globals.__overlayInfo = () => ({
      texLoaded: ["sweat", "mushroom", "possessionGhost"].map((n) => [n, this.textures.exists(this.overlaySheetKey(n))]),
      registry: Object.keys((this.data_.spriteOverrides?.overlays ?? {})),
      sprites: [...this.overlaySprites.entries()].map(([n, s]) => ({ n, visible: s.visible, x: Math.round(s.x), y: Math.round(s.y), tex: s.texture?.key, depth: s.depth }))
    });
  }

  private unregisterCollisionDebugGlobals(): void {
    const globals = globalThis as Record<string, unknown>;
    if (this.solidAtHook && globals.__solidAt === this.solidAtHook) {
      delete globals.__solidAt;
    }
    if (this.surfaceAtHook && globals.__surfaceAt === this.surfaceAtHook) {
      delete globals.__surfaceAt;
    }
    delete globals.__debugHeal;
    delete globals.__equip;
    delete globals.__battleStats;
    delete globals.__overworldStatusHud;
    delete globals.__setPartyStatus;
    delete globals.__partyOp;
    delete globals.__followerInfo;
    delete globals.__setPlayerVisualState;
    delete globals.__playerVisualState;
    delete globals.__overlayInfo;
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
      state: createNpcState(npc.worldPixel.x, npc.worldPixel.y, facing, this.behaviorForRuntimeNpc(npc), frames),
      frames,
      sprite: this.spawnNpcActor(npc.npcId, npc.worldPixel.x, npc.worldPixel.y, npc.spriteGroup, npc.direction)
    };
  }

  private behaviorForRuntimeNpc(npc: RuntimeNpcData) {
    return behaviorForNpc(npc.npcId, npc.movement, {
      hasServiceInteraction: this.npcHasServiceInteraction(npc),
      isInteriorHome: isInteriorMusicSector(this.world_.sectors, npc.worldPixel)
    });
  }

  private npcHasServiceInteraction(npc: RuntimeNpcData): boolean {
    if (!npc.interactable) {
      return false;
    }
    const events = this.interactionEventsForNpc(npc);
    const cacheKey = `${this.gameFlags.listNums().join(",")}:${JSON.stringify(events)}`;
    const cached = this.serviceInteractionCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const hasService = interactionEventsHaveServiceEffect(events, this.data_.scripts, this.gameFlags);
    this.serviceInteractionCache.set(cacheKey, hasService);
    return hasService;
  }

  private stepNpcs(deltaMs: number): void {
    for (const npc of this.npcRuntimes.values()) {
      if (this.cutsceneMove?.actor.kind === "npc" && this.cutsceneMove.npcKey === npc.key) {
        continue;
      }
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
    actor.y = npc.state.player.y - this.spriteWalkBob(
      npc.state.player.moving,
      npc.frames,
      npc.state.player.facing,
      npc.data.npcId
    );
    actor.setVisible(this.npcInsideActiveRoom(npc) && this.cutsceneActorVisible(npc.data.npcId));
  }

  private applyNpcRoomVisibility(): void {
    for (const npc of this.npcRuntimes.values()) {
      npc.sprite?.setVisible(this.npcInsideActiveRoom(npc) && this.cutsceneActorVisible(npc.data.npcId));
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

  private isNpcVisible(npc: Pick<WorldChunkedNpc, "npcId" | "showSprite" | "eventFlag">): boolean {
    return isNpcVisibleForRuntimeFlags(npc, this.gameFlags);
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

  private spawnPresentInteractables(): void {
    this.destroyPresentInteractableSprites();
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "present") {
        continue;
      }
      const sprite = this.add.rectangle(entry.worldPixel.x, entry.worldPixel.y, 14, 12, 0xd64265)
        .setOrigin(0.5, 1);
      this.presentInteractableSprites.set(entry.id, sprite);
      this.setActorSortDepth(sprite);
    }
    this.syncPresentInteractableSprites();
  }

  private syncPresentInteractableSprites(): void {
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "present") {
        continue;
      }
      const sprite = this.presentInteractableSprites.get(entry.id);
      if (!sprite || !sprite.active) {
        continue;
      }
      const opened = this.overworldInteractableOpened(entry);
      sprite
        .setFillStyle(opened ? 0x6b7280 : 0xd64265, 1)
        .setStrokeStyle(2, opened ? 0xcbd5e1 : 0xfff3a3, 1);
      sprite.setVisible(true);
      this.setActorSortDepth(sprite);
    }
  }

  private destroyPresentInteractableSprites(): void {
    for (const sprite of this.presentInteractableSprites.values()) {
      sprite.destroy();
    }
    this.presentInteractableSprites.clear();
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
    const resume = () => {
      this.transitionSfx.resume();
      this.music.resume();
    };
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
    if (this.barrierBlocks(x, y)) {
      return true;
    }
    if ((options.includeNpcs ?? true) && this.presentInteractableBlocks(x, y, options.escapeOverlapAt)) {
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
        // If this NPC is already overlapping the mover's current spot, don't let
        // it block — otherwise a co-located NPC walls off every direction at once.
        if (
          options.escapeOverlapAt &&
          this.actorBodyBlocked(options.escapeOverlapAt.x, options.escapeOverlapAt.y, npc.state.player.x, npc.state.player.y)
        ) {
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

  /** Active story barriers block the player like solid terrain (string-flag gated). */
  private barrierBlocks(x: number, y: number): boolean {
    const barriers = this.data_.storyTriggers?.barriers;
    if (!barriers || barriers.length === 0) {
      return false;
    }
    return barrierBlocksPoint(barriers, { x, y }, (flag) => this.gameFlags.has(flag));
  }

  private presentInteractableBlocks(x: number, y: number, escapeOverlapAt?: { x: number; y: number }): boolean {
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "present") {
        continue;
      }
      if (
        escapeOverlapAt &&
        this.actorBodyBlocked(escapeOverlapAt.x, escapeOverlapAt.y, entry.worldPixel.x, entry.worldPixel.y)
      ) {
        continue;
      }
      if (this.actorBodyBlocked(x, y, entry.worldPixel.x, entry.worldPixel.y)) {
        return true;
      }
    }
    return false;
  }

  /** Creates barrier guard sprites on demand and toggles them with their active state. */
  private refreshBarrierSprites(): void {
    const barriers = this.data_.storyTriggers?.barriers;
    if (!barriers) {
      return;
    }
    for (const barrier of barriers) {
      const active = isBarrierActive(barrier, (flag) => this.gameFlags.has(flag));
      let sprite = this.barrierSprites.get(barrier.id);
      if (!sprite && barrier.image && active) {
        sprite = this.ensureBarrierSprite(barrier);
      }
      sprite?.setVisible(active);
    }
  }

  private ensureBarrierSprite(barrier: StoryBarrier): Phaser.GameObjects.Image | undefined {
    if (!barrier.image) {
      return undefined;
    }
    const key = `barrier-${stableAssetPathHash(barrier.image)}`;
    if (!this.textures.exists(key)) {
      if (!this.loadingBarrierKeys.has(key)) {
        this.loadingBarrierKeys.add(key);
        this.load.image(key, `/${barrier.image.replace(/^\/+/, "")}`);
        this.load.once(`filecomplete-image-${key}`, () => this.loadingBarrierKeys.delete(key));
        if (!this.load.isLoading()) {
          this.load.start();
        }
      }
      return undefined; // built on a later refresh, once the texture finishes loading
    }
    const image = this.add
      .image(barrier.area.x + barrier.area.w / 2, barrier.area.y + barrier.area.h, key)
      .setOrigin(0.5, 1);
    image.setDepth(spriteSortDepth(spriteBottomY({ y: image.y, originY: image.originY, displayHeight: image.displayHeight })));
    this.barrierSprites.set(barrier.id, image);
    return image;
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
    const messageDoorReference = messageDoorDialogueReference(result.door);
    if (messageDoorReference) {
      this.openMessageDoorDialogue(messageDoorReference);
      return true;
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

  private openMessageDoorDialogue(reference: string): void {
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents([{ kind: "dialogue", reference }]);
    this.updatePrompt();
    this.publish();
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
    this.syncOverworldMusicCue();
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

  private interactionCandidates(): WorldInteractionCandidate[] {
    const npcCandidates: WorldInteractionCandidate[] = [...this.npcRuntimes.values()]
      .filter((npc) => this.npcInsideActiveRoom(npc))
      .map((npc) => ({
        id: npc.data.npcId,
        key: `npc:${npc.data.npcId}`,
        targetKind: "npc",
        npcId: npc.data.npcId,
        label: this.npcName(npc.data.npcId),
        x: npc.state.player.x,
        y: npc.state.player.y,
        interactable: npc.data.interactable
      }));
    return [
      ...npcCandidates,
      ...this.data_.overworldInteractables.interactables.map((entry, index) => ({
        id: -1 - index,
        key: `interactable:${entry.id}`,
        targetKind: entry.kind,
        interactableId: entry.id,
        label: entry.label,
        x: entry.worldPixel.x,
        y: entry.worldPixel.y,
        interactable: true
      }))
    ];
  }

  private interactionTarget(): WorldInteractionCandidate | undefined {
    return findInteractionTarget(this.playerState, this.interactionCandidates(), {
      maxDistance: INTERACTION_DISTANCE
    })?.candidate as WorldInteractionCandidate | undefined;
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
      this.prompt = this.interactionPrompt(target);
    } else if (this.inRange()) {
      this.prompt = "Turn to face it, then press Z";
    } else {
      this.prompt = "Move: Arrows/WASD. Approach someone, then press Z.";
    }
  }

  private interactionPrompt(target: WorldInteractionCandidate): string {
    if (target.targetKind === "sign") {
      return target.label ? `Z: read ${target.label}` : "Z: read sign";
    }
    if (target.targetKind === "present") {
      const entry = this.overworldInteractableById(target.interactableId);
      return entry?.kind === "present" && this.overworldInteractableOpened(entry)
        ? "Z: check present"
        : "Z: open present";
    }
    if (target.targetKind === "examine") {
      return target.label ? `Z: check ${target.label}` : "Z: check";
    }
    return this.talkPrompt(target.npcId ?? target.id);
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
      if (this.eventSequence?.running || this.cutsceneRunner?.running) {
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
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running || this.cutsceneRunner?.running) {
      return;
    }
    this.refreshMenuScreens();
    const root = this.menuScreens.get(MAIN_MENU_ID);
    if (!root) {
      return;
    }
    this.menuState = openMenu(root);
    this.playMenuSfx("menuConfirm");
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private moveMenuCursor(delta: number): void {
    if (!this.menuState.open) {
      return;
    }
    const before = this.menuDebugState();
    this.menuState = moveMenu(this.menuState, delta);
    const after = this.menuDebugState();
    if (before.cursorIndex !== after.cursorIndex || before.currentItemId !== after.currentItemId) {
      this.playMenuSfx("menuMove");
    }
    this.publish();
  }

  private confirmCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.refreshMenuScreens();
    const result = confirmMenu(this.menuState, (id) => this.menuScreens.get(id));
    const changed = JSON.stringify(menuDebugState(result.state)) !== JSON.stringify(this.menuDebugState());
    this.menuState = result.state;
    if (result.actionId || changed) {
      this.playMenuSfx("menuConfirm");
    } else {
      this.playMenuSfx("menuCancel");
    }
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
    if (action.kind === "itemGive") {
      this.handleItemGiveAction(action);
      return;
    }
    if (action.kind === "itemDrop") {
      this.handleItemDropAction(action);
      return;
    }
    if (action.kind === "shopEquipNow") {
      this.handleShopEquipNowAction(action);
      return;
    }
    if (action.kind === "shopEquipLater") {
      this.handleShopEquipLaterAction(action);
      return;
    }
    if (action.kind === "hospitalService") {
      this.handleHospitalServiceAction(action);
      return;
    }
    if (action.kind === "hotelService") {
      this.handleHotelServiceAction(action);
      return;
    }
    if (action.kind === "phoneService") {
      this.handlePhoneServiceAction(action);
      return;
    }
    if (action.kind === "storageDeposit") {
      this.handleStorageDepositAction(action);
      return;
    }
    if (action.kind === "storageWithdraw") {
      this.handleStorageWithdrawAction(action);
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
    this.recordServiceResult("atm", moved > 0 ? "Done." : "No funds moved.");
    this.showMenuResult(moved > 0 ? "Done." : "No funds moved.");
  }

  private handleShopBuyAction(action: Extract<MenuAction, { kind: "shopBuy" }>): void {
    const shop = this.data_.shops?.shops.find((entry) => entry.id === action.storeId);
    if (!shop?.itemIds.includes(action.itemId)) {
      this.showMenuResult("Not for sale.");
      return;
    }
    const item = this.itemById(action.itemId);
    if (!item) {
      this.showMenuResult("Not for sale.");
      return;
    }
    const result = this.partyState.buyItem(action.char, item);
    if (!result.ok) {
      this.showMenuResult(result.reason === "inventoryFull" ? "No room to carry it." : "Not enough money.");
      return;
    }
    const inventorySlot = Math.max(0, this.partyState.inventory(action.char).length - 1);
    if (item.equippable && equipmentSlotForItemType(item.type)) {
      this.openShopEquipPrompt({
        kind: "shop-equip",
        storeId: action.storeId,
        char: action.char,
        inventorySlot,
        itemId: item.id,
        itemName: this.itemName(item.id, item)
      });
      return;
    }
    this.refreshOpenMenuAfterAction();
  }

  private handleShopSellAction(action: Extract<MenuAction, { kind: "shopSell" }>): void {
    if (this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.refreshOpenMenuAfterAction();
      return;
    }
    const item = this.itemById(action.itemId) ?? fallbackShopItem(action.itemId);
    this.partyState.sellItem(action.char, item);
    this.refreshOpenMenuAfterAction();
  }

  private handleShopEquipNowAction(action: Extract<MenuAction, { kind: "shopEquipNow" }>): void {
    const item = this.itemById(action.itemId);
    if (!item || this.partyState.inventory(action.char)[action.inventorySlot] !== action.itemId) {
      this.recordServiceResult("shop-equip", "You can't equip that.");
      this.showMenuResult("You can't equip that.");
      return;
    }
    const result = this.partyState.equip(action.char, item);
    this.recordServiceResult("shop-equip", result.ok ? "Equipped." : "You can't equip that.");
    this.activeService = undefined;
    this.openShopRootMenu(action.storeId);
  }

  private handleShopEquipLaterAction(action: Extract<MenuAction, { kind: "shopEquipLater" }>): void {
    this.recordServiceResult("shop-equip", "Kept in Goods.");
    this.activeService = undefined;
    this.openShopRootMenu(action.storeId);
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
    this.showMenuResult(result.ok
      ? "Used."
      : result.reason === "notFieldUsable" ? "You can't use that here." : "You can't use that.");
  }

  private handleItemGiveAction(action: Extract<MenuAction, { kind: "itemGive" }>): void {
    const result = this.partyState.transferItem(
      action.ownerChar,
      action.targetChar,
      action.inventorySlot,
      action.itemId
    );
    this.showMenuResult(result.ok
      ? "Gave."
      : result.reason === "targetFull" ? "They can't carry any more." : "You can't give that.");
  }

  private handleItemDropAction(action: Extract<MenuAction, { kind: "itemDrop" }>): void {
    const result = this.partyState.dropItem(action.ownerChar, action.inventorySlot, action.itemId);
    this.showMenuResult(result.ok ? "Dropped." : "You can't drop that.");
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

  private handleHospitalServiceAction(action: Extract<MenuAction, { kind: "hospitalService" }>): void {
    const cost = action.cost;
    if (!action.accept) {
      this.recordServiceResult("hospital", "Maybe later.", cost);
      this.showMenuResult("Maybe later.");
      return;
    }
    if (this.partyState.wallet < cost) {
      this.recordServiceResult("hospital", "You don't have enough $swag.", cost);
      this.showMenuResult("You don't have enough $swag.");
      return;
    }
    this.partyState.applyMoney("take", cost);
    this.partyState.fullRecover({ cureStatuses: true });
    this.recordServiceResult("hospital", "All fixed up.", cost);
    this.showMenuResult("All fixed up.");
  }

  private handleHotelServiceAction(action: Extract<MenuAction, { kind: "hotelService" }>): void {
    const cost = action.cost;
    if (!action.accept) {
      this.recordServiceResult("hotel", "Maybe next time.", cost);
      this.showMenuResult("Maybe next time.");
      return;
    }
    if (this.partyState.wallet < cost) {
      this.recordServiceResult("hotel", "You don't have enough $swag.", cost);
      this.showMenuResult("You don't have enough $swag.");
      return;
    }
    this.partyState.applyMoney("take", cost);
    this.partyState.fullRecover({ cureStatuses: false });
    this.recordServiceResult("hotel", "You rested. Good morning.", cost);
    this.showMenuResult("You rested. Good morning.");
  }

  private handlePhoneServiceAction(action: Extract<MenuAction, { kind: "phoneService" }>): void {
    if (action.option === "dad") {
      const saved = this.saveGame(false);
      this.recordServiceResult("phone", saved ? "Dad saved your game." : "Dad couldn't save.");
      this.showMenuResult(saved ? "Dad saved your game." : "Dad couldn't save.");
      return;
    }
    if (action.option === "mom") {
      this.recordServiceResult("phone", "Mom says you're doing great.");
      this.showMenuResult("Mom says you're doing great.");
      return;
    }
    this.recordServiceResult("phone", "Hung up.");
    this.closeMenu();
  }

  private handleStorageDepositAction(action: Extract<MenuAction, { kind: "storageDeposit" }>): void {
    const result = this.partyState.depositStoredItem(action.char, action.inventorySlot, action.itemId);
    if (!result.ok) {
      this.recordServiceResult("phone", "Escargo couldn't take that.");
      this.showMenuResult("Escargo couldn't take that.");
      return;
    }
    this.recordServiceResult("phone", "Stored.");
    this.refreshOpenMenuAfterAction();
  }

  private handleStorageWithdrawAction(action: Extract<MenuAction, { kind: "storageWithdraw" }>): void {
    const result = this.partyState.withdrawStoredItem(action.char, action.storageSlot, action.itemId);
    if (!result.ok) {
      const message = result.reason === "targetFull" ? "You can't carry any more." : "Escargo couldn't find that.";
      this.recordServiceResult("phone", message);
      this.showMenuResult(message);
      return;
    }
    this.recordServiceResult("phone", "Delivered.");
    this.refreshOpenMenuAfterAction();
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.data_.items?.items.find((item) => item.id === itemId);
  }

  private itemName(itemId: number, item?: ItemData): string {
    return createDialogueResolver(this.data_).itemName(itemId) ?? item?.name.trim() ?? `[item ${itemId}]`;
  }

  private partyMemberById(charId: number): PartyMember | undefined {
    return this.data_.characters?.characters.map(buildPartyMember).find((member) => member.id === charId);
  }

  private showMenuResult(message: string): void {
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.activeService = undefined;
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
    this.activeService = undefined;
    this.refreshMenuScreens();
    if (!this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private refreshOpenMenuAfterAction(): void {
    this.refreshMenuScreens();
    this.menuState = refreshMenuStackScreens(this.menuState, (id) => this.menuScreens.get(id));
    if (!this.menuState.open) {
      this.activeShopStoreId = undefined;
      this.activeService = undefined;
    }
    if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private cancelCommandMenu(): void {
    if (!this.menuState.open) {
      return;
    }
    this.playMenuSfx("menuCancel");
    this.menuState = cancelMenu(this.menuState);
    if (!this.menuState.open) {
      this.activeShopStoreId = undefined;
      this.activeService = undefined;
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
    if (this.activeService?.kind === "atm") {
      screens.push(buildAtmScreen({
        characters: this.data_.characters,
        partyState: this.partyState
      }));
    } else if (this.activeService?.kind === "hospital") {
      screens.push(buildHospitalServiceScreen({
        wallet: this.partyState.wallet,
        cost: this.activeService.cost ?? this.hospitalServiceCost()
      }));
    } else if (this.activeService?.kind === "hotel") {
      screens.push(buildHotelServiceScreen({
        wallet: this.partyState.wallet,
        cost: this.activeService.cost ?? DEFAULT_HOTEL_REST_COST
      }));
    } else if (this.activeService?.kind === "phone") {
      screens.push(...buildPhoneServiceScreens({
        characters: this.data_.characters,
        items: this.data_.items,
        partyState: this.partyState,
        resolver
      }));
    } else if (this.activeService?.kind === "shop-equip") {
      screens.push(buildShopEquipPromptScreen(this.activeService));
    }
    this.menuScreens = new Map(screens.map((screen) => [screen.id, screen]));
  }

  overworldStatusHud(): OverworldStatusHudView {
    const members = this.overworldHudPartyMembers().slice(0, 4).map((member) => {
      const vitals = this.partyState.vitals(member.id);
      const maxHp = statusHudStat(vitals?.maxHp ?? member.maxHp, 1);
      const hp = statusHudStat(vitals?.hp.displayed ?? member.hp);
      const hpTarget = Math.min(maxHp, statusHudStat(vitals?.hp.target ?? member.hp));
      const maxPp = statusHudStat(vitals?.maxPp ?? member.maxPp);
      const pp = Math.min(maxPp, statusHudStat(vitals?.pp ?? member.pp));
      const statuses = this.partyState.statuses(member.id);
      return {
        charId: member.id,
        name: member.name.trim() || "PLAYER",
        hp: Math.min(maxHp, hp),
        hpTarget,
        maxHp,
        pp,
        maxPp,
        statuses,
        hpRolling: Boolean(vitals?.hp.isRolling),
        danger: isDangerHp(hpTarget, maxHp)
      };
    });
    return {
      visible: members.length > 0,
      dangerActive: members.some((member) => member.danger),
      poisonTicks: this.poisonStepTicks,
      poisonHpLost: this.poisonHpLost,
      members
    };
  }

  private updateDangerHeartbeat(deltaMs: number): void {
    if (!this.overworldStatusHud().dangerActive) {
      this.dangerHeartbeatElapsedMs = LOW_HP_DANGER_BEEP_INTERVAL_MS;
      return;
    }
    this.dangerHeartbeatElapsedMs += Math.max(0, deltaMs);
    if (this.dangerHeartbeatElapsedMs < LOW_HP_DANGER_BEEP_INTERVAL_MS) {
      return;
    }
    this.dangerHeartbeatElapsedMs = 0;
    this.transitionSfx.dangerHeartbeat();
  }

  private applyFieldPoisonForStep(playerSteppedTile: boolean): void {
    if (!playerSteppedTile) {
      return;
    }
    const ticks = this.partyState.applyFieldPoisonStep();
    if (ticks.length === 0) {
      return;
    }
    this.poisonStepTicks += ticks.length;
    this.poisonHpLost += ticks.reduce((sum, tick) => sum + tick.hpLoss, 0);
    this.transitionSfx.poisonTick();
    this.refreshMenuScreens();
  }

  private overworldHudPartyMembers(): PartyMember[] {
    const characters = this.data_.characters?.characters;
    if (!characters?.length) {
      return [];
    }
    const members = this.partyState.applyToPartyMembers(characters.map(buildPartyMember));
    const activeIds = new Set(this.partyState.party());
    return activeIds.size > 0 ? members.filter((member) => activeIds.has(member.id)) : members;
  }

  private openShopMenu(storeId: number): void {
    this.activeShopStoreId = Math.max(0, Math.floor(storeId));
    this.activeService = undefined;
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

  private openShopRootMenu(storeId: number): void {
    this.activeShopStoreId = Math.max(0, Math.floor(storeId));
    this.refreshMenuScreens();
    const root = this.menuScreens.get(shopRootScreenId(this.activeShopStoreId));
    if (!root) {
      this.showMenuResult("Shop closed.");
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private openShopEquipPrompt(input: Extract<ActiveServiceState, { kind: "shop-equip" }>): void {
    this.activeShopStoreId = input.storeId;
    this.activeService = input;
    this.refreshMenuScreens();
    const screen = this.menuScreens.get(buildShopEquipPromptScreen(input).id);
    if (!screen) {
      this.refreshOpenMenuAfterAction();
      return;
    }
    this.menuState = openMenu(screen);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private openAtmMenu(): void {
    this.activeShopStoreId = undefined;
    this.activeService = { kind: "atm" };
    this.refreshMenuScreens();
    const root = this.menuScreens.get(ATM_MENU_ID);
    if (!root) {
      this.activeService = undefined;
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private openServiceMenu(service: ServiceKind, cost?: number): void {
    if (service === "atm") {
      this.openAtmMenu();
      return;
    }
    const resolvedCost = service === "hospital"
      ? cost ?? this.hospitalServiceCost()
      : service === "hotel"
        ? cost ?? DEFAULT_HOTEL_REST_COST
        : cost;
    this.activeShopStoreId = undefined;
    this.activeService = resolvedCost === undefined ? { kind: service } : { kind: service, cost: resolvedCost };
    this.refreshMenuScreens();
    const rootId = service === "hospital"
      ? HOSPITAL_SERVICE_MENU_ID
      : service === "hotel"
        ? HOTEL_SERVICE_MENU_ID
        : PHONE_SERVICE_MENU_ID;
    const root = this.menuScreens.get(rootId);
    if (!root) {
      this.activeService = undefined;
      return;
    }
    this.menuState = openMenu(root);
    lockPlayer(this.playerState, this.playerFrames);
    this.updatePrompt();
    this.publish();
  }

  private hospitalServiceCost(): number {
    return this.partyState.hospitalRecoveryCost(this.overworldHudPartyMembers());
  }

  menuRenderStack(): MenuRenderScreen[] {
    return menuRenderStack(this.menuState);
  }

  menuDebugState(): MenuDebugState {
    return menuDebugState(this.menuState);
  }

  private playMenuSfx(cue: MenuSfxCue): void {
    this.menuSfx.resume();
    this.menuSfx[cue]();
    this.menuSfxCount += 1;
    this.menuSfxCalls = [...this.menuSfxCalls, cue].slice(-24);
  }

  private menuSfxDebug(): { last: MenuSfxCue | null; count: number; calls: MenuSfxCue[] } {
    return {
      last: this.menuSfxCalls[this.menuSfxCalls.length - 1] ?? null,
      count: this.menuSfxCount,
      calls: [...this.menuSfxCalls]
    };
  }

  private serviceDebug(): ServiceDebugState {
    return {
      ...(this.activeService ? { active: { ...this.activeService } } : {}),
      ...(this.lastServiceResult ? { lastResult: { ...this.lastServiceResult } } : {})
    };
  }

  private recordServiceResult(kind: ActiveServiceState["kind"], message: string, cost?: number): void {
    this.lastServiceResult = {
      kind,
      message,
      ...(cost !== undefined ? { cost } : {}),
      wallet: this.partyState.wallet,
      bank: this.partyState.bank,
      storageItems: this.partyState.storage().length
    };
  }

  private handleSaveKey(): void {
    if (this.menuState.open || this.dialogue.open || this.eventSequence?.running || !this.player) {
      return;
    }
    this.saveGame(false);
  }

  private saveGame(showResult: boolean): boolean {
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
      return saved;
    }
    this.updatePrompt();
    this.publish();
    return saved;
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

  private latestSavedPlayerSnapshot(): SavePlayerSnapshot | undefined {
    const persisted = deserializeSaveState(this.saveSlots?.loadFromSlot(this.saveSlot));
    const save = persisted ?? this.bootSaveState;
    return save && this.isCompatibleSavePlayer(save.player) ? { ...save.player } : undefined;
  }

  private newGameRespawnPlayerSnapshot(): SavePlayerSnapshot {
    const spawn = this.newGameOpening?.spawn ?? this.world_.player.spawnWorldPixel;
    return {
      mode: "chunked",
      mapId: this.saveMapId(),
      x: spawn.x,
      y: spawn.y,
      facing: "down"
    };
  }

  /**
   * Resolve a deferred story-gate boss (content/triggers.json battleGroup) on battle
   * return. Its flags — and the once-fired marker — advance ONLY on a win. On a
   * loss/flee the player lands back at the gate with control: suppress the trigger so
   * they aren't thrown straight back into the fight; it re-arms once they leave the
   * area and can re-engage deliberately.
   */
  private applyStoryGateReturn(restore: ChunkedWorldRestore): void {
    const gate = restore.pendingStoryGate;
    if (!gate) {
      return;
    }
    const resolution = resolveStoryGateReturn(gate, restore.outcome);
    if (resolution.kind === "advance") {
      if (resolution.firedFlag) {
        this.gameFlags.set(resolution.firedFlag);
      }
      resolution.setFlags.forEach((flag) => this.gameFlags.set(flag));
      resolution.clearFlags.forEach((flag) => this.gameFlags.unset(flag));
      return;
    }
    this.suppressedTriggerId = resolution.triggerId;
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
    this.applyStoryGateReturn(restore);
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
    if (!target) {
      return;
    }
    if (target.targetKind !== "npc") {
      this.openOverworldInteractable(target);
      return;
    }
    const npc = [...this.npcRuntimes.values()].find((runtime) => runtime.data.npcId === target.npcId);
    if (!npc) {
      return;
    }
    const events = this.interactionEventsForNpc(npc.data);
    if (events.length === 0) {
      return;
    }
    this.pauseNpcForDialogue(npc);
    this.playInteractionSfx("talkConfirm");
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents(events);
    this.updatePrompt();
    this.publish();
  }

  private openOverworldInteractable(target: WorldInteractionCandidate): void {
    const entry = this.overworldInteractableById(target.interactableId);
    if (!entry) {
      return;
    }
    const action = overworldInteractableEvents(entry, this.gameFlags, {
      itemName: (itemId) => this.itemName(itemId, this.itemById(itemId)),
      hasRoom: (char) => this.partyState.inventoryRoom(char) > 0
    });
    if (action.events.length === 0) {
      return;
    }
    this.restoreActiveNpc();
    for (const cue of action.sfxBeforeEvents) {
      this.playInteractionSfx(cue);
    }
    lockPlayer(this.playerState, this.playerFrames);
    this.runEvents(action.events);
    this.syncPresentInteractableSprites();
    this.updatePrompt();
    this.publish();
  }

  private interactionEventsForNpc(npc: RuntimeNpcData): GameEvent[] {
    if (isAddedWorldChunkedNpc(npc)) {
      return addedNpcInteractionEvents(
        { npcId: npc.npcId, interaction: npc.addedInteraction },
        this.data_.dialogueLibrary,
        this.gameFlags
      );
    }
    return interactionEvents(
      npc,
      this.targetReference,
      this.gameFlags,
      this.data_.customDialogue,
      this.data_.dialogueLibrary,
      this.data_.scripts
    );
  }

  private overworldInteractableById(id: string | undefined): OverworldInteractable | undefined {
    if (!id) {
      return undefined;
    }
    return this.data_.overworldInteractables.interactables.find((entry) => entry.id === id);
  }

  private overworldInteractableOpened(entry: OverworldInteractable): boolean {
    return overworldInteractableIsOpened(entry, this.gameFlags);
  }

  private playInteractionSfx(cue: InteractionSfxCue): void {
    this.transitionSfx.resume();
    this.interactionSfxCalls = [...this.interactionSfxCalls, cue].slice(-24);
    this.interactionSfxCount += 1;
    switch (cue) {
      case "talkConfirm":
        this.transitionSfx.talkConfirm();
        break;
      case "presentOpen":
        this.transitionSfx.presentOpen();
        break;
      case "itemGet":
        this.transitionSfx.itemGet();
        break;
      case "readCue":
        this.transitionSfx.readCue();
        break;
    }
  }

  private runEvents(events: GameEvent[]): void {
    dispatchInteractionEvents(events, {
      startDialogue: (event) => this.startInteractionDialogue(event),
      setFlag: (flag) => {
        this.gameFlags.set(flag);
        this.syncPresentInteractableSprites();
      },
      openShop: (storeId) => this.openShopMenu(storeId),
      deferShop: (storeId) => {
        this.pendingInteractionShopStoreId = storeId;
      },
      openService: (service, cost) => this.openServiceMenu(service, cost),
      deferService: (service, cost) => {
        this.pendingInteractionService = { service, ...(cost !== undefined ? { cost } : {}) };
      },
      heal: (scope) => this.requestHospitalService(scope),
      save: () => this.requestPhoneService(),
      give: (char, item) => this.giveItem(char, item),
      money: (op, amount) => this.partyState.applyMoney(op, amount),
      isDialogueActive: () => this.dialogue.open || Boolean(this.eventSequence?.running)
    });
  }

  private giveItem(char: number, item: number): void {
    this.partyState.give(char, item);
    this.playInteractionSfx("itemGet");
    this.refreshMenuScreens();
    this.updatePrompt();
    this.publish();
  }

  private requestHospitalService(scope: HealEvent["scope"]): void {
    if (scope !== "full") {
      return;
    }
    if (this.dialogue.open || this.eventSequence?.running) {
      this.pendingInteractionService = { service: "hospital" };
      return;
    }
    this.openServiceMenu("hospital");
  }

  private requestPhoneService(): void {
    if (this.dialogue.open || this.eventSequence?.running) {
      this.pendingInteractionService = { service: "phone" };
      return;
    }
    this.openServiceMenu("phone");
  }

  private startInteractionDialogue(event: DialogueEvent): void {
    if (event.reference) {
      if (this.startEventSequence(event.reference)) {
        return;
      }
      if (event.pages) {
        this.dialogue.start(buildInlineDialoguePages(event.pages));
        return;
      }
      this.dialogue.start(resolveScriptedDialoguePages(
        this.data_.customDialogue,
        this.data_.dialogueLibrary,
        this.data_.scripts,
        event.reference,
        this.gameFlags
      ));
    } else if (event.pages) {
      this.dialogue.start(buildInlineDialoguePages(event.pages));
    }
  }

  private pauseNpcForDialogue(npc: NpcRuntime): void {
    this.restoreActiveNpc();
    this.activeNpcDialogue = { key: npc.key, id: npc.data.npcId, restoreFacing: npc.state.player.facing };
    npc.state.paused = true;
    this.setNpcIdleFacing(npc, facingToward(npc.state.player.x, npc.state.player.y, this.playerState.x, this.playerState.y));
  }

  private configureEventRuntime(): void {
    this.eventSequence = new RuntimeEventSequence(this.data_.scripts, this.createRuntimeEventHost());
  }

  private createRuntimeEventHost(): RuntimeEventHost {
    return new RuntimeEventHost({
      dialogue: this.dialogue,
      flags: this.gameFlags,
      partyState: this.partyState,
      resolveWarpDestination: (dest, style) => this.resolveEventWarpDestination(dest, style),
      applyWarpDestination: (destination) => this.applyEventWarpDestination(destination),
      startBattle: (group) => this.startEventBattleForCurrentMode(group),
      openShop: (storeId) => this.openShopForCurrentMode(storeId),
      openAtm: () => this.openAtmMenu(),
      actorMove: (effect) => this.requestCutsceneActorMove(effect),
      onPartyChange: () => this.handlePartyCompositionChanged(),
      music: this.music,
      isEffectSupported: (effect) => this.isEventEffectSupportedForCurrentMode(effect),
      onUnsupportedEffect: (effect) => this.warnUnsupportedEventEffect(effect),
      customDialogue: this.data_.customDialogue,
      dialogueLibrary: this.data_.dialogueLibrary
    });
  }

  private startEventSequence(reference: string): boolean {
    return this.eventSequence?.start(reference, {
      onComplete: () => this.afterDialogueClosed(),
      ...(this.activeNpcDialogue?.id !== undefined ? { npcId: this.activeNpcDialogue.id } : {})
    }) ?? false;
  }

  private requestCutsceneActorMove(effect: ActorMoveEffect): boolean {
    if (this.cutsceneMove) {
      return false;
    }
    const actor = normalizeActorMoveSelector(effect.actor);
    if (!actor || !Number.isFinite(effect.to.x) || !Number.isFinite(effect.to.y)) {
      return false;
    }
    const npc = actor.kind === "npc" ? this.npcRuntimeForActor(actor) : undefined;
    const runtime = npc ? this.cutsceneNpcRuntime(npc) : this.resolveCutsceneMoveActor(actor);
    if (!runtime) {
      return false;
    }

    const target = this.clampSpawn(effect.to);
    const actorLabel = cutsceneActorLabel(actor);
    this.cutsceneMove = {
      actor,
      actorLabel,
      ...(npc ? { npcKey: npc.key, restoreNpcPaused: npc.state.paused } : {}),
      ...(npc && this.authoredOpeningCutsceneRunActive ? { holdNpcUntilStartupFinalize: true } : {}),
      target,
      run: effect.run === true,
      elapsedMs: 0,
      maxDurationMs: CUTSCENE_ACTOR_MOVE_TIMEOUT_MS
    };
    if (npc) {
      npc.state.paused = true;
      npc.state.player.velocityX = 0;
      npc.state.player.velocityY = 0;
      npc.state.player.moving = false;
    }
    if (actor.kind === "player") {
      lockPlayer(this.playerState, this.playerFrames);
    }
    this.cutsceneMoveDebug = {
      active: true,
      actor: actorLabel,
      target,
      arrived: false,
      elapsedMs: 0,
      position: roundedPoint(runtime.state)
    };
    this.updatePrompt();
    this.publish();
    return true;
  }

  private stepCutsceneMove(deltaMs: number): void {
    const move = this.cutsceneMove;
    if (!move) {
      return;
    }
    const runtime = this.resolveActiveCutsceneMoveActor(move);
    if (!runtime) {
      this.completeCutsceneMove(false, true);
      return;
    }

    move.elapsedMs += Math.max(0, deltaMs);
    const distance = Phaser.Math.Distance.Between(runtime.state.x, runtime.state.y, move.target.x, move.target.y);
    if (distance <= CUTSCENE_ACTOR_MOVE_ARRIVAL_PX) {
      this.setCutsceneActorPosition(runtime, move.target);
      this.completeCutsceneMove(true, false);
      return;
    }

    if (move.elapsedMs >= move.maxDurationMs) {
      this.completeCutsceneMove(false, true);
      return;
    }

    const arrived = advanceCutsceneActorTowardTarget(runtime.state, move.target, {
      deltaMs,
      speed: move.run ? PLAYER_SPEED * CUTSCENE_ACTOR_RUN_MULTIPLIER : PLAYER_SPEED,
      bounds: this.movementBounds(),
      frames: runtime.frames,
      arrivalPx: CUTSCENE_ACTOR_MOVE_ARRIVAL_PX
    });
    runtime.sync();
    if (arrived) {
      this.completeCutsceneMove(true, false);
      return;
    }
    this.cutsceneMoveDebug = {
      active: true,
      actor: move.actorLabel,
      target: move.target,
      arrived: false,
      elapsedMs: Math.round(move.elapsedMs),
      position: roundedPoint(runtime.state)
    };
  }

  private completeCutsceneMove(arrived: boolean, timedOut: boolean): void {
    const move = this.cutsceneMove;
    if (!move) {
      return;
    }
    const runtime = this.resolveActiveCutsceneMoveActor(move);
    this.restoreCutsceneMoveNpc(move);
    this.cutsceneMove = undefined;
    this.cutsceneMoveDebug = {
      active: false,
      actor: move.actorLabel,
      target: move.target,
      arrived,
      ...(timedOut ? { timedOut } : {}),
      elapsedMs: Math.round(move.elapsedMs),
      ...(runtime ? { position: roundedPoint(runtime.state) } : {})
    };
    this.eventSequence?.notifyActorArrived();
    this.updatePrompt();
    this.publish();
  }

  private resolveCutsceneMoveActor(actor: NormalizedActorMoveSelector): CutsceneMoveActorRuntime | undefined {
    if (actor.kind === "player") {
      if (!this.player) {
        return undefined;
      }
      return {
        state: this.playerState,
        frames: this.playerFrames,
        sync: () => this.syncPlayerObject()
      };
    }
    const npc = this.npcRuntimeForActor(actor);
    return npc ? this.cutsceneNpcRuntime(npc) : undefined;
  }

  private resolveActiveCutsceneMoveActor(move: CutsceneMoveState): CutsceneMoveActorRuntime | undefined {
    if (move.actor.kind === "player") {
      return this.resolveCutsceneMoveActor(move.actor);
    }
    const npc = move.npcKey ? this.npcRuntimes.get(move.npcKey) : undefined;
    return npc ? this.cutsceneNpcRuntime(npc) : undefined;
  }

  private cutsceneNpcRuntime(npc: NpcRuntime): CutsceneMoveActorRuntime {
    return {
      state: npc.state.player,
      frames: npc.frames,
      sync: () => this.syncNpc(npc)
    };
  }

  private npcRuntimeForActor(actor: Extract<NormalizedActorMoveSelector, { kind: "npc" }>): NpcRuntime | undefined {
    return [...this.npcRuntimes.values()].find((runtime) => runtime.data.npcId === actor.npcId);
  }

  private restoreCutsceneMoveNpc(move: CutsceneMoveState): void {
    if (move.actor.kind !== "npc" || !move.npcKey || move.restoreNpcPaused === undefined) {
      return;
    }
    const npc = this.npcRuntimes.get(move.npcKey);
    if (npc) {
      if (move.holdNpcUntilStartupFinalize) {
        this.openingCutsceneActorHolds.hold(move.npcKey, npc.state, move.restoreNpcPaused);
        return;
      }
      npc.state.paused = move.restoreNpcPaused;
    }
  }

  private releaseOpeningCutsceneActorHolds(): void {
    this.openingCutsceneActorHolds.release((key) => this.npcRuntimes.get(key)?.state);
  }

  private setCutsceneActorPosition(runtime: CutsceneMoveActorRuntime, point: { x: number; y: number }): void {
    runtime.state.x = point.x;
    runtime.state.y = point.y;
    runtime.state.velocityX = 0;
    runtime.state.velocityY = 0;
    runtime.state.moving = false;
    runtime.state.walkClockMs = 0;
    runtime.state.animKey = `idle-${runtime.state.facing}`;
    runtime.state.animFrame = runtime.frames[runtime.state.facing][0];
    runtime.sync();
  }

  // --- Authored content cutscenes (content/cutscenes.json) ----------------------

  /** Each frame (when idle), fire the first eligible content cutscene. */
  private maybeStartCutscene(): boolean {
    if (this.cutsceneRunner?.running || this.dialogue.open || this.eventSequence?.running || this.isDoorFadeActive()) {
      return false;
    }
    const cutscenes = this.data_.cutscenes?.cutscenes;
    if (!cutscenes || cutscenes.length === 0) {
      return false;
    }
    const feet = { x: this.playerState.x, y: this.playerState.y };
    let stillSuppressed = false;
    for (const cutscene of cutscenes) {
      if (this.suppressedCutsceneId === cutscene.id && this.cutsceneTriggerInArea(cutscene, feet)) {
        stillSuppressed = true; // don't re-fire while standing in the same trigger area
        continue;
      }
      if (!this.cutsceneConditionsMet(cutscene, feet)) {
        continue;
      }
      this.startCutscene(cutscene);
      return true;
    }
    if (!stillSuppressed) {
      this.suppressedCutsceneId = undefined;
    }
    return false;
  }

  private cutsceneTriggerInArea(cutscene: Cutscene, feet: { x: number; y: number }): boolean {
    return cutscene.trigger.kind === "area" && pointInArea(feet, cutscene.trigger.area);
  }

  private cutsceneConditionsMet(cutscene: Cutscene, feet: { x: number; y: number }): boolean {
    const once = cutscene.once !== false;
    if (once && this.gameFlags.has(`cutscene:${cutscene.id}`)) {
      return false;
    }
    if (cutscene.requireFlags?.some((flag) => !this.gameFlags.has(flag))) {
      return false;
    }
    if (cutscene.blockFlags?.some((flag) => this.gameFlags.has(flag))) {
      return false;
    }
    switch (cutscene.trigger.kind) {
      case "area":
        return pointInArea(feet, cutscene.trigger.area);
      case "flag":
        return this.gameFlags.has(cutscene.trigger.flag);
      case "interact":
        return false; // interaction-triggered cutscenes fire from the talk path, not the area scan
      default:
        return false;
    }
  }

  private startCutscene(cutscene: Cutscene): void {
    const lockForCutscene = cutscene.lockPlayer !== false;
    this.activeCutsceneId = cutscene.id;
    this.suppressedCutsceneId = cutscene.id;
    if (lockForCutscene) {
      lockPlayer(this.playerState, this.playerFrames);
    }
    const finish = (): void => {
      if (cutscene.once !== false) {
        this.gameFlags.set(`cutscene:${cutscene.id}`);
      }
      this.cutsceneRunner = undefined;
      this.activeCutsceneId = undefined;
      // Keep visibility overrides: hidden actors must stay hidden after the scene.
      // The EB flag (eventFlag step) blocks re-creation, but already-spawned runtimes
      // need the override to stay hidden. Overrides reset on scene start.
      if (lockForCutscene && !this.dialogue.open && !this.eventSequence?.running) {
        unlockPlayer(this.playerState);
      }
      this.updatePrompt();
      this.publish();
    };
    // onComplete fires inside the constructor for all-instant cutscenes; assign
    // only if still running so a completed runner doesn't linger.
    const runner = new CutsceneRunner(cutscene.steps, this.createCutsceneHost(), finish);
    if (runner.running) {
      this.cutsceneRunner = runner;
    }
    this.updatePrompt();
    this.publish();
  }

  private createCutsceneHost(): CutsceneHost {
    return {
      startActorMove: (actor, to, run) => this.requestCutsceneActorMove({ kind: "actorMove", actor, to, run }),
      isActorMoveActive: () => this.cutsceneMove !== undefined,
      faceActor: (actor, dir) => this.setCutsceneActorFacing(actor, dir),
      setActorVisible: (actor, visible) => this.setCutsceneActorVisible(actor, visible),
      startDialogue: (pages) => this.dialogue.start(buildInlineDialoguePages([...pages])),
      isDialogueOpen: () => this.dialogue.open,
      setGameFlag: (flag) => this.gameFlags.set(flag),
      clearGameFlag: (flag) => this.gameFlags.unset(flag),
      setEventFlag: (flag, set) => { if (set) { this.gameFlags.setNum(flag); } else { this.gameFlags.unsetNum(flag); } },
      playSound: (id) => this.playCutsceneSound(id),
      warp: (to) => this.warpPlayerToWorldPixel(to)
    };
  }

  private cutsceneActorVisible(npcId: number): boolean {
    const override = this.cutsceneVisibilityOverride.get(npcId);
    return override === undefined ? true : override;
  }

  private setCutsceneActorVisible(actor: EventActorMoveSelector, visible: boolean): void {
    const normalized = normalizeActorMoveSelector(actor);
    if (!normalized || normalized.kind !== "npc") {
      return; // the player actor is always visible
    }
    this.cutsceneVisibilityOverride.set(normalized.npcId, visible);
    const hiddenFlag = cutsceneNpcHiddenFlag(normalized.npcId);
    if (visible) {
      this.gameFlags.unset(hiddenFlag);
    } else {
      this.gameFlags.set(hiddenFlag);
    }
    const npc = this.npcRuntimeForActor(normalized);
    if (npc) {
      this.syncNpc(npc);
    }
  }

  private playCutsceneSound(id: CutsceneSoundId): void {
    const cue = resolveCutsceneSfxCue(id);
    if (!cue) {
      console.warn(`Unknown cutscene sound cue: ${cutsceneSoundLabel(id)}`);
      return;
    }
    this.transitionSfx.resume();
    this.playCutsceneSfxCue(cue);
  }

  private playCutsceneSfxCue(cue: CutsceneSfxCue): void {
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
      case "encounter":
        this.transitionSfx.encounter();
        break;
      case "textBlip":
        this.transitionSfx.textBlip();
        break;
      case "dangerHeartbeat":
        this.transitionSfx.dangerHeartbeat();
        break;
      case "poisonTick":
        this.transitionSfx.poisonTick();
        break;
      case "talkConfirm":
        this.playInteractionSfx("talkConfirm");
        break;
      case "presentOpen":
        this.playInteractionSfx("presentOpen");
        break;
      case "itemGet":
        this.playInteractionSfx("itemGet");
        break;
      case "readCue":
        this.playInteractionSfx("readCue");
        break;
    }
  }

  private setCutsceneActorFacing(actor: EventActorMoveSelector, dir: CutsceneFacing): void {
    const normalized = normalizeActorMoveSelector(actor);
    if (!normalized) {
      return;
    }
    if (normalized.kind === "player") {
      this.playerState.facing = dir;
      this.playerState.animKey = `idle-${dir}`;
      this.playerState.animFrame = this.playerFrames[dir][0];
      this.syncPlayerObject();
      return;
    }
    const npc = this.npcRuntimeForActor(normalized);
    if (!npc) {
      return;
    }
    npc.state.player.facing = dir;
    npc.state.player.animKey = `idle-${dir}`;
    npc.state.player.animFrame = npc.frames[dir][0];
    this.syncNpc(npc);
  }

  private warpPlayerToWorldPixel(to: { x: number; y: number }): void {
    const point = this.clampSpawn(to);
    this.playerState.x = point.x;
    this.playerState.y = point.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.syncPlayerObject();
    this.refreshRoomBounds();
    this.refreshStreaming();
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
      this.syncOverworldMusicCue();
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

    if (!this.startAuthoredOpeningCutsceneBeforeStartup(opening, decision.reference)) {
      this.startNewGameStartupEvent(decision.reference);
    }
  }

  private startAuthoredOpeningCutsceneBeforeStartup(
    opening: NewGameOpeningStart | undefined,
    startupReference: string
  ): boolean {
    if (!opening) {
      return false;
    }
    const script = buildOpeningCutsceneScript(this.data_.openingCutscene);
    if (!script) {
      return false;
    }

    const sequence = new RuntimeEventSequence(script, this.createRuntimeEventHost());
    this.eventSequence = sequence;
    this.authoredOpeningCutsceneRunActive = true;
    const started = sequence.start(AUTHORED_OPENING_CUTSCENE_REF, {
      onComplete: () => {
        this.authoredOpeningCutsceneRunActive = false;
        this.startNewGameStartupEvent(startupReference, { resetEventRuntime: true });
      }
    });
    if (!started) {
      this.authoredOpeningCutsceneRunActive = false;
      this.configureEventRuntime();
      return false;
    }
    this.updatePrompt();
    return true;
  }

  private startNewGameStartupEvent(
    reference: string,
    options: { resetEventRuntime?: boolean } = {}
  ): void {
    if (options.resetEventRuntime) {
      this.configureEventRuntime();
    }

    const started = this.eventSequence?.start(reference, {
      onComplete: (result) => this.finalizeNewGameStartup(result)
    }) ?? false;
    if (!started) {
      this.authoredOpeningCutsceneRunActive = false;
      this.releaseOpeningCutsceneActorHolds();
      this.startupRunActive = false;
      this.startupMode = "startup";
      unlockPlayer(this.playerState);
      this.newGameStartupRecord = this.startupRecord({
        attempted: true,
        started: false,
        reference,
        status: "skipped",
        skippedReason: "unresolved_ref",
        fallbackApplied: true,
        fallbackReason: "unresolved_ref",
        initialPlayer: this.startupInitialSpawn,
        finalPlayer: this.currentPlayerPoint(),
        finalPlayerControllable: this.isPlayerControllable()
      });
      publishNewGameStartupRecord(this.newGameStartupRecord);
      this.syncOverworldMusicCue();
      return;
    }

    if (this.startupRunActive && this.eventSequence?.running && this.startupMode === "startup") {
      this.abortStartupAtControlStart(reference);
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
    this.authoredOpeningCutsceneRunActive = false;
    if (completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
      this.syncOverworldMusicCue();
    }
    if (this.dialogue.open && result.status === "aborted") {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    this.releaseOpeningCutsceneActorHolds();
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
    this.authoredOpeningCutsceneRunActive = false;
    if (completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
      this.syncOverworldMusicCue();
    }
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    this.releaseOpeningCutsceneActorHolds();
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

  private startOverriddenScriptedDialogue(pages: DialoguePage[], onComplete: () => void): void {
    this.pendingScriptedDialogueComplete = onComplete;
    this.dialogue.start(pages);
  }

  /**
   * Authored story gates (content/triggers.json): when the player's feet enter a
   * trigger area and its flag conditions hold, fire its effects. Generalizes the
   * intro-beat pattern to data-driven progression gating (prerequisite flags,
   * boss battles, flag-gated barricades). Returns true when a trigger fired.
   */
  private maybeFireStoryTrigger(): boolean {
    const triggers = this.data_.storyTriggers?.triggers;
    if (!triggers || triggers.length === 0) {
      return false;
    }
    if (
      this.menuState.open ||
      this.dialogue.open ||
      this.eventSequence?.running ||
      this.isDoorFadeActive() ||
      this.playerState.inputLocked
    ) {
      return false;
    }
    // Re-arm: drop the suppression once the player walks out of that area.
    this.suppressedTriggerId = resolveSuppression(this.suppressedTriggerId, triggers, this.playerState);
    const trigger = selectStoryTrigger(
      triggers,
      this.playerState,
      (flag) => this.gameFlags.has(flag),
      this.suppressedTriggerId
    );
    if (!trigger) {
      return false;
    }

    this.suppressedTriggerId = trigger.id;
    // The once-fired marker is NOT set here: a story-gate boss must be WON before it
    // counts as fired (see applyStoryTriggerEffects / applyReturnRestore). Non-battle
    // triggers set it immediately in applyStoryTriggerEffects.

    if (trigger.dialogue && trigger.dialogue.length > 0) {
      lockPlayer(this.playerState, this.playerFrames);
      this.startOverriddenScriptedDialogue(
        buildInlineDialoguePages(trigger.dialogue),
        () => this.applyStoryTriggerEffects(trigger)
      );
    } else {
      this.applyStoryTriggerEffects(trigger);
    }
    this.syncPlayerObject();
    this.updatePrompt();
    this.publish();
    return true;
  }

  private applyStoryTriggerEffects(trigger: StoryTrigger): void {
    // Story-gate boss: launch the battle now and defer ALL flag effects (including
    // the once-fired marker) until the player WINS it. A lost or fled boss never
    // advances the story; see applyReturnRestore for the win/loss handling. Warp
    // triggers keep priority over a battleGroup (matches prior behavior).
    if (trigger.battleGroup !== undefined && trigger.warp === undefined) {
      if (this.startEventBattle(trigger.battleGroup, {
        triggerId: trigger.id,
        once: isOnce(trigger),
        setFlags: trigger.setFlags,
        clearFlags: trigger.clearFlags
      })) {
        return;
      }
      this.warnStoryTriggerSkip(`battle_unavailable:${trigger.id}`);
    }

    // Non-battle trigger (or battle-unavailable fallback): apply effects immediately.
    if (isOnce(trigger)) {
      this.gameFlags.set(triggerFiredFlag(trigger.id));
    }
    trigger.setFlags?.forEach((flag) => this.gameFlags.set(flag));
    trigger.clearFlags?.forEach((flag) => this.gameFlags.unset(flag));

    if (trigger.warp) {
      this.applyDoorWarp(
        { x: trigger.warp.x, y: trigger.warp.y, worldPixel: trigger.warp, direction: this.playerState.facing },
        { kind: "teleport" }
      );
      return;
    }

    if (trigger.music) {
      this.forcedOverworldMusicCue = trigger.music as OverworldMusicCue;
      this.syncOverworldMusicCue(true);
    }

    this.afterDialogueClosed();
    this.updatePrompt();
    this.publish();
  }

  private warnStoryTriggerSkip(reason: string): void {
    if (this.warnedStoryTriggerSkips.has(reason)) {
      return;
    }
    this.warnedStoryTriggerSkips.add(reason);
    console.warn("Story trigger effect skipped.", reason);
  }

  private completeIntroMeteorDialogue(beat: IntroMeteorBeatStart): void {
    this.newGameOpening = undefined;
    this.warnIntroActorVmStubs();
    this.ensureIntroParty();
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

  private ensureIntroParty(): void {
    const characters = this.data_.characters?.characters;
    if (!characters?.length) {
      return;
    }
    // Act 1 is a duo: Bosch (Ness) leads and Paula joins as the PSI support — she handles the
    // high-defense climax (Titanic Ant) with PSI Freeze while Bosch heals with Lifeup.
    const partyIds = [characters[0].id, ...(characters[1] ? [characters[1].id] : [])];
    const snapshot = this.partyState.snapshot();
    this.partyState.restore({
      ...snapshot,
      partyIds
    });
  }

  private handlePartyCompositionChanged(): void {
    this.partyState.ensureVitalsFor(this.overworldHudPartyMembers());
    this.refreshMenuScreens();
    this.spawnFollower({ x: this.playerState.x, y: this.playerState.y }, this.playerState.facing);
    this.publish();
  }

  private finishIntroMeteorBeatWithoutBattle(): void {
    this.newGameOpening = undefined;
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
      case "actorMove":
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

  private manageBossGates(_deltaMs: number): boolean {
    const triggers = this.data_.storyTriggers?.triggers;
    if (!triggers || !this.data_.battle || !this.player) {
      this.publishBossGateDebug();
      return false;
    }

    const active = selectActiveBossGates(triggers, (flag) => this.gameFlags.has(flag));
    const activeIds = new Set(active.map((trigger) => trigger.id));
    for (const [id, actor] of this.bossGateActors) {
      if (!activeIds.has(id)) {
        actor.sprite?.destroy();
        this.bossGateActors.delete(id);
      }
    }

    for (const gate of active) {
      if (!gate.boss || this.bossGateActors.has(gate.id)) {
        continue;
      }
      this.spawnBossGate(gate);
    }

    for (const actor of this.bossGateActors.values()) {
      this.upgradeBossGateSprite(actor);
      this.syncBossGateActor(actor);
      if (!actor.armed && this.distanceToPlayer(actor) > BOSS_GATE_ARM_DIST_PX) {
        actor.armed = true;
      }
    }

    this.publishBossGateDebug();
    if (!this.overworldPlayActive() || this.encounterCooldownMs > 0) {
      return false;
    }
    for (const actor of this.bossGateActors.values()) {
      if (actor.armed && this.distanceToPlayer(actor) <= BOSS_GATE_CONTACT_PX) {
        return this.triggerBossGate(actor);
      }
    }
    return false;
  }

  private spawnBossGate(gate: StoryTrigger): void {
    if (!gate.boss || gate.battleGroup === undefined) {
      this.warnStoryTriggerSkip(`boss_gate_invalid:${gate.id}`);
      return;
    }
    const lead = this.enemiesForBattleGroup(gate.battleGroup)[0];
    if (!lead) {
      this.warnStoryTriggerSkip(`boss_enemy_unavailable:${gate.id}`);
      return;
    }
    const spriteGroup = lead.overworldSprite;
    const { textureKey, skin, frames } = this.resolveOverworldEnemySkin(lead);
    const facing = toFacing(gate.boss.facing);
    const sprite = this.spawnOverworldEnemyActor(gate.boss.x, gate.boss.y, facing, textureKey, skin, spriteGroup);
    if (textureKey && !(sprite instanceof Phaser.GameObjects.Sprite)) {
      sprite.setVisible(false);
    }
    this.bossGateActors.set(gate.id, {
      triggerId: gate.id,
      trigger: gate,
      enemyGroup: gate.battleGroup,
      spriteGroup,
      frames,
      textureKey,
      skin,
      sprite,
      x: gate.boss.x,
      y: gate.boss.y,
      facing,
      armed: false
    });
  }

  private upgradeBossGateSprite(actor: BossGateRuntime): void {
    if (actor.sprite instanceof Phaser.GameObjects.Sprite || !actor.textureKey) {
      return;
    }
    if (!this.textures.exists(actor.textureKey)) {
      return;
    }
    actor.sprite?.destroy();
    actor.sprite = this.spawnOverworldEnemyActor(
      actor.x,
      actor.y,
      actor.facing,
      actor.textureKey,
      actor.skin,
      actor.spriteGroup
    );
  }

  private syncBossGateActor(actor: BossGateRuntime): void {
    const sprite = actor.sprite;
    if (!sprite) {
      return;
    }
    sprite.x = actor.x;
    sprite.y = actor.y;
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      sprite.setFrame(actor.frames[actor.facing][0]);
    }
    this.setActorSortDepth(sprite);
  }

  private triggerBossGate(actor: BossGateRuntime): boolean {
    actor.armed = false;
    const trigger = actor.trigger;
    const gate: PendingStoryGate = {
      triggerId: trigger.id,
      once: isOnce(trigger),
      setFlags: trigger.setFlags,
      clearFlags: trigger.clearFlags
    };
    const startBattle = () => {
      if (this.startEventBattle(actor.enemyGroup, gate)) {
        return;
      }
      this.warnStoryTriggerSkip(`battle_unavailable:${trigger.id}`);
      if (isOnce(trigger)) {
        this.gameFlags.set(triggerFiredFlag(trigger.id));
      }
      trigger.setFlags?.forEach((flag) => this.gameFlags.set(flag));
      trigger.clearFlags?.forEach((flag) => this.gameFlags.unset(flag));
      this.afterDialogueClosed();
      this.updatePrompt();
      this.publish();
    };

    if (trigger.dialogue && trigger.dialogue.length > 0) {
      lockPlayer(this.playerState, this.playerFrames);
      this.startOverriddenScriptedDialogue(buildInlineDialoguePages(trigger.dialogue), startBattle);
    } else {
      startBattle();
    }
    this.syncPlayerObject();
    this.updatePrompt();
    this.publish();
    return true;
  }

  private publishBossGateDebug(): void {
    (globalThis as Record<string, unknown>).__bossGates = {
      count: this.bossGateActors.size,
      gates: [...this.bossGateActors.values()].map((actor) => ({
        triggerId: actor.triggerId,
        enemyGroup: actor.enemyGroup,
        x: Math.round(actor.x),
        y: Math.round(actor.y),
        armed: actor.armed,
        visible: actor.sprite instanceof Phaser.GameObjects.Sprite
      }))
    };
  }

  // --- Visible overworld enemies (EarthBound-style touch-to-battle) -----------

  /**
   * Step, spawn, and collide visible roaming enemies in danger sectors. This
   * replaces invisible step-based random encounters: a battle starts only when
   * an enemy sprite actually touches the player. Returns true when a battle
   * was started (so the update loop bails for the scene transition).
   */
  private manageOverworldEnemies(deltaMs: number): boolean {
    if (!this.data_.encounters || !this.data_.battle || !this.player) {
      return false;
    }
    this.syncEncounterTileState();
    this.overworldEnemySpawnCooldownMs = Math.max(0, this.overworldEnemySpawnCooldownMs - deltaMs);
    this.stepOverworldEnemies(deltaMs);
    if (this.canSpawnOverworldEnemy()) {
      this.trySpawnOverworldEnemy();
    }
    this.publishOverworldEnemyDebug();
    return this.checkOverworldEnemyContact();
  }

  private publishOverworldEnemyDebug(): void {
    (globalThis as Record<string, unknown>).__overworldEnemies = {
      count: this.overworldEnemies.size,
      enemies: [...this.overworldEnemies.values()].map((enemy) => ({
        enemyGroup: enemy.enemyGroup,
        spriteGroup: enemy.spriteGroup,
        x: Math.round(enemy.state.player.x),
        y: Math.round(enemy.state.player.y)
      }))
    };
  }

  /** Enemies roam and battles trigger only while the player has free control. */
  private overworldPlayActive(): boolean {
    return !this.menuState.open
      && !this.dialogue.open
      && !this.eventSequence?.running
      && !this.isDoorFadeActive()
      && !this.playerState.inputLocked;
  }

  private stepOverworldEnemies(deltaMs: number): void {
    const active = this.overworldPlayActive();
    for (const [key, enemy] of this.overworldEnemies) {
      if (this.distanceToPlayer(enemy.state.player) > OVERWORLD_ENEMY_DESPAWN_DIST_PX) {
        enemy.sprite?.destroy();
        this.overworldEnemies.delete(key);
        continue;
      }
      if (active) {
        enemy.contactGraceMs = Math.max(0, enemy.contactGraceMs - deltaMs);
        stepNpc(enemy.state, {
          deltaMs,
          bounds: this.movementBounds(),
          // Respect terrain (walls/water) but pass through actors so they can reach the player.
          blocked: (x, y) => this.blocked(x, y),
          frames: enemy.frames
        });
      }
      this.upgradeOverworldEnemySprite(enemy);
      this.syncOverworldEnemy(enemy);
    }
  }

  /** Swap a placeholder for the real sprite once its sheet (skin or EB group) finishes loading. */
  private upgradeOverworldEnemySprite(enemy: OverworldEnemyRuntime): void {
    if (enemy.sprite instanceof Phaser.GameObjects.Sprite || !enemy.textureKey) {
      return;
    }
    if (!this.textures.exists(enemy.textureKey)) {
      return;
    }
    enemy.sprite?.destroy();
    enemy.sprite = this.spawnOverworldEnemyActor(
      enemy.state.player.x,
      enemy.state.player.y,
      enemy.state.player.facing,
      enemy.textureKey,
      enemy.skin,
      enemy.spriteGroup
    );
  }

  private syncOverworldEnemy(enemy: OverworldEnemyRuntime): void {
    const actor = enemy.sprite;
    if (!actor) {
      return;
    }
    actor.x = enemy.state.player.x;
    actor.y = enemy.state.player.y;
    if (actor instanceof Phaser.GameObjects.Sprite) {
      actor.setFrame(enemy.state.player.animFrame);
    }
    this.setActorSortDepth(actor);
    actor.y = enemy.state.player.y - this.spriteWalkBob(
      enemy.state.player.moving,
      enemy.frames,
      enemy.state.player.facing,
      enemy.enemyGroup
    );
  }

  private canSpawnOverworldEnemy(): boolean {
    return this.encounterEnabled
      && this.encounterCooldownMs <= 0
      && this.overworldEnemySpawnCooldownMs <= 0
      && this.overworldEnemies.size < OVERWORLD_ENEMY_GLOBAL_CAP
      && this.overworldPlayActive();
  }

  private trySpawnOverworldEnemy(): void {
    const sector = this.currentEncounterSector();
    const budget = sectorSpawnBudget(sector, { maxPerSector: OVERWORLD_ENEMY_GLOBAL_CAP });
    if (budget <= 0 || this.overworldEnemies.size >= budget) {
      return;
    }
    const enemyGroup = selectSectorEnemyGroup(sector, () => this.encounterRng.next(), {
      isFlagSet: (flag) => this.gameFlags.isSet(flag)
    });
    if (enemyGroup === null) {
      return;
    }
    const lead = this.enemiesForBattleGroup(enemyGroup)[0];
    if (!lead) {
      return;
    }
    const spot = this.findOverworldEnemySpawnPoint();
    if (!spot) {
      return;
    }
    this.overworldEnemySpawnCooldownMs = OVERWORLD_ENEMY_SPAWN_INTERVAL_MS;
    const spriteGroup = lead.overworldSprite;
    const { textureKey, skin, frames } = this.resolveOverworldEnemySkin(lead);
    this.overworldEnemySeq += 1;
    const key = `enemy-${this.overworldEnemySeq}`;
    const sprite = this.spawnOverworldEnemyActor(spot.x, spot.y, undefined, textureKey, skin, spriteGroup);
    // Hide the placeholder rectangle while the real sheet streams in;
    // upgradeOverworldEnemySprite() swaps in the sprite (visible) once it loads.
    if (textureKey && !(sprite instanceof Phaser.GameObjects.Sprite)) {
      sprite.setVisible(false);
    }
    this.overworldEnemies.set(key, {
      key,
      enemyGroup,
      spriteGroup,
      frames,
      textureKey,
      skin,
      contactGraceMs: OVERWORLD_ENEMY_CONTACT_GRACE_MS,
      state: createNpcState(spot.x, spot.y, toFacing(undefined), {
        kind: "wander",
        radiusPx: OVERWORLD_ENEMY_WANDER_RADIUS_PX,
        speedPxPerSec: OVERWORLD_ENEMY_WANDER_SPEED_PX_PER_SEC,
        seed: (Math.imul(this.overworldEnemySeq, 0x9e3779b1) ^ enemyGroup) >>> 0
      }, frames),
      sprite
    });
  }

  private resolveOverworldEnemySkin(lead: BattleEnemy): {
    textureKey?: string;
    skin?: SpriteOverrideSheet;
    frames: DirectionFrameSequence;
  } {
    const spriteGroup = lead.overworldSprite;
    // Prefer the Swagbound roaming-enemy skin (by enemy id); fall back to the EB
    // overworld sprite group when the family has no skin art.
    const skin = spriteOverrideSheet(spriteOverrideForEnemyOverworld(this.data_.spriteOverrides, lead.id));
    if (skin) {
      const textureKey = spriteOverrideEnemyOverworldSheetKey(lead.id, skin.image);
      this.requestEnemySkinSheet(textureKey, skin);
      return {
        textureKey,
        skin,
        frames: spriteOverrideDirectionFrames(skin)
      };
    }
    const textureKey = spriteGroup !== undefined ? `sheet-${spriteGroup}` : undefined;
    if (spriteGroup !== undefined && this.requestNpcSheet(spriteGroup)) {
      this.load.start();
    }
    return {
      textureKey,
      frames: this.framesForGroup(spriteGroup)
    };
  }

  private requestEnemySkinSheet(textureKey: string, skin: SpriteOverrideSheet): void {
    if (this.textures.exists(textureKey) || this.loadingEnemySkinKeys.has(textureKey)) {
      return;
    }
    this.loadingEnemySkinKeys.add(textureKey);
    this.load.spritesheet(textureKey, spriteOverrideAssetUrl(skin.image), {
      frameWidth: skin.frameWidth,
      frameHeight: skin.frameHeight
    });
    this.load.start();
  }

  private spawnOverworldEnemyActor(
    x: number,
    y: number,
    direction: string | undefined,
    textureKey: string | undefined,
    skin: SpriteOverrideSheet | undefined,
    spriteGroup: number | undefined
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    if (skin && textureKey && this.textures.exists(textureKey)) {
      return this.spawnOverrideActor(x, y, direction, textureKey, skin);
    }
    if (skin) {
      // Skin sheet not ready yet: hidden placeholder until upgrade (avoids an EB-art flash).
      return this.spawnPlaceholderActor(x, y);
    }
    return this.spawnActor(x, y, spriteGroup, direction);
  }

  private findOverworldEnemySpawnPoint(): { x: number; y: number } | undefined {
    const bounds = this.movementBounds();
    const span = OVERWORLD_ENEMY_MAX_SPAWN_DIST_PX - OVERWORLD_ENEMY_MIN_SPAWN_DIST_PX;
    for (let attempt = 0; attempt < OVERWORLD_ENEMY_SPAWN_ATTEMPTS; attempt += 1) {
      const angle = this.encounterRng.next() * Math.PI * 2;
      const dist = OVERWORLD_ENEMY_MIN_SPAWN_DIST_PX + this.encounterRng.next() * span;
      const x = Math.min(bounds.maxX, Math.max(bounds.minX, Math.round(this.playerState.x + Math.cos(angle) * dist)));
      const y = Math.min(bounds.maxY, Math.max(bounds.minY, Math.round(this.playerState.y + Math.sin(angle) * dist)));
      if (!this.blocked(x, y) && this.distanceToPlayer({ x, y }) >= OVERWORLD_ENEMY_MIN_SPAWN_DIST_PX) {
        return { x, y };
      }
    }
    return undefined;
  }

  private checkOverworldEnemyContact(): boolean {
    if (!this.overworldPlayActive() || this.encounterCooldownMs > 0) {
      return false;
    }
    for (const [key, enemy] of this.overworldEnemies) {
      if (enemy.contactGraceMs <= 0 && this.distanceToPlayer(enemy.state.player) <= OVERWORLD_ENEMY_CONTACT_PX) {
        this.overworldEnemies.delete(key);
        enemy.sprite?.destroy();
        return this.triggerOverworldEnemyBattle(enemy);
      }
    }
    return false;
  }

  private triggerOverworldEnemyBattle(enemy: OverworldEnemyRuntime): boolean {
    if (this.encounterAdvantageForGroup(enemy.enemyGroup) === "instantWin") {
      return this.resolveInstantWinEncounter(enemy.enemyGroup);
    }
    const advantage = touchAdvantage(
      { x: this.playerState.x, y: this.playerState.y, facing: this.playerState.facing },
      { x: enemy.state.player.x, y: enemy.state.player.y, facing: enemy.state.player.facing }
    );
    return this.startBattleWithReturn(enemy.enemyGroup, "encounter", advantage);
  }

  private distanceToPlayer(point: { x: number; y: number }): number {
    return Math.hypot(point.x - this.playerState.x, point.y - this.playerState.y);
  }

  private clearOverworldEnemies(): void {
    for (const enemy of this.overworldEnemies.values()) {
      enemy.sprite?.destroy();
    }
    this.overworldEnemies.clear();
    for (const actor of this.bossGateActors.values()) {
      actor.sprite?.destroy();
    }
    this.bossGateActors.clear();
    this.overworldEnemySpawnCooldownMs = 0;
    this.loadingEnemySkinKeys.clear();
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
    encounterAdvantage: EncounterAdvantage = "normal",
    pendingStoryGate?: PendingStoryGate
  ): boolean {
    if (!this.data_.battle || !this.battleGroupExists(group) || !this.player) {
      return false;
    }
    this.lastEncounterGroup = group;
    this.scene.stop("ui");
    // Play the colored EB encounter swirl over the overworld, THEN switch to battle (see tickEncounterSwirl).
    const battlePartyMembers = this.battlePartyMembers();
    const encounterSeed = this.nextBattleEncounterSeed();
    this.beginEncounterSwirl({
      battleData: this.data_.battle,
      groupId: group,
      characters: this.data_.characters,
      partyMembers: battlePartyMembers,
      partyOptions: this.battlePartyOptions(battlePartyMembers),
      wallet: this.partyState.wallet,
      bank: this.partyState.bank,
      items: this.data_.items,
      psi: this.data_.psi,
      font: this.data_.font,
      window: this.data_.window,
      spriteOverrides: this.data_.spriteOverrides,
      backgroundOverrides: this.data_.backgroundOverrides,
      battleRules: this.data_.battleRules,
      encounterAdvantage,
      encounterSeed,
      boss: pendingStoryGate !== undefined,
      returnTo: this.battleReturnContext(group, source, pendingStoryGate)
    });
    return true;
  }

  private beginEncounterSwirl(params: Record<string, unknown>): void {
    this.pendingBattleStart = { sceneKey: "battle", params };
    this.encounterSwirlMs = 0;
    // Stop the overworld track (it fades out over the ~0.6s swirl, so it's silent
    // before the battle music hits) and fire the EB battle-swirl sting.
    this.music.stop();
    this.currentOverworldMusicCue = undefined;
    this.transitionSfx.encounter();
    lockPlayer(this.playerState, this.playerFrames);
    if (!this.encounterSwirlGfx) {
      this.encounterSwirlGfx = this.add.graphics().setScrollFactor(0).setDepth(ENCOUNTER_SWIRL_DEPTH);
    }
    this.encounterSwirlGfx.setVisible(true);
  }

  /** Advance + render the overworld encounter swirl; switch to the battle scene when fully covered. */
  private tickEncounterSwirl(delta: number): boolean {
    if (!this.pendingBattleStart) {
      return false;
    }
    this.encounterSwirlMs += delta;
    const p = Math.min(1, this.encounterSwirlMs / ENCOUNTER_SWIRL_MS);
    const g = this.encounterSwirlGfx;
    if (g) {
      g.clear();
      // progress 1 -> clear (overworld visible), 0 -> covered/black; ramp 1->0 to cover the screen.
      drawSwirl(g, 1 - p, this.scale.width, this.scale.height, {
        clockMs: this.time.now,
        advantageTint: swirlTintForAdvantage(this.pendingBattleStart.params.encounterAdvantage)
      });
    }
    this.syncPlayerObject();
    if (p >= 1) {
      const { sceneKey, params } = this.pendingBattleStart;
      this.pendingBattleStart = undefined;
      g?.clear();
      g?.setVisible(false);
      this.scene.start(sceneKey, params);
    }
    return true;
  }

  private encounterAdvantageForGroup(group: number): EncounterAdvantage {
    const party = this.effectiveBattlePartyMembers();
    const enemies = this.enemiesForBattleGroup(group);
    return party && enemies.length > 0 ? computeEncounterAdvantage(party, enemies) : "normal";
  }

  private nextBattleEncounterSeed(): number {
    this.encounterRng.next();
    return this.encounterRng.state();
  }

  private resolveInstantWinEncounter(group: number): boolean {
    if (!this.data_.battle || !this.battleGroupExists(group) || !this.player) {
      return false;
    }
    const enemies = this.enemiesForBattleGroup(group);
    if (enemies.length === 0) {
      return false;
    }
    const instantWinPartyMembers = this.battlePartyMembers();
    const encounterSeed = this.nextBattleEncounterSeed();
    const battle = createBattleState(enemies, {
      characters: this.data_.characters,
      partyMembers: instantWinPartyMembers,
      partyOptions: this.battlePartyOptions(instantWinPartyMembers),
      wallet: this.partyState.wallet,
      bank: this.partyState.bank
    });
    const rewards = resolveInstantWinRewards(battle.party, enemies, instantWinRewardOptions({
      wallet: battle.wallet,
      bank: battle.bank ?? this.partyState.bank,
      roundNumber: battle.roundNumber,
      rng: createBattleRng(battleRngSeedForGroup(group, enemies, encounterSeed)),
      items: this.data_.items?.items,
      psi: this.data_.psi?.psi
    }));
    this.partyState.applyBattleResult(rewards.state.party, rewards.state.wallet, rewards.state.bank);
    this.lastEncounterGroup = group;
    this.encounterCooldownMs = ENCOUNTER_RETURN_COOLDOWN_MS;
    this.refreshMenuScreens();
    this.dialogue.start(buildInlineDialoguePages(["You won!"]));
    this.updatePrompt();
    this.publish();
    return true;
  }

  private battleReturnContext(
    group: number,
    source: BattleReturnSource,
    pendingStoryGate?: PendingStoryGate
  ): BattleReturnContext {
    const savedPlayer = this.latestSavedPlayerSnapshot();
    return {
      sceneKey: "chunked-world",
      gameData: this.data_,
      saveSlot: this.saveSlot,
      saveSlots: this.saveSlots,
      restore: {
        ...(pendingStoryGate ? { pendingStoryGate } : {}),
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
        defeat: {
          ...(savedPlayer ? { savedPlayer } : {}),
          newGamePlayer: this.newGameRespawnPlayerSnapshot()
        },
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
    // Battle only the active party (Act 1 = Bosch + Paula); never the full roster.
    const activeIds = new Set(this.partyState.party());
    // BASE stats only. Equip bonuses ride separately as combatant statBonuses
    // (battlePartyOptions) so post-battle snapshots never compound them.
    return activeIds.size > 0 ? all.filter((member) => activeIds.has(member.id)) : all;
  }

  /** Per-member combatant options aligned with battlePartyMembers(): equip bonuses as statBonuses. */
  private battlePartyOptions(members: PartyMember[] | undefined): PlayerCombatantOptions[] | undefined {
    if (!members?.length) {
      return undefined;
    }
    return members.map((member) => {
      const bonus = this.equipStatBonuses(member.id);
      return bonus.offense || bonus.defense ? { statBonuses: bonus } : {};
    });
  }

  /** Members with equip bonuses folded in — for advantage math and debug readouts ONLY, never persistence. */
  private effectiveBattlePartyMembers(): PartyMember[] | undefined {
    return this.battlePartyMembers()?.map((member) => {
      const bonus = this.equipStatBonuses(member.id);
      return bonus.offense || bonus.defense
        ? { ...member, stats: { ...member.stats, offense: member.stats.offense + bonus.offense, defense: member.stats.defense + bonus.defense } }
        : member;
    });
  }

  private equipStatBonuses(charId: number): { offense: number; defense: number } {
    let offense = 0;
    let defense = 0;
    for (const itemId of Object.values(this.partyState.equipped(charId))) {
      const bonuses = this.itemById(itemId)?.equipBonuses;
      if (bonuses) {
        offense += bonuses.offense ?? 0;
        defense += bonuses.defense ?? 0;
      }
    }
    return { offense, defense };
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
    return expandBattleGroupEnemies(battle, battleGroup);
  }

  private registerForceEncounter(): void {
    this.forceEncounterHook = (groupId?: number, advantage?: unknown) => this.forceEncounter(groupId, advantage);
    (globalThis as Record<string, unknown>).__forceEncounter = this.forceEncounterHook;
  }

  private registerCutsceneMoveDemoGlobal(): void {
    this.unregisterCutsceneMoveDemoGlobal();
    this.cutsceneMoveDemoHook = (npcId: number | string, x: number, y: number, run?: boolean) =>
      this.runCutsceneMoveDemo(npcId, x, y, run);
    (globalThis as Record<string, unknown>).__runCutsceneMoveDemo = this.cutsceneMoveDemoHook;
  }

  private unregisterCutsceneMoveDemoGlobal(): void {
    const globals = globalThis as Record<string, unknown>;
    if (this.cutsceneMoveDemoHook && globals.__runCutsceneMoveDemo === this.cutsceneMoveDemoHook) {
      delete globals.__runCutsceneMoveDemo;
    }
    this.cutsceneMoveDemoHook = undefined;
  }

  private runCutsceneMoveDemo(npcId: number | string, x: number, y: number, run = false): boolean {
    if (this.eventSequence?.running || this.cutsceneMove) {
      return false;
    }
    const effect = demoActorMoveEffect(npcId, x, y, run);
    if (!effect) {
      return false;
    }
    const sequence = new RuntimeEventSequence(cutsceneMoveDemoScript(effect), this.createRuntimeEventHost());
    this.eventSequence = sequence;
    const started = sequence.start(CUTSCENE_MOVE_DEMO_REFERENCE, {
      onComplete: () => {
        this.afterDialogueClosed();
        this.configureEventRuntime();
        this.publish();
      }
    });
    if (!started) {
      this.configureEventRuntime();
    }
    return started;
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

  private startEventBattle(group: number, pendingStoryGate?: PendingStoryGate): boolean {
    return this.startBattleWithReturn(group, "event", "normal", pendingStoryGate);
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
    if (this.pendingInteractionService) {
      const pending = this.pendingInteractionService;
      this.pendingInteractionService = undefined;
      this.openServiceMenu(pending.service, pending.cost);
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
    this.syncOverworldMusicCue();
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
    // Cancel is "skip to end", not "abandon": one-shot story beats (intro
    // meteor, story triggers, boss gates) must still fire their completion
    // effects or their armed flags leave the run permanently stranded.
    const pendingComplete = this.pendingScriptedDialogueComplete;
    this.pendingScriptedDialogueComplete = undefined;
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.eventSequence?.abort();
    if (pendingComplete) {
      pendingComplete();
    } else {
      this.afterDialogueClosed();
    }
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
    this.player.y = this.playerState.y - this.spriteWalkBob(
      this.playerState.moving,
      this.playerFrames,
      this.playerState.facing,
      0
    );
    this.applyPlayerVisualState();
    this.updateFollower();
  }

  private playerStateSheetKey(state: string): string {
    return `sprite-override-player-state-${state}`;
  }

  private overlaySheetKey(name: string): string {
    return `sprite-override-overlay-${name}`;
  }

  /** Texture key for a faithful state sheet IF the skin defines it AND it loaded; else undefined. */
  private loadedStateSheetKey(baseState: ResolvedVisualState["baseState"]): string | undefined {
    if (baseState === "default") {
      return undefined;
    }
    const states = this.playerSpriteOverride()?.states as Record<string, unknown> | undefined;
    if (!states?.[baseState]) {
      return undefined;
    }
    const key = this.playerStateSheetKey(baseState);
    return this.textures.exists(key) ? key : undefined;
  }

  private playerBaseScale(): number {
    const override = spriteOverrideSheet(this.playerSpriteOverride());
    return override ? spriteOverrideScale(override.displayHeight, override.frameHeight) : 1;
  }

  /** Live visual-state inputs: real signals merged under forced overrides (forced wins, for tests/cutscenes). */
  private currentVisualStateInputs(): VisualStateInputs {
    const base = defaultVisualStateInputs();
    const forced = this.forcedVisualState;
    return {
      ...base,
      deepWater: this.isPlayerInWater(), // real terrain signal (3a)
      ko: this.leadPartyMemberDowned(), // real KO signal: lead at 0 HP -> dead/ghost overworld sprite
      // ladder/rope/bike real triggers await tile-class data + a mount mechanic; forced-path for now.
      ...forced,
      status: { ...base.status, ...(forced.status ?? {}) }
    };
  }

  /** The lead (front) party member is downed (0 HP) — shows the dead overworld sprite. */
  private leadPartyMemberDowned(): boolean {
    const leadId = this.partyState.party()[0];
    if (leadId === undefined) {
      return false;
    }
    const vitals = this.partyState.vitals(leadId);
    return vitals ? vitals.hp.target <= 0 : false;
  }

  private isPlayerInWater(): boolean {
    try {
      const surface = surfaceAtWorldPixel(this.surfaceRows, { x: this.playerState.x, y: this.playerState.y }, this.collisionGrid());
      return (surface & SURFACE_WATER_MASK) !== 0;
    } catch {
      return false;
    }
  }

  /**
   * Resolve the hero visual state and apply it to the player sprite. Swaps to a faithful state sheet
   * when one exists; otherwise applies the generic approximation (scale/alpha/tint) so any skin still
   * "does the same". Runs each frame from syncPlayerObject (cheap; idempotent).
   */
  private applyPlayerVisualState(): void {
    if (!(this.player instanceof Phaser.GameObjects.Sprite)) {
      return;
    }
    const resolved = resolvePlayerVisualState(this.currentVisualStateInputs());
    this.lastResolvedVisualState = resolved;
    const sprite = this.player;

    const stateSheetKey = this.loadedStateSheetKey(resolved.baseState);
    const sheetSwapped = stateSheetKey !== undefined;
    if (stateSheetKey && sprite.texture.key !== stateSheetKey) {
      sprite.setTexture(stateSheetKey);
    }

    // With a faithful sheet, no approximation; without one, fall back to the generic look-alike.
    const approx = sheetSwapped ? {} : resolved.approximation;
    const scale = this.playerBaseScale() * (approx.scale ?? 1);
    sprite.setScale(scale);
    const alpha = approx.alpha ?? 1;
    sprite.setAlpha(alpha);

    // Color inversion: a real per-pixel ColorMatrix negative filter; tint fallback if filters are
    // unavailable. Diamondized's approximation desaturates via tint.
    const invertViaFilter = this.setPlayerInvert(sprite, resolved.transforms.invertPalette);
    let tint: number | null = null;
    if (approx.desaturate) {
      tint = 0x9a9a9a;
    } else if (resolved.transforms.invertPalette && !invertViaFilter) {
      tint = 0x6a6aff;
    }
    if (tint === null) {
      sprite.clearTint();
    } else {
      sprite.setTint(tint);
    }

    // Frame: teleport spin cycles facings rapidly (reuses walk frames); else locked poses hold frame 0.
    if (resolved.transforms.teleportSpin && !sheetSwapped) {
      const order: Array<"down" | "left" | "up" | "right"> = ["down", "left", "up", "right"];
      const idx = Math.floor(this.time.now / 70) % order.length;
      sprite.setFrame(this.playerFrames[order[idx]][0]);
    } else if (resolved.lockAnimation && !sheetSwapped) {
      sprite.setFrame(this.playerFrames[this.playerState.facing][0]);
    }

    this.lastVisualSheetSwapped = sheetSwapped;
    this.lastVisualApplied = { scale, alpha, tint };
    this.updatePlayerOverlays(resolved); // positioned from the un-shifted feet, before the water raise below

    // Water wading: clip the submerged lower body at the waterline and raise the sprite so the visible
    // top stays put. Resolver gates waterClip to upright base states (default/tiny). Crop is cleared
    // otherwise. Done last so overlays already anchored to the normal head position.
    const ov = this.playerSpriteOverride();
    if (resolved.transforms.waterClip && ov?.frameHeight && ov?.frameWidth) {
      const waterline = ov.anchors?.waterline ?? Math.round(ov.frameHeight * 0.6);
      sprite.setCrop(0, 0, ov.frameWidth, waterline);
      sprite.y -= (ov.frameHeight - waterline) * scale;
    } else if (sprite.isCropped) {
      sprite.setCrop();
    }
  }

  /**
   * Position head/companion overlay sprites (sweat/mushroom/possession) at the player's head anchor and
   * show only the active ones. Overlays follow the player, scale with it, and render just above it. The
   * head point uses anchors.head when the skin supplies it, else the top-center fallback.
   */
  private updatePlayerOverlays(resolved: ResolvedVisualState): void {
    if (!(this.player instanceof Phaser.GameObjects.Sprite)) {
      for (const sprite of this.overlaySprites.values()) {
        sprite.setVisible(false);
      }
      return;
    }
    const active = new Set<string>(resolved.overlays);
    for (const [name, sprite] of this.overlaySprites) {
      if (!active.has(name)) {
        sprite.setVisible(false);
      }
    }
    const registry = this.data_.spriteOverrides?.overlays as
      | Record<string, { frameWidth: number; frameHeight: number; frames?: number[]; offset?: { x: number; y: number } }>
      | undefined;
    if (!registry) {
      return;
    }
    const ov = this.playerSpriteOverride();
    const scale = this.lastVisualApplied.scale || 1;
    const frameW = ov?.frameWidth ?? this.player.width;
    const frameH = ov?.frameHeight ?? this.player.height;
    const headX = ov?.anchors?.head?.x ?? frameW / 2; // fallback: top-center
    const headY = ov?.anchors?.head?.y ?? 0;
    const spriteTopY = this.player.y - frameH * scale; // origin is (0.5, 1) => player.y is the feet
    for (const name of active) {
      const data = registry[name];
      const key = this.overlaySheetKey(name);
      if (!data || !this.textures.exists(key)) {
        continue;
      }
      let sprite = this.overlaySprites.get(name);
      if (!sprite || !sprite.scene) {
        sprite = this.add.sprite(0, 0, key, (data.frames ?? [0])[0]);
        sprite.setOrigin(0.5, 1);
        this.overlaySprites.set(name, sprite);
      }
      sprite.x = this.player.x + (headX - frameW / 2) * scale + (data.offset?.x ?? 0) * scale;
      sprite.y = spriteTopY + headY * scale + (data.offset?.y ?? 0) * scale;
      sprite.setScale(scale);
      sprite.setDepth(PLAYER_OVERLAY_DEPTH);
      sprite.setVisible(true);
    }
  }

  private destroyPlayerOverlays(): void {
    for (const sprite of this.overlaySprites.values()) {
      sprite.destroy();
    }
    this.overlaySprites.clear();
  }

  /**
   * Toggle a real per-pixel color inversion (Moonside) via a ColorMatrix.negative filter on the MAIN
   * CAMERA -- Phaser 4's primary filter path, and faithful since Moonside inverts the whole screen.
   * Returns true when the real filter is active; false when off OR filters are unavailable (the caller
   * then applies a sprite-tint fallback). Only mutates on change, so it's cheap to call each frame.
   */
  private setPlayerInvert(_sprite: Phaser.GameObjects.Sprite, want: boolean): boolean {
    // Faithful per-pixel inversion via a ColorMatrix.negative filter on the main camera (Phaser 4's
    // primary filter path; Moonside inverts the whole screen anyway). Returns true when applied; the
    // caller applies a sprite-tint fallback only when camera filters are unavailable. NOTE: WebGL
    // color ops (this filter AND setTint) do not composite in the headless screenshot harness, so
    // color effects are verified by the resolver + readout, not pixel-diff -- confirm visuals in a
    // real browser. Geometry (scale) and alpha effects DO pixel-diff headless.
    if (want === this.playerInvertActive) {
      return want;
    }
    type FilterCam = {
      filters?: { internal: { clear: () => void; addColorMatrix: () => { colorMatrix: { negative: () => unknown } } } } | null;
    };
    const cam = this.cameras.main as unknown as FilterCam;
    try {
      if (!cam.filters) {
        throw new Error("camera filters unavailable");
      }
      cam.filters.internal.clear();
      if (want) {
        cam.filters.internal.addColorMatrix().colorMatrix.negative();
      }
      this.playerInvertActive = want;
      return want;
    } catch {
      this.playerInvertActive = false;
      return false;
    }
  }

  private followerSpriteOverride(joinOrder: number): SpriteOverride | undefined {
    if (joinOrder === 2 && this.data_.spriteOverrides?.follower) {
      return this.data_.spriteOverrides.follower;
    }
    return this.data_.spriteOverrides?.party?.find((hero) => hero.joinOrder === joinOrder)?.sprite;
  }

  private followerSpriteOverrides(): Array<{ joinOrder: number; sheet: SpriteOverrideSheet }> {
    const result: Array<{ joinOrder: number; sheet: SpriteOverrideSheet }> = [];
    for (const joinOrder of [2, 3, 4]) {
      const sheet = spriteOverrideSheet(this.followerSpriteOverride(joinOrder));
      if (sheet) {
        result.push({ joinOrder, sheet });
      }
    }
    return result;
  }

  private followerSpriteSheetKey(joinOrder: number): string {
    return joinOrder === 2 ? FOLLOWER_SPRITE_OVERRIDE_SHEET_KEY : `sprite-override-follower-${joinOrder}`;
  }

  private destroyFollowers(): void {
    for (const follower of this.followers) {
      follower.sprite.destroy();
    }
    this.followers = [];
  }

  private spawnFollower(spawn: { x: number; y: number }, facing: string): void {
    this.destroyFollowers();
    this.followerTrail = [];
    const followerCount = Math.min(3, Math.max(0, this.partyState.party().length - 1));
    if (followerCount <= 0) {
      return; // solo party — no follower to draw
    }
    for (let index = 0; index < followerCount; index += 1) {
      const joinOrder = index + 2;
      const sheet = spriteOverrideSheet(this.followerSpriteOverride(joinOrder));
      const key = this.followerSpriteSheetKey(joinOrder);
      if (!sheet || !this.textures.exists(key)) {
        continue;
      }
      this.followers.push({
        joinOrder,
        sprite: this.spawnOverrideActor(spawn.x, spawn.y, facing, key, sheet),
        frames: spriteOverrideDirectionFrames(sheet),
        pos: { x: spawn.x, y: spawn.y },
        walkPhase: 0
      });
    }
  }

  // Trail the player at fixed path-distances behind the lead (EarthBound-style party chain).
  private updateFollower(): void {
    if (this.followers.length === 0) {
      return;
    }
    const px = this.playerState.x;
    const py = this.playerState.y;
    const trail = this.followerTrail;
    const last = trail[trail.length - 1];
    if (last && Math.hypot(px - last.x, py - last.y) > 48) {
      // Door/warp jump — snap over rather than streaking the followers across the map.
      trail.length = 0;
      for (const follower of this.followers) {
        follower.pos = { x: px, y: py };
        follower.sprite.setPosition(px, py);
      }
    }
    const tail = trail[trail.length - 1];
    if (!tail || Math.hypot(px - tail.x, py - tail.y) > 0.5) {
      trail.push({ x: px, y: py, facing: this.playerState.facing });
      if (trail.length > 144) {
        trail.shift();
      }
    }
    const FOLLOW_DISTANCE = 26;
    this.followers.forEach((follower, index) => {
      const target = this.followerTrailTarget(FOLLOW_DISTANCE * (index + 1), px, py);
      this.updateFollowerRuntime(follower, target);
    });
  }

  private followerTrailTarget(
    followDistance: number,
    px: number,
    py: number
  ): { x: number; y: number; facing: PlayerState["facing"] } {
    const trail = this.followerTrail;
    let accumulated = 0;
    let target = trail[0] ?? { x: px, y: py, facing: this.playerState.facing };
    for (let i = trail.length - 1; i > 0; i -= 1) {
      const a = trail[i];
      const b = trail[i - 1];
      const segment = Math.hypot(a.x - b.x, a.y - b.y);
      if (accumulated + segment >= followDistance) {
        const t = (followDistance - accumulated) / segment;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, facing: a.facing };
      }
      accumulated += segment;
      target = b;
    }
    return target;
  }

  private updateFollowerRuntime(
    follower: FollowerRuntime,
    target: { x: number; y: number; facing: PlayerState["facing"] }
  ): void {
    const moved = Math.hypot(target.x - follower.pos.x, target.y - follower.pos.y);
    follower.pos = { x: target.x, y: target.y };
    const walking = moved > 0.2;
    follower.sprite.x = target.x;
    if (follower.sprite instanceof Phaser.GameObjects.Sprite) {
      const frames = follower.frames[target.facing];
      if (walking) {
        follower.walkPhase += moved;
        follower.sprite.setFrame(frames[Math.floor(follower.walkPhase / 8) % frames.length] ?? frames[0]);
      } else {
        follower.sprite.setFrame(frames[0]);
      }
    }
    follower.sprite.y = target.y - this.spriteWalkBob(walking, follower.frames, target.facing, follower.joinOrder);
    this.setActorSortDepth(follower.sprite);
    this.applyFollowerVisualState(follower, target.facing);
  }

  private followerStateSheetKey(joinOrder: number, state: string): string {
    return joinOrder === 2
      ? `sprite-override-follower-state-${state}`
      : `sprite-override-follower-${joinOrder}-state-${state}`;
  }

  private loadedFollowerStateSheetKey(
    follower: FollowerRuntime,
    baseState: ResolvedVisualState["baseState"]
  ): string | undefined {
    if (baseState === "default") {
      return undefined;
    }
    const states = this.followerSpriteOverride(follower.joinOrder)?.states as Record<string, unknown> | undefined;
    if (!states?.[baseState]) {
      return undefined;
    }
    const key = this.followerStateSheetKey(follower.joinOrder, baseState);
    return this.textures.exists(key) ? key : undefined;
  }

  /**
   * Apply the party's shared visual state (computed for the lead each frame in applyPlayerVisualState)
   * to every follower sprite, using each follower's own state sheets + anchors. Overlays + teleport
   * spin stay lead-only for now. The chain mirrors the lead's base state -- in EB the party
   * climbs/rides/wades together.
   */
  private applyFollowerVisualState(
    follower: FollowerRuntime,
    facing: "up" | "down" | "left" | "right"
  ): void {
    if (!(follower.sprite instanceof Phaser.GameObjects.Sprite)) {
      return;
    }
    const resolved = this.lastResolvedVisualState;
    if (!resolved) {
      return;
    }
    const sprite = follower.sprite;
    const ov = spriteOverrideSheet(this.followerSpriteOverride(follower.joinOrder));
    const stateKey = this.loadedFollowerStateSheetKey(follower, resolved.baseState);
    const swapped = stateKey !== undefined;
    if (stateKey && sprite.texture.key !== stateKey) {
      sprite.setTexture(stateKey);
    }
    const approx = swapped ? {} : resolved.approximation;
    const baseScale = ov ? spriteOverrideScale(ov.displayHeight, ov.frameHeight) : 1;
    const scale = baseScale * (approx.scale ?? 1);
    sprite.setScale(scale);
    sprite.setAlpha(approx.alpha ?? 1);
    if (approx.desaturate) {
      sprite.setTint(0x9a9a9a); // invert is a camera-wide filter, so only the desaturate approx is per-sprite
    } else {
      sprite.clearTint();
    }
    if (resolved.lockAnimation && !swapped) {
      sprite.setFrame(follower.frames[facing][0]);
    }
    if (resolved.transforms.waterClip && ov?.frameHeight && ov?.frameWidth) {
      const waterline = ov.anchors?.waterline ?? Math.round(ov.frameHeight * 0.6);
      sprite.setCrop(0, 0, ov.frameWidth, waterline);
      sprite.y -= (ov.frameHeight - waterline) * scale;
    } else if (sprite.isCropped) {
      sprite.setCrop();
    }
  }

  private setActorSortDepth(actor: SortableActor): void {
    const bottomY = spriteBottomY({
      y: actor.y,
      originY: actor.originY,
      displayHeight: actor.displayHeight
    });
    // Tiebreak by x so actors sharing a row (e.g. a crowd of NPCs at the same y)
    // layer deterministically left-behind-right instead of stacking at one depth.
    // The fraction stays < 1 so the y-row ordering always dominates.
    const tiebreak = Number.isFinite(actor.x) ? ((actor.x % 4096) + 4096) % 4096 / 4096 * 0.5 : 0;
    actor.setDepth(spriteSortDepth(bottomY) + tiebreak);
  }

  /**
   * Vertical walk-bob offset (px, >= 0) for a moving sprite. Returns 0 for idle
   * sprites and for multi-frame sprites (raw EB / player walk cycles) that already
   * animate. Visual only: callers apply it to display-y AFTER depth sort, so it
   * never affects sort order, collision, or logical position.
   */
  private spriteWalkBob(
    moving: boolean,
    frames: DirectionFrameSequence,
    facing: Facing,
    seed: number
  ): number {
    return spriteWalkBobOffset({
      clockMs: this.spriteWalkBobClockMs,
      seed,
      moving,
      frameCount: frames[facing].length
    });
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

  private debugInteractables(): OverworldInteractableDebug[] {
    return this.data_.overworldInteractables.interactables.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      x: entry.worldPixel.x,
      y: entry.worldPixel.y,
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.kind === "present" ? { opened: this.overworldInteractableOpened(entry) } : {})
    }));
  }

  private nearestInteractionTargetDebug(): OverworldInteractionTargetDebug | undefined {
    const nearest = nearestInteractable(this.playerState, this.interactionCandidates(), INTERACTION_DISTANCE);
    if (!nearest) {
      return undefined;
    }
    return this.interactionTargetDebug(nearest.candidate as WorldInteractionCandidate, nearest.distance);
  }

  private interactionTargetDebug(
    candidate: WorldInteractionCandidate,
    distance = Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, candidate.x, candidate.y)
  ): OverworldInteractionTargetDebug {
    return {
      kind: candidate.targetKind,
      key: candidate.key,
      id: candidate.targetKind === "npc" ? candidate.npcId ?? candidate.id : candidate.interactableId ?? candidate.id,
      x: candidate.x,
      y: candidate.y,
      distance: Math.round(distance * 10) / 10,
      ...(candidate.label ? { label: candidate.label } : {})
    };
  }

  private interactionSfxDebug(): { last: InteractionSfxCue | null; count: number; calls: InteractionSfxCue[] } {
    return {
      last: this.interactionSfxCalls.at(-1) ?? null,
      count: this.interactionSfxCount,
      calls: [...this.interactionSfxCalls]
    };
  }

  private publish(): void {
    const world = this.world_;
    const npc744 = this.tutorialNpc();
    const distance = this.distanceToTutorialNpc();
    const target = this.interactionTarget();
    const targetDebug = target ? this.interactionTargetDebug(target) : undefined;
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
      visualState: this.lastResolvedVisualState
        ? {
            baseState: this.lastResolvedVisualState.baseState,
            transforms: this.lastResolvedVisualState.transforms,
            overlays: this.lastResolvedVisualState.overlays,
            lockAnimation: this.lastResolvedVisualState.lockAnimation,
            sheetSwapped: this.lastVisualSheetSwapped,
            applied: this.lastVisualApplied
          }
        : undefined,
      lastDoor: this.lastDoor,
      doorFadeActive: this.isDoorFadeActive(),
      doorFadePhase: this.doorFadePhase,
      loadedChunkCount: this.loadedChunkCount(),
      activeNpcCount: this.npcRuntimes.size,
      collisionOverlay: this.collisionOverlayEnabled,
      currentChunk: this.currentChunk,
      currentSectorIndex: this.currentSectorIndex,
      musicCue: this.currentOverworldMusicCue,
      encounterEnabled: this.encounterEnabled,
      encounterCooldownMs: Math.ceil(this.encounterCooldownMs),
      encounterSeed: this.encounterRng.state(),
      lastEncounterGroup: this.lastEncounterGroup,
      cutsceneMove: this.cutsceneMoveDebug,
      returnContextActive: this.returnContextActive,
      canInteract: Boolean(target),
      interactionTargetId: targetDebug?.id,
      interactionTargetKind: targetDebug?.kind,
      interactionTargetKey: targetDebug?.key,
      nearestInteractable: this.nearestInteractionTargetDebug(),
      interactables: this.debugInteractables(),
      interactionSfx: this.interactionSfxDebug(),
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
      overworldHud: this.overworldStatusHud(),
      shopOpen: this.menuState.open && this.activeShopStoreId !== undefined,
      ...(this.activeShopStoreId !== undefined ? { activeShopStoreId: this.activeShopStoreId } : {}),
      menu: this.menuDebugState(),
      menuRenderStack: this.menuRenderStack(),
      menuSfx: this.menuSfxDebug(),
      service: this.serviceDebug(),
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

function demoActorMoveEffect(npcId: number | string, x: number, y: number, run: boolean): ActorMoveEffect | undefined {
  const targetX = Number(x);
  const targetY = Number(y);
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    return undefined;
  }
  const actor = normalizeDemoActorSelector(npcId);
  if (!actor) {
    return undefined;
  }
  return {
    kind: "actorMove",
    actor,
    to: { x: targetX, y: targetY },
    ...(run ? { run: true } : {})
  };
}

function normalizeDemoActorSelector(npcId: number | string): ActorMoveEffect["actor"] | undefined {
  if (typeof npcId === "string" && npcId.trim().toLowerCase() === "player") {
    return "player";
  }
  const parsed = typeof npcId === "number" ? npcId : Number.parseInt(npcId, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return { npcId: parsed };
}

function cutsceneMoveDemoScript(effect: ActorMoveEffect): ScriptCollection {
  const commands: ScriptCommand[] = [
    scriptCommand({ cmd: "label", raw: "label main", name: "main" }, 1),
    scriptCommand({ cmd: "control", raw: "actorMove", code: "actorMove", segments: [effect] }, 2),
    scriptCommand({ cmd: "end", raw: "end" }, 3)
  ];
  return {
    schemaVersion: "cutscene-move-demo",
    sourceProjectPath: "synthetic",
    files: [
      {
        path: "cutsceneMoveDemo.ccs",
        commands,
        labels: ["main"],
        counts: {
          commands: commands.length,
          labels: 1,
          textCommands: 0,
          unknownCommands: 0
        },
        warnings: []
      }
    ],
    counts: {
      files: 1,
      commands: commands.length,
      labels: 1,
      textCommands: 0,
      unknownCommands: 0
    },
    warnings: []
  };
}

function scriptCommand(input: Omit<ScriptCommand, "sourceLocation">, line: number): ScriptCommand {
  return {
    ...input,
    sourceLocation: { file: "cutsceneMoveDemo.ccs", line, column: 1 }
  };
}

function cutsceneActorLabel(actor: NormalizedActorMoveSelector): string {
  return actor.kind === "player" ? "player" : `npc:${actor.npcId}`;
}

function roundedPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y)
  };
}

function statusHudStat(value: number, fallback = 0): number {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(numeric));
}

function isDangerHp(hp: number, maxHp: number): boolean {
  const current = statusHudStat(hp);
  const max = statusHudStat(maxHp, 1);
  if (current <= 0 || max <= 0) {
    return false;
  }
  return current <= Math.max(1, Math.floor(max * LOW_HP_DANGER_FRACTION));
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

function swirlTintForAdvantage(value: unknown): "party" | "enemy" | undefined {
  if (value === "partyFirstStrike") {
    return "party";
  }
  if (value === "enemyFirstStrike") {
    return "enemy";
  }
  return undefined;
}

function instantWinRewardOptions(options: {
  wallet: number;
  bank?: number;
  roundNumber: number;
  rng: () => number;
  items?: Array<Pick<ItemData, "id" | "name">>;
  psi?: InstantWinRewardOptions["psi"];
}): InstantWinRewardOptions {
  const result: InstantWinRewardOptions = {
    wallet: options.wallet,
    ...(options.bank !== undefined ? { bank: options.bank } : {}),
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
