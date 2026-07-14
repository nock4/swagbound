import Phaser from "phaser";
import {
  ItemCollectionSchema,
  PsiCollectionSchema,
  UsabilityMatrixSchema,
  BossBattleDialogueSchema,
  type AttestationBattles,
  type BackgroundOverrides,
  type BattleBackground,
  type BattleData,
  type BattleEnemy,
  type BattleGroup,
  type CardNfts,
  type BattleRules,
  type CharacterCollection,
  type DrifellaSourceCheck,
  type FontCollection,
  type ItemCollection,
  type ItemData,
  type MusicManifest,
  type PsiCollection,
  type PsiData,
  type SpriteOverrides,
  type UsabilityMatrix,
  type WindowCollection
} from "@eb/schemas";
import { expandBattleGroupEnemies } from "./battleGroups";
import { applyCongregationScaling } from "./congregationScaling";
import {
  applyVictoryRewards,
  advanceVictorySummaryPageIndex,
  advanceBattleRound,
  battleRngSeedForGroup,
  buildVictorySummaryViewModel,
  combatantAt,
  commandsForCharId,
  createBattleRng,
  createBattleState,
  firstLivingIndex,
  isCombatantAlive,
  isPendingPartyMortalWound,
  learnedPsiForCombatant,
  outcome,
  psiBattleKind,
  psiPpCost,
  psiTargetMode,
  psiTargetSide,
  resolveInstantWinRewards,
  settlePendingPartyMortalWounds,
  tickBattleMeters,
  type BattleActor,
  type BattleCommand,
  type Combatant,
  type BattleOutcome,
  type BattleState,
  type BattleVictorySummary,
  type EncounterAdvantage,
  type InstantWinRewardOptions,
  type PlayerCombatantOptions,
  type Rng
} from "./battleLogic";
import {
  encounterAdvantageTurnOrder,
  autoPassBlockedPartyCommands,
  nextInputState,
  partyCommandInputOrder,
  partyInputOrder,
  resolveRoundStep,
  resolveRoundStartPriority,
  shouldRunEnemyFirstStrikeBeforeInput,
  type BattleRoundStepResult,
  type BattleRoundInputState,
  type QueuedCommand
} from "./battleRound";
import { composeBattleStepLines } from "./battleMessages";
import {
  bossHpFraction,
  resolveBossTaunts,
  shouldQueueLowHpTaunt,
  wrapTauntLines,
  type ResolvedBossTaunts
} from "./bossTaunts";
import {
  battleEventsHaveEnemyDefeated,
  battleEventsHaveMiss,
  battleEventsHaveSmash,
  firstBattleAction,
  firstBattleDamage,
  type BattleEvent
} from "./battleEvents";
import { elementalAffinity, psiElementForId } from "./battleAffinities";
import {
  battleReturnGuardAction,
  type BattleReturnContext,
  type BattleReturnOutcome,
  type ChunkedWorldRestore
} from "./battleReturn";
import {
  DEFAULT_DAMAGE_FLASH_MS,
  attackerLungeOffset,
  flashOverlayState,
  flashState,
  hitSparkState,
  psiBattleAnimationForPsi,
  screenShakeOffset,
  type EffectDirection,
  type PsiBattleAnimationDefinition
} from "./battleEffects";
import { publishBattleDebug, type BattlePhase, type BattleTransitionPhase } from "./state";
import {
  CLEAN_UI_GRID_COLUMNS,
  CLEAN_UI_HP,
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_PP,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_CARET,
  CLEAN_UI_SELECTION_TEXT,
  CLEAN_UI_TRACK,
  CLEAN_UI_TRACK_ALPHA,
  cleanGridCells,
  cleanLineHeight,
  cleanPanelInnerRect,
  createCleanText,
  drawCleanCaret,
  drawCleanPanel,
  drawCleanSelection,
  estimateCleanTextWidth,
  formatCleanOdometerValue,
  moveBattleCommandGridIndex,
  statusBarFillFraction,
  type BattleCommandGridDirection,
  type CleanGridCell
} from "./cleanUi";
import { activeWindowFlavorId } from "./windowSettings";
import {
  type CanvasRect,
  battleStatusCardRects,
  contentFitWindowRect
} from "./windowLayout";
import {
  battleItemEffectDescription,
  battleSubmenuGridVisibleCells,
  enemyTargetModeForCommand,
  moveBattleSubmenuGridIndex
} from "./battleMenuFlow";
import { targetScopeForPsiMenu } from "./menuModel";
import { battleUsablePsi, canUsePsiInBattle } from "./usabilityMatrix";
import {
  PSI_STRENGTH_ORDER,
  buildPsiMenuRows,
  normalizedPsiStrength,
  psiStrengthGlyph
} from "./psiPresentation";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_LEFT_KEY_NAMES,
  MENU_RIGHT_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import { DevConsole, type DevConsoleHost, type DevLiveState } from "./devConsole";
import { postDevNote, type DevNoteContext } from "./devNotes";
import { isMusicAuditionerVisible, toggleMusicAuditioner } from "./musicAuditioner";
import { combatantBaseStats, type PartyMember } from "./characterModel";
import type { PartyBattleMemberSnapshot, PartyStateSnapshot } from "./partyState";
import { decodeItemUseEffect } from "./partyState";
import { statusBadgeLabel, stripBattleScopedStatuses, type StatusState } from "./statusEffects";
import {
  createAnimatedBattleBackground,
  staticBattleBackgroundDebug,
  type AnimatedBattleBackgroundHandle,
  type BattleBackgroundDebug
} from "./battleBackground";
import {
  ENEMY_SHADOW_ALPHA,
  enemyDefeatVisualState,
  enemyShadowEllipse,
  enemyTargetCursorAnchorY,
  menuCursorVisible
} from "./battleVisuals";
import { drawSwirl } from "./transitions";
import {
  resolveSpriteOverrideImageFrame,
  spriteOverrideAssetUrl,
  spriteOverrideEnemyImageKey,
  spriteOverrideForEnemyId
} from "./spriteOverrides";
import {
  backgroundOverrideAssetUrl,
  backgroundOverrideImageKey,
  resolveBackgroundOverrideEntry,
  toBattleBackground
} from "./backgroundOverrides";
import {
  createFixedRollingMeter,
  createRollingMeter,
  setTarget,
  tick as tickRollingMeter,
  type RollingMeterState
} from "./rollingMeter";
import {
  createBattleSfx,
  type BattleSfx,
  type BattleSfxCue
} from "./audio/battleSfx";
import { createMusic, musicBossCueId, musicDisabledBySearch, type Music } from "./audio/music";
import { getSharedMusic } from "./sharedMusic";
import { battleStepSfx } from "./battleSfxPlan";
import { battleMusicCueForOutcome } from "./battleMusic";
import { usableItemsForBattleDebug, usablePsiForBattleDebug } from "./battleDebugOptions";
import {
  answerSourceCheckQuestion,
  buildAttestationBattleRuntime,
  drawSourceCheckQuestions,
  type DrawnSourceCheckQuestion,
  type SourceCheckDraw
} from "./sourceCheckModel";
import { applySourceCheckRewardToRestore } from "./sourceCheckRewards";

const TAU = Math.PI * 2;
export const COMMANDS = commandsForCharId(0);
const STATUS_TOP = 288;
const BATTLE_LINE_SPACING = 6;
const BATTLE_FONT_SIZE = 14;
const BATTLE_DESCRIPTION_FONT_SIZE = 13;
const BATTLE_STATUS_NAME_FONT_SIZE = 13;
const BATTLE_STATUS_LABEL_FONT_SIZE = 11;
const BATTLE_STATUS_VALUE_FONT_SIZE = 17;
const BATTLE_LEFT_MARGIN = 16;
const BATTLE_LINE_HEIGHT = cleanLineHeight(BATTLE_FONT_SIZE, BATTLE_LINE_SPACING);
// Text paddings clear the true-thickness EB frame (16 CSS px at borderScale 2)
// with EB's one-tile gap: text starts ~2 tiles (32 CSS px) from the window edge,
// matching the ROM battle command window.
const BATTLE_COMMAND_TEXT_PADDING_X = 20;
const BATTLE_COMMAND_TEXT_PADDING_Y = 18;
const BATTLE_COMMAND_GRID_PADDING_X = 20;
const BATTLE_COMMAND_GRID_PADDING_Y = 18;
const BATTLE_COMMAND_GRID_GAP_X = 6;
const BATTLE_COMMAND_GRID_GAP_Y = 4;
// 28 + 4 gap = 32 CSS px row pitch = EB's 16px native command row pitch.
const BATTLE_COMMAND_CELL_HEIGHT = 28;
const BATTLE_MENU_CARET_GUTTER_PX = 12;
const BATTLE_MENU_TOP_MARGIN = 8;
// Top-left "whose turn" name plate above the command grid.
const BATTLE_ACTOR_NAME_PADDING_Y = 8;
const BATTLE_ACTOR_NAME_HEIGHT = BATTLE_ACTOR_NAME_PADDING_Y * 2 + BATTLE_LINE_HEIGHT;
const BATTLE_ACTOR_NAME_GAP = 4;
const BATTLE_MENU_RIGHT_MARGIN = 16;
const BATTLE_MENU_BOTTOM_CLEARANCE = 92;
const BATTLE_SUBMENU_GAP = 8;
// EarthBound-style cascade: the submenu (target / PSI / Goods list) opens offset
// down-and-right from the command window and overlaps it, instead of sitting beside
// it. The command window stays top-anchored and visible behind the cascade.
const BATTLE_SUBMENU_CASCADE_OFFSET_X = 28;
const BATTLE_SUBMENU_CASCADE_OVERLAP_Y = 16;
const BATTLE_STACKED_MENU_BOTTOM_CLEARANCE = BATTLE_MENU_BOTTOM_CLEARANCE + 4;
const BATTLE_SUBMENU_STACK_OVERLAP_X = 56;
const BATTLE_SUBMENU_STACK_OFFSET_Y = -22;
const BATTLE_TARGET_WINDOW_STACK_OFFSET_X = 28;
const BATTLE_TARGET_WINDOW_STACK_OFFSET_Y = 22;
const BATTLE_DESCRIPTION_GAP = 8;
const BATTLE_COMMAND_SINGLE_MIN_WIDTH = 74;
const BATTLE_COMMAND_COMPACT_MIN_WIDTH = 188;
const BATTLE_COMMAND_COMPACT_MAX_WIDTH = 224;
const BATTLE_SUBMENU_MIN_WIDTH = 220;
const BATTLE_TARGET_WINDOW_MIN_WIDTH = 156;
const BATTLE_DESCRIPTION_MIN_WIDTH = 128;
const BATTLE_MENU_MAX_WIDTH = 360;
// Battle panels render the ROM frame at true EarthBound thickness: the baked
// profiles are native EB pixels, so on the 2x canvas borderScale 2 gives the
// authentic one-tile (16 CSS px) border. (The old borderWidth/borderAlpha here
// were dead options drawCleanPanel never consumed.)
const BATTLE_PANEL_BORDER: { borderScale: number } = {
  borderScale: 2
};
const BATTLE_DESCRIPTION_MAX_WIDTH = 260;
const BATTLE_DESCRIPTION_TEXT_PADDING_X = 20;
const BATTLE_DESCRIPTION_TEXT_PADDING_Y = 18;
const BATTLE_EXECUTION_MESSAGE_TOP = 14;
const BATTLE_EXECUTION_MESSAGE_MIN_WIDTH = 260;
const BATTLE_EXECUTION_MESSAGE_MAX_WIDTH = 480;
const BATTLE_EXECUTION_MESSAGE_PADDING_X = 20;
const BATTLE_EXECUTION_MESSAGE_PADDING_Y = 18;
const BATTLE_EXECUTION_MESSAGE_MAX_LINES = 3;
const BATTLE_EXECUTION_MESSAGE_FONT_SIZE = 14;
// EarthBound lays its windows out on an 8px PPU grid on the native 256x224 screen
// (content/rom-truth/window-attributes.json: "px = units*8"). Our canvas is 2x
// native, so one EB grid unit is 16 CSS px. Battle window rects snap to it, the
// same way the talk window derives from the ROM attributes table.
const EB_GRID_CSS = 16;
const ebUnits = (units: number): number => units * EB_GRID_CSS;
/** Round a rect out to the EB 8px grid: origin down, extent up. */
function snapRectToEbGrid(rect: CanvasRect): CanvasRect {
  const x = Math.floor(rect.x / EB_GRID_CSS) * EB_GRID_CSS;
  const y = Math.floor(rect.y / EB_GRID_CSS) * EB_GRID_CSS;
  return {
    x,
    y,
    width: Math.ceil((rect.x + rect.width - x) / EB_GRID_CSS) * EB_GRID_CSS,
    height: Math.ceil((rect.y + rect.height - y) / EB_GRID_CSS) * EB_GRID_CSS
  };
}

const BATTLE_STATUS_CARD_SIDE_MARGIN = ebUnits(1);
const BATTLE_STATUS_CARD_BOTTOM_MARGIN = ebUnits(1);
const BATTLE_STATUS_CARD_GAP = ebUnits(1);
// EB battle status cards are ~7 grid units (56 native px) tall; a solo card
// runs wide (~13 units) while full parties compress toward the 7-unit minimum.
const BATTLE_STATUS_CARD_HEIGHT = ebUnits(7);
const BATTLE_STATUS_CARD_MIN_WIDTH = ebUnits(7);
const BATTLE_STATUS_CARD_MAX_WIDTH = ebUnits(13);
const BATTLE_STATUS_CARD_ACTIVE_LIFT = 4;
// EarthBound's status card is a cream plate with black name/labels and the
// HP/PP odometers set in dark meter boxes with light digits.
const EB_STATUS_CARD_FILL = 0xf0e0b0;
const EB_STATUS_CARD_TEXT = "#181010";
const EB_STATUS_METER_FILL = 0x181818;
const EB_STATUS_METER_TEXT = "#f8f8f8";
const BATTLE_STATUS_CONTENT_PADDING_X = 20;
const BATTLE_STATUS_CONTENT_PADDING_Y = 18;
const BATTLE_STATUS_NAME_Y = 0;
const BATTLE_STATUS_HP_ROW_Y = 23;
const BATTLE_STATUS_PP_ROW_Y = 47;
const BATTLE_STATUS_LABEL_WIDTH = 20;
const BATTLE_STATUS_BAR_HEIGHT = 5;
const BATTLE_STATUS_BAR_X = 28;
const BATTLE_STATUS_BAR_VALUE_GAP = 4;
const ACTION_ADVANCE_DELAY_MS = 1650;
const ACTION_ADVANCE_MIN_DELAY_MS = 1150;
const ACTION_ADVANCE_MAX_DELAY_MS = 2400;
const ACTION_ADVANCE_MISS_DELTA_MS = -260;
const ACTION_ADVANCE_SMASH_DELTA_MS = 520;
const ACTION_ADVANCE_DEFEAT_DELTA_MS = 160;
const ACTION_ADVANCE_EXTRA_LINE_MS = 130;
const AUTO_COMMAND_INPUT_DELAY_MS = 220;
const ENTER_TRANSITION_MS = 650;
const EXIT_TRANSITION_MS = 450;
const VICTORY_TALLY_DURATION_MS = 820;
const VICTORY_TALLY_TICK_MS = 75;
const ENEMY_SPRITE_MAX_HEIGHT = 160;
const ENEMY_SPRITE_REDRAW_RETRY_MS = 50;
const MAX_ENEMY_SPRITE_REDRAW_ATTEMPTS = 5;
const BATTLE_FX_SPARK_DEPTH = 13;
const BATTLE_FX_FLASH_DEPTH = 12;
const BATTLE_FX_PSI_ANIMATION_DEPTH = 28;
// Action-command timing window (interactive only): press Z as a party BASH lands
// for bonus damage, or as an enemy hit lands to guard part of it. Window never
// exceeds the step's natural dwell, so it never slows the fight; it only ever
// helps the player, so auto-play/harness runs are unaffected.
const ACTION_CMD_MAX_WINDOW_MS = 720;
const ACTION_CMD_SWEET_START = 0.32;
const ACTION_CMD_SWEET_END = 0.64;
const ACTION_CMD_OFFENSE_PERFECT = 1.0; // bonus = +100% of the hit (a forced SMAAASH feel)
const ACTION_CMD_OFFENSE_GOOD = 0.45;
const ACTION_CMD_DEFENSE_PERFECT = 0.7; // refund 70% of the incoming hit
const ACTION_CMD_DEFENSE_GOOD = 0.35;
const ACTION_CMD_BANNER_MS = 620;
const ACTION_CMD_DEPTH = 33;
const DAMAGE_NUMBER_MS = 760;
const ENRAGE_OFFENSE_MULT = 1.5;
const BATTLE_FX_SCREEN_SHAKE_MS = 420;
const BATTLE_FX_HIT_SPARK_MS = 380;
const BATTLE_FX_ATTACK_FLASH_MS = 190;
const BATTLE_FX_PSI_FLASH_MS = 340;
const BATTLE_FX_VICTORY_FLASH_MS = 520;
const BATTLE_FX_ENEMY_LUNGE_MS = 340;
const BATTLE_FX_MIN_SHAKE_PX = 2.4;
const BATTLE_FX_MAX_SHAKE_PX = 8.5;
const BATTLE_FX_ATTACK_FLASH_ALPHA = 0.22;
const BATTLE_FX_PSI_FLASH_ALPHA = 0.4;
const BATTLE_FX_VICTORY_FLASH_ALPHA = 0.34;
const BATTLE_FX_ATTACK_FLASH_COLOR = 0xffffff;
const BATTLE_FX_VICTORY_FLASH_COLOR = 0xfff0a6;
const BATTLE_FX_LEVELUP_FLASH_MS = 440;
const BATTLE_FX_LEVELUP_FLASH_ALPHA = 0.3;
const BATTLE_FX_LEVELUP_FLASH_COLOR = 0xfff4c4;
const BATTLE_FX_SPARK_COLOR = 0xfff2a8;
const ATTESTATION_ESCALATE_DELAY_MS = 980;
const ATTESTATION_OPTION_COLUMNS = 2;

type BattleSubmenu = "command" | "psi" | "goods" | "target";
type BattleTargetMode = "bash" | "spy" | "mirror" | "psi-offense" | "psi-recovery" | "goods";
type PendingItemUse = {
  itemId: number;
  inventorySlot: number;
};
type AttestationBattleInit = {
  check: DrifellaSourceCheck;
  cards: CardNfts;
  battles?: AttestationBattles;
  attempt: number;
  gameFlagsSnapshot?: string[];
};
type AttestationBattleStage = "question" | "battle" | "complete";
type AttestationBattleState = {
  check: DrifellaSourceCheck;
  cards: CardNfts;
  draw: SourceCheckDraw;
  flags: Set<string>;
  stage: AttestationBattleStage;
  questionIndex: number;
  selectionIndex: number;
  correctSoFar: number;
  lastOutcome: "correct" | "wrong" | "cleared" | null;
};
type LastEnemyActionDebug = {
  enemyIndex: number;
  actionIndex: number;
  actionId: number;
  actionType: number | null;
  target: number | null;
};
type SpritePoint = { x: number; y: number };
type WobbleDebugOffset = { dx: number; dy: number };
type EnemyEffectDebug = {
  flashActive: boolean;
  flashIntensity: number;
  wobble: WobbleDebugOffset;
};
type BattleFxCounters = {
  shakeCount: number;
  sparkCount: number;
  flashCount: number;
  lungeCount: number;
};
type ScreenShakeFx = {
  startedAt: number | null;
  intensity: number;
  durationMs: number;
};
type HitSparkFx = SpritePoint & {
  startedAt: number;
  durationMs: number;
  color: number;
};
type FlashOverlayFx = {
  startedAt: number | null;
  durationMs: number;
  baseAlpha: number;
  color: number;
};
type PsiBattleAnimationFx = {
  startedAt: number;
  definition: PsiBattleAnimationDefinition;
};
type EnemyLungeFx = {
  startedAt: number;
  durationMs: number;
  dir: EffectDirection;
};
type EnemySpriteTexturePlan = {
  key: string;
  url: string;
  override: ReturnType<typeof spriteOverrideForEnemyId>;
};
type BattleCommandGridLayout = CanvasRect & {
  cells: CleanGridCell[];
};
type BattleSubmenuItem = {
  label: string;
  selectable: boolean;
  sourceIndex?: number;
};
type BattleSubmenuLayout = CanvasRect & {
  mode: "list" | "grid";
  visibleStart: number;
  visibleCount: number;
  visibleRows?: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  cells?: CleanGridCell[];
};
type BattleStatusLayout = {
  actorName?: CanvasRect;
  command?: BattleCommandGridLayout;
  submenu?: BattleSubmenuLayout;
  description?: CanvasRect;
  executionMessage?: CanvasRect;
  statusCards: BattleStatusCardLayout[];
};
type ActionCommandState = {
  kind: "offense" | "defense";
  startedAt: number;
  durationMs: number;
  /** Enemy to bonus-hit (offense) or party member to refund (defense). */
  targetActor: BattleActor;
  baseDamage: number;
  resolved: boolean;
};

