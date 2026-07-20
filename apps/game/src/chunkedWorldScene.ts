import Phaser from "phaser";
import { type ArchivistSpot, type BattleEnemy, type CardNft, type Cutscene, type CutsceneStep, type DialoguePage, type DrifellaSourceCheck, type EventActorMoveSelector, type EventEffect, type FgClearRect, type ItemData, type OverworldInteractable, type ScriptCollection, type ScriptCommand, type SpriteOverride, type SpriteSheet, type StoryBarrier, type StoryTrigger, type TimedDeliveryEntry, type WorldChunked, type WorldChunkedNpc, type WorldDoor } from "@eb/schemas";
import { ACTOR_BODY_BOTTOM, ACTOR_BODY_HALF_WIDTH, ACTOR_BODY_TOP, actorBodyBlocked, actorsBlockingAt, isActorBodyPoint } from "./actorCollision";
import { barrierBlocksPoint, isBarrierActive, isOnce, pointInArea, resolveStoryGateReturn, resolveSuppression, selectActiveBossGates, selectStoryTrigger, storyTriggerSuppressionForRestore, triggerFiredFlag } from "./storyTriggers";
import {
  CutsceneRunner,
  cutsceneMoveTimeoutMsForDistance,
  type CutsceneFacing,
  type CutsceneHost
} from "./cutsceneRunner";
import { BossPlacementEditor, isBossEditEnabled, type BossEditorEntry, type BossFacing } from "./bossPlacementEditor";
import { CollisionOverrideEditor, isCollisionEditEnabled } from "./collisionOverrideEditor";
import { TeleportMenu, type TeleportTown } from "./teleportMenu";
import { QuestJournal, type Quest } from "./questJournal";
import { PartyOrderMenu } from "./partyOrderMenu";
import { CLEAN_UI_FONT_FAMILY, createCleanText, drawCleanPanel } from "./cleanUi";
import { MeadowDream } from "./meadowDream";
import { sectorIndexForTile } from "./encounterLogic";
import { selectSectorEnemyGroup, sectorSpawnBudget, touchAdvantage } from "./overworldEnemies";
import { createStatefulRng, seedFromSearch, type StatefulRng } from "./seededRng";
import { pendingAttestationRewardForReturn, type BattleReturnContext, type BattleReturnSource, type ChunkedWorldRestore, type PendingAttestationReward, type PendingStoryGate } from "./battleReturn";
import {
  battleRngSeedForGroup,
  computeEncounterAdvantage,
  createBattleRng,
  createBattleState,
  resolveInstantWinRewards,
  buildVictorySummaryViewModel,
  type EncounterAdvantage,
  type InstantWinRewardOptions,
  type PlayerCombatantOptions
} from "./battleLogic";
import { expandBattleGroupEnemies } from "./battleGroups";
import {
  messageDoorDialogueReference,
  isDistinctWarpTransition,
  resolveAdjacentDoorIntentTrigger,
  resolveDoorWarpLanding,
  resolveDoorIntentTrigger,
  type DoorIntentDirection,
  type DoorWarpLanding,
  type DoorTriggerResult,
  type DoorTriggerState,
  doorActiveForFlags
} from "./doorTriggers";
import {
  applyNpcOverride,
  addedNpcVisibleForFlags,
  addedNpcsForSpawn,
  buildInlineDialoguePages,
  buildAddedWorldNpcs,
  buildMetadataLines,
  buildStatusLines,
  chooseReference,
  isAddedNpcExtrasEnabled,
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
  isDeepWaterSurface,
  isFgLowerOnlySurface,
  isFgUpperSurface,
  isLadderSurface,
  isSunstrokeSurface,
  isWaterSurface,
  pointInRect,
  solidAtCell,
  solidAtWorldPixel,
  surfaceAtCell,
  surfaceAtWorldPixel,
  visibleCollisionCellRange,
  worldPixelToCollisionCell,
  type CollisionGrid,
  type WorldRect
} from "./collisionOverlay";
import { fgClearsForChunk, fgClearTextureHash } from "./fgOverrides";
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
import {
  openingOwnedNpcEnabled,
  openingWakeCompletionFlags,
  openingWakeDialoguePages,
  resolveEarlyGameDialogueInteraction
} from "./earlyGameSequence";
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
import { EventSequenceWatchdog, cutsceneRunnerProgressToken } from "./eventSequenceWatchdog";
import { GameFlags, flagAliasesFromMap } from "./gameFlags";
import { openingMorningAliasFlags, resolveOpeningPhase } from "./openingPhase";
import {
  openingAutosaveNoticeAllowed,
  openingEncountersAllowed,
  openingGatesActive,
  openingNightDoorLocked,
  openingNightTintRequired,
  openingNpcAllowed,
  openingRoamersAllowed,
  openingSourceChecksAllowed
} from "./openingGates";
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
  WALK_FRAME_MS,
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
import { PLAYER_SPEED, PLAYER_DIAGONAL_SPEED, INTERACTION_DISTANCE } from "./worldScene";
import type { UiScene } from "./uiScene";
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
  type OverworldInteractionTargetDebug,
  type OverworldPartyMemberDebug
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
  legacyIntroMeteorBeatEnabled,
  resolveIntroMeteorBeatStart,
  type IntroMeteorBeatStart,
  type NewGameOpeningStart
} from "./newGameOpening";
import { equipmentSlotForItemType, PartyState, type PartyStateSnapshot } from "./partyState";
import { advanceTimedDeliveries, completeTimedDelivery, createTimedDeliveryRuntimeState, type TimedDeliveryRuntimeState } from "./timedDelivery";
import { currentObjectiveNpcHint, currentObjectiveText as resolveCurrentObjectiveText, type OpeningObjectiveContext } from "./objectives";
import { createBattleSfx, type BattleSfx, type BattleSfxCue } from "./audio/battleSfx";
import { hasStatus, STATUS_AILMENTS, type StatusAilment } from "./statusEffects";
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
import { FILING_INTAKE_REGISTRY_KEY, getFilingIntakeFromRegistry } from "./filingIntakeModel";
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
  moveMenu2D,
  openMenu,
  parseMenuAction,
  refreshMenuStackScreens,
  resolveTalkMenuAction,
  MAIN_MENU_ID,
  MAP_MENU_ACTION_ID,
  PARTY_MENU_ACTION_ID,
  JOURNAL_MENU_ACTION_ID,
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
  MENU_LEFT_KEY_NAMES,
  MENU_RIGHT_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import {
  GamepadTracker,
  NO_HELD_DIRECTION,
  directionToDelta,
  directionToKeyCode,
  gamepadButtonStates,
  gamepadDirections,
  pickActiveGamepad,
  type DirectionVector,
  type GamepadAction
} from "./gamepadInput";
import { buildPartyMember, partyMemberAtLevel, type PartyMember } from "./characterModel";
import {
  defaultVisualStateInputs,
  lowerHideFramePx,
  resolvePlayerVisualState,
  type ResolvedVisualState,
  type VisualStateInputs
} from "./playerVisualState";
import { drawMapTransitionOverlay, drawSwirl } from "./transitions";
import { activeWindowFlavorId, textBlipEnabled } from "./windowSettings";
import { isKeyItemId } from "./keyItems";
import { fieldCondimentUseMessage, fieldItemToolMessage, fieldItemUseMessage, fieldPsiEffect, fieldPsiUseMessage } from "./fieldUseFeedback";
import { collectedEightSourcesCount, ORIGINAL_MIXTAPE_ITEM_ID, ORIGINAL_MIXTAPE_MUSIC_CUE, originalMixtapeFieldMessage } from "./eightSources";
import { itemUsability, psiUsability, USABILITY_REFUSAL_MESSAGE } from "./usabilityMatrix";
import { PLAYER_FOOT_BOX, walkableFootprintClear } from "./collisionFootprint";
import { applyClearOverrideRects, applySolidOverrideRects } from "./collisionOverrides";
import { indoorSectorCoverRectsForChunk, worldPositionInCoveredSector } from "./indoorSectorCovers";
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
  spriteWalkMirror,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteOverrideScale,
  stableAssetPathHash,
  spriteOverrideSheet,
  spriteOverrideSpriteGroupFromSheetKey,
  type SpriteOverrideSheet
} from "./spriteOverrides";
import { npcRenderLayer, spriteBottomY, spriteSortDepth, type SpriteRenderLayer } from "./renderDepth";
import {
  resolveConnectedRoomBounds,
  resolveSectorAreaBounds,
  sectorCoordForWorldPixel,
  type ConnectedRoomBounds
} from "./roomBounds";
import {
  decodeNavmesh,
  nearestComponentAt,
  type NavmeshQuery
} from "./navmesh";
import { findMeshPath, type Point as NavmeshPoint } from "./navmeshPath";
import {
  advanceMapTransition,
  beginMapTransition,
  idleMapTransition,
  isMapTransitionActive,
  transitionKindForDoorType,
  transitionOverlayState,
  transitionSfxCueForEvent,
  type MapTransitionEvent,
  type MapTransitionState,
  type TransitionKind,
  type TransitionSfxCue
} from "./mapTransition";
import { createTransitionSfx, TEXT_BLIP_TUNING, type InteractionSfxCue, type TransitionSfx } from "./audio/transitionSfx";
import { createOpeningSfx, type OpeningSfx } from "./audio/openingSfx";
import { createMusic, musicAreaCueId, musicDisabledBySearch, type Music } from "./audio/music";
import { getSharedMusic } from "./sharedMusic";
import { advanceCutsceneActorTowardTarget } from "./cutsceneActorMovement";
import { cutsceneSoundLabel, resolveCutsceneSfxCue, type CutsceneSoundId, type CutsceneSfxCue } from "./cutsceneSfx";
import {
  isInteriorMusicSector,
  overworldMusicCueForSector,
  type OverworldMusicCue
} from "./worldMusic";
import {
  OPENING_ERA_TITLE,
  OPENING_ERA_TITLE_HOLD_MS,
  OPENING_FLYOVER_END_ZOOM,
  OPENING_FLYOVER_SHOTS,
  OPENING_FLYOVER_ZOOM_IN_MS,
  OPENING_FLYOVER_ZOOM,
  OPENING_GET_UP_WALK_MS,
  OPENING_KNOCK_DELAY_AFTER_WAKE_MS,
  OPENING_KNOCK_SFX_TO_DIALOGUE_MS,
  OPENING_RUMBLE_AMPLITUDE,
  OPENING_RUMBLE_DURATION_MS,
  OPENING_RUMBLE_INTERVAL_MS,
  OPENING_WAKE_FADE_IN_MS,
  OPENING_WAKE_SIGNAL_FIRST_FLASH_MS,
  OPENING_WAKE_SIGNAL_SECOND_FLASH_MS,
  clampOpeningFlyoverPoint,
  openingFlyoverNightRect,
  shouldRunOverworldRoamers
} from "./openingPacing";
import { publishAuditionTarget, toggleMusicAuditioner, isMusicAuditionerVisible, type AuditionLocation } from "./musicAuditioner";
import { DevConsole, type DevConsoleHost, type DevLiveState } from "./devConsole";
import { postDevNote, type DevNoteContext } from "./devNotes";
import {
  overworldInteractableEvents,
  overworldInteractableIsOpened
} from "./overworldInteractables";
import {
  presentSpriteTextureIssueMessage,
  resolvePresentSpriteTexture,
  storyItemById,
  storyItemWorldAssetUrl,
  type PresentSpriteTextureIssue
} from "./storyItems";
import { ACT1_COMPLETE_FLAG, ROUTE_OPEN_FLAG, shouldHoldAct1IntroMusic, shouldUseAct1Night } from "./worldNight";
import type { SourceCheckReturnTo } from "./sourceCheckScene";
import {
  SOURCE_CHECK_RETRY_DISTANCE_PX,
  buildBinderViewModel,
  cardById,
  cardOwnedFlag,
  drifellaDisplayName,
  sourceCheckCanRetry,
  sourceCheckClearedFlag,
  sourceCheckItemHeldFlag,
  sourceCheckVisible
} from "./sourceCheckModel";
import { attestationRewardDialoguePages } from "./sourceCheckRewards";
import { archivistSpotById, buildArchivistRecordsViewModel } from "./archivistRecords";

type ChunkLayer = "background" | "foreground";
type WorldChunk = WorldChunked["chunks"][number];

