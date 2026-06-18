import Phaser from "phaser";
import {
  ItemCollectionSchema,
  PsiCollectionSchema,
  type BackgroundOverrides,
  type BattleBackground,
  type BattleData,
  type BattleEnemy,
  type BattleGroup,
  type CharacterCollection,
  type FontCollection,
  type ItemCollection,
  type ItemData,
  type PsiCollection,
  type PsiData,
  type SpriteOverrides,
  type WindowCollection
} from "@eb/schemas";
import {
  applyVictoryRewards,
  buildVictorySummaryViewModel,
  combatantAt,
  commandsForCharId,
  createBattleState,
  firstLivingIndex,
  isCombatantAlive,
  learnedPsiForCombatant,
  outcome,
  psiBattleKind,
  psiPpCost,
  tickBattleMeters,
  type BattleActor,
  type BattleCommand,
  type BattleOutcome,
  type BattleState,
  type BattleVictorySummary,
  type Rng
} from "./battleLogic";
import {
  jitteredTurnOrder,
  nextInputState,
  partyInputOrder,
  resolveRoundStep,
  type BattleRoundInputState,
  type QueuedCommand
} from "./battleRound";
import { composeBattleStepLines } from "./battleMessages";
import type { BattleReturnContext, BattleReturnOutcome } from "./battleReturn";
import {
  DEFAULT_DAMAGE_FLASH_MS,
  DEFAULT_ENEMY_WOBBLE_AMP_PX,
  DEFAULT_ENEMY_WOBBLE_PERIOD_MS,
  flashState,
  wobbleOffset
} from "./battleEffects";
import { publishBattleDebug, type BattlePhase, type BattleTransitionPhase } from "./state";
import {
  CLEAN_UI_GRID_COLUMNS,
  CLEAN_UI_HP,
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_PP,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
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
  moveBattleCommandGridIndex,
  statusBarFillFraction,
  type BattleCommandGridDirection,
  type CleanGridCell
} from "./cleanUi";
import { activeWindowFlavorId } from "./windowSettings";
import {
  type CanvasRect,
  battleStatusCardRects,
  contentFitWindowRect,
  type BattleMenuListRect
} from "./windowLayout";
import { enemyTargetModeForCommand } from "./battleMenuFlow";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_LEFT_KEY_NAMES,
  MENU_RIGHT_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import type { PartyMember } from "./characterModel";
import type { PartyBattleMemberSnapshot, PartyStateSnapshot } from "./partyState";
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
  menuCursorVisible
} from "./battleVisuals";
import { swirlMask, type SwirlMask } from "./transitions";
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
  createRollingMeter,
  setTarget,
  tick as tickRollingMeter,
  type RollingMeterState
} from "./rollingMeter";

const TAU = Math.PI * 2;
export const COMMANDS = commandsForCharId(0);
const STATUS_TOP = 288;
const BATTLE_LINE_SPACING = 2;
const BATTLE_FONT_SIZE = 14;
const BATTLE_DESCRIPTION_FONT_SIZE = 13;
const BATTLE_STATUS_NAME_FONT_SIZE = 13;
const BATTLE_STATUS_LABEL_FONT_SIZE = 11;
const BATTLE_STATUS_VALUE_FONT_SIZE = 12;
const BATTLE_LEFT_MARGIN = 16;
const BATTLE_LINE_HEIGHT = cleanLineHeight(BATTLE_FONT_SIZE, BATTLE_LINE_SPACING);
const BATTLE_COMMAND_TEXT_PADDING_X = 12;
const BATTLE_COMMAND_TEXT_PADDING_Y = 10;
const BATTLE_COMMAND_GRID_GAP_X = 8;
const BATTLE_COMMAND_GRID_GAP_Y = 8;
const BATTLE_COMMAND_CELL_HEIGHT = 26;
const BATTLE_MENU_CARET_GUTTER_PX = 12;
const BATTLE_MENU_TOP_MARGIN = 8;
const BATTLE_MENU_RIGHT_MARGIN = 16;
const BATTLE_MENU_BOTTOM_CLEARANCE = 92;
const BATTLE_SUBMENU_GAP = 8;
const BATTLE_DESCRIPTION_GAP = 8;
const BATTLE_COMMAND_MIN_WIDTH = 252;
const BATTLE_SUBMENU_MIN_WIDTH = 260;
const BATTLE_DESCRIPTION_MIN_WIDTH = 128;
const BATTLE_MENU_MAX_WIDTH = 360;
const BATTLE_DESCRIPTION_MAX_WIDTH = 260;
const BATTLE_DESCRIPTION_TEXT_PADDING_X = 12;
const BATTLE_DESCRIPTION_TEXT_PADDING_Y = 9;
const BATTLE_EXECUTION_MESSAGE_TOP = 14;
const BATTLE_EXECUTION_MESSAGE_MIN_WIDTH = 260;
const BATTLE_EXECUTION_MESSAGE_MAX_WIDTH = 480;
const BATTLE_EXECUTION_MESSAGE_PADDING_X = 14;
const BATTLE_EXECUTION_MESSAGE_PADDING_Y = 10;
const BATTLE_EXECUTION_MESSAGE_MAX_LINES = 2;
const BATTLE_EXECUTION_MESSAGE_FONT_SIZE = 14;
const BATTLE_STATUS_CARD_SIDE_MARGIN = 10;
const BATTLE_STATUS_CARD_BOTTOM_MARGIN = 8;
const BATTLE_STATUS_CARD_GAP = 8;
const BATTLE_STATUS_CARD_HEIGHT = 78;
const BATTLE_STATUS_CARD_MIN_WIDTH = 112;
const BATTLE_STATUS_CARD_MAX_WIDTH = 160;
const BATTLE_STATUS_CARD_ACTIVE_LIFT = 4;
const BATTLE_STATUS_CONTENT_PADDING_X = 10;
const BATTLE_STATUS_CONTENT_PADDING_Y = 8;
const BATTLE_STATUS_NAME_Y = 0;
const BATTLE_STATUS_HP_ROW_Y = 23;
const BATTLE_STATUS_PP_ROW_Y = 47;
const BATTLE_STATUS_LABEL_WIDTH = 20;
const BATTLE_STATUS_BAR_HEIGHT = 5;
const BATTLE_STATUS_BAR_X = 28;
const BATTLE_STATUS_BAR_VALUE_GAP = 4;
const BATTLE_PP_RATE_PER_SEC = 36;
const ACTION_ADVANCE_DELAY_MS = 1200;
const ENTER_TRANSITION_MS = 650;
const EXIT_TRANSITION_MS = 450;
const ENEMY_SPRITE_MAX_HEIGHT = 160;
const ENEMY_SPRITE_REDRAW_RETRY_MS = 50;
const MAX_ENEMY_SPRITE_REDRAW_ATTEMPTS = 5;