type BattleStatusCardView = {
  memberIndex: number;
  name: string;
  hp: number;
  maxHp: number;
  pp: number;
  maxPp: number;
  active: boolean;
  target: boolean;
  /** HP target hit 0 but the odometer is still rolling - the mortal-damage race is on. */
  mortal: boolean;
  /** Active status badges with remaining-turn counts, e.g. "PSN·3 SLP·1". */
  statusLabel: string;
};
type BattleStatusCardLayout = CanvasRect & {
  index: number;
  memberIndex: number;
  active: boolean;
  target: boolean;
};
type BattleStatusCardTextSet = {
  name: Phaser.GameObjects.Text;
  hpLabel: Phaser.GameObjects.Text;
  ppLabel: Phaser.GameObjects.Text;
  hpValue: Phaser.GameObjects.Text;
  ppValue: Phaser.GameObjects.Text;
};
type VictoryTallyState = {
  exp: RollingMeterState;
  money: RollingMeterState;
  nextTickSfxAtMs: number;
};
type BattleUiView = {
  actorName?: string;
  commandLines: string[];
  submenuLines: string[];
  submenuItems?: BattleSubmenuItem[];
  submenuColumns?: number;
  submenuGridKind?: "goods-grid" | "psi-strengths";
  submenuGridOrder?: "row-major" | "column-major";
  descriptionLines: string[];
  executionMessageLines: string[];
  selectedSubmenuIndex: number;
  statusCards: BattleStatusCardView[];
};
type BattleMenuTextRole = "command" | "submenu" | "description" | "execution" | "actorName";

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private battleRules_?: BattleRules;
  private group_!: BattleGroup;
  private battle_!: BattleState;
  private encounterAdvantage_: EncounterAdvantage = "normal";
  private enemyFirstStrikeResolved_ = false;
  private enemyFirstStrikePhase_ = false;
  private items_?: ItemCollection;
  private psi_?: PsiCollection;
  private usabilityMatrix_?: UsabilityMatrix;
  private font_?: FontCollection;
  private window_?: WindowCollection;
  private spriteOverrides_?: SpriteOverrides;
  private backgroundOverrides_?: BackgroundOverrides;
  private rng_: Rng = () => 0.5;
  private phase_: BattlePhase = "enter-transition";
  private transitionPhase_: BattleTransitionPhase = "enter";
  private transitionMs_ = ENTER_TRANSITION_MS;
  private terminalPhaseStartedAtMs_: number | null = null;
  private victorySummary_: BattleVictorySummary | null = null;
  private victorySummaryPageIndex_ = 0;
  private victoryTally_: VictoryTallyState | null = null;
  private victoryPageFlourishSignature_ = "";
  private mortalWoundRescueCount_ = 0;
  private commandIndex_ = 0;
  private submenu_: BattleSubmenu = "command";
  private submenuIndex_ = 0;
  private targetIndex_ = 0;
  private partyTargetIndex_ = 0;
  private targetMode_: BattleTargetMode = "bash";
  private pendingPsiId_: number | null = null;
  private pendingItem_: PendingItemUse | null = null;
  private menuMessage_ = "";
  private roundOrder_: BattleActor[] = [];
  private currentActor_: BattleActor | null = null;
  private inputState_: BattleRoundInputState = initialBattleRoundInputState();
  private autoMode_ = false;
  private autoCommandDelayMs_ = 0;
  private actionCommand_: ActionCommandState | null = null;
  private actionCommandGraphics?: Phaser.GameObjects.Graphics;
  private actionCommandBanner?: Phaser.GameObjects.Text;
  private actionCommandBannerUntilMs_ = 0;
  private damageNumbers_: Array<{ text: Phaser.GameObjects.Text; startedAt: number; x: number; y: number }> = [];
  private queuedCommands_: QueuedCommand[] = [];
  private executionOrder_: BattleActor[] = [];
  private priorityStep_: BattleRoundStepResult | null = null;
  private executionStepIndex_ = 0;
  private executionMessageLines_: string[] = [];
  private bossTaunts_?: ResolvedBossTaunts;
  private bossTauntQueue_: string[] = [];
  private bossStartTauntQueued_ = false;
  private bossLowHpTauntQueued_ = false;
  private enragedLead_ = false;
  private bossDefeatTauntQueued_ = false;
  private bossTurnBarkCursor_ = 0;
  private pendingFlee_ = false;
  private lastEnemyAction_: LastEnemyActionDebug | null = null;
  private actionDelayMs_ = 0;
  private lastActionDwellMs_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private statusFieldGraphics?: Phaser.GameObjects.Graphics;
  private statusAccentGraphics?: Phaser.GameObjects.Graphics;
  private statusLayoutSignature = "";
  private targetCursor?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Partial<Record<Exclude<BattleMenuTextRole, "command">, Phaser.GameObjects.Text>> = {};
  private commandGridTexts: Phaser.GameObjects.Text[] = [];
  private submenuRowTexts: Phaser.GameObjects.Text[] = [];
  private statusCardTexts: BattleStatusCardTextSet[] = [];
  private ppMeters = new Map<number, RollingMeterState>();
  private transitionGraphics?: Phaser.GameObjects.Graphics;
  private enemySprites: Phaser.GameObjects.Image[] = [];
  private enemyShadowGraphics?: Phaser.GameObjects.Graphics;
  private hitSparkGraphics?: Phaser.GameObjects.Graphics;
  private flashOverlayGraphics?: Phaser.GameObjects.Graphics;
  private psiAnimationGraphics?: Phaser.GameObjects.Graphics;
  private enemySpriteBasePoints: Array<SpritePoint | undefined> = [];
  private enemySpriteRedrawScheduled = false;
  private enemySpriteRedrawAttempts = 0;
  private enemySpriteRetryQueuedKeys = new Set<string>();
  private enemyLastHitAt: Array<number | null> = [];
  private enemyDefeatedAt: Array<number | null> = [];
  private fxCounters_: BattleFxCounters = initialBattleFxCounters();
  private screenShakeFx_: ScreenShakeFx = inactiveScreenShakeFx();
  private hitSparkFx_: HitSparkFx[] = [];
  private flashOverlayFx_: FlashOverlayFx = inactiveFlashOverlayFx();
  private psiBattleAnimationFx_: PsiBattleAnimationFx | null = null;
  private enemyLungeFx_: Array<EnemyLungeFx | null> = [];
  private backgroundAnimation?: AnimatedBattleBackgroundHandle;
  private backgroundDebug: BattleBackgroundDebug = staticBattleBackgroundDebug();
  private battleSfx_: BattleSfx = createBattleSfx();
  private music_: Music = createMusic();
  // A resolved cue string: "battle" | "victory" | "boss:<groupId>" (falls back to
  // the generic `boss` cue when a group has no dedicated boss track).
  private currentBattleMusicCue?: string;
  private isBossBattle_ = false;
  private lastSfx_: BattleSfxCue | null = null;
  private sfxCount_ = 0;
  private firedSfx_ = new Set<BattleSfxCue>();
  private nextHpTickSfxAtMs_ = 0;
  private nextDangerBeatAtMs_ = 0;
  private returnTo_?: BattleReturnContext;
  private exitOutcome_: BattleReturnOutcome | null = null;
  private attestation_: AttestationBattleState | null = null;
  private attestationResolvedRestore_: ChunkedWorldRestore | null = null;
  private customVictoryPages_: string[][] | null = null;
  private devConsole?: DevConsole;
  private devNoteCount = 0;

  constructor() {
    super("battle");
  }

  init(data: {
    battleData: BattleData;
    groupId?: number;
    characters?: CharacterCollection;
    items?: ItemCollection;
    psi?: PsiCollection;
    usabilityMatrix?: UsabilityMatrix;
    font?: FontCollection;
    window?: WindowCollection;
    spriteOverrides?: SpriteOverrides;
    backgroundOverrides?: BackgroundOverrides;
    battleRules?: BattleRules;
    partyMembers?: PartyMember[];
    partyOptions?: PlayerCombatantOptions[];
    wallet?: number;
    bank?: number;
    returnTo?: BattleReturnContext;
    battleSfx?: BattleSfx;
    music?: Music;
    musicManifest?: MusicManifest;
    encounterAdvantage?: EncounterAdvantage;
    encounterSeed?: number;
    boss?: boolean;
    attestation?: AttestationBattleInit;
  }): void {
    const attestationRuntime = data.attestation
      ? buildAttestationBattleRuntime(data.battleData, data.attestation.check, data.attestation.battles)
      : undefined;
    this.battleData_ = attestationRuntime?.battleData ?? data.battleData;
    this.isBossBattle_ = data.boss ?? false;
    this.battleRules_ = data.battleRules ?? data.returnTo?.gameData.battleRules;
    this.group_ = selectBattleGroup(this.battleData_, attestationRuntime?.groupId ?? data.groupId);
    this.encounterAdvantage_ = normalizeEncounterAdvantage(data.encounterAdvantage);
    this.enemyFirstStrikeResolved_ = false;
    this.enemyFirstStrikePhase_ = false;
    this.items_ = data.items;
    this.psi_ = data.psi;
    this.usabilityMatrix_ = data.usabilityMatrix ?? data.returnTo?.gameData.usabilityMatrix;
    this.font_ = data.font;
    this.window_ = data.window;
    this.spriteOverrides_ = data.spriteOverrides ?? data.returnTo?.gameData.spriteOverrides;
    this.backgroundOverrides_ = data.backgroundOverrides ?? data.returnTo?.gameData.backgroundOverrides;
    const enemies = applyCongregationScaling(
      enemiesForGroup(this.battleData_, this.group_),
      data.returnTo?.restore.pendingStoryGate?.triggerId,
      data.returnTo?.restore.flags.strings ?? []
    );
    if (enemies.length === 0) {
      throw new Error(`Battle group ${this.group_.id} has no matching runtime enemy.`);
    }
    this.returnTo_ = data.returnTo;
    this.battle_ = createBattleState(enemies, {
      characters: data.characters,
      partyMembers: data.partyMembers,
      partyOptions: data.partyOptions,
      wallet: data.wallet,
      bank: data.bank
    });
    this.enemyLastHitAt = enemies.map(() => null);
    this.enemyDefeatedAt = enemies.map(() => null);
    this.bossTaunts_ = undefined;
    this.bossTauntQueue_ = [];
    this.bossStartTauntQueued_ = false;
    this.bossLowHpTauntQueued_ = false;
    this.enragedLead_ = false;
    this.bossDefeatTauntQueued_ = false;
    this.bossTurnBarkCursor_ = 0;
    this.enemyLungeFx_ = enemies.map(() => null);
    this.fxCounters_ = initialBattleFxCounters();
    this.screenShakeFx_ = inactiveScreenShakeFx();
    this.hitSparkFx_ = [];
    this.flashOverlayFx_ = inactiveFlashOverlayFx();
    this.psiBattleAnimationFx_ = null;
    this.enemySpriteBasePoints = [];
    this.enemySpriteRedrawScheduled = false;
    this.enemySpriteRedrawAttempts = 0;
    this.enemySpriteRetryQueuedKeys.clear();
    this.rng_ = createBattleRng(battleRngSeedForGroup(this.group_.id, enemies, data.encounterSeed));
    this.phase_ = "enter-transition";
    this.transitionPhase_ = "enter";
    this.transitionMs_ = ENTER_TRANSITION_MS;
    this.victorySummary_ = null;
    this.victorySummaryPageIndex_ = 0;
    this.victoryTally_ = null;
    this.victoryPageFlourishSignature_ = "";
    this.mortalWoundRescueCount_ = 0;
    this.commandIndex_ = 0;
    this.submenu_ = "command";
    this.submenuIndex_ = 0;
    this.targetIndex_ = 0;
    this.partyTargetIndex_ = 0;
    this.targetMode_ = "bash";
    this.pendingPsiId_ = null;
    this.pendingItem_ = null;
    this.menuMessage_ = "";
    this.roundOrder_ = [];
    this.currentActor_ = null;
    this.inputState_ = initialBattleRoundInputState();
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    this.queuedCommands_ = [];
    this.executionOrder_ = [];
    this.priorityStep_ = null;
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.lastEnemyAction_ = null;
    this.actionDelayMs_ = 0;
    this.lastActionDwellMs_ = 0;
    this.statusLayoutSignature = "";
    this.ppMeters.clear();
    this.backgroundAnimation = undefined;
    this.backgroundDebug = staticBattleBackgroundDebug();
    this.battleSfx_ = data.battleSfx ?? createBattleSfx();
    this.music_ = data.music ?? getSharedMusic(this.registry, data.musicManifest ?? data.returnTo?.gameData.musicManifest, {
      muted: musicDisabledBySearch(globalThis.location?.search)
    });
    this.currentBattleMusicCue = undefined;
    this.lastSfx_ = null;
    this.sfxCount_ = 0;
    this.firedSfx_.clear();
    this.nextHpTickSfxAtMs_ = 0;
    this.exitOutcome_ = null;
    this.attestationResolvedRestore_ = null;
    this.customVictoryPages_ = null;
    this.devNoteCount = 0;
    this.attestation_ = data.attestation
      ? this.createAttestationState(data.attestation)
      : null;
    if (this.encounterAdvantage_ === "instantWin") {
      this.resolveInstantWinBattleState(enemies);
    }
  }

  preload(): void {
    const override = resolveBackgroundOverrideEntry(this.backgroundOverrides_, this.group_.background1);
    if (override) {
      const key = backgroundOverrideImageKey(override.entryId, override.entry.image);
      if (!this.textures.exists(key)) {
        this.load.image(key, backgroundOverrideAssetUrl(override.entry.image));
      }
    }
    for (const backgroundId of unique([this.group_.background1, this.group_.background2])) {
      this.load.image(backgroundKey(backgroundId), generatedAssetUrl(this.battleData_.assetLayout.backgroundDir, backgroundId));
    }
    for (const enemy of enemiesForGroup(this.battleData_, this.group_)) {
      const texture = this.enemySpriteTexturePlan(enemy);
      if (!this.textures.exists(texture.key)) {
        this.load.image(texture.key, texture.url);
      }
    }
    if (this.attestation_) {
      const battle = this.attestationBattleTexturePlan();
      const fallback = this.attestationOverworldTexturePlan();
      if (!this.textures.exists(battle.key)) {
        this.load.image(battle.key, battle.url);
      }
      if (!this.textures.exists(fallback.key)) {
        this.load.image(fallback.key, fallback.url);
      }
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050505");
    this.drawBackground();
    this.events.once("shutdown", () => {
      this.music_.stop();
      this.backgroundAnimation?.destroy();
      this.devConsole?.destroy();
      this.devConsole = undefined;
    });
    const baseMusicCue = battleMusicCueForOutcome(outcome(this.battle_), this.isBossBattle_);
    // A boss fight requests its group-qualified cue; the resolver falls back to the
    // generic `boss` track when this group has no dedicated one in the manifest.
    this.playBattleMusicCue(baseMusicCue === "boss" ? musicBossCueId(this.group_.id) : baseMusicCue, true);
    this.drawEnemySprites();
    this.createStatusWindow();
    this.registerBattleSfxResume();
    if (import.meta.env.DEV) {
      this.devConsole = new DevConsole(this.buildDevConsoleHost());
    }
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.moveMenu("up");
    });
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.moveMenu("down");
    });
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.moveMenu("left");
    });
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.moveMenu("right");
    });
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.confirmMenu();
    });
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => {
      if (!this.shouldIgnoreBattleHotkey()) this.cancelMenu();
    });
    void this.loadOptionalGeneratedMenuData();
    void this.loadBossBattleDialogue();
    this.transitionGraphics = this.add.graphics().setDepth(90);
    this.renderTransition();
    this.renderStatus();
    this.publish();
  }

  /**
   * Load the optional boss taunt data and resolve the taunts for this group.
   * Runs during the enter-transition, so it is ready before execution begins.
   * A missing file is expected (most battles are not boss battles).
   */
  private async loadBossBattleDialogue(): Promise<void> {
    if (this.bossTaunts_) {
      return;
    }
    const dialogue = await fetchParsed("/generated/boss-battle-dialogue.json", BossBattleDialogueSchema);
    this.bossTaunts_ = resolveBossTaunts(dialogue, this.group_.id);
  }

  private registerBattleSfxResume(): void {
    const resume = () => {
      this.battleSfx_.resume();
      this.music_.resume();
    };
    this.input.once("pointerdown", resume);
    this.input.keyboard?.once("keydown", resume);
    this.events.once("shutdown", () => {
      this.input.off("pointerdown", resume);
      this.input.keyboard?.off("keydown", resume);
    });
  }

  private shouldIgnoreBattleHotkey(): boolean {
    if (this.devConsole?.isOpen()) {
      return true;
    }
    if (typeof document === "undefined") {
      return false;
    }
    const active = document.activeElement as HTMLElement | null;
    return Boolean(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable));
  }

  private buildDevConsoleHost(): DevConsoleHost {
    return {
      liveState: () => this.devLiveState(),
      trackLabVisible: () => isMusicAuditionerVisible(),
      toggleTrackLab: () => { toggleMusicAuditioner(); },
      noteActionLabel: () => "Battle note [N]",
      captureSceneNote: () => this.devCaptureBattleNote(),
      noteCount: () => this.devNoteCount,
      footerHint: () => "battle mode: warp, encounters, collision pins are overworld only"
    };
  }

  private devLiveState(): DevLiveState {
    const party = this.devPartyHpContext();
    const partyLine = party.length > 0
      ? party.map((member) => `${member.name} ${member.hp}/${member.maxHp}`).join(", ")
      : "?";
    const enemyLine = this.battle_.enemies.length > 0
      ? this.battle_.enemies.map((enemy) => `${enemy.name} ${Math.round(enemy.hp.target)}/${enemy.maxHp}`).join(", ")
      : "?";
    return {
      x: 0,
      y: 0,
      tileX: 0,
      tileY: 0,
      sector: null,
      area: null,
      town: null,
      facing: this.phase_,
      bike: false,
      mouseX: null,
      mouseY: null,
      lines: [
        `battle group ${this.group_.id}`,
        `phase ${this.phase_} | round ${this.battle_.roundNumber}`,
        `party HP ${partyLine}`,
        `enemies ${enemyLine}`
      ]
    };
  }

  private devCaptureBattleNote(): void {
    const context: DevNoteContext = {
      kind: "battle",
      groupId: this.group_.id,
      phase: this.phase_,
      roundNumber: this.battle_.roundNumber,
      partyHp: this.devPartyHpContext()
    };
    this.devConsole?.beginNoteCapture(
      `battle group ${this.group_.id} | ${this.phase_} | ${this.devPartyHpSummary()}`,
      (text) => this.devSaveNote(text, context)
    );
  }

  private devPartyHpContext(): Array<{ name: string; hp: number; maxHp: number; displayedHp: number; rolling: boolean }> {
    return this.battle_.party.map((member) => ({
      name: member.name,
      hp: Math.round(member.hp.target),
      maxHp: Math.round(member.maxHp),
      displayedHp: Math.round(member.hp.displayed),
      rolling: member.hp.isRolling
    }));
  }

  private devPartyHpSummary(): string {
    const parts = this.devPartyHpContext().map((member) => `${member.name} ${member.hp}/${member.maxHp}`);
    return parts.length > 0 ? parts.join(", ") : "party ?";
  }

  private devSaveNote(text: string, context: DevNoteContext): void {
    void postDevNote({ note: text, context }).then((ok) => {
      if (ok) {
        this.devNoteCount += 1;
      }
    });
  }

  private createAttestationState(data: AttestationBattleInit): AttestationBattleState {
    const flags = new Set(data.gameFlagsSnapshot ?? this.returnTo_?.restore.flags.strings ?? []);
    return {
      check: data.check,
      cards: data.cards,
      draw: drawSourceCheckQuestions(data.check, { has: (flag) => flags.has(flag) }, data.attempt),
      flags,
      stage: "question",
      questionIndex: 0,
      selectionIndex: 0,
      correctSoFar: 0,
      lastOutcome: null
    };
  }

  update(_: number, delta: number): void {
    this.updateBackground();
    this.tickStatusPpMeters(delta);
    this.tickVictoryPresentation(delta);
    this.updateDangerHeartbeat();

    if (this.phase_ === "enter-transition") {
      this.transitionMs_ = Math.max(0, this.transitionMs_ - delta);
      if (this.transitionMs_ <= 0) {
        this.transitionGraphics?.clear();
        this.transitionPhase_ = "none";
        if (this.attestation_?.stage === "question") {
          this.beginAttestationQuestionInput();
        } else if (!this.beginEnemyFirstStrikeIfNeeded()) {
          this.beginCommandInputRound();
        }
      } else {
        this.renderTransition();
      }
      this.renderStatus();
      this.publish();
      return;
    }

    if (this.phase_ === "exit-transition") {
      this.transitionMs_ = Math.max(0, this.transitionMs_ - delta);
      this.renderTransition();
      this.renderStatus();
      this.publish();
      if (this.transitionMs_ <= 0) {
        this.exitBattle();
      }
      return;
    }

    if (this.applyBattleReturnGuard()) {
      this.renderStatus();
      this.publish();
      return;
    }

    if (!this.isBattleFlowPaused()) {
      const previousBattle = this.battle_;
      this.battle_ = tickBattleMeters(this.battle_, delta);
      this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
      this.playRollingMeterSfx();
      this.actionDelayMs_ = Math.max(0, this.actionDelayMs_ - delta);
      this.autoCommandDelayMs_ = this.phase_ === "command-input" && this.autoMode_
        ? Math.max(0, this.autoCommandDelayMs_ - delta)
        : 0;
      this.advanceBattleFlow();
    }
    this.updateActionCommand();
    this.renderStatus();
    this.publish();
  }

  private moveMenu(direction: BattleCommandGridDirection): void {
    if (this.attestation_?.stage === "question") {
      this.moveAttestationSelection(direction);
      return;
    }
    if (!this.isCommandInputActive()) {
      return;
    }
    if (this.autoMode_) {
      return;
    }
    this.menuMessage_ = "";
    const delta = this.inputMoveDelta(direction);
    if (delta === null) {
      return;
    }
    this.playBattleSfxCue("menuMove");
    this.applyInputTransition(nextInputState(this.inputState_, { kind: "move", delta }, this.inputContext()));
    this.renderStatus();
    this.publish();
  }

  private confirmMenu(): void {
    if (this.attestation_?.stage === "question") {
      this.confirmAttestationSelection();
      return;
    }
    if (this.phase_ === "victory-summary") {
      if (this.advanceVictorySummaryPage()) {
        this.renderStatus();
        this.publish();
        return;
      }
      this.beginExitTransition();
      return;
    }
    if (this.phase_ === "lose" || this.phase_ === "flee" || this.phase_ === "win") {
      this.beginExitTransition();
      return;
    }
    if (this.phase_ === "execution") {
      // A live timing window claims the press for the action command rather than
      // fast-forwarding the step, so the bonus/guard registers and shows.
      if (this.actionCommandOpen()) {
        this.resolveActionCommand();
        return;
      }
      this.actionDelayMs_ = 0;
      this.advanceExecutionStep();
      this.renderStatus();
      this.publish();
      return;
    }
    if (!this.isCommandInputActive()) {
      return;
    }
    if (this.autoMode_) {
      return;
    }
    this.playBattleSfxCue("menuConfirm");
    if (this.inputState_.submenu === "command" && this.currentCommand() === "AUTO") {
      this.autoMode_ = true;
      this.autoCommandDelayMs_ = 0;
      this.menuMessage_ = "";
      this.resolveAutoCommandInputRound();
      this.renderStatus();
      this.publish();
      return;
    }
    const transition = nextInputState(this.inputState_, { kind: "confirm" }, this.inputContext());
    this.menuMessage_ = transition.input === this.inputState_ ? this.blockedInputMessage() : "";
    this.applyInputTransition(transition);
    this.renderStatus();
    this.publish();
  }

  private cancelMenu(): void {
    if (this.attestation_?.stage === "question") {
      this.playBattleSfxCue("menuCancel");
      return;
    }
    if (this.autoMode_) {
      this.cancelAutoMode();
      return;
    }
    if (!this.isCommandInputActive()) {
      return;
    }
    this.menuMessage_ = "";
    this.playBattleSfxCue("menuCancel");
    this.applyInputTransition(nextInputState(this.inputState_, { kind: "cancel" }, this.inputContext()));
    this.renderStatus();
    this.publish();
  }

  private inputMoveDelta(direction: BattleCommandGridDirection): number | null {
    if (this.inputState_.submenu === "command") {
      const commands = this.commandsForCurrentActor();
      if (commands.length <= 0) {
        return null;
      }
      const current = clampSelectionIndex(this.inputState_.selectionIndex, commands.length);
      const next = moveBattleCommandGridIndex(current, commands.length, direction, CLEAN_UI_GRID_COLUMNS);
      return next - current;
    }
    if (this.inputState_.submenu === "psi" || this.inputState_.submenu === "goods") {
      const next = this.inputState_.submenu === "goods"
        ? moveBattleSubmenuGridIndex(this.inputState_.selectionIndex, this.goodsForCurrentActor().length, direction, 2, "column-major")
        : this.nextPsiSelectionIndex(direction);
      return next === this.inputState_.selectionIndex ? null : next - this.inputState_.selectionIndex;
    }
    return direction === "left" || direction === "up" ? -1 : 1;
  }

  private nextPsiSelectionIndex(direction: BattleCommandGridDirection): number {
    return moveBattleSubmenuSourceIndex(
      this.psiSubmenuItems(),
      this.inputState_.selectionIndex,
      direction,
      PSI_STRENGTH_ORDER.length + 1,
      "row-major"
    );
  }

  private applyInputTransition(transition: ReturnType<typeof nextInputState>): void {
    this.inputState_ = transition.input;
    this.queuedCommands_ = [...transition.input.queue];
    if (transition.complete) {
      this.beginExecutionPhase();
      return;
    }
    this.syncMenuFromInputState();
  }

  private resolveAutoCommandInputRound(): void {
    this.applyInputTransition(nextInputState(this.inputState_, { kind: "auto" }, this.inputContext()));
  }

  private cancelAutoMode(): void {
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    if (this.phase_ === "command-input" && this.currentActor_?.side === "party") {
      this.menuMessage_ = "";
      this.playBattleSfxCue("menuCancel");
      this.inputState_ = {
        ...this.inputState_,
        submenu: "command",
        selectionIndex: 0,
        pending: undefined
      };
      this.queuedCommands_ = [...this.inputState_.queue];
      this.syncMenuFromInputState();
    }
    this.renderStatus();
    this.publish();
  }

  private beginEnemyFirstStrikeIfNeeded(): boolean {
    if (!shouldRunEnemyFirstStrikeBeforeInput(this.battle_, this.encounterAdvantage_, this.enemyFirstStrikeResolved_)) {
      return false;
    }
    this.enemyFirstStrikeResolved_ = true;
    this.beginEnemyFirstStrikeExecution();
    return true;
  }

  private beginEnemyFirstStrikeExecution(): void {
    if (this.handleBattleOutcome()) {
      return;
    }
    this.phase_ = "execution";
    this.transitionPhase_ = "none";
    this.enemyFirstStrikePhase_ = true;
    this.inputState_ = initialBattleRoundInputState();
    this.queuedCommands_ = [];
    this.priorityStep_ = null;
    this.executionOrder_ = encounterAdvantageTurnOrder(this.battle_, [], this.rng_, {
      advantage: "enemyFirstStrike"
    });
    this.roundOrder_ = [...this.executionOrder_];
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.currentActor_ = null;
    this.resetMenuForActor();
    this.actionDelayMs_ = 0;
    this.lastActionDwellMs_ = 0;
    this.autoCommandDelayMs_ = 0;
    this.nextHpTickSfxAtMs_ = 0;
    if (this.executionOrder_.length === 0) {
      this.finishExecutionRound();
      return;
    }
    this.advanceExecutionStep();
  }

  private beginCommandInputRound(): void {
    if (this.beginEnemyFirstStrikeIfNeeded()) {
      return;
    }
    if (this.handleBattleOutcome()) {
      return;
    }
    const livingOrder = partyInputOrder(this.battle_);
    if (livingOrder.length === 0) {
      this.phase_ = "lose";
      this.transitionPhase_ = "none";
      this.markTerminalPhaseStarted();
      this.currentActor_ = null;
      return;
    }
    const autoPassQueue = autoPassBlockedPartyCommands(this.battle_);
    const order = partyCommandInputOrder(this.battle_);
    if (order.length === 0) {
      this.inputState_ = {
        ...initialBattleRoundInputState(),
        queue: autoPassQueue
      };
      this.queuedCommands_ = autoPassQueue;
      this.beginExecutionPhase();
      return;
    }
    this.phase_ = "command-input";
    this.transitionPhase_ = "none";
    this.inputState_ = {
      ...initialBattleRoundInputState(),
      queue: autoPassQueue
    };
    this.queuedCommands_ = autoPassQueue;
    this.executionOrder_ = [];
    this.priorityStep_ = null;
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.roundOrder_ = order;
    this.actionDelayMs_ = 0;
    this.lastActionDwellMs_ = 0;
    this.autoCommandDelayMs_ = this.autoMode_ ? AUTO_COMMAND_INPUT_DELAY_MS : 0;
    this.nextHpTickSfxAtMs_ = 0;
    this.syncMenuFromInputState();
  }

  private beginAttestationQuestionInput(): void {
    const attestation = this.attestation_;
    if (!attestation) {
      this.beginCommandInputRound();
      return;
    }
    const order = partyInputOrder(this.battle_);
    this.phase_ = "command-input";
    this.transitionPhase_ = "none";
    this.inputState_ = initialBattleRoundInputState();
    this.queuedCommands_ = [];
    this.executionOrder_ = [];
    this.priorityStep_ = null;
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.roundOrder_ = order;
    this.currentActor_ = order[0] ?? null;
    this.commandIndex_ = attestation.selectionIndex;
    this.submenu_ = "command";
    this.submenuIndex_ = 0;
    this.targetMode_ = "bash";
    this.menuMessage_ = "";
    this.actionDelayMs_ = 0;
    this.lastActionDwellMs_ = 0;
    this.autoCommandDelayMs_ = 0;
    this.nextHpTickSfxAtMs_ = 0;
  }

  private moveAttestationSelection(direction: BattleCommandGridDirection): void {
    const attestation = this.attestation_;
    const question = this.currentAttestationQuestion();
    if (!attestation || !question) {
      return;
    }
    const next = moveBattleCommandGridIndex(
      attestation.selectionIndex,
      question.options.length,
      direction,
      ATTESTATION_OPTION_COLUMNS
    );
    if (next === attestation.selectionIndex) {
      return;
    }
    attestation.selectionIndex = next;
    this.commandIndex_ = next;
    this.playBattleSfxCue("menuMove");
    this.renderStatus();
    this.publish();
  }

  private confirmAttestationSelection(): void {
    const attestation = this.attestation_;
    const question = this.currentAttestationQuestion();
    if (!attestation || !question) {
      return;
    }
    this.playBattleSfxCue("menuConfirm");
    if (answerSourceCheckQuestion(question, attestation.selectionIndex)) {
      attestation.correctSoFar += 1;
      attestation.lastOutcome = "correct";
      if (attestation.correctSoFar >= attestation.draw.drawCount) {
        this.beginAttestationVictory("ATTESTED.");
        return;
      }
      attestation.questionIndex += 1;
      attestation.selectionIndex = 0;
      this.commandIndex_ = 0;
      this.renderStatus();
      this.publish();
      return;
    }
    attestation.lastOutcome = "wrong";
    this.escalateAttestationToBattle(question);
  }

  private escalateAttestationToBattle(question: DrawnSourceCheckQuestion): void {
    const attestation = this.attestation_;
    if (!attestation) {
      return;
    }
    attestation.stage = "battle";
    this.customVictoryPages_ = null;
    this.attestationResolvedRestore_ = null;
    this.phase_ = "execution";
    this.transitionPhase_ = "none";
    this.currentActor_ = null;
    this.inputState_ = initialBattleRoundInputState();
    this.queuedCommands_ = [];
    this.executionOrder_ = [];
    this.priorityStep_ = null;
    this.executionStepIndex_ = 0;
    this.roundOrder_ = [];
    this.pendingFlee_ = false;
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    this.menuMessage_ = "";
    this.executionMessageLines_ = [question.failLine ?? "Wrong answer.", "The Drifella attacks!"];
    this.actionDelayMs_ = ATTESTATION_ESCALATE_DELAY_MS;
    this.lastActionDwellMs_ = ATTESTATION_ESCALATE_DELAY_MS;
    this.startEnemyLunge(0);
    this.startScreenShake(BATTLE_FX_MIN_SHAKE_PX);
    this.renderStatus();
    this.publish();
  }

  private beginExecutionPhase(): void {
    this.autoCommandDelayMs_ = 0;
    this.queuedCommands_ = [...this.inputState_.queue];
    const priority = resolveRoundStartPriority(this.battle_, this.queuedCommands_, this.rng_, {
      groupId: this.group_.id,
      rules: this.battleRules_
    });
    this.battle_ = priority.state;
    this.queuedCommands_ = [...priority.queued];
    this.priorityStep_ = priority.priorityStep ?? null;
    this.executionOrder_ = encounterAdvantageTurnOrder(this.battle_, this.queuedCommands_, this.rng_, {
      advantage: this.encounterAdvantage_ === "partyFirstStrike" ? "partyFirstStrike" : "normal"
    });
    this.roundOrder_ = this.priorityStep_
      ? [this.priorityStep_.actor, ...this.executionOrder_]
      : this.executionOrder_;
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.phase_ = "execution";
    this.transitionPhase_ = "none";
    this.currentActor_ = null;
    this.resetMenuForActor();
    this.actionDelayMs_ = 0;
    this.lastActionDwellMs_ = 0;
    this.nextHpTickSfxAtMs_ = 0;
    if (this.executionOrder_.length === 0) {
      if (this.priorityStep_) {
        this.advanceExecutionStep();
        return;
      }
      this.finishExecutionRound();
      return;
    }
    this.advanceExecutionStep();
  }

  private advanceBattleFlow(): void {
    if (this.phase_ === "command-input") {
      if (this.handleBattleOutcome()) {
        return;
      }
      this.syncMenuFromInputState();
      if (this.activeTargetSide() === "party") {
        this.normalizePartyTargetIndex();
      } else {
        this.normalizeTargetIndex();
      }
      if (this.autoMode_ && this.autoCommandDelayMs_ <= 0) {
        this.resolveAutoCommandInputRound();
      }
      return;
    }

    if (this.phase_ === "execution") {
      if (this.actionDelayMs_ <= 0) {
        this.advanceExecutionStep();
      }
      return;
    }

    if (this.handleBattleOutcome()) {
      return;
    }
  }

  // --- Boss taunts (in-battle speech) ---------------------------------------

  private enqueueBossTaunts(utterances: readonly string[] | undefined): void {
    if (!utterances) {
      return;
    }
    for (const utterance of utterances) {
      if (utterance.trim().length > 0) {
        this.bossTauntQueue_.push(utterance);
      }
    }
  }

  /** Show the next queued boss utterance as its own execution message beat. */
  private drainBossTaunt(): boolean {
    const utterance = this.bossTauntQueue_.shift();
    if (utterance === undefined) {
      return false;
    }
    this.currentActor_ = null;
    this.menuMessage_ = "";
    this.executionMessageLines_ = wrapTauntLines(utterance);
    const base = ACTION_ADVANCE_DELAY_MS + 300;
    const extra = Math.max(0, this.executionMessageLines_.length - 1) * ACTION_ADVANCE_EXTRA_LINE_MS;
    this.actionDelayMs_ = clampNumber(base + extra, ACTION_ADVANCE_MIN_DELAY_MS, ACTION_ADVANCE_MAX_DELAY_MS);
    this.lastActionDwellMs_ = this.actionDelayMs_;
    return true;
  }

  private maybeQueueBossStartTaunt(): void {
    if (!this.bossTaunts_ || this.bossStartTauntQueued_) {
      return;
    }
    this.bossStartTauntQueued_ = true;
    this.enqueueBossTaunts(this.bossTaunts_.onStart);
  }

  /**
   * Ambient mid-fight bark: one line from the onTurn pool on odd rounds from
   * round 3 on, while the lead enemy is alive. Cycles the pool so it does not
   * repeat until exhausted.
   */
  private maybeQueueBossTurnBark(): void {
    if (!this.bossTaunts_ || this.bossTaunts_.onTurn.length === 0) {
      return;
    }
    const round = this.battle_.roundNumber;
    if (round < 3 || round % 2 === 0) {
      return;
    }
    const lead = this.battle_.enemies[0];
    if (!lead || !isCombatantAlive(lead)) {
      return;
    }
    const pool = this.bossTaunts_.onTurn;
    const line = pool[this.bossTurnBarkCursor_ % pool.length];
    this.bossTurnBarkCursor_ += 1;
    this.enqueueBossTaunts(line ? [line] : undefined);
  }

  /**
   * After a step resolves, queue the lead enemy's reaction: its dying words when
   * it just died (before victory is processed), else its low-HP taunt the first
   * time it drops to/below the threshold.
   */
  private queueBossReactionTaunts(): void {
    if (!this.bossTaunts_) {
      return;
    }
    const lead = this.battle_.enemies[0];
    if (!lead) {
      return;
    }
    const alive = isCombatantAlive(lead);
    if (!this.bossDefeatTauntQueued_ && !alive) {
      this.bossDefeatTauntQueued_ = true;
      this.enqueueBossTaunts(this.bossTaunts_.onDefeat);
      return;
    }
    if (!this.bossLowHpTauntQueued_) {
      const fraction = bossHpFraction(lead.hp.target, lead.maxHp);
      if (shouldQueueLowHpTaunt(fraction, alive, this.bossTaunts_.lowHpThreshold)) {
        this.bossLowHpTauntQueued_ = true;
        this.enqueueBossTaunts(this.bossTaunts_.onLowHp);
        this.enrageLeadEnemy();
      }
    }
  }

  /**
   * Boss phase shift: crossing the low-HP threshold doesn't just change the boss's
   * dialogue, it changes the fight - the boss enrages, hitting harder from here on.
   * A real second phase built on the existing HP-threshold hook.
   */
  private enrageLeadEnemy(): void {
    const lead = this.battle_.enemies[0];
    if (!lead || this.enragedLead_) {
      return;
    }
    this.enragedLead_ = true;
    const boostedOffense = Math.max(lead.offense + 1, Math.round(lead.offense * ENRAGE_OFFENSE_MULT));
    const updated: Combatant = {
      ...lead,
      offense: boostedOffense,
      stats: { ...lead.stats, offense: boostedOffense }
    };
    this.battle_ = { ...this.battle_, enemies: this.battle_.enemies.map((e, i) => (i === 0 ? updated : e)) };
    this.startFlashOverlay(0xff3b3b, 0.4, 320);
    this.startScreenShake(BATTLE_FX_MAX_SHAKE_PX * 0.8);
    this.showActionCommandBanner("ENRAGED!", "#ff5470");
  }

  private advanceExecutionStep(): void {
    if (this.phase_ !== "execution") {
      return;
    }
    this.maybeQueueBossStartTaunt();
    if (this.drainBossTaunt()) {
      return;
    }
    if (this.pendingFlee_) {
      this.pendingFlee_ = false;
      this.autoMode_ = false;
      this.autoCommandDelayMs_ = 0;
      this.executionMessageLines_ = [];
      this.actionDelayMs_ = 0;
      this.lastActionDwellMs_ = 0;
      this.phase_ = "flee";
      this.transitionPhase_ = "none";
      this.markTerminalPhaseStarted();
      this.currentActor_ = null;
      return;
    }
    if (this.handleBattleOutcome()) {
      return;
    }
    if (this.priorityStep_) {
      const result = this.priorityStep_;
      this.priorityStep_ = null;
      this.currentActor_ = result.actor;
      this.menuMessage_ = result.message;
      this.executionMessageLines_ = composeBattleStepLines(result.events);
      this.playBattleStepSfx(result);
      this.triggerBattleStepFx(result);
      this.actionDelayMs_ = this.actionDwellMsForStep(result, this.executionMessageLines_);
      this.lastActionDwellMs_ = this.actionDelayMs_;
      if (result.fled) {
        this.pendingFlee_ = true;
      }
      return;
    }

    for (let guard = 0; guard < 100; guard += 1) {
      const actor = this.executionOrder_[this.executionStepIndex_];
      if (!actor) {
        this.finishExecutionRound();
        return;
      }
      this.executionStepIndex_ += 1;
      this.currentActor_ = actor;

      if (!this.actorIsAlive(actor)) {
        continue;
      }

      const queued = actor.side === "party"
        ? this.queuedCommands_.find((command) => command.partySlot === actor.index)
        : undefined;
      const previousBattle = this.battle_;
      const result = resolveRoundStep(this.battle_, actor, queued, this.rng_, {
        psi: this.psi_?.psi,
        items: this.items_?.items,
        usabilityMatrix: this.usabilityMatrix_
      });
      this.battle_ = result.state;
      this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
      this.queueBossReactionTaunts();
      this.updateStepDebugTargets(result, queued);
      this.menuMessage_ = result.message;
      this.executionMessageLines_ = composeBattleStepLines(result.events);
      this.playBattleStepSfx(result);
      this.triggerBattleStepFx(result);
      if (this.executionMessageLines_.length === 0) {
        this.actionDelayMs_ = 0;
        this.lastActionDwellMs_ = 0;
        continue;
      }
      this.actionDelayMs_ = this.actionDwellMsForStep(result, this.executionMessageLines_);
      this.lastActionDwellMs_ = this.actionDelayMs_;
      this.applyElementalAffinity(result);
      this.applyComebackBonus(result);
      this.maybeOpenActionCommand(result);

      if (result.fled) {
        this.pendingFlee_ = true;
      }
      return;
    }

    this.finishExecutionRound();
  }

  private finishExecutionRound(): void {
    if (this.handleBattleOutcome()) {
      return;
    }
    if (this.enemyFirstStrikePhase_) {
      this.enemyFirstStrikePhase_ = false;
      this.executionMessageLines_ = [];
      this.pendingFlee_ = false;
      this.beginCommandInputRound();
      return;
    }
    this.battle_ = advanceBattleRound(this.battle_);
    this.maybeQueueBossTurnBark();
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.beginCommandInputRound();
  }

  private playBattleStepSfx(result: BattleRoundStepResult): void {
    const cues =
      result.details.kind === "defend"
        ? battleStepSfx(result.details)
        : battleStepSfx(result.events);
    this.playBattleSfxSequence(cues);
  }

  private actionDwellMsForStep(result: BattleRoundStepResult, lines: readonly string[]): number {
    if (lines.length <= 0) {
      return 0;
    }
    const events = result.events;
    const damage = Math.max(0, Math.floor(firstBattleDamage(events)?.amount ?? 0));
    let dwellMs = ACTION_ADVANCE_DELAY_MS;
    if (battleEventsHaveMiss(events)) {
      dwellMs += ACTION_ADVANCE_MISS_DELTA_MS;
    }
    if (battleEventsHaveSmash(events)) {
      dwellMs += ACTION_ADVANCE_SMASH_DELTA_MS;
    } else if (damage >= 100) {
      dwellMs += 360;
    } else if (damage >= 50) {
      dwellMs += 260;
    } else if (damage >= 20) {
      dwellMs += 140;
    }
    if (battleEventsHaveEnemyDefeated(events)) {
      dwellMs += ACTION_ADVANCE_DEFEAT_DELTA_MS;
    }
    dwellMs += Math.max(0, lines.length - 2) * ACTION_ADVANCE_EXTRA_LINE_MS;
    return clampNumber(dwellMs, ACTION_ADVANCE_MIN_DELAY_MS, ACTION_ADVANCE_MAX_DELAY_MS);
  }

  private triggerBattleStepFx(result: BattleRoundStepResult): void {
    const events = result.events;
    const action = firstBattleAction(events);
    const damage = Math.max(0, Math.floor(firstBattleDamage(events)?.amount ?? 0));
    const damaging = damage > 0 && !battleEventsHaveMiss(events);

    if (damaging) {
      this.startScreenShake(this.shakeIntensityForDamage(damage, battleEventsHaveEnemyDefeated(events)));
      let sparked = false;
      const smash = battleEventsHaveSmash(events);
      for (const target of uniqueActors(this.impactTargetsForResult(result))) {
        const point = this.impactPointForActor(target);
        if (!point) {
          continue;
        }
        this.spawnHitSpark(point);
        this.spawnDamageNumber(point, damage, { onEnemy: target.side === "enemy", smash });
        sparked = true;
      }
      if (!sparked) {
        this.spawnHitSpark(this.fallbackImpactPoint());
        this.spawnDamageNumber(this.fallbackImpactPoint(), damage, { onEnemy: result.actor.side === "party", smash });
      }
    }

    if (result.details.kind === "psi" && !result.skipped) {
      this.startPsiBattleAnimation(result);
    } else if (action?.action === "attack" && !result.skipped) {
      this.startFlashOverlay(
        BATTLE_FX_ATTACK_FLASH_COLOR,
        BATTLE_FX_ATTACK_FLASH_ALPHA,
        BATTLE_FX_ATTACK_FLASH_MS
      );
    }

    if (
      result.actor.side === "enemy" &&
      !result.skipped &&
      (action?.action === "attack" || action?.action === "psi")
    ) {
      this.startEnemyLunge(result.actor.index);
    }
  }

  /**
   * Comeback drama: a party BASH swung while the attacker is in peril hits
   * harder - a last stand at death's door (adrenaline), building on the
   * rolling-HP mortal-race tension. Scene-level bonus damage, party-only.
   */
  private applyComebackBonus(result: BattleRoundStepResult): void {
    if (result.actor.side !== "party" || result.skipped) {
      return;
    }
    const action = firstBattleAction(result.events);
    const damage = Math.max(0, Math.floor(firstBattleDamage(result.events)?.amount ?? 0));
    if (action?.action !== "attack" || damage <= 0 || battleEventsHaveMiss(result.events)) {
      return;
    }
    const attacker = this.battle_.party[result.actor.index];
    if (!attacker || attacker.maxHp <= 0) {
      return;
    }
    // hp.target <= 1 covers both a 1-HP hero and one mid mortal-race (target 0,
    // still swinging while the odometer falls).
    const lastStand = attacker.hp.target <= 1;
    const danger = attacker.hp.target <= Math.max(1, Math.floor(attacker.maxHp / 4));
    if (!danger) {
      return;
    }
    const target = uniqueActors(this.impactTargetsForResult(result)).find(
      (t) => t.side === "enemy" && this.actorIsAlive(t)
    );
    if (!target) {
      return;
    }
    const bonus = Math.max(1, Math.round(damage * (lastStand ? 0.8 : 0.4)));
    this.adjustCombatantHp(target, -bonus);
    this.startScreenShake(this.shakeIntensityForDamage(bonus, false));
    const point = this.impactPointForActor(target);
    if (point) this.spawnHitSpark(point);
    this.showActionCommandBanner(lastStand ? "LAST STAND!" : "ADRENALINE!", lastStand ? "#ff5470" : "#ffa24c");
  }

  /**
   * Elemental weakness: a party offense PSI that hits an enemy weak (or resistant)
   * to its element gets a damage delta applied on top of the base hit, plus a
   * WEAK!/RESIST pop. Scene-level so the pure battle model stays untouched.
   */
  private applyElementalAffinity(result: BattleRoundStepResult): void {
    if (result.actor.side !== "party" || result.skipped) {
      return;
    }
    const action = firstBattleAction(result.events);
    if (action?.action !== "psi") {
      return;
    }
    const element = psiElementForId(action.psiId);
    const totalDamage = Math.max(0, Math.floor(firstBattleDamage(result.events)?.amount ?? 0));
    if (!element || totalDamage <= 0) {
      return;
    }
    const enemyTargets = uniqueActors(this.impactTargetsForResult(result)).filter(
      (t) => t.side === "enemy" && this.actorIsAlive(t)
    );
    if (enemyTargets.length === 0) {
      return;
    }
    const perTarget = Math.max(1, Math.round(totalDamage / enemyTargets.length));
    let sawWeak = false;
    let sawResist = false;
    for (const target of enemyTargets) {
      const enemyId = this.battle_.enemies[target.index]?.charId ?? -1;
      const { multiplier, kind } = elementalAffinity(enemyId, element);
      if (kind === null) {
        continue;
      }
      const delta = Math.round(perTarget * (multiplier - 1));
      if (delta !== 0) {
        this.adjustCombatantHp(target, -delta);
      }
      if (kind === "weak") {
        sawWeak = true;
        const point = this.impactPointForActor(target);
        if (point) this.spawnHitSpark(point);
      } else {
        sawResist = true;
      }
    }
    if (sawWeak) {
      this.showActionCommandBanner("WEAK!", "#ffd23f");
    } else if (sawResist) {
      this.showActionCommandBanner("resist…", "#9fb3c8");
    }
  }

  /**
   * Open a timing window on a damaging hit (interactive play only). A party BASH
   * offers an offense window (press Z to add bonus damage); an enemy hit on a
   * party member offers a defense window (press Z to guard part of it). Never
   * opens in auto-mode, and the window is capped to the step's own dwell so the
   * fight never slows down.
   */
  private maybeOpenActionCommand(result: BattleRoundStepResult): void {
    this.clearActionCommand();
    if (this.autoMode_ || result.skipped) {
      return;
    }
    const action = firstBattleAction(result.events);
    const damage = Math.max(0, Math.floor(firstBattleDamage(result.events)?.amount ?? 0));
    if (damage <= 0 || battleEventsHaveMiss(result.events) || action?.action !== "attack") {
      return;
    }
    const targets = uniqueActors(this.impactTargetsForResult(result));
    let kind: "offense" | "defense" | null = null;
    let targetActor: BattleActor | undefined;
    if (result.actor.side === "party") {
      targetActor = targets.find((t) => t.side === "enemy" && this.actorIsAlive(t));
      if (targetActor) kind = "offense";
    } else {
      targetActor = targets.find((t) => t.side === "party" && this.actorIsAlive(t));
      if (targetActor) kind = "defense";
    }
    if (!kind || !targetActor) {
      return;
    }
    const durationMs = Math.min(this.actionDelayMs_, ACTION_CMD_MAX_WINDOW_MS);
    if (durationMs < 220) {
      return;
    }
    this.actionCommand_ = {
      kind,
      startedAt: this.time.now,
      durationMs,
      targetActor,
      baseDamage: damage,
      resolved: false
    };
  }

  private clearActionCommand(): void {
    this.actionCommand_ = null;
    this.actionCommandGraphics?.clear();
  }

  /** True while an unresolved timing window is live (Z should resolve it, not fast-forward). */
  private actionCommandOpen(): boolean {
    return this.actionCommand_ !== null && !this.actionCommand_.resolved && this.phase_ === "execution";
  }

  /** Add `delta` to a combatant's HP target (negative = damage, positive = heal), clamped. */
  private adjustCombatantHp(actor: BattleActor, delta: number): void {
    const roster = actor.side === "party" ? this.battle_.party : this.battle_.enemies;
    const combatant = roster[actor.index];
    if (!combatant) {
      return;
    }
    const next = Math.max(0, Math.min(combatant.maxHp, combatant.hp.target + delta));
    const updated: Combatant = { ...combatant, hp: setTarget(combatant.hp, next) };
    const nextRoster = roster.map((c, i) => (i === actor.index ? updated : c));
    this.battle_ = actor.side === "party"
      ? { ...this.battle_, party: nextRoster }
      : { ...this.battle_, enemies: nextRoster };
  }

  /** Resolve the open timing window from the current press moment, apply the effect. */
  private resolveActionCommand(): void {
    const cmd = this.actionCommand_;
    if (!cmd || cmd.resolved) {
      return;
    }
    cmd.resolved = true;
    const t = (this.time.now - cmd.startedAt) / cmd.durationMs;
    const perfect = t >= ACTION_CMD_SWEET_START && t <= ACTION_CMD_SWEET_END;
    if (cmd.kind === "offense") {
      const factor = perfect ? ACTION_CMD_OFFENSE_PERFECT : ACTION_CMD_OFFENSE_GOOD;
      const bonus = Math.max(1, Math.round(cmd.baseDamage * factor));
      this.adjustCombatantHp(cmd.targetActor, -bonus);
      this.startScreenShake(this.shakeIntensityForDamage(bonus, false));
      const point = this.impactPointForActor(cmd.targetActor);
      if (point) this.spawnHitSpark(point);
      this.showActionCommandBanner(perfect ? "SMAAASH!!" : "NICE!", perfect ? "#ffd23f" : "#7fd0ff");
    } else {
      const factor = perfect ? ACTION_CMD_DEFENSE_PERFECT : ACTION_CMD_DEFENSE_GOOD;
      const refund = Math.max(1, Math.round(cmd.baseDamage * factor));
      this.adjustCombatantHp(cmd.targetActor, refund);
      this.showActionCommandBanner(perfect ? "GUARD!!" : "block", perfect ? "#8affc1" : "#bfe6cf");
    }
    this.battleSfx_.smash();
    this.renderStatus();
    this.publish();
  }

  private showActionCommandBanner(text: string, color: string): void {
    if (!this.actionCommandBanner) {
      return;
    }
    this.actionCommandBanner.setText(text).setColor(color).setVisible(true);
    this.actionCommandBannerUntilMs_ = this.time.now + ACTION_CMD_BANNER_MS;
  }

  /** Per-frame: draw the shrinking timing bar, expire the window + banner. */
  private updateActionCommand(): void {
    if (this.actionCommandBanner?.visible && this.time.now >= this.actionCommandBannerUntilMs_) {
      this.actionCommandBanner.setVisible(false);
    }
    const graphics = this.actionCommandGraphics;
    const cmd = this.actionCommand_;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (!cmd || cmd.resolved || this.phase_ !== "execution") {
      return;
    }
    const elapsed = this.time.now - cmd.startedAt;
    if (elapsed >= cmd.durationMs) {
      cmd.resolved = true; // window expired unpressed - no effect
      return;
    }
    const t = elapsed / cmd.durationMs;
    const barW = Math.min(180, this.scale.width * 0.6);
    const barH = 10;
    const x = (this.scale.width - barW) / 2;
    const y = this.scale.height * 0.58; // below the enemy sprite, above the status cards
    graphics.fillStyle(0x0c0c12, 0.72);
    graphics.fillRoundedRect(x - 4, y - 4, barW + 8, barH + 8, 4);
    // sweet zone
    graphics.fillStyle(cmd.kind === "offense" ? 0xffd23f : 0x8affc1, 0.55);
    graphics.fillRect(x + barW * ACTION_CMD_SWEET_START, y, barW * (ACTION_CMD_SWEET_END - ACTION_CMD_SWEET_START), barH);
    // sweeping marker
    graphics.fillStyle(0xeef1f6, 1);
    graphics.fillRect(x + barW * t - 1.5, y - 3, 3, barH + 6);
  }

  private impactTargetsForResult(result: BattleRoundStepResult): BattleActor[] {
    const resolution = result.resolution;
    if (!resolution) {
      return [];
    }
    if ("defender" in resolution) {
      return resolution.defender ? [resolution.defender] : [];
    }
    if ("targets" in resolution && resolution.targets) {
      return [...resolution.targets];
    }
    if ("target" in resolution) {
      return resolution.target ? [resolution.target] : [];
    }
    return [];
  }

  private startScreenShake(intensity: number): void {
    this.screenShakeFx_ = {
      startedAt: this.time.now,
      intensity: clampNumber(intensity, 0, BATTLE_FX_MAX_SHAKE_PX),
      durationMs: BATTLE_FX_SCREEN_SHAKE_MS
    };
    this.fxCounters_.shakeCount += 1;
  }

  private shakeIntensityForDamage(damage: number, targetDied: boolean): number {
    const scaled = BATTLE_FX_MIN_SHAKE_PX + Math.sqrt(Math.max(0, damage)) * 0.42 + (targetDied ? 1.8 : 0);
    return clampNumber(scaled, BATTLE_FX_MIN_SHAKE_PX, BATTLE_FX_MAX_SHAKE_PX);
  }

  private spawnHitSpark(point: SpritePoint): void {
    this.hitSparkFx_.push({
      x: point.x,
      y: point.y,
      startedAt: this.time.now,
      durationMs: BATTLE_FX_HIT_SPARK_MS,
      color: BATTLE_FX_SPARK_COLOR
    });
    this.fxCounters_.sparkCount += 1;
  }

  private startFlashOverlay(color: number, baseAlpha: number, durationMs: number): void {
    this.flashOverlayFx_ = {
      startedAt: this.time.now,
      durationMs,
      baseAlpha,
      color
    };
    this.fxCounters_.flashCount += 1;
  }

  private startPsiBattleAnimation(result: BattleRoundStepResult): void {
    try {
      const psiId = result.details.psiId;
      const psi = psiId === undefined ? undefined : this.psi_?.psi.find((entry) => entry.id === psiId);
      const definition = psiBattleAnimationForPsi(psi ?? {
        id: psiId,
        name: result.details.moveName,
        type: fallbackPsiAnimationType(result.details)
      });
      this.psiBattleAnimationFx_ = {
        startedAt: this.time.now,
        definition
      };
      this.fxCounters_.flashCount += 1;
      if (definition.style !== "supportGlow") {
        const { r, g, b } = rgbFromHex(definition.colors[0] ?? 0xffffff);
        this.cameras.main.flash(clampNumber(Math.round(definition.durationMs * 0.16), 80, 180), r, g, b);
      }
    } catch {
      this.psiBattleAnimationFx_ = null;
    }
  }

  private settlePendingMortalWoundsForBattleEnd(): void {
    const settled = settlePendingPartyMortalWounds(this.battle_);
    if (settled.rescuedCount <= 0) {
      return;
    }
    this.battle_ = settled.state;
    this.mortalWoundRescueCount_ += settled.rescuedCount;
  }

  private ensureVictoryPresentation(): void {
    if (!this.victorySummary_ || this.victoryTally_) {
      return;
    }
    this.victoryTally_ = createVictoryTally(this.victorySummary_, this.time.now);
    this.victoryPageFlourishSignature_ = "";
    this.playVictoryPageFlourishIfNeeded();
  }

  private tickVictoryPresentation(delta: number): void {
    if (this.phase_ !== "victory-summary" || !this.victoryTally_ || delta <= 0) {
      return;
    }
    const previousExp = this.victoryTally_.exp.displayed;
    const previousMoney = this.victoryTally_.money.displayed;
    const wasRolling = victoryTallyIsRolling(this.victoryTally_);
    this.victoryTally_ = {
      ...this.victoryTally_,
      exp: tickRollingMeter(this.victoryTally_.exp, delta),
      money: tickRollingMeter(this.victoryTally_.money, delta)
    };
    const changed =
      previousExp !== this.victoryTally_.exp.displayed ||
      previousMoney !== this.victoryTally_.money.displayed;
    if (changed && this.time.now >= this.victoryTally_.nextTickSfxAtMs) {
      this.playBattleSfxCue("menuMove");
      this.victoryTally_ = {
        ...this.victoryTally_,
        nextTickSfxAtMs: this.time.now + VICTORY_TALLY_TICK_MS
      };
    }
    if (wasRolling && !victoryTallyIsRolling(this.victoryTally_)) {
      this.playVictoryPageFlourishIfNeeded();
    }
  }

  private completeVictoryTallyIfRolling(): boolean {
    if (!this.victoryTally_ || !victoryTallyIsRolling(this.victoryTally_)) {
      return false;
    }
    this.victoryTally_ = {
      exp: completedRollingMeter(this.victoryTally_.exp),
      money: completedRollingMeter(this.victoryTally_.money),
      nextTickSfxAtMs: this.time.now + VICTORY_TALLY_TICK_MS
    };
    this.playBattleSfxCue("menuMove");
    this.playVictoryPageFlourishIfNeeded();
    return true;
  }

  private playVictoryPageFlourishIfNeeded(): void {
    if (this.phase_ !== "victory-summary" || !this.victorySummary_) {
      return;
    }
    const page = this.currentVictorySummaryPageDetail();
    if (!page?.highlighted) {
      return;
    }
    const signature = `${this.victorySummaryPageIndex_}:${page.kind}:${page.levelUpIndex ?? -1}:${page.learnedSkillIndex ?? -1}`;
    if (signature === this.victoryPageFlourishSignature_) {
      return;
    }
    this.victoryPageFlourishSignature_ = signature;
    this.playBattleSfxCue("levelUp");
    this.startFlashOverlay(
      BATTLE_FX_LEVELUP_FLASH_COLOR,
      BATTLE_FX_LEVELUP_FLASH_ALPHA,
      BATTLE_FX_LEVELUP_FLASH_MS
    );
  }

  private startEnemyLunge(enemyIndex: number): void {
    if (!this.battle_.enemies[enemyIndex]) {
      return;
    }
    this.enemyLungeFx_[enemyIndex] = {
      startedAt: this.time.now,
      durationMs: BATTLE_FX_ENEMY_LUNGE_MS,
      dir: this.enemyLungeDirection(enemyIndex)
    };
    this.fxCounters_.lungeCount += 1;
  }

  private enemyLungeDirection(enemyIndex: number): EffectDirection {
    const basePoint = this.enemySpriteBasePoints[enemyIndex];
    const towardCenter = basePoint ? Math.sign(this.scale.width / 2 - basePoint.x) : 0;
    return {
      dx: towardCenter * 3,
      dy: 12
    };
  }

  private impactPointForActor(actor: BattleActor): SpritePoint | null {
    if (actor.side === "enemy") {
      const sprite = this.enemySprites[actor.index];
      const basePoint = this.enemySpriteBasePoints[actor.index];
      if (sprite) {
        return { x: sprite.x, y: sprite.y };
      }
      return basePoint ? { ...basePoint } : null;
    }
    return this.partyImpactPoint(actor.index);
  }

  private partyImpactPoint(memberIndex: number): SpritePoint | null {
    const card = this.currentStatusCardRects()[memberIndex];
    if (!card) {
      return null;
    }
    return {
      x: card.x + card.width / 2,
      y: Math.max(24, card.y - 12)
    };
  }

  private currentStatusCardRects(): CanvasRect[] {
    const memberCount = Math.min(4, this.battle_.party.length);
    const activeIndex = this.currentActor_?.side === "party" && this.currentActor_.index < memberCount
      ? this.currentActor_.index
      : null;
    return battleStatusCardRects({
      screen: { width: this.scale.width, height: this.scale.height },
      memberCount,
      activeIndex,
      sideMargin: BATTLE_STATUS_CARD_SIDE_MARGIN,
      bottomMargin: BATTLE_STATUS_CARD_BOTTOM_MARGIN,
      gap: BATTLE_STATUS_CARD_GAP,
      cardHeight: BATTLE_STATUS_CARD_HEIGHT,
      minCardWidth: BATTLE_STATUS_CARD_MIN_WIDTH,
      maxCardWidth: BATTLE_STATUS_CARD_MAX_WIDTH,
      activeLift: BATTLE_STATUS_CARD_ACTIVE_LIFT
    });
  }

  private fallbackImpactPoint(): SpritePoint {
    return {
      x: this.scale.width / 2,
      y: STATUS_TOP / 2
    };
  }

  private playBattleSfxSequence(cues: readonly BattleSfxCue[]): void {
    let delayMs = 0;
    cues.forEach((cue, index) => {
      if (index > 0) {
        delayMs += this.battleSfxCueDelay(cues[index - 1], cue);
      }
      if (delayMs <= 0) {
        this.playBattleSfxCue(cue);
        return;
      }
      this.time.delayedCall(delayMs, () => this.playBattleSfxCue(cue));
    });
  }

  private battleSfxCueDelay(previous: BattleSfxCue, cue: BattleSfxCue): number {
    if (cue === "enemyDown") {
      return 135;
    }
    if (previous === "swing" && isBattleImpactCue(cue)) {
      return 85;
    }
    if (previous === "psi" && isBattleImpactCue(cue)) {
      return 120;
    }
    return 45;
  }

  private playRollingMeterSfx(): void {
    if (this.phase_ !== "execution" || this.time.now < this.nextHpTickSfxAtMs_ || !this.hasRollingMeter()) {
      return;
    }
    this.playBattleSfxCue("hpTick");
    this.nextHpTickSfxAtMs_ = this.time.now + 130;
  }

  private hasRollingMeter(): boolean {
    return this.battle_.party.some((member) => member.hp.isRolling) ||
      this.battle_.enemies.some((enemy) => enemy.hp.isRolling) ||
      [...this.ppMeters.values()].some((meter) => meter.isRolling);
  }

  /**
   * EB low-HP heartbeat: while any living party member is critical (<= maxHp/8, matching the
   * overworld's isDangerHp) during active fighting, pulse the "lub-dub" on an interval. Called
   * directly (not via playBattleSfxCue) so the ambient beat doesn't pollute the sfx-cue tracking.
   */
  private updateDangerHeartbeat(): void {
    const active = this.phase_ === "command-input" || this.phase_ === "execution";
    // Mortal-damage race (target 0, odometer still rolling) beats URGENT; a merely
    // critical member (<= maxHp/8, matching the overworld's isDangerHp) beats calm.
    // The old target>0 check went silent during the race - the most dramatic moment.
    const mortal = active && this.battle_.party.some((member) => isPendingPartyMortalWound(member));
    const danger =
      mortal ||
      (active &&
        this.battle_.party.some((member) => {
          const hp = member.hp.target;
          return hp > 0 && hp <= Math.max(1, Math.floor(member.maxHp / 8));
        }));
    if (!danger) {
      this.nextDangerBeatAtMs_ = 0;
      return;
    }
    if (this.time.now < this.nextDangerBeatAtMs_) {
      return;
    }
    this.nextDangerBeatAtMs_ = this.time.now + (mortal ? 410 : 820);
    this.battleSfx_.dangerHeartbeat();
  }

  private playBattleSfxCue(cue: BattleSfxCue): void {
    this.lastSfx_ = cue;
    this.sfxCount_ += 1;
    this.firedSfx_.add(cue);
    switch (cue) {
      case "menuMove":
        this.battleSfx_.menuMove();
        break;
      case "menuConfirm":
        this.battleSfx_.menuConfirm();
        break;
      case "menuCancel":
        this.battleSfx_.menuCancel();
        break;
      case "swing":
        this.battleSfx_.swing();
        break;
      case "hit":
        this.battleSfx_.hit();
        break;
      case "smash":
        this.battleSfx_.smash();
        break;
      case "crit":
        this.battleSfx_.crit();
        break;
      case "defend":
        this.battleSfx_.defend();
        break;
      case "miss":
        this.battleSfx_.miss();
        break;
      case "psi":
        this.battleSfx_.psi();
        break;
      case "heal":
        this.battleSfx_.heal();
        break;
      case "hpTick":
        this.battleSfx_.hpTick();
        break;
      case "enemyDown":
        this.battleSfx_.enemyDown();
        break;
      case "run":
        this.battleSfx_.run();
        break;
      case "victory":
        this.battleSfx_.victory();
        break;
      case "levelUp":
        this.battleSfx_.levelUp();
        break;
    }
  }

  private updateStepDebugTargets(
    result: ReturnType<typeof resolveRoundStep>,
    queued: QueuedCommand | undefined
  ): void {
    if (queued?.target?.side === "enemy") {
      this.targetIndex_ = queued.target.index;
    } else if (queued?.target?.side === "party") {
      this.partyTargetIndex_ = queued.target.index;
    }

    const resolution = result.resolution;
    if (!resolution) {
      return;
    }
    if ("defender" in resolution && resolution.defender) {
      this.setDebugTarget(resolution.defender);
    }
    if ("target" in resolution && resolution.target) {
      this.setDebugTarget(resolution.target);
    }
    if ("targets" in resolution && resolution.targets) {
      const target = resolution.targets[0];
      if (target) {
        this.setDebugTarget(target);
      }
    }
    if (result.actor.side === "enemy" && "action" in resolution) {
      this.lastEnemyAction_ = resolution.action
        ? {
          enemyIndex: result.actor.index,
          actionIndex: resolution.action.actionIndex,
          actionId: resolution.action.actionId,
          actionType: resolution.action.actionType ?? null,
          target: resolution.action.target ?? null
        }
        : null;
    }
  }

  private setDebugTarget(actor: BattleActor): void {
    if (actor.side === "enemy") {
      this.targetIndex_ = actor.index;
    } else {
      this.partyTargetIndex_ = actor.index;
    }
  }

  private syncMenuFromInputState(): void {
    const order = partyCommandInputOrder(this.battle_);
    this.roundOrder_ = this.phase_ === "execution" ? this.executionOrder_ : order;
    this.currentActor_ = order[this.inputState_.memberCursor] ?? null;
    this.queuedCommands_ = [...this.inputState_.queue];
    this.submenu_ = battleSubmenuFromInput(this.inputState_.submenu);
    this.submenuIndex_ = this.inputState_.submenu === "psi" || this.inputState_.submenu === "goods"
      ? this.inputState_.selectionIndex
      : 0;
    this.pendingPsiId_ = this.inputState_.pending?.psiId ?? null;
    this.pendingItem_ = this.pendingItemFromInput();
    this.commandIndex_ = this.commandIndexFromInput();
    this.targetMode_ = this.targetModeFromInput();

    if (this.inputState_.submenu === "target-enemy") {
      this.targetIndex_ = this.inputState_.selectionIndex;
    } else if (this.inputState_.submenu === "target-ally") {
      this.partyTargetIndex_ = this.inputState_.selectionIndex;
    }

    if (this.activeTargetSide() === "party") {
      this.normalizePartyTargetIndex();
    } else {
      this.normalizeTargetIndex();
    }
  }

  private commandIndexFromInput(): number {
    const charId = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_)?.charId ?? 0 : 0;
    if (this.inputState_.submenu === "command") {
      return clampSelectionIndex(this.inputState_.selectionIndex, this.commandsForCurrentActor().length);
    }
    if (this.inputState_.submenu === "psi") {
      return commandIndexForChar("PSI", charId);
    }
    if (this.inputState_.submenu === "goods") {
      return commandIndexForChar("GOODS", charId);
    }
    return commandIndexForChar(this.inputState_.pending?.command, charId);
  }

  private targetModeFromInput(): BattleTargetMode {
    if (this.inputState_.submenu === "target-ally") {
      return this.inputState_.pending?.command === "PSI" ? "psi-recovery" : "goods";
    }
    if (this.inputState_.submenu === "target-enemy") {
      return this.inputState_.pending?.command === "PSI"
        ? "psi-offense"
        : targetModeForCommand(this.inputState_.pending?.command ?? "BASH") ?? "bash";
    }
    if (this.inputState_.submenu === "command") {
      return targetModeForCommand(this.currentCommand()) ?? "bash";
    }
    return "bash";
  }

  private pendingItemFromInput(): PendingItemUse | null {
    const itemId = this.inputState_.pending?.itemId;
    if (this.inputState_.pending?.command !== "GOODS" || itemId === undefined) {
      return null;
    }
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    const inventorySlot = actor?.inventory.indexOf(itemId) ?? -1;
    return {
      itemId,
      inventorySlot: inventorySlot >= 0 ? inventorySlot : 0
    };
  }

  private blockedInputMessage(): string {
    if (this.inputState_.submenu === "psi") {
      const psi = this.learnedPsiForCurrentActor()[this.inputState_.selectionIndex];
      const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
      if (!psi) {
        return "No learned PSI.";
      }
      const kind = psiBattleKind(psi);
      if ((this.usabilityMatrix_ && !canUsePsiInBattle(this.usabilityMatrix_, psi.id)) ||
        (kind !== "offense" && kind !== "recovery" && !psi.effect)) {
        return "Cannot use that PSI here.";
      }
      if (actor && actor.pp < psiPpCost(psi)) {
        return "Not enough PP.";
      }
    }
    if (this.inputState_.submenu === "goods" && !this.goodsForCurrentActor()[this.inputState_.selectionIndex]) {
      return "No goods.";
    }
    return "Cannot act.";
  }

  private inputContext(): { state: BattleState; psi?: PsiData[]; items?: ItemData[]; usabilityMatrix?: UsabilityMatrix } {
    return {
      state: this.battle_,
      psi: this.psi_?.psi,
      items: this.items_?.items,
      usabilityMatrix: this.usabilityMatrix_
    };
  }

  private isCommandInputActive(): boolean {
    return this.phase_ === "command-input" && this.currentActor_?.side === "party";
  }

  private handleBattleOutcome(currentOutcome: BattleOutcome = outcome(this.battle_)): boolean {
    if (currentOutcome === "ongoing") {
      return false;
    }
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    this.currentActor_ = null;
    if (currentOutcome === "win") {
      this.beginVictorySummary();
    } else {
      this.phase_ = "lose";
      this.transitionPhase_ = "none";
      this.markTerminalPhaseStarted();
      this.resetMenuForActor();
    }
    return true;
  }

  private executionStepDebugIndex(): number {
    if (this.phase_ !== "execution" || this.executionOrder_.length === 0) {
      return -1;
    }
    return clampNumber(this.executionStepIndex_ - 1, 0, Math.max(0, this.executionOrder_.length - 1));
  }

  private resolveInstantWinBattleState(enemies: BattleEnemy[]): void {
    const rewardOptions = instantWinRewardOptions({
      wallet: this.battle_.wallet,
      bank: this.battle_.bank ?? this.returnTo_?.restore.party.bank ?? 0,
      roundNumber: this.battle_.roundNumber,
      rng: this.rng_,
      items: this.items_?.items,
      psi: this.psi_?.psi
    });
    const result = resolveInstantWinRewards(this.battle_.party, enemies, rewardOptions);
    this.battle_ = result.state;
    this.victorySummary_ = result.summary;
    this.victorySummaryPageIndex_ = 0;
    this.victoryTally_ = null;
    this.phase_ = "victory-summary";
    this.transitionPhase_ = "summary";
    this.markTerminalPhaseStarted();
    this.transitionMs_ = 0;
    this.submenu_ = "command";
    this.commandIndex_ = 0;
    this.currentActor_ = null;
    this.menuMessage_ = "";
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    this.ensureVictoryPresentation();
  }

  private beginVictorySummary(): void {
    this.playBattleMusicCue("victory");
    if (this.victorySummary_) {
      this.victorySummaryPageIndex_ = 0;
      this.phase_ = "victory-summary";
      this.transitionPhase_ = "summary";
      this.markTerminalPhaseStarted();
      this.ensureVictoryPresentation();
      return;
    }
    this.playBattleSfxCue("victory");
    this.startFlashOverlay(
      BATTLE_FX_VICTORY_FLASH_COLOR,
      BATTLE_FX_VICTORY_FLASH_ALPHA,
      BATTLE_FX_VICTORY_FLASH_MS
    );
    this.settlePendingMortalWoundsForBattleEnd();
    const result = applyVictoryRewards(this.battle_, {
      rng: this.rng_,
      items: this.items_?.items,
      psi: this.psi_?.psi
    });
    this.battle_ = result.state;
    this.victorySummary_ = result.summary;
    this.victorySummaryPageIndex_ = 0;
    this.victoryTally_ = null;
    this.phase_ = "victory-summary";
    this.transitionPhase_ = "summary";
    this.markTerminalPhaseStarted();
    this.ensureVictoryPresentation();
    this.submenu_ = "command";
    this.commandIndex_ = 0;
    this.currentActor_ = null;
    this.menuMessage_ = "";
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
    if (this.attestation_?.stage === "battle" && !this.attestationResolvedRestore_) {
      this.beginAttestationVictory("Witnessed the hard way.", true);
    }
  }

  private beginAttestationVictory(message: string, keepBattleSummary = false): void {
    const attestation = this.attestation_;
    if (!attestation || !this.returnTo_) {
      return;
    }
    this.playBattleMusicCue("victory");
    if (!keepBattleSummary) {
      this.playBattleSfxCue("victory");
      this.startFlashOverlay(
        BATTLE_FX_VICTORY_FLASH_COLOR,
        BATTLE_FX_VICTORY_FLASH_ALPHA,
        BATTLE_FX_VICTORY_FLASH_MS
      );
    }
    this.settlePendingMortalWoundsForBattleEnd();
    const postBattleParty = buildPostBattlePartySnapshot(this.returnTo_.restore.party, this.battle_);
    const restore: ChunkedWorldRestore = {
      ...this.returnTo_.restore,
      outcome: "win",
      party: postBattleParty,
      flags: {
        strings: [...this.returnTo_.restore.flags.strings],
        numeric: [...this.returnTo_.restore.flags.numeric]
      },
      encounter: {
        ...this.returnTo_.restore.encounter,
        lastEncounterGroup: this.group_.id
      }
    };
    const reward = applySourceCheckRewardToRestore({
      check: attestation.check,
      cards: attestation.cards,
      items: this.items_,
      restore
    });
    attestation.stage = "complete";
    attestation.lastOutcome = "cleared";
    this.attestationResolvedRestore_ = restore;
    this.customVictoryPages_ = [[
      message,
      reward.cardName,
      reward.itemHeld ? `Drifella holds ${reward.itemName}.` : `+ ${reward.itemName}`
    ]];
    this.victorySummaryPageIndex_ = keepBattleSummary ? this.victorySummaryPageIndex_ : 0;
    this.victoryTally_ = keepBattleSummary ? this.victoryTally_ : null;
    this.phase_ = "victory-summary";
    this.transitionPhase_ = "summary";
    this.markTerminalPhaseStarted();
    this.submenu_ = "command";
    this.commandIndex_ = 0;
    this.currentActor_ = null;
    this.menuMessage_ = "";
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.autoMode_ = false;
    this.autoCommandDelayMs_ = 0;
  }

  private beginExitTransition(): void {
    if (this.phase_ === "exit-transition") {
      return;
    }
    this.exitOutcome_ = this.currentReturnOutcome();
    if (this.exitOutcome_ !== "lose") {
      this.settlePendingMortalWoundsForBattleEnd();
    }
    this.phase_ = "exit-transition";
    this.transitionPhase_ = "exit";
    this.terminalPhaseStartedAtMs_ = null;
    this.transitionMs_ = EXIT_TRANSITION_MS;
    this.currentActor_ = null;
    this.transitionGraphics?.clear();
    this.renderTransition();
    this.renderStatus();
    this.publish();
  }

  private renderTransition(): void {
    const graphics = this.transitionGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (this.transitionPhase_ === "enter") {
      const progress = 1 - this.transitionMs_ / ENTER_TRANSITION_MS;
      this.renderEnterSwirl(graphics, progress);
      return;
    }

    if (this.transitionPhase_ === "exit") {
      const progress = 1 - this.transitionMs_ / EXIT_TRANSITION_MS;
      graphics.fillStyle(0x000000, Math.min(1, Math.max(0, progress)));
      graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private renderEnterSwirl(graphics: Phaser.GameObjects.Graphics, progress: number): void {
    // Colored EB swirl reveal (from black -> battle). Shared renderer; centered on the battle viewport.
    drawSwirl(graphics, progress, this.scale.width, this.scale.height, {
      cy: STATUS_TOP / 2,
      clockMs: this.time.now,
      advantageTint: swirlTintForAdvantage(this.encounterAdvantage_)
    });
  }

  private exitBattle(): void {
    this.transitionGraphics?.clear();
    this.transitionPhase_ = "none";
    if (this.returnTo_) {
      const outcome = this.exitOutcome_ ?? this.currentReturnOutcome();
      if (outcome === "lose") {
        this.scene.start("game-over", {
          gameData: this.returnTo_.gameData,
          saveSlot: this.returnTo_.saveSlot,
          saveSlots: this.returnTo_.saveSlots
        });
        return;
      }
      const postBattleParty = buildPostBattlePartySnapshot(this.returnTo_.restore.party, this.battle_);
      const attestationRestore = outcome === "win" ? this.attestationResolvedRestore_ : null;
      const restore = {
        ...this.returnTo_.restore,
        outcome,
        ...(attestationRestore ? {
          flags: attestationRestore.flags,
          party: attestationRestore.party,
          sourceCheck: attestationRestore.sourceCheck
        } : {
          party: postBattleParty
        }),
        encounter: {
          ...this.returnTo_.restore.encounter,
          lastEncounterGroup: this.group_.id
        }
      };
      this.scene.start(this.returnTo_.sceneKey, {
        gameData: this.returnTo_.gameData,
        saveSlot: this.returnTo_.saveSlot,
        saveSlots: this.returnTo_.saveSlots,
        restore
      });
      return;
    }
    removeBattleSearchParam();
    this.scene.start("boot");
  }

  private currentReturnOutcome(): BattleReturnOutcome {
    if (this.attestationResolvedRestore_) {
      return "win";
    }
    if (this.phase_ === "flee") {
      return "flee";
    }
    return outcome(this.battle_) === "win" ? "win" : "lose";
  }

  private markTerminalPhaseStarted(): void {
    this.terminalPhaseStartedAtMs_ = this.time.now;
  }

  private applyBattleReturnGuard(): boolean {
    if (
      this.phase_ !== "victory-summary" &&
      this.phase_ !== "win" &&
      this.phase_ !== "lose" &&
      this.phase_ !== "flee"
    ) {
      return false;
    }
    const startedAt = this.terminalPhaseStartedAtMs_ ?? this.time.now;
    this.terminalPhaseStartedAtMs_ = startedAt;
    const action = battleReturnGuardAction({
      phase: this.phase_,
      elapsedMs: Math.max(0, this.time.now - startedAt),
      returnContextActive: Boolean(this.returnTo_)
    });
    if (action !== "begin-exit") {
      return false;
    }
    this.beginExitTransition();
    return true;
  }

  private drawBackground(): void {
    const override = resolveBackgroundOverrideEntry(this.backgroundOverrides_, this.group_.background1);
    const backgroundHeight = this.scale.height;
    if (override) {
      const key = backgroundOverrideImageKey(override.entryId, override.entry.image);
      if (this.textures.exists(key)) {
        this.backgroundAnimation = createAnimatedBattleBackground(
          this,
          key,
          toBattleBackground(override.entry),
          this.scale.width,
          backgroundHeight
        );
        if (this.backgroundAnimation) {
          this.backgroundDebug = this.backgroundAnimation.debug();
          return;
        }
        this.backgroundDebug = staticBattleBackgroundDebug();
        this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.scale.width, backgroundHeight);
        return;
      }
    }

    const backgroundId = this.textures.exists(backgroundKey(this.group_.background1))
      ? this.group_.background1
      : this.group_.background2;
    const key = backgroundKey(backgroundId);
    if (this.textures.exists(key)) {
      this.backgroundAnimation = createAnimatedBattleBackground(
        this,
        key,
        selectBattleBackground(this.battleData_, backgroundId),
        this.scale.width,
        backgroundHeight
      );
      if (this.backgroundAnimation) {
        this.backgroundDebug = this.backgroundAnimation.debug();
        return;
      }
      this.backgroundDebug = staticBattleBackgroundDebug();
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.scale.width, backgroundHeight);
      return;
    }

    this.backgroundDebug = staticBattleBackgroundDebug();
    const graphics = this.add.graphics();
    graphics.fillStyle(0x182033, 1);
    graphics.fillRect(0, 0, this.scale.width, backgroundHeight);
    graphics.fillStyle(0x263248, 1);
    for (let y = 0; y < backgroundHeight; y += 16) {
      graphics.fillRect(0, y, this.scale.width, 8);
    }
  }

  private drawEnemySprites(): void {
    const enemies = enemiesForGroup(this.battleData_, this.group_);
    const count = Math.max(1, enemies.length);
    for (const sprite of this.enemySprites) {
      sprite?.destroy();
    }
    this.enemySprites = [];
    this.enemySpriteBasePoints = [];
    const missingTextures: EnemySpriteTexturePlan[] = [];
    enemies.forEach((enemy, index) => {
      const texture = this.enemySpriteTexturePlan(enemy);
      if (!this.enemySpriteTextureReady(texture)) {
        missingTextures.push(texture);
        return;
      }
      const frame = this.textures.getFrame(texture.key);
      const widthBudget = Math.max(64, 420 / count);
      const scale = texture.override
        ? resolveSpriteOverrideImageFrame(
          texture.override,
          { width: frame.width, height: frame.height },
          { maxWidth: widthBudget, maxHeight: ENEMY_SPRITE_MAX_HEIGHT, maxScale: 2 }
        ).scale
        : Math.min(2, widthBudget / frame.width, ENEMY_SPRITE_MAX_HEIGHT / frame.height);
      const point = enemySpritePoint(this.scale.width, count, index, widthBudget);
      this.enemySpriteBasePoints[index] = point;
      this.enemySprites[index] = this.add.image(point.x, point.y, texture.key)
        .setOrigin(texture.override?.originX ?? 0.5, texture.override?.originY ?? 0.5)
        .setScale(scale)
        .setDepth(10);
    });
    if (missingTextures.length > 0) {
      this.scheduleEnemySpriteRedraw(missingTextures);
      return;
    }
    this.enemySpriteRedrawAttempts = 0;
  }

  private enemySpriteOverride(enemyId: number) {
    return spriteOverrideForEnemyId(this.spriteOverrides_, enemyId);
  }

  private enemySpriteTexturePlan(enemy: BattleEnemy): EnemySpriteTexturePlan {
    if (this.isAttestationEnemy(enemy)) {
      const battle = this.attestationBattleTexturePlan();
      const fallback = this.attestationOverworldTexturePlan();
      const battleReady = this.enemySpriteTextureReady(battle);
      return battleReady || !this.textures.exists(fallback.key) ? battle : fallback;
    }
    const override = this.enemySpriteOverride(enemy.id);
    return override
      ? {
        key: spriteOverrideEnemyImageKey(enemy.id, override.image),
        url: spriteOverrideAssetUrl(override.image),
        override
      }
      : {
        key: spriteKey(enemy.spriteId),
        url: generatedAssetUrl(this.battleData_.assetLayout.spriteDir, enemy.spriteId),
        override
      };
  }

  private enemySpriteTextureReady(texture: EnemySpriteTexturePlan): boolean {
    if (!this.textures.exists(texture.key)) {
      return false;
    }
    const frame = this.textures.getFrame(texture.key);
    if (!frame || frame.width <= 0 || frame.height <= 0) {
      if (texture.override) {
        this.textures.remove(texture.key);
      }
      return false;
    }
    return true;
  }

  private isAttestationEnemy(enemy: BattleEnemy): boolean {
    return Boolean(this.attestation_ && enemy.overworldSprite === this.attestation_.check.npcId);
  }

  private attestationBattleTexturePlan(): EnemySpriteTexturePlan {
    const check = this.attestation_?.check;
    return {
      key: `attestation-battle-${check?.id ?? "missing"}`,
      url: publicAssetUrl(check?.battleSprite ?? ""),
      override: undefined
    };
  }

  private attestationOverworldTexturePlan(): EnemySpriteTexturePlan {
    const check = this.attestation_?.check;
    return {
      key: `attestation-overworld-${check?.id ?? "missing"}`,
      url: `/assets/swagbound/overworld-npc/${check?.drifellaId ?? "missing"}.png`,
      override: undefined
    };
  }

  private scheduleEnemySpriteRedraw(missingTextures: EnemySpriteTexturePlan[]): void {
    if (this.enemySpriteRedrawScheduled || this.enemySpriteRedrawAttempts >= MAX_ENEMY_SPRITE_REDRAW_ATTEMPTS) {
      return;
    }
    this.enemySpriteRedrawScheduled = true;
    this.enemySpriteRedrawAttempts += 1;

    let queued = false;
    for (const texture of missingTextures) {
      if (this.textures.exists(texture.key) || this.enemySpriteRetryQueuedKeys.has(texture.key)) {
        continue;
      }
      this.enemySpriteRetryQueuedKeys.add(texture.key);
      this.load.image(texture.key, texture.url);
      queued = true;
    }

    const redraw = () => {
      this.enemySpriteRedrawScheduled = false;
      this.enemySpriteRetryQueuedKeys.clear();
      this.drawEnemySprites();
      this.renderStatus();
      this.publish();
    };

    if (queued) {
      this.load.once("complete", redraw);
      if (!this.load.isLoading()) {
        this.load.start();
      }
      return;
    }
    this.time.delayedCall(ENEMY_SPRITE_REDRAW_RETRY_MS, redraw);
  }

  private createStatusWindow(): void {
    this.statusGraphics?.destroy();
    this.statusFieldGraphics?.destroy();
    this.statusAccentGraphics?.destroy();
    this.targetCursor?.destroy();
    this.menuCursorGraphics?.destroy();
    this.enemyShadowGraphics?.destroy();
    this.hitSparkGraphics?.destroy();
    this.flashOverlayGraphics?.destroy();
    this.psiAnimationGraphics?.destroy();
    this.destroyBattleUiText();
    this.enemyShadowGraphics = this.add.graphics().setDepth(9);
    this.flashOverlayGraphics = this.add.graphics().setDepth(BATTLE_FX_FLASH_DEPTH);
    this.psiAnimationGraphics = this.add.graphics().setDepth(BATTLE_FX_PSI_ANIMATION_DEPTH);
    this.hitSparkGraphics = this.add.graphics().setDepth(BATTLE_FX_SPARK_DEPTH);
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.statusFieldGraphics = this.add.graphics().setDepth(20.5);
    this.statusAccentGraphics = this.add.graphics().setDepth(26);
    this.targetCursor = this.add.graphics().setDepth(30);
    this.menuCursorGraphics = this.add.graphics().setDepth(31);
    this.actionCommandGraphics = this.add.graphics().setDepth(ACTION_CMD_DEPTH);
    this.actionCommandBanner = createCleanText(this, this.scale.width / 2, this.scale.height * 0.34, "", {
      fontSize: 20,
      color: CLEAN_UI_PRIMARY,
      weight: 500,
      fixedWidth: this.scale.width,
      align: "center"
    }).setDepth(ACTION_CMD_DEPTH + 1).setVisible(false);
    this.statusLayoutSignature = "";
  }

  private destroyBattleUiText(): void {
    for (const text of Object.values(this.menuTexts)) {
      text?.destroy();
    }
    this.menuTexts = {};
    for (const text of this.commandGridTexts) {
      text.destroy();
    }
    this.commandGridTexts = [];
    for (const text of this.submenuRowTexts) {
      text.destroy();
    }
    this.submenuRowTexts = [];
    for (const textSet of this.statusCardTexts) {
      textSet.name.destroy();
      textSet.hpLabel.destroy();
      textSet.ppLabel.destroy();
      textSet.hpValue.destroy();
      textSet.ppValue.destroy();
    }
    this.statusCardTexts = [];
  }

  private layoutStatusWindows(view: BattleUiView): BattleStatusLayout {
    const actorName = view.actorName?.trim() ? view.actorName.trim() : undefined;
    const actorNameOffset = actorName ? BATTLE_ACTOR_NAME_HEIGHT + BATTLE_ACTOR_NAME_GAP : 0;
    const stackedMenu = this.isStackedMenuInputActive();
    const command = this.commandGridLayout(view.commandLines, {
      anchor: stackedMenu ? "stacked" : "top",
      topMargin: BATTLE_MENU_TOP_MARGIN + (stackedMenu ? 0 : actorNameOffset),
      reservedTop: stackedMenu ? actorNameOffset : 0
    });
    // EB's "whose turn" plate is a small window hugging the name, not a bar spanning
    // the command window. Size it to the text (grid-snapped), capped at the menu width.
    const actorNameRect = actorName && command
      ? snapRectToEbGrid({
        x: command.x,
        y: stackedMenu
          ? Math.max(BATTLE_MENU_TOP_MARGIN, command.y - BATTLE_ACTOR_NAME_GAP - BATTLE_ACTOR_NAME_HEIGHT)
          : BATTLE_MENU_TOP_MARGIN,
        width: Math.min(
          command.width,
          this.measureTextWidth(actorName, BATTLE_STATUS_NAME_FONT_SIZE, 500) + BATTLE_COMMAND_TEXT_PADDING_X * 2
        ),
        height: BATTLE_ACTOR_NAME_HEIGHT
      })
      : undefined;
    const submenuItems = view.submenuItems ?? view.submenuLines.map((label, index) => ({
      label,
      selectable: true,
      sourceIndex: index
    }));
    const submenuX = command
      ? stackedMenu
        ? command.x + Math.max(0, command.width - BATTLE_SUBMENU_STACK_OVERLAP_X)
        : command.x + BATTLE_SUBMENU_CASCADE_OFFSET_X
      : 0;
    const submenuY = command
      ? stackedMenu
        ? command.y + BATTLE_SUBMENU_STACK_OFFSET_Y
        : command.y + Math.max(0, command.height - BATTLE_SUBMENU_CASCADE_OVERLAP_Y)
      : 0;
    // The info strip below the stack needs its full height RESERVED by the
    // submenu list, or a max-load list runs to the bottom clearance and leaves
    // the strip a single squashed line (rendered as "...").
    const descriptionReserve = view.descriptionLines.length > 0
      ? view.descriptionLines.length * BATTLE_LINE_HEIGHT + BATTLE_DESCRIPTION_TEXT_PADDING_Y * 2 + BATTLE_DESCRIPTION_GAP + 4
      : 0;
    const baseBottomClearance = stackedMenu ? BATTLE_STACKED_MENU_BOTTOM_CLEARANCE : BATTLE_MENU_BOTTOM_CLEARANCE;
    const submenuBottomClearance = baseBottomClearance + descriptionReserve;
    const submenu = command && submenuItems.length > 0
      ? view.submenuColumns && view.submenuColumns > 1
        ? this.menuGridListLayout({
          items: submenuItems,
          selectedSourceIndex: view.selectedSubmenuIndex,
          columns: view.submenuColumns,
          gridKind: view.submenuGridKind,
          gridOrder: view.submenuGridOrder,
          x: submenuX,
          y: submenuY,
          minWidth: BATTLE_SUBMENU_MIN_WIDTH,
          maxWidth: BATTLE_MENU_MAX_WIDTH,
          bottomClearance: submenuBottomClearance
        })
        : this.menuListLayout({
          labels: view.submenuLines,
          selectedIndex: view.selectedSubmenuIndex,
          x: submenuX,
          y: submenuY,
          minWidth: BATTLE_SUBMENU_MIN_WIDTH,
          maxWidth: BATTLE_MENU_MAX_WIDTH,
          bottomClearance: submenuBottomClearance
        })
      : undefined;
    const descriptionAnchor = submenu ?? command;
    const description = descriptionAnchor && view.descriptionLines.length > 0
      ? this.descriptionLayout(view.descriptionLines, descriptionAnchor, {
        mode: stackedMenu && this.submenu_ === "target" ? "stacked-target" : "below",
        bottomClearance: baseBottomClearance
      })
      : undefined;
    const executionMessage = view.executionMessageLines.length > 0
      ? this.executionMessageLayout(view.executionMessageLines)
      : undefined;
    const activeCardIndex = view.statusCards.findIndex((card) => card.active);
    const statusCardCount = Math.min(4, view.statusCards.length);
    const statusCards = battleStatusCardRects({
      screen: { width: this.scale.width, height: this.scale.height },
      memberCount: statusCardCount,
      activeIndex: activeCardIndex >= 0 && activeCardIndex < statusCardCount ? activeCardIndex : null,
      sideMargin: BATTLE_STATUS_CARD_SIDE_MARGIN,
      bottomMargin: BATTLE_STATUS_CARD_BOTTOM_MARGIN,
      gap: BATTLE_STATUS_CARD_GAP,
      cardHeight: BATTLE_STATUS_CARD_HEIGHT,
      minCardWidth: BATTLE_STATUS_CARD_MIN_WIDTH,
      maxCardWidth: BATTLE_STATUS_CARD_MAX_WIDTH,
      activeLift: BATTLE_STATUS_CARD_ACTIVE_LIFT
    }).map((rect, index) => ({
      ...rect,
      memberIndex: view.statusCards[index]?.memberIndex ?? index,
      target: Boolean(view.statusCards[index]?.target)
    }));
    const layout: BattleStatusLayout = {
      actorName: actorNameRect,
      command,
      submenu,
      description,
      executionMessage,
      statusCards
    };
    const signature = JSON.stringify(layout);
    const textReady =
      (!actorNameRect || Boolean(this.menuTexts.actorName)) &&
      (view.commandLines.length === 0 || this.commandGridTexts.length === view.commandLines.length) &&
      (submenuItems.length === 0 || this.submenuRowTexts.length === layout.submenu?.visibleCount) &&
      (view.descriptionLines.length === 0 || Boolean(this.menuTexts.description)) &&
      (view.executionMessageLines.length === 0 || Boolean(this.menuTexts.execution)) &&
      this.statusCardTexts.length === statusCards.length;
    if (signature === this.statusLayoutSignature && textReady) {
      return layout;
    }
    this.statusLayoutSignature = signature;

    this.destroyBattleUiText();

    const graphics = this.statusGraphics;
    if (!graphics) {
      return layout;
    }
    graphics.clear();
    this.statusFieldGraphics?.clear();
    this.statusAccentGraphics?.clear();

    if (layout.actorName) {
      const textRect = cleanPanelInnerRect(layout.actorName, {
        x: BATTLE_COMMAND_TEXT_PADDING_X,
        y: BATTLE_ACTOR_NAME_PADDING_Y
      });
      drawCleanPanel(graphics, layout.actorName, BATTLE_PANEL_BORDER);
      this.menuTexts.actorName = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        fixedWidth: textRect.width,
        weight: 500
      }).setDepth(23);
    }

    if (layout.command) {
      drawCleanPanel(graphics, layout.command, BATTLE_PANEL_BORDER);
      this.commandGridTexts = layout.command.cells.map((cell) => createCleanText(this, cell.x + BATTLE_MENU_CARET_GUTTER_PX, cell.y + 4, "", {
        fontSize: BATTLE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        fixedWidth: Math.max(1, cell.width - BATTLE_MENU_CARET_GUTTER_PX),
        fixedHeight: cell.height,
        weight: 400
      }).setDepth(21));
    }

    if (layout.submenu) {
      drawCleanPanel(graphics, layout.submenu, BATTLE_PANEL_BORDER);
      if (layout.submenu.mode === "grid" && layout.submenu.cells) {
        this.submenuRowTexts = layout.submenu.cells.map((cell) => {
          const textX = this.submenu_ === "psi" && cell.col === 0 ? cell.x : cell.x + BATTLE_MENU_CARET_GUTTER_PX;
          return createCleanText(this, textX, cell.y, "", {
            fontSize: BATTLE_FONT_SIZE,
            color: CLEAN_UI_PRIMARY,
            fixedWidth: Math.max(1, cell.width - (textX - cell.x)),
            fixedHeight: BATTLE_LINE_HEIGHT,
            align: this.submenu_ === "psi" && cell.col > 0 ? "center" : "left"
          }).setDepth(25);
        });
      } else {
        const textRect = this.standardMenuListTextRect(layout.submenu);
        this.submenuRowTexts = Array.from({ length: layout.submenu.visibleCount }, (_, row) =>
          createCleanText(this, textRect.x, textRect.y + row * BATTLE_LINE_HEIGHT, "", {
          fontSize: BATTLE_FONT_SIZE,
          color: CLEAN_UI_PRIMARY,
          fixedWidth: textRect.width,
          fixedHeight: BATTLE_LINE_HEIGHT
          }).setDepth(25)
        );
      }
    }

    if (layout.description) {
      const textRect = this.descriptionWindowTextRect(layout.description);
      drawCleanPanel(graphics, layout.description, BATTLE_PANEL_BORDER);
      this.menuTexts.description = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_DESCRIPTION_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        lineSpacing: BATTLE_LINE_SPACING,
        fixedWidth: textRect.width,
        wordWrapWidth: textRect.width
      }).setDepth(26);
    }

    if (layout.executionMessage) {
      const textRect = this.executionMessageTextRect(layout.executionMessage);
      drawCleanPanel(graphics, layout.executionMessage, BATTLE_PANEL_BORDER);
      this.menuTexts.execution = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_EXECUTION_MESSAGE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        lineSpacing: BATTLE_LINE_SPACING,
        fixedWidth: textRect.width,
        fixedHeight: textRect.height
      }).setDepth(27);
    }

    layout.statusCards.forEach((card) => {
      drawCleanPanel(graphics, card, { ...BATTLE_PANEL_BORDER, fillColor: EB_STATUS_CARD_FILL });
      this.statusCardTexts.push(this.createStatusCardTexts(card));
    });

    return layout;
  }

  private commandGridLayout(
    labels: string[],
    options: {
      anchor?: "top" | "stacked";
      topMargin?: number;
      reservedTop?: number;
    } = {}
  ): BattleCommandGridLayout | undefined {
    if (labels.length === 0) {
      return undefined;
    }
    const anchor = options.anchor ?? "top";
    const topMargin = Math.max(BATTLE_MENU_TOP_MARGIN, Math.round(options.topMargin ?? BATTLE_MENU_TOP_MARGIN));
    const reservedTop = Math.max(0, Math.round(options.reservedTop ?? 0));
    const minTop = topMargin + reservedTop;
    const screenMaxWidth = Math.max(1, Math.floor(this.scale.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN));
    const compactMaxWidth = Math.min(BATTLE_COMMAND_COMPACT_MAX_WIDTH, screenMaxWidth);
    const maxWidth = anchor === "stacked" ? compactMaxWidth : screenMaxWidth;
    const minWidth = Math.min(
      labels.length <= 1 ? BATTLE_COMMAND_SINGLE_MIN_WIDTH : BATTLE_COMMAND_COMPACT_MIN_WIDTH,
      maxWidth
    );
    const rows = Math.max(1, Math.ceil(labels.length / CLEAN_UI_GRID_COLUMNS));
    const labelWidth = Math.max(0, ...labels.map((label) => this.measureTextWidth(label, BATTLE_FONT_SIZE, 500)));
    const requestedWidth = Math.max(
      minWidth,
      Math.ceil(labelWidth * CLEAN_UI_GRID_COLUMNS + BATTLE_COMMAND_GRID_PADDING_X * 2 + BATTLE_MENU_CARET_GUTTER_PX * CLEAN_UI_GRID_COLUMNS + BATTLE_COMMAND_GRID_GAP_X * (CLEAN_UI_GRID_COLUMNS - 1))
    );
    const width = Math.min(
      Math.max(minWidth, requestedWidth),
      maxWidth
    );
    const height = BATTLE_COMMAND_GRID_PADDING_Y * 2 + rows * BATTLE_COMMAND_CELL_HEIGHT + (rows - 1) * BATTLE_COMMAND_GRID_GAP_Y;
    const bottomClearance = anchor === "stacked" ? BATTLE_STACKED_MENU_BOTTOM_CLEARANCE : BATTLE_MENU_BOTTOM_CLEARANCE;
    const y = anchor === "stacked"
      ? Math.floor(this.scale.height - bottomClearance - height)
      : topMargin;
    const rect = clampRectToScreen(
      snapRectToEbGrid({
        x: BATTLE_LEFT_MARGIN,
        y,
        width,
        height
      }),
      { width: this.scale.width, height: this.scale.height },
      {
        left: BATTLE_LEFT_MARGIN,
        right: BATTLE_MENU_RIGHT_MARGIN,
        top: minTop,
        bottom: bottomClearance
      }
    );
    const content = cleanPanelInnerRect(rect, {
      x: BATTLE_COMMAND_GRID_PADDING_X,
      y: BATTLE_COMMAND_GRID_PADDING_Y
    });
    return {
      ...rect,
      cells: cleanGridCells(content, labels.length, CLEAN_UI_GRID_COLUMNS, BATTLE_COMMAND_GRID_GAP_X, BATTLE_COMMAND_GRID_GAP_Y)
    };
  }

  private menuListLayout(options: {
    labels: string[];
    selectedIndex: number;
    x: number;
    y: number;
    minWidth: number;
    maxWidth: number;
    bottomClearance?: number;
  }): BattleSubmenuLayout {
    const screen = { width: this.scale.width, height: this.scale.height };
    const bottomClearance = Math.max(0, Math.round(options.bottomClearance ?? BATTLE_MENU_BOTTOM_CLEARANCE));
    const maxHeight = Math.max(
      BATTLE_LINE_HEIGHT + BATTLE_COMMAND_TEXT_PADDING_Y * 2,
      Math.floor(screen.height - bottomClearance - options.y)
    );
    const maxRows = Math.max(1, Math.floor((maxHeight - BATTLE_COMMAND_TEXT_PADDING_Y * 2) / BATTLE_LINE_HEIGHT));
    const visibleCount = Math.max(1, Math.min(options.labels.length, maxRows));
    const selectedIndex = clampNumber(Math.floor(options.selectedIndex), 0, Math.max(0, options.labels.length - 1));
    const visibleStart = visibleItemStart(selectedIndex, options.labels.length, visibleCount);
    const rect = contentFitWindowRect({
      x: options.x,
      y: options.y,
      labels: options.labels,
      measureText: (label) => this.measureTextWidth(label),
      lineHeight: BATTLE_LINE_HEIGHT,
      lineCount: visibleCount,
      paddingX: BATTLE_COMMAND_TEXT_PADDING_X + BATTLE_MENU_CARET_GUTTER_PX,
      paddingY: BATTLE_COMMAND_TEXT_PADDING_Y,
      minWidth: options.minWidth,
      maxWidth: Math.min(options.maxWidth, Math.floor(screen.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN)),
      maxHeight
    });
    const clamped = clampRectToScreen(rect, screen, {
      left: BATTLE_LEFT_MARGIN,
      right: BATTLE_MENU_RIGHT_MARGIN,
      top: BATTLE_MENU_TOP_MARGIN,
      bottom: bottomClearance
    });
    return {
      ...clamped,
      mode: "list",
      visibleStart,
      visibleCount,
      hasMoreBefore: visibleStart > 0,
      hasMoreAfter: visibleStart + visibleCount < options.labels.length
    };
  }

  private menuGridListLayout(options: {
    items: BattleSubmenuItem[];
    selectedSourceIndex: number;
    columns: number;
    gridKind?: BattleUiView["submenuGridKind"];
    gridOrder?: BattleUiView["submenuGridOrder"];
    x: number;
    y: number;
    minWidth: number;
    maxWidth: number;
    bottomClearance?: number;
  }): BattleSubmenuLayout {
    const screen = { width: this.scale.width, height: this.scale.height };
    const columns = Math.max(1, Math.floor(options.columns));
    const selectedItemIndex = Math.max(0, options.items.findIndex((item) => item.sourceIndex === options.selectedSourceIndex));
    const bottomClearance = Math.max(0, Math.round(options.bottomClearance ?? BATTLE_MENU_BOTTOM_CLEARANCE));
    const maxHeight = Math.max(
      BATTLE_LINE_HEIGHT + BATTLE_COMMAND_TEXT_PADDING_Y * 2,
      Math.floor(screen.height - bottomClearance - options.y)
    );
    const maxRows = Math.max(1, Math.floor((maxHeight - BATTLE_COMMAND_TEXT_PADDING_Y * 2) / BATTLE_LINE_HEIGHT));
    const gridWindow = battleSubmenuGridVisibleCells({
      itemCount: options.items.length,
      selectedIndex: selectedItemIndex,
      columns,
      maxRows,
      order: options.gridOrder
    });
    const columnWidths = this.battleSubmenuColumnWidths(options.items, columns, options.gridKind, options.gridOrder);
    const contentWidth = columnWidths.reduce((total, width) => total + width, 0) + BATTLE_COMMAND_GRID_GAP_X * Math.max(0, columns - 1);
    const width = Math.min(
      Math.max(options.minWidth, contentWidth + BATTLE_COMMAND_TEXT_PADDING_X * 2),
      options.maxWidth,
      Math.floor(screen.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN)
    );
    const rect = clampRectToScreen({
      x: options.x,
      y: options.y,
      width,
      height: BATTLE_COMMAND_TEXT_PADDING_Y * 2 + gridWindow.visibleRows * BATTLE_LINE_HEIGHT
    }, screen, {
      left: BATTLE_LEFT_MARGIN,
      right: BATTLE_MENU_RIGHT_MARGIN,
      top: BATTLE_MENU_TOP_MARGIN,
      bottom: bottomClearance
    });
    const content = cleanPanelInnerRect(rect, {
      x: BATTLE_COMMAND_TEXT_PADDING_X,
      y: BATTLE_COMMAND_TEXT_PADDING_Y
    });
    const cells = gridWindow.cells.map((cell) => {
      const x = content.x + submenuColumnOffset(columnWidths, cell.col, BATTLE_COMMAND_GRID_GAP_X);
      const y = content.y + cell.visibleRow * BATTLE_LINE_HEIGHT;
      return {
        index: cell.index,
        row: cell.row,
        col: cell.col,
        x,
        y,
        width: columnWidths[cell.col] ?? columnWidths[0] ?? 1,
        height: BATTLE_LINE_HEIGHT
      };
    });
    return {
      ...rect,
      mode: "grid",
      visibleStart: gridWindow.visibleStartRow * columns,
      visibleCount: cells.length,
      visibleRows: gridWindow.visibleRows,
      hasMoreBefore: gridWindow.hasMoreBefore,
      hasMoreAfter: gridWindow.hasMoreAfter,
      cells
    };
  }

  private battleSubmenuColumnWidths(
    items: BattleSubmenuItem[],
    columns: number,
    gridKind: BattleUiView["submenuGridKind"],
    gridOrder: BattleUiView["submenuGridOrder"]
  ): number[] {
    return Array.from({ length: columns }, (_, col) => {
      const labels = items.flatMap((item, index) => {
        const position = submenuGridPosition(index, items.length, columns, gridOrder);
        return position.col === col ? [item.label] : [];
      });
      const widest = labels.reduce((max, label) => Math.max(max, this.measureTextWidth(label)), 0);
      const caretWidth = gridKind === "psi-strengths" && col === 0 ? 0 : BATTLE_MENU_CARET_GUTTER_PX;
      const minWidth = gridKind === "psi-strengths" && col > 0 ? 24 : 0;
      return Math.max(minWidth, widest + caretWidth + 8);
    });
  }

  private descriptionLayout(
    lines: string[],
    anchor: CanvasRect,
    options: {
      mode?: "below" | "stacked-target";
      bottomClearance?: number;
    } = {}
  ): CanvasRect {
    const mode = options.mode ?? "below";
    const bottomClearance = Math.max(0, Math.round(options.bottomClearance ?? BATTLE_MENU_BOTTOM_CLEARANCE));
    const stackedTarget = mode === "stacked-target";
    const x = stackedTarget
      ? anchor.x + Math.min(BATTLE_TARGET_WINDOW_STACK_OFFSET_X, Math.max(0, anchor.width - BATTLE_TARGET_WINDOW_MIN_WIDTH))
      : anchor.x;
    const y = stackedTarget
      ? anchor.y + BATTLE_TARGET_WINDOW_STACK_OFFSET_Y
      : anchor.y + anchor.height + BATTLE_DESCRIPTION_GAP;
    const maxWidth = Math.min(
      Math.max(BATTLE_DESCRIPTION_MIN_WIDTH, anchor.width),
      BATTLE_DESCRIPTION_MAX_WIDTH,
      Math.floor(this.scale.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN)
    );
    const maxHeight = Math.max(
      BATTLE_LINE_HEIGHT + BATTLE_DESCRIPTION_TEXT_PADDING_Y * 2,
      Math.floor(this.scale.height - bottomClearance - y)
    );
    const rect = contentFitWindowRect({
      x,
      y,
      labels: lines,
      measureText: (label) => this.measureTextWidth(label, BATTLE_DESCRIPTION_FONT_SIZE),
      lineHeight: BATTLE_LINE_HEIGHT,
      lineCount: Math.max(1, lines.length),
      paddingX: BATTLE_DESCRIPTION_TEXT_PADDING_X,
      paddingY: BATTLE_DESCRIPTION_TEXT_PADDING_Y,
      minWidth: stackedTarget
        ? Math.max(BATTLE_TARGET_WINDOW_MIN_WIDTH, Math.min(anchor.width, maxWidth))
        : Math.max(BATTLE_DESCRIPTION_MIN_WIDTH, Math.min(anchor.width, maxWidth)),
      maxWidth,
      maxHeight
    });
    return clampRectToScreen(rect, { width: this.scale.width, height: this.scale.height }, {
      left: BATTLE_LEFT_MARGIN,
      right: BATTLE_MENU_RIGHT_MARGIN,
      top: BATTLE_MENU_TOP_MARGIN,
      bottom: bottomClearance
    });
  }

  private executionMessageLayout(lines: string[]): CanvasRect {
    const screenWidth = this.scale.width;
    const maxWidth = Math.min(
      BATTLE_EXECUTION_MESSAGE_MAX_WIDTH,
      Math.floor(screenWidth - BATTLE_LEFT_MARGIN * 2)
    );
    const measuredWidth = Math.max(
      BATTLE_EXECUTION_MESSAGE_MIN_WIDTH,
      ...lines.map((line) => this.measureTextWidth(line, BATTLE_EXECUTION_MESSAGE_FONT_SIZE, 500))
    );
    const width = Math.min(
      maxWidth,
      Math.ceil(measuredWidth + BATTLE_EXECUTION_MESSAGE_PADDING_X * 2)
    );
    const lineCount = Math.max(1, Math.min(lines.length, BATTLE_EXECUTION_MESSAGE_MAX_LINES));
    const height = BATTLE_EXECUTION_MESSAGE_PADDING_Y * 2 + lineCount * cleanLineHeight(
      BATTLE_EXECUTION_MESSAGE_FONT_SIZE,
      BATTLE_LINE_SPACING
    );
    return {
      x: Math.round((screenWidth - width) / 2),
      y: BATTLE_EXECUTION_MESSAGE_TOP,
      width,
      height
    };
  }

  private standardMenuListTextRect(rect: BattleSubmenuLayout): CanvasRect {
    const content = cleanPanelInnerRect(rect, {
      x: BATTLE_COMMAND_TEXT_PADDING_X,
      y: BATTLE_COMMAND_TEXT_PADDING_Y
    });
    return {
      x: content.x + BATTLE_MENU_CARET_GUTTER_PX,
      y: content.y,
      width: Math.max(1, content.width - BATTLE_MENU_CARET_GUTTER_PX),
      height: content.height
    };
  }

  private descriptionWindowTextRect(rect: CanvasRect): CanvasRect {
    return cleanPanelInnerRect(rect, {
      x: BATTLE_DESCRIPTION_TEXT_PADDING_X,
      y: BATTLE_DESCRIPTION_TEXT_PADDING_Y
    });
  }

  private executionMessageTextRect(rect: CanvasRect): CanvasRect {
    return cleanPanelInnerRect(rect, {
      x: BATTLE_EXECUTION_MESSAGE_PADDING_X,
      y: BATTLE_EXECUTION_MESSAGE_PADDING_Y
    });
  }

  private measureTextWidth(text: string, fontSize = BATTLE_FONT_SIZE, weight: 400 | 500 = 400): number {
    return estimateCleanTextWidth(text, fontSize, weight);
  }

  private updateBackground(): void {
    if (!this.backgroundAnimation) {
      return;
    }
    this.backgroundDebug = this.backgroundAnimation.update(this.time.now);
  }

  private renderBattleFx(now: number): void {
    this.applyScreenShake(now);
    this.renderFlashOverlayFx(now);
    this.renderPsiBattleAnimationFx(now);
    this.renderHitSparkFx(now);
    this.updateDamageNumbers(now);
  }

  /** Spawn a rising, fading damage number at an impact point (bigger + gold on a smash). */
  private spawnDamageNumber(point: SpritePoint, amount: number, opts: { onEnemy: boolean; smash: boolean }): void {
    if (amount <= 0) {
      return;
    }
    const big = opts.smash || amount >= 40;
    const color = opts.smash ? "#ffd23f" : opts.onEnemy ? "#ffffff" : "#ff8a8a";
    const text = createCleanText(this, point.x, point.y - 8, `${amount}`, {
      fontSize: big ? 22 : 16,
      color,
      weight: 500,
      fixedWidth: 60,
      align: "center"
    }).setDepth(ACTION_CMD_DEPTH - 1).setOrigin(0.5, 0.5);
    this.damageNumbers_.push({ text, startedAt: this.time.now, x: point.x, y: point.y - 8 });
  }

  private updateDamageNumbers(now: number): void {
    const kept: typeof this.damageNumbers_ = [];
    for (const dn of this.damageNumbers_) {
      const t = (now - dn.startedAt) / DAMAGE_NUMBER_MS;
      if (t >= 1) {
        dn.text.destroy();
        continue;
      }
      dn.text.setY(dn.y - t * 22); // float up
      dn.text.setAlpha(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3); // hold, then fade
      kept.push(dn);
    }
    this.damageNumbers_ = kept;
  }

  private applyScreenShake(now: number): void {
    const fx = this.screenShakeFx_;
    const offset = screenShakeOffset(now, fx.startedAt, fx.intensity, fx.durationMs);
    this.cameras.main.setScroll(-offset.dx, -offset.dy);
    if (fx.startedAt !== null && now - fx.startedAt >= fx.durationMs) {
      this.screenShakeFx_ = inactiveScreenShakeFx();
      this.cameras.main.setScroll(0, 0);
    }
  }

  private renderFlashOverlayFx(now: number): void {
    const graphics = this.flashOverlayGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    const fx = this.flashOverlayFx_;
    const overlay = flashOverlayState(now, fx.startedAt, fx.durationMs, fx.baseAlpha);
    if (overlay.active && overlay.alpha > 0) {
      graphics.fillStyle(fx.color, overlay.alpha);
      graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    }
    if (fx.startedAt !== null && now - fx.startedAt >= fx.durationMs) {
      this.flashOverlayFx_ = inactiveFlashOverlayFx();
    }
  }

  private renderPsiBattleAnimationFx(now: number): void {
    const graphics = this.psiAnimationGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    const fx = this.psiBattleAnimationFx_;
    if (!fx) {
      return;
    }
    try {
      const durationMs = Math.max(1, fx.definition.durationMs);
      const elapsed = now - fx.startedAt;
      if (elapsed < 0) {
        return;
      }
      if (elapsed >= durationMs) {
        this.psiBattleAnimationFx_ = null;
        return;
      }
      const progress = clampNumber(elapsed / durationMs, 0, 1);
      this.drawPsiAnimationBase(graphics, fx.definition, progress);
      switch (fx.definition.style) {
        case "fireSweep":
          this.drawPsiFireSweep(graphics, fx.definition, progress);
          break;
        case "iceCrystal":
          this.drawPsiIceCrystal(graphics, fx.definition, progress);
          break;
        case "thunderBolt":
          this.drawPsiThunderBolt(graphics, fx.definition, progress);
          break;
        case "radial":
          this.drawPsiRadial(graphics, fx.definition, progress);
          break;
        case "flashBurst":
          this.drawPsiFlashBurst(graphics, fx.definition, progress);
          break;
        case "cosmicSwirl":
          this.drawPsiCosmicSwirl(graphics, fx.definition, progress);
          break;
        case "supportGlow":
          this.drawPsiSupportGlow(graphics, fx.definition, progress);
          break;
      }
    } catch {
      graphics.clear();
      this.psiBattleAnimationFx_ = null;
    }
  }

  private drawPsiAnimationBase(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const envelope = Math.sin(progress * Math.PI);
    const strobe = definition.style === "thunderBolt"
      ? (Math.floor(progress * definition.pulses * 2) % 2 === 0 ? 1 : 0.16)
      : 0.55 + 0.45 * Math.sin(progress * TAU * definition.pulses) ** 2;
    graphics.fillStyle(
      psiAnimationColorAt(definition, progress),
      clampNumber(definition.baseAlpha * envelope * strobe, 0, 0.9)
    );
    graphics.fillRect(0, 0, this.scale.width, this.scale.height);
  }

  private drawPsiFireSweep(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const sweep = easeOutCubic(progress);
    for (let i = 0; i < definition.burstCount; i += 1) {
      const lane = i % 5;
      const bandProgress = (sweep + i * 0.11) % 1.25;
      const x = bandProgress * (width * 1.55) - width * 0.38;
      const y = height * (0.08 + lane * 0.17);
      const bandHeight = height * (0.16 + (i % 3) * 0.035);
      const alpha = clampNumber(definition.accentAlpha * (1 - progress) * (0.38 + lane * 0.035), 0, 0.72);
      graphics.fillStyle(definition.colors[(i + 1) % definition.colors.length] ?? 0xff7a2a, alpha);
      graphics.fillTriangle(x, y, x + width * 0.46, y + bandHeight * 0.48, x, y + bandHeight);
      graphics.fillRect(x - width * 0.16, y + bandHeight * 0.12, width * 0.24, bandHeight * 0.72);
    }
  }

  private drawPsiIceCrystal(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const center = this.psiAnimationCenter();
    const maxRadius = Math.hypot(this.scale.width, this.scale.height) * 0.58;
    const radius = maxRadius * (0.18 + easeOutCubic(progress) * 0.86);
    graphics.lineStyle(2, 0xffffff, clampNumber(definition.accentAlpha * (1 - progress * 0.45), 0, 0.86));
    for (let i = 0; i < definition.burstCount; i += 1) {
      const angle = (i / definition.burstCount) * TAU + progress * 0.48;
      const spread = 0.08 + (i % 3) * 0.025;
      const inner = radius * (0.08 + (i % 2) * 0.08);
      const outer = radius * (0.62 + (i % 4) * 0.09);
      const p1 = polarPoint(center.x, center.y, inner, angle - spread);
      const p2 = polarPoint(center.x, center.y, outer, angle);
      const p3 = polarPoint(center.x, center.y, inner, angle + spread);
      graphics.fillStyle(definition.colors[i % definition.colors.length] ?? 0x5fe0ff, definition.accentAlpha * (1 - progress * 0.55));
      graphics.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      graphics.lineBetween(center.x, center.y, p2.x, p2.y);
    }
    graphics.strokeCircle(center.x, center.y, radius * 0.22);
  }

  private drawPsiThunderBolt(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const strobeOn = Math.floor(progress * definition.pulses * 2) % 2 === 0;
    const alpha = strobeOn ? definition.accentAlpha : definition.accentAlpha * 0.22;
    for (let bolt = 0; bolt < definition.burstCount; bolt += 1) {
      const startX = width * (0.18 + bolt * 0.16) + Math.sin(progress * TAU * 3 + bolt) * 22;
      const segments = 6;
      graphics.lineStyle(bolt === 2 ? 5 : 3, definition.colors[bolt % definition.colors.length] ?? 0xffffff, alpha);
      graphics.beginPath();
      graphics.moveTo(startX, -height * 0.08);
      for (let segment = 1; segment <= segments; segment += 1) {
        const y = (segment / segments) * height * 0.92;
        const x = startX + Math.sin(segment * 1.7 + progress * TAU * 5 + bolt) * (26 + bolt * 5);
        graphics.lineTo(x, y);
      }
      graphics.strokePath();
    }
  }

  private drawPsiRadial(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const center = this.psiAnimationCenter();
    const maxRadius = Math.hypot(this.scale.width, this.scale.height) * 0.58;
    const spin = progress * TAU * 1.45;
    const alpha = clampNumber(definition.accentAlpha * Math.sin(progress * Math.PI), 0, 0.86);
    graphics.lineStyle(2, definition.colors[0] ?? 0xff54d8, alpha);
    for (let i = 0; i < definition.burstCount; i += 1) {
      const angle = spin + (i / definition.burstCount) * TAU;
      const inner = maxRadius * (0.05 + progress * 0.18);
      const outer = maxRadius * (0.45 + ((i % 4) * 0.08));
      const p1 = polarPoint(center.x, center.y, inner, angle);
      const p2 = polarPoint(center.x, center.y, outer, angle + progress * 0.62);
      graphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
    graphics.lineStyle(2, definition.colors[2] ?? 0x6f4dff, alpha * 0.75);
    graphics.strokeCircle(center.x, center.y, maxRadius * (0.16 + progress * 0.36));
    graphics.strokeCircle(center.x, center.y, maxRadius * (0.04 + ((progress * 1.9) % 1) * 0.28));
  }

  private drawPsiFlashBurst(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const center = this.psiAnimationCenter();
    const maxRadius = Math.hypot(this.scale.width, this.scale.height) * 0.55;
    const pulse = Math.sin(progress * Math.PI * 2) ** 2;
    const alpha = clampNumber(definition.accentAlpha * (1 - progress * 0.35) * (0.35 + pulse * 0.65), 0, 0.9);
    graphics.lineStyle(3, 0xffffff, alpha);
    for (let i = 0; i < definition.burstCount; i += 1) {
      const angle = (i / definition.burstCount) * TAU;
      const inner = maxRadius * 0.06;
      const outer = maxRadius * (0.32 + progress * 0.68);
      const p1 = polarPoint(center.x, center.y, inner, angle);
      const p2 = polarPoint(center.x, center.y, outer, angle);
      graphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
    graphics.lineStyle(2, definition.colors[2] ?? 0xfff49c, alpha * 0.72);
    graphics.strokeCircle(center.x, center.y, maxRadius * (0.2 + progress * 0.5));
  }

  private drawPsiCosmicSwirl(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const center = this.psiAnimationCenter();
    const maxRadius = Math.hypot(this.scale.width, this.scale.height) * 0.54;
    const alpha = clampNumber(definition.accentAlpha * Math.sin(progress * Math.PI), 0, 0.78);
    graphics.lineStyle(2, definition.colors[0] ?? 0xb46bff, alpha);
    for (let i = 0; i < definition.burstCount; i += 1) {
      const t = i / definition.burstCount;
      const angle = progress * TAU * 2.1 + t * TAU * 2.6;
      const radius = maxRadius * (0.1 + t * 0.85);
      const p = polarPoint(center.x, center.y, radius, angle);
      const starSize = 1.5 + (i % 3);
      graphics.fillStyle(definition.colors[i % definition.colors.length] ?? 0xffffff, alpha);
      graphics.fillRect(p.x - starSize / 2, p.y - starSize / 2, starSize, starSize);
      if (i % 3 === 0) {
        graphics.lineBetween(center.x, center.y, p.x, p.y);
      }
    }
    graphics.strokeCircle(center.x, center.y, maxRadius * (0.12 + ((progress * 1.4) % 1) * 0.46));
  }

  private drawPsiSupportGlow(
    graphics: Phaser.GameObjects.Graphics,
    definition: PsiBattleAnimationDefinition,
    progress: number
  ): void {
    const center = this.psiAnimationCenter();
    const maxRadius = Math.hypot(this.scale.width, this.scale.height) * 0.42;
    const envelope = Math.sin(progress * Math.PI);
    for (let ring = 0; ring < 3; ring += 1) {
      const ringProgress = (progress + ring * 0.22) % 1;
      const radius = maxRadius * (0.16 + ringProgress * 0.78);
      const alpha = clampNumber(definition.accentAlpha * envelope * (1 - ringProgress) * 0.5, 0, 0.42);
      graphics.fillStyle(definition.colors[ring % definition.colors.length] ?? 0x8fe0d8, alpha);
      graphics.fillCircle(center.x, center.y, radius);
    }
  }

  private psiAnimationCenter(): SpritePoint {
    return {
      x: this.scale.width / 2,
      y: this.scale.height * 0.44
    };
  }

  private renderHitSparkFx(now: number): void {
    const graphics = this.hitSparkGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    const active: HitSparkFx[] = [];
    for (const fx of this.hitSparkFx_) {
      const spark = hitSparkState(now, fx.startedAt, fx.durationMs);
      if (!spark.active) {
        continue;
      }
      this.drawHitSpark(graphics, fx, spark.radius, spark.alpha, spark.progress);
      active.push(fx);
    }
    this.hitSparkFx_ = active;
  }

  private drawHitSpark(
    graphics: Phaser.GameObjects.Graphics,
    fx: HitSparkFx,
    radius: number,
    alpha: number,
    progress: number
  ): void {
    const lineAlpha = clampNumber(alpha, 0, 1);
    const lineWidth = Math.max(1, Math.round(2 - progress));
    graphics.lineStyle(lineWidth, fx.color, lineAlpha);
    graphics.strokeCircle(fx.x, fx.y, radius);
    const rayCount = 8;
    const innerRadius = radius * 0.32;
    for (let index = 0; index < rayCount; index += 1) {
      const angle = (index / rayCount) * TAU + progress * 0.55;
      const inner = polarPoint(fx.x, fx.y, innerRadius, angle);
      const outer = polarPoint(fx.x, fx.y, radius + 3, angle);
      graphics.lineBetween(inner.x, inner.y, outer.x, outer.y);
    }
    graphics.fillStyle(0xffffff, lineAlpha * 0.72);
    graphics.fillCircle(fx.x, fx.y, Math.max(1, 3 * (1 - progress)));
  }

  private renderStatus(): void {
    const menuVisible = this.phase_ === "command-input" && this.currentActor_?.side === "party";
    const view = this.battleUiView(menuVisible);
    const layout = this.layoutStatusWindows(view);
    this.menuTexts.actorName?.setText(view.actorName ?? "");
    this.updateCommandGridTexts(view, layout);
    this.updateSubmenuRowTexts(view, layout);
    this.menuTexts.description?.setText(
      this.descriptionWindowText(view.descriptionLines, layout.description)
    );
    this.menuTexts.execution?.setText(
      this.executionMessageWindowText(view.executionMessageLines, layout.executionMessage)
    );
    layout.statusCards.forEach((card, index) => {
      const viewCard = view.statusCards[index];
      const textSet = this.statusCardTexts[index];
      if (viewCard && textSet) {
        this.updateStatusCardTexts(viewCard, card, textSet);
      }
    });
    this.renderStatusCardBars(view, layout);
    this.renderEnemySpriteEffects(this.time.now);
    this.renderBattleFx(this.time.now);
    this.renderMenuCursors(menuVisible, layout);
    this.renderTargetCursor(menuVisible);
  }

  private battleUiView(menuVisible: boolean): BattleUiView {
    const terminalCommandLines = this.phase_ === "victory-summary" || this.phase_ === "lose" || this.phase_ === "flee"
      ? ["OK"]
      : [];
    if (this.phase_ === "victory-summary") {
      return {
        commandLines: terminalCommandLines,
        submenuLines: [],
        descriptionLines: this.victorySummaryLines(),
        executionMessageLines: [],
        selectedSubmenuIndex: 0,
        statusCards: this.statusCardViews()
      };
    }
    if (this.phase_ === "lose") {
      return {
        commandLines: terminalCommandLines,
        submenuLines: [],
        descriptionLines: ["The party fell."],
        executionMessageLines: [],
        selectedSubmenuIndex: 0,
        statusCards: this.statusCardViews()
      };
    }
    if (this.phase_ === "flee") {
      return {
        commandLines: terminalCommandLines,
        submenuLines: [],
        descriptionLines: ["Got away."],
        executionMessageLines: [],
        selectedSubmenuIndex: 0,
        statusCards: this.statusCardViews()
      };
    }
    if (this.attestation_?.stage === "question") {
      const question = this.currentAttestationQuestion();
      return {
        actorName: "QUESTION",
        commandLines: question?.options ?? [],
        submenuLines: [],
        descriptionLines: question ? this.attestationDescriptionLines(question) : [],
        executionMessageLines: [],
        selectedSubmenuIndex: 0,
        statusCards: this.statusCardViews()
      };
    }
    if (!menuVisible) {
      return {
        commandLines: this.phase_ === "execution" ? [] : this.menuMessage_ ? [this.menuMessage_] : [],
        submenuLines: [],
        descriptionLines: [],
        executionMessageLines: this.phase_ === "execution" ? this.executionMessageLines_ : [],
        selectedSubmenuIndex: 0,
        statusCards: this.statusCardViews()
      };
    }
    return {
      actorName: this.activeActorName(),
      commandLines: this.commandsForCurrentActor().map(formatCommandLabel),
      submenuLines: this.visibleSubmenuTextLines(),
      submenuItems: this.visibleSubmenuItems(),
      submenuColumns: this.visibleSubmenuColumns(),
      submenuGridKind: this.visibleSubmenuGridKind(),
      submenuGridOrder: this.visibleSubmenuGridOrder(),
      descriptionLines: this.menuDescriptionLines(),
      executionMessageLines: [],
      selectedSubmenuIndex: this.visibleSubmenuIndex(),
      statusCards: this.statusCardViews()
    };
  }

  private isStackedMenuInputActive(): boolean {
    // The stacked layout dropped the command cluster to mid-screen. Keep the
    // command menu top-anchored (name plate + command grid near the top); the
    // submenu sits beside it rather than stacking down the middle.
    return false;
  }

  /** Display name of the party member currently choosing a command (top-left turn plate). */
  private activeActorName(): string {
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    return actor?.name ?? "";
  }

  private listWindowRows(
    lines: string[],
    rect: BattleSubmenuLayout | undefined
  ): string[] {
    if (!rect) {
      return [];
    }
    const textWidth = this.standardMenuListTextRect(rect).width;
    return lines
      .slice(rect.visibleStart, rect.visibleStart + rect.visibleCount)
      .map((line) => this.fitMeasuredText(line, textWidth));
  }

  private updateSubmenuRowTexts(view: BattleUiView, layout: BattleStatusLayout): void {
    if (!layout.submenu) {
      for (const text of this.submenuRowTexts) {
        text.setVisible(false);
      }
      return;
    }
    if (layout.submenu.mode === "grid") {
      const items = view.submenuItems ?? [];
      const cells = layout.submenu.cells ?? [];
      this.submenuRowTexts.forEach((text, index) => {
        const cell = cells[index];
        const item = cell ? items[cell.index] : undefined;
        const selected = Boolean(item?.selectable && item.sourceIndex === view.selectedSubmenuIndex);
        const textWidth = cell
          ? Math.max(1, cell.width - (this.submenu_ === "psi" && cell.col === 0 ? 0 : BATTLE_MENU_CARET_GUTTER_PX))
          : 1;
        text.setVisible(Boolean(item));
        text.setText(item ? this.fitMeasuredText(item.label, textWidth) : "");
        text.setColor(selected ? CLEAN_UI_SELECTION_TEXT : (item?.selectable ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY));
        text.setDepth(selected ? 32 : 25);
        text.setFontStyle(selected ? "500" : "400");
        text.setAlpha(1);
      });
      return;
    }
    const rows = this.listWindowRows(view.submenuLines, layout.submenu);
    const selectedRow = this.selectedSubmenuRow(layout.submenu);
    this.submenuRowTexts.forEach((text, index) => {
      const row = rows[index];
      const selected = selectedRow === index;
      text.setVisible(row !== undefined);
      text.setText(row ?? "");
      text.setColor(selected ? CLEAN_UI_SELECTION_TEXT : CLEAN_UI_PRIMARY);
      text.setDepth(selected ? 32 : 25);
      text.setFontStyle(selected ? "500" : "400");
      text.setAlpha(1);
    });
  }

  private descriptionWindowText(lines: string[], rect: CanvasRect | undefined): string {
    if (!rect) {
      return "";
    }
    const textRect = this.descriptionWindowTextRect(rect);
    const maxRows = Math.max(
      1,
      Math.floor(textRect.height / BATTLE_LINE_HEIGHT)
    );
    const visible = lines.slice(0, maxRows);
    if (lines.length > maxRows && visible.length > 0) {
      visible[visible.length - 1] = "...";
    }
    return visible.map((line) => this.fitMeasuredText(line, textRect.width)).join("\n");
  }

  private executionMessageWindowText(lines: string[], rect: CanvasRect | undefined): string {
    if (!rect) {
      return "";
    }
    const textRect = this.executionMessageTextRect(rect);
    const maxRows = Math.max(1, Math.floor(textRect.height / cleanLineHeight(
      BATTLE_EXECUTION_MESSAGE_FONT_SIZE,
      BATTLE_LINE_SPACING
    )));
    const visible = lines.slice(0, maxRows);
    if (lines.length > maxRows && visible.length > 0) {
      visible[visible.length - 1] = "...";
    }
    return visible.map((line) => this.fitMeasuredText(line, textRect.width)).join("\n");
  }

  private statusCardNameWidth(rect: CanvasRect): number {
    return this.statusCardContentRect(rect).width;
  }

  private createStatusCardTexts(card: BattleStatusCardLayout): BattleStatusCardTextSet {
    const content = this.statusCardContentRect(card);
    const hpMetrics = this.statusBarMetrics(content, "hp");
    const ppMetrics = this.statusBarMetrics(content, "pp");
    // EB card: black name/labels on the cream plate, light digits in the dark
    // meter boxes drawn behind the values (renderStatusCardBars).
    return {
      name: this.createStatusText(content.x, content.y + BATTLE_STATUS_NAME_Y, "", content.width, BATTLE_STATUS_NAME_FONT_SIZE, 500).setColor(EB_STATUS_CARD_TEXT).setDepth(22),
      hpLabel: this.createStatusText(content.x, hpMetrics.labelY, "HP", BATTLE_STATUS_LABEL_WIDTH, BATTLE_STATUS_LABEL_FONT_SIZE, 500).setColor(EB_STATUS_CARD_TEXT).setDepth(22),
      ppLabel: this.createStatusText(content.x, ppMetrics.labelY, "PP", BATTLE_STATUS_LABEL_WIDTH, BATTLE_STATUS_LABEL_FONT_SIZE, 500).setColor(EB_STATUS_CARD_TEXT).setDepth(22),
      hpValue: this.createStatusText(hpMetrics.valueX, hpMetrics.valueY, "", hpMetrics.valueWidth, BATTLE_STATUS_VALUE_FONT_SIZE, 400, "right").setColor(EB_STATUS_METER_TEXT).setDepth(22),
      ppValue: this.createStatusText(ppMetrics.valueX, ppMetrics.valueY, "", ppMetrics.valueWidth, BATTLE_STATUS_VALUE_FONT_SIZE, 400, "right").setColor(EB_STATUS_METER_TEXT).setDepth(22)
    };
  }

  private updateStatusCardTexts(
    card: BattleStatusCardView,
    rect: BattleStatusCardLayout,
    textSet: BattleStatusCardTextSet
  ): void {
    const nameWithStatus = card.statusLabel ? `${card.name}  ${card.statusLabel}` : card.name;
    textSet.name.setText(this.fitMeasuredText(nameWithStatus, this.statusCardNameWidth(rect)));
    textSet.hpLabel.setText("HP");
    textSet.ppLabel.setText("PP");
    textSet.hpValue.setText(formatCleanOdometerValue(card.hp));
    textSet.ppValue.setText(formatCleanOdometerValue(card.pp));
  }

  private createStatusText(
    x: number,
    y: number,
    text: string,
    maxWidth: number,
    fontSize: number,
    weight: 400 | 500,
    align: "left" | "right" = "left"
  ): Phaser.GameObjects.Text {
    return createCleanText(this, x, y, text, {
      fontSize,
      color: weight === 500 ? CLEAN_UI_PRIMARY : CLEAN_UI_SECONDARY,
      weight,
      fixedWidth: maxWidth,
      align
    });
  }

  private statusCardContentRect(card: CanvasRect): CanvasRect {
    return cleanPanelInnerRect(card, {
      x: BATTLE_STATUS_CONTENT_PADDING_X,
      y: BATTLE_STATUS_CONTENT_PADDING_Y
    });
  }

  private updateCommandGridTexts(view: BattleUiView, layout: BattleStatusLayout): void {
    if (!layout.command) {
      return;
    }
    layout.command.cells.forEach((cell, index) => {
      const text = this.commandGridTexts[index];
      if (!text) {
        return;
      }
      const selected = this.selectedCommandIndex() === index;
      text.setText(this.fitMeasuredText(view.commandLines[index] ?? "", Math.max(1, cell.width - BATTLE_MENU_CARET_GUTTER_PX)));
      if (selected) {
        // Inverted active row: dark text raised above the opaque white selection fill (depth 31);
        // it breathes so the menu reads as live, not a static list.
        text.setColor(CLEAN_UI_SELECTION_TEXT);
        text.setDepth(32);
        text.setFontStyle("600");
        text.setAlpha(0.9 + Math.sin(this.time.now / 150) * 0.1);
      } else {
        text.setColor(CLEAN_UI_PRIMARY);
        text.setDepth(21);
        text.setFontStyle("400");
        text.setAlpha(1);
      }
    });
  }

  private renderStatusCardBars(view: BattleUiView, layout: BattleStatusLayout): void {
    const fieldGraphics = this.statusFieldGraphics;
    const accentGraphics = this.statusAccentGraphics;
    if (!fieldGraphics || !accentGraphics) {
      return;
    }
    fieldGraphics.clear();
    accentGraphics.clear();
    layout.statusCards.forEach((card, index) => {
      const viewCard = view.statusCards[index];
      if (!viewCard) {
        return;
      }
      // EB marks the acting member by lifting the card (BATTLE_STATUS_CARD_ACTIVE_LIFT
      // in the layout); no highlight wash, which would also sit over the black-on-cream
      // card text at this depth.
      if (card.target) {
        accentGraphics.lineStyle(2, 0x4d9bdc, 0.9);
        accentGraphics.strokeRoundedRect(card.x + 6, card.y + 6, Math.max(1, card.width - 12), Math.max(1, card.height - 12), 4);
      }
      if (viewCard.mortal) {
        // Mortal-damage race: the member's HP is rolling toward 0 - pulse the card
        // red so the "heal or win NOW" window reads at a glance.
        const pulse = 0.4 + 0.45 * Math.abs(Math.sin(this.time.now / 170));
        accentGraphics.lineStyle(2, 0xe24b4a, pulse);
        accentGraphics.strokeRoundedRect(card.x + 2.5, card.y + 2.5, Math.max(1, card.width - 5), Math.max(1, card.height - 5), 6);
      }

      // EarthBound battle status shows HP/PP as rolling odometer numbers (no bars);
      // viewCard.hp is the rolling displayed vital that drives the mortal-damage race.
      // EB meter boxes: dark plates behind the odometer digits on the cream card.
      // Height stays under the 24px HP/PP row pitch so the two boxes read as
      // separate meters instead of one merged column.
      const content = this.statusCardContentRect(card);
      for (const row of ["hp", "pp"] as const) {
        const metrics = this.statusBarMetrics(content, row);
        fieldGraphics.fillStyle(EB_STATUS_METER_FILL, 1);
        fieldGraphics.fillRect(
          metrics.valueX - 6,
          metrics.valueY - 1,
          metrics.valueWidth + 10,
          BATTLE_STATUS_VALUE_FONT_SIZE + 4
        );
      }
    });
  }

  private statusBarMetrics(content: CanvasRect, row: "hp" | "pp"): {
    labelY: number;
    valueX: number;
    valueY: number;
    valueWidth: number;
    barX: number;
    barY: number;
    barWidth: number;
    barHeight: number;
  } {
    const rowY = content.y + (row === "hp" ? BATTLE_STATUS_HP_ROW_Y : BATTLE_STATUS_PP_ROW_Y);
    const valueWidth = Math.min(58, Math.max(42, Math.floor(content.width * 0.38)));
    const barX = content.x + BATTLE_STATUS_BAR_X;
    const valueX = content.x + content.width - valueWidth;
    const barWidth = Math.max(12, valueX - BATTLE_STATUS_BAR_VALUE_GAP - barX);
    return {
      labelY: rowY - 1,
      valueX,
      valueY: rowY - 2,
      valueWidth,
      barX,
      barY: rowY + 13,
      barWidth,
      barHeight: BATTLE_STATUS_BAR_HEIGHT
    };
  }

  private drawStatusBar(
    graphics: Phaser.GameObjects.Graphics,
    metrics: ReturnType<BattleScene["statusBarMetrics"]>,
    current: number,
    max: number,
    fillColor: number
  ): void {
    graphics.fillStyle(CLEAN_UI_TRACK, CLEAN_UI_TRACK_ALPHA);
    graphics.fillRoundedRect(metrics.barX, metrics.barY, metrics.barWidth, metrics.barHeight, 3);
    const fillWidth = Math.round(metrics.barWidth * statusBarFillFraction(current, max));
    if (fillWidth <= 0) {
      return;
    }
    graphics.fillStyle(fillColor, 0.95);
    graphics.fillRoundedRect(metrics.barX, metrics.barY, fillWidth, metrics.barHeight, 3);
  }

  private fitMeasuredText(text: string, maxWidth: number): string {
    if (this.measureTextWidth(text) <= maxWidth) {
      return text;
    }
    const suffix = "...";
    let fitted = text;
    while (fitted.length > 0 && this.measureTextWidth(fitted + suffix) > maxWidth) {
      fitted = fitted.slice(0, -1);
    }
    return fitted.length > 0 ? fitted + suffix : "";
  }

  private statusCardViews(): BattleStatusCardView[] {
    const activeMemberIndex = this.currentActor_?.side === "party" ? this.currentActor_.index : -1;
    const targetMemberIndex = this.activeTargetSide() === "party" ? this.partyTargetIndex_ : -1;
    const partyMembers = new Set<number>();
    const cards = this.battle_.party.map((member, memberIndex) => {
      partyMembers.add(memberIndex);
      return {
        memberIndex,
        name: member.name,
        hp: member.hp.displayed,
        maxHp: member.maxHp,
        pp: this.displayedPpForMember(memberIndex, member.pp),
        maxPp: member.maxPp,
        active: memberIndex === activeMemberIndex,
        target: memberIndex === targetMemberIndex,
        mortal: isPendingPartyMortalWound(member),
        statusLabel: statusBadgeLabel(member.statuses)
      };
    });
    for (const memberIndex of this.ppMeters.keys()) {
      if (!partyMembers.has(memberIndex)) {
        this.ppMeters.delete(memberIndex);
      }
    }
    return cards;
  }

  private displayedPpForMember(memberIndex: number, pp: number): number {
    const target = Math.max(0, Math.floor(pp));
    const existing = this.ppMeters.get(memberIndex);
    const meter = existing ?? createRollingMeter(target);
    const next = meter.target === target ? meter : setTarget(meter, target);
    this.ppMeters.set(memberIndex, next);
    return next.displayed;
  }

  private tickStatusPpMeters(delta: number): void {
    if (delta <= 0 || this.ppMeters.size === 0) {
      return;
    }
    for (const [memberIndex, meter] of this.ppMeters) {
      this.ppMeters.set(memberIndex, tickRollingMeter(meter, delta));
    }
  }

  private submenuTextLines(): string[] {
    if (this.submenu_ === "psi") {
      return this.psiSubmenuTextLines();
    }
    if (this.submenu_ === "goods") {
      return this.goodsSubmenuTextLines();
    }
    return [];
  }

  private visibleSubmenuItems(): BattleSubmenuItem[] | undefined {
    const items = this.activeBattleSubmenuItems();
    return items.length > 0 ? items : undefined;
  }

  private visibleSubmenuColumns(): number | undefined {
    if (this.isVisiblePsiSubmenu()) {
      const items = this.psiSubmenuItems();
      return items.length > 1 ? PSI_STRENGTH_ORDER.length + 1 : undefined;
    }
    if (this.isVisibleGoodsSubmenu()) {
      const items = this.goodsSubmenuItems();
      return items.length > 1 ? 2 : undefined;
    }
    return undefined;
  }

  private visibleSubmenuGridKind(): BattleUiView["submenuGridKind"] | undefined {
    if (this.isVisiblePsiSubmenu() && this.psiSubmenuItems().length > 1) {
      return "psi-strengths";
    }
    if (this.isVisibleGoodsSubmenu() && this.goodsSubmenuItems().length > 1) {
      return "goods-grid";
    }
    return undefined;
  }

  private visibleSubmenuGridOrder(): BattleUiView["submenuGridOrder"] | undefined {
    if (this.isVisibleGoodsSubmenu() && this.goodsSubmenuItems().length > 1) {
      return "column-major";
    }
    return "row-major";
  }

  private activeBattleSubmenuItems(): BattleSubmenuItem[] {
    if (this.isVisiblePsiSubmenu()) {
      return this.psiSubmenuItems();
    }
    if (this.isVisibleGoodsSubmenu()) {
      return this.goodsSubmenuItems();
    }
    return [];
  }

  private isVisiblePsiSubmenu(): boolean {
    return this.submenu_ === "psi" || (this.submenu_ === "target" && this.pendingPsiId_ !== null);
  }

  private isVisibleGoodsSubmenu(): boolean {
    return this.submenu_ === "goods" || (this.submenu_ === "target" && Boolean(this.pendingItem_));
  }

  private visibleSubmenuTextLines(): string[] {
    if (this.submenu_ !== "target") {
      return this.submenuTextLines();
    }
    if (this.pendingPsiId_ !== null) {
      return this.psiSubmenuTextLines();
    }
    if (this.pendingItem_) {
      return this.goodsSubmenuTextLines();
    }
    return [];
  }

  private visibleSubmenuIndex(): number {
    if (this.submenu_ !== "target") {
      return this.submenuIndex_;
    }
    if (this.pendingPsiId_ !== null) {
      const index = this.learnedPsiForCurrentActor().findIndex((psi) => psi.id === this.pendingPsiId_);
      return index >= 0 ? index : 0;
    }
    if (this.pendingItem_) {
      const index = this.goodsForCurrentActor().findIndex((entry) =>
        entry.inventorySlot === this.pendingItem_?.inventorySlot && entry.itemId === this.pendingItem_?.itemId
      );
      return index >= 0 ? index : 0;
    }
    return 0;
  }

  private psiSubmenuTextLines(): string[] {
    return this.psiSubmenuItems().map((item) => item.label);
  }

  private psiSubmenuItems(): BattleSubmenuItem[] {
    const entries = this.learnedPsiForCurrentActor();
    if (entries.length === 0) {
      return [{ label: this.menuMessage_ || "No learned PSI.", selectable: false }];
    }
    const indexByPsiId = new Map(entries.map((psi, index) => [psi.id, index]));
    return buildPsiMenuRows(entries).flatMap((family) => [
      { label: family.family, selectable: false },
      ...PSI_STRENGTH_ORDER.map((strength) => {
        const entry = family.entries.find((psi) => normalizedPsiStrength(psi.strength) === strength);
        return entry
          ? {
              label: psiStrengthGlyph(entry.strength),
              selectable: true,
              sourceIndex: indexByPsiId.get(entry.id) ?? 0
            }
          : {
              label: "",
              selectable: false
            };
      })
    ]);
  }

  private goodsSubmenuTextLines(): string[] {
    return this.goodsSubmenuItems().map((item) => item.label);
  }

  private goodsSubmenuItems(): BattleSubmenuItem[] {
    const entries = this.goodsForCurrentActor();
    if (entries.length === 0) {
      return [{ label: this.menuMessage_ || "No goods.", selectable: false }];
    }
    return entries.map((entry, index) => {
      const item = this.itemById(entry.itemId);
      return {
        label: item?.name || `[item ${entry.itemId}]`,
        selectable: true,
        sourceIndex: index
      };
    });
  }

  private menuDescriptionLines(): string[] {
    if (this.menuMessage_) {
      return [this.menuMessage_];
    }
    if (this.submenu_ === "command") {
      return [];
    }
    if (this.submenu_ === "psi") {
      const psi = this.learnedPsiForCurrentActor()[this.submenuIndex_];
      if (!psi) {
        return ["No PSI available."];
      }
      return [battlePsiInfoLine(psi)];
    }
    if (this.submenu_ === "goods") {
      const entry = this.goodsForCurrentActor()[this.submenuIndex_];
      const item = entry ? this.itemById(entry.itemId) : undefined;
      if (!entry) {
        return [];
      }
      return [battleItemEffectDescription(item ? decodeItemUseEffect(item) : undefined)];
    }
    if (this.submenu_ === "target") {
      const name = this.targetedCombatantName();
      if (this.pendingPsiId_ !== null) {
        const psi = this.psiById(this.pendingPsiId_);
        return psi ? [name, `PP Cost: ${psiPpCost(psi)}`] : [name];
      }
      if (this.pendingItem_) {
        const item = this.itemById(this.pendingItem_.itemId);
        return [battleItemEffectDescription(item ? decodeItemUseEffect(item) : undefined)];
      }
      return [name];
    }

    return [];
  }

  private currentAttestationQuestion(): DrawnSourceCheckQuestion | undefined {
    return this.attestation_?.draw.questions[this.attestation_.questionIndex];
  }

  private attestationDescriptionLines(question: DrawnSourceCheckQuestion): string[] {
    return wrapBattleDescription(question.prompt, 34);
  }

  /** Full name of the combatant under the target cursor, shown while selecting a target. */
  private targetedCombatantName(): string {
    const side = this.activeTargetSide();
    if (side === "party") {
      return this.battle_.party[this.partyTargetIndex_]?.name ?? "Choose friend";
    }
    if (side === "enemy") {
      this.normalizeTargetIndex();
      return this.battle_.enemies[this.targetIndex_]?.name ?? "Choose enemy";
    }
    return "Choose target";
  }

  private publish(): void {
    const currentOutcome: BattleOutcome = outcome(this.battle_);
    const now = this.time.now;
    const party = this.battle_.party.map(debugCombatant);
    const enemies = this.battle_.enemies.map((enemy, index) => ({
      ...debugCombatant(enemy),
      ...this.enemyEffectFor(index, now)
    }));
    const victoryPage = this.phase_ === "victory-summary" ? this.currentVictorySummaryPageDetail() : undefined;
    const inputMemberIndex = this.phase_ === "command-input" ? this.inputState_.memberCursor : null;
    const debugOptionsMemberIndex = this.phase_ === "command-input" && this.currentActor_?.side === "party"
      ? this.currentActor_.index
      : null;
    const devUsableOptions = import.meta.env.DEV
      ? {
          usablePsi: usablePsiForBattleDebug({
            state: this.battle_,
            inputMemberIndex: debugOptionsMemberIndex,
            psi: this.psi_?.psi,
            items: this.items_?.items,
            usabilityMatrix: this.usabilityMatrix_
          }),
          usableItems: usableItemsForBattleDebug({
            state: this.battle_,
            inputMemberIndex: debugOptionsMemberIndex,
            psi: this.psi_?.psi,
            items: this.items_?.items,
            usabilityMatrix: this.usabilityMatrix_
          })
        }
      : {};
    publishBattleDebug({
      mode: "battle",
      phase: this.phase_,
      transitionPhase: this.transitionPhase_,
      encounterAdvantage: this.encounterAdvantage_,
      autoMode: this.autoMode_,
      menuIndex: this.commandIndex_,
      roundNumber: this.battle_.roundNumber,
      commandIndex: this.commandIndex_,
      command: this.currentCommand(),
      submenu: this.submenu_,
      submenuIndex: this.submenuIndex_,
      selection: this.activeSelectionId(),
      targetIndex: this.targetIndex_,
      partyTargetIndex: this.partyTargetIndex_,
      turnOrder: this.roundOrder_.map(debugActor),
      currentActor: this.currentActor_ ? debugActor(this.currentActor_) : null,
      inputMemberIndex,
      queuedCount: this.queuedCommands_.length,
      executionStepIndex: this.executionStepDebugIndex(),
      executionStepCount: this.executionOrder_.length,
      executionMessage: this.executionMessageLines_.join("\n"),
      actionDelayMs: Math.round(this.actionDelayMs_),
      lastActionDwellMs: Math.round(this.lastActionDwellMs_),
      actionCommand: this.actionCommand_
        ? { kind: this.actionCommand_.kind, resolved: this.actionCommand_.resolved, baseDamage: this.actionCommand_.baseDamage }
        : null,
      actionCommandBanner: this.actionCommandBanner?.visible ? this.actionCommandBanner.text : null,
      lastSfx: this.lastSfx_,
      sfxCount: this.sfxCount_,
      firedSfx: [...this.firedSfx_],
      musicCue: this.currentBattleMusicCue,
      fx: { ...this.fxCounters_ },
      lastEnemyAction: this.lastEnemyAction_,
      party,
      enemies,
      ...devUsableOptions,
      background: this.backgroundDebug,
      windowLoaded: Boolean(this.window_),
      ...(this.window_ ? {
        defaultFlavorId: this.window_.defaultFlavorId,
        activeFlavorId: activeWindowFlavorId(this.window_)
      } : {}),
      player: {
        name: this.battle_.party[0]?.name ?? "",
        hpDisplayed: party[0]?.hpDisplayed ?? 0,
        hpTarget: party[0]?.hpTarget ?? 0,
        isRolling: party[0]?.isRolling ?? false
      },
      enemy: {
        hpDisplayed: enemies[0]?.hpDisplayed ?? 0,
        hpTarget: enemies[0]?.hpTarget ?? 0,
        isRolling: enemies[0]?.isRolling ?? false
      },
      outcome: currentOutcome,
      victorySummary: this.victorySummary_ ? debugVictorySummary(this.victorySummary_) : null,
      victoryTally: debugVictoryTally(this.victoryTally_),
      victorySummaryPageIndex: this.victorySummaryPageIndex_,
      victorySummaryPageCount: this.victorySummaryPages().length,
      victorySummaryPageKind: victoryPage?.kind ?? null,
      victorySummaryPageHighlighted: Boolean(victoryPage?.highlighted),
      attestation: this.attestationDebug(),
      mortalWounds: debugMortalWounds(this.battle_, this.mortalWoundRescueCount_)
    });
  }

  private attestationDebug(): NonNullable<Parameters<typeof publishBattleDebug>[0]["attestation"]> | null {
    const attestation = this.attestation_;
    if (!attestation) {
      return null;
    }
    const question = this.currentAttestationQuestion();
    return {
      checkId: attestation.check.id,
      stage: attestation.stage,
      questionIndex: attestation.questionIndex,
      drawCount: attestation.draw.drawCount,
      selectionIndex: attestation.selectionIndex,
      correctOptionIndex: question?.correctOptionIndex ?? -1,
      options: question?.options ?? [],
      correctSoFar: attestation.correctSoFar,
      lastOutcome: attestation.lastOutcome
    };
  }

  private playBattleMusicCue(cue: string, force = false): void {
    if (!force && this.currentBattleMusicCue === cue) {
      return;
    }
    this.currentBattleMusicCue = cue;
    void this.music_.play(cue);
  }

  private recordEnemyDamageSignals(previous: BattleState, next: BattleState, now: number): void {
    next.enemies.forEach((enemy, index) => {
      const previousEnemy = previous.enemies[index];
      if (!previousEnemy) {
        return;
      }
      const wasAlive = isCombatantAlive(previousEnemy);
      const alive = isCombatantAlive(enemy);
      if (wasAlive && !alive && this.enemyDefeatedAt[index] === null) {
        this.enemyDefeatedAt[index] = now;
      } else if (alive && this.enemyDefeatedAt[index] !== null) {
        this.enemyDefeatedAt[index] = null;
      }
      const wasRollingDown = previousEnemy.hp.isRolling && previousEnemy.hp.target < previousEnemy.hp.displayed;
      const isRollingDown = enemy.hp.isRolling && enemy.hp.target < enemy.hp.displayed;
      if (enemy.hp.target < previousEnemy.hp.target || (isRollingDown && !wasRollingDown)) {
        this.enemyLastHitAt[index] = now;
      }
    });
  }

  private renderEnemySpriteEffects(now: number): void {
    this.enemyShadowGraphics?.clear();
    this.enemySprites.forEach((sprite, index) => {
      const enemy = this.battle_.enemies[index];
      const alive = Boolean(enemy && isCombatantAlive(enemy));
      if (!alive && this.enemyDefeatedAt[index] === null) {
        this.enemyDefeatedAt[index] = now;
      } else if (alive && this.enemyDefeatedAt[index] !== null) {
        this.enemyDefeatedAt[index] = null;
      }
      const basePoint = this.enemySpriteBasePoints[index];
      const effect = this.enemyEffectFor(index, now);
      const lunge = this.enemyLungeOffsetFor(index, now);
      if (basePoint) {
        sprite.setPosition(basePoint.x + effect.wobble.dx + lunge.dx, basePoint.y + effect.wobble.dy + lunge.dy);
      }
      const defeat = enemyDefeatVisualState(now, alive, this.enemyDefeatedAt[index]);
      // Steady ground shadow under the sprite (does not wobble with it).
      if (basePoint && defeat.visible) {
        this.drawEnemyShadow(basePoint, sprite, ENEMY_SHADOW_ALPHA * defeat.alpha);
      }
      if (!defeat.visible) {
        sprite.clearTint();
        sprite.setAlpha(0);
        sprite.setVisible(false);
        return;
      }
      sprite.setVisible(true);
      if (defeat.phase === "dying") {
        if (defeat.flashActive && defeat.flashIntensity > 0) {
          sprite.setTint(0xffffff);
        } else {
          sprite.clearTint();
        }
        sprite.setAlpha(defeat.alpha);
        return;
      }
      if (!alive || !effect.flashActive || effect.flashIntensity <= 0) {
        sprite.clearTint();
        sprite.setAlpha(1);
        return;
      }
      sprite.setTint(0xffffff);
      sprite.setAlpha(Math.max(0.35, 1 - effect.flashIntensity * 0.55));
    });
  }

  private drawEnemyShadow(
    basePoint: SpritePoint,
    sprite: Phaser.GameObjects.Image,
    alpha: number
  ): void {
    const graphics = this.enemyShadowGraphics;
    if (!graphics || alpha <= 0) {
      return;
    }
    const ellipse = enemyShadowEllipse(basePoint.x, basePoint.y, sprite.displayWidth, sprite.displayHeight);
    graphics.fillStyle(0x000000, alpha);
    graphics.fillEllipse(ellipse.x, ellipse.y, ellipse.radiusX * 2, ellipse.radiusY * 2);
  }

  private renderMenuCursors(menuVisible: boolean, layout: BattleStatusLayout): void {
    const graphics = this.menuCursorGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (layout.submenu) {
      this.drawListScrollMarkers(graphics, layout.submenu);
    }
    const showCaret = menuCursorVisible(this.time.now);

    const commandIndex = this.selectedCommandIndex();
    if (layout.command && commandIndex !== null) {
      const cell = layout.command.cells[commandIndex];
      if (cell) {
        drawCleanSelection(graphics, cell, true);
        if (showCaret) {
          drawCleanCaret(graphics, cell.x + 3, cell.y, cell.height, CLEAN_UI_SELECTION_CARET);
        }
      }
    }

    if (!menuVisible) {
      return;
    }
    const submenuRow = this.selectedSubmenuRow(layout.submenu);
    if (layout.submenu && submenuRow !== null) {
      const cell = layout.submenu.mode === "grid" ? layout.submenu.cells?.[submenuRow] : undefined;
      const textRect = layout.submenu.mode === "list" ? this.standardMenuListTextRect(layout.submenu) : undefined;
      const selectionRect = cell
        ? {
            x: cell.x,
            y: cell.y - 2,
            width: cell.width,
            height: BATTLE_LINE_HEIGHT
          }
        : textRect
        ? {
            x: layout.submenu.x + BATTLE_COMMAND_TEXT_PADDING_X,
            y: textRect.y + submenuRow * BATTLE_LINE_HEIGHT - 2,
            width: Math.max(1, layout.submenu.width - BATTLE_COMMAND_TEXT_PADDING_X * 2),
            height: BATTLE_LINE_HEIGHT
          }
        : undefined;
      if (selectionRect) {
        drawCleanSelection(graphics, selectionRect, true);
        if (showCaret) {
          drawCleanCaret(graphics, selectionRect.x + 3, selectionRect.y, selectionRect.height, CLEAN_UI_SELECTION_CARET);
        }
      }
    }

    if (this.activeTargetSide() === "party") {
      for (const card of layout.statusCards.filter((statusCard) => statusCard.target)) {
        this.drawStatusCardTargetMarker(graphics, card);
      }
    }
  }

  private selectedCommandIndex(): number | null {
    if (this.phase_ === "victory-summary" || this.phase_ === "lose" || this.phase_ === "flee") {
      return 0;
    }
    if (this.attestation_?.stage === "question") {
      return this.attestation_.selectionIndex;
    }
    if (this.phase_ !== "command-input" || this.currentActor_?.side !== "party") {
      return null;
    }
    if (this.submenu_ === "command") {
      return this.commandIndex_;
    }
    return null;
  }

  private selectedSubmenuRow(submenu: BattleSubmenuLayout | undefined): number | null {
    if (!submenu || this.phase_ !== "command-input" || this.currentActor_?.side !== "party") {
      return null;
    }
    if (this.submenu_ !== "psi" && this.submenu_ !== "goods") {
      return null;
    }
    if (submenu.mode === "grid") {
      const items = this.activeBattleSubmenuItems();
      const cellIndex = (submenu.cells ?? []).findIndex((cell) => {
        const item = items[cell.index];
        return item?.selectable && item.sourceIndex === this.submenuIndex_;
      });
      return cellIndex >= 0 ? cellIndex : null;
    }
    const rowCount = this.submenu_ === "psi"
      ? this.learnedPsiForCurrentActor().length
      : this.goodsForCurrentActor().length;
    if (rowCount <= 0) {
      return null;
    }
    const row = this.submenuIndex_ - submenu.visibleStart;
    return row >= 0 && row < submenu.visibleCount ? row : null;
  }

  private drawListScrollMarkers(
    graphics: Phaser.GameObjects.Graphics,
    rect: BattleSubmenuLayout
  ): void {
    const x = Math.round(rect.x + rect.width - BATTLE_COMMAND_TEXT_PADDING_X + 2);
    if (rect.hasMoreBefore) {
      const y = Math.round(rect.y + 8);
      graphics.fillStyle(CLEAN_UI_PANEL_BORDER, 0.76);
      graphics.fillTriangle(x, y, x - 5, y + 6, x + 5, y + 6);
    }
    if (rect.hasMoreAfter) {
      const y = Math.round(rect.y + rect.height - 8);
      graphics.fillStyle(CLEAN_UI_PANEL_BORDER, 0.76);
      graphics.fillTriangle(x, y, x - 5, y - 6, x + 5, y - 6);
    }
  }

  private drawStatusCardTargetMarker(
    graphics: Phaser.GameObjects.Graphics,
    card: Pick<CanvasRect, "x" | "y" | "width">
  ): void {
    const x = Math.round(card.x + card.width / 2);
    const y = Math.max(2, card.y - 8);
    graphics.fillStyle(CLEAN_UI_PANEL_BORDER, 0.9);
    graphics.fillTriangle(x, y + 8, x - 7, y, x + 7, y);
  }

  private enemyEffectFor(index: number, now: number): EnemyEffectDebug {
    const enemy = this.battle_.enemies[index];
    const alive = Boolean(enemy && isCombatantAlive(enemy));
    const flash = alive
      ? flashState(now, this.enemyLastHitAt[index] ?? null, DEFAULT_DAMAGE_FLASH_MS)
      : { active: false, intensity: 0 };
    return {
      flashActive: flash.active,
      flashIntensity: roundTo(flash.intensity, 2),
      wobble: { dx: 0, dy: 0 }
    };
  }

  private enemyLungeOffsetFor(index: number, now: number): WobbleDebugOffset {
    const fx = this.enemyLungeFx_[index];
    if (!fx) {
      return { dx: 0, dy: 0 };
    }
    if (now - fx.startedAt >= fx.durationMs) {
      this.enemyLungeFx_[index] = null;
      return { dx: 0, dy: 0 };
    }
    return integerOffset(attackerLungeOffset(now, fx.startedAt, fx.durationMs, fx.dir));
  }

  private actorIsAlive(actor: BattleActor): boolean {
    const combatant = combatantAt(this.battle_, actor);
    return Boolean(combatant && isCombatantAlive(combatant));
  }

  private isTerminalPhase(): boolean {
    return this.phase_ === "win" || this.phase_ === "lose" || this.phase_ === "flee";
  }

  private isBattleFlowPaused(): boolean {
    return this.isTerminalPhase() || this.phase_ === "victory-summary";
  }

  private normalizeTargetIndex(): void {
    if (this.battle_.enemies[this.targetIndex_] && isCombatantAlive(this.battle_.enemies[this.targetIndex_])) {
      return;
    }
    const firstLiving = firstLivingIndex(this.battle_.enemies);
    this.targetIndex_ = firstLiving >= 0 ? firstLiving : 0;
  }

  private normalizePartyTargetIndex(): void {
    if (this.battle_.party[this.partyTargetIndex_] && isCombatantAlive(this.battle_.party[this.partyTargetIndex_])) {
      return;
    }
    const firstLiving = firstLivingIndex(this.battle_.party);
    this.partyTargetIndex_ = firstLiving >= 0 ? firstLiving : 0;
  }

  private victorySummaryLines(): string[] {
    const pages = this.victorySummaryPages();
    if (pages.length === 0) {
      return [];
    }
    const pageIndex = clampNumber(this.victorySummaryPageIndex_, 0, pages.length - 1);
    return pages[pageIndex] ?? [];
  }

  private victorySummaryPages(): string[][] {
    const pages = this.victorySummary_
      ? this.victorySummaryPageDetails().map((page) => [...page.lines])
      : [];
    if (this.victoryTally_ && pages[0]) {
      pages[0][0] = `${this.victoryTally_.exp.displayed} EXP`;
      pages[0][1] = `You got $${this.victoryTally_.money.displayed}`;
    }
    if (this.customVictoryPages_) {
      pages.push(...this.customVictoryPages_.map((page) => [...page]));
    }
    return pages.map((page) => page.map((line) => fitLine(line, 28)));
  }

  private victorySummaryPageDetails() {
    return this.victorySummary_ ? buildVictorySummaryViewModel(this.victorySummary_).pageDetails : [];
  }

  private currentVictorySummaryPageDetail() {
    const pages = this.victorySummaryPageDetails();
    if (pages.length === 0) {
      return undefined;
    }
    return pages[clampNumber(this.victorySummaryPageIndex_, 0, pages.length - 1)];
  }

  private advanceVictorySummaryPage(): boolean {
    if (this.completeVictoryTallyIfRolling()) {
      return true;
    }
    const next = advanceVictorySummaryPageIndex(
      this.victorySummaryPageIndex_,
      this.victorySummaryPages().length
    );
    this.victorySummaryPageIndex_ = next.pageIndex;
    if (!next.shouldExit) {
      this.playVictoryPageFlourishIfNeeded();
    }
    return !next.shouldExit;
  }

  private currentCommand(): BattleCommand {
    return this.commandsForCurrentActor()[this.commandIndex_] ?? "BASH";
  }

  private commandsForCurrentActor(): BattleCommand[] {
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    return commandsForCharId(actor?.charId ?? 0);
  }

  private resetMenuForActor(): void {
    this.commandIndex_ = 0;
    this.submenu_ = "command";
    this.submenuIndex_ = 0;
    this.pendingPsiId_ = null;
    this.pendingItem_ = null;
    this.targetMode_ = "bash";
    this.menuMessage_ = "";
  }

  private activeTargetSide(): "enemy" | "party" | null {
    if (this.submenu_ === "target") {
      return this.targetMode_ === "psi-recovery" || this.targetMode_ === "goods" ? "party" : "enemy";
    }
    if (this.submenu_ === "command" && targetModeForCommand(this.currentCommand())) {
      return "enemy";
    }
    return null;
  }

  private activeSelectionId(): string {
    if (this.submenu_ === "command") {
      return this.currentCommand();
    }
    if (this.submenu_ === "psi") {
      const psi = this.learnedPsiForCurrentActor()[this.submenuIndex_];
      return psi ? `psi:${psi.id}` : "psi:none";
    }
    if (this.submenu_ === "goods") {
      const item = this.goodsForCurrentActor()[this.submenuIndex_];
      return item ? `item:${item.inventorySlot}:${item.itemId}` : "item:none";
    }
    if (this.pendingPsiId_ !== null) {
      return `target:psi:${this.pendingPsiId_}`;
    }
    if (this.pendingItem_) {
      return `target:item:${this.pendingItem_.inventorySlot}:${this.pendingItem_.itemId}`;
    }
    if (targetModeForCommand(this.currentCommand())) {
      return `target:${this.currentCommand()}:${this.targetIndex_}`;
    }
    return "target:none";
  }

  private learnedPsiForCurrentActor(): PsiData[] {
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    if (!actor || actor.isEnemy) {
      return [];
    }
    const learned = learnedPsiForCombatant(this.psi_?.psi ?? [], actor);
    return this.usabilityMatrix_ ? battleUsablePsi(learned, this.usabilityMatrix_) : learned;
  }

  private goodsForCurrentActor(): Array<{ itemId: number; inventorySlot: number }> {
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    if (!actor || actor.isEnemy) {
      return [];
    }
    return actor.inventory
      .map((itemId, inventorySlot) => ({ itemId, inventorySlot }));
  }

  private psiById(psiId: number): PsiData | undefined {
    return this.psi_?.psi.find((psi) => psi.id === psiId);
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.items_?.items.find((item) => item.id === itemId);
  }

  private async loadOptionalGeneratedMenuData(): Promise<void> {
    if (this.items_ && this.psi_ && this.usabilityMatrix_) {
      return;
    }
    const manifest = await fetchJson<{ files?: { items?: string; psi?: string } }>("/generated/manifest.json");
    const files = manifest?.files;
    const [items, psi, usabilityMatrix] = await Promise.all([
      this.items_ || !files?.items ? Promise.resolve(undefined) : fetchParsed(`/generated/${files.items}`, ItemCollectionSchema),
      this.psi_ || !files?.psi ? Promise.resolve(undefined) : fetchParsed(`/generated/${files.psi}`, PsiCollectionSchema),
      this.usabilityMatrix_ ? Promise.resolve(undefined) : fetchParsed("/generated/usability-matrix.json", UsabilityMatrixSchema)
    ]);
    if (items) {
      this.items_ = items;
    }
    if (psi) {
      this.psi_ = psi;
    }
    if (usabilityMatrix) {
      this.usabilityMatrix_ = usabilityMatrix;
    }
    this.renderStatus();
    this.publish();
  }

  private renderTargetCursor(menuVisible: boolean): void {
    const cursor = this.targetCursor;
    if (!cursor) {
      return;
    }
    cursor.clear();
    if (!menuVisible || this.activeTargetSide() !== "enemy") {
      return;
    }
    this.normalizeTargetIndex();
    const target = this.enemySprites[this.targetIndex_];
    if (!target || !isCombatantAlive(this.battle_.enemies[this.targetIndex_])) {
      return;
    }
    const x = target.x;
    const y = enemyTargetCursorAnchorY(target.y, target.displayHeight);
    cursor.fillStyle(0xf8fafc, 1);
    cursor.fillTriangle(x, y + 14, x - 8, y + 2, x + 8, y + 2);
    cursor.fillRect(x - 3, y - 5, 6, 9);
    cursor.lineStyle(1, 0x111827, 1);
    cursor.strokeTriangle(x, y + 14, x - 8, y + 2, x + 8, y + 2);
    cursor.strokeRect(x - 3, y - 5, 6, 9);
  }
}

function selectBattleGroup(data: BattleData, groupId: number | undefined): BattleGroup {
  return data.groups.find((group) => group.id === groupId) ?? data.groups[0];
}

function initialBattleRoundInputState(): BattleRoundInputState {
  return {
    memberCursor: 0,
    submenu: "command",
    selectionIndex: 0,
    queue: []
  };
}

function createVictoryTally(summary: BattleVictorySummary, now: number): VictoryTallyState {
  return {
    exp: setTarget(createFixedRollingMeter(0, victoryTallyRate(summary.expGained)), summary.expGained),
    money: setTarget(createFixedRollingMeter(0, victoryTallyRate(summary.moneyGained)), summary.moneyGained),
    nextTickSfxAtMs: now
  };
}

function victoryTallyRate(total: number): number {
  const target = Math.max(0, Math.floor(total));
  if (target <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(target / (VICTORY_TALLY_DURATION_MS / 1000)));
}

function victoryTallyIsRolling(tally: VictoryTallyState): boolean {
  return tally.exp.isRolling || tally.money.isRolling;
}

function completedRollingMeter(meter: RollingMeterState): RollingMeterState {
  return {
    ...meter,
    displayed: meter.target,
    isRolling: false,
    stepRemainder: 0
  };
}

function battleSubmenuFromInput(submenu: BattleRoundInputState["submenu"]): BattleSubmenu {
  return submenu === "target-enemy" || submenu === "target-ally" ? "target" : submenu;
}

function commandIndexForChar(command: BattleCommand | undefined, charId = 0): number {
  if (!command) {
    return 0;
  }
  const commands = commandsForCharId(charId);
  const index = commands.indexOf(command);
  return index >= 0 ? index : 0;
}

function clampSelectionIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, Math.floor(index)));
}