type StreamedChunk = {
  chunk: WorldChunk;
  background?: Phaser.GameObjects.Image;
  foreground?: Phaser.GameObjects.Image;
  indoorSectorCovers?: Phaser.GameObjects.Image[];
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
  movementHome?: NpcMovementHome;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

type NpcMovementHome = {
  componentId: number;
  sectorAreaKey?: string;
};

type ArchivistSequencePhase = "slideIn" | "line" | "flash" | "depart";

type ArchivistActorRuntime = {
  state: PlayerState;
  frames: DirectionFrameSequence;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
};

type ArchivistSequenceState = {
  trigger: StoryTrigger;
  spot: ArchivistSpot;
  actor: ArchivistActorRuntime;
  phase: ArchivistSequencePhase;
  phaseElapsedMs: number;
  slideTarget: { x: number; y: number };
  departTarget: { x: number; y: number };
  line: string;
  linePanel?: Phaser.GameObjects.Graphics;
  lineText?: Phaser.GameObjects.Text;
  filed: boolean;
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
  /** True when the party can instant-win this group: the roamer FLEES instead of chasing.
   *  Recomputed against the live party each frame in the engagement band (not just at spawn). */
  flees: boolean;
  /** Debug-only override (via __debugSetRoamerFlees) to force flee without an over-leveled party. */
  debugForceFlee?: boolean;
  /** Prowlers wander/chase/flee; ambushers idle hidden on a canopy cell until triggered. */
  archetype: "prowler" | "ambusher";
  /** While now < this timestamp, a sprung ambusher chases at burst speed. */
  ambushBurstUntilMs?: number;
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

type SourceCheckActorRuntime = {
  check: DrifellaSourceCheck;
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  visible: boolean;
};

type RuntimeSpriteStateSheet = {
  image: string;
  frameWidth: number;
  frameHeight: number;
};

type NpcSpriteOverrideResolution = {
  source: "npc" | "spriteGroup";
  id: number;
  key: string;
  override: SpriteOverrideSheet;
};

type SortableActor = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

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

type WorldInteractionKind = "npc" | OverworldInteractable["kind"] | "sourceCheck";

type WorldInteractionCandidate = InteractionCandidate & {
  id: number;
  key: string;
  targetKind: WorldInteractionKind;
  label?: string;
  npcId?: number;
  interactableId?: string;
  sourceCheckId?: string;
};

type ActorMoveEffect = Extract<EventEffect, { kind: "actorMove" }>;

type CutsceneMoveState = {
  actor: NormalizedActorMoveSelector;
  actorLabel: string;
  npcKey?: string;
  restoreNpcPaused?: boolean;
  holdNpcUntilStartupFinalize?: boolean;
  target: { x: number; y: number };
  waypoints?: NavmeshPoint[];
  waypointIndex: number;
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
  // When set, actors whose body already overlaps this point are ignored, so a
  // mover that ends up co-located with an actor (door-warp spawn, scripted move)
  // can always walk free instead of being trapped in every direction.
  escapeOverlapAt?: { x: number; y: number };
  // Player-only, vertical moves only: EB ladder cells (0x10, usually 0x90 =
  // ladder over solid cliff) are climbable - solid terrain passes when every
  // blocking cell carries the ladder flag. NPCs/roamers never set this.
  allowLadderTerrain?: boolean;
};

type DoorWarpOptions = {
  instant?: boolean;
  kind?: TransitionKind;
  style?: number;
  triggerWorldPixel?: { x: number; y: number };
};

type DoorFadePhase = "none" | "fade-out" | "fade-in";

const DOOR_FADE_OVERLAY_DEPTH = 1_000_000;
const ACT1_NIGHT_TINT_COLOR = 0x080e34;
const ACT1_NIGHT_TINT_ALPHA = 0.78;
const ACT1_NIGHT_TINT_DEPTH = 130_000;
const ACT1_DAWN_FADE_MS = 3_000;
const INTRO_MUSIC_RELEASE_FADE_MS = 1_000;
// The EB battle-encounter swirl: a colored spiral covers the overworld to black, THEN we switch to the
// battle scene (which reveals from black). Sits above everything, including the door-fade overlay.
const ENCOUNTER_SWIRL_MS = 620;
const ENCOUNTER_SWIRL_DEPTH = 1_500_000;
const COLLISION_OVERLAY_DEPTH = 150_000;
// Head/companion overlays render just above the foreground occluder layer (depth 100_000) so a mushroom
// cap / sweat / possession ghost shows on the character, but stay below the door-fade + UI overlays.
const PLAYER_OVERLAY_DEPTH = 110_000;
const BED_SLEEP_PLAYER_DEPTH = 100_010;
const INTERIOR_ROOM_MASK_BAND_DEPTH = 120_000;
const INDOOR_SECTOR_COVER_DEPTH = 125_000;
const INDOOR_SECTOR_COVER_TEXTURE_KEY = "indoor-sector-cover-px";
const ENCOUNTER_RETURN_COOLDOWN_MS = 1_500;
// Visible overworld enemies (EarthBound-style touch-to-battle): tuning.
const OVERWORLD_ENEMY_GLOBAL_CAP = 4;
const OVERWORLD_ENEMY_SPAWN_INTERVAL_MS = 900;
const OVERWORLD_ENEMY_CONTACT_PX = 12;
const BOSS_GATE_CONTACT_PX = 14;
const BOSS_GATE_ARM_DIST_PX = 32;
const OVERWORLD_CAMERA_ZOOM = 2;
// Cap on the interior zoom-to-fill so tiny sector-areas don't blow up.
const INTERIOR_CAMERA_MAX_ZOOM = 3.5;
// Spawn band kept fully ON-SCREEN (camera shows ~128x112 world px from the player
// at zoom 2) so a roamer is always visible before it can reach you - never an
// off-screen "random" touch. Min keeps it off the player's feet.
const OVERWORLD_ENEMY_MIN_SPAWN_DIST_PX = 80;
const OVERWORLD_ENEMY_MAX_SPAWN_DIST_PX = 104;
// A freshly spawned roamer cannot start a battle until the player has had a beat to
// see it appear (prevents a spawn-then-instant-contact that would feel random).
const OVERWORLD_ENEMY_CONTACT_GRACE_MS = 600;
const OVERWORLD_ENEMY_DESPAWN_DIST_PX = 320;
const OVERWORLD_ENEMY_WANDER_RADIUS_PX = 40;
const OVERWORLD_ENEMY_WANDER_SPEED_PX_PER_SEC = 30;
// EB-style aggro: a roamer that isn't fleeable CHASES once the player comes within
// detection range (below the 80-104px spawn band, so a fresh spawn wanders first).
// Chase speed stays under PLAYER_SPEED (110) so the player can always outrun it.
const OVERWORLD_ENEMY_CHASE_DETECT_PX = 64;
const OVERWORLD_ENEMY_CHASE_SPEED_PX_PER_SEC = 70;
// EB-style flee: a group the party can instant-win RUNS from the player (weak enemies
// fleeing an over-leveled party). Flee speed stays catchable so the player can corner
// it for the instant win. Detection is a touch wider so it bolts before you're on top.
const OVERWORLD_ENEMY_FLEE_DETECT_PX = 84;
const OVERWORLD_ENEMY_FLEE_SPEED_PX_PER_SEC = 66;
const OVERWORLD_ENEMY_SPAWN_ATTEMPTS = 8;
// Ambusher archetype: a roamer that spawns ONTO a canopy walk-behind cell (0x02),
// idles hidden under the foliage art, and bursts out when the player comes within
// trigger range. Burst speed stays under PLAYER_SPEED so escape is possible.
// Bicycle (item 176 "Swag Cruiser"): outdoor ride speed. Auto-dismount on water,
// ladders, and indoors.
const BIKE_ITEM_ID = 176;
const BIKE_SPEED_MULTIPLIER = 1.7;
// PSI Teleport fast-travel towns (Swagbound names; arrival points are walkable
// outdoor spots per town). visited-radius marks a town seen when you walk near it.
const TELEPORT_TOWNS: readonly TeleportTown[] = [
  { id: "morningside", name: "Morningside", x: 1844, y: 1100 },
  { id: "postwick", name: "Postwick", x: 2324, y: 7428 },
  { id: "solana-beach", name: "Solana Beach", x: 5892, y: 2948 },
  { id: "the-galleria", name: "The Galleria", x: 4676, y: 4996 },
  { id: "dead-letter", name: "Dead Letter", x: 6276, y: 9028 },
  { id: "scaraba", name: "Scaraba", x: 1540, y: 4868 }
];
const TELEPORT_VISIT_RADIUS_PX = 1200;
const TELEPORT_SPIN_MS = 780;
// Sidequest journal (press J): quests are flag checklists over the existing
// story flags, so progress is always live.
const QUESTS: readonly Quest[] = [
  {
    id: "act1", name: "The Milady Read",
    blurb: "Follow the leaked card up-line and out of Morningside.",
    steps: [
      { text: "Beat the card clique at the arcade", flag: "signal:clique_cleared" },
      { text: "Open the road north (Returnless King)", flag: "signal:route_open" },
      { text: "Clear the first threshold (Malady)", flag: "signal:threshold_cleared" },
      { text: "Refuse processing; leave Morningside", flag: "act1:complete" }
    ],
    reward: "Act 1 complete"
  },
  {
    id: "arena", name: "Metal Gauntlet",
    blurb: "Win The Venue's three-bracket exhibition.",
    steps: [
      { text: "Bracket 1: Frankystein Mark II", flag: "arena:won:1" },
      { text: "Bracket 2: Tough Guy", flag: "arena:won:2" },
      { text: "Final: Soul Consuming Flame", flag: "arena:champion" }
    ],
    reward: "Champion's purse (Backstage pass)"
  },
  {
    id: "raid", name: "Faces of Morningside",
    blurb: "Drive the Milady swarm out of the occupied town.",
    steps: [
      { text: "Clear swarm cell 1", flag: "raid:cell:1" },
      { text: "Clear swarm cell 2", flag: "raid:cell:2" },
      { text: "Break the occupation", flag: "raid:morningside:cleared" }
    ],
    reward: "Reclaimed cache (Rock Candy)"
  }
];

/**
 * Recruitable party members past the Act-1 Bosch + Cloak duo. Each joins the
 * moment its `flag` is set (a normal story flag, authored into a trigger's
 * setFlags - see content/triggers.json). Recruitment is flag-driven so it both
 * survives save/load (partyIds persist) and replays deterministically via
 * ?flags=recruit:munch. charIds match the character roster (2=Munch/Jeff,
 * 3=Knight/Poo); the base duo (0,1) is always present and never listed here.
 */
const PARTY_RECRUITS: readonly { charId: number; flag: string; name: string }[] = [
  { charId: 1, flag: "recruit:cloak", name: "Cloak" },
  { charId: 2, flag: "recruit:munch", name: "Munch" },
  { charId: 3, flag: "recruit:knight", name: "Knight" }
];
const OVERWORLD_AMBUSHER_CHANCE = 0.35;
const OVERWORLD_AMBUSH_SEARCH_CELLS = 9;
const OVERWORLD_AMBUSH_TRIGGER_PX = 64;
const OVERWORLD_AMBUSH_BURST_MS = 900;
const OVERWORLD_AMBUSH_BURST_SPEED_PX_PER_SEC = 96;
const LOW_HP_DANGER_FRACTION = 1 / 8;
const LOW_HP_DANGER_BEEP_INTERVAL_MS = 820;
// Field hazards (docs/collision-semantics.md): sunstroke roll per stepped desert
// tile; deep water wading speed factor.
const SUNSTROKE_CHANCE_PER_STEP = 0.05;
const DEEP_WATER_SPEED_MULTIPLIER = 0.55;
const LADDER_SPEED_MULTIPLIER = 0.6;
const ROOM_MASK_EDGE_INSET_SCREEN_PX = 0.5;
const INTERIOR_ROOM_MASK_BAND_OVERSCAN_PX = 64;
const INTERIOR_SECTOR_AREA_RECT_PADS: Record<number, { bottom?: number; right?: number }> = {
  // Table and chair feet in this one-sector interior extend just below the area edge.
  1059874556: { bottom: 16 }
};
const CUTSCENE_ACTOR_MOVE_ARRIVAL_PX = 2;
const CUTSCENE_ACTOR_RUN_MULTIPLIER = 1.5;
const CUTSCENE_MOVE_DEMO_REFERENCE = "cutsceneMoveDemo.main";
const ARCHIVIST_SLIDE_SPEED_PX_PER_SEC = 150;
const ARCHIVIST_LINE_MS = 900;
const ARCHIVIST_FLASH_MS = 260;
const ARCHIVIST_DEPART_DISTANCE_PX = 72;
const ARCHIVIST_PARTY_CLEARANCE_PX = 24;
const ARCHIVIST_LINE_WIDTH_PX = 304;
const CUTSCENE_WATCHDOG_TIMEOUT_MS = 2_500;
const EVENT_SEQUENCE_WATCHDOG_TIMEOUT_MS = 2_500;
const DEFAULT_HOTEL_REST_COST = 100;
const SOURCE_CHECK_SESSION_REGISTRY_KEY = "source-check-session";
const DEV_PINS_REGISTRY_KEY = "dev-annotation-pins";
const MIN_DEBUG_PARTY_LEVEL = 1;
const MAX_DEBUG_PARTY_LEVEL = 99;

type SourceCheckSessionState = {
  attempts: Record<string, number>;
  failedAt: Record<string, { x: number; y: number }>;
};

type DevPinData = { x: number; y: number; n: number };

type TilePoint = { x: number; y: number };
type SetPartyLevelDebugSummary = { id: number; name: string; level: number; maxHp: number };
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

type Act1NightDebugState = {
  shouldShow: boolean;
  overlayExists: boolean;
  alpha: number | null;
  visible: boolean | null;
  depth: number | null;
  indoors: boolean;
  hasRouteOpen: boolean;
  hasAct1Complete: boolean;
  introHold: boolean;
  cue: string | null;
};

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
  private presentInteractableSprites = new Map<string, Phaser.GameObjects.Image>();
  private examineInteractableSprites = new Map<string, Phaser.GameObjects.Image>();
  private sourceCheckActors = new Map<string, SourceCheckActorRuntime>();
  private chunkByKey = new Map<string, WorldChunk>();
  private chunkObjects = new Map<string, StreamedChunk>();
  private loadingTextureKeys = new Set<string>();
  private sessionFgClears: FgClearRect[] = [];
  private loadingSheetGroups = new Set<number>();
  private loadingNpcOverrideIds = new Set<number>();
  private loadingSpriteGroupOverrideIds = new Set<number>();
  private currentChunk?: ChunkCoord;
  private activeRoomBounds?: ConnectedRoomBounds;
  private activeRoomSectorKey?: string;
  private roomMaskGraphics?: Phaser.GameObjects.Graphics;
  private roomMask?: Phaser.Display.Masks.GeometryMask;
  private roomMaskBandGraphics?: Phaser.GameObjects.Graphics;
  private nightTintOverlay?: Phaser.GameObjects.Image;
  private nightTintActive = false;
  /** Frames left to retry the door-arrival actor-overlap escape (see update()). */
  private arrivalEscapeTicks = 0;
  private pendingDawnFadeOnCreate = false;
  private pendingIntroMusicReleaseFadeOnCreate = false;
  private solidRows: string[] = [];
  private surfaceRows: string[] = [];
  private navmesh?: NavmeshQuery;
  private collisionCellSize = 8;
  private collisionWidth = 0;
  private collisionHeight = 0;
  private collisionOverlay?: Phaser.GameObjects.Graphics;
  private collisionOverlayEnabled = false;
  private solidAtHook?: (x: number, y: number) => boolean;
  private surfaceAtHook?: (x: number, y: number) => number;
  /** Debug/cutscene-forced overrides merged over the live visual-state inputs (see playerVisualState). */
  private forcedVisualState: Partial<VisualStateInputs> = {};
  /** Scene-owned visual-state input override for cutscenes. Debug forced inputs still win. */
  private sceneVisualState: Partial<VisualStateInputs> = {};
  private roomBoundsResolveAnchor?: { x: number; y: number };
  private lastResolvedVisualState?: ResolvedVisualState;
  private lastVisualApplied: { scale: number; alpha: number; tint: number | null } = { scale: 1, alpha: 1, tint: null };
  private lastVisualSheetSwapped = false;
  private playerInvertActive = false;
  /** Head-mounted/companion overlay sprites (sweat/mushroom/possession), keyed by overlay name. */
  private overlaySprites = new Map<string, Phaser.GameObjects.Sprite>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private readonly gamepadTracker = new GamepadTracker();
  private gamepadHeld: DirectionVector = NO_HELD_DIRECTION;
  private devConsole?: DevConsole;
  private devAnnotateMode = false;
  private devInstantWin = false;
  private devNoteCount = 0;
  private devPins: Phaser.GameObjects.Container[] = [];
  private devPointerDowns = 0;
  private lastDevWorld = { x: 0, y: 0 };
  private doorTriggerState: DoorTriggerState = { suppressUntilClear: false };
  private lastDoor?: { from: { x: number; y: number }; to: { x: number; y: number } };
  private warnedInvalidDoorWarps = new Set<string>();
  private doorFadePhase: DoorFadePhase = "none";
  private doorFadeOverlay?: Phaser.GameObjects.Graphics;
  /** Deferred battle start: while set, the overworld plays the colored encounter swirl, then switches. */
  private pendingBattleStart?: { sceneKey: string; params: Record<string, unknown> };
  private encounterSwirlMs = 0;
  private encounterSwirlGfx?: Phaser.GameObjects.Graphics;
  private lastDialogueRevealedChars = 0;
  private dialogueBlipGlyphCount = 0;
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
  private readonly openingSfx: OpeningSfx = createOpeningSfx();
  private readonly menuSfx: BattleSfx = createBattleSfx();
  private menuSfxCalls: MenuSfxCue[] = [];
  private menuSfxCount = 0;
  private interactionSfxCalls: InteractionSfxCue[] = [];
  private interactionSfxCount = 0;
  private music: Music = createMusic();
  private currentOverworldMusicCue?: OverworldMusicCue;
  /** When set (by a story trigger's `music` field), overrides sector-based overworld music. */
  private forcedOverworldMusicCue?: OverworldMusicCue;
  private mixtapeRestoreTimer?: Phaser.Time.TimerEvent;
  private menuState: MenuState = closedMenu();
  private menuScreens = new Map<string, MenuScreen>();
  private activeShopStoreId?: number;
  private activeService?: ActiveServiceState;
  private lastServiceResult?: ServiceDebugState["lastResult"];
  private binderOverlayOpen = false;
  private pendingAttestationReward?: PendingAttestationReward;
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
  private bossEditor?: BossPlacementEditor;
  private collisionEditor?: CollisionOverrideEditor;
  private bikeActive = false;
  private teleportMenu?: TeleportMenu;
  private questJournal?: QuestJournal;
  private partyOrderMenu?: PartyOrderMenu;
  private readonly teleportVisited = new Set<string>();
  private teleportSpinUntilMs = 0;
  private lastAutosaveTownId: string | undefined;
  private autosaveNoticeUntilMs = 0;
  private recruitNoticeUntilMs = 0;
  private recruitNoticeText = "";
  private devToastUntilMs = 0;
  private devToastText = "";
  private readonly cutsceneWatchdog = new EventSequenceWatchdog(CUTSCENE_WATCHDOG_TIMEOUT_MS);
  private readonly eventSequenceWatchdog = new EventSequenceWatchdog(EVENT_SEQUENCE_WATCHDOG_TIMEOUT_MS);
  /** solidRows snapshot (post-authored-overrides) the paint editor repaints from. */
  private editorBaseSolidRows?: string[];
  private overworldEnemies = new Map<string, OverworldEnemyRuntime>();
  private overworldEnemySeq = 0;
  private overworldEnemySpawnCooldownMs = 0;
  private loadingEnemySkinKeys = new Set<string>();
  private forceEncounterHook?: (groupId?: number, advantage?: unknown) => ForceEncounterResult;
  private newGameStartupRecord?: NewGameStartupRunDebug;
  private startupRunActive = false;
  private startupRunFinalized = false;
  private startupGetUpWalkActive = false;
  private startupGetUpFallbackTimer?: Phaser.Time.TimerEvent;
  // Dims the bedroom to "night" during the new-game wake-up; lifts as Bosch wakes.
  private bedroomNightOverlay?: Phaser.GameObjects.Rectangle;
  // True during the opening Morningside flyover: suppresses triggers/encounters while
  // the hidden player is glided across town to drive the camera.
  private flyoverActive = false;
  // Holds the dark intro cue until signal:route_open.
  private introMusicHold = false;
  // Suppresses roamers only while the opening house phase is still active.
  private openingRoamerHold = false;
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
  private warnedStoryPresentTextureIssues = new Set<string>();
  private warnedOwnedOpeningCutscenes = new Set<string>();
  private suppressedTriggerId?: string;
  private barrierSprites = new Map<string, Phaser.GameObjects.Image>();
  private loadingBarrierKeys = new Set<string>();
  private pendingScriptedDialogueComplete?: () => void;
  private pendingInteractionShopStoreId?: number;
  private pendingInteractionService?: { service: ServiceKind; cost?: number };
  private pendingSourceCheckEntryId?: string;
  private archivistSequence?: ArchivistSequenceState;
  private timedDeliveryState: TimedDeliveryRuntimeState = createTimedDeliveryRuntimeState();
  private timedDeliveryArrivalQueue: string[] = [];
  private activeDeliverySprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
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
    // Story-flag -> EB event-flag bridge: wired before any trigger/restore can set
    // flags so the vanilla NPC/encounter flag machinery tracks our narrative beats.
    this.gameFlags.setAliases(flagAliasesFromMap(data.gameData.flagMap));
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
    this.navmesh = data.gameData.navmesh ? decodeNavmesh(data.gameData.navmesh) : undefined;
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
      this.load.spritesheet(spriteOverrideNpcSheetKey(npcId, sheetOverride.image), spriteOverrideAssetUrl(sheetOverride.image), {
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
    type StateSheets = Record<string, RuntimeSpriteStateSheet> | undefined;
    const playerStates = this.playerSpriteOverride()?.states as StateSheets;
    for (const [name, sheet] of Object.entries(playerStates ?? {})) {
      if (sheet) {
        this.load.spritesheet(this.playerStateSheetKey(name, sheet), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
      }
    }
    for (const follower of this.followerSpriteOverrides()) {
      const followerStates = follower.sheet.states as StateSheets;
      for (const [name, sheet] of Object.entries(followerStates ?? {})) {
        if (sheet) {
          this.load.spritesheet(this.followerStateSheetKey(follower.joinOrder, name, sheet), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
        }
      }
    }
    const overlays = this.data_.spriteOverrides?.overlays as Record<string, { image: string; frameWidth: number; frameHeight: number }> | undefined;
    for (const [name, sheet] of Object.entries(overlays ?? {})) {
      if (sheet) {
        this.load.spritesheet(this.overlaySheetKey(name), spriteOverrideAssetUrl(sheet.image), { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
      }
    }
    for (const check of this.data_.sourceChecks.checks) {
      this.load.image(this.sourceCheckOverworldTextureKey(check), this.sourceCheckOverworldAssetUrl(check));
    }
    const preloadedExamineSprites = new Set<string>();
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "examine" || !entry.sprite) {
        continue;
      }
      const key = this.examineInteractableSpriteTextureKey(entry);
      if (preloadedExamineSprites.has(key)) {
        continue;
      }
      preloadedExamineSprites.add(key);
      this.load.image(key, this.publicAssetUrl(entry.sprite));
    }
    const preloadedStoryTextures = new Set<string>();
    for (const item of this.data_.storyItems.items) {
      if (preloadedStoryTextures.has(item.worldTexture)) {
        continue;
      }
      preloadedStoryTextures.add(item.worldTexture);
      this.load.image(item.worldTexture, storyItemWorldAssetUrl(item));
    }
  }

  create(): void {
    // The ?nointro dev path skips the title scene, so the page-load LOADING overlay
    // must also be cleared here once the world is interactive.
    document.getElementById("game-loading")?.remove();
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
    // Strawberry prologue: seed prologue:active on a NEW GAME before NPC placements are
    // indexed, so the bedroom prop actors (910220-910223, requireFlags prologue:active)
    // spawn. maybeStartNewGameStartup fires the prologue cutscene before the flyover;
    // the cutscene sets prologue:done, which despawns the props. Skipped on Continue
    // (newGameOpening undefined) and once done.
    if (this.newGameOpening && !this.gameFlags.has("prologue:done")) {
      this.gameFlags.set("prologue:active");
    }
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
    this.applyDebugFlags();
    this.introMusicHold = shouldHoldAct1IntroMusic(this.gameFlags);
    this.openingRoamerHold = Boolean(this.newGameOpening);
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
    this.spawnExamineInteractableSprites();
    this.spawnSourceCheckActors();
    this.syncEncounterTileState();

    const bounds = this.movementBounds();
    this.cameras.main.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
    this.cameras.main.setZoom(OVERWORLD_CAMERA_ZOOM);
    this.cameras.main.startFollow(this.player, true);
    this.cameras.main.roundPixels = true;
    this.refreshRoomBounds(true);
    this.updateAct1NightTint({ fade: this.pendingDawnFadeOnCreate });
    this.pendingDawnFadeOnCreate = false;
    this.events.once("shutdown", () => {
      const ui = this.scene.get("ui") as UiScene;
      ui.hideCinematicCaption(true);
      ui.hideCinematicTitle(true);
      this.music.stop();
      publishAuditionTarget(null);
      this.destroyNightTintOverlay();
      this.destroyDoorFadeOverlay();
      this.destroyCollisionOverlay();
      this.destroyRoomMask();
      this.destroySourceCheckActors();
      this.unregisterCutsceneMoveDemoGlobal();
      this.unregisterForceEncounter();
      this.unregisterCollisionDebugGlobals();
      this.bossEditor?.destroy();
      this.bossEditor = undefined;
      this.collisionEditor?.destroy();
      this.collisionEditor = undefined;
      this.editorBaseSolidRows = undefined;
      this.teleportMenu?.destroy();
      this.teleportMenu = undefined;
      this.questJournal?.destroy();
      this.questJournal = undefined;
      this.partyOrderMenu?.destroy();
      this.partyOrderMenu = undefined;
      this.devConsole?.destroy();
      this.devConsole = undefined;
      this.destroyDevPins();
    });

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keys = this.input.keyboard?.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
    this.registerTransitionSfxResume();
    this.refreshMenuScreens();
    this.input.keyboard?.on("keydown-M", () => {
      if (!this.shouldIgnoreWorldHotkey()) this.openCommandMenu();
    });
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.moveMenuDirectional(0, -1);
    });
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.moveMenuDirectional(0, 1);
    });
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.moveMenuDirectional(-1, 0);
    });
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.moveMenuDirectional(1, 0);
    });
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.handleConfirm();
    });
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => {
      if (!this.shouldIgnoreWorldHotkey()) this.handleCancel();
    });
    this.input.keyboard?.on("keydown-P", () => {
      if (!this.shouldIgnoreWorldHotkey()) this.handleSaveKey();
    });
    // Debug toggles (panel + collision overlay) are dev-only - not wired in production builds.
    // F1 toggles the raw Phaser state panel; F2 the collision overlay; backtick (`) opens the
    // Dev Console hub (Track Lab / annotate / warp / encounters).
    if (import.meta.env.DEV) {
      this.input.keyboard?.on("keydown-F1", () => {
        this.debugPanelVisible = !this.debugPanelVisible;
      });
      this.input.keyboard?.on("keydown-F2", () => this.setCollisionOverlayEnabled(!this.collisionOverlayEnabled));
      this.input.keyboard?.on("keydown-H", (event?: KeyboardEvent) => {
        if (!event?.repeat) this.devFileQuickAnnotation("SPRITE CUTOFF: sprite cut off by map element", "sprite cutoff");
      });
      this.input.keyboard?.on("keydown-C", (event?: KeyboardEvent) => {
        if (!event?.repeat && !this.debugPanelVisible) {
          this.devFileQuickAnnotation("COLLISION: collision point inaccurate here", "collision");
        }
      });
      this.devConsole = new DevConsole(this.buildDevConsoleHost());
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => this.handleDevPointer(pointer));
      (globalThis as Record<string, unknown>).__devToolsDebug = () => ({
        annotate: this.devAnnotateMode,
        instantWin: this.devInstantWin,
        encounters: this.encounterEnabled,
        notes: this.devNoteCount,
        pointerDowns: this.devPointerDowns,
        lastWorld: this.lastDevWorld
      });
    }
    // Bicycle (Swag Cruiser, item 176): B mounts/dismounts when owned + outdoors.
    this.input.keyboard?.on("keydown-B", () => {
      if (!this.shouldIgnoreWorldHotkey()) this.toggleBike();
    });

    // PSI Teleport (T): fast travel to a visited town. The menu owns its own key
    // listener (survives scene restarts); we only feed it visited towns + the warp.
    this.teleportMenu = new TeleportMenu({
      visitedTowns: () => TELEPORT_TOWNS.filter((t) => this.teleportVisited.has(t.id)),
      teleportTo: (town) => this.beginTeleport(town),
      canOpen: () => this.isPlayerControllable() && !this.bikeActive,
      allTowns: () => [...TELEPORT_TOWNS],
      playerWorldPos: () => ({ x: this.playerState.x, y: this.playerState.y })
    });

    // Sidequest journal (J): a live view over the story flags.
    this.questJournal = new QuestJournal({
      quests: () => [...QUESTS],
      hasFlag: (flag) => this.gameFlags.has(flag),
      objective: () => this.currentObjectiveText(),
      canOpen: () => this.isPlayerControllable() && !this.bikeActive
    });

    // Party order / swap (K): reorder the active roster (lead + turn priority).
    this.partyOrderMenu = new PartyOrderMenu({
      members: () => this.partyState.party().map((id) => ({ id, name: this.heroDisplayName(id) })),
      reorder: (ids) => {
        this.partyState.reorder(ids);
        this.handlePartyCompositionChanged();
      },
      canOpen: () => this.isPlayerControllable() && !this.bikeActive && this.partyState.party().length > 1
    });
    this.updateTeleportVisited();

    // Boss placement editor (?bossedit=1): a dev-only visual tool for manually
    // positioning the story boss gates. See bossPlacementEditor.ts for the legend.
    if (isBossEditEnabled(globalThis.location?.search)) {
      this.bossEditor = new BossPlacementEditor({
        listBosses: () => this.bossEditorListBosses(),
        moveBoss: (id, x, y) => this.bossEditorMoveBoss(id, x, y),
        setBossFacing: (id, facing) => this.bossEditorSetFacing(id, facing),
        getPlayerPosition: () => ({ x: Math.round(this.playerState.x), y: Math.round(this.playerState.y) }),
        warpPlayerTo: (x, y) => this.warpPlayerToWorldPixel({ x, y })
      });
      this.input.keyboard?.on("keydown-OPEN_BRACKET", () => this.bossEditor?.selectPrev());
      this.input.keyboard?.on("keydown-CLOSED_BRACKET", () => this.bossEditor?.selectNext());
      this.input.keyboard?.on("keydown-J", () => this.bossEditor?.jumpToSelected());
      this.input.keyboard?.on("keydown-G", () => this.bossEditor?.placeSelectedAtPlayer());
      this.input.keyboard?.on("keydown-F", () => this.bossEditor?.cycleFacing());
      this.input.keyboard?.on("keydown-E", () => this.bossEditor?.exportPlacements());
    }

    // Collision paint editor (?collisionedit=1): author solid-override rects on the
    // live grid. See collisionOverrideEditor.ts for the legend. Forces the collision
    // overlay on; painted rects take effect immediately (walk against them to test).
    if (isCollisionEditEnabled(globalThis.location?.search)) {
      this.editorBaseSolidRows = [...this.solidRows];
      this.collisionEditor = new CollisionOverrideEditor({
        getPlayerPosition: () => ({ x: Math.round(this.playerState.x), y: Math.round(this.playerState.y) }),
        cellSize: () => this.collisionCellSize,
        gridSize: () => ({ width: this.collisionWidth, height: this.collisionHeight }),
        authoredRects: () => this.data_.collisionOverrides?.solids ?? [],
        applySessionRects: (rects) => {
          const base = this.editorBaseSolidRows;
          if (!base) return;
          for (let i = 0; i < base.length; i += 1) this.solidRows[i] = base[i];
          applySolidOverrideRects(this.solidRows, rects, this.collisionCellSize);
          this.updateCollisionOverlay();
        }
      });
      // Keys are handled by the editor's own window listener (not Phaser scene
      // bindings): the scene can restart before shutdown runs, and per-scene
      // bindings would then stack once per orphaned instance.
      this.setCollisionOverlayEnabled(true);
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
    if (import.meta.env.DEV) {
      this.renderDevPinsFromRegistry();
    }
    this.scene.launch("ui", { worldSceneKey: "chunked-world", font: this.data_.font, window: this.data_.window });
    this.syncOverworldMusicForCurrentFlags(true, {
      releaseFade: this.pendingIntroMusicReleaseFadeOnCreate
    });
    this.pendingIntroMusicReleaseFadeOnCreate = false;
    this.registerCutsceneMoveDemoGlobal();
    this.registerForceEncounter();
    if (!this.restoreState) {
      this.maybeStartNewGameStartup(spawn);
    }
    this.suppressStoryTriggerAtRestorePoint();
    // Bring in any already-earned recruits (from a restored save or ?flags=recruit:*)
    // silently - the live "joined!" beat only fires when a flag flips during play.
    this.reconcileRecruits();
    this.syncPresentInteractableSprites();
    this.updateAct1NightTint();
    this.startAttestationRewardCeremony();
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

  private setOpeningMorning(): void {
    for (const flag of openingMorningAliasFlags()) {
      this.gameFlags.set(flag);
    }
    this.refreshOpeningGatedConsumers();
  }

  private refreshOpeningGatedConsumers(): void {
    this.updateAct1NightTint({ fade: true });
    this.syncOverworldMusicForCurrentFlags(true);
    this.refreshStreaming(true);
    this.refreshBarrierSprites();
    this.syncSourceCheckActors();
    this.refreshMenuScreens();
    this.updatePrompt();
    this.publish();
  }

  update(_: number, delta: number): void {
    if (!this.player) {
      return;
    }
    this.pollGamepad();
    this.spriteWalkBobClockMs += delta;
    this.partyState.tickMeters(delta);
    this.updateDangerHeartbeat(delta);
    this.tickDialogueBlip();
    this.tickTimedDeliveries(delta);
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
      this.updateAct1NightTint();
      this.updatePrompt();
      this.updateCollisionOverlay();
      this.publish();
      return;
    }
    this.maybeStartMeadowDream();
    this.stepNpcs(delta);
    // Door-arrival overlap escape retries a few frames: destination NPC
    // runtimes can spawn a tick or two after the synchronous warp, so the
    // in-warp escape pass may not have seen them yet. No-op once clear.
    if (this.arrivalEscapeTicks > 0) {
      this.arrivalEscapeTicks -= 1;
      this.escapeArrivalActorOverlap();
    }
    this.eventSequence?.update(delta);
    this.stepCutsceneMove(delta);
    this.updateEventSequenceWatchdog();
    this.updateDoorTransition(delta);

    this.cutsceneRunner?.update(delta);
    this.updateCutsceneWatchdog();
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

    this.updateArchivistSequence(delta);
    if (this.archivistSequence) {
      if (!this.playerState.inputLocked) {
        lockPlayer(this.playerState, this.playerFrames);
      }
      this.syncPlayerObject();
      this.updateCollisionOverlay();
      this.updatePrompt();
      this.publish();
      return;
    }

    if (this.startupGetUpWalkActive) {
      this.playerState.inputLocked = true;
      this.syncPlayerObject();
      this.updateCollisionOverlay();
      this.updatePrompt();
      this.publish();
      return;
    }

    const inputOwned = this.dialogue.open || Boolean(this.eventSequence?.running) || this.cinematicActive() || this.isDoorFadeActive() || this.binderOverlayOpen || Boolean(this.archivistSequence);
    if (import.meta.env.DEV) {
      // Freeze forensics: name every possible input owner so a stuck player is
      // diagnosable in one evaluate call (added chasing the post-dialogue freeze).
      (globalThis as Record<string, unknown>).__inputOwners = () => ({
        dialogue: this.dialogue.open,
        eventSeq: Boolean(this.eventSequence?.running),
        choice: Boolean(this.dialogue.choice),
        cinematic: this.cinematicActive(),
        doorFade: this.isDoorFadeActive(),
        binder: this.binderOverlayOpen,
        cutscene: Boolean(this.cutsceneRunner?.running),
        archivist: Boolean(this.archivistSequence),
        inputLocked: this.playerState.inputLocked,
        menu: this.menuState.open,
        getUpWalk: this.startupGetUpWalkActive,
        bounds: this.movementBounds(),
        roomBounds: this.activeRoomBounds ?? null,
        kbEnabled: this.input.keyboard?.enabled ?? null,
        inputEnabled: this.input.enabled,
        sceneActive: this.scene.isActive(),
        scenePaused: this.scene.isPaused(),
        velocity: { x: this.playerState.velocityX, y: this.playerState.velocityY },
        moving: this.playerState.moving
      });
    }
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

    const speedMultiplier = this.terrainSpeedMultiplier() * (this.bikeActive ? BIKE_SPEED_MULTIPLIER : 1);
    stepPlayer(this.playerState, input, {
      deltaMs: delta,
      speed: PLAYER_SPEED * speedMultiplier,
      diagonalSpeed: PLAYER_DIAGONAL_SPEED * speedMultiplier,
      bounds: this.movementBounds(),
      blocked: (x, y) =>
        this.blocked(x, y, {
          includeNpcs: true,
          escapeOverlapAt: { x: this.playerState.x, y: this.playerState.y },
          // Vertical tries only (x unchanged): lets the player climb ladder columns.
          allowLadderTerrain: x === this.playerState.x
        }),
      frames: this.playerFrames
    });
    const playerSteppedTile = this.syncEncounterTileState();
    this.applyFieldPoisonForStep(playerSteppedTile);
    this.applyFieldHazardsForStep(playerSteppedTile);
    if (this.bikeActive && playerSteppedTile && this.bikeBlockedHere()) {
      this.bikeActive = false; // rolled into water/ladder/indoors: hop off
    }
    this.updateTeleportVisited();
    this.syncPlayerObject();
    this.refreshRoomBounds();
    this.updateAct1NightTint();
    this.syncOverworldMusicCue();
    this.refreshStreaming();
    this.updateCollisionOverlay();
    this.refreshBarrierSprites();
    this.refreshSourceCheckSessionGates();
    this.syncSourceCheckActors();
    // Boss-edit mode suppresses all in-world scripting (intro beat, cutscenes,
    // story triggers) so nothing steals the frame from the placement editor.
    if (!this.bossEditor && !this.cinematicActive()) {
      if (this.maybeStartIntroMeteorBeat()) {
        return;
      }
      if (this.maybeStartCutscene()) {
        return;
      }
      if (this.maybeFireStoryTrigger()) {
        return;
      }
    }
    if (!this.cinematicActive()) {
      if (this.manageBossGates(delta)) {
        return;
      }
      if (this.manageOverworldEnemies(delta)) {
        return;
      }
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
    this.destroyNightTintOverlay();
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
    this.destroyExamineInteractableSprites();
    this.destroySourceCheckActors();
    this.clearOverworldEnemies();
    this.chunkObjects.clear();
    this.loadingTextureKeys.clear();
    this.sessionFgClears = [];
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
    this.navmesh = undefined;
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
    this.binderOverlayOpen = false;
    this.pendingAttestationReward = undefined;
    this.menuSfxCalls = [];
    this.menuSfxCount = 0;
    this.interactionSfxCalls = [];
    this.interactionSfxCount = 0;
    this.currentOverworldMusicCue = undefined;
    this.forcedOverworldMusicCue = undefined;
    this.sceneVisualState = {};
    this.roomBoundsResolveAnchor = undefined;
    this.eventSequence = undefined;
    this.pendingIntroMusicReleaseFadeOnCreate = false;
    this.introMusicHold = false;
    this.openingRoamerHold = false;
    this.newGameStartupRecord = undefined;
    this.startupRunActive = false;
    this.startupRunFinalized = false;
    this.startupGetUpWalkActive = false;
    this.clearStartupGetUpFallbackTimer();
    this.bedroomNightOverlay?.destroy();
    this.bedroomNightOverlay = undefined;
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
    this.warnedStoryPresentTextureIssues.clear();
    this.warnedOwnedOpeningCutscenes.clear();
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
    this.pendingSourceCheckEntryId = undefined;
    this.destroyArchivistSequence();
    this.timedDeliveryState = createTimedDeliveryRuntimeState();
    this.timedDeliveryArrivalQueue = [];
    this.clearActiveDeliverySprite();
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
    const spawnAddedNpcs = addedNpcsForSpawn(this.data_.addedNpcs, {
      extrasEnabled: isAddedNpcExtrasEnabled(globalThis.location?.search),
      sourceChecks: this.data_.sourceChecks,
      storyTriggers: this.data_.storyTriggers,
      cutscenes: this.data_.cutscenes
    });
    const addedNpcs = buildAddedWorldNpcs(spawnAddedNpcs, this.world_.npcs);
    if (addedNpcs.length < (spawnAddedNpcs?.npcs.length ?? 0)) {
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
    const key = this.chunkLoadTextureKey(chunk, layer);
    const targetKey = this.chunkTextureKey(chunk, layer);
    if (this.textures.exists(targetKey)) {
      return false;
    }
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
      this.materializeIndoorSectorCovers(key, streamed);
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
    if (layer === "foreground" && !this.ensureForegroundTexture(streamed.chunk)) {
      return;
    }
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

  private materializeIndoorSectorCovers(key: string, streamed: StreamedChunk): void {
    if (streamed.indoorSectorCovers?.some(isLiveGameObject)) {
      this.updateIndoorSectorCoverVisibilityFor(streamed);
      return;
    }
    if (!isLiveGameObject(streamed.background) && !isLiveGameObject(streamed.foreground)) {
      return;
    }

    this.destroyIndoorSectorCovers(streamed);
    const coverRects = indoorSectorCoverRectsForChunk(this.world_.sectors, this.chunkWorldRect(streamed.chunk));
    if (coverRects.length === 0) {
      streamed.indoorSectorCovers = [];
      this.chunkObjects.set(key, streamed);
      return;
    }

    const textureKey = this.ensureIndoorSectorCoverTexture();
    const visible = this.indoorSectorCoversVisible();
    streamed.indoorSectorCovers = coverRects.map((rect) => this.add.image(rect.x, rect.y, textureKey)
      .setOrigin(0, 0)
      .setDepth(INDOOR_SECTOR_COVER_DEPTH)
      .setDisplaySize(rect.width, rect.height)
      .setVisible(visible));
    this.chunkObjects.set(key, streamed);
  }

  private chunkWorldRect(chunk: WorldChunk): WorldRect {
    const size = chunkPixelSize(this.grid());
    return {
      x: chunk.cx * size,
      y: chunk.cy * size,
      width: size,
      height: size
    };
  }

  private ensureIndoorSectorCoverTexture(): string {
    if (!this.textures.exists(INDOOR_SECTOR_COVER_TEXTURE_KEY)) {
      const canvasTex = this.textures.createCanvas(INDOOR_SECTOR_COVER_TEXTURE_KEY, 1, 1);
      const ctx = canvasTex?.getContext();
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 1, 1);
        canvasTex?.refresh();
      }
    }
    return INDOOR_SECTOR_COVER_TEXTURE_KEY;
  }

  private destroyIndoorSectorCovers(streamed: StreamedChunk): void {
    streamed.indoorSectorCovers?.forEach((cover) => cover.destroy());
    streamed.indoorSectorCovers = undefined;
  }

  private updateIndoorSectorCoverVisibility(): void {
    for (const streamed of this.chunkObjects.values()) {
      this.updateIndoorSectorCoverVisibilityFor(streamed);
    }
  }

  private updateIndoorSectorCoverVisibilityFor(streamed: StreamedChunk): void {
    const visible = this.indoorSectorCoversVisible();
    streamed.indoorSectorCovers?.forEach((cover) => {
      if (isLiveGameObject(cover)) {
        cover.setVisible(visible);
      }
    });
  }

  private indoorSectorCoversVisible(): boolean {
    return !this.playerIndoorsForSectorCovers();
  }

  private playerIndoorsForSectorCovers(): boolean {
    // The third check matters for embedded cave/dungeon regions (coverArt
    // sectors that carry no indoors flag): a player standing inside one must
    // see the cave, not the void covering it from outside.
    return Boolean(this.activeInteriorRoom())
      || this.playerInInteriorMusicSector()
      || worldPositionInCoveredSector(this.world_.sectors, this.playerState);
  }

  private unloadChunksOutsideRetain(center: ChunkCoord): void {
    for (const [key, streamed] of this.chunkObjects) {
      if (this.isChunkRetained(streamed.chunk, center)) {
        continue;
      }
      streamed.background?.destroy();
      streamed.foreground?.destroy();
      this.destroyIndoorSectorCovers(streamed);
      this.chunkObjects.delete(key);
    }
  }

  private isChunkRetained(chunk: WorldChunk, center: ChunkCoord): boolean {
    return Math.max(Math.abs(chunk.cx - center.cx), Math.abs(chunk.cy - center.cy)) <= RETAIN_CHUNK_RADIUS;
  }

  private refreshRoomBounds(force = false): void {
    if (this.world_.sectors) {
      const roomPoint = this.roomBoundsResolveState();
      const sector = sectorCoordForWorldPixel(roomPoint, this.world_.sectors);
      const sectorKey = sector ? this.sectorAreaBoundsKey(roomPoint) : undefined;
      if (!force && sectorKey && this.activeRoomSectorKey === sectorKey) {
        this.updateIndoorSectorCoverVisibility();
        this.updateCameraRoomBounds();
        return;
      }
      const sectorRoom = resolveSectorAreaBounds(
        this.world_.sectors,
        this.solidRows,
        this.collisionGrid(),
        roomPoint
      );
      // Cache the sector key only on SUCCESS: caching a failed resolve froze the
      // mask off for the whole sector (one bad start cell after a warp/teleport/
      // battle return meant neighbor strips bled through until leaving the area).
      this.activeRoomSectorKey = sectorRoom ? sectorKey : undefined;
      this.activeRoomBounds = sectorRoom ? this.deriveInteriorSectorAreaRoomBounds(sectorRoom, roomPoint) : undefined;
      this.applyInteriorRoomMask();
      this.applyNpcRoomVisibility();
      this.applyWorldObjectRoomVisibility();
      this.updateIndoorSectorCoverVisibility();
      this.updateCameraRoomBounds();
      return;
    }
    const roomPoint = this.roomBoundsResolveState();
    if (!force && this.playerInsideCachedRoomBounds(roomPoint)) {
      this.updateIndoorSectorCoverVisibility();
      this.updateCameraRoomBounds();
      return;
    }
    this.activeRoomSectorKey = undefined;
    this.activeRoomBounds = resolveConnectedRoomBounds(this.solidRows, this.collisionGrid(), roomPoint, {
      surfaceRows: this.surfaceRows
    });
    this.applyInteriorRoomMask();
    this.applyNpcRoomVisibility();
    this.applyWorldObjectRoomVisibility();
    this.updateIndoorSectorCoverVisibility();
    this.updateCameraRoomBounds();
  }

  private roomBoundsResolveState(): PlayerState {
    const anchor = this.roomBoundsResolveAnchor;
    return anchor ? { ...this.playerState, x: anchor.x, y: anchor.y } : this.playerState;
  }

  /**
   * Keep the camera locked inside the active interior sector-area so its masked
   * edge never reveals neighboring strips or void. Falls back to the full map
   * bounds in the overworld.
   */
  private updateCameraRoomBounds(): void {
    const camera = this.cameras.main;
    const room = this.activeInteriorRoom();
    if (room) {
      const viewportWidthAtDefaultZoom = camera.width / OVERWORLD_CAMERA_ZOOM;
      const viewportHeightAtDefaultZoom = camera.height / OVERWORLD_CAMERA_ZOOM;
      const shouldFillZoom =
        room.rect.width < viewportWidthAtDefaultZoom &&
        room.rect.height < viewportHeightAtDefaultZoom;
      const fillZoom = shouldFillZoom
        ? Math.max(OVERWORLD_CAMERA_ZOOM, camera.width / room.rect.width, camera.height / room.rect.height)
        : OVERWORLD_CAMERA_ZOOM;
      camera.setZoom(Math.min(fillZoom, INTERIOR_CAMERA_MAX_ZOOM));
      camera.setBounds(room.rect.x, room.rect.y, room.rect.width, room.rect.height, true);
      // setBounds does not immediately pull an already-centered/following camera
      // back inside the sector-area for the current frame.
      this.clampCameraScrollToRoom(room);
      return;
    }
    camera.setZoom(OVERWORLD_CAMERA_ZOOM);
    const bounds = this.movementBounds();
    camera.setBounds(0, 0, bounds.maxX + 8, bounds.maxY + 1);
  }

  private clampCameraScrollToRoom(room: ConnectedRoomBounds): void {
    const camera = this.cameras.main;
    const zoom = camera.zoom > 0 ? camera.zoom : 1;
    const visibleWidth = camera.width / zoom;
    const visibleHeight = camera.height / zoom;
    const centeredX = this.playerState.x - visibleWidth / 2;
    const centeredY = this.playerState.y - visibleHeight / 2;
    const maxScrollX = room.rect.x + room.rect.width - visibleWidth;
    const maxScrollY = room.rect.y + room.rect.height - visibleHeight;
    const scrollX = maxScrollX >= room.rect.x
      ? clamp(centeredX, room.rect.x, maxScrollX)
      : room.rect.x + (room.rect.width - visibleWidth) / 2;
    const scrollY = maxScrollY >= room.rect.y
      ? clamp(centeredY, room.rect.y, maxScrollY)
      : room.rect.y + (room.rect.height - visibleHeight) / 2;
    camera.setScroll(scrollX, scrollY);
  }

  private playerInsideCachedRoomBounds(point = this.playerState): boolean {
    const room = this.activeRoomBounds;
    const cell = worldPixelToCollisionCell(point, this.collisionCellSize);
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

  // Debug-only indoor readout. The Act 1 tint itself does not exempt interiors.
  // The room-bounds isInterior flag is not always set, so fall back to the
  // interior-music sector test the audio system already trusts.
  private nightIndoors(): boolean {
    return Boolean(this.activeInteriorRoom()) || this.playerInInteriorMusicSector();
  }

  private worldNightTintRequired(): boolean {
    const sequence = this.data_.earlyGameSequence;
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && openingNightTintRequired(sequence, this.gameFlags)) {
      return true;
    }
    return shouldUseAct1Night({ flags: this.gameFlags });
  }

  private act1NightDebugState(): Act1NightDebugState {
    const indoors = this.nightIndoors();
    const overlay = this.nightTintOverlay;
    return {
      shouldShow: this.worldNightTintRequired(),
      overlayExists: Boolean(overlay),
      alpha: overlay?.alpha ?? null,
      visible: overlay?.visible ?? null,
      depth: overlay?.depth ?? null,
      indoors,
      hasRouteOpen: this.gameFlags.has(ROUTE_OPEN_FLAG),
      hasAct1Complete: this.gameFlags.has(ACT1_COMPLETE_FLAG),
      introHold: this.introMusicHold,
      cue: (this.music as unknown as { current?: { cue?: string } }).current?.cue ?? null
    };
  }

  private updateAct1NightTint(options: { fade?: boolean } = {}): void {
    const shouldShow = this.worldNightTintRequired();
    if (shouldShow) {
      const overlay = this.ensureNightTintOverlay();
      this.tweens.killTweensOf(overlay);
      overlay.setAlpha(ACT1_NIGHT_TINT_ALPHA).setVisible(true);
      this.syncNightTintOverlaySize();
      this.nightTintActive = true;
      return;
    }
    if (!this.nightTintOverlay && options.fade) {
      this.ensureNightTintOverlay().setAlpha(ACT1_NIGHT_TINT_ALPHA).setVisible(true);
      this.nightTintActive = true;
    }
    if (!this.nightTintOverlay) {
      this.nightTintActive = false;
      return;
    }
    if (options.fade && this.nightTintActive) {
      const overlay = this.nightTintOverlay;
      this.tweens.killTweensOf(overlay);
      overlay.setVisible(true);
      this.syncNightTintOverlaySize();
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: ACT1_DAWN_FADE_MS,
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (this.nightTintOverlay === overlay) {
            this.destroyNightTintOverlay();
          } else {
            overlay.destroy();
          }
        }
      });
      this.nightTintActive = false;
      return;
    }
    this.destroyNightTintOverlay();
  }

  private ensureNightTintOverlay(): Phaser.GameObjects.Image {
    if (this.nightTintOverlay) {
      return this.nightTintOverlay;
    }
    // A full-screen IMAGE, not a Rectangle Shape. Under the Canvas renderer
    // (this build has no WebGL) Shape objects do not reliably composite over the
    // chunked world, AND setTint on an Image is a no-op in Canvas (it draws white
    // and washes the screen pale). So we bake the night color into a 1x1 texture
    // and scale that up; no tint needed.
    const key = "act1-night-px";
    if (!this.textures.exists(key)) {
      const canvasTex = this.textures.createCanvas(key, 1, 1);
      const ctx = canvasTex?.getContext();
      if (ctx) {
        ctx.fillStyle = `#${ACT1_NIGHT_TINT_COLOR.toString(16).padStart(6, "0")}`;
        ctx.fillRect(0, 0, 1, 1);
        canvasTex?.refresh();
      }
    }
    const overlay = this.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(ACT1_NIGHT_TINT_DEPTH)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setAlpha(ACT1_NIGHT_TINT_ALPHA);
    this.nightTintOverlay = overlay;
    return overlay;
  }

  private syncNightTintOverlaySize(): void {
    this.nightTintOverlay?.setDisplaySize(this.scale.width, this.scale.height);
  }

  private destroyNightTintOverlay(): void {
    if (this.nightTintOverlay) {
      this.tweens.killTweensOf(this.nightTintOverlay);
      this.nightTintOverlay.destroy();
      this.nightTintOverlay = undefined;
    }
    this.nightTintActive = false;
  }

  private deriveInteriorSectorAreaRoomBounds(
    room: ConnectedRoomBounds,
    point = this.playerState
  ): ConnectedRoomBounds {
    if (!room.isInterior) {
      return room;
    }
    const areaRect = this.sectorAreaRectForPoint(point) ?? room.rect;
    const areaCellBounds = this.cellBoundsForWorldRect(areaRect);
    if (!areaCellBounds) {
      return { ...room, rect: areaRect };
    }
    const maskCellRanges = rectangularMaskRangesForBounds(areaCellBounds);
    const maskCellBounds = cellBoundsForMaskRanges(maskCellRanges);
    return {
      ...room,
      walkableCellBounds: areaCellBounds,
      ...(maskCellBounds ? { maskCellBounds } : {}),
      maskCellRanges,
      rect: areaRect
    };
  }

  private sectorAreaBoundsKey(point: { x: number; y: number }): string | undefined {
    const sectors = this.world_.sectors;
    const start = sectors ? sectorCoordForWorldPixel(point, sectors) : undefined;
    if (!sectors || !start) {
      return undefined;
    }
    const areaId = sectors.areaIds[start.index];
    if (!Number.isInteger(areaId)) {
      return undefined;
    }
    const rect = this.sectorAreaRectForPoint(point);
    return rect
      ? `${areaId}:${rect.x},${rect.y},${rect.width},${rect.height}`
      : `${areaId}:${start.sectorCol},${start.sectorRow}`;
  }

  private sectorAreaRectForPoint(point: { x: number; y: number }): WorldRect | undefined {
    const sectors = this.world_.sectors;
    if (!sectors) {
      return undefined;
    }
    const start = sectorCoordForWorldPixel(point, sectors);
    if (!start) {
      return undefined;
    }
    const areaId = sectors.areaIds[start.index];
    if (!Number.isInteger(areaId)) {
      return undefined;
    }
    const seen = new Set<number>([start.index]);
    const queue = [start];
    let cursor = 0;
    let minCol = start.sectorCol;
    let maxCol = start.sectorCol;
    let minRow = start.sectorRow;
    let maxRow = start.sectorRow;
    while (cursor < queue.length) {
      const sector = queue[cursor];
      cursor += 1;
      minCol = Math.min(minCol, sector.sectorCol);
      maxCol = Math.max(maxCol, sector.sectorCol);
      minRow = Math.min(minRow, sector.sectorRow);
      maxRow = Math.max(maxRow, sector.sectorRow);
      const neighbors = [
        { sectorCol: sector.sectorCol + 1, sectorRow: sector.sectorRow },
        { sectorCol: sector.sectorCol - 1, sectorRow: sector.sectorRow },
        { sectorCol: sector.sectorCol, sectorRow: sector.sectorRow + 1 },
        { sectorCol: sector.sectorCol, sectorRow: sector.sectorRow - 1 }
      ];
      for (const neighbor of neighbors) {
        if (
          neighbor.sectorCol < 0 ||
          neighbor.sectorRow < 0 ||
          neighbor.sectorCol >= sectors.cols ||
          neighbor.sectorRow >= sectors.rows
        ) {
          continue;
        }
        const index = neighbor.sectorRow * sectors.cols + neighbor.sectorCol;
        if (seen.has(index) || sectors.areaIds[index] !== areaId) {
          continue;
        }
        seen.add(index);
        queue.push({ ...neighbor, index });
      }
    }
    const sectorWidthPixels = sectors.sectorWidthTiles * sectors.tileSize;
    const sectorHeightPixels = sectors.sectorHeightTiles * sectors.tileSize;
    const x = minCol * sectorWidthPixels;
    const y = minRow * sectorHeightPixels;
    const width = (maxCol - minCol + 1) * sectorWidthPixels;
    const height = (maxRow - minRow + 1) * sectorHeightPixels;
    const pad = INTERIOR_SECTOR_AREA_RECT_PADS[areaId];
    const paddedRight = Math.min(sectors.cols * sectorWidthPixels, x + width + Math.max(0, pad?.right ?? 0));
    const paddedBottom = Math.min(sectors.rows * sectorHeightPixels, y + height + Math.max(0, pad?.bottom ?? 0));
    return {
      x,
      y,
      width: paddedRight - x,
      height: paddedBottom - y
    };
  }

  private cellBoundsForWorldRect(rect: WorldRect): ConnectedRoomBounds["walkableCellBounds"] | undefined {
    const grid = this.collisionGrid();
    const minCellX = clamp(Math.floor(rect.x / grid.cellSize), 0, grid.width - 1);
    const minCellY = clamp(Math.floor(rect.y / grid.cellSize), 0, grid.height - 1);
    const maxCellX = clamp(Math.ceil((rect.x + rect.width) / grid.cellSize) - 1, 0, grid.width - 1);
    const maxCellY = clamp(Math.ceil((rect.y + rect.height) / grid.cellSize) - 1, 0, grid.height - 1);
    if (maxCellX < minCellX || maxCellY < minCellY) {
      return undefined;
    }
    return buildCellBounds(minCellX, maxCellX, minCellY, maxCellY);
  }

  private syncOverworldMusicForCurrentFlags(force = false, options: { releaseFade?: boolean } = {}): void {
    const wasHolding = this.introMusicHold;
    this.introMusicHold = shouldHoldAct1IntroMusic(this.gameFlags);
    if (this.introMusicHold) {
      this.playOverworldMusicCue("intro", force);
      return;
    }
    this.syncOverworldMusicCue(force || wasHolding, {
      fadeMs: options.releaseFade ? INTRO_MUSIC_RELEASE_FADE_MS : undefined
    });
  }

  private syncOverworldMusicAfterRouteOpen(routeOpenJustSet: boolean): void {
    if (!routeOpenJustSet) {
      return;
    }
    this.syncOverworldMusicForCurrentFlags(true, { releaseFade: true });
  }

  private syncOverworldMusicCue(force = false, playOptions: { fadeMs?: number } = {}): void {
    if (this.cinematicActive() || this.introMusicHold) {
      return;
    }
    if (this.forcedOverworldMusicCue) {
      this.playOverworldMusicCue(this.forcedOverworldMusicCue, force, playOptions);
      return;
    }
    const sequence = this.data_.earlyGameSequence;
    if (openingGatesActive(sequence, this.gameFlags)) {
      return;
    }
    this.playOverworldMusicCue(this.resolvedOverworldMusicCueForPlayer(), force, playOptions);
  }

  private resolvedOverworldMusicCueForPlayer(): OverworldMusicCue {
    return overworldMusicCueForSector(
      this.data_.musicManifest,
      this.world_.sectors,
      this.playerState,
      false,
      this.data_.sectorMusic
    );
  }

  private playOverworldMusicCue(cue: OverworldMusicCue, force = false, playOptions: { fadeMs?: number } = {}): void {
    if (!force && this.currentOverworldMusicCue === cue) {
      return;
    }
    this.currentOverworldMusicCue = cue;
    void this.music.play(cue, playOptions);
  }

  /** Soft per-character tick as typewriter dialogue reveals, skipping whitespace. */
  private tickDialogueBlip(): void {
    if (!textBlipEnabled() || !this.dialogue.open || this.dialogue.revealComplete) {
      this.lastDialogueRevealedChars = 0;
      this.dialogueBlipGlyphCount = 0;
      return;
    }
    const state = this.dialogue.currentRevealState;
    const revealed = state.revealedChars;
    if (revealed < this.lastDialogueRevealedChars) {
      this.lastDialogueRevealedChars = revealed; // new page reset
      this.dialogueBlipGlyphCount = nonWhitespaceCount(state.revealedText.slice(0, revealed));
    }
    if (revealed > this.lastDialogueRevealedChars) {
      const fresh = state.revealedText.slice(this.lastDialogueRevealedChars, revealed);
      for (const char of fresh) {
        if (/\S/.test(char)) {
          this.dialogueBlipGlyphCount += 1;
          if (this.dialogueBlipGlyphCount % TEXT_BLIP_TUNING.cadenceChars === 0) {
            this.transitionSfx.textBlip();
          }
        }
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
      cue: this.currentOverworldMusicCue ?? "-",
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
      this.clearInteriorRoomMaskBands();
      this.roomMaskGraphics?.clear();
      return;
    }
    const mask = this.ensureRoomMask(room);
    for (const streamed of this.chunkObjects.values()) {
      this.applyRoomMaskToImage(streamed.background, mask);
      this.applyRoomMaskToImage(streamed.foreground, mask);
    }
    this.updateInteriorRoomMaskBands(room);
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

  private updateInteriorRoomMaskBands(room: ConnectedRoomBounds): void {
    const graphics = this.roomMaskBandGraphics ?? this.add.graphics();
    this.roomMaskBandGraphics = graphics;
    graphics
      .clear()
      .setPosition(0, 0)
      .setScrollFactor(1)
      .setDepth(INTERIOR_ROOM_MASK_BAND_DEPTH)
      .setVisible(true);
    graphics.fillStyle(0x000000, 1);

    const pad = this.roomMaskBandOverscanWorldPixels();
    const left = Math.floor(room.rect.x);
    const top = Math.floor(room.rect.y);
    const right = Math.ceil(room.rect.x + room.rect.width);
    const bottom = Math.ceil(room.rect.y + room.rect.height);
    const coverLeft = left - pad;
    const coverTop = top - pad;
    const coverRight = right + pad;
    const coverBottom = bottom + pad;
    const coverWidth = coverRight - coverLeft;
    const roomHeight = bottom - top;
    // EB interior strips pack rooms edge to edge, so the sector-area boundary
    // rows can carry a neighbor strip's pixels INSIDE the rect (a 4px colored
    // sliver at the masked edge). Pull every band a half-cell into the rect to
    // swallow the shared boundary row; walls against black lose nothing visible.
    const boundaryInset = Math.round(this.collisionCellSize / 2);

    this.fillPositiveRect(graphics, coverLeft, coverTop, coverWidth, top - coverTop + boundaryInset);
    this.fillPositiveRect(graphics, coverLeft, bottom - boundaryInset, coverWidth, coverBottom - bottom + boundaryInset);
    this.fillPositiveRect(graphics, coverLeft, top, left - coverLeft + boundaryInset, roomHeight);
    this.fillPositiveRect(graphics, right - boundaryInset, top, coverRight - right + boundaryInset, roomHeight);
  }

  private roomMaskBandOverscanWorldPixels(): number {
    const camera = this.cameras.main;
    const minimumZoom = Math.max(OVERWORLD_CAMERA_ZOOM, 0.001);
    const viewportWorldSize = Math.max(camera.width, camera.height) / minimumZoom;
    return Math.ceil(Math.max(512, viewportWorldSize) + INTERIOR_ROOM_MASK_BAND_OVERSCAN_PX);
  }

  private fillPositiveRect(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    if (width <= 0 || height <= 0) {
      return;
    }
    graphics.fillRect(x, y, width, height);
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

  private clearInteriorRoomMaskBands(): void {
    this.roomMaskBandGraphics?.clear();
    this.roomMaskBandGraphics?.setVisible(false);
  }

  private destroyRoomMask(): void {
    this.clearRoomMaskFromChunks();
    this.roomMaskBandGraphics?.destroy();
    this.roomMaskBandGraphics = undefined;
    this.roomMask?.destroy();
    this.roomMask = undefined;
    this.roomMaskGraphics?.destroy();
    this.roomMaskGraphics = undefined;
  }

  private chunkTextureKey(chunk: WorldChunk, layer: ChunkLayer): string {
    if (layer !== "foreground") {
      return `chunk-${layer}-${chunk.cx}-${chunk.cy}`;
    }
    const clears = this.appliedFgClearsForChunk(chunk);
    if (clears.length === 0) {
      return this.foregroundSourceTextureKey(chunk);
    }
    return `chunk-foreground-${chunk.cx}-${chunk.cy}-${fgClearTextureHash(clears)}`;
  }

  private chunkLoadTextureKey(chunk: WorldChunk, layer: ChunkLayer): string {
    return layer === "foreground" ? this.foregroundSourceTextureKey(chunk) : this.chunkTextureKey(chunk, layer);
  }

  private foregroundSourceTextureKey(chunk: WorldChunk): string {
    return `chunk-foreground-source-${chunk.cx}-${chunk.cy}`;
  }

  private appliedFgClearsForChunk(chunk: WorldChunk): ReturnType<typeof fgClearsForChunk> {
    return fgClearsForChunk([...(this.data_.fgOverrides?.clears ?? []), ...this.sessionFgClears], chunk, chunkPixelSize(this.grid()));
  }

  private ensureForegroundTexture(chunk: WorldChunk): boolean {
    const textureKey = this.chunkTextureKey(chunk, "foreground");
    if (this.textures.exists(textureKey)) {
      return true;
    }

    const sourceKey = this.foregroundSourceTextureKey(chunk);
    if (textureKey === sourceKey) {
      return this.textures.exists(sourceKey);
    }
    if (!this.textures.exists(sourceKey)) {
      return false;
    }

    const source = this.textures.get(sourceKey).getSourceImage();
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
      return false;
    }
    const width = Math.max(1, Math.floor(source.width));
    const height = Math.max(1, Math.floor(source.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    for (const clear of this.appliedFgClearsForChunk(chunk)) {
      context.clearRect(clear.x, clear.y, clear.w, clear.h);
    }
    return Boolean(this.textures.addCanvas(textureKey, canvas));
  }

  private liveApplyFgClear(clear: FgClearRect): { rect: FgClearRect; chunks: Array<{ cx: number; cy: number; textureKey: string }> } {
    this.sessionFgClears.push(clear);
    const chunks: Array<{ cx: number; cy: number; textureKey: string }> = [];
    for (const streamed of this.chunkObjects.values()) {
      if (this.appliedFgClearsForChunk(streamed.chunk).length === 0) {
        continue;
      }
      if (!this.ensureForegroundTexture(streamed.chunk)) {
        continue;
      }
      const textureKey = this.chunkTextureKey(streamed.chunk, "foreground");
      if (streamed.foreground && isLiveGameObject(streamed.foreground)) {
        streamed.foreground.setTexture(textureKey);
      }
      chunks.push({ cx: streamed.chunk.cx, cy: streamed.chunk.cy, textureKey });
    }
    return { rect: clear, chunks };
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

    // Surface-class tints per docs/collision-semantics.md. Ladder paints over the
    // solid red (cliff ladders are 0x90); water order puts deep before shallow.
    const cellSize = this.collisionCellSize;
    for (let cellY = range.minCellY; cellY <= range.maxCellY; cellY += 1) {
      for (let cellX = range.minCellX; cellX <= range.maxCellX; cellX += 1) {
        const surface = surfaceAtCell(this.surfaceRows, cellX, cellY);
        if (surface === 0) {
          continue;
        }
        if (isDeepWaterSurface(surface)) {
          graphics.fillStyle(0x1436c8, 0.4);
        } else if (isWaterSurface(surface)) {
          graphics.fillStyle(0x2f80ff, 0.3);
        } else if (isLadderSurface(surface)) {
          graphics.fillStyle(0x14dcdc, 0.45);
        } else if (isFgUpperSurface(surface)) {
          graphics.fillStyle(0xc83ce0, 0.4);
        } else if (isFgLowerOnlySurface(surface)) {
          graphics.fillStyle(0xf0dc28, 0.4);
        } else if (isSunstrokeSurface(surface)) {
          graphics.fillStyle(0xff8c1e, 0.3);
        } else {
          continue;
        }
        graphics.fillRect(cellX * cellSize, cellY * cellSize, cellSize, cellSize);
      }
    }

    this.drawDoorOverlay(graphics, rect, range);

    // Paint-editor cursor (white) + pending rect anchor (amber).
    const cursor = this.collisionEditor?.cursor();
    if (cursor) {
      graphics.lineStyle(1, 0xffffff, 1);
      graphics.strokeRect(cursor.cellX * cellSize + 0.5, cursor.cellY * cellSize + 0.5, cellSize - 1, cellSize - 1);
    }
    const anchor = this.collisionEditor?.rectAnchor();
    if (anchor) {
      graphics.lineStyle(1, 0xffcc66, 1);
      graphics.strokeRect(anchor.cellX * cellSize + 0.5, anchor.cellY * cellSize + 0.5, cellSize - 1, cellSize - 1);
    }
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
    for (const door of this.activeDoors()) {
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
   * Force authored world-pixel rects solid (content/collision-overrides.json).
   * Logic lives in the pure collisionOverrides module so the offline
   * reachability/audit tooling applies exactly the same patch.
   */
  private applyCollisionOverrides(): void {
    const overrides = this.data_.collisionOverrides;
    if (!overrides || ((overrides.clears?.length ?? 0) === 0 && overrides.solids.length === 0)) return;
    applyClearOverrideRects(this.solidRows, overrides.clears ?? [], this.collisionCellSize);
    applySolidOverrideRects(this.solidRows, overrides.solids, this.collisionCellSize);
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
    if (import.meta.env.DEV) {
      globals.__nightDebug = () => this.act1NightDebugState();
      globals.__openingPhase = () => resolveOpeningPhase(this.gameFlags);
    }
    // Debug-only teleport for QA capture tooling: hard-set the player to a world pixel and
    // stream the surrounding chunks, bypassing the spawn-validation/fallback path (so it
    // never silently lands somewhere else). Returns the resulting feet.
    globals.__warpTo = (x: number, y: number): { x: number; y: number } => {
      this.playerState.x = x;
      this.playerState.y = y;
      this.playerState.velocityX = 0;
      this.playerState.velocityY = 0;
      this.playerState.moving = false;
      this.playerState.walkClockMs = 0;
      this.currentChunk = undefined;
      this.activeRoomBounds = undefined;
      if (this.player) {
        this.player.x = x;
        this.player.y = y;
        this.setActorSortDepth(this.player);
      }
      this.refreshStreaming(true);
      this.refreshRoomBounds(true);
      this.cameras.main.centerOn(x, y);
      this.updateCameraRoomBounds();
      return { x: this.playerState.x, y: this.playerState.y };
    };
    // Launch the pre-wake meadow dream overlay in isolation (dev QA). Hold Up/W to walk.
    globals.__runMeadowDream = (): void => {
      this.startMeadowDream(() => {
        (globalThis as Record<string, unknown>).__meadowDreamDone = true;
      });
    };
    // Walk-behind introspection for collision-exactness probes: alpha of the
    // foreground chunk art at a world pixel (0..255, -1 = chunk FG not streamed).
    globals.__fgAlphaAt = (x: number, y: number): number => {
      const size = chunkPixelSize(this.grid());
      const cx = Math.floor(x / size);
      const cy = Math.floor(y / size);
      const key = this.chunkTextureKey({ cx, cy } as WorldChunk, "foreground");
      if (!this.textures.exists(key)) {
        return -1;
      }
      return this.textures.getPixelAlpha(Math.floor(x - cx * size), Math.floor(y - cy * size), key) ?? -1;
    };
    // Sampled opaque-FG coverage over a world rect - the "player is occluded here"
    // assertion primitive (ratio of opaque FG pixels among sampled ones).
    globals.__fgCoverageRect = (x: number, y: number, w: number, h: number, step = 2) => {
      const fgAlphaAt = globals.__fgAlphaAt as (px: number, py: number) => number;
      let sampled = 0;
      let opaque = 0;
      for (let py = y; py < y + h; py += step) {
        for (let px = x; px < x + w; px += step) {
          const alpha = fgAlphaAt(px, py);
          if (alpha < 0) {
            continue;
          }
          sampled += 1;
          if (alpha > 0) {
            opaque += 1;
          }
        }
      }
      return { sampled, opaque, ratio: sampled > 0 ? opaque / sampled : 0 };
    };
    globals.__fgClearAt = (x: number, y: number, w: number, h: number) => {
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return { ok: false, reason: "expected finite x,y,w,h with positive w,h" };
      }
      return {
        ok: true,
        ...this.liveApplyFgClear({
          x: Math.floor(x),
          y: Math.floor(y),
          w: Math.ceil(w),
          h: Math.ceil(h),
          note: "DEV live clear"
        })
      };
    };
    globals.__playerDepthInfo = () => {
      const feet = { x: this.playerState.x, y: this.playerState.y };
      const sprite = this.player instanceof Phaser.GameObjects.Sprite ? this.player : undefined;
      return {
        x: feet.x,
        y: feet.y,
        depth: sprite?.depth ?? null,
        feetSurface: surfaceAtWorldPixel(this.surfaceRows, feet, this.collisionGrid()),
        cropped: sprite?.isCropped ?? false
      };
    };
    // Debug-only: full-heal the party - a between-fight convenience for the autonomous-play harness
    // (the player-facing rest is the in-world hotel at NPC 58). Nothing in normal play calls it.
    globals.__debugHeal = () => {
      this.partyState.fullRecover({ cureStatuses: true });
      this.refreshMenuScreens();
      this.publish();
    };
    if (import.meta.env.DEV) {
      globals.__setPartyLevels = (level: number): SetPartyLevelDebugSummary[] => this.setPartyLevelsDebug(level);
    }
    // Debug-only: force the flee flag on live roamers so flee (away-movement) can be verified
    // without an over-leveled party. Nothing in normal play calls it.
    // Debug-only: force a roamer spawn (optionally as an ambusher) so the playtest
    // harness can verify archetype behavior without waiting on spawn RNG.
    globals.__debugSpawnRoamer = (forceAmbush = false, attempts = 40) => {
      // selectSectorEnemyGroup rolls the sector spawn rate internally, so a single
      // try usually no-ops; retry until something spawns (bounded).
      const before = this.overworldEnemies.size;
      for (let i = 0; i < attempts && this.overworldEnemies.size === before; i += 1) {
        this.trySpawnOverworldEnemy(forceAmbush ? { forceArchetype: "ambusher" } : {});
      }
      return this.overworldEnemies.size;
    };
    // Debug-only: probe the ambush hideout finder at a world point.
    globals.__debugFindAmbushSpot = (x: number, y: number) => this.findAmbushCanopySpot({ x, y }) ?? null;
    globals.__debugSetRoamerFlees = (value: boolean) => {
      for (const enemy of this.overworldEnemies.values()) {
        enemy.debugForceFlee = Boolean(value);
      }
      return this.overworldEnemies.size;
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
    // DEV: set a story flag and run the same reactions a real trigger would (night
    // dawn fade, music handoff, barriers). Reusable QA infra for flag-gated
    // acceptance runs (docs/qa/goal-prompts.md Template A/S boundary checks).
    globals.__setStoryFlag = (flag: string, on = true) => {
      if (on) {
        this.gameFlags.set(flag);
      } else {
        this.gameFlags.unset(flag);
      }
      this.updateAct1NightTint({ fade: flag === ROUTE_OPEN_FLAG && on });
      if (flag === ROUTE_OPEN_FLAG && on) {
        // Drive the SAME handoff a real story trigger uses (recomputes the intro
        // hold + crossfades to area music), not a shortcut that skips the hold.
        this.syncOverworldMusicAfterRouteOpen(true);
      } else {
        this.syncOverworldMusicForCurrentFlags(true);
      }
      this.refreshBarrierSprites();
      return { flag, on, hasIt: this.gameFlags.has(flag) };
    };
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
    // Debug-only: recruit by charId as a live story beat (sets the recruit flag, joins,
    // shows the notice) - mirrors what a trigger's setFlags does in real play.
    globals.__recruit = (charId: number) => {
      const recruit = PARTY_RECRUITS.find((entry) => entry.charId === charId);
      if (recruit) {
        this.gameFlags.set(recruit.flag);
      }
      this.reconcileRecruits({ announce: true });
      return this.partyState.party();
    };
    globals.__reorderParty = (ids: number[]) => {
      this.partyState.reorder(ids);
      this.handlePartyCompositionChanged();
      return this.partyState.party();
    };
    globals.__partyRoster = () => ({
      party: this.partyState.party(),
      names: this.effectiveBattlePartyMembers()?.map((entry) => ({ id: entry.id, name: entry.name })) ?? []
    });
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
    globals.__playerVisualState = () => this.currentPlayerVisualStateDebug();
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
    delete globals.__nightDebug;
    delete globals.__openingPhase;
    delete globals.__warpTo;
    delete globals.__fgAlphaAt;
    delete globals.__fgCoverageRect;
    delete globals.__fgClearAt;
    delete globals.__playerDepthInfo;
    delete globals.__debugHeal;
    delete globals.__setPartyLevels;
    delete globals.__debugSpawnRoamer;
    delete globals.__debugFindAmbushSpot;
    delete globals.__equip;
    delete globals.__battleStats;
    delete globals.__overworldStatusHud;
    delete globals.__setPartyStatus;
    delete globals.__partyOp;
    delete globals.__recruit;
    delete globals.__reorderParty;
    delete globals.__partyRoster;
    delete globals.__followerInfo;
    delete globals.__setPlayerVisualState;
    delete globals.__playerVisualState;
    delete globals.__overlayInfo;
    delete globals.__runMeadowDream;
    delete globals.__meadowDreamDone;
    delete globals.__meadowDreamDebug;
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
        queued = this.requestNpcRuntimeTexture(placement.data.npcId, placement.data.spriteGroup) || queued;
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
    const behavior = this.behaviorForRuntimeNpc(npc);
    return {
      key: placement.key,
      data: npc,
      state: createNpcState(npc.worldPixel.x, npc.worldPixel.y, facing, behavior, frames),
      frames,
      movementHome: behavior.kind === "wander" || behavior.kind === "patrol" ? this.movementHomeForNpc(npc) : undefined,
      sprite: this.spawnNpcActor(npc.npcId, npc.worldPixel.x, npc.worldPixel.y, npc.spriteGroup, npc.direction)
    };
  }

  private ensureCutsceneNpcRuntime(actor: Extract<NormalizedActorMoveSelector, { kind: "npc" }>): NpcRuntime | undefined {
    const existing = this.npcRuntimeForActor(actor);
    if (existing) {
      const queued = this.ensureNpcRuntimeSprite(existing);
      if (queued && !this.load.isLoading()) {
        this.load.start();
      }
      return existing;
    }

    const placement = this.npcPlacementForActor(actor);
    if (!placement) {
      return undefined;
    }
    const queued = this.requestNpcRuntimeTexture(placement.data.npcId, placement.data.spriteGroup);
    const runtime = this.createNpcRuntime(placement);
    this.npcRuntimes.set(placement.key, runtime);
    this.syncNpc(runtime);
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }
    return runtime;
  }

  private ensureNpcRuntimeSprite(npc: NpcRuntime): boolean {
    if (npc.sprite) {
      return false;
    }
    const queued = this.requestNpcRuntimeTexture(npc.data.npcId, npc.data.spriteGroup);
    npc.sprite = this.spawnNpcActor(
      npc.data.npcId,
      npc.state.player.x,
      npc.state.player.y,
      npc.data.spriteGroup,
      npc.state.player.facing
    );
    this.syncNpc(npc);
    return queued;
  }

  private behaviorForRuntimeNpc(npc: RuntimeNpcData) {
    return behaviorForNpc(npc.npcId, npc.movement, {
      hasServiceInteraction: this.npcHasServiceInteraction(npc),
      isInteriorHome: isInteriorMusicSector(this.world_.sectors, npc.worldPixel),
      movementPattern: this.data_.npcMovementPatterns.byNpcId[String(npc.npcId)]?.pattern,
      npcType: npc.type
    });
  }

  private movementHomeForNpc(npc: RuntimeNpcData): NpcMovementHome {
    const componentId = this.nearestNavmeshComponentId(npc.worldPixel.x, npc.worldPixel.y, 2);
    const sectorAreaKey = this.interiorSectorAreaKey(npc.worldPixel);
    return {
      componentId,
      ...(sectorAreaKey ? { sectorAreaKey } : {})
    };
  }

  private interiorSectorAreaKey(point: { x: number; y: number }): string | undefined {
    const sectors = this.world_.sectors;
    if (!sectors) {
      return undefined;
    }
    const sector = sectorCoordForWorldPixel(point, sectors);
    if (!sector || sectors.bounded[sector.index] !== 1) {
      return undefined;
    }
    const areaId = sectors.areaIds[sector.index];
    return Number.isInteger(areaId) ? `area:${areaId}` : undefined;
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
        blocked: (x, y) => this.npcMovementStepBlocked(npc, x, y),
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
    const renderLayer = this.npcSpriteOverrideResolution(
      npc.data.npcId,
      npc.data.spriteGroup
    )?.override.renderLayer ?? npcRenderLayer(
      npc.data.type,
      isInteriorMusicSector(this.world_.sectors, npc.state.player)
    );
    this.setActorSortDepth(actor, renderLayer);
    actor.y = npc.state.player.y;
    this.applyWalkMirror(actor, this.spriteWalkMirrorNow(
      npc.state.player.moving,
      npc.frames,
      npc.state.player.facing,
      npc.data.npcId
    ));
    actor.setVisible(this.npcInsideActiveRoom(npc) && this.cutsceneActorVisible(npc.data.npcId));
  }

  private applyNpcRoomVisibility(): void {
    for (const npc of this.npcRuntimes.values()) {
      npc.sprite?.setVisible(this.npcInsideActiveRoom(npc) && this.cutsceneActorVisible(npc.data.npcId));
    }
  }

  private applyWorldObjectRoomVisibility(): void {
    this.syncPresentInteractableSprites();
    this.syncExamineInteractableSprites();
    this.syncSourceCheckActors();
    for (const actor of this.bossGateActors.values()) {
      actor.sprite?.setVisible(this.bossGateActorVisible(actor));
    }
    for (const enemy of this.overworldEnemies.values()) {
      enemy.sprite?.setVisible(this.overworldEnemyActorVisible(enemy));
    }
  }

  private npcInsideActiveRoom(npc: NpcRuntime): boolean {
    return this.worldPointInsideActiveRoom(npc.state.player);
  }

  private worldPointInsideActiveRoom(point: { x: number; y: number }): boolean {
    const room = this.activeInteriorRoom();
    return !room || pointInRect(point, room.rect);
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

  private requestNpcRuntimeTexture(npcId: number, spriteGroup: number | undefined): boolean {
    const override = this.npcSpriteOverrideResolution(npcId, spriteGroup);
    return override
      ? this.requestNpcOverrideSheet(npcId, spriteGroup)
      : this.requestNpcSheet(spriteGroup);
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
        key: spriteOverrideNpcSheetKey(npcId, npcOverride.image),
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

  /** Doors filtered by EB conditional-door flags (when-unset class honored). */
  private activeDoors(): readonly WorldDoor[] {
    return this.world_.doors.filter((door) => doorActiveForFlags(door.eventFlag, this.gameFlags));
  }

  private isNpcVisible(npc: RuntimeNpcData): boolean {
    const sequence = this.data_.earlyGameSequence;
    if (isAddedWorldChunkedNpc(npc) && !openingOwnedNpcEnabled(sequence, npc.npcId)) {
      return false;
    }
    if (isAddedWorldChunkedNpc(npc) && !addedNpcVisibleForFlags(npc, this.gameFlags)) {
      return false;
    }
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && !isInteriorMusicSector(this.world_.sectors, npc.worldPixel) && !openingNpcAllowed(sequence, this.gameFlags, npc.npcId)) {
      return false;
    }
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
    // A faint ground shadow while the real sprite sheet streams in, rather than an
    // opaque box that flashes on top of the map for a frame or two.
    const placeholder = this.add.rectangle(x, y, 14, 5, 0x000000, 0.28);
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

  private static readonly PRESENT_TEXTURE_CLOSED = "swag-present-closed";
  private static readonly PRESENT_TEXTURE_OPEN = "swag-present-open";
  private static readonly MAILBOX_TEXTURE = "swag-mailbox-static";

  /** Draw the roadside-present gift boxes once into cached textures (closed + opened). */
  private ensurePresentTextures(): void {
    if (this.textures.exists(ChunkedWorldScene.PRESENT_TEXTURE_CLOSED)) {
      return;
    }
    const g = this.add.graphics();
    // Closed present: a pink gift box with a cream ribbon + bow.
    g.clear();
    g.fillStyle(0x2a1620, 1).fillRect(2, 6, 12, 10); // dark outline base
    g.fillStyle(0xd94f7a, 1).fillRect(3, 8, 10, 7); // box body
    g.fillStyle(0xe86a92, 1).fillRect(2, 6, 12, 3); // lid (lighter, slightly wider)
    g.fillStyle(0xffe9a8, 1).fillRect(7, 6, 2, 9); // vertical ribbon
    g.fillStyle(0xffe9a8, 1).fillRect(2, 7, 12, 1); // ribbon across lid seam
    g.fillStyle(0xffe9a8, 1).fillRect(5, 3, 2, 3).fillRect(9, 3, 2, 3); // bow loops
    g.generateTexture(ChunkedWorldScene.PRESENT_TEXTURE_CLOSED, 16, 16);
    // Opened present: muted grey box with the lid ajar, no ribbon.
    g.clear();
    g.fillStyle(0x23262c, 1).fillRect(3, 8, 10, 8); // outline base
    g.fillStyle(0x59606b, 1).fillRect(4, 9, 8, 6); // box body
    g.fillStyle(0x3a3f47, 1).fillRect(1, 4, 14, 3); // lid tilted off / ajar
    g.generateTexture(ChunkedWorldScene.PRESENT_TEXTURE_OPEN, 16, 16);
    g.destroy();
  }

  private spawnPresentInteractables(): void {
    this.destroyPresentInteractableSprites();
    this.ensurePresentTextures();
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "present") {
        continue;
      }
      const opened = this.overworldInteractableOpened(entry);
      const choice = this.presentSpriteTextureChoice(entry, opened);
      this.logPresentSpriteTextureIssue(entry, choice.issue);
      const sprite = this.add
        .image(entry.worldPixel.x, entry.worldPixel.y, choice.textureKey)
        .setOrigin(0.5, 1);
      sprite.setVisible(choice.visible && this.worldPointInsideActiveRoom(entry.worldPixel));
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
      const choice = this.presentSpriteTextureChoice(entry, opened);
      this.logPresentSpriteTextureIssue(entry, choice.issue);
      sprite.setTexture(choice.textureKey);
      sprite.setVisible(choice.visible && this.worldPointInsideActiveRoom(entry.worldPixel));
      this.setActorSortDepth(sprite);
    }
  }

  private presentSpriteTextureChoice(
    entry: Extract<OverworldInteractable, { kind: "present" }>,
    opened: boolean
  ) {
    return resolvePresentSpriteTexture(entry, {
      opened,
      storyItems: this.data_.storyItems,
      textureExists: (textureKey) => this.textures.exists(textureKey),
      genericClosedTexture: ChunkedWorldScene.PRESENT_TEXTURE_CLOSED,
      genericOpenTexture: ChunkedWorldScene.PRESENT_TEXTURE_OPEN
    });
  }

  private logPresentSpriteTextureIssue(
    entry: Extract<OverworldInteractable, { kind: "present" }>,
    issue: PresentSpriteTextureIssue | undefined
  ): void {
    if (!issue) {
      return;
    }
    const key = `${entry.id}:${issue.kind}:${issue.kind === "missingStoryItem" ? issue.storyItemId : issue.textureKey}`;
    if (this.warnedStoryPresentTextureIssues.has(key)) {
      return;
    }
    this.warnedStoryPresentTextureIssues.add(key);
    console.error(presentSpriteTextureIssueMessage(entry.id, issue));
  }

  private destroyPresentInteractableSprites(): void {
    for (const sprite of this.presentInteractableSprites.values()) {
      sprite.destroy();
    }
    this.presentInteractableSprites.clear();
  }

  private spawnExamineInteractableSprites(): void {
    this.destroyExamineInteractableSprites();
    this.ensureMailboxTexture();
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "examine") {
        continue;
      }
      const key = entry.sprite
        ? this.examineInteractableSpriteTextureKey(entry)
        : entry.id === "signal-spawn-mailbox"
          ? ChunkedWorldScene.MAILBOX_TEXTURE
          : undefined;
      if (!key) {
        continue;
      }
      if (!this.textures.exists(key)) {
        continue;
      }
      const sprite = this.add
        .image(entry.worldPixel.x, entry.worldPixel.y, key)
        .setOrigin(0.5, 1);
      sprite.setVisible(this.worldPointInsideActiveRoom(entry.worldPixel));
      this.examineInteractableSprites.set(entry.id, sprite);
      this.setActorSortDepth(sprite);
    }
  }

  private syncExamineInteractableSprites(): void {
    for (const entry of this.data_.overworldInteractables.interactables) {
      if (entry.kind !== "examine" || (!entry.sprite && entry.id !== "signal-spawn-mailbox")) {
        continue;
      }
      const sprite = this.examineInteractableSprites.get(entry.id);
      if (!sprite || !sprite.active) {
        continue;
      }
      sprite.setVisible(this.worldPointInsideActiveRoom(entry.worldPixel));
      this.setActorSortDepth(sprite);
    }
  }

  private destroyExamineInteractableSprites(): void {
    for (const sprite of this.examineInteractableSprites.values()) {
      sprite.destroy();
    }
    this.examineInteractableSprites.clear();
  }

  /** A static, code-native mailbox so the opening clue is visible and never animates. */
  private ensureMailboxTexture(): void {
    if (this.textures.exists(ChunkedWorldScene.MAILBOX_TEXTURE)) {
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0x201926, 1).fillRect(2, 5, 12, 12);
    g.fillStyle(0x6f476b, 1).fillRect(3, 6, 10, 9);
    g.fillStyle(0xa86f91, 1).fillRect(3, 5, 10, 3);
    g.fillStyle(0xe4c3a5, 1).fillRect(5, 9, 6, 1);
    g.fillStyle(0x302534, 1).fillRect(7, 17, 2, 7);
    g.fillStyle(0xc84f5e, 1).fillRect(13, 3, 2, 8);
    g.generateTexture(ChunkedWorldScene.MAILBOX_TEXTURE, 16, 24);
    g.destroy();
  }

  private examineInteractableSpriteTextureKey(entry: Extract<OverworldInteractable, { kind: "examine" }>): string {
    return `swag-examine-${stableAssetPathHash(entry.sprite ?? entry.id)}`;
  }

  private publicAssetUrl(assetPath: string): string {
    return `/${assetPath.replace(/^\/+/, "")}`;
  }

  private spawnSourceCheckActors(): void {
    this.destroySourceCheckActors();
    for (const check of this.data_.sourceChecks.checks) {
      const sprite = this.spawnSourceCheckActor(check);
      const runtime = {
        check,
        sprite,
        visible: false
      };
      this.sourceCheckActors.set(check.id, runtime);
    }
    this.syncSourceCheckActors();
  }

  private spawnSourceCheckActor(check: DrifellaSourceCheck): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
    const key = this.sourceCheckOverworldTextureKey(check);
    const { x, y } = check.placement.worldPixel;
    const sprite = this.textures.exists(key)
      ? this.add.image(x, y, key).setOrigin(0.5, 1)
      : this.add.rectangle(x, y, 12, 24, 0x9aa3b2, 0.9).setOrigin(0.5, 1);
    if ("height" in sprite && sprite.height > 0) {
      sprite.setScale(24 / sprite.height);
    }
    this.setActorSortDepth(sprite);
    return sprite;
  }

  private syncSourceCheckActors(): void {
    for (const runtime of this.sourceCheckActors.values()) {
      const visible = this.sourceCheckActorVisible(runtime.check);
      runtime.visible = visible;
      runtime.sprite.setVisible(visible);
      if (visible) {
        this.setActorSortDepth(runtime.sprite);
      }
    }
  }

  private sourceCheckActorVisible(check: DrifellaSourceCheck): boolean {
    const sequence = this.data_.earlyGameSequence;
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && !openingSourceChecksAllowed(sequence, this.gameFlags)) {
      return false;
    }
    return sourceCheckVisible(check, this.gameFlags)
      && this.worldPointInsideActiveRoom(check.placement.worldPixel);
  }

  private destroySourceCheckActors(): void {
    for (const runtime of this.sourceCheckActors.values()) {
      runtime.sprite.destroy();
    }
    this.sourceCheckActors.clear();
  }

  private sourceCheckOverworldTextureKey(check: DrifellaSourceCheck): string {
    return `source-check-overworld-${check.id}`;
  }

  private sourceCheckOverworldAssetUrl(check: DrifellaSourceCheck): string {
    const override = spriteOverrideForNpcId(this.data_.spriteOverrides, check.npcId);
    if (override) {
      return spriteOverrideAssetUrl(override.image);
    }
    return `/assets/swagbound/overworld-npc/${check.drifellaId}.png`;
  }

  private sourceCheckSession(): SourceCheckSessionState {
    const value = this.registry.get(SOURCE_CHECK_SESSION_REGISTRY_KEY) as Partial<SourceCheckSessionState> | undefined;
    return {
      attempts: { ...(value?.attempts ?? {}) },
      failedAt: { ...(value?.failedAt ?? {}) }
    };
  }

  private setSourceCheckSession(session: SourceCheckSessionState): void {
    this.registry.set(SOURCE_CHECK_SESSION_REGISTRY_KEY, {
      attempts: { ...session.attempts },
      failedAt: { ...session.failedAt }
    });
  }

  private nextSourceCheckAttempt(checkId: string): number {
    const session = this.sourceCheckSession();
    const next = Math.max(0, Math.floor(session.attempts[checkId] ?? 0)) + 1;
    session.attempts[checkId] = next;
    this.setSourceCheckSession(session);
    return next;
  }

  private sourceCheckRetryGated(check: DrifellaSourceCheck): boolean {
    return this.sourceCheckRetryDistance(check) !== undefined;
  }

  private sourceCheckRetryDistance(check: DrifellaSourceCheck): number | undefined {
    const failedAt = this.sourceCheckSession().failedAt[check.id];
    if (!failedAt) {
      return undefined;
    }
    const distance = Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, failedAt.x, failedAt.y);
    return sourceCheckCanRetry(distance, SOURCE_CHECK_RETRY_DISTANCE_PX) ? undefined : distance;
  }

  private refreshSourceCheckSessionGates(): void {
    const session = this.sourceCheckSession();
    let changed = false;
    for (const [checkId, failedAt] of Object.entries(session.failedAt)) {
      const distance = Phaser.Math.Distance.Between(this.playerState.x, this.playerState.y, failedAt.x, failedAt.y);
      if (sourceCheckCanRetry(distance, SOURCE_CHECK_RETRY_DISTANCE_PX)) {
        delete session.failedAt[checkId];
        changed = true;
      }
    }
    if (changed) {
      this.setSourceCheckSession(session);
    }
  }

  private readInput(): MoveInput {
    // Don't walk the player while typing into a dev input (note capture, force-encounter box).
    if (this.shouldIgnoreWorldHotkey()) {
      return { left: false, right: false, up: false, down: false };
    }
    return {
      left: Boolean(this.cursors?.left?.isDown || this.keys?.A?.isDown || this.gamepadHeld.left),
      right: Boolean(this.cursors?.right?.isDown || this.keys?.D?.isDown || this.gamepadHeld.right),
      up: Boolean(this.cursors?.up?.isDown || this.keys?.W?.isDown || this.gamepadHeld.up),
      down: Boolean(this.cursors?.down?.isDown || this.keys?.S?.isDown || this.gamepadHeld.down)
    };
  }

  private shouldIgnoreWorldHotkey(): boolean {
    if (typeof document === "undefined") {
      return false;
    }
    const active = document.activeElement as HTMLElement | null;
    return Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable));
  }

  /**
   * SNES gamepad support. Polls the browser Gamepad API and translates it to the same
   * actions the keyboard drives: D-pad/stick -> movement + 2D menu cursor, A/B confirm/
   * cancel, Start menu, Select save, Y bike, X map, L/R rotate the party lead. While a DOM
   * overlay (Map/Journal/Party) is up, directions + confirm/cancel are forwarded to it as
   * synthetic key events so the same code path drives it. Called once per update().
   */
  private pollGamepad(): void {
    const getPads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
      ? navigator.getGamepads.bind(navigator)
      : undefined;
    const pad = getPads ? pickActiveGamepad([...getPads()]) : undefined;
    if (!pad) {
      this.gamepadHeld = NO_HELD_DIRECTION;
      this.gamepadTracker.reset();
      return;
    }
    const frame = this.gamepadTracker.tick(gamepadButtonStates(pad), gamepadDirections(pad), this.time.now);
    const overlayOpen = this.anyDomOverlayOpen();
    // Movement only flows in the field: not in a menu, dialogue choice, or a DOM overlay.
    this.gamepadHeld = overlayOpen || this.menuState.open || this.dialogue.choice ? NO_HELD_DIRECTION : frame.held;

    if (overlayOpen) {
      for (const dir of frame.directionEdges) {
        this.dispatchSyntheticKey(directionToKeyCode(dir));
      }
      for (const action of frame.pressedActions) {
        if (action === "confirm") {
          this.dispatchSyntheticKey("KeyZ");
        } else if (action === "cancel" || action === "menu") {
          this.dispatchSyntheticKey("KeyX");
        }
      }
      return;
    }

    for (const action of frame.pressedActions) {
      this.handleGamepadAction(action);
    }
    if (this.menuState.open || this.dialogue.choice) {
      for (const dir of frame.directionEdges) {
        const { dx, dy } = directionToDelta(dir);
        this.moveMenuDirectional(dx, dy);
      }
    }
  }

  private anyDomOverlayOpen(): boolean {
    return Boolean(this.teleportMenu?.isOpen() || this.questJournal?.isOpen() || this.partyOrderMenu?.isOpen());
  }

  private handleGamepadAction(action: GamepadAction): void {
    switch (action) {
      case "confirm":
        this.handleConfirm();
        return;
      case "cancel":
        this.handleCancel();
        return;
      case "menu":
        if (this.menuState.open) {
          this.cancelCommandMenu();
        } else {
          this.openCommandMenu();
        }
        return;
      case "save":
        if (!this.menuState.open) {
          this.handleSaveKey();
        }
        return;
      case "bike":
        if (!this.menuState.open) {
          this.toggleBike();
        }
        return;
      case "map":
        if (this.isPlayerControllable() && !this.bikeActive) {
          this.teleportMenu?.openOverlay();
        }
        return;
      case "partyPrev":
        this.cyclePartyLead(-1);
        return;
      case "partyNext":
        this.cyclePartyLead(1);
        return;
    }
  }

  /** Rotate which hero leads (front of the march + first command slot). L/R on the pad. */
  private cyclePartyLead(direction: number): void {
    if (!this.isPlayerControllable() || this.menuState.open) {
      return;
    }
    const order = this.partyState.party();
    if (order.length < 2) {
      return;
    }
    const shift = direction >= 0 ? 1 : order.length - 1;
    const rotated = order.map((_, index) => order[(index + shift) % order.length]);
    this.partyState.reorder(rotated);
    this.handlePartyCompositionChanged();
    this.playMenuSfx("menuMove");
  }

  private dispatchSyntheticKey(code: string): void {
    if (typeof window === "undefined" || typeof KeyboardEvent === "undefined") {
      return;
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
  }

  // --- Dev tools (dev-server only; wired from the DevConsole hub) ------------------

  private buildDevConsoleHost(): DevConsoleHost {
    return {
      liveState: () => this.devLiveState(),
      trackLabVisible: () => isMusicAuditionerVisible(),
      toggleTrackLab: () => { toggleMusicAuditioner(); },
      annotateMode: () => this.devAnnotateMode,
      toggleAnnotate: () => { this.devAnnotateMode = !this.devAnnotateMode; },
      encountersEnabled: () => this.encounterEnabled,
      toggleEncounters: () => { this.encounterEnabled = !this.encounterEnabled; },
      instantWin: () => this.devInstantWin,
      toggleInstantWin: () => { this.devInstantWin = !this.devInstantWin; },
      forceEncounter: (group) => { this.forceEncounter(group, this.devInstantWin ? "instantWin" : undefined); },
      dialogueOpen: () => this.dialogue.open,
      captureDialogueNote: () => this.devCaptureDialogueNote(),
      noteCount: () => this.devNoteCount
    };
  }

  private devLiveState(): DevLiveState {
    const state = this.playerState;
    const ctx = this.devCoordContext(state.x, state.y);
    const pointer = this.input?.activePointer;
    const overPointer = Boolean(pointer && pointer.isDown === false && (pointer.worldX !== 0 || pointer.worldY !== 0));
    return {
      x: state.x,
      y: state.y,
      tileX: ctx.tileX,
      tileY: ctx.tileY,
      sector: ctx.sector,
      area: ctx.area,
      town: ctx.town,
      facing: state.facing,
      bike: this.bikeActive,
      mouseX: pointer && overPointer ? pointer.worldX : (pointer?.worldX ?? null),
      mouseY: pointer && overPointer ? pointer.worldY : (pointer?.worldY ?? null)
    };
  }

  private devCoordContext(x: number, y: number): {
    tileX: number; tileY: number; chunkX: number | null; chunkY: number | null; sector: number | null; area: number | null; town: string | null;
  } {
    const tileSize = this.world_?.tileSize ?? 8;
    const sectors = this.world_?.sectors;
    const sector = sectors ? sectorCoordForWorldPixel({ x, y }, sectors) : undefined;
    const sectorIndex = sector?.index ?? null;
    const rawArea = sectorIndex !== null && sectors?.areaIds ? sectors.areaIds[sectorIndex] ?? null : null;
    const chunk = this.world_ ? chunkForWorldPixel({ x, y }, this.grid()) : undefined;
    // EB area ids are small; guard against out-of-range/packed sentinels so notes stay clean.
    const area = typeof rawArea === "number" && rawArea >= 0 && rawArea < 100000 ? rawArea : null;
    return {
      tileX: Math.floor(x / tileSize),
      tileY: Math.floor(y / tileSize),
      chunkX: chunk?.cx ?? null,
      chunkY: chunk?.cy ?? null,
      sector: sectorIndex,
      area,
      town: this.devTownAt(x, y)
    };
  }

  private devTownAt(x: number, y: number): string | null {
    let best: string | null = null;
    let bestDist = TELEPORT_VISIT_RADIUS_PX;
    for (const town of TELEPORT_TOWNS) {
      const dist = Math.hypot(town.x - x, town.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = town.name;
      }
    }
    return best;
  }

  private handleDevPointer(pointer: Phaser.Input.Pointer): void {
    this.devPointerDowns += 1;
    const shift = Boolean((pointer.event as MouseEvent | undefined)?.shiftKey);
    const x = pointer.worldX;
    const y = pointer.worldY;
    this.lastDevWorld = { x: Math.round(x), y: Math.round(y) };
    if (shift) {
      this.warpPlayerToWorldPixel({ x, y });
      this.publish();
      return;
    }
    if (this.devAnnotateMode) {
      this.devCaptureCoordNote(x, y);
    }
  }

  private devCaptureCoordNote(x: number, y: number): void {
    const ctx = this.devCoordContext(x, y);
    this.dropDevPin(x, y);
    const label = `pin @ ${Math.round(x)},${Math.round(y)} · ${ctx.town ?? `sector ${ctx.sector ?? "?"}`}`;
    const context: DevNoteContext = { kind: "coord", x, y, ...ctx };
    this.devConsole?.beginNoteCapture(label, (text) => this.devSaveNote(text, context));
  }

  private devCaptureDialogueNote(): void {
    if (!this.dialogue.open) {
      return;
    }
    const line = this.dialogue.currentText ?? "";
    const npcId = this.interactionTarget()?.id ?? null;
    const context: DevNoteContext = { kind: "dialogue", x: this.playerState.x, y: this.playerState.y, npcId, dialogue: line };
    this.devConsole?.beginNoteCapture(`dialogue: "${line.slice(0, 40)}${line.length > 40 ? "…" : ""}"`, (text) => this.devSaveNote(text, context));
  }

  private devSaveNote(text: string, context: DevNoteContext): void {
    void postDevNote({ note: text, context }).then((ok) => {
      if (ok) {
        this.devNoteCount += 1;
      }
    });
  }

  private devFileQuickAnnotation(note: string, label: string): void {
    if (this.shouldIgnoreWorldHotkey() || !this.isPlayerControllable() || this.anyDomOverlayOpen()) {
      return;
    }
    const x = this.playerState.x;
    const y = this.playerState.y;
    const context: DevNoteContext = { kind: "coord", x, y, ...this.devCoordContext(x, y) };
    this.dropDevPin(x, y);
    this.devSaveNote(note, context);
    this.showDevToast(`filed: ${label} @${Math.round(x)},${Math.round(y)}`);
  }

  private showDevToast(message: string): void {
    this.devToastText = message;
    this.devToastUntilMs = this.time.now + 1400;
    this.updatePrompt();
    this.publish();
  }

  private dropDevPin(x: number, y: number): void {
    const pins = this.devPinData();
    const n = pins.reduce((max, pin) => Math.max(max, pin.n), 0) + 1;
    const pin = { x, y, n };
    this.registry.set(DEV_PINS_REGISTRY_KEY, [...pins, pin]);
    this.renderDevPin(pin);
  }

  private devPinData(): DevPinData[] {
    const value = this.registry.get(DEV_PINS_REGISTRY_KEY);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((pin): pin is DevPinData =>
      typeof pin?.x === "number" && typeof pin?.y === "number" && typeof pin?.n === "number"
    );
  }

  private renderDevPinsFromRegistry(): void {
    this.destroyDevPins();
    for (const pin of this.devPinData()) {
      this.renderDevPin(pin);
    }
  }

  private renderDevPin({ x, y, n }: DevPinData): void {
    const dot = this.add.circle(0, 0, 5, 0xffd23f).setStrokeStyle(1, 0x000000);
    const label = this.add.text(7, -7, String(n), { fontSize: "12px", color: "#ffd23f" }).setStroke("#000000", 3);
    const pin = this.add.container(x, y, [dot, label]).setDepth(120000);
    this.devPins.push(pin);
  }

  private destroyDevPins(): void {
    for (const pin of this.devPins) {
      pin.destroy();
    }
    this.devPins = [];
  }

  private registerTransitionSfxResume(): void {
    const resume = () => {
      this.transitionSfx.resume();
      this.openingSfx.resume();
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

  private npcMovementStepBlocked(npc: NpcRuntime, x: number, y: number): boolean {
    if (this.pointOutsideCollisionGrid(x, y)) {
      return true;
    }
    const home = npc.movementHome;
    if (home && home.componentId !== 0 && this.nearestNavmeshComponentId(x, y, 1) !== home.componentId) {
      return true;
    }
    return this.blocked(x, y, {
      ignoreNpcId: npc.data.npcId,
      includePlayer: true,
      includeNpcs: true
    });
  }

  private pointOutsideCollisionGrid(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y) || this.collisionCellSize <= 0) {
      return true;
    }
    const cellX = Math.floor(x / this.collisionCellSize);
    const cellY = Math.floor(y / this.collisionCellSize);
    return cellX < 0 || cellY < 0 || cellX >= this.collisionWidth || cellY >= this.collisionHeight;
  }

  private nearestNavmeshComponentId(x: number, y: number, maxRadiusCells: number): number {
    return this.navmesh ? (nearestComponentAt(this.navmesh, { x, y }, maxRadiusCells)?.componentId ?? 0) : 0;
  }

  private blocked(x: number, y: number, options: BlockedOptions = {}): boolean {
    if (this.surfaceBlocked(x, y) && !(options.allowLadderTerrain && this.footprintSolidsAreLadder(x, y))) {
      return true;
    }
    if (this.barrierBlocks(x, y)) {
      return true;
    }
    if ((options.includeNpcs ?? true) && this.presentInteractableBlocks(x, y, options.escapeOverlapAt)) {
      return true;
    }
    if (options.includePlayer && this.player && actorBodyBlocked(x, y, this.playerState.x, this.playerState.y)) {
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
        // it block - otherwise a co-located NPC walls off every direction at once.
        if (
          options.escapeOverlapAt &&
          actorBodyBlocked(options.escapeOverlapAt.x, options.escapeOverlapAt.y, npc.state.player.x, npc.state.player.y)
        ) {
          continue;
        }
        if (actorBodyBlocked(x, y, npc.state.player.x, npc.state.player.y)) {
          return true;
        }
      }
      const sourceCheckBodies = [...this.sourceCheckActors.values()].flatMap((runtime) => {
        const worldPixel = runtime.check.placement?.worldPixel;
        return runtime.visible
          && runtime.check.npcId !== options.ignoreNpcId
          && isActorBodyPoint(worldPixel)
          && this.worldPointInsideActiveRoom(worldPixel)
          ? [worldPixel]
          : [];
      });
      if (actorsBlockingAt(x, y, sourceCheckBodies, options.escapeOverlapAt)) {
        return true;
      }
      // Boss gates are intentionally NOT solid: they are triggers meant to be
      // walked into, and their battle-contact radius (BOSS_GATE_CONTACT_PX) equals
      // the actor body half-width, so solidity would block the player one pixel
      // short of contact and the fight would never start.
    }
    return false;
  }

  private surfaceBlocked(x: number, y: number): boolean {
    return !this.walkableFootprint({ x, y });
  }

  /**
   * Climbability check for a vertical move. EB ladder columns come in two data
   * flavors (0x10 walkable, 0x90 over solid cliff) and are often a single 8px
   * cell - narrower than the 13px foot box, whose corners always clip the
   * flanking cliff. A vertical try is climbable when the FEET COLUMN (feet cell
   * + the cell under the box's top edge) is ladder-flagged: any solid cell in
   * the column must itself be a ladder, and at least one column cell must carry
   * the flag (otherwise it's a plain wall squeeze and normal collision stands).
   * While climbing, the wide box may overhang the flanking rock - matching EB.
   */
  private footprintSolidsAreLadder(x: number, y: number): boolean {
    const grid = this.collisionGrid();
    const cellX = Math.floor(x / grid.cellSize);
    // Top edge, feet, and one row below the feet: the extra row lets the player
    // mount the ladder from the summit and step off at the top, where EB's
    // leading-edge-only collision is more permissive than our four corners.
    const rows = [
      Math.floor((y + PLAYER_FOOT_BOX.top) / grid.cellSize),
      Math.floor(y / grid.cellSize),
      Math.floor(y / grid.cellSize) + 1
    ];
    let sawLadder = false;
    for (const cellY of rows) {
      if (cellX < 0 || cellY < 0 || cellX >= grid.width || cellY >= grid.height) {
        return false;
      }
      const laddered = isLadderSurface(surfaceAtCell(this.surfaceRows, cellX, cellY));
      if (solidAtCell(this.solidRows, cellX, cellY) && !laddered) {
        return false;
      }
      if (laddered) {
        sawLadder = true;
      }
    }
    return sawLadder;
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
        actorBodyBlocked(escapeOverlapAt.x, escapeOverlapAt.y, entry.worldPixel.x, entry.worldPixel.y)
      ) {
        continue;
      }
      if (actorBodyBlocked(x, y, entry.worldPixel.x, entry.worldPixel.y)) {
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
      this.activeDoors(),
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
        this.activeDoors(),
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
    const sequence = this.data_.earlyGameSequence;
    const entryIsOutdoors = !isInteriorMusicSector(this.world_.sectors, result.door.worldPixel);
    if (openingNightDoorLocked(sequence, this.gameFlags, result.door.worldPixel, entryIsOutdoors)) {
      this.openOpeningNightLockedDoorDialogue();
      return true;
    }
    this.applyDoorWarp({
      x: result.door.destinationWorldPixel.x,
      y: result.door.destinationWorldPixel.y,
      worldPixel: result.door.destinationWorldPixel,
      direction: result.door.direction
    }, {
      kind: transitionKindForDoorType(result.door.type),
      style: result.door.style,
      triggerWorldPixel: result.door.worldPixel
    });
    return true;
  }

  private openOpeningNightLockedDoorDialogue(): void {
    lockPlayer(this.playerState, this.playerFrames);
    this.startOverriddenScriptedDialogue(
      buildInlineDialoguePages(["It's locked."]),
      () => this.afterDialogueClosed()
    );
    this.updatePrompt();
    this.publish();
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
    const speed = dx !== 0 && dy !== 0 ? PLAYER_DIAGONAL_SPEED : PLAYER_SPEED;
    const step = (speed * deltaMs) / 1000;
    const bounds = this.movementBounds();
    return {
      x: clamp(this.playerState.x + dx * step, bounds.minX, bounds.maxX),
      y: clamp(this.playerState.y + dy * step, bounds.minY, bounds.maxY)
    };
  }

  private applyDoorWarp(destination: EventWarpDestination, options: DoorWarpOptions = {}): void {
    const alignToDoors = options.kind === "door" || options.kind === "stairway" || options.kind === "escalator";
    const landing = this.resolveWalkableWarpPoint(destination.worldPixel ?? destination, alignToDoors);
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
    landing: DoorWarpLanding,
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
    this.openingRoamerHold = false;
    this.clearStartupPajamaVisualState();
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
    // Now that the destination's NPCs are streamed in and room bounds are
    // current, nudge the player off any actor body the authored landing sits
    // on (e.g. a story NPC posted beside a door). Map-only landings are
    // untouched; without this the player arrives drawn on top of the NPC.
    // Destination NPC runtimes can spawn a frame late, so update() retries.
    this.escapeArrivalActorOverlap();
    this.arrivalEscapeTicks = 12;
    this.syncOverworldMusicCue();
    this.cameras.main.centerOn(this.playerState.x, this.playerState.y);
    this.updateCameraRoomBounds();
    return true;
  }

  /**
   * Door-arrival visual clearance: movement collision (actorBodyBlocked) is a
   * point-in-box test, so a landing 15-27px from an NPC is "passable" yet the
   * two 16-24px sprites are drawn on top of each other. For arrivals only,
   * demand box-vs-box separation from every visible actor body, and ring-search
   * the nearest map-walkable point that has it. Clear landings are a no-op.
   */
  private arrivalVisualBodies(): { x: number; y: number }[] {
    const bodies: { x: number; y: number }[] = [];
    for (const npc of this.npcRuntimes.values()) {
      if (!this.isNpcVisible(npc.data) || !this.npcInsideActiveRoom(npc)) {
        continue;
      }
      bodies.push({ x: npc.state.player.x, y: npc.state.player.y });
    }
    for (const runtime of this.sourceCheckActors.values()) {
      const worldPixel = runtime.check.placement?.worldPixel;
      if (runtime.visible && isActorBodyPoint(worldPixel) && this.worldPointInsideActiveRoom(worldPixel)) {
        bodies.push({ x: worldPixel.x, y: worldPixel.y });
      }
    }
    return bodies;
  }

  private static arrivalBodiesOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return (
      Math.abs(a.x - b.x) < ACTOR_BODY_HALF_WIDTH * 2 &&
      Math.abs(a.y - b.y) < ACTOR_BODY_TOP + ACTOR_BODY_BOTTOM
    );
  }

  private escapeArrivalActorOverlap(): void {
    const { x, y } = this.playerState;
    const bodies = this.arrivalVisualBodies();
    const clearOf = (p: { x: number; y: number }): boolean =>
      bodies.every((body) => !ChunkedWorldScene.arrivalBodiesOverlap(p, body));
    if (clearOf({ x, y }) && !this.blocked(x, y)) {
      return;
    }
    const step = this.collisionCellSize > 0 ? this.collisionCellSize : 8;
    for (let ring = 1; ring <= 5; ring += 1) {
      let best: { x: number; y: number; distanceSq: number } | undefined;
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
            continue;
          }
          const candidate = { x: x + dx * step, y: y + dy * step };
          if (this.blocked(candidate.x, candidate.y) || !clearOf(candidate)) {
            continue;
          }
          const distanceSq = (candidate.x - x) ** 2 + (candidate.y - y) ** 2;
          if (!best || distanceSq < best.distanceSq) {
            best = { ...candidate, distanceSq };
          }
        }
      }
      if (best) {
        this.playerState.x = best.x;
        this.playerState.y = best.y;
        if (this.player) {
          this.player.x = best.x;
          this.player.y = best.y;
          this.setActorSortDepth(this.player);
        }
        return;
      }
    }
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
      const transition = beginMapTransition(options.kind ?? "door", options.style);
      if (!isMapTransitionActive(transition.state)) {
        return false;
      }
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
    overlay.clear();
    overlay.setVisible(active);
    if (active) {
      drawMapTransitionOverlay(
        overlay,
        transitionOverlayState(this.doorTransitionState),
        this.scale.width,
        this.scale.height
      );
    }
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
    this.doorFadeOverlay?.clear();
    this.doorFadeOverlay?.setVisible(false);
    this.doorFadePhase = "none";
    if (this.canReleaseDoorFadeLock()) {
      unlockPlayer(this.playerState);
    }
    this.publish();
  }

  private ensureDoorFadeOverlay(): Phaser.GameObjects.Graphics {
    if (this.doorFadeOverlay) {
      return this.doorFadeOverlay;
    }
    this.doorFadeOverlay = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(DOOR_FADE_OVERLAY_DEPTH)
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
      ...[...this.sourceCheckActors.values()]
        .filter((runtime) => runtime.visible)
        .map((runtime) => ({
          id: runtime.check.npcId,
          key: `source-check:${runtime.check.id}`,
          targetKind: "sourceCheck" as const,
          sourceCheckId: runtime.check.id,
          npcId: runtime.check.npcId,
          label: drifellaDisplayName(runtime.check),
          x: runtime.check.placement.worldPixel.x,
          y: runtime.check.placement.worldPixel.y,
          interactable: true
        })),
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

  /** True while a scripted cinematic owns the screen (the new-game night flyover and the
   * bedroom wake-up that follows it); the uiScene reads this to suppress the gameplay HUD. */
  cinematicActive(): boolean {
    return (
      this.flyoverActive ||
      this.meadowDreamActive_ ||
      (this.startupRunActive && this.startupMode === "opening")
    );
  }

  private updatePrompt(): void {
    if (this.time.now < this.devToastUntilMs && !this.menuState.open && !this.dialogue.open && !this.dialogue.choice) {
      this.prompt = this.devToastText;
      return;
    }
    if (this.time.now < this.recruitNoticeUntilMs && !this.menuState.open && !this.dialogue.open && !this.dialogue.choice) {
      this.prompt = this.recruitNoticeText;
      return;
    }
    if (this.time.now < this.autosaveNoticeUntilMs && !this.menuState.open && !this.dialogue.open && !this.dialogue.choice) {
      this.prompt = "✦ Autosaved (town reached)";
      return;
    }
    const target = this.interactionTarget();
    if (this.dialogue.choice) {
      this.prompt = "Arrows: choose | Z: select | X: No";
    } else if (this.menuState.open) {
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
    if (this.binderOverlayOpen) {
      return;
    }
    if (this.dialogue.choice) {
      this.confirmDialogueChoice();
      return;
    }
    if (this.menuState.open) {
      this.confirmCommandMenu();
      return;
    }
    this.handleAdvance();
  }

  private handleCancel(): void {
    if (this.binderOverlayOpen) {
      return;
    }
    if (this.dialogue.choice) {
      this.cancelDialogueChoice();
      return;
    }
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
      // No Talk attempts while a cinematic owns the screen (the opening flyover is
      // tween-driven, so neither the event sequence nor the cutscene runner covers it).
      if (this.cinematicActive()) {
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
    if (
      this.menuState.open ||
      this.dialogue.open ||
      this.eventSequence?.running ||
      this.cutsceneRunner?.running ||
      this.binderOverlayOpen ||
      // The opening flyover locks movement but is not an event sequence or cutscene,
      // so without this the pause menu opens mid-cinematic (found by the 2026-07-09
      // verification run: the M probe drew the full menu over the night pan).
      this.cinematicActive() ||
      this.isDoorFadeActive() ||
      Boolean(this.pendingBattleStart)
    ) {
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

  private moveMenuDirectional(dx: number, dy: number): void {
    if (this.dialogue.choice) {
      const before = this.dialogue.choice.selectedIndex;
      const delta = dy !== 0 ? dy : dx;
      if (delta !== 0) {
        this.dialogue.moveChoice(delta);
        if (this.dialogue.choice.selectedIndex !== before) {
          this.playMenuSfx("menuMove");
        }
      }
      this.updatePrompt();
      this.publish();
      return;
    }
    if (!this.menuState.open) {
      return;
    }
    const before = this.menuDebugState();
    this.menuState = moveMenu2D(this.menuState, dx, dy, {
      screenById: (id) => this.menuScreens.get(id)
    });
    const after = this.menuDebugState();
    if (before.cursorIndex !== after.cursorIndex || before.currentItemId !== after.currentItemId) {
      this.playMenuSfx("menuMove");
    }
    this.publish();
  }

  private confirmDialogueChoice(): void {
    const selectedIndex = this.dialogue.selectedChoiceIndex();
    if (selectedIndex === undefined) {
      return;
    }
    this.playMenuSfx("menuConfirm");
    this.eventSequence?.choose(selectedIndex);
    this.updatePrompt();
    this.publish();
  }

  private cancelDialogueChoice(): void {
    const choice = this.dialogue.choice;
    if (!choice) {
      return;
    }
    const noIndex = choice.options.findIndex((option) => option.label.trim().toLowerCase() === "no");
    this.playMenuSfx("menuCancel");
    this.eventSequence?.choose(noIndex >= 0 ? noIndex : choice.options.length - 1);
    this.updatePrompt();
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
    // Swagbound system tiles: close the command menu, hand off to the DOM overlay
    // (same overlays the T/J/K hotkeys open). The overlay owns its own input + close.
    if (actionId === MAP_MENU_ACTION_ID) {
      this.closeMenu();
      this.teleportMenu?.openOverlay();
      return;
    }
    if (actionId === PARTY_MENU_ACTION_ID) {
      this.closeMenu();
      this.partyOrderMenu?.openOverlay();
      return;
    }
    if (actionId === JOURNAL_MENU_ACTION_ID) {
      this.closeMenu();
      this.questJournal?.openOverlay();
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
    if (action.kind === "psiUse") {
      this.handlePsiUseAction(action);
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
    if (action.kind === "binderCard") {
      this.handleBinderCardAction(action.cardId);
      return;
    }
    if (action.kind !== "equip") {
      this.showMenuResult("Nothing happened.");
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
    if (isKeyItemId(action.itemId, this.data_.keyItems)) {
      this.showMenuResult("The record keeps this one.");
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
    const owner = this.partyMemberById(action.ownerChar);
    const target = this.partyMemberById(action.targetChar);
    if (!item || this.partyState.inventory(action.ownerChar)[action.inventorySlot] !== action.itemId) {
      this.showMenuResult("You can't use that.");
      return;
    }
    const row = itemUsability(this.data_.usabilityMatrix, item.id);
    if (!row?.fieldUse) {
      this.showMenuResult(USABILITY_REFUSAL_MESSAGE);
      return;
    }
    if (item.id === ORIGINAL_MIXTAPE_ITEM_ID) {
      const collected = collectedEightSourcesCount((flag) => this.gameFlags.has(flag));
      this.showMenuResult(originalMixtapeFieldMessage(collected));
      if (collected > 0) {
        this.playOriginalMixtapePreview();
      }
      return;
    }
    const condimentResult = this.partyState.combineCondiment({
      ownerChar: action.ownerChar,
      condimentItemId: action.itemId,
      condimentSlot: action.inventorySlot,
      pairs: this.data_.condimentPairs
    });
    if (condimentResult.ok) {
      const base = this.itemById(condimentResult.baseItemId);
      this.showMenuResult(fieldCondimentUseMessage(
        owner ?? target ?? { name: "Someone" },
        item,
        base ?? { name: `item ${condimentResult.baseItemId}` },
        condimentResult
      ));
      return;
    }
    const result = this.partyState.useItem({
      ownerChar: action.ownerChar,
      targetChar: action.targetChar,
      inventorySlot: action.inventorySlot,
      item,
      targetVitals: vitalsForPartyMember(target),
      fieldUse: row.fieldUse
    });
    if (result.ok) {
      this.showMenuResult(fieldItemUseMessage(target ?? owner ?? { name: "Someone" }, item, row, result));
      return;
    }
    if (result.reason === "notConsumable" || result.reason === "unknownEffect") {
      this.showMenuResult(fieldItemToolMessage(owner ?? target ?? { name: "Someone" }, item, row));
      return;
    }
    this.showMenuResult(result.reason === "notFieldUsable" ? USABILITY_REFUSAL_MESSAGE : "You can't use that.");
  }

  private playOriginalMixtapePreview(): void {
    this.mixtapeRestoreTimer?.remove(false);
    void this.music.play(ORIGINAL_MIXTAPE_MUSIC_CUE);
    this.mixtapeRestoreTimer = this.time.delayedCall(20000, () => {
      this.mixtapeRestoreTimer = undefined;
      this.syncOverworldMusicCue(true);
    });
  }

  private handlePsiUseAction(action: Extract<ReturnType<typeof parseMenuAction>, { kind: "psiUse" }>): void {
    const psi = this.psiById(action.psiId);
    const caster = this.partyMemberById(action.casterChar);
    const target = this.partyMemberById(action.targetChar) ?? caster;
    const row = psiUsability(this.data_.usabilityMatrix, action.psiId);
    if (!psi || !caster || !target || !row?.fieldUse) {
      this.showMenuResult(USABILITY_REFUSAL_MESSAGE);
      return;
    }
    const result = this.partyState.useFieldPsi({
      casterChar: action.casterChar,
      targetChar: action.targetChar,
      ppCost: row.ppCost,
      effect: fieldPsiEffect(psi),
      casterVitals: vitalsForPartyMember(caster),
      targetVitals: vitalsForPartyMember(target)
    });
    if (result.ok) {
      this.showMenuResult(fieldPsiUseMessage(caster, target, psi, result));
      return;
    }
    this.showMenuResult(result.reason === "insufficientPp" ? "Not enough PP." : USABILITY_REFUSAL_MESSAGE);
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

  private handleBinderCardAction(cardId: string): void {
    const card = cardById(this.data_.cardNfts, cardId);
    if (!card || !this.gameFlags.has(cardOwnedFlag(card.id))) {
      this.playMenuSfx("menuCancel");
      this.updatePrompt();
      this.publish();
      return;
    }
    this.menuState = closedMenu();
    this.activeShopStoreId = undefined;
    this.activeService = undefined;
    this.showBinderCardOverlay(card);
  }

  private showBinderCardOverlay(card: CardNft): void {
    this.binderOverlayOpen = true;
    lockPlayer(this.playerState, this.playerFrames);
    const ui = this.scene.get("ui") as {
      showBinderCardOverlay?: (card: { id: string; name: string; image: string; caption: string }, onClose: () => void) => void;
    } | undefined;
    if (!ui?.showBinderCardOverlay) {
      this.binderOverlayOpen = false;
      unlockPlayer(this.playerState);
      this.updatePrompt();
      this.publish();
      return;
    }
    ui.showBinderCardOverlay(card, () => {
      // Release on the next world tick so the Z that closes the UI overlay
      // cannot also open an interaction behind it in the same key dispatch.
      this.time.delayedCall(0, () => {
        this.binderOverlayOpen = false;
        if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running) {
          unlockPlayer(this.playerState);
        }
        this.updatePrompt();
        this.publish();
      });
    });
    this.updatePrompt();
    this.publish();
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.data_.items?.items.find((item) => item.id === itemId);
  }

  private psiById(psiId: number) {
    return this.data_.psi?.psi.find((psi) => psi.id === psiId);
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
      keyItems: this.data_.keyItems,
      usabilityMatrix: this.data_.usabilityMatrix,
      psi: this.data_.psi,
      shops: this.data_.shops,
      cardNfts: this.data_.cardNfts,
      archivistSpots: this.data_.archivistSpots,
      flags: this.gameFlags,
      currentObjectiveText: this.currentObjectiveText(),
      partyState: this.partyState,
      resolver
    });
    if (this.activeShopStoreId !== undefined) {
      screens.push(...buildShopMenuScreens(buildShopViewModel({
        characters: this.data_.characters,
        items: this.data_.items,
        keyItems: this.data_.keyItems,
        usabilityMatrix: this.data_.usabilityMatrix,
        shops: this.data_.shops,
        cardNfts: this.data_.cardNfts,
        archivistSpots: this.data_.archivistSpots,
        flags: this.gameFlags,
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
        keyItems: this.data_.keyItems,
        cardNfts: this.data_.cardNfts,
        flags: this.gameFlags,
        partyState: this.partyState,
        resolver
      }));
    } else if (this.activeService?.kind === "shop-equip") {
      screens.push(buildShopEquipPromptScreen(this.activeService));
    }
    this.menuScreens = new Map(screens.map((screen) => [screen.id, screen]));
  }

  private openingObjectiveContext(): OpeningObjectiveContext {
    const sequence = this.data_.earlyGameSequence;
    return {
      sequence,
      phase: resolveOpeningPhase(this.gameFlags),
      openingGatesActive: openingGatesActive(sequence, this.gameFlags)
    };
  }

  private currentObjectiveText(): string | undefined {
    return resolveCurrentObjectiveText(this.gameFlags, this.data_.objectives, this.openingObjectiveContext());
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

  /**
   * EB field hazards from the decoded surface flags (docs/collision-semantics.md):
   * desert cells (0x04-alone) can inflict sunstroke - drains HP per step via the
   * shared field tick - and any water (0x08) cools it back off. Deep water (0x0c)
   * also wades at roughly half speed via terrainSpeedMultiplier.
   */
  private applyFieldHazardsForStep(playerSteppedTile: boolean): void {
    if (!playerSteppedTile) {
      return;
    }
    let surface = 0;
    try {
      surface = surfaceAtWorldPixel(this.surfaceRows, { x: this.playerState.x, y: this.playerState.y }, this.collisionGrid());
    } catch {
      return;
    }
    if (isWaterSurface(surface)) {
      let cured = false;
      for (const memberId of this.partyState.party()) {
        if (hasStatus(this.partyState.statuses(memberId), "sunstroke")) {
          this.partyState.cureStatus(memberId, "sunstroke");
          cured = true;
        }
      }
      if (cured) {
        this.refreshMenuScreens();
        this.publish();
      }
      return;
    }
    if (!isSunstrokeSurface(surface) || Math.random() >= SUNSTROKE_CHANCE_PER_STEP) {
      return;
    }
    let inflicted = false;
    for (const memberId of this.partyState.party()) {
      if (!hasStatus(this.partyState.statuses(memberId), "sunstroke")) {
        this.partyState.inflictStatus(memberId, "sunstroke");
        inflicted = true;
      }
    }
    if (inflicted) {
      this.transitionSfx.poisonTick();
      this.refreshMenuScreens();
      this.publish();
    }
  }

  /** Deep water (0x08 + 0x04) wades and ladders (0x10) climb at reduced speed. */
  private terrainSpeedMultiplier(): number {
    try {
      const surface = surfaceAtWorldPixel(this.surfaceRows, { x: this.playerState.x, y: this.playerState.y }, this.collisionGrid());
      if (isLadderSurface(surface)) {
        return LADDER_SPEED_MULTIPLIER;
      }
      return isDeepWaterSurface(surface) ? DEEP_WATER_SPEED_MULTIPLIER : 1;
    } catch {
      return 1;
    }
  }

  /** Mark nearby teleport towns as visited so they appear in the fast-travel menu. */
  private updateTeleportVisited(): void {
    let nearestTown: TeleportTown | null = null;
    let nearestDist = TELEPORT_VISIT_RADIUS_PX;
    for (const town of TELEPORT_TOWNS) {
      const dist = this.distanceToPlayer(town);
      if (dist <= TELEPORT_VISIT_RADIUS_PX) {
        this.teleportVisited.add(town.id);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestTown = town;
        }
      }
    }
    // Autosave when the player walks into a (different) town, so a real
    // playthrough survives without pressing save. Cleared when out of any town
    // so re-entering re-saves.
    if (nearestTown?.id !== this.lastAutosaveTownId) {
      this.lastAutosaveTownId = nearestTown?.id;
      if (nearestTown && this.isPlayerControllable() && this.saveSlots) {
        this.saveGame(false);
        this.showAutosaveNotice();
      }
    }
  }

  private showAutosaveNotice(): void {
    const sequence = this.data_.earlyGameSequence;
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && !openingAutosaveNoticeAllowed(sequence, this.gameFlags)) {
      return;
    }
    this.autosaveNoticeUntilMs = this.time.now + 1600;
    this.publish();
  }

  private autosaveOpeningHome(): void {
    if (this.bootSaveState || !this.saveSlots) {
      return;
    }
    this.saveGame(false);
    this.showAutosaveNotice();
  }

  /** PSI Teleport: spin in place, then arrive at the town. */
  private beginTeleport(town: TeleportTown): void {
    this.forcedVisualState = { ...this.forcedVisualState, teleporting: true };
    this.teleportSpinUntilMs = this.time.now + TELEPORT_SPIN_MS;
    this.playerState.inputLocked = true;
    this.time.delayedCall(TELEPORT_SPIN_MS, () => {
      this.warpPlayerToWorldPixel({ x: town.x, y: town.y });
      const { teleporting: _t, ...rest } = this.forcedVisualState;
      this.forcedVisualState = rest;
      this.playerState.inputLocked = false;
      this.teleportVisited.add(town.id);
      this.publish();
    });
  }

  /** B key: mount/dismount the Swag Cruiser (requires owning item 176, outdoors, dry feet). */
  private toggleBike(): void {
    if (this.bikeActive) {
      this.bikeActive = false;
      this.publish();
      return;
    }
    if (!this.partyHasBicycle() || this.bikeBlockedHere()) {
      return;
    }
    this.bikeActive = true;
    this.publish();
  }

  private partyHasBicycle(): boolean {
    return this.partyState.party().some((memberId) => this.partyState.inventory(memberId).includes(BIKE_ITEM_ID));
  }

  /** No riding indoors, in any water, or on ladder cells. */
  private bikeBlockedHere(): boolean {
    const sectors = this.world_.sectors;
    if (sectors) {
      const scol = Math.floor(this.playerState.x / (sectors.sectorWidthTiles * this.world_.tileSize));
      const srow = Math.floor(this.playerState.y / (sectors.sectorHeightTiles * this.world_.tileSize));
      if (sectors.indoor[srow * sectors.cols + scol]) {
        return true;
      }
    }
    try {
      const surface = surfaceAtWorldPixel(this.surfaceRows, { x: this.playerState.x, y: this.playerState.y }, this.collisionGrid());
      return isWaterSurface(surface) || isLadderSurface(surface);
    } catch {
      return true;
    }
  }

  /** Real onLadder visual-state signal: feet on an EB ladder/stairs cell. */
  private isPlayerOnLadderCell(): boolean {
    try {
      const surface = surfaceAtWorldPixel(this.surfaceRows, { x: this.playerState.x, y: this.playerState.y }, this.collisionGrid());
      return isLadderSurface(surface);
    } catch {
      return false;
    }
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

  private setPartyLevelsDebug(level: number): SetPartyLevelDebugSummary[] {
    const targetLevel = clampDebugPartyLevel(level);
    const activeIds = this.partyState.party();
    const characters = this.data_.characters?.characters;
    if (activeIds.length === 0 || !characters?.length) {
      this.publish();
      return [];
    }

    const baseMembers = characters.map(buildPartyMember);
    const baseById = new Map(baseMembers.map((member) => [member.id, member]));
    const currentById = new Map(this.partyState.applyToPartyMembers(baseMembers).map((member) => [member.id, member]));
    const summary: SetPartyLevelDebugSummary[] = [];
    for (const charId of activeIds) {
      const baseMember = baseById.get(charId);
      if (!baseMember) {
        continue;
      }
      const currentMember = currentById.get(charId) ?? baseMember;
      const leveled = partyMemberAtLevel({
        ...baseMember,
        inventory: currentMember.inventory,
        money: currentMember.money,
        ...(currentMember.statuses?.length ? { statuses: currentMember.statuses } : {})
      }, targetLevel);
      const persisted = this.partyState.applyLeveledPartyMember(leveled);
      summary.push({
        id: persisted.charId,
        name: leveled.name,
        level: persisted.level,
        maxHp: persisted.maxHp
      });
    }
    this.refreshMenuScreens();
    this.publish();
    return summary;
  }

  private overworldPartyMembersDebug(): OverworldPartyMemberDebug[] {
    return this.overworldHudPartyMembers().map((member) => {
      const vitals = this.partyState.vitals(member.id);
      const maxHp = statusHudStat(vitals?.maxHp ?? member.maxHp, 1);
      const hp = Math.min(maxHp, statusHudStat(vitals?.hp.target ?? member.hp));
      const maxPp = statusHudStat(vitals?.maxPp ?? member.maxPp);
      const pp = Math.min(maxPp, statusHudStat(vitals?.pp ?? member.pp));
      return {
        id: member.id,
        name: member.name.trim() || "PLAYER",
        level: statusHudStat(member.level, 1),
        hp,
        maxHp,
        pp,
        maxPp
      };
    });
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
    if (
      this.menuState.open ||
      this.dialogue.open ||
      this.eventSequence?.running ||
      this.isDoorFadeActive() ||
      this.pendingBattleStart ||
      !this.player
    ) {
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
      intake: getFilingIntakeFromRegistry(this.registry),
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
    if (this.bootSaveState.intake) {
      this.registry.set(FILING_INTAKE_REGISTRY_KEY, this.bootSaveState.intake);
    }
    this.openingRoamerHold = false;
    this.clearStartupPajamaVisualState();
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
   * return. Its flags - and the once-fired marker - advance ONLY on a win. On a
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
      if (resolution.setFlags.includes(ROUTE_OPEN_FLAG) && !this.gameFlags.has(ROUTE_OPEN_FLAG)) {
        this.pendingDawnFadeOnCreate = true;
        this.pendingIntroMusicReleaseFadeOnCreate = true;
      }
      if (resolution.firedFlag) {
        this.gameFlags.set(resolution.firedFlag);
      }
      resolution.setFlags.forEach((flag) => this.gameFlags.set(flag));
      resolution.clearFlags.forEach((flag) => this.gameFlags.unset(flag));
      this.reconcileRecruits({ announce: true });
      return;
    }
    this.suppressedTriggerId = resolution.triggerId;
  }

  private applyReturnRestore(): (SavePlayerSnapshot & { mode: "chunked" }) | undefined {
    const restore = this.restoreState;
    if (!restore) {
      return undefined;
    }

    this.clearStartupPajamaVisualState();
    this.gameFlags.clear();
    for (const flag of restore.flags.strings) {
      this.gameFlags.set(flag);
    }
    for (const flag of restore.flags.numeric) {
      this.gameFlags.setNum(flag);
    }
    this.applyStoryGateReturn(restore);
    this.partyState.restore(restore.party);
    this.applySourceCheckReturn(restore);
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

  private applySourceCheckReturn(restore: ChunkedWorldRestore): void {
    const result = restore.sourceCheck;
    if (!result) {
      return;
    }
    if (result.outcome === "failed") {
      const session = this.sourceCheckSession();
      session.failedAt[result.id] = { ...result.worldPixel };
      this.setSourceCheckSession(session);
    }
    const reward = pendingAttestationRewardForReturn(result);
    if (reward) {
      this.pendingAttestationReward = reward;
    }
  }

  private startAttestationRewardCeremony(): void {
    const reward = this.pendingAttestationReward;
    if (!reward) {
      return;
    }
    const check = this.sourceCheckById(reward.checkId);
    const card = cardById(this.data_.cardNfts, reward.cardId);
    if (!check || !card) {
      this.pendingAttestationReward = undefined;
      console.warn("[attestation reward] missing ceremony data", reward);
      return;
    }
    const pages = attestationRewardDialoguePages({
      drifellaName: drifellaDisplayName(check),
      cardName: card.name,
      itemName: this.itemName(check.rewards.itemId, this.itemById(check.rewards.itemId)),
      itemHeld: this.gameFlags.has(sourceCheckItemHeldFlag(check.id))
    });
    lockPlayer(this.playerState, this.playerFrames);
    this.pendingScriptedDialogueComplete = () => {
      this.pendingAttestationReward = undefined;
      this.showBinderCardOverlay(card);
    };
    this.dialogue.start(buildInlineDialoguePages(pages));
    this.updatePrompt();
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
      if (target.targetKind === "sourceCheck") {
        this.openSourceCheckInteraction(target);
        return;
      }
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
    const wasOpened = entry.kind === "present" ? this.overworldInteractableOpened(entry) : false;
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
    if (entry.kind === "present" && !wasOpened && this.overworldInteractableOpened(entry)) {
      this.setStoryItemPickupFlag(entry);
    }
    this.syncPresentInteractableSprites();
    this.updatePrompt();
    this.publish();
  }

  private setStoryItemPickupFlag(entry: Extract<OverworldInteractable, { kind: "present" }>): void {
    const storyItem = storyItemById(this.data_.storyItems, entry.storyItemId);
    if (storyItem) {
      this.gameFlags.set(storyItem.pickupFlag);
    }
  }

  private openSourceCheckInteraction(target: WorldInteractionCandidate): void {
    if (this.pendingAttestationReward) {
      return;
    }
    const check = this.sourceCheckById(target.sourceCheckId);
    if (!check) {
      return;
    }
    this.restoreActiveNpc();
    this.playInteractionSfx("talkConfirm");
    lockPlayer(this.playerState, this.playerFrames);
    if (this.sourceCheckRetryGated(check)) {
      this.dialogue.start(buildInlineDialoguePages([this.randomSourceCheckLine(check.reactions.failed)]));
      this.updatePrompt();
      this.publish();
      return;
    }
    if (this.gameFlags.has(sourceCheckClearedFlag(check.id))) {
      const pages = [this.randomSourceCheckLine(check.reactions.alreadyCleared)];
      if (this.deliverHeldSourceCheckItem(check)) {
        pages.push("Held item delivered.");
      }
      this.dialogue.start(buildInlineDialoguePages(pages));
      this.updatePrompt();
      this.publish();
      return;
    }
    this.pendingSourceCheckEntryId = check.id;
    this.dialogue.start(buildInlineDialoguePages([...check.entryPrompt]));
    this.updatePrompt();
    this.publish();
  }

  private deliverHeldSourceCheckItem(check: DrifellaSourceCheck): boolean {
    const heldFlag = sourceCheckItemHeldFlag(check.id);
    if (!this.gameFlags.has(heldFlag)) {
      return false;
    }
    const leadCharId = this.leadPartyCharId();
    if (this.partyState.inventoryRoom(leadCharId) <= 0) {
      return false;
    }
    if (!this.partyState.give(leadCharId, check.rewards.itemId)) {
      return false;
    }
    this.gameFlags.unset(heldFlag);
    this.playInteractionSfx("itemGet");
    this.refreshMenuScreens();
    return true;
  }

  private launchPendingSourceCheck(checkId: string): void {
    const check = this.sourceCheckById(checkId);
    if (!check || !this.data_.battle) {
      this.afterDialogueClosed();
      return;
    }
    const attempt = this.nextSourceCheckAttempt(check.id);
    const battlePartyMembers = this.battlePartyMembers();
    this.scene.stop("ui");
    this.scene.start("battle", {
      battleData: this.data_.battle,
      characters: this.data_.characters,
      partyMembers: battlePartyMembers,
      partyOptions: this.battlePartyOptions(battlePartyMembers),
      wallet: this.partyState.wallet,
      bank: this.partyState.bank,
      items: this.data_.items,
      psi: this.data_.psi,
      usabilityMatrix: this.data_.usabilityMatrix,
      font: this.data_.font,
      window: this.data_.window,
      spriteOverrides: this.data_.spriteOverrides,
      backgroundOverrides: this.data_.backgroundOverrides,
      battleRules: this.data_.battleRules,
      musicManifest: this.data_.musicManifest,
      encounterAdvantage: "normal",
      encounterSeed: this.nextBattleEncounterSeed(),
      returnTo: this.sourceCheckReturnTo().context,
      attestation: {
        check,
        cards: this.data_.cardNfts,
        battles: this.data_.attestationBattles,
        attempt,
        gameFlagsSnapshot: this.gameFlags.list()
      }
    });
  }

  private sourceCheckReturnTo(): SourceCheckReturnTo {
    return {
      worldPixel: {
        x: this.playerState.x,
        y: this.playerState.y
      },
      facing: this.playerState.facing,
      context: {
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
            cooldownMs: this.encounterCooldownMs,
            rngSeed: this.encounterRng.state(),
            lastEncounterGroup: this.lastEncounterGroup
          },
          source: "event"
        }
      }
    };
  }

  private sourceCheckById(id: string | undefined): DrifellaSourceCheck | undefined {
    if (!id) {
      return undefined;
    }
    return this.data_.sourceChecks.checks.find((check) => check.id === id);
  }

  private randomSourceCheckLine(lines: readonly string[]): string {
    if (lines.length === 0) {
      return "";
    }
    const index = Math.floor(Math.abs(this.time.now) % lines.length);
    return lines[index] ?? lines[0] ?? "";
  }

  private leadPartyCharId(): number {
    return this.partyState.party()[0] ?? this.data_.characters?.characters[0]?.id ?? 0;
  }

  private interactionEventsForNpc(npc: RuntimeNpcData): GameEvent[] {
    if (isAddedWorldChunkedNpc(npc)) {
      return addedNpcInteractionEvents(
        {
          npcId: npc.npcId,
          interaction: resolveEarlyGameDialogueInteraction(
            npc.addedInteraction,
            this.data_.earlyGameSequence
          )
        },
        this.data_.dialogueLibrary,
        this.gameFlags,
        this.currentNpcGuidance(npc.npcId)
      );
    }
    return interactionEvents(
      npc,
      this.targetReference,
      this.gameFlags,
      this.data_.customDialogue,
      this.data_.dialogueLibrary,
      this.data_.scripts,
      this.currentNpcGuidance(npc.npcId)
    );
  }

  private currentNpcGuidance(npcId: number): string | undefined {
    return currentObjectiveNpcHint(this.gameFlags, this.data_.objectives, npcId, this.openingObjectiveContext());
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
        const routeOpenJustSet = flag === ROUTE_OPEN_FLAG && !this.gameFlags.has(ROUTE_OPEN_FLAG);
        this.gameFlags.set(flag);
        this.updateAct1NightTint({ fade: routeOpenJustSet });
        this.syncOverworldMusicAfterRouteOpen(routeOpenJustSet);
        this.syncPresentInteractableSprites();
        this.syncSourceCheckActors();
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

  private tickTimedDeliveries(deltaMs: number): void {
    const arrivals = advanceTimedDeliveries(
      this.timedDeliveryState,
      this.data_.timedDeliveries,
      { isSet: (flag) => this.gameFlags.isSet(flag) },
      deltaMs / (1000 / 60)
    );
    for (const delivery of arrivals) {
      if (!this.timedDeliveryArrivalQueue.includes(delivery.id)) {
        this.timedDeliveryArrivalQueue.push(delivery.id);
      }
    }
    this.startNextTimedDeliveryArrival();
  }

  private startNextTimedDeliveryArrival(): void {
    if (
      this.activeDeliverySprite ||
      this.menuState.open ||
      this.dialogue.open ||
      this.eventSequence?.running ||
      this.cutsceneRunner?.running ||
      this.isDoorFadeActive()
    ) {
      return;
    }
    while (this.timedDeliveryArrivalQueue.length > 0) {
      const deliveryId = this.timedDeliveryArrivalQueue.shift();
      const delivery = this.data_.timedDeliveries.deliveries.find((entry) => entry.id === deliveryId);
      if (!delivery || !this.gameFlags.isSet(delivery.eventFlag)) {
        continue;
      }
      this.startTimedDeliveryArrival(delivery);
      return;
    }
  }

  private startTimedDeliveryArrival(delivery: TimedDeliveryEntry): void {
    const spriteGroup = this.deliverySpriteGroup(delivery.spriteId);
    const spawn = this.deliverySpawnPoint();
    const queued = this.requestNpcRuntimeTexture(delivery.spriteId, spriteGroup);
    this.activeDeliverySprite = this.spawnNpcActor(delivery.spriteId, spawn.x, spawn.y, spriteGroup, "down");
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }

    const pages = [delivery.arrivalMessage];
    const delivered = this.deliverTimedDeliveryItem(delivery);
    if (delivery.itemId !== undefined && delivered) {
      const itemName = this.itemName(delivery.itemId, this.itemById(delivery.itemId));
      pages.push(`${itemName} went into Goods.`);
      this.gameFlags.unsetNum(delivery.eventFlag);
      completeTimedDelivery(this.timedDeliveryState, delivery.id);
    } else if (delivery.itemId === undefined) {
      this.gameFlags.unsetNum(delivery.eventFlag);
      completeTimedDelivery(this.timedDeliveryState, delivery.id);
    } else {
      pages.push("No room in Goods. Swag Express keeps the slip open.");
    }

    lockPlayer(this.playerState, this.playerFrames);
    this.dialogue.start(buildInlineDialoguePages(pages));
    this.updatePrompt();
    this.publish();
  }

  private deliverTimedDeliveryItem(delivery: TimedDeliveryEntry): boolean {
    if (delivery.itemId === undefined) {
      return true;
    }
    const leadChar = this.leadPartyCharId();
    if (this.partyState.inventoryRoom(leadChar) <= 0) {
      return false;
    }
    if (!this.partyState.give(leadChar, delivery.itemId)) {
      return false;
    }
    this.playInteractionSfx("itemGet");
    this.refreshMenuScreens();
    return true;
  }

  private deliverySpriteGroup(spriteId: number): number | undefined {
    return this.world_.npcs.find((npc) => npc.npcId === spriteId)?.spriteGroup;
  }

  private deliverySpawnPoint(): { x: number; y: number } {
    const offset = this.playerState.facing === "left"
      ? { x: -24, y: 0 }
      : this.playerState.facing === "right"
        ? { x: 24, y: 0 }
        : this.playerState.facing === "up"
          ? { x: 0, y: -24 }
          : { x: 0, y: 24 };
    return this.clampSpawn({
      x: this.playerState.x + offset.x,
      y: this.playerState.y + offset.y
    });
  }

  private clearActiveDeliverySprite(): void {
    this.activeDeliverySprite?.destroy();
    this.activeDeliverySprite = undefined;
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

  private updateEventSequenceWatchdog(): void {
    const sequence = this.eventSequence;
    const running = Boolean(sequence?.running);
    const debug = sequence?.debug();
    const result = this.eventSequenceWatchdog.update({
      running,
      dialogueOpen: this.dialogue.open,
      choiceOpen: Boolean(this.dialogue.choice),
      nowMs: this.time.now,
      progressToken: running && debug ? this.eventSequenceProgressToken(debug) : "idle"
    });
    if (!running || !debug || !result.timedOut) {
      return;
    }
    this.terminateHungEventSequence(debug, result.idleMs);
  }

  private eventSequenceProgressToken(debug: EventHostDebug): string {
    const records = debug.records;
    const move = this.cutsceneMoveDebug;
    const position = move.position ? `${move.position.x},${move.position.y}` : "none";
    const moveToken = move.active
      ? `${move.actor ?? "actor"}:${position}:${move.arrived ? "arrived" : "moving"}`
      : "inactive";
    const choice = this.dialogue.choice;
    const choiceToken = choice
      ? `choice:${choice.selectedIndex}:${choice.options.map((option) => option.label).join(",")}`
      : "choice:none";
    return [
      debug.reference ?? "unknown",
      debug.npcId ?? "none",
      debug.effectsDispatched,
      debug.currentEffectKind ?? "none",
      records.actorMoves,
      records.unsupported,
      this.dialogue.open ? "dialogue-open" : "dialogue-closed",
      this.dialogue.opens,
      this.dialogue.closes,
      this.dialogue.pageIndex,
      choiceToken,
      moveToken
    ].join("|");
  }

  private terminateHungEventSequence(debug: EventHostDebug, idleMs: number): void {
    const reference = debug.reference ?? "unknown";
    const npcId = debug.npcId ?? this.activeNpcDialogue?.id;
    console.warn("[event watchdog] terminated stuck event sequence", {
      reference,
      ...(npcId !== undefined ? { npcId } : {}),
      idleMs: Math.round(idleMs),
      eventDebug: debug
    });
    this.eventSequence?.abort("watchdog_idle");
    this.eventSequenceWatchdog.reset();
    if (import.meta.env.DEV) {
      this.showDevToast(`event watchdog: terminated ${reference}`);
      this.updatePrompt();
      this.publish();
    }
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

    const requestedTarget = this.clampSpawn(effect.to);
    const path = this.navmesh ? findMeshPath(this.navmesh, runtime.state, requestedTarget) : undefined;
    const waypoints = path && path.length > 1 ? path.slice(1) : undefined;
    const target = waypoints?.at(-1) ?? requestedTarget;
    const maxDurationMs = cutsceneMoveTimeoutMsForDistance(cutsceneMoveRouteDistancePx(runtime.state, waypoints, target));
    const actorLabel = cutsceneActorLabel(actor);
    this.cutsceneMove = {
      actor,
      actorLabel,
      ...(npc ? { npcKey: npc.key, restoreNpcPaused: npc.state.paused } : {}),
      ...(npc && this.authoredOpeningCutsceneRunActive ? { holdNpcUntilStartupFinalize: true } : {}),
      target,
      ...(waypoints ? { waypoints } : {}),
      waypointIndex: 0,
      run: effect.run === true,
      elapsedMs: 0,
      maxDurationMs
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
    const target = this.activeCutsceneMoveTarget(move);
    const distance = Phaser.Math.Distance.Between(runtime.state.x, runtime.state.y, target.x, target.y);
    if (distance <= CUTSCENE_ACTOR_MOVE_ARRIVAL_PX) {
      this.setCutsceneActorPosition(runtime, target);
      if (this.advanceCutsceneMoveWaypoint(move)) {
        runtime.sync();
        this.publishCutsceneMoveProgress(move, runtime);
        return;
      }
      this.completeCutsceneMove(true, false);
      return;
    }

    if (move.elapsedMs >= move.maxDurationMs) {
      this.completeCutsceneMove(true, true);
      return;
    }

    const arrived = advanceCutsceneActorTowardTarget(runtime.state, target, {
      deltaMs,
      speed: move.run ? PLAYER_SPEED * CUTSCENE_ACTOR_RUN_MULTIPLIER : PLAYER_SPEED,
      bounds: this.movementBounds(),
      frames: runtime.frames,
      arrivalPx: CUTSCENE_ACTOR_MOVE_ARRIVAL_PX
    });
    runtime.sync();
    if (arrived) {
      if (this.advanceCutsceneMoveWaypoint(move)) {
        this.publishCutsceneMoveProgress(move, runtime);
        return;
      }
      this.completeCutsceneMove(true, false);
      return;
    }
    this.publishCutsceneMoveProgress(move, runtime);
  }

  private activeCutsceneMoveTarget(move: CutsceneMoveState): NavmeshPoint {
    return move.waypoints?.[move.waypointIndex] ?? move.target;
  }

  private advanceCutsceneMoveWaypoint(move: CutsceneMoveState): boolean {
    if (!move.waypoints || move.waypointIndex >= move.waypoints.length - 1) {
      return false;
    }
    move.waypointIndex += 1;
    return true;
  }

  private publishCutsceneMoveProgress(move: CutsceneMoveState, runtime: CutsceneMoveActorRuntime): void {
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
    if (runtime && timedOut) {
      this.setCutsceneActorPosition(runtime, move.target);
    }
    if (timedOut) {
      console.warn("[cutscene move] timed out; snapping actor to destination", {
        actor: move.actorLabel,
        target: move.target,
        elapsedMs: Math.round(move.elapsedMs),
        timeoutMs: Math.round(move.maxDurationMs)
      });
    }
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

  private npcPlacementForActor(actor: Extract<NormalizedActorMoveSelector, { kind: "npc" }>): NpcPlacement | undefined {
    for (const placements of this.npcPlacementsByChunk.values()) {
      const placement = placements.find((candidate) => candidate.data.npcId === actor.npcId);
      if (placement) {
        return placement;
      }
    }
    return undefined;
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
      if (this.openingOwnsCutscene(cutscene.id)) {
        this.warnOwnedOpeningCutsceneSkip(cutscene.id);
        continue;
      }
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

  private openingOwnsCutscene(cutsceneId: string): boolean {
    const sequence = this.data_.earlyGameSequence;
    // Unlike phase consumers, ownership permanently retires the legacy copy
    // whenever the replacement opening is enabled.
    return sequence.phaseGatesEnabled && sequence.ownership.cutsceneIds.includes(cutsceneId);
  }

  private warnOwnedOpeningCutsceneSkip(cutsceneId: string): void {
    if (!import.meta.env.DEV || this.warnedOwnedOpeningCutscenes.has(cutsceneId)) {
      return;
    }
    this.warnedOwnedOpeningCutscenes.add(cutsceneId);
    console.warn(`[opening gates] skipped owned legacy cutscene "${cutsceneId}"`);
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

  private startCutscene(cutscene: Cutscene, onDone?: () => void): void {
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
      this.restoreCutsceneStaging(false);
      // Keep visibility overrides: hidden actors must stay hidden after the scene.
      // The EB flag (eventFlag step) blocks re-creation, but already-spawned runtimes
      // need the override to stay hidden. Overrides reset on scene start.
      if (lockForCutscene && !this.dialogue.open && !this.eventSequence?.running) {
        unlockPlayer(this.playerState);
      }
      this.updatePrompt();
      this.publish();
      // Chain a follow-on (e.g. the opening flyover after the Strawberry prologue).
      // Runs last so the continuation can re-lock the player it needs.
      onDone?.();
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

  private updateCutsceneWatchdog(): void {
    const running = Boolean(this.cutsceneRunner?.running);
    const result = this.cutsceneWatchdog.update({
      running,
      dialogueOpen: this.dialogue.open,
      nowMs: this.time.now,
      progressToken: running ? this.cutsceneProgressToken() : "idle"
    });
    if (!running || !result.timedOut) {
      return;
    }
    this.terminateHungCutscene(result.idleMs);
  }

  private cutsceneProgressToken(): string {
    return cutsceneRunnerProgressToken({
      cutsceneId: this.activeCutsceneId,
      stepIndex: this.cutsceneRunner?.currentIndex,
      dialogueOpen: this.dialogue.open,
      dialogueOpens: this.dialogue.opens,
      dialogueCloses: this.dialogue.closes
    });
  }

  private terminateHungCutscene(idleMs: number): void {
    const cutsceneId = this.activeCutsceneId ?? "unknown";
    console.warn("[cutscene watchdog] terminated stuck cutscene", {
      cutsceneId,
      idleMs: Math.round(idleMs),
      currentIndex: this.cutsceneRunner?.currentIndex,
      cutsceneMove: this.cutsceneMoveDebug
    });
    if (this.cutsceneMove) {
      this.completeCutsceneMove(true, true);
    }
    this.cutsceneRunner?.abort();
    this.restoreCutsceneStaging(true);
    this.cutsceneWatchdog.reset();
    if (import.meta.env.DEV) {
      this.showDevToast(`cutscene watchdog: terminated ${cutsceneId}`);
      this.updatePrompt();
      this.publish();
    }
  }

  private createCutsceneHost(): CutsceneHost {
    return {
      startActorMove: (actor, to, run) => this.requestCutsceneActorMove({ kind: "actorMove", actor, to, run }),
      isActorMoveActive: () => this.cutsceneMove !== undefined,
      currentActorMoveTimeoutMs: () => this.cutsceneMove?.maxDurationMs,
      timeoutActorMove: () => this.completeCutsceneMove(true, true),
      actorPosition: (actor) => this.cutsceneActorPosition(actor),
      faceActor: (actor, dir) => this.setCutsceneActorFacing(actor, dir),
      setActorVisible: (actor, visible) => this.setCutsceneActorVisible(actor, visible),
      startDialogue: (pages) => this.dialogue.start(buildInlineDialoguePages([...pages])),
      isDialogueOpen: () => this.dialogue.open,
      setGameFlag: (flag) => {
        const routeOpenJustSet = flag === ROUTE_OPEN_FLAG && !this.gameFlags.has(ROUTE_OPEN_FLAG);
        this.gameFlags.set(flag);
        this.updateAct1NightTint({ fade: routeOpenJustSet });
        this.syncOverworldMusicAfterRouteOpen(routeOpenJustSet);
      },
      clearGameFlag: (flag) => {
        this.gameFlags.unset(flag);
        this.updateAct1NightTint();
        this.syncOverworldMusicForCurrentFlags();
      },
      setEventFlag: (flag, set) => { if (set) { this.gameFlags.setNum(flag); } else { this.gameFlags.unsetNum(flag); } },
      playSound: (id) => this.playCutsceneSound(id),
      warp: (to) => this.warpPlayerToWorldPixel(to),
      cutsceneMusic: (action, cue, fadeMs) => this.runCutsceneMusic(action, cue, fadeMs),
      cutsceneCamera: (action, to, actor, ms, zoom, intensity) =>
        this.runCutsceneCamera(action, to, actor, ms, zoom, intensity),
      cutsceneFx: (action, color, ms, alpha) => this.runCutsceneFx(action, color, ms, alpha)
    };
  }

  // --- Cutscene staging ops (music / camera / fx) ---------------------------
  // Non-verbal staging so scenes carry emotion through blocking, the eye, the
  // mixtape, and light instead of text. All fire-and-forget; hold with `wait`.

  private cutsceneStagingDirty = false;
  private cutsceneTintOverlay?: Phaser.GameObjects.Image;

  private runCutsceneMusic(action: "play" | "stop", cue: string | undefined, fadeMs: number | undefined): void {
    this.cutsceneStagingDirty = true;
    if (action === "stop") {
      this.music.stop(fadeMs ?? 0);
    } else if (cue) {
      void this.music.play(cue, fadeMs !== undefined ? { fadeMs } : {});
    }
  }

  /**
   * Reusable named audiovisual cue fired by story triggers (trigger.fx). The AV grammar
   * of a Swagbound win: warmth breaking the cold sync when kindness/recognition lands.
   */
  private playStoryTriggerFxCue(cue: NonNullable<StoryTrigger["fx"]>): void {
    if (cue === "understanding-lands") {
      this.cameras.main.flash(420, 255, 210, 122); // warm gold bloom
      this.playCutsceneSound("itemGet");
    }
    if (import.meta.env.DEV) {
      const dbg = ((globalThis as Record<string, unknown>).__fxCueDebug ??= {
        count: 0,
        lastCue: null
      }) as { count: number; lastCue: string | null };
      dbg.count += 1;
      dbg.lastCue = cue;
    }
  }

  private meadowDream_?: MeadowDream;
  private meadowDreamActive_ = false;

  /**
   * Opening hook: once the "back to bed" beat sets intro:dream-pending and its cutscene has
   * released control, run the meadow dream. On completion, set the flags the old dawn beat
   * used to set (intro:morning + the cold signal), so the downstream morning flow is
   * unchanged - just delayed by the dream. Fired once per pending flag.
   */
  private maybeStartMeadowDream(): void {
    if (
      this.meadowDream_ ||
      this.meadowDreamActive_ ||
      !this.gameFlags.has("intro:dream-pending") ||
      this.gameFlags.has("intro:morning") ||
      this.activeCutsceneId !== undefined ||
      this.dialogue.open
    ) {
      return;
    }
    this.startMeadowDream(() => {
      this.gameFlags.unset("intro:dream-pending");
      this.gameFlags.set("intro:morning");
      this.gameFlags.set("signal:cold-signal-seen");
      unlockPlayer(this.playerState);
      this.updatePrompt();
      this.publish();
    });
  }

  /**
   * The pre-wake meadow dream (Cloak reaches Bosch). Runs as a screen-space overlay so it
   * never touches world/save state; hands control back via onDone when it whites out.
   */
  private startMeadowDream(onDone: () => void): void {
    if (this.meadowDream_) {
      return;
    }
    this.meadowDreamActive_ = true; // suppresses the gameplay HUD (see cinematicActive)
    lockPlayer(this.playerState, this.playerFrames);
    const boschSprite = this.player instanceof Phaser.GameObjects.Sprite ? this.player : undefined;
    const boschKey = boschSprite?.texture?.key;
    // Face Bosch to the right, walking left-to-right along the meadow path.
    const walkFrames = this.playerFrames.right ?? this.playerFrames.up ?? [];
    const boschFrame = walkFrames.length > 0 ? walkFrames[0] : Number(boschSprite?.frame?.name ?? 0);
    const cloakKey = "swagdream-cloak";
    const flowerKey = "swagdream-flowers";
    const butterflyKey = "swagdream-butterflies";
    const flowerFrames = 16;
    const begin = (): void => {
      this.meadowDream_ = new MeadowDream(this, {
        boschTextureKey: boschKey,
        boschFrame,
        boschWalkFrames: walkFrames.length > 1 ? [...walkFrames] : undefined,
        cloakTextureKey: this.textures.exists(cloakKey) ? cloakKey : undefined,
        cloakFrame: 0, // down-facing (row 0): Cloak faces Bosch and the camera when she appears
        flowerTextureKey: this.textures.exists(flowerKey) ? flowerKey : undefined,
        flowerFrameCount: flowerFrames,
        butterflyTextureKey: this.textures.exists(butterflyKey) ? butterflyKey : undefined,
        butterflyVariants: 4,
        onBloom: () => this.playStoryTriggerFxCue("understanding-lands"),
        onMessage: (text) => (this.scene.get("ui") as UiScene).showCinematicCaption(text),
        onMessageClear: () => (this.scene.get("ui") as UiScene).hideCinematicCaption(),
        onComplete: () => {
          this.meadowDream_ = undefined;
          this.meadowDreamActive_ = false;
          this.updatePrompt();
          onDone();
        }
      });
    };
    if (this.textures.exists(cloakKey) && this.textures.exists(flowerKey) && this.textures.exists(butterflyKey)) {
      begin();
      return;
    }
    // The dream's sheets are not loaded during the opening; pull them in, then start.
    // COMPLETE fires even if a file errors, so begin() (with fallbacks) always runs.
    if (!this.textures.exists(cloakKey)) {
      this.load.spritesheet(cloakKey, "assets/swagbound/hero/lsw-224-walk.png", {
        frameWidth: 192,
        frameHeight: 192
      });
    }
    if (!this.textures.exists(flowerKey)) {
      this.load.image(flowerKey, "assets/swagbound/dream/flowers.png");
    }
    if (!this.textures.exists(butterflyKey)) {
      this.load.image(butterflyKey, "assets/swagbound/dream/butterflies.png");
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.registerDreamFlowerFrames(flowerKey);
      this.registerDreamButterflyFrames(butterflyKey);
      begin();
    });
    this.load.start();
  }

  /** Slice the butterfly sheet into 4 variants x [open, closed] frames (bfly-{v}-{0|1}). */
  private registerDreamButterflyFrames(key: string): void {
    // A failed load leaves the key absent; textures.get() would hand back the shared
    // __MISSING texture, and adding frames to it would pollute the global fallback. Bail
    // on the key itself, not on a falsy tex (get() never returns null here).
    if (!this.textures.exists(key)) {
      return;
    }
    const tex = this.textures.get(key);
    if (tex.has("bfly-0-0")) {
      return;
    }
    // [openX, openY, openW, openH, closedX, closedY, closedW, closedH] per variant.
    const variants: number[][] = [
      [227, 113, 348, 181, 807, 79, 176, 218],
      [227, 403, 348, 181, 807, 369, 176, 218],
      [227, 692, 348, 182, 807, 660, 176, 217],
      [227, 983, 348, 182, 807, 950, 176, 217]
    ];
    variants.forEach((r, v) => {
      tex.add(`bfly-${v}-0`, 0, r[0], r[1], r[2], r[3]);
      tex.add(`bfly-${v}-1`, 0, r[4], r[5], r[6], r[7]);
    });
  }

  /**
   * The generated flower sheet is a loose grid; slice it by the 16 detected per-flower
   * bounding boxes (connected-component alpha scan, tmp/flower-cc.mjs) so nothing clips.
   */
  private registerDreamFlowerFrames(flowerKey: string): void {
    // See registerDreamButterflyFrames: guard on the key, not on a falsy tex, so a failed
    // load does not add frames to the shared __MISSING fallback texture.
    if (!this.textures.exists(flowerKey)) {
      return;
    }
    const tex = this.textures.get(flowerKey);
    if (tex.has("flower-0")) {
      return;
    }
    const rects: Array<[number, number, number, number]> = [
      [415, 90, 153, 226], [696, 101, 166, 218], [117, 102, 177, 216], [974, 107, 180, 211],
      [692, 374, 163, 214], [99, 380, 213, 197], [409, 384, 159, 198], [969, 389, 169, 198],
      [699, 635, 131, 210], [123, 643, 150, 201], [414, 653, 123, 192], [986, 659, 131, 186],
      [386, 913, 168, 214], [681, 915, 175, 211], [110, 916, 168, 211], [988, 921, 143, 204]
    ];
    rects.forEach(([x, y, w, h], i) => tex.add(`flower-${i}`, 0, x, y, w, h));
  }

  private hexToRgb(color: string | undefined, fallback: [number, number, number]): [number, number, number] {
    if (!color) {
      return fallback;
    }
    const h = color.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  private runCutsceneCamera(
    action: "focus" | "pan" | "follow" | "shake",
    to: { x: number; y: number } | undefined,
    actor: EventActorMoveSelector | undefined,
    ms: number | undefined,
    zoom: number | undefined,
    intensity: number | undefined
  ): void {
    const cam = this.cameras.main;
    if (action === "follow") {
      if (this.player) { cam.startFollow(this.player, true); }
      if (zoom) { cam.zoomTo(zoom, ms ?? 0); } else { cam.setZoom(OVERWORLD_CAMERA_ZOOM); }
      return;
    }
    if (action === "shake") {
      cam.shake(ms ?? 300, intensity ?? 0.006);
      return;
    }
    const pt = to ?? (actor ? this.cutsceneActorPosition(actor) : undefined);
    if (!pt) {
      return;
    }
    this.cutsceneStagingDirty = true;
    cam.stopFollow();
    if (zoom) { cam.zoomTo(zoom, action === "pan" ? (ms ?? 0) : 0); }
    if (action === "pan") { cam.pan(pt.x, pt.y, ms ?? 800, "Sine.easeInOut"); } else { cam.centerOn(pt.x, pt.y); }
  }

  private runCutsceneFx(
    action: "fadeOut" | "fadeIn" | "flash" | "tint" | "clearTint",
    color: string | undefined,
    ms: number | undefined,
    alpha: number | undefined
  ): void {
    const cam = this.cameras.main;
    const dur = ms ?? 400;
    switch (action) {
      case "fadeOut": {
        this.cutsceneStagingDirty = true;
        const [r, g, b] = this.hexToRgb(color, [0, 0, 0]);
        cam.fadeOut(dur, r, g, b);
        return;
      }
      case "fadeIn": {
        const [r, g, b] = this.hexToRgb(color, [0, 0, 0]);
        cam.fadeIn(dur, r, g, b);
        return;
      }
      case "flash": {
        const [r, g, b] = this.hexToRgb(color, [255, 255, 255]);
        cam.flash(dur, r, g, b);
        return;
      }
      case "tint":
        this.applyCutsceneTint(color ?? "#000000", alpha ?? 0.35, dur);
        return;
      case "clearTint":
        this.clearCutsceneTint(dur);
        return;
      default:
        return;
    }
  }

  private applyCutsceneTint(color: string, alpha: number, ms: number): void {
    this.cutsceneStagingDirty = true;
    // Baked 1x1-color IMAGE scaled to screen (canvas-safe; setTint/Shape do not
    // composite reliably under the Canvas renderer). Depth sits over the world but
    // under the door-fade (130000) and the separate UI scene's dialogue.
    const key = `cutscene-tint-${color.replace("#", "")}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 1, 1);
      const ctx = tex?.getContext();
      if (ctx) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); tex?.refresh(); }
    }
    if (this.cutsceneTintOverlay) {
      this.tweens.killTweensOf(this.cutsceneTintOverlay);
      this.cutsceneTintOverlay.destroy();
      this.cutsceneTintOverlay = undefined;
    }
    const overlay = this.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(129000)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setAlpha(0);
    this.cutsceneTintOverlay = overlay;
    this.tweens.add({ targets: overlay, alpha, duration: Math.max(0, ms), ease: "Sine.easeInOut" });
  }

  private clearCutsceneTint(ms: number): void {
    const overlay = this.cutsceneTintOverlay;
    if (!overlay) {
      return;
    }
    this.tweens.killTweensOf(overlay);
    if (ms <= 0) {
      overlay.destroy();
      this.cutsceneTintOverlay = undefined;
      return;
    }
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: ms,
      ease: "Sine.easeInOut",
      onComplete: () => {
        overlay.destroy();
        if (this.cutsceneTintOverlay === overlay) { this.cutsceneTintOverlay = undefined; }
      }
    });
  }

  /** Return the eye to the player and clear staging overlays after a staged cutscene. */
  private restoreCutsceneStaging(hardResetFade: boolean): void {
    if (!this.cutsceneStagingDirty) {
      return;
    }
    this.cutsceneStagingDirty = false;
    if (this.player) { this.cameras.main.startFollow(this.player, true); }
    this.cameras.main.setZoom(OVERWORLD_CAMERA_ZOOM);
    if (hardResetFade) {
      this.cameras.main.resetFX();
    }
    this.clearCutsceneTint(0);
    this.syncOverworldMusicForCurrentFlags();
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
    const npc = visible ? this.ensureCutsceneNpcRuntime(normalized) : this.npcRuntimeForActor(normalized);
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

  private cutsceneActorPosition(actor: EventActorMoveSelector): { x: number; y: number } | undefined {
    const normalized = normalizeActorMoveSelector(actor);
    if (!normalized) {
      return undefined;
    }
    if (normalized.kind === "player") {
      return { x: this.playerState.x, y: this.playerState.y };
    }
    const npc = this.npcRuntimeForActor(normalized);
    return npc ? { x: npc.state.player.x, y: npc.state.player.y } : undefined;
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
      // An explicit NEW GAME (opening present, no restored save THIS boot) must run the
      // full opening even when old save slots exist; the slot-level hasSave guard is
      // only for plain dev spawns re-triggering the knock.
      hasSave: opening ? Boolean(this.bootSaveState) : this.hasSave,
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

    // The bedroom wake-up: fade in to the dim night room, the cold signal, then the knock.
    const runWakeup = (): void => {
      if (opening) {
        // Bosch is asleep in his bed for the wake-up. The bed cell is solid, but he is
        // locked through the cinematic, so lying on it is safe; he gets to his feet at
        // the walkable bedside when control returns (see finalizeNewGameStartup).
        this.placePlayerInBed();
        this.cameras.main.fadeIn(OPENING_WAKE_FADE_IN_MS, 0, 0, 0);
        this.bedroomNightOverlay?.destroy();
        this.bedroomNightOverlay = this.add
          .rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1236, 0.62)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(130000);
        this.showBedroomSignal();
      }
      if (!this.startAuthoredOpeningCutsceneBeforeStartup(opening, decision.reference)) {
        if (opening) {
          // Pace the wake-up: hold on the dark room while the cold signal flares before
          // MiFella pounds the door.
          this.time.delayedCall(OPENING_KNOCK_DELAY_AFTER_WAKE_MS, () => {
            this.openingSfx.resume();
            this.openingSfx.bedroomKnock();
            this.time.delayedCall(OPENING_KNOCK_SFX_TO_DIALOGUE_MS, () => this.startNewGameStartupEvent(decision.reference));
          });
        } else {
          this.startNewGameStartupEvent(decision.reference);
        }
      }
    };

    // New game opens with an EarthBound-style night flyover of Morningside, then
    // descends (a fade) to Bosch's bed for the wake-up.
    const runFlyoverThenWake = (): void => {
      if (opening) {
        this.runOpeningFlyover(spawn, runWakeup);
      } else {
        runWakeup();
      }
    };
    // Strawberry prologue (Tier-1 keystone): the warm birthday flashback plays FIRST on
    // a new game, before the night flyover - its closing flash + fade to black bridges
    // into the flyover, and Bosch wakes alone in the corrected present. Fired explicitly
    // (the cutscene is opening-owned, so the area scan skips it); its onDone runs the
    // flyover. Skipped once prologue:done is set.
    const prologue = opening
      ? this.data_.cutscenes?.cutscenes.find((cutscene) => cutscene.id === "prologue-strawberry")
      : undefined;
    if (prologue && !this.gameFlags.has("prologue:done")) {
      this.startCutscene(prologue, runFlyoverThenWake);
    } else {
      runFlyoverThenWake();
    }
  }

  /**
   * A slow night drift over Morningside before the bedroom wake-up. Chunks stream
   * around the player, so a hidden player is glided along a path across town and the
   * camera follows it (loading the town as it goes), zoomed out for the overhead feel;
   * then it fades to black, warps to the bed, and hands off to the wake-up.
   */
  /**
   * Lay Bosch in his bed (normal idle sprite rotated on the blanket) for the wake-up cinematic. The
   * bed is a solid furniture cell; he stays here only while locked, then stands up at the
   * walkable bedside when control returns.
   */
  private placePlayerInBed(): void {
    const bed = { x: 8149, y: 1100 };
    // Resolve the room while Bosch is still on the walkable bedside spawn; the
    // bed pose is on solid furniture, where a forced room resolve would clear it.
    this.roomBoundsResolveAnchor = { x: this.playerState.x, y: this.playerState.y };
    this.refreshRoomBounds(true);
    this.playerState.facing = "right";
    this.playerState.x = bed.x;
    this.playerState.y = bed.y;
    this.playerState.velocityX = 0;
    this.playerState.velocityY = 0;
    this.playerState.moving = false;
    this.playerState.animKey = "idle-right";
    this.playerState.animFrame = this.playerFrames.right[0];
    if (this.player) {
      this.player.x = bed.x;
      this.player.y = bed.y;
      if (this.player instanceof Phaser.GameObjects.Sprite) {
        this.player.setFrame(this.playerState.animFrame);
      }
      this.player.setDepth(BED_SLEEP_PLAYER_DEPTH);
    }
    this.refreshStreaming(true);
    this.updateCameraRoomBounds();
    this.setStartupPajamaVisualState();
    this.setStartupLyingVisualState(true);
  }

  private setStartupPajamaVisualState(): void {
    this.sceneVisualState = { ...this.sceneVisualState, event: "pajamas" };
    this.applyPlayerVisualState();
  }

  private clearStartupPajamaVisualState(): void {
    if (this.sceneVisualState.event !== "pajamas") {
      return;
    }
    const { event: _event, ...rest } = this.sceneVisualState;
    this.sceneVisualState = rest;
    this.applyPlayerVisualState();
  }

  private setStartupLyingVisualState(active: boolean): void {
    if (!active) {
      this.roomBoundsResolveAnchor = undefined;
    }
    if (active) {
      this.sceneVisualState = { ...this.sceneVisualState, sleeping: true };
    } else {
      const { sleeping: _sleeping, ...rest } = this.sceneVisualState;
      this.sceneVisualState = rest;
    }
    this.applyPlayerVisualState();
  }

  private clearStartupBedPose(): void {
    this.setStartupLyingVisualState(false);
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.player.setAngle(0);
    }
  }

  private runOpeningFlyover(bedSpawn: { x: number; y: number }, onDone: () => void): void {
    const cam = this.cameras.main;
    const ui = this.scene.get("ui") as UiScene;
    this.flyoverActive = true;
    this.playOverworldMusicCue("intro");
    const setAnchor = (x: number, y: number): void => {
      this.playerState.x = x;
      this.playerState.y = y;
      this.player?.setPosition(x, y);
    };
    this.player?.setVisible(false);
    for (const follower of this.followers) {
      follower.sprite?.setVisible(false);
    }
    // The camera already follows this.player, so gliding the (hidden) anchor across
    // town IS the pan; just pull the zoom out for the overhead feel.
    cam.setZoom(OPENING_FLYOVER_ZOOM);
    // A scroll-fixed overlay does not render reliably over the streamed town chunks at
    // the pulled-back flyover zoom, so the night tint remains a large WORLD-space rect at
    // FG-over depth covering the whole bounded pan region (depth 130000 draws above the
    // FG layer, as the bedroom overlay proves). Cinematic text belongs to uiScene.
    const nightRect = openingFlyoverNightRect();
    const flyNight = this.add
      .rectangle(nightRect.x, nightRect.y, nightRect.width, nightRect.height, 0x0a1236, 0.62)
      .setDepth(130000);
    let rumbleTimer: Phaser.Time.TimerEvent | undefined;

    // One uninterrupted arcade-to-house move. The camera closes in on Bosch's
    // house at the end, then the fade carries directly into the bedroom.
    const shots = OPENING_FLYOVER_SHOTS;

    const finish = (): void => {
      // The final shot has already faded to black; descend to the bed from there.
      ui.hideCinematicCaption();
      ui.hideCinematicTitle();
      flyNight.destroy();
      rumbleTimer?.remove(false);
      this.flyoverActive = false;
      setAnchor(bedSpawn.x, bedSpawn.y);
      this.player?.setVisible(true);
      for (const follower of this.followers) {
        follower.sprite?.setVisible(true);
      }
      this.refreshStreaming(true);
      cam.setZoom(OVERWORLD_CAMERA_ZOOM);
      onDone();
    };

    // Hold each shot's fade-in until the chunk PNGs for its window have actually
    // loaded (capped so a hung fetch cannot stall the cinematic). Over a slow
    // connection (the tunnel), fading in immediately shows unstreamed black that
    // fills in mid-shot and reads as map-edge void.
    const whenChunksSettled = (onReady: () => void): void => {
      if (!this.load.isLoading()) {
        onReady();
        return;
      }
      let done = false;
      const ready = (): void => {
        if (!done) {
          done = true;
          onReady();
        }
      };
      this.load.once(Phaser.Loader.Events.COMPLETE, ready);
      this.time.delayedCall(2_500, ready);
    };

    const runShot = (i: number): void => {
      if (i >= shots.length) {
        finish();
        return;
      }
      const shot = shots[i];
      const from = clampOpeningFlyoverPoint(shot.from);
      const to = clampOpeningFlyoverPoint(shot.to);
      setAnchor(from.x, from.y);
      this.refreshStreaming(true);
      whenChunksSettled(() => beginShot(i, from, to));
    };

    const beginShot = (i: number, from: { x: number; y: number }, to: { x: number; y: number }): void => {
      const shot = shots[i];
      ui.showCinematicCaption(this.data_.earlyGameSequence.flyover.captions[i] ?? shot.text);
      ui.showCinematicTitle(OPENING_ERA_TITLE);
      cam.fadeIn(600, 0, 0, 0);
      const rumble = (): void => {
        if (this.flyoverActive) {
          this.openingSfx.resume();
          this.openingSfx.rumble();
          cam.shake(OPENING_RUMBLE_DURATION_MS, OPENING_RUMBLE_AMPLITUDE);
        }
      };
      rumble();
      rumbleTimer = this.time.addEvent({
        delay: OPENING_RUMBLE_INTERVAL_MS,
        loop: true,
        callback: rumble
      });
      this.time.delayedCall(OPENING_ERA_TITLE_HOLD_MS, () => {
        ui.hideCinematicTitle();
      });
      this.time.delayedCall(Math.max(0, shot.duration - OPENING_FLYOVER_ZOOM_IN_MS), () => {
        if (this.flyoverActive) {
          cam.zoomTo(OPENING_FLYOVER_END_ZOOM, OPENING_FLYOVER_ZOOM_IN_MS, "Sine.easeInOut");
        }
      });
      const proxy = { t: 0 };
      this.tweens.add({
        targets: proxy,
        t: 1,
        duration: shot.duration,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          setAnchor(
            from.x + (to.x - from.x) * proxy.t,
            from.y + (to.y - from.y) * proxy.t
          );
          this.refreshStreaming();
        },
        onComplete: () => {
          rumbleTimer?.remove(false);
          rumbleTimer = undefined;
          ui.hideCinematicCaption();
          cam.fadeOut(600, 0, 0, 0);
          cam.once("camerafadeoutcomplete", () => runShot(i + 1));
        }
      });
    };

    runShot(0);
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

    const wakePages = this.startupMode === "opening"
      ? openingWakeDialoguePages(this.data_.earlyGameSequence)
      : undefined;
    if (wakePages) {
      this.startOverriddenScriptedDialogue(
        buildInlineDialoguePages(wakePages),
        () => this.finalizeNewGameStartup({
          status: "completed",
          truncated: false,
          commandsVisited: 0,
          jumps: 0
        })
      );
      this.updatePrompt();
      return;
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

  /**
   * The cold signal on the sill: a pale glow at the bedroom window that pulses through
   * the night dim and flares once, as if something is reading Bosch from outside.
   */
  private showBedroomSignal(): void {
    // The cold signal reads Bosch: partway through the dark wake-up the room pulses
    // cyan with a jolt, as if something outside just locked onto him. Camera flash +
    // shake (camera effects render reliably over the night dim, unlike an overlay).
    this.time.delayedCall(OPENING_WAKE_SIGNAL_FIRST_FLASH_MS, () => {
      if (this.bedroomNightOverlay) {
        this.openingSfx.resume();
        this.openingSfx.signalLock();
        this.cameras.main.flash(360, 32, 176, 224);
        const caption = this.add
          .text(this.scale.width / 2, this.scale.height - 28, "Something flashes beyond the bedroom window.", {
            fontFamily: CLEAN_UI_FONT_FAMILY,
            fontSize: "12px",
            color: "#d8f7ff",
            align: "center"
          })
          .setOrigin(0.5, 1)
          .setScrollFactor(0)
          .setDepth(131000)
          .setAlpha(0)
          .setShadow(0, 1, "#000000", 4);
        this.tweens.add({ targets: caption, alpha: 1, duration: 180 });
        this.time.delayedCall(1150, () => {
          this.tweens.add({
            targets: caption,
            alpha: 0,
            duration: 300,
            onComplete: () => caption.destroy()
          });
        });
      }
    });
    this.time.delayedCall(OPENING_WAKE_SIGNAL_SECOND_FLASH_MS, () => {
      if (this.bedroomNightOverlay) {
        this.cameras.main.flash(620, 47, 216, 255);
        this.cameras.main.shake(380, 0.008);
      }
    });
  }

  /** Fade out the night dim as Bosch wakes (or on any startup teardown). */
  private liftBedroomNightOverlay(): void {
    const overlay = this.bedroomNightOverlay;
    if (!overlay) {
      return;
    }
    this.bedroomNightOverlay = undefined;
    this.tweens.add({
      targets: overlay,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeIn",
      onComplete: () => overlay.destroy()
    });
  }

  private finalizeNewGameStartup(result: NonNullable<EventHostDebug["result"]>): void {
    if (this.startupRunFinalized) {
      return;
    }
    this.startupRunFinalized = true;
    const completedOpening = this.startupMode === "opening";
    const reference = this.newGameStartupRecord?.reference ?? this.world_.player.newGameStartupRef;
    if (completedOpening) {
      this.finishOpeningWakeWithGetUpWalk(result, reference);
      return;
    }

    this.completeNewGameStartupFinalization(result, { completedOpening, reference });
  }

  private finishOpeningWakeWithGetUpWalk(
    result: NonNullable<EventHostDebug["result"]>,
    reference: string | undefined
  ): void {
    this.clearStartupBedPose();
    this.playerState.facing = "down";
    lockPlayer(this.playerState, this.playerFrames);
    if (this.walkPlayerToStartupSpawn((fallbackReason) => {
      this.completeNewGameStartupFinalization(result, {
        completedOpening: true,
        reference,
        fallbackApplied: fallbackReason !== undefined,
        ...(fallbackReason ? { fallbackReason } : {})
      });
    })) {
      return;
    }

    this.snapStartupGetUpToSpawn();
    this.completeNewGameStartupFinalization(result, {
      completedOpening: true,
      reference,
      fallbackApplied: true,
      fallbackReason: "get_up_walk_unavailable"
    });
  }

  private walkPlayerToStartupSpawn(onComplete: (fallbackReason?: string) => void): boolean {
    const spawn = this.startupInitialSpawn;
    if (!spawn || !this.player || !this.isPlayableWorldPoint(spawn)) {
      return false;
    }

    const from = { x: this.playerState.x, y: this.playerState.y };
    const duration = OPENING_GET_UP_WALK_MS;
    const velocityX = ((spawn.x - from.x) / duration) * 1000;
    const velocityY = ((spawn.y - from.y) / duration) * 1000;
    const proxy = { t: 0 };
    this.playerState.facing = "down";
    this.playerState.velocityX = velocityX;
    this.playerState.velocityY = velocityY;
    this.playerState.moving = true;
    this.playerState.walkClockMs = 0;
    this.playerState.animKey = "walk-down";
    this.playerState.animFrame = this.playerFrames.down[0];
    this.startupGetUpWalkActive = true;
    this.syncPlayerObject();
    let settled = false;
    const settle = (fallbackReason?: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearStartupGetUpFallbackTimer();
      this.snapStartupGetUpToSpawn();
      onComplete(fallbackReason);
    };
    this.clearStartupGetUpFallbackTimer();
    this.startupGetUpFallbackTimer = this.time.delayedCall(1000, () => settle("get_up_walk_timeout"));

    this.tweens.add({
      targets: proxy,
      t: 1,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.playerState.x = from.x + (spawn.x - from.x) * proxy.t;
        this.playerState.y = from.y + (spawn.y - from.y) * proxy.t;
        this.playerState.velocityX = velocityX;
        this.playerState.velocityY = velocityY;
        this.playerState.moving = true;
        this.playerState.walkClockMs = duration * proxy.t;
        this.playerState.animKey = "walk-down";
        const frames = this.playerFrames.down;
        this.playerState.animFrame = frames[Math.floor(this.playerState.walkClockMs / WALK_FRAME_MS) % frames.length];
        this.syncPlayerObject();
      },
      onComplete: () => {
        settle();
      }
    });
    return true;
  }

  private snapStartupGetUpToSpawn(): void {
    this.startupGetUpWalkActive = false;
    this.clearStartupBedPose();
    this.playerState.facing = "down";
    this.restoreStartupSpawn();
  }

  private clearStartupGetUpFallbackTimer(): void {
    this.startupGetUpFallbackTimer?.remove(false);
    this.startupGetUpFallbackTimer = undefined;
  }

  private completeNewGameStartupFinalization(
    result: NonNullable<EventHostDebug["result"]>,
    options: {
      completedOpening: boolean;
      reference?: string;
      fallbackApplied?: boolean;
      fallbackReason?: string;
    }
  ): void {
    this.clearStartupGetUpFallbackTimer();
    this.startupGetUpWalkActive = false;
    this.clearStartupBedPose();
    let fallbackApplied = options.fallbackApplied ?? false;
    let fallbackReason = options.fallbackReason ?? this.startupFallbackReason;
    if (fallbackReason || !this.isPlayableWorldPoint(this.currentPlayerPoint())) {
      fallbackApplied = true;
      fallbackReason ??= "unsafe_final_player_position";
      this.restoreStartupSpawn();
    }
    this.startupRunActive = false;
    this.startupMode = "startup";
    this.authoredOpeningCutsceneRunActive = false;
    if (options.completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
      for (const flag of openingWakeCompletionFlags(this.data_.earlyGameSequence)) {
        this.gameFlags.set(flag);
      }
      this.refreshMenuScreens();
    }
    this.liftBedroomNightOverlay();
    if (this.dialogue.open && result.status === "aborted") {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    if (options.completedOpening) {
      this.autosaveOpeningHome();
      this.showObjectiveNotice();
    }
    this.releaseOpeningCutsceneActorHolds();
    const finalPlayer = this.currentPlayerPoint();
    this.newGameStartupRecord = this.startupRecord({
      attempted: true,
      started: true,
      ...(options.reference ? { reference: options.reference } : {}),
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
    this.applyDoorWarp(destination, { kind: "teleport", style: destination.warpStyle });
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
    const eventDebug = this.eventSequence?.debug();
    const result = eventDebug?.result ?? {
      status: "aborted" as const,
      truncated: false,
      commandsVisited: 0,
      jumps: 0,
      reason: "startup_control_start"
    };
    if (completedOpening) {
      this.finishOpeningWakeWithGetUpWalk(result, reference);
      return;
    }
    this.startupRunActive = false;
    this.startupMode = "startup";
    this.authoredOpeningCutsceneRunActive = false;
    if (completedOpening) {
      this.gameFlags.set(INTRO_BEDROOM_OPENING_DONE_FLAG);
      this.syncOverworldMusicCue();
    }
    this.liftBedroomNightOverlay();
    if (this.dialogue.open) {
      this.dialogue.close();
    }
    this.afterDialogueClosed();
    this.releaseOpeningCutsceneActorHolds();
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
    if (!this.newGameOpening || !legacyIntroMeteorBeatEnabled(this.data_.earlyGameSequence)) {
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
    if (!legacyIntroMeteorBeatEnabled(this.data_.earlyGameSequence)) {
      this.introMeteorBeat = undefined;
      return false;
    }
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
    this.refreshMenuScreens();
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

    if (trigger.archivistSpotId !== undefined) {
      lockPlayer(this.playerState, this.playerFrames);
      this.startArchivistStoryTrigger(trigger);
      this.syncPlayerObject();
      this.updatePrompt();
      this.publish();
      return true;
    }

    if (trigger.fx) {
      this.playStoryTriggerFxCue(trigger.fx);
    }
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

  private suppressStoryTriggerAtRestorePoint(): void {
    if (!this.restoredFromSave) {
      return;
    }
    const triggers = this.data_.storyTriggers?.triggers;
    if (!triggers || triggers.length === 0) {
      return;
    }
    this.suppressedTriggerId = storyTriggerSuppressionForRestore(
      triggers,
      this.playerState,
      (flag) => this.gameFlags.has(flag)
    );
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
    const routeOpenJustSet = Boolean(trigger.setFlags?.includes(ROUTE_OPEN_FLAG) && !this.gameFlags.has(ROUTE_OPEN_FLAG));
    if (isOnce(trigger)) {
      this.gameFlags.set(triggerFiredFlag(trigger.id));
    }
    trigger.setFlags?.forEach((flag) => this.gameFlags.set(flag));
    trigger.clearFlags?.forEach((flag) => this.gameFlags.unset(flag));
    this.grantStoryTriggerItems(trigger.grantItems);
    this.grantStoryTriggerCard(trigger.grantCardId, trigger.id);
    this.updateAct1NightTint({ fade: routeOpenJustSet });
    this.syncOverworldMusicAfterRouteOpen(routeOpenJustSet);
    this.reconcileRecruits({ announce: true });

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

  private grantStoryTriggerItems(itemIds: readonly number[] | undefined): void {
    if (!itemIds || itemIds.length === 0) {
      return;
    }
    const party = this.partyState.party();
    for (const itemId of itemIds) {
      if (party.some((charId) => this.partyState.inventory(charId).includes(itemId))) {
        continue;
      }
      const recipient = party.find((charId) => this.partyState.inventoryRoom(charId) > 0);
      if (recipient === undefined) {
        continue;
      }
      if (this.partyState.give(recipient, itemId)) {
        this.playInteractionSfx("itemGet");
      }
    }
    this.refreshMenuScreens();
  }

  /** Trigger-granted Card NFT: set the owned flag and run the binder ceremony overlay (Eight Sources reveals). */
  private grantStoryTriggerCard(cardId: string | undefined, triggerId: string): void {
    if (!cardId) {
      return;
    }
    const card = cardById(this.data_.cardNfts, cardId);
    if (!card) {
      this.warnStoryTriggerSkip(`card_missing:${triggerId}:${cardId}`);
      return;
    }
    const ownedFlag = cardOwnedFlag(card.id);
    if (this.gameFlags.has(ownedFlag)) {
      return;
    }
    this.gameFlags.set(ownedFlag);
    this.playInteractionSfx("itemGet");
    this.showBinderCardOverlay(card);
    this.refreshMenuScreens();
  }

  private startArchivistStoryTrigger(trigger: StoryTrigger): void {
    const spotId = trigger.archivistSpotId;
    const spot = spotId === undefined ? undefined : archivistSpotById(this.data_.archivistSpots, spotId);
    if (!spot) {
      this.warnStoryTriggerSkip(`archivist_missing_spot:${trigger.id}:${spotId ?? "none"}`);
      this.applyStoryTriggerEffects(trigger);
      return;
    }
    if (this.archivistSequence) {
      return;
    }
    const actor = this.createArchivistActor(spot);
    if (!actor) {
      this.warnStoryTriggerSkip(`archivist_actor_unavailable:${trigger.id}`);
      this.applyStoryTriggerEffects(trigger);
      return;
    }
    const sequence: ArchivistSequenceState = {
      trigger,
      spot,
      actor,
      phase: "slideIn",
      phaseElapsedMs: 0,
      slideTarget: this.archivistSlideTarget(spot),
      departTarget: this.archivistDepartTarget(spot),
      line: this.archivistLineForSpot(spot),
      filed: false
    };
    this.archivistSequence = sequence;
    this.syncArchivistActor(sequence);
  }

  private createArchivistActor(spot: ArchivistSpot): ArchivistActorRuntime | undefined {
    const spriteNpcId = this.data_.archivistSpots.archivist.spriteNpcId;
    const facing = facingToward(spot.photographer.x, spot.photographer.y, this.playerState.x, this.playerState.y);
    const queued = this.requestNpcRuntimeTexture(spriteNpcId, undefined);
    if (queued && !this.load.isLoading()) {
      this.load.start();
    }
    const frames = this.framesForNpc(spriteNpcId, undefined);
    const state = createPlayerState(spot.photographer.x, spot.photographer.y, facing, frames);
    const sprite = this.spawnNpcActor(spriteNpcId, state.x, state.y, undefined, facing);
    return { state, frames, sprite };
  }

  private archivistSlideTarget(spot: ArchivistSpot): { x: number; y: number } {
    const start = spot.photographer;
    const dx = spot.party1.x - start.x;
    const dy = spot.party1.y - start.y;
    const distanceToParty = Math.hypot(dx, dy);
    if (spot.slide.distance <= 0 || distanceToParty <= ARCHIVIST_PARTY_CLEARANCE_PX) {
      return { x: start.x, y: start.y };
    }
    const travel = Math.min(spot.slide.distance, Math.max(0, distanceToParty - ARCHIVIST_PARTY_CLEARANCE_PX));
    return {
      x: Math.round(start.x + (dx / distanceToParty) * travel),
      y: Math.round(start.y + (dy / distanceToParty) * travel)
    };
  }

  private archivistDepartTarget(spot: ArchivistSpot): { x: number; y: number } {
    const dx = spot.photographer.x - spot.party1.x;
    const dy = spot.photographer.y - spot.party1.y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      x: Math.round(spot.photographer.x + (dx / distance) * ARCHIVIST_DEPART_DISTANCE_PX),
      y: Math.round(spot.photographer.y + (dy / distance) * ARCHIVIST_DEPART_DISTANCE_PX)
    };
  }

  private archivistLineForSpot(spot: ArchivistSpot): string {
    const lines = this.data_.archivistSpots.archivist.lines;
    return lines[(spot.spotId - 1) % lines.length] ?? "Filed, not minted.";
  }

  private updateArchivistSequence(deltaMs: number): void {
    const sequence = this.archivistSequence;
    if (!sequence) {
      return;
    }
    sequence.phaseElapsedMs += Math.max(0, deltaMs);
    switch (sequence.phase) {
      case "slideIn":
        if (this.moveArchivistActor(sequence, sequence.slideTarget, deltaMs)) {
          this.beginArchivistPhase(sequence, "line");
        }
        break;
      case "line":
        if (sequence.phaseElapsedMs >= ARCHIVIST_LINE_MS) {
          this.destroyArchivistLine(sequence);
          this.beginArchivistPhase(sequence, "flash");
        }
        break;
      case "flash":
        if (!sequence.filed) {
          this.fileArchivistMoment(sequence);
        }
        if (sequence.phaseElapsedMs >= ARCHIVIST_FLASH_MS) {
          this.beginArchivistPhase(sequence, "depart");
        }
        break;
      case "depart":
        if (this.moveArchivistActor(sequence, sequence.departTarget, deltaMs)) {
          this.finishArchivistSequence(sequence);
        }
        break;
      default:
        break;
    }
  }

  private beginArchivistPhase(sequence: ArchivistSequenceState, phase: ArchivistSequencePhase): void {
    sequence.phase = phase;
    sequence.phaseElapsedMs = 0;
    if (phase === "line") {
      this.showArchivistLine(sequence);
    }
  }

  private moveArchivistActor(
    sequence: ArchivistSequenceState,
    target: { x: number; y: number },
    deltaMs: number
  ): boolean {
    const arrived = advanceCutsceneActorTowardTarget(sequence.actor.state, target, {
      deltaMs,
      speed: ARCHIVIST_SLIDE_SPEED_PX_PER_SEC,
      bounds: this.movementBounds(),
      frames: sequence.actor.frames,
      arrivalPx: CUTSCENE_ACTOR_MOVE_ARRIVAL_PX
    });
    this.syncArchivistActor(sequence);
    return arrived;
  }

  private syncArchivistActor(sequence: ArchivistSequenceState): void {
    const { state, frames, sprite } = sequence.actor;
    sprite.x = state.x;
    sprite.y = state.y;
    if (sprite instanceof Phaser.GameObjects.Sprite) {
      sprite.setFrame(state.animFrame);
    }
    this.setActorSortDepth(sprite);
    sprite.y = state.y;
    this.applyWalkMirror(sprite, this.spriteWalkMirrorNow(state.moving, frames, state.facing, this.data_.archivistSpots.archivist.spriteNpcId));
    sprite.setVisible(this.worldPointInsideActiveRoom(state));
  }

  private showArchivistLine(sequence: ArchivistSequenceState): void {
    this.destroyArchivistLine(sequence);
    const camera = this.cameras.main;
    const width = Math.min(ARCHIVIST_LINE_WIDTH_PX, Math.max(160, camera.width - 32));
    const rect = {
      x: Math.round((camera.width - width) / 2),
      y: 12,
      width,
      height: 42
    };
    const panel = this.add.graphics().setScrollFactor(0).setDepth(120);
    drawCleanPanel(panel, rect);
    const text = createCleanText(this, rect.x + 10, rect.y + 12, sequence.line, {
      fontSize: 13,
      fixedWidth: rect.width - 20,
      align: "center",
      wordWrapWidth: rect.width - 20
    }).setScrollFactor(0).setDepth(121);
    sequence.linePanel = panel;
    sequence.lineText = text;
    this.playInteractionSfx("readCue");
  }

  private destroyArchivistLine(sequence: ArchivistSequenceState): void {
    sequence.linePanel?.destroy();
    sequence.lineText?.destroy();
    sequence.linePanel = undefined;
    sequence.lineText = undefined;
  }

  private fileArchivistMoment(sequence: ArchivistSequenceState): void {
    sequence.filed = true;
    this.cameras.main.flash(ARCHIVIST_FLASH_MS, 255, 255, 255);
    this.playInteractionSfx("itemGet");
    const trigger = sequence.trigger;
    if (isOnce(trigger)) {
      this.gameFlags.set(triggerFiredFlag(trigger.id));
    }
    trigger.setFlags?.forEach((flag) => this.gameFlags.set(flag));
    trigger.clearFlags?.forEach((flag) => this.gameFlags.unset(flag));
    this.grantStoryTriggerItems(trigger.grantItems);
    this.refreshMenuScreens();
  }

  private finishArchivistSequence(sequence: ArchivistSequenceState): void {
    if (!sequence.filed) {
      this.fileArchivistMoment(sequence);
    }
    this.destroyArchivistLine(sequence);
    sequence.actor.sprite.destroy();
    if (this.archivistSequence === sequence) {
      this.archivistSequence = undefined;
    }
    if (!this.menuState.open && !this.dialogue.open && !this.eventSequence?.running && !this.isDoorFadeActive()) {
      unlockPlayer(this.playerState);
    }
    this.updatePrompt();
    this.publish();
  }

  private destroyArchivistSequence(): void {
    const sequence = this.archivistSequence;
    if (!sequence) {
      return;
    }
    this.destroyArchivistLine(sequence);
    sequence.actor.sprite.destroy();
    this.archivistSequence = undefined;
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
    // Act 1 opens SOLO: Bosch (Ness) alone. The other heroes fall in via the story
    // recruit beats (PARTY_RECRUITS) - Cloak at the Act-1 close, then Munch/Knight -
    // so the intro never shows a second hero before they are earned.
    const partyIds = [characters[0].id];
    const snapshot = this.partyState.snapshot();
    this.partyState.restore({
      ...snapshot,
      partyIds
    });
  }

  /** Branded Swagbound hero name for a charId (sprite-override party[]), else the roster name. */
  private heroDisplayName(charId: number): string {
    const branded = this.data_.spriteOverrides?.party?.[charId]?.name;
    if (branded) {
      return branded;
    }
    const character = this.data_.characters?.characters.find((entry) => entry.id === charId);
    return character?.name ?? `Hero ${charId}`;
  }

  private handlePartyCompositionChanged(): void {
    this.partyState.ensureVitalsFor(this.overworldHudPartyMembers());
    this.refreshMenuScreens();
    this.spawnFollower({ x: this.playerState.x, y: this.playerState.y }, this.playerState.facing);
    this.publish();
  }

  /**
   * Bring in any recruit whose story flag is now set but who isn't in the party yet.
   * Called on boot (silent - restoring a save that already has them) and after story
   * flags change during play (announced - the live "X joined!" beat). Idempotent.
   */
  private reconcileRecruits(options: { announce?: boolean } = {}): void {
    const active = new Set(this.partyState.party());
    const joined: string[] = [];
    for (const recruit of PARTY_RECRUITS) {
      if (active.has(recruit.charId) || !this.gameFlags.has(recruit.flag)) {
        continue;
      }
      this.partyState.partyOp("add", recruit.charId);
      joined.push(recruit.name);
    }
    if (joined.length === 0) {
      return;
    }
    this.handlePartyCompositionChanged();
    if (options.announce) {
      this.showRecruitNotice(joined);
    }
  }

  private showRecruitNotice(names: readonly string[]): void {
    this.recruitNoticeText = names.length === 1
      ? `✦ ${names[0]} joined the crew!`
      : `✦ ${names.join(" & ")} joined the crew!`;
    this.recruitNoticeUntilMs = this.time.now + 2400;
    this.updatePrompt();
    this.publish();
  }

  private showObjectiveNotice(): void {
    const objective = this.currentObjectiveText();
    if (!objective) {
      return;
    }
    this.recruitNoticeText = `Next: ${objective}`;
    this.recruitNoticeUntilMs = this.time.now + 5000;
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

    // In boss-edit mode every gate is force-spawned (ignoring flag gating) so the
    // author can position all of them, and gates never arm or trigger battles.
    const editing = this.bossEditor !== undefined;
    const active = editing
      ? triggers.filter((trigger) => trigger.boss && trigger.battleGroup !== undefined)
      : selectActiveBossGates(triggers, (flag) => this.gameFlags.has(flag));
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
      if (!editing && !actor.armed && this.distanceToPlayer(actor) > BOSS_GATE_ARM_DIST_PX) {
        actor.armed = true;
      }
    }

    this.publishBossGateDebug();
    if (editing) {
      this.bossEditor?.refresh();
      this.collisionEditor?.refresh();
      return false;
    }
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
    sprite.setVisible(this.bossGateActorVisible(actor));
  }

  private bossGateActorVisible(actor: BossGateRuntime): boolean {
    return this.worldPointInsideActiveRoom(actor)
      && !(actor.textureKey && !(actor.sprite instanceof Phaser.GameObjects.Sprite));
  }

  private triggerBossGate(actor: BossGateRuntime): boolean {
    actor.armed = false;
    const trigger = actor.trigger;
    if (trigger.fx) {
      this.playStoryTriggerFxCue(trigger.fx);
    }
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
      const routeOpenJustSet = Boolean(trigger.setFlags?.includes(ROUTE_OPEN_FLAG) && !this.gameFlags.has(ROUTE_OPEN_FLAG));
      if (isOnce(trigger)) {
        this.gameFlags.set(triggerFiredFlag(trigger.id));
      }
      trigger.setFlags?.forEach((flag) => this.gameFlags.set(flag));
      trigger.clearFlags?.forEach((flag) => this.gameFlags.unset(flag));
      this.grantStoryTriggerItems(trigger.grantItems);
      this.updateAct1NightTint({ fade: routeOpenJustSet });
      this.syncOverworldMusicAfterRouteOpen(routeOpenJustSet);
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

  // --- Boss placement editor host (?bossedit=1) ------------------------------

  private bossEditorListBosses(): BossEditorEntry[] {
    return [...this.bossGateActors.values()].map((actor) => ({
      triggerId: actor.triggerId,
      enemyGroup: actor.enemyGroup,
      enemyName: this.enemiesForBattleGroup(actor.enemyGroup)[0]?.name,
      x: Math.round(actor.x),
      y: Math.round(actor.y),
      facing: actor.facing
    }));
  }

  private bossEditorMoveBoss(triggerId: string, x: number, y: number): void {
    const actor = this.bossGateActors.get(triggerId);
    if (!actor) {
      return;
    }
    actor.x = x;
    actor.y = y;
    this.syncBossGateActor(actor);
  }

  private bossEditorSetFacing(triggerId: string, facing: BossFacing): void {
    const actor = this.bossGateActors.get(triggerId);
    if (!actor) {
      return;
    }
    actor.facing = facing;
    this.syncBossGateActor(actor);
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
    const sequence = this.data_.earlyGameSequence;
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && !openingRoamersAllowed(sequence, this.gameFlags)) {
      this.clearOverworldRoamers();
      this.publishOverworldEnemyDebug();
      return false;
    }
    if (!shouldRunOverworldRoamers(this.openingRoamerHold)) {
      this.clearOverworldRoamers();
      this.publishOverworldEnemyDebug();
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
        y: Math.round(enemy.state.player.y),
        flees: enemy.flees,
        archetype: enemy.archetype,
        facing: enemy.state.player.facing,
        moving: enemy.state.player.moving
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
        this.stepOverworldEnemyBehavior(enemy, deltaMs);
      }
      this.upgradeOverworldEnemySprite(enemy);
      this.syncOverworldEnemy(enemy);
    }
  }

  /** Nearest canopy walk-behind cell (0x02, walkable, footprint-clear) near a spawn spot. */
  private findAmbushCanopySpot(origin: { x: number; y: number }): { x: number; y: number } | undefined {
    const grid = this.collisionGrid();
    const cx0 = Math.floor(origin.x / grid.cellSize);
    const cy0 = Math.floor(origin.y / grid.cellSize);
    let best: { x: number; y: number; d2: number } | undefined;
    for (let dy = -OVERWORLD_AMBUSH_SEARCH_CELLS; dy <= OVERWORLD_AMBUSH_SEARCH_CELLS; dy += 1) {
      for (let dx = -OVERWORLD_AMBUSH_SEARCH_CELLS; dx <= OVERWORLD_AMBUSH_SEARCH_CELLS; dx += 1) {
        const cellX = cx0 + dx;
        const cellY = cy0 + dy;
        if (cellX < 0 || cellY < 0 || cellX >= grid.width || cellY >= grid.height) {
          continue;
        }
        if (!isFgUpperSurface(surfaceAtCell(this.surfaceRows, cellX, cellY))) {
          continue;
        }
        const point = { x: cellX * grid.cellSize + grid.cellSize / 2, y: cellY * grid.cellSize + grid.cellSize / 2 };
        if (!walkableFootprintClear(point, this.solidRows, grid)) {
          continue;
        }
        // Keep the hideout outside the spring radius, or the ambush triggers the
        // instant it spawns and just reads as a prowler.
        if (this.distanceToPlayer(point) < OVERWORLD_AMBUSH_TRIGGER_PX + 16) {
          continue;
        }
        const d2 = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
        if (!best || d2 < best.d2) {
          best = { ...point, d2 };
        }
      }
    }
    return best ? { x: best.x, y: best.y } : undefined;
  }

  /**
   * EarthBound roamer behavior: a fleeable group (party can instant-win it) RUNS from the
   * player once it's close; a fightable group CHASES when the player comes within detection
   * range; otherwise it wanders. Facing follows the move direction, so touchAdvantage still
   * reads the green/red swirl correctly (you catch a fleeing enemy from behind = party first).
   */
  private stepOverworldEnemyBehavior(enemy: OverworldEnemyRuntime, deltaMs: number): void {
    const dist = this.distanceToPlayer(enemy.state.player);
    if (enemy.archetype === "ambusher") {
      if (dist > OVERWORLD_AMBUSH_TRIGGER_PX) {
        return; // lying in wait under the canopy - no wander, no chase
      }
      // Sprung: burst out and hunt like a prowler from here on.
      enemy.archetype = "prowler";
      enemy.ambushBurstUntilMs = this.time.now + OVERWORLD_AMBUSH_BURST_MS;
    }
    if (dist <= OVERWORLD_ENEMY_FLEE_DETECT_PX) {
      // Recompute vs the CURRENT party (it may have leveled up since spawn), so a group that
      // is now instant-winnable FLEES instead of chasing. Only in the engagement band, so it's
      // at most a few checks per frame. __debugSetRoamerFlees can force it on for testing.
      enemy.flees = enemy.debugForceFlee === true
        || this.encounterAdvantageForGroup(enemy.enemyGroup) === "instantWin";
      if (enemy.flees) {
        this.stepOverworldEnemyDirected(enemy, deltaMs, true, OVERWORLD_ENEMY_FLEE_SPEED_PX_PER_SEC);
        return;
      }
      if (dist <= OVERWORLD_ENEMY_CHASE_DETECT_PX) {
        const burst = enemy.ambushBurstUntilMs !== undefined && this.time.now < enemy.ambushBurstUntilMs;
        this.stepOverworldEnemyDirected(
          enemy,
          deltaMs,
          false,
          burst ? OVERWORLD_AMBUSH_BURST_SPEED_PX_PER_SEC : OVERWORLD_ENEMY_CHASE_SPEED_PX_PER_SEC
        );
        return;
      }
    }
    stepNpc(enemy.state, {
      deltaMs,
      bounds: this.movementBounds(),
      // Respect terrain (walls/water) but pass through actors so they can reach the player.
      blocked: (x, y) => this.blocked(x, y),
      frames: enemy.frames
    });
  }

  /** Step a roamer straight toward (chase) or away from (flee) the player at `speed`. */
  private stepOverworldEnemyDirected(
    enemy: OverworldEnemyRuntime,
    deltaMs: number,
    away: boolean,
    speed: number
  ): void {
    const actor = enemy.state.player;
    const sign = away ? -1 : 1;
    const dx = (this.playerState.x - actor.x) * sign;
    const dy = (this.playerState.y - actor.y) * sign;
    // Small deadzone so a near-aligned axis doesn't jitter left/right every frame.
    const deadzone = 2;
    const input: MoveInput = {
      left: dx < -deadzone,
      right: dx > deadzone,
      up: dy < -deadzone,
      down: dy > deadzone
    };
    stepPlayer(actor, input, {
      deltaMs,
      speed,
      bounds: this.movementBounds(),
      blocked: (x, y) => this.blocked(x, y),
      frames: enemy.frames
    });
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
    actor.y = enemy.state.player.y;
    this.applyWalkMirror(actor, this.spriteWalkMirrorNow(
      enemy.state.player.moving,
      enemy.frames,
      enemy.state.player.facing,
      enemy.enemyGroup
    ));
    actor.setVisible(this.overworldEnemyActorVisible(enemy));
  }

  private overworldEnemyActorVisible(enemy: OverworldEnemyRuntime): boolean {
    return this.worldPointInsideActiveRoom(enemy.state.player)
      && !(enemy.textureKey && !(enemy.sprite instanceof Phaser.GameObjects.Sprite));
  }

  private canSpawnOverworldEnemy(): boolean {
    return this.encounterEnabled
      && shouldRunOverworldRoamers(this.openingRoamerHold)
      && this.encounterCooldownMs <= 0
      && this.overworldEnemySpawnCooldownMs <= 0
      && this.overworldEnemies.size < OVERWORLD_ENEMY_GLOBAL_CAP
      && this.overworldPlayActive();
  }

  private trySpawnOverworldEnemy(options: { forceArchetype?: "ambusher" | "prowler" } = {}): void {
    if (!shouldRunOverworldRoamers(this.openingRoamerHold)) {
      return;
    }
    const sector = this.currentEncounterSector();
    const budget = sectorSpawnBudget(sector, { maxPerSector: OVERWORLD_ENEMY_GLOBAL_CAP });
    if (budget <= 0 || this.overworldEnemies.size >= budget) {
      return;
    }
    const enemyGroup = selectSectorEnemyGroup(sector, () => this.encounterRng.next(), {
      isFlagSet: (flag) => this.gameFlags.isSet(flag),
      battleRules: this.data_.battleRules,
      roamerZoneCaps: this.data_.roamerZoneCaps,
      worldPixel: { x: this.playerState.x, y: this.playerState.y }
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
    // Some spawns become ambushers: relocate onto a nearby canopy walk-behind cell
    // where the foreground art hides them until sprung.
    const rollAmbush =
      options.forceArchetype === "ambusher" ||
      (options.forceArchetype === undefined && this.encounterRng.next() < OVERWORLD_AMBUSHER_CHANCE);
    const ambushSpot = rollAmbush ? this.findAmbushCanopySpot(spot) : undefined;
    const spawnAt = ambushSpot ?? spot;
    this.overworldEnemySpawnCooldownMs = OVERWORLD_ENEMY_SPAWN_INTERVAL_MS;
    const spriteGroup = lead.overworldSprite;
    const { textureKey, skin, frames } = this.resolveOverworldEnemySkin(lead);
    this.overworldEnemySeq += 1;
    const key = `enemy-${this.overworldEnemySeq}`;
    const sprite = this.spawnOverworldEnemyActor(spawnAt.x, spawnAt.y, undefined, textureKey, skin, spriteGroup);
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
      flees: this.encounterAdvantageForGroup(enemyGroup) === "instantWin",
      archetype: ambushSpot ? "ambusher" : "prowler",
      state: createNpcState(spawnAt.x, spawnAt.y, toFacing(undefined), {
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

  private clearOverworldRoamers(): void {
    for (const enemy of this.overworldEnemies.values()) {
      enemy.sprite?.destroy();
    }
    this.overworldEnemies.clear();
    this.overworldEnemySpawnCooldownMs = 0;
  }

  private clearOverworldEnemies(): void {
    this.clearOverworldRoamers();
    for (const actor of this.bossGateActors.values()) {
      actor.sprite?.destroy();
    }
    this.bossGateActors.clear();
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
    const sequence = this.data_.earlyGameSequence;
    const gatesActive = openingGatesActive(sequence, this.gameFlags);
    if (gatesActive && source === "encounter" && !openingEncountersAllowed(sequence, this.gameFlags)) {
      return false;
    }
    if (!this.data_.battle || !this.battleGroupExists(group) || !this.player) {
      return false;
    }
    this.clearStartupPajamaVisualState();
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
    this.clearStartupPajamaVisualState();
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
    // Show the same EXP/money/items/level-up tally a fought battle would, instead of a bare
    // "You won!" - the rewards were always computed, just never surfaced. Plus a victory sting
    // (the instant-win skips the battle scene and its audio).
    this.transitionSfx.victory();
    const tally = buildVictorySummaryViewModel(rewards.summary).pages.map((lines) => lines.join("\n"));
    this.dialogue.start(buildInlineDialoguePages(["You won!", ...tally]));
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

  /** Members with equip bonuses folded in - for advantage math and debug readouts ONLY, never persistence. */
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
    // DEV: run an arbitrary staging sequence (music/camera/fx/move) through the real
    // host so staging ops can be pixel-verified without authoring+building content.
    (globalThis as Record<string, unknown>).__runStagingDemo = (steps: CutsceneStep[]): boolean => {
      if (!Array.isArray(steps) || steps.length === 0) { return false; }
      lockPlayer(this.playerState, this.playerFrames);
      const runner = new CutsceneRunner(steps, this.createCutsceneHost(), () => {
        this.cutsceneRunner = undefined;
        this.restoreCutsceneStaging(false);
        unlockPlayer(this.playerState);
      });
      if (runner.running) { this.cutsceneRunner = runner; }
      return true;
    };
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
    return selectSectorEnemyGroup(sector, () => 0, {
      isFlagSet: (flag) => this.gameFlags.isSet(flag),
      battleRules: this.data_.battleRules,
      roamerZoneCaps: this.data_.roamerZoneCaps,
      worldPixel: { x: this.playerState.x, y: this.playerState.y }
    }) ?? undefined;
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
    this.clearActiveDeliverySprite();
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
    const sourceCheckId = this.pendingSourceCheckEntryId;
    this.pendingSourceCheckEntryId = undefined;
    if (sourceCheckId) {
      this.launchPendingSourceCheck(sourceCheckId);
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
    this.updateCameraRoomBounds();
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
    this.pendingSourceCheckEntryId = undefined;
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
      `collision overlay: ${this.collisionOverlayEnabled ? "on" : "off"} | FG tune: __fgClearAt(x,y,w,h)`,
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

  private resolveWalkableWarpPoint(
    destination: { x: number; y: number },
    alignToDoors = false
  ): DoorWarpLanding {
    return resolveDoorWarpLanding(
      this.clampSpawn(destination),
      this.solidRows,
      this.collisionGrid(),
      {
        maxRingCells: 8,
        ...(alignToDoors
          ? {
              doors: this.activeDoors().filter((door) => isDistinctWarpTransition(door)),
              maxAlignmentRingCells: 10
            }
          : {})
      }
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
    this.player.y = this.playerState.y;
    this.applyWalkMirror(this.player, this.spriteWalkMirrorNow(
      this.playerState.moving,
      this.playerFrames,
      this.playerState.facing,
      0
    ));
    this.applyPlayerVisualState();
    this.updateFollower();
  }

  private playerStateSheetKey(state: string, sheet?: Pick<RuntimeSpriteStateSheet, "image">): string {
    const imageHash = sheet?.image ? `-${stableAssetPathHash(sheet.image)}` : "";
    return `sprite-override-player-state-${state}${imageHash}`;
  }

  private legacyPlayerStateSheetKey(state: string): string {
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
    const states = this.playerSpriteOverride()?.states as Record<string, RuntimeSpriteStateSheet> | undefined;
    const sheet = states?.[baseState];
    if (!sheet) {
      return undefined;
    }
    const key = this.playerStateSheetKey(baseState, sheet);
    if (this.textures.exists(key)) {
      return key;
    }
    const legacyKey = this.legacyPlayerStateSheetKey(baseState);
    return this.textures.exists(legacyKey) ? legacyKey : undefined;
  }

  private playerDefaultSheetKey(): string | undefined {
    const override = spriteOverrideSheet(this.playerSpriteOverride());
    if (override && this.textures.exists(PLAYER_SPRITE_OVERRIDE_SHEET_KEY)) {
      return PLAYER_SPRITE_OVERRIDE_SHEET_KEY;
    }
    const spriteGroup = this.world_.player.spriteGroup;
    const key = spriteGroup !== undefined ? `sheet-${spriteGroup}` : undefined;
    return key && this.textures.exists(key) ? key : undefined;
  }

  private playerBaseScale(): number {
    const override = spriteOverrideSheet(this.playerSpriteOverride());
    return override ? spriteOverrideScale(override.displayHeight, override.frameHeight) : 1;
  }

  /** Live visual-state inputs: real signals merged under forced overrides (forced wins, for tests/cutscenes). */
  private currentVisualStateInputs(): VisualStateInputs {
    const base = defaultVisualStateInputs();
    const scene = this.sceneVisualState;
    const forced = this.forcedVisualState;
    return {
      ...base,
      deepWater: this.isPlayerInWater(), // real terrain signal (3a)
      lowerBodyHidden: this.isPlayerOnLowerHideCell(), // EB 0x01-only cell: tall grass / shrub top / roof crest
      onLadder: this.isPlayerOnLadderCell(), // real terrain signal: feet on an EB 0x10 cell
      riding: this.bikeActive ? ("bike" as const) : null,
      ko: this.leadPartyMemberDowned(), // real KO signal: lead at 0 HP -> dead/ghost overworld sprite
      invertPalette: this.playerInUnlistedRoomMusicArea(),
      // rope/bike real triggers await a mount mechanic; forced-path for now.
      ...scene,
      ...forced,
      status: {
        ...base.status,
        mushroomized: this.leadHasStatus("confused"),
        sweating: this.leadHasSunstroke(),
        ...(scene.status ?? {}),
        ...(forced.status ?? {})
      }
    };
  }

  private currentPlayerVisualStateDebug():
    | (ResolvedVisualState & { sheetSwapped: boolean; applied: { scale: number; alpha: number; tint: number | null } })
    | undefined {
    const resolved = resolvePlayerVisualState(this.currentVisualStateInputs());
    if (this.player instanceof Phaser.GameObjects.Sprite) {
      this.applyPlayerVisualState();
      return this.lastResolvedVisualState
        ? {
            ...this.lastResolvedVisualState,
            sheetSwapped: this.lastVisualSheetSwapped,
            applied: this.lastVisualApplied
          }
        : undefined;
    }
    return {
      ...resolved,
      sheetSwapped: this.loadedStateSheetKey(resolved.baseState) !== undefined,
      applied: this.lastVisualApplied
    };
  }

  private playerInUnlistedRoomMusicArea(): boolean {
    return this.resolvedOverworldMusicCueForPlayer() === musicAreaCueId("the-unlisted-room");
  }

  /** Live sweat-overlay signal: the lead carries the sunstroke field ailment. */
  private leadHasSunstroke(): boolean {
    return this.leadHasStatus("sunstroke");
  }

  private leadHasStatus(ailment: StatusAilment): boolean {
    const leadId = this.partyState.party()[0];
    return leadId !== undefined && hasStatus(this.partyState.statuses(leadId), ailment);
  }

  /** The lead (front) party member is downed (0 HP) - shows the dead overworld sprite. */
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
      return isWaterSurface(surface);
    } catch {
      return false;
    }
  }

  private isPlayerOnLowerHideCell(): boolean {
    try {
      const grid = this.collisionGrid();
      const feet = { x: this.playerState.x, y: this.playerState.y };
      const surface = surfaceAtWorldPixel(this.surfaceRows, feet, grid);
      if (!isFgLowerOnlySurface(surface)) {
        return false;
      }
      // A 0x01 lower-hide cell sitting directly on top of a SOLID cell is a wall-top /
      // curb edge, not tall grass. There the foreground wall art already hides the legs,
      // so the extra sprite crop over-hides and leaves a floating torso at the ledge.
      // Only crop over open lower-hide terrain (grass/shrub), where nothing else covers.
      const below = { x: feet.x, y: feet.y + this.collisionCellSize };
      if (solidAtWorldPixel(this.solidRows, below, grid)) {
        return false;
      }
      // An authored FG clear rect declares "nothing covers sprites here", so the
      // lower-body crop must not fire inside one either (fixes 0x01 cells baked
      // onto interior rugs, e.g. the dorm at 7201,583 leaving a floating torso).
      for (const clear of [...(this.data_.fgOverrides?.clears ?? []), ...this.sessionFgClears]) {
        if (feet.x >= clear.x && feet.x < clear.x + clear.w && feet.y >= clear.y && feet.y < clear.y + clear.h) {
          return false;
        }
      }
      return true;
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
    } else if (!stateSheetKey) {
      const defaultSheetKey = this.playerDefaultSheetKey();
      if (defaultSheetKey && sprite.texture.key !== defaultSheetKey) {
        sprite.setTexture(defaultSheetKey);
      }
    }

    // With a faithful sheet, no approximation; without one, fall back to the generic look-alike.
    const approx = sheetSwapped ? {} : resolved.approximation;
    const scale = this.playerBaseScale() * (approx.scale ?? 1);
    sprite.setScale(scale);
    const alpha = approx.alpha ?? 1;
    sprite.setAlpha(alpha);
    if (resolved.sleeping) {
      sprite.setAngle(-90);
      sprite.setDepth(BED_SLEEP_PLAYER_DEPTH);
    } else if (sprite.angle !== 0) {
      sprite.setAngle(0);
    }

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
    } else if (resolved.transforms.lowerBodyClip && ov?.frameHeight && ov?.frameWidth) {
      // EB 0x01 cell: the map art (tall grass, shrub top, roof crest) hides the
      // actor's lower body. Hide ~8 world px of feet; unlike waterClip the sprite
      // stays put - the background art IS the "cover", so no raise.
      sprite.setCrop(0, 0, ov.frameWidth, ov.frameHeight - lowerHideFramePx(ov.frameHeight, scale));
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
      return; // solo party - no follower to draw
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
      // Door/warp jump - snap over rather than streaking the followers across the map.
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
    follower.sprite.y = target.y;
    this.applyWalkMirror(follower.sprite, this.spriteWalkMirrorNow(walking, follower.frames, target.facing, follower.joinOrder));
    this.setActorSortDepth(follower.sprite);
    this.applyFollowerVisualState(follower, target.facing);
  }

  private followerStateSheetKey(joinOrder: number, state: string, sheet?: Pick<RuntimeSpriteStateSheet, "image">): string {
    const imageHash = sheet?.image ? `-${stableAssetPathHash(sheet.image)}` : "";
    return joinOrder === 2
      ? `sprite-override-follower-state-${state}${imageHash}`
      : `sprite-override-follower-${joinOrder}-state-${state}${imageHash}`;
  }

  private legacyFollowerStateSheetKey(joinOrder: number, state: string): string {
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
    const states = this.followerSpriteOverride(follower.joinOrder)?.states as Record<string, RuntimeSpriteStateSheet> | undefined;
    const sheet = states?.[baseState];
    if (!sheet) {
      return undefined;
    }
    const key = this.followerStateSheetKey(follower.joinOrder, baseState, sheet);
    if (this.textures.exists(key)) {
      return key;
    }
    const legacyKey = this.legacyFollowerStateSheetKey(follower.joinOrder, baseState);
    return this.textures.exists(legacyKey) ? legacyKey : undefined;
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
    } else if (resolved.transforms.lowerBodyClip && ov?.frameHeight && ov?.frameWidth) {
      // Shared with the lead like waterClip (the chain walks the same footsteps,
      // so per-member terrain sampling would only differ for transition frames).
      sprite.setCrop(0, 0, ov.frameWidth, ov.frameHeight - lowerHideFramePx(ov.frameHeight, scale));
    } else if (sprite.isCropped) {
      sprite.setCrop();
    }
  }

  private setActorSortDepth(actor: SortableActor, renderLayer: SpriteRenderLayer = "world"): void {
    const bottomY = spriteBottomY({
      y: actor.y,
      originY: actor.originY,
      displayHeight: actor.displayHeight
    });
    // Tiebreak by x so actors sharing a row (e.g. a crowd of NPCs at the same y)
    // layer deterministically left-behind-right instead of stacking at one depth.
    // The fraction stays < 1 so the y-row ordering always dominates.
    const tiebreak = Number.isFinite(actor.x) ? ((actor.x % 4096) + 4096) % 4096 / 4096 * 0.5 : 0;
    actor.setDepth(spriteSortDepth(bottomY, renderLayer) + tiebreak);
  }

  /**
   * EB walk step for a moving single-frame sprite: phase 1 renders the frame
   * horizontally MIRRORED (EarthBound's hard frame swap; many EB walk cycles are
   * literally frame + mirror). False for idle sprites and multi-frame sprites
   * (raw EB / player walk cycles) that already animate. Visual only: callers
   * apply it as flipX, never touching sort order, collision, or position.
   */
  private spriteWalkMirrorNow(
    moving: boolean,
    frames: DirectionFrameSequence,
    facing: Facing,
    seed: number
  ): boolean {
    return spriteWalkMirror({
      clockMs: this.spriteWalkBobClockMs,
      seed,
      moving,
      frameCount: frames[facing].length
    });
  }

  /** Apply the EB step mirror to a textured actor (no-op for untextured stand-ins). */
  private applyWalkMirror(actor: object, mirror: boolean): void {
    const flippable = actor as { setFlipX?: (v: boolean) => unknown };
    if (typeof flippable.setFlipX === "function") {
      flippable.setFlipX(mirror);
    }
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
    return [
      ...this.data_.overworldInteractables.interactables.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      x: entry.worldPixel.x,
      y: entry.worldPixel.y,
      ...(entry.label ? { label: entry.label } : {}),
      ...(entry.kind === "present" ? { opened: this.overworldInteractableOpened(entry) } : {})
      })),
      ...[...this.sourceCheckActors.values()].map((runtime) => ({
        id: runtime.check.id,
        kind: "sourceCheck" as const,
        x: runtime.check.placement.worldPixel.x,
        y: runtime.check.placement.worldPixel.y,
        label: runtime.visible ? drifellaDisplayName(runtime.check) : "hidden"
      }))
    ];
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
    this.publishBinderDebug();
    this.publishArchivistDebug();
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
      dialogueChoice: this.dialogue.choice
        ? {
            options: this.dialogue.choice.options.map((option) => option.label),
            selectedIndex: this.dialogue.choice.selectedIndex
          }
        : undefined,
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
      ...(import.meta.env.DEV ? { partyMembers: this.overworldPartyMembersDebug() } : {}),
      overworldHud: this.overworldStatusHud(),
      shopOpen: this.menuState.open && this.activeShopStoreId !== undefined,
      binderOverlayOpen: this.binderOverlayOpen,
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

  private publishBinderDebug(): void {
    (globalThis as Record<string, unknown>).__binderDebug = () => {
      const binder = buildBinderViewModel(this.data_.cardNfts, this.gameFlags);
      return {
        owned: binder.owned,
        total: binder.total,
        byRegion: Object.fromEntries(binder.regions.map((region) => [
          region.id,
          {
            owned: region.owned,
            total: region.total
          }
        ]))
      };
    };
  }

  private publishArchivistDebug(): void {
    (globalThis as Record<string, unknown>).__archivistDebug = () => {
      const records = buildArchivistRecordsViewModel(this.data_.archivistSpots, this.gameFlags);
      const firstSpot = this.data_.archivistSpots.spots[0];
      return {
        spriteId: this.data_.archivistSpots.archivist.spriteId,
        spriteNpcId: this.data_.archivistSpots.archivist.spriteNpcId,
        spotCount: this.data_.archivistSpots.spots.length,
        filed: records.filed,
        total: records.total,
        activeSpotId: this.archivistSequence?.spot.spotId,
        firstSpotAnchor: firstSpot ? { ...firstSpot.anchor } : undefined,
        firstSpotFlag: firstSpot?.flag.name
      };
    };
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

function cutsceneMoveRouteDistancePx(
  from: { x: number; y: number },
  waypoints: readonly NavmeshPoint[] | undefined,
  target: { x: number; y: number }
): number {
  let distance = 0;
  let cursor = from;
  const points = waypoints && waypoints.length > 0 ? waypoints : [target];
  for (const point of points) {
    distance += Math.hypot(point.x - cursor.x, point.y - cursor.y);
    cursor = point;
  }
  return distance;
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

function clampDebugPartyLevel(value: number): number {
  const numeric = Number.isFinite(value) ? value : MIN_DEBUG_PARTY_LEVEL;
  return Math.min(MAX_DEBUG_PARTY_LEVEL, Math.max(MIN_DEBUG_PARTY_LEVEL, Math.floor(numeric)));
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

function nonWhitespaceCount(value: string): number {
  let count = 0;
  for (const char of value) {
    if (/\S/.test(char)) {
      count += 1;
    }
  }
  return count;
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

function buildCellBounds(
  minCellX: number,
  maxCellX: number,
  minCellY: number,
  maxCellY: number
): ConnectedRoomBounds["walkableCellBounds"] {
  const widthCells = maxCellX - minCellX + 1;
  const heightCells = maxCellY - minCellY + 1;
  return {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY,
    widthCells,
    heightCells,
    areaCells: widthCells * heightCells
  };
}

function rectangularMaskRangesForBounds(
  bounds: ConnectedRoomBounds["walkableCellBounds"]
): ConnectedRoomBounds["maskCellRanges"] {
  const ranges: ConnectedRoomBounds["maskCellRanges"] = [];
  for (let cellY = bounds.minCellY; cellY <= bounds.maxCellY; cellY += 1) {
    ranges.push({ cellY, minCellX: bounds.minCellX, maxCellX: bounds.maxCellX });
  }
  return ranges;
}

function cellBoundsForMaskRanges(
  ranges: ConnectedRoomBounds["maskCellRanges"]
): ConnectedRoomBounds["maskCellBounds"] | undefined {
  if (ranges.length === 0) {
    return undefined;
  }
  let minCellX = ranges[0].minCellX;
  let maxCellX = ranges[0].maxCellX;
  let minCellY = ranges[0].cellY;
  let maxCellY = ranges[0].cellY;
  for (const range of ranges.slice(1)) {
    minCellX = Math.min(minCellX, range.minCellX);
    maxCellX = Math.max(maxCellX, range.maxCellX);
    minCellY = Math.min(minCellY, range.cellY);
    maxCellY = Math.max(maxCellY, range.cellY);
  }
  return buildCellBounds(minCellX, maxCellX, minCellY, maxCellY);
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