type BattleSubmenu = "command" | "psi" | "goods" | "target";
type BattleTargetMode = "bash" | "spy" | "mirror" | "psi-offense" | "psi-recovery" | "goods";
type PendingItemUse = {
  itemId: number;
  inventorySlot: number;
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
type EnemySpriteTexturePlan = {
  key: string;
  url: string;
  override: ReturnType<typeof spriteOverrideForEnemyId>;
};
type BattleCommandGridLayout = CanvasRect & {
  cells: CleanGridCell[];
};
type BattleStatusLayout = {
  command?: BattleCommandGridLayout;
  submenu?: BattleMenuListRect;
  description?: CanvasRect;
  executionMessage?: CanvasRect;
  statusCards: BattleStatusCardLayout[];
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
type BattleUiView = {
  commandLines: string[];
  submenuLines: string[];
  descriptionLines: string[];
  executionMessageLines: string[];
  selectedSubmenuIndex: number;
  statusCards: BattleStatusCardView[];
};
type BattleMenuTextRole = "command" | "submenu" | "description" | "execution";

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private group_!: BattleGroup;
  private battle_!: BattleState;
  private items_?: ItemCollection;
  private psi_?: PsiCollection;
  private font_?: FontCollection;
  private window_?: WindowCollection;
  private spriteOverrides_?: SpriteOverrides;
  private backgroundOverrides_?: BackgroundOverrides;
  private rng_: Rng = () => 0.5;
  private phase_: BattlePhase = "enter-transition";
  private transitionPhase_: BattleTransitionPhase = "enter";
  private transitionMs_ = ENTER_TRANSITION_MS;
  private victorySummary_: BattleVictorySummary | null = null;
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
  private queuedCommands_: QueuedCommand[] = [];
  private executionOrder_: BattleActor[] = [];
  private executionStepIndex_ = 0;
  private executionMessageLines_: string[] = [];
  private pendingFlee_ = false;
  private lastEnemyAction_: LastEnemyActionDebug | null = null;
  private actionDelayMs_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private statusFieldGraphics?: Phaser.GameObjects.Graphics;
  private statusAccentGraphics?: Phaser.GameObjects.Graphics;
  private statusLayoutSignature = "";
  private targetCursor?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private menuTexts: Partial<Record<Exclude<BattleMenuTextRole, "command">, Phaser.GameObjects.Text>> = {};
  private commandGridTexts: Phaser.GameObjects.Text[] = [];
  private statusCardTexts: BattleStatusCardTextSet[] = [];
  private ppMeters = new Map<number, RollingMeterState>();
  private transitionGraphics?: Phaser.GameObjects.Graphics;
  private enemySprites: Phaser.GameObjects.Image[] = [];
  private enemyShadowGraphics?: Phaser.GameObjects.Graphics;
  private enemySpriteBasePoints: Array<SpritePoint | undefined> = [];
  private enemySpriteRedrawScheduled = false;
  private enemySpriteRedrawAttempts = 0;
  private enemySpriteRetryQueuedKeys = new Set<string>();
  private enemyLastHitAt: Array<number | null> = [];
  private enemyDefeatedAt: Array<number | null> = [];
  private backgroundAnimation?: AnimatedBattleBackgroundHandle;
  private backgroundDebug: BattleBackgroundDebug = staticBattleBackgroundDebug();
  private returnTo_?: BattleReturnContext;
  private exitOutcome_: BattleReturnOutcome | null = null;

  constructor() {
    super("battle");
  }

  init(data: {
    battleData: BattleData;
    groupId?: number;
    characters?: CharacterCollection;
    items?: ItemCollection;
    psi?: PsiCollection;
    font?: FontCollection;
    window?: WindowCollection;
    spriteOverrides?: SpriteOverrides;
    backgroundOverrides?: BackgroundOverrides;
    partyMembers?: PartyMember[];
    wallet?: number;
    returnTo?: BattleReturnContext;
  }): void {
    this.battleData_ = data.battleData;
    this.group_ = selectBattleGroup(data.battleData, data.groupId);
    this.items_ = data.items;
    this.psi_ = data.psi;
    this.font_ = data.font;
    this.window_ = data.window;
    this.spriteOverrides_ = data.spriteOverrides ?? data.returnTo?.gameData.spriteOverrides;
    this.backgroundOverrides_ = data.backgroundOverrides ?? data.returnTo?.gameData.backgroundOverrides;
    const enemies = enemiesForGroup(data.battleData, this.group_);
    if (enemies.length === 0) {
      throw new Error(`Battle group ${this.group_.id} has no matching runtime enemy.`);
    }
    this.returnTo_ = data.returnTo;
    this.battle_ = createBattleState(enemies, {
      characters: data.characters,
      partyMembers: data.partyMembers,
      wallet: data.wallet
    });
    this.enemyLastHitAt = enemies.map(() => null);
    this.enemyDefeatedAt = enemies.map(() => null);
    this.enemySpriteBasePoints = [];
    this.enemySpriteRedrawScheduled = false;
    this.enemySpriteRedrawAttempts = 0;
    this.enemySpriteRetryQueuedKeys.clear();
    this.rng_ = createSeededRng((this.group_.id + 1) * 65537 + enemies.reduce((sum, enemy) => sum + enemy.id, 0));
    this.phase_ = "enter-transition";
    this.transitionPhase_ = "enter";
    this.transitionMs_ = ENTER_TRANSITION_MS;
    this.victorySummary_ = null;
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
    this.queuedCommands_ = [];
    this.executionOrder_ = [];
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.lastEnemyAction_ = null;
    this.actionDelayMs_ = 0;
    this.statusLayoutSignature = "";
    this.ppMeters.clear();
    this.backgroundAnimation = undefined;
    this.backgroundDebug = staticBattleBackgroundDebug();
    this.exitOutcome_ = null;
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
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#050505");
    this.drawBackground();
    this.events.once("shutdown", () => {
      this.backgroundAnimation?.destroy();
    });
    this.drawEnemySprites();
    this.createStatusWindow();
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveMenu("up"));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveMenu("down"));
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => this.moveMenu("left"));
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => this.moveMenu("right"));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirmMenu());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.cancelMenu());
    void this.loadOptionalGeneratedMenuData();
    this.transitionGraphics = this.add.graphics().setDepth(90);
    this.renderTransition();
    this.renderStatus();
    this.publish();
  }

  update(_: number, delta: number): void {
    this.updateBackground();
    this.tickStatusPpMeters(delta);

    if (this.phase_ === "enter-transition") {
      this.transitionMs_ = Math.max(0, this.transitionMs_ - delta);
      if (this.transitionMs_ <= 0) {
        this.transitionGraphics?.clear();
        this.transitionPhase_ = "none";
        this.beginCommandInputRound();
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

    if (!this.isBattleFlowPaused()) {
      const previousBattle = this.battle_;
      this.battle_ = tickBattleMeters(this.battle_, delta);
      this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
      this.actionDelayMs_ = Math.max(0, this.actionDelayMs_ - delta);
      this.advanceBattleFlow();
    }
    this.renderStatus();
    this.publish();
  }

  private moveMenu(direction: BattleCommandGridDirection): void {
    if (!this.isCommandInputActive()) {
      return;
    }
    this.menuMessage_ = "";
    const delta = this.inputMoveDelta(direction);
    if (delta === null) {
      return;
    }
    this.applyInputTransition(nextInputState(this.inputState_, { kind: "move", delta }, this.inputContext()));
    this.renderStatus();
    this.publish();
  }

  private confirmMenu(): void {
    if (this.phase_ === "victory-summary" || this.phase_ === "lose" || this.phase_ === "flee" || this.phase_ === "win") {
      this.beginExitTransition();
      return;
    }
    if (this.phase_ === "execution") {
      this.actionDelayMs_ = 0;
      this.advanceExecutionStep();
      this.renderStatus();
      this.publish();
      return;
    }
    if (!this.isCommandInputActive()) {
      return;
    }
    const transition = nextInputState(this.inputState_, { kind: "confirm" }, this.inputContext());
    this.menuMessage_ = transition.input === this.inputState_ ? this.blockedInputMessage() : "";
    this.applyInputTransition(transition);
    this.renderStatus();
    this.publish();
  }

  private cancelMenu(): void {
    if (!this.isCommandInputActive()) {
      return;
    }
    this.menuMessage_ = "";
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
      if (direction === "left" || direction === "right") {
        return null;
      }
      return menuDirectionDelta(direction);
    }
    return direction === "left" || direction === "up" ? -1 : 1;
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

  private beginCommandInputRound(): void {
    if (this.handleBattleOutcome()) {
      return;
    }
    const order = partyInputOrder(this.battle_);
    if (order.length === 0) {
      this.phase_ = "lose";
      this.transitionPhase_ = "none";
      this.currentActor_ = null;
      return;
    }
    this.phase_ = "command-input";
    this.transitionPhase_ = "none";
    this.inputState_ = initialBattleRoundInputState();
    this.queuedCommands_ = [];
    this.executionOrder_ = [];
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.roundOrder_ = order;
    this.actionDelayMs_ = 0;
    this.syncMenuFromInputState();
  }

  private beginExecutionPhase(): void {
    this.queuedCommands_ = [...this.inputState_.queue];
    this.executionOrder_ = jitteredTurnOrder(this.battle_, this.queuedCommands_, this.rng_);
    this.roundOrder_ = this.executionOrder_;
    this.executionStepIndex_ = 0;
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.phase_ = "execution";
    this.transitionPhase_ = "none";
    this.currentActor_ = null;
    this.resetMenuForActor();
    this.actionDelayMs_ = 0;
    if (this.executionOrder_.length === 0) {
      this.finishExecutionRound();
      return;
    }
    this.advanceExecutionStep();
  }

  private advanceBattleFlow(): void {
    if (this.handleBattleOutcome()) {
      return;
    }

    if (this.phase_ === "command-input") {
      this.syncMenuFromInputState();
      if (this.activeTargetSide() === "party") {
        this.normalizePartyTargetIndex();
      } else {
        this.normalizeTargetIndex();
      }
      return;
    }

    if (this.phase_ === "execution" && this.actionDelayMs_ <= 0) {
      this.advanceExecutionStep();
    }
  }

  private advanceExecutionStep(): void {
    if (this.phase_ !== "execution") {
      return;
    }
    if (this.pendingFlee_) {
      this.pendingFlee_ = false;
      this.executionMessageLines_ = [];
      this.actionDelayMs_ = 0;
      this.phase_ = "flee";
      this.transitionPhase_ = "none";
      this.currentActor_ = null;
      return;
    }
    if (this.handleBattleOutcome()) {
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
        items: this.items_?.items
      });
      this.battle_ = result.state;
      this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
      this.updateStepDebugTargets(result, queued);
      this.menuMessage_ = result.message;
      this.executionMessageLines_ = composeBattleStepLines(result.details);
      if (this.executionMessageLines_.length === 0) {
        this.actionDelayMs_ = 0;
        continue;
      }
      this.actionDelayMs_ = ACTION_ADVANCE_DELAY_MS;

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
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
    this.beginCommandInputRound();
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
    if ("targets" in resolution) {
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
    const order = partyInputOrder(this.battle_);
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
      if (kind !== "offense" && kind !== "recovery") {
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

  private inputContext(): { state: BattleState; psi?: PsiData[]; items?: ItemData[] } {
    return {
      state: this.battle_,
      psi: this.psi_?.psi,
      items: this.items_?.items
    };
  }

  private isCommandInputActive(): boolean {
    return this.phase_ === "command-input" && this.currentActor_?.side === "party";
  }

  private handleBattleOutcome(currentOutcome: BattleOutcome = outcome(this.battle_)): boolean {
    if (currentOutcome === "ongoing") {
      return false;
    }
    this.currentActor_ = null;
    if (currentOutcome === "win") {
      this.beginVictorySummary();
    } else {
      this.phase_ = "lose";
      this.transitionPhase_ = "none";
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

  private beginVictorySummary(): void {
    if (this.victorySummary_) {
      this.phase_ = "victory-summary";
      this.transitionPhase_ = "summary";
      return;
    }
    const result = applyVictoryRewards(this.battle_, {
      rng: this.rng_,
      items: this.items_?.items,
      psi: this.psi_?.psi
    });
    this.battle_ = result.state;
    this.victorySummary_ = result.summary;
    this.phase_ = "victory-summary";
    this.transitionPhase_ = "summary";
    this.submenu_ = "command";
    this.commandIndex_ = 0;
    this.currentActor_ = null;
    this.menuMessage_ = "";
    this.executionMessageLines_ = [];
    this.pendingFlee_ = false;
  }

  private beginExitTransition(): void {
    if (this.phase_ === "exit-transition") {
      return;
    }
    this.exitOutcome_ = this.currentReturnOutcome();
    this.phase_ = "exit-transition";
    this.transitionPhase_ = "exit";
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
    const mask = swirlMask(progress);
    if (mask.clear) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = STATUS_TOP / 2;
    const maxRadius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));

    graphics.fillStyle(0x050505, mask.baseAlpha);
    graphics.fillRect(0, 0, width, height);
    if (mask.fullyCovered) {
      return;
    }

    this.drawSwirlBands(graphics, mask, cx, cy, maxRadius);
    this.drawSwirlHighlights(graphics, mask, cx, cy, maxRadius);
  }

  private drawSwirlBands(
    graphics: Phaser.GameObjects.Graphics,
    mask: SwirlMask,
    cx: number,
    cy: number,
    maxRadius: number
  ): void {
    const armSpan = TAU / mask.armCount;
    const segmentOverscan = 1.1 / mask.bandCount;
    for (let arm = 0; arm < mask.armCount; arm += 1) {
      for (let segment = 0; segment < mask.bandCount; segment += 1) {
        const innerRatio = Math.max(mask.revealRadiusRatio, segment / mask.bandCount);
        const outerRatio = Math.min(1.32, (segment + 1) / mask.bandCount + segmentOverscan);
        if (outerRatio <= mask.revealRadiusRatio) {
          continue;
        }
        const centerRatio = (innerRatio + outerRatio) / 2;
        const angle = mask.rotationRadians + arm * armSpan + centerRatio * mask.spiralPitch * TAU;
        const span = armSpan * (0.18 + mask.coverage * 0.18);
        const inner = innerRatio * maxRadius;
        const outer = outerRatio * maxRadius + 22 * mask.coverage;
        const points = [
          polarPoint(cx, cy, inner, angle - span * 0.58),
          polarPoint(cx, cy, outer, angle - span * 0.38),
          polarPoint(cx, cy, outer, angle + span * 0.38),
          polarPoint(cx, cy, inner, angle + span * 0.58)
        ];

        graphics.fillStyle(segment % 2 === 0 ? 0x050505 : 0x111827, mask.bandAlpha);
        graphics.beginPath();
        graphics.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
          graphics.lineTo(points[index].x, points[index].y);
        }
        graphics.closePath();
        graphics.fillPath();
      }
    }
  }

  private drawSwirlHighlights(
    graphics: Phaser.GameObjects.Graphics,
    mask: SwirlMask,
    cx: number,
    cy: number,
    maxRadius: number
  ): void {
    const alpha = 0.34 * mask.coverage;
    if (alpha <= 0) {
      return;
    }
    const armSpan = TAU / mask.armCount;
    for (let arm = 0; arm < mask.armCount; arm += 1) {
      graphics.lineStyle(3, arm % 2 === 0 ? 0xf8fafc : 0x7dd3fc, alpha);
      graphics.beginPath();
      let started = false;
      for (let segment = 0; segment <= mask.bandCount; segment += 1) {
        const ratio = segment / mask.bandCount;
        if (ratio < mask.revealRadiusRatio) {
          continue;
        }
        const radius = ratio * maxRadius;
        const angle = mask.rotationRadians + arm * armSpan + ratio * mask.spiralPitch * TAU;
        const point = polarPoint(cx, cy, radius, angle);
        if (!started) {
          graphics.moveTo(point.x, point.y);
          started = true;
        } else {
          graphics.lineTo(point.x, point.y);
        }
      }
      if (started) {
        graphics.strokePath();
      }
    }
  }

  private exitBattle(): void {
    this.transitionGraphics?.clear();
    this.transitionPhase_ = "none";
    if (this.returnTo_) {
      const outcome = this.exitOutcome_ ?? this.currentReturnOutcome();
      const restore = {
        ...this.returnTo_.restore,
        outcome,
        party: buildPostBattlePartySnapshot(this.returnTo_.restore.party, this.battle_),
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
    if (this.phase_ === "flee") {
      return "flee";
    }
    return outcome(this.battle_) === "win" ? "win" : "lose";
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
    this.destroyBattleUiText();
    this.enemyShadowGraphics = this.add.graphics().setDepth(9);
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.statusFieldGraphics = this.add.graphics().setDepth(20.5);
    this.statusAccentGraphics = this.add.graphics().setDepth(26);
    this.targetCursor = this.add.graphics().setDepth(30);
    this.menuCursorGraphics = this.add.graphics().setDepth(31);
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
    const command = this.commandGridLayout(view.commandLines);
    const submenu = command && view.submenuLines.length > 0
      ? this.menuListLayout({
        labels: view.submenuLines,
        selectedIndex: view.selectedSubmenuIndex,
        x: command.x + command.width + BATTLE_SUBMENU_GAP,
        y: command.y,
        minWidth: BATTLE_SUBMENU_MIN_WIDTH,
        maxWidth: BATTLE_MENU_MAX_WIDTH
      })
      : undefined;
    const descriptionAnchor = submenu ?? command;
    const description = descriptionAnchor && view.descriptionLines.length > 0
      ? this.descriptionLayout(view.descriptionLines, descriptionAnchor)
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
      command,
      submenu,
      description,
      executionMessage,
      statusCards
    };
    const signature = JSON.stringify(layout);
    const textReady =
      (view.commandLines.length === 0 || this.commandGridTexts.length === view.commandLines.length) &&
      (view.submenuLines.length === 0 || Boolean(this.menuTexts.submenu)) &&
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

    if (layout.command) {
      drawCleanPanel(graphics, layout.command);
      this.commandGridTexts = layout.command.cells.map((cell) => createCleanText(this, cell.x + BATTLE_MENU_CARET_GUTTER_PX, cell.y + 4, "", {
        fontSize: BATTLE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        fixedWidth: Math.max(1, cell.width - BATTLE_MENU_CARET_GUTTER_PX),
        fixedHeight: cell.height,
        weight: 400
      }).setDepth(21));
    }

    if (layout.description) {
      const textRect = this.descriptionWindowTextRect(layout.description);
      drawCleanPanel(graphics, layout.description);
      this.menuTexts.description = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_DESCRIPTION_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        lineSpacing: BATTLE_LINE_SPACING,
        fixedWidth: textRect.width,
        wordWrapWidth: textRect.width
      }).setDepth(23);
    }

    if (layout.submenu) {
      const textRect = this.standardMenuListTextRect(layout.submenu);
      drawCleanPanel(graphics, layout.submenu);
      this.menuTexts.submenu = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        lineSpacing: BATTLE_LINE_SPACING,
        fixedWidth: textRect.width
      }).setDepth(25);
    }

    if (layout.executionMessage) {
      const textRect = this.executionMessageTextRect(layout.executionMessage);
      drawCleanPanel(graphics, layout.executionMessage);
      this.menuTexts.execution = createCleanText(this, textRect.x, textRect.y, "", {
        fontSize: BATTLE_EXECUTION_MESSAGE_FONT_SIZE,
        color: CLEAN_UI_PRIMARY,
        lineSpacing: BATTLE_LINE_SPACING,
        fixedWidth: textRect.width,
        fixedHeight: textRect.height
      }).setDepth(27);
    }

    layout.statusCards.forEach((card) => {
      drawCleanPanel(graphics, card);
      this.statusCardTexts.push(this.createStatusCardTexts(card));
    });

    return layout;
  }

  private commandGridLayout(labels: string[]): BattleCommandGridLayout | undefined {
    if (labels.length === 0) {
      return undefined;
    }
    const rows = Math.max(1, Math.ceil(labels.length / CLEAN_UI_GRID_COLUMNS));
    const minWidth = labels.length <= 1 ? 74 : BATTLE_COMMAND_MIN_WIDTH;
    const labelWidth = Math.max(0, ...labels.map((label) => this.measureTextWidth(label, BATTLE_FONT_SIZE, 500)));
    const requestedWidth = Math.max(
      minWidth,
      Math.ceil(labelWidth * CLEAN_UI_GRID_COLUMNS + BATTLE_COMMAND_TEXT_PADDING_X * 2 + BATTLE_MENU_CARET_GUTTER_PX * CLEAN_UI_GRID_COLUMNS + BATTLE_COMMAND_GRID_GAP_X * (CLEAN_UI_GRID_COLUMNS - 1))
    );
    const width = Math.min(
      Math.max(minWidth, requestedWidth),
      Math.floor(this.scale.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN)
    );
    const height = BATTLE_COMMAND_TEXT_PADDING_Y * 2 + rows * BATTLE_COMMAND_CELL_HEIGHT + (rows - 1) * BATTLE_COMMAND_GRID_GAP_Y;
    const rect = clampRectToScreen(
      {
        x: BATTLE_LEFT_MARGIN,
        y: BATTLE_MENU_TOP_MARGIN,
        width,
        height
      },
      { width: this.scale.width, height: this.scale.height },
      {
        left: BATTLE_LEFT_MARGIN,
        right: BATTLE_MENU_RIGHT_MARGIN,
        top: BATTLE_MENU_TOP_MARGIN,
        bottom: BATTLE_MENU_BOTTOM_CLEARANCE
      }
    );
    const content = cleanPanelInnerRect(rect, {
      x: BATTLE_COMMAND_TEXT_PADDING_X,
      y: BATTLE_COMMAND_TEXT_PADDING_Y
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
  }): BattleMenuListRect {
    const screen = { width: this.scale.width, height: this.scale.height };
    const maxHeight = Math.max(
      BATTLE_LINE_HEIGHT + BATTLE_COMMAND_TEXT_PADDING_Y * 2,
      Math.floor(screen.height - BATTLE_MENU_BOTTOM_CLEARANCE - options.y)
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
      bottom: BATTLE_MENU_BOTTOM_CLEARANCE
    });
    return {
      ...clamped,
      visibleStart,
      visibleCount,
      hasMoreBefore: visibleStart > 0,
      hasMoreAfter: visibleStart + visibleCount < options.labels.length
    };
  }

  private descriptionLayout(lines: string[], anchor: CanvasRect): CanvasRect {
    const y = anchor.y + anchor.height + BATTLE_DESCRIPTION_GAP;
    const maxWidth = Math.min(
      Math.max(BATTLE_DESCRIPTION_MIN_WIDTH, anchor.width),
      BATTLE_DESCRIPTION_MAX_WIDTH,
      Math.floor(this.scale.width - BATTLE_LEFT_MARGIN - BATTLE_MENU_RIGHT_MARGIN)
    );
    const maxHeight = Math.max(
      BATTLE_LINE_HEIGHT + BATTLE_DESCRIPTION_TEXT_PADDING_Y * 2,
      Math.floor(this.scale.height - BATTLE_MENU_BOTTOM_CLEARANCE - y)
    );
    const rect = contentFitWindowRect({
      x: anchor.x,
      y,
      labels: lines,
      measureText: (label) => this.measureTextWidth(label, BATTLE_DESCRIPTION_FONT_SIZE),
      lineHeight: BATTLE_LINE_HEIGHT,
      lineCount: Math.max(1, lines.length),
      paddingX: BATTLE_DESCRIPTION_TEXT_PADDING_X,
      paddingY: BATTLE_DESCRIPTION_TEXT_PADDING_Y,
      minWidth: Math.max(BATTLE_DESCRIPTION_MIN_WIDTH, Math.min(anchor.width, maxWidth)),
      maxWidth,
      maxHeight
    });
    return clampRectToScreen(rect, { width: this.scale.width, height: this.scale.height }, {
      left: BATTLE_LEFT_MARGIN,
      right: BATTLE_MENU_RIGHT_MARGIN,
      top: BATTLE_MENU_TOP_MARGIN,
      bottom: BATTLE_MENU_BOTTOM_CLEARANCE
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

  private standardMenuListTextRect(rect: BattleMenuListRect): CanvasRect {
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

  private renderStatus(): void {
    const menuVisible = this.phase_ === "command-input" && this.currentActor_?.side === "party";
    const view = this.battleUiView(menuVisible);
    const layout = this.layoutStatusWindows(view);
    this.updateCommandGridTexts(view, layout);
    this.menuTexts.submenu?.setText(this.listWindowText(view.submenuLines, layout.submenu));
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
      commandLines: this.commandsForCurrentActor().map(formatCommandLabel),
      submenuLines: this.submenuTextLines(),
      descriptionLines: this.menuDescriptionLines(),
      executionMessageLines: [],
      selectedSubmenuIndex: this.submenuIndex_,
      statusCards: this.statusCardViews()
    };
  }

  private listWindowText(
    lines: string[],
    rect: BattleMenuListRect | undefined
  ): string {
    if (!rect) {
      return "";
    }
    const textWidth = this.standardMenuListTextRect(rect).width;
    return lines
      .slice(rect.visibleStart, rect.visibleStart + rect.visibleCount)
      .map((line) => this.fitMeasuredText(line, textWidth))
      .join("\n");
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
    return {
      name: this.createStatusText(content.x, content.y + BATTLE_STATUS_NAME_Y, "", content.width, BATTLE_STATUS_NAME_FONT_SIZE, 500).setDepth(22),
      hpLabel: this.createStatusText(content.x, hpMetrics.labelY, "HP", BATTLE_STATUS_LABEL_WIDTH, BATTLE_STATUS_LABEL_FONT_SIZE, 500).setDepth(22),
      ppLabel: this.createStatusText(content.x, ppMetrics.labelY, "PP", BATTLE_STATUS_LABEL_WIDTH, BATTLE_STATUS_LABEL_FONT_SIZE, 500).setDepth(22),
      hpValue: this.createStatusText(hpMetrics.valueX, hpMetrics.valueY, "", hpMetrics.valueWidth, BATTLE_STATUS_VALUE_FONT_SIZE, 400, "right").setDepth(22),
      ppValue: this.createStatusText(ppMetrics.valueX, ppMetrics.valueY, "", ppMetrics.valueWidth, BATTLE_STATUS_VALUE_FONT_SIZE, 400, "right").setDepth(22)
    };
  }

  private updateStatusCardTexts(
    card: BattleStatusCardView,
    rect: BattleStatusCardLayout,
    textSet: BattleStatusCardTextSet
  ): void {
    textSet.name.setText(this.fitMeasuredText(card.name, this.statusCardNameWidth(rect)));
    textSet.hpLabel.setText("HP");
    textSet.ppLabel.setText("PP");
    textSet.hpValue.setText(`${card.hp}/${card.maxHp}`);
    textSet.ppValue.setText(`${card.pp}/${card.maxPp}`);
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
      text.setColor(selected ? CLEAN_UI_PRIMARY : CLEAN_UI_PRIMARY);
      text.setFontStyle(selected ? "500" : "400");
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
      if (card.active) {
        drawCleanSelection(accentGraphics, {
          x: card.x + 4,
          y: card.y + 4,
          width: Math.max(1, card.width - 8),
          height: Math.max(1, card.height - 8)
        });
        accentGraphics.lineStyle(1, CLEAN_UI_PANEL_BORDER, 0.46);
        accentGraphics.strokeRoundedRect(card.x + 4.5, card.y + 4.5, Math.max(1, card.width - 9), Math.max(1, card.height - 9), 5);
      }
      if (card.target) {
        accentGraphics.lineStyle(2, 0x4d9bdc, 0.9);
        accentGraphics.strokeRoundedRect(card.x + 6, card.y + 6, Math.max(1, card.width - 12), Math.max(1, card.height - 12), 4);
      }

      const content = this.statusCardContentRect(card);
      this.drawStatusBar(fieldGraphics, this.statusBarMetrics(content, "hp"), viewCard.hp, viewCard.maxHp, CLEAN_UI_HP);
      this.drawStatusBar(fieldGraphics, this.statusBarMetrics(content, "pp"), viewCard.pp, viewCard.maxPp, CLEAN_UI_PP);
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
        target: memberIndex === targetMemberIndex
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
    const meter = existing ?? createRollingMeter(target, BATTLE_PP_RATE_PER_SEC);
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
      const entries = this.learnedPsiForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No learned PSI."];
      }
      return entries.map((psi) => {
        const cost = psiPpCost(psi);
        return `${psi.name || `[psi ${psi.id}]`} ${cost}`;
      });
    }
    if (this.submenu_ === "goods") {
      const entries = this.goodsForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No goods."];
      }
      return entries.map((entry) => {
        const item = this.itemById(entry.itemId);
        return item?.name || `[item ${entry.itemId}]`;
      });
    }
    return [];
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
      return [targetScopeForPsi(psi), `PP Cost: ${psiPpCost(psi)}`];
    }
    if (this.submenu_ === "goods") {
      const entry = this.goodsForCurrentActor()[this.submenuIndex_];
      const item = entry ? this.itemById(entry.itemId) : undefined;
      return item ? ["To one friend", "Use item"] : ["No goods available."];
    }
    if (this.submenu_ === "target") {
      if (this.pendingPsiId_ !== null) {
        const psi = this.psiById(this.pendingPsiId_);
        return psi ? [targetScopeForPsi(psi), `PP Cost: ${psiPpCost(psi)}`] : ["Choose target"];
      }
      if (this.pendingItem_) {
        const item = this.itemById(this.pendingItem_.itemId);
        return item ? ["To one friend", "Use item"] : ["Choose target"];
      }
      return [this.activeTargetSide() === "party" ? "Choose friend" : "Choose enemy"];
    }

    return [];
  }

  private publish(): void {
    const currentOutcome: BattleOutcome = outcome(this.battle_);
    const now = this.time.now;
    const party = this.battle_.party.map(debugCombatant);
    const enemies = this.battle_.enemies.map((enemy, index) => ({
      ...debugCombatant(enemy),
      ...this.enemyEffectFor(index, now)
    }));
    publishBattleDebug({
      mode: "battle",
      phase: this.phase_,
      transitionPhase: this.transitionPhase_,
      menuIndex: this.commandIndex_,
      commandIndex: this.commandIndex_,
      command: this.currentCommand(),
      submenu: this.submenu_,
      submenuIndex: this.submenuIndex_,
      selection: this.activeSelectionId(),
      targetIndex: this.targetIndex_,
      partyTargetIndex: this.partyTargetIndex_,
      turnOrder: this.roundOrder_.map(debugActor),
      currentActor: this.currentActor_ ? debugActor(this.currentActor_) : null,
      inputMemberIndex: this.phase_ === "command-input" ? this.inputState_.memberCursor : null,
      queuedCount: this.queuedCommands_.length,
      executionStepIndex: this.executionStepDebugIndex(),
      executionStepCount: this.executionOrder_.length,
      executionMessage: this.executionMessageLines_.join("\n"),
      lastEnemyAction: this.lastEnemyAction_,
      party,
      enemies,
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
      victorySummary: this.victorySummary_ ? debugVictorySummary(this.victorySummary_) : null
    });
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
      if (basePoint) {
        sprite.setPosition(basePoint.x + effect.wobble.dx, basePoint.y + effect.wobble.dy);
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
        drawCleanSelection(graphics, cell);
        if (showCaret) {
          drawCleanCaret(graphics, cell.x + 3, cell.y, cell.height);
        }
      }
    }

    if (!menuVisible) {
      return;
    }
    const submenuRow = this.selectedSubmenuRow(layout.submenu);
    if (layout.submenu && submenuRow !== null) {
      const textRect = this.standardMenuListTextRect(layout.submenu);
      const selectionRect = {
        x: layout.submenu.x + BATTLE_COMMAND_TEXT_PADDING_X,
        y: textRect.y + submenuRow * BATTLE_LINE_HEIGHT - 2,
        width: Math.max(1, layout.submenu.width - BATTLE_COMMAND_TEXT_PADDING_X * 2),
        height: BATTLE_LINE_HEIGHT
      };
      drawCleanSelection(graphics, selectionRect);
      if (showCaret) {
        drawCleanCaret(graphics, selectionRect.x + 3, selectionRect.y, selectionRect.height);
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
    if (this.phase_ !== "command-input" || this.currentActor_?.side !== "party") {
      return null;
    }
    if (this.submenu_ === "command") {
      return this.commandIndex_;
    }
    return null;
  }

  private selectedSubmenuRow(submenu: BattleMenuListRect | undefined): number | null {
    if (!submenu || this.phase_ !== "command-input" || this.currentActor_?.side !== "party") {
      return null;
    }
    if (this.submenu_ !== "psi" && this.submenu_ !== "goods") {
      return null;
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
    rect: BattleMenuListRect
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
      wobble: alive
        ? integerOffset(wobbleOffset(now, index, DEFAULT_ENEMY_WOBBLE_AMP_PX, DEFAULT_ENEMY_WOBBLE_PERIOD_MS))
        : { dx: 0, dy: 0 }
    };
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
    if (!this.victorySummary_) {
      return [];
    }
    return buildVictorySummaryViewModel(this.victorySummary_)
      .lines
      .map((line) => fitLine(line, 28));
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
    return learnedPsiForCombatant(this.psi_?.psi ?? [], actor);
  }

  private goodsForCurrentActor(): Array<{ itemId: number; inventorySlot: number }> {
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    if (!actor || actor.isEnemy) {
      return [];
    }
    return actor.inventory.map((itemId, inventorySlot) => ({ itemId, inventorySlot }));
  }

  private psiById(psiId: number): PsiData | undefined {
    return this.psi_?.psi.find((psi) => psi.id === psiId);
  }

  private itemById(itemId: number): ItemData | undefined {
    return this.items_?.items.find((item) => item.id === itemId);
  }

  private async loadOptionalGeneratedMenuData(): Promise<void> {
    if (this.items_ && this.psi_) {
      return;
    }
    const manifest = await fetchJson<{ files?: { items?: string; psi?: string } }>("/generated/manifest.json");
    const files = manifest?.files;
    const [items, psi] = await Promise.all([
      this.items_ || !files?.items ? Promise.resolve(undefined) : fetchParsed(`/generated/${files.items}`, ItemCollectionSchema),
      this.psi_ || !files?.psi ? Promise.resolve(undefined) : fetchParsed(`/generated/${files.psi}`, PsiCollectionSchema)
    ]);
    if (items) {
      this.items_ = items;
    }
    if (psi) {
      this.psi_ = psi;
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
    const y = target.y - target.displayHeight / 2 - 16;
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

  for (const combatant of partyCombatants) {
    inventoryByChar.set(combatant.charId, combatant.inventory.map((itemId) => stat(itemId)));
    battleMembersByChar.set(combatant.charId, battleMemberSnapshotFromCombatant(combatant));
  }

  const partyIds = unique([
    ...base.partyIds,
    ...partyCombatants.map((combatant) => stat(combatant.charId))
  ]).sort((a, b) => a - b);

  return {
    wallet: stat(battle.wallet),
    ...(base.bank !== undefined ? { bank: stat(base.bank) } : {}),
    partyIds,
    inventory: [...inventoryByChar.entries()]
      .sort(([a], [b]) => a - b)
      .map(([charId, itemIds]) => ({ charId, itemIds })),
    equipped: base.equipped.map((entry) => ({ charId: entry.charId, slots: { ...entry.slots } })),
    battleMembers: [...battleMembersByChar.values()]
      .sort((a, b) => a.charId - b.charId)
      .map(cloneBattleMemberSnapshot)
  };
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
    stats: {
      offense: stat(combatant.stats.offense),
      defense: stat(combatant.stats.defense),
      speed: stat(combatant.stats.speed),
      guts: stat(combatant.stats.guts),
      vitality: stat(combatant.stats.vitality),
      iq: stat(combatant.stats.iq),
      luck: stat(combatant.stats.luck)
    }
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
  return group.enemyIds
    .map((enemyId) => data.enemies.find((enemy) => enemy.id === enemyId))
    .filter((enemy): enemy is BattleEnemy => Boolean(enemy));
}

function selectBattleBackground(data: BattleData, id: number): BattleBackground | undefined {
  return data.backgrounds?.find((background) => background.id === id);
}

function generatedAssetUrl(dir: string, id: number): string {
  return `/generated/${dir}/${pad3(id)}.png`;
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
} {
  return {
    hpDisplayed: combatant.hp.displayed,
    hpTarget: combatant.hp.target,
    isRolling: combatant.hp.isRolling,
    alive: isCombatantAlive(combatant),
    pp: combatant.pp,
    maxPp: combatant.maxPp,
    inventoryCount: combatant.inventory.length
  };
}

function debugActor(actor: BattleActor): { side: "party" | "enemy"; index: number } {
  return { side: actor.side, index: actor.index };
}

function debugVictorySummary(summary: BattleVictorySummary): {
  expGained: number;
  moneyGained: number;
  drops: Array<{ enemyId: number; itemId: number; itemName: string; recipientCharId: number }>;
  levelUps: Array<{ charId: number; name: string; fromLevel: number; toLevel: number }>;
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
      toLevel: levelUp.toLevel
    }))
  };
}

function enemySpritePoint(stageWidth: number, count: number, index: number, widthBudget: number): { x: number; y: number } {
  return {
    x: stageWidth / 2 + (index - (count - 1) / 2) * widthBudget,
    y: 164
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

function menuDirectionDelta(direction: BattleCommandGridDirection): -1 | 1 {
  return direction === "up" || direction === "left" ? -1 : 1;
}

function visibleItemStart(cursorIndex: number, itemCount: number, maxItems: number): number {
  if (maxItems <= 0 || itemCount <= maxItems) {
    return 0;
  }
  return Math.min(Math.max(0, cursorIndex - maxItems + 1), itemCount - maxItems);
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

function formatCommandLabel(command: BattleCommand): string {
  switch (command) {
    case "PSI":
      return "PSI";
    default:
      return command.charAt(0) + command.slice(1).toLowerCase();
  }
}

function targetModeForCommand(command: BattleCommand): BattleTargetMode | null {
  return enemyTargetModeForCommand(command);
}

function targetScopeForPsi(psi: PsiData): string {
  switch (psiBattleKind(psi)) {
    case "offense":
      return "To enemies";
    case "recovery":
      return "To one friend";
    case "assist":
      return "Battle effect";
    default:
      return "No battle target";
  }
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

function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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