function buildPostBattlePartySnapshot(base: PartyStateSnapshot, battle: BattleState): PartyStateSnapshot {
  const partyCombatants = battle.party.filter((combatant) => !combatant.isEnemy);
  const inventoryByChar = new Map<number, number[]>(
    base.inventory.map((entry) => [entry.charId, [...entry.itemIds]])
  );
  const battleMembersByChar = new Map<number, PartyBattleMemberSnapshot>(
    (base.battleMembers ?? []).map((member) => [member.charId, cloneBattleMemberSnapshot(member)])
  );
  const statusesByChar = new Map<number, StatusState>(
    (base.statuses ?? []).map((entry) => [entry.charId, cloneStatusState(entry.statuses)])
  );

  for (const combatant of partyCombatants) {
    inventoryByChar.set(combatant.charId, combatant.inventory.map((itemId) => stat(itemId)));
    battleMembersByChar.set(combatant.charId, battleMemberSnapshotFromCombatant(combatant));
    const persistentStatuses = stripBattleScopedStatuses(combatant.statuses);
    if (persistentStatuses.length) {
      statusesByChar.set(combatant.charId, cloneStatusState(persistentStatuses));
    } else {
      statusesByChar.delete(combatant.charId);
    }
  }

  const partyIds = unique([
    ...base.partyIds,
    ...partyCombatants.map((combatant) => stat(combatant.charId))
  ]).sort((a, b) => a - b);

  return {
    wallet: stat(battle.wallet),
    ...(base.bank !== undefined || battle.bank !== undefined ? { bank: stat(battle.bank ?? base.bank ?? 0) } : {}),
    partyIds,
    inventory: [...inventoryByChar.entries()]
      .sort(([a], [b]) => a - b)
      .map(([charId, itemIds]) => ({ charId, itemIds })),
    equipped: base.equipped.map((entry) => ({ charId: entry.charId, slots: { ...entry.slots } })),
    battleMembers: [...battleMembersByChar.values()]
      .sort((a, b) => a.charId - b.charId)
      .map(cloneBattleMemberSnapshot),
    statuses: [...statusesByChar.entries()]
      .sort(([a], [b]) => a - b)
      .map(([charId, statuses]) => ({ charId, statuses: cloneStatusState(statuses) }))
  };
}

function cloneStatusState(statuses: StatusState | undefined): StatusState {
  return (statuses ?? []).map((entry) => ({ ...entry }));
}

function battleMemberSnapshotFromCombatant(combatant: BattleState["party"][number]): PartyBattleMemberSnapshot {
  return {
    charId: stat(combatant.charId),
    level: Math.max(1, stat(combatant.level)),
    experience: stat(combatant.experience),
    hp: Math.min(Math.max(1, stat(combatant.maxHp)), stat(combatant.hp.target)),
    maxHp: Math.max(1, stat(combatant.maxHp)),
    pp: Math.min(stat(combatant.maxPp), stat(combatant.pp)),
    maxPp: stat(combatant.maxPp),
    inventory: combatant.inventory.map((itemId) => stat(itemId)),
    // BASE stats only - persisting effective stats re-adds equip bonuses next battle.
    stats: combatantBaseStats(combatant)
  };
}

function cloneBattleMemberSnapshot(member: PartyBattleMemberSnapshot): PartyBattleMemberSnapshot {
  return {
    charId: member.charId,
    level: member.level,
    experience: member.experience,
    hp: member.hp,
    maxHp: member.maxHp,
    pp: member.pp,
    maxPp: member.maxPp,
    inventory: [...member.inventory],
    stats: { ...member.stats }
  };
}

function enemiesForGroup(data: BattleData, group: BattleGroup): BattleEnemy[] {
  return expandBattleGroupEnemies(data, group);
}

function selectBattleBackground(data: BattleData, id: number): BattleBackground | undefined {
  return data.backgrounds?.find((background) => background.id === id);
}

function generatedAssetUrl(dir: string, id: number): string {
  return `/generated/${dir}/${pad3(id)}.png`;
}

function publicAssetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function backgroundKey(id: number): string {
  return `battle-bg-${id}`;
}

function spriteKey(id: number): string {
  return `battle-sprite-${id}`;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function debugCombatant(combatant: BattleState["party"][number]): {
  hpDisplayed: number;
  hpTarget: number;
  isRolling: boolean;
  alive: boolean;
  pp: number;
  maxPp: number;
  inventoryCount: number;
  statuses: string[];
} {
  return {
    hpDisplayed: combatant.hp.displayed,
    hpTarget: combatant.hp.target,
    isRolling: combatant.hp.isRolling,
    alive: isCombatantAlive(combatant),
    pp: combatant.pp,
    maxPp: combatant.maxPp,
    inventoryCount: combatant.inventory.length,
    statuses: (combatant.statuses ?? []).map((entry) => entry.ailment)
  };
}

function debugActor(actor: BattleActor): { side: "party" | "enemy"; index: number } {
  return { side: actor.side, index: actor.index };
}

function initialBattleFxCounters(): BattleFxCounters {
  return {
    shakeCount: 0,
    sparkCount: 0,
    flashCount: 0,
    lungeCount: 0
  };
}

function inactiveScreenShakeFx(): ScreenShakeFx {
  return {
    startedAt: null,
    intensity: 0,
    durationMs: BATTLE_FX_SCREEN_SHAKE_MS
  };
}

function inactiveFlashOverlayFx(): FlashOverlayFx {
  return {
    startedAt: null,
    durationMs: BATTLE_FX_ATTACK_FLASH_MS,
    baseAlpha: 0,
    color: BATTLE_FX_ATTACK_FLASH_COLOR
  };
}

function uniqueActors(actors: readonly BattleActor[]): BattleActor[] {
  const seen = new Set<string>();
  return actors.filter((actor) => {
    const key = `${actor.side}:${actor.index}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function debugVictorySummary(summary: BattleVictorySummary): {
  expGained: number;
  moneyGained: number;
  drops: Array<{ enemyId: number; itemId: number; itemName: string; recipientCharId: number }>;
  levelUps: Array<{
    charId: number;
    name: string;
    fromLevel: number;
    toLevel: number;
    statChanges: Array<{ stat: string; before: number; after: number; gain: number }>;
    learnedSkills: Array<{ psiId: number; name: string }>;
  }>;
} {
  return {
    expGained: summary.expGained,
    moneyGained: summary.moneyGained,
    drops: summary.drops.map((drop) => ({
      enemyId: drop.enemyId,
      itemId: drop.itemId,
      itemName: drop.itemName,
      recipientCharId: drop.recipientCharId
    })),
    levelUps: summary.levelUps.map((levelUp) => ({
      charId: levelUp.charId,
      name: levelUp.name,
      fromLevel: levelUp.fromLevel,
      toLevel: levelUp.toLevel,
      statChanges: levelUp.statChanges.map((change) => ({ ...change })),
      learnedSkills: levelUp.learnedSkills.map((skill) => ({ ...skill }))
    }))
  };
}

function debugVictoryTally(tally: VictoryTallyState | null): {
  expDisplayed: number;
  expTarget: number;
  moneyDisplayed: number;
  moneyTarget: number;
  isRolling: boolean;
} | null {
  if (!tally) {
    return null;
  }
  return {
    expDisplayed: tally.exp.displayed,
    expTarget: tally.exp.target,
    moneyDisplayed: tally.money.displayed,
    moneyTarget: tally.money.target,
    isRolling: victoryTallyIsRolling(tally)
  };
}

function debugMortalWounds(
  battle: BattleState,
  rescuedOnBattleEnd: number
): {
  pendingCount: number;
  rescuedOnBattleEnd: number;
  pending: Array<{ index: number; name: string; hpDisplayed: number; hpTarget: number; isRolling: boolean }>;
} {
  const pending = battle.party
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => isPendingPartyMortalWound(member))
    .map(({ member, index }) => ({
      index,
      name: member.name,
      hpDisplayed: member.hp.displayed,
      hpTarget: member.hp.target,
      isRolling: member.hp.isRolling
    }));
  return {
    pendingCount: pending.length,
    rescuedOnBattleEnd,
    pending
  };
}

function isBattleImpactCue(cue: BattleSfxCue): boolean {
  return cue === "hit" || cue === "smash" || cue === "miss";
}

function enemySpritePoint(stageWidth: number, count: number, index: number, widthBudget: number): { x: number; y: number } {
  return {
    x: stageWidth / 2 + (index - (count - 1) / 2) * widthBudget,
    // Lowered from 164 so the top-left command window + target cursor clear the
    // enemy art (the 512x448 stage keeps the bottom status cards well below this).
    y: 200
  };
}

function polarPoint(cx: number, cy: number, radius: number, angle: number): SpritePoint {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function integerOffset(offset: { dx: number; dy: number }): { dx: number; dy: number } {
  return {
    dx: Math.round(offset.dx),
    dy: Math.round(offset.dy)
  };
}

function roundTo(value: number, places: number): number {
  const multiplier = 10 ** Math.max(0, places);
  return Math.round(value * multiplier) / multiplier;
}

function fitLine(line: string, width: number): string {
  return line.length > width ? line.slice(0, Math.max(0, width - 3)) + "..." : line;
}

function wrapBattleDescription(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/g).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 4);
}

function livingEnemyIndices(state: BattleState): number[] {
  return state.enemies.flatMap((enemy, index) => (isCombatantAlive(enemy) ? [index] : []));
}

function livingPartyIndices(state: BattleState): number[] {
  return state.party.flatMap((member, index) => (isCombatantAlive(member) ? [index] : []));
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return (index + length) % length;
}

function visibleItemStart(cursorIndex: number, itemCount: number, maxItems: number): number {
  if (maxItems <= 0 || itemCount <= maxItems) {
    return 0;
  }
  return Math.min(Math.max(0, cursorIndex - maxItems + 1), itemCount - maxItems);
}

function moveBattleSubmenuSourceIndex(
  items: BattleSubmenuItem[],
  sourceIndex: number,
  direction: BattleCommandGridDirection,
  columns: number,
  order: BattleUiView["submenuGridOrder"]
): number {
  const currentItemIndex = items.findIndex((item) => item.selectable && item.sourceIndex === sourceIndex);
  if (currentItemIndex < 0) {
    return sourceIndex;
  }
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const rows = Math.max(1, Math.ceil(items.length / normalizedColumns));
  const current = submenuGridPosition(currentItemIndex, items.length, normalizedColumns, order);
  const rowStep = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const colStep = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  for (let attempt = 1; attempt <= items.length + normalizedColumns; attempt += 1) {
    const row = modulo(current.row + rowStep * attempt, rows);
    const col = modulo(current.col + colStep * attempt, normalizedColumns);
    const nextItem = items[submenuGridIndex(row, col, items.length, normalizedColumns, order)];
    if (nextItem?.selectable && nextItem.sourceIndex !== undefined) {
      return nextItem.sourceIndex;
    }
  }
  return sourceIndex;
}

function submenuGridPosition(
  index: number,
  count: number,
  columns: number,
  order: BattleUiView["submenuGridOrder"] = "row-major"
): { row: number; col: number } {
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const normalizedIndex = Math.max(0, Math.min(Math.floor(index), Math.max(0, count - 1)));
  const rows = Math.max(1, Math.ceil(Math.max(0, count) / normalizedColumns));
  if (order === "column-major") {
    return {
      row: normalizedIndex % rows,
      col: Math.floor(normalizedIndex / rows)
    };
  }
  return {
    row: Math.floor(normalizedIndex / normalizedColumns),
    col: normalizedIndex % normalizedColumns
  };
}

function submenuGridIndex(
  row: number,
  col: number,
  count: number,
  columns: number,
  order: BattleUiView["submenuGridOrder"] = "row-major"
): number {
  const normalizedColumns = Math.max(1, Math.floor(columns));
  const rows = Math.max(1, Math.ceil(Math.max(0, count) / normalizedColumns));
  const normalizedRow = modulo(row, rows);
  const normalizedCol = modulo(col, normalizedColumns);
  return order === "column-major"
    ? normalizedCol * rows + normalizedRow
    : normalizedRow * normalizedColumns + normalizedCol;
}

function submenuColumnOffset(widths: number[], col: number, gap: number): number {
  return widths.slice(0, Math.max(0, col)).reduce((total, width) => total + width + gap, 0);
}

function clampRectToScreen(
  rect: CanvasRect,
  screen: { width: number; height: number },
  margins: { left: number; right: number; top: number; bottom: number }
): CanvasRect {
  const width = Math.min(rect.width, Math.max(1, Math.floor(screen.width - margins.left - margins.right)));
  const height = Math.min(rect.height, Math.max(1, Math.floor(screen.height - margins.top - margins.bottom)));
  const maxX = Math.max(margins.left, Math.floor(screen.width - margins.right - width));
  const maxY = Math.max(margins.top, Math.floor(screen.height - margins.bottom - height));
  return {
    x: clampNumber(Math.round(rect.x), margins.left, maxX),
    y: clampNumber(Math.round(rect.y), margins.top, maxY),
    width,
    height
  };
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function fallbackPsiAnimationType(details: BattleRoundStepResult["details"]): string {
  if ((details.damage ?? 0) > 0 || details.missed) {
    return "offense";
  }
  if ((details.healed ?? 0) > 0 || (details.ppRestored ?? 0) > 0) {
    return "recovery";
  }
  return "assist";
}

function psiAnimationColorAt(definition: PsiBattleAnimationDefinition, progress: number): number {
  const colors = definition.colors;
  if (colors.length === 0) {
    return 0xffffff;
  }
  const index = Math.floor(Math.max(0, progress) * definition.pulses * colors.length) % colors.length;
  return colors[index] ?? colors[0] ?? 0xffffff;
}

function easeOutCubic(value: number): number {
  const t = clampNumber(value, 0, 1);
  return 1 - (1 - t) ** 3;
}

function rgbFromHex(color: number): { r: number; g: number; b: number } {
  const value = Math.max(0, Math.floor(color)) & 0xffffff;
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff
  };
}

function modulo(value: number, size: number): number {
  const normalizedSize = Math.max(1, size);
  return ((value % normalizedSize) + normalizedSize) % normalizedSize;
}

// EarthBound's on-screen battle command names. The internal ids stay short and
// stable (content/tests key off "AUTO"/"RUN"); only the display text is EB-faithful.
const EB_COMMAND_LABELS: Partial<Record<BattleCommand, string>> = {
  PSI: "PSI",
  AUTO: "Auto Fight",
  RUN: "Run Away"
};

function formatCommandLabel(command: BattleCommand): string {
  const ebLabel = EB_COMMAND_LABELS[command];
  if (ebLabel !== undefined) {
    return ebLabel;
  }
  return command.charAt(0) + command.slice(1).toLowerCase();
}

function targetModeForCommand(command: BattleCommand): BattleTargetMode | null {
  return enemyTargetModeForCommand(command);
}

function battlePsiInfoLine(psi: PsiData): string {
  return `${targetScopeForPsiMenu(psi)}  PP ${psiPpCost(psi)}`;
}

function messageForBlockedAction(reason: string | undefined): string {
  switch (reason) {
    case "insufficientPp":
      return "Not enough PP.";
    case "missingItem":
      return "No item.";
    case "notConsumable":
    case "unknownEffect":
      return "Cannot use that item.";
    case "unsupportedPsi":
      return "Cannot use that PSI here.";
    case "noTarget":
      return "No target.";
    default:
      return "Cannot act.";
  }
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    return await response.json() as T;
  } catch {
    return undefined;
  }
}

async function fetchParsed<T>(url: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }): Promise<T | undefined> {
  const raw = await fetchJson<unknown>(url);
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeEncounterAdvantage(value: EncounterAdvantage | undefined): EncounterAdvantage {
  switch (value) {
    case "partyFirstStrike":
    case "enemyFirstStrike":
    case "instantWin":
      return value;
    case "normal":
    default:
      return "normal";
  }
}

function swirlTintForAdvantage(value: EncounterAdvantage): "party" | "enemy" | undefined {
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
  rng: Rng;
  items?: ItemData[];
  psi?: PsiData[];
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

function removeBattleSearchParam(): void {
  try {
    const location = globalThis.location;
    const history = globalThis.history;
    if (!location || !history) {
      return;
    }
    const url = new URL(location.href);
    if (!url.searchParams.has("battle")) {
      return;
    }
    url.searchParams.delete("battle");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Query cleanup is best-effort; scene restart still exits the battle.
  }
}
