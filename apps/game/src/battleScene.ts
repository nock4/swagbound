import Phaser from "phaser";
import {
  ItemCollectionSchema,
  PsiCollectionSchema,
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
  beginCombatantTurn,
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
  resolveDefaultBashTurn,
  resolveDefendTurn,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolveMirrorTurn,
  resolvePsiTurn,
  resolvePrayTurn,
  resolveSpyTurn,
  resolveTurn,
  shouldResetAutoFightRound,
  tickBattleMeters,
  turnOrder,
  type BattleActor,
  type BattleCommand,
  type BattleOutcome,
  type BattleState,
  type BattleVictorySummary,
  type Rng
} from "./battleLogic";
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
  BitmapFontText,
  measureBitmapText,
  prepareBitmapFont,
  queueBitmapFontAssets,
  type BitmapTextOptions,
  type PreparedBitmapFont
} from "./bitmapFont";
import {
  drawWindowFrame,
  prepareWindowFrames,
  queueWindowFrameAssets,
  type PreparedWindowFrames
} from "./windowFrame";
import { WINDOW_FLAVOR_CHANGE_EVENT, activeWindowFlavorId } from "./windowSettings";
import {
  EB_BITMAP_TEXT_SCALE,
  EB_TEXT_LINE_SPACING,
  EB_UI_SCALE,
  type CanvasRect,
  battleWindowRect,
  ebTextLineHeight
} from "./windowLayout";
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
  MENU_CURSOR_GUTTER_PX,
  enemyDefeatVisualState,
  menuCursorVisible,
  menuRowTexts,
  selectionArrowTriangle
} from "./battleVisuals";
import { swirlMask, type SwirlMask } from "./transitions";
import {
  resolveSpriteOverrideImageFrame,
  spriteOverrideAssetUrl,
  spriteOverrideEnemyImageKey,
  spriteOverrideForEnemyId
} from "./spriteOverrides";

const MONO = "Menlo, Consolas, monospace";
const TAU = Math.PI * 2;
export const COMMANDS = commandsForCharId(0);
const STATUS_TOP = 288;
const BATTLE_LINE_SPACING = EB_TEXT_LINE_SPACING;
const BATTLE_BOTTOM_MARGIN = 8;
const BATTLE_LEFT_MARGIN = 16;
const BATTLE_GAP = 8;
const BATTLE_LINE_HEIGHT = ebTextLineHeight({ lineSpacing: BATTLE_LINE_SPACING });
const BATTLE_COMMAND_TEXT_PADDING_X = 16;
const BATTLE_COMMAND_TEXT_PADDING_Y = 14;
const BATTLE_STATUS_TEXT_PADDING_X = 20;
const BATTLE_STATUS_TEXT_PADDING_Y = 14;
const PADDED_HP_DIGITS = 3;
const ACTION_ADVANCE_DELAY_MS = 350;
const MENU_MAX_ROWS = 4;
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
type GameText = Phaser.GameObjects.Text | BitmapFontText;
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
type BattleStatusLayout = {
  commandRect?: CanvasRect;
  statusRect: CanvasRect;
};

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private group_!: BattleGroup;
  private battle_!: BattleState;
  private items_?: ItemCollection;
  private psi_?: PsiCollection;
  private font_?: FontCollection;
  private window_?: WindowCollection;
  private spriteOverrides_?: SpriteOverrides;
  private bitmapFont?: PreparedBitmapFont;
  private windowFrames?: PreparedWindowFrames;
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
  private roundCursor_ = 0;
  private currentActor_: BattleActor | null = null;
  private autoFightRound_ = false;
  private lastEnemyAction_: LastEnemyActionDebug | null = null;
  private actionDelayMs_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private statusWindows: Phaser.GameObjects.Container[] = [];
  private statusLayoutSignature = "";
  private targetCursor?: Phaser.GameObjects.Graphics;
  private menuCursorGraphics?: Phaser.GameObjects.Graphics;
  private commandText?: GameText;
  private partyText?: GameText;
  private transitionGraphics?: Phaser.GameObjects.Graphics;
  private enemySprites: Phaser.GameObjects.Image[] = [];
  private enemySpriteBasePoints: Array<SpritePoint | undefined> = [];
  private enemySpriteRedrawScheduled = false;
  private enemySpriteRedrawAttempts = 0;
  private enemySpriteRetryQueuedKeys = new Set<string>();
  private enemyLastHitAt: Array<number | null> = [];
  private enemyDefeatedAt: Array<number | null> = [];
  private backgroundAnimation?: AnimatedBattleBackgroundHandle;
  private backgroundDebug: BattleBackgroundDebug = staticBattleBackgroundDebug();
  private windowFlavorListener?: () => void;
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
    this.roundCursor_ = 0;
    this.currentActor_ = null;
    this.autoFightRound_ = false;
    this.lastEnemyAction_ = null;
    this.actionDelayMs_ = 0;
    this.statusLayoutSignature = "";
    this.backgroundAnimation = undefined;
    this.backgroundDebug = staticBattleBackgroundDebug();
    this.exitOutcome_ = null;
  }

  preload(): void {
    for (const backgroundId of unique([this.group_.background1, this.group_.background2])) {
      this.load.image(backgroundKey(backgroundId), generatedAssetUrl(this.battleData_.assetLayout.backgroundDir, backgroundId));
    }
    for (const enemy of enemiesForGroup(this.battleData_, this.group_)) {
      const texture = this.enemySpriteTexturePlan(enemy);
      if (!this.textures.exists(texture.key)) {
        this.load.image(texture.key, texture.url);
      }
    }
    queueBitmapFontAssets(this, this.font_);
    queueWindowFrameAssets(this, this.window_);
  }

  create(): void {
    this.bitmapFont = prepareBitmapFont(this, this.font_);
    this.refreshWindowFrames();
    this.windowFlavorListener = () => this.handleWindowFlavorChanged();
    globalThis.addEventListener?.(WINDOW_FLAVOR_CHANGE_EVENT, this.windowFlavorListener);
    this.cameras.main.setBackgroundColor("#050505");
    this.drawBackground();
    this.events.once("shutdown", () => {
      this.backgroundAnimation?.destroy();
      if (this.windowFlavorListener) {
        globalThis.removeEventListener?.(WINDOW_FLAVOR_CHANGE_EVENT, this.windowFlavorListener);
        this.windowFlavorListener = undefined;
      }
    });
    this.drawEnemySprites();
    this.createStatusWindow();
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveMenu(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveMenu(1));
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => this.moveTarget(-1));
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => this.moveTarget(1));
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirmMenu());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.cancelMenu());
    void this.loadOptionalGeneratedMenuData();
    this.transitionGraphics = this.add.graphics().setDepth(90);
    this.renderTransition();
    this.renderStatus();
    this.publish();
  }

  private handleWindowFlavorChanged(): void {
    this.refreshWindowFrames();
    this.createStatusWindow();
    this.renderStatus();
    this.publish();
  }

  private refreshWindowFrames(): void {
    this.windowFrames = prepareWindowFrames(this, this.window_, activeWindowFlavorId(this.window_));
  }

  update(_: number, delta: number): void {
    this.updateBackground();

    if (this.phase_ === "enter-transition") {
      this.transitionMs_ = Math.max(0, this.transitionMs_ - delta);
      if (this.transitionMs_ <= 0) {
        this.transitionGraphics?.clear();
        this.transitionPhase_ = "none";
        this.advanceToNextActor();
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

  private moveMenu(direction: -1 | 1): void {
    if (this.phase_ !== "menu") {
      return;
    }
    this.menuMessage_ = "";
    if (this.submenu_ === "command") {
      const commands = this.commandsForCurrentActor();
      this.commandIndex_ = (this.commandIndex_ + direction + commands.length) % commands.length;
      this.targetMode_ = targetModeForCommand(this.currentCommand()) ?? this.targetMode_;
    } else if (this.submenu_ === "psi") {
      const count = this.learnedPsiForCurrentActor().length;
      if (count > 0) {
        this.submenuIndex_ = clampIndex(this.submenuIndex_ + direction, count);
      }
    } else if (this.submenu_ === "goods") {
      const count = this.goodsForCurrentActor().length;
      if (count > 0) {
        this.submenuIndex_ = clampIndex(this.submenuIndex_ + direction, count);
      }
    } else if (this.submenu_ === "target") {
      this.moveTarget(direction);
      return;
    }
    this.renderStatus();
    this.publish();
  }

  private moveTarget(direction: -1 | 1): void {
    if (this.phase_ !== "menu") {
      return;
    }
    const side = this.activeTargetSide();
    if (!side) {
      return;
    }
    const living = side === "enemy" ? livingEnemyIndices(this.battle_) : livingPartyIndices(this.battle_);
    if (living.length === 0) {
      return;
    }
    const currentIndex = side === "enemy" ? this.targetIndex_ : this.partyTargetIndex_;
    const current = living.includes(currentIndex) ? living.indexOf(currentIndex) : 0;
    const next = living[(current + direction + living.length) % living.length];
    if (side === "enemy") {
      this.targetIndex_ = next;
    } else {
      this.partyTargetIndex_ = next;
    }
    this.menuMessage_ = "";
    this.renderStatus();
    this.publish();
  }

  private confirmMenu(): void {
    if (this.phase_ === "victory-summary" || this.phase_ === "lose" || this.phase_ === "flee" || this.phase_ === "win") {
      this.beginExitTransition();
      return;
    }
    if (this.phase_ !== "menu" || this.currentActor_?.side !== "party") {
      return;
    }
    const command = this.currentCommand();
    this.menuMessage_ = "";
    if (this.submenu_ === "psi") {
      this.confirmPsi();
      return;
    }
    if (this.submenu_ === "goods") {
      this.confirmGoods();
      return;
    }
    if (this.submenu_ === "target") {
      this.confirmTarget();
      return;
    }
    if (command === "RUN") {
      this.phase_ = "flee";
      this.renderStatus();
      this.publish();
      return;
    }
    if (command === "AUTO") {
      this.autoFightRound_ = true;
      if (!this.autoBashCurrentActor()) {
        this.autoFightRound_ = false;
        this.menuMessage_ = "No enemy.";
        this.renderStatus();
        this.publish();
      }
      return;
    }
    if (command === "DEFEND") {
      const result = resolveDefendTurn(this.battle_, this.currentActor_);
      if (result.skipped) {
        this.menuMessage_ = messageForBlockedAction(result.blockedReason);
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state);
      return;
    }
    if (command === "SPY") {
      this.normalizeTargetIndex();
      const result = resolveSpyTurn(this.battle_, this.currentActor_, { targetIndex: this.targetIndex_ });
      if (result.skipped) {
        this.menuMessage_ = result.message || messageForBlockedAction(result.blockedReason);
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state, result.message);
      return;
    }
    if (command === "PRAY") {
      const result = resolvePrayTurn(this.battle_, this.currentActor_, this.rng_);
      if (result.skipped) {
        this.menuMessage_ = result.message || messageForBlockedAction(result.blockedReason);
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state, result.message);
      return;
    }
    if (command === "MIRROR") {
      this.normalizeTargetIndex();
      const result = resolveMirrorTurn(this.battle_, this.currentActor_, this.rng_, { targetIndex: this.targetIndex_ });
      if (result.skipped) {
        this.menuMessage_ = result.message || messageForBlockedAction(result.blockedReason);
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state, result.message);
      return;
    }
    if (command === "PSI") {
      this.openSubmenu("psi");
      return;
    }
    if (command === "GOODS") {
      this.openSubmenu("goods");
      return;
    }

    this.normalizeTargetIndex();
    const result = resolveTurn(this.battle_, this.currentActor_, this.rng_, { targetIndex: this.targetIndex_ });
    this.applyTurnResult(result.state);
  }

  private cancelMenu(): void {
    if (this.phase_ !== "menu") {
      return;
    }
    this.menuMessage_ = "";
    if (this.submenu_ === "target") {
      this.submenu_ = this.pendingPsiId_ !== null ? "psi" : "goods";
      this.pendingPsiId_ = null;
      this.pendingItem_ = null;
    } else if (this.submenu_ === "psi" || this.submenu_ === "goods") {
      this.submenu_ = "command";
      this.submenuIndex_ = 0;
      this.pendingPsiId_ = null;
      this.pendingItem_ = null;
      this.targetMode_ = "bash";
    }
    this.renderStatus();
    this.publish();
  }

  private openSubmenu(submenu: "psi" | "goods"): void {
    this.submenu_ = submenu;
    this.submenuIndex_ = 0;
    this.pendingPsiId_ = null;
    this.pendingItem_ = null;
    this.targetMode_ = "bash";
    if (submenu === "psi" && this.learnedPsiForCurrentActor().length === 0) {
      this.menuMessage_ = "No learned PSI.";
    } else if (submenu === "goods" && this.goodsForCurrentActor().length === 0) {
      this.menuMessage_ = "No goods.";
    }
    this.renderStatus();
    this.publish();
  }

  private confirmPsi(): void {
    const psi = this.learnedPsiForCurrentActor()[this.submenuIndex_];
    const actor = this.currentActor_ ? combatantAt(this.battle_, this.currentActor_) : undefined;
    if (!psi || !actor) {
      this.menuMessage_ = "No learned PSI.";
      this.renderStatus();
      this.publish();
      return;
    }

    const kind = psiBattleKind(psi);
    if (kind !== "offense" && kind !== "recovery") {
      this.menuMessage_ = "Cannot use that PSI here.";
      this.renderStatus();
      this.publish();
      return;
    }

    const ppCost = psiPpCost(psi);
    if (actor.pp < ppCost) {
      this.menuMessage_ = "Not enough PP.";
      this.renderStatus();
      this.publish();
      return;
    }

    this.pendingPsiId_ = psi.id;
    this.pendingItem_ = null;
    this.targetMode_ = kind === "offense" ? "psi-offense" : "psi-recovery";
    this.submenu_ = "target";
    if (kind === "offense") {
      this.normalizeTargetIndex();
    } else {
      this.normalizePartyTargetIndex();
    }
    this.renderStatus();
    this.publish();
  }

  private confirmGoods(): void {
    const entry = this.goodsForCurrentActor()[this.submenuIndex_];
    if (!entry) {
      this.menuMessage_ = "No goods.";
      this.renderStatus();
      this.publish();
      return;
    }

    const item = this.itemById(entry.itemId);
    if (!item) {
      this.menuMessage_ = "Cannot use that item.";
      this.renderStatus();
      this.publish();
      return;
    }

    this.pendingItem_ = {
      itemId: entry.itemId,
      inventorySlot: entry.inventorySlot
    };
    this.pendingPsiId_ = null;
    this.targetMode_ = "goods";
    this.submenu_ = "target";
    this.normalizePartyTargetIndex();
    this.renderStatus();
    this.publish();
  }

  private confirmTarget(): void {
    if (!this.currentActor_) {
      return;
    }

    if (this.pendingPsiId_ !== null) {
      const psi = this.psiById(this.pendingPsiId_);
      if (!psi) {
        this.menuMessage_ = "Cannot use that PSI here.";
        this.submenu_ = "psi";
        this.renderStatus();
        this.publish();
        return;
      }
      const targetIndex = this.targetMode_ === "psi-recovery" ? this.partyTargetIndex_ : this.targetIndex_;
      const result = resolvePsiTurn(this.battle_, this.currentActor_, psi, this.rng_, { targetIndex });
      if (result.skipped) {
        this.menuMessage_ = messageForBlockedAction(result.blockedReason);
        this.submenu_ = "psi";
        this.pendingPsiId_ = null;
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state);
      return;
    }

    if (this.pendingItem_) {
      const item = this.itemById(this.pendingItem_.itemId);
      if (!item) {
        this.menuMessage_ = "Cannot use that item.";
        this.submenu_ = "goods";
        this.pendingItem_ = null;
        this.renderStatus();
        this.publish();
        return;
      }
      const result = resolveItemTurn(this.battle_, this.currentActor_, item, {
        inventorySlot: this.pendingItem_.inventorySlot,
        targetIndex: this.partyTargetIndex_
      });
      if (result.skipped) {
        this.menuMessage_ = messageForBlockedAction(result.blockedReason);
        this.submenu_ = "goods";
        this.pendingItem_ = null;
        this.renderStatus();
        this.publish();
        return;
      }
      this.applyTurnResult(result.state);
    }
  }

  private applyTurnResult(state: BattleState, message = ""): void {
    const previousBattle = this.battle_;
    this.battle_ = state;
    this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
    this.submenu_ = "command";
    this.submenuIndex_ = 0;
    this.pendingPsiId_ = null;
    this.pendingItem_ = null;
    this.targetMode_ = "bash";
    this.menuMessage_ = message;
    this.phase_ = "enemy-rolling";
    this.actionDelayMs_ = ACTION_ADVANCE_DELAY_MS;
    this.renderStatus();
    this.publish();
  }

  private advanceBattleFlow(): void {
    const currentOutcome = outcome(this.battle_);
    if (currentOutcome !== "ongoing") {
      this.currentActor_ = null;
      if (currentOutcome === "win") {
        this.beginVictorySummary();
      } else {
        this.phase_ = "lose";
        this.transitionPhase_ = "none";
      }
      return;
    }

    if (this.phase_ === "menu") {
      if (!this.currentActor_ || this.currentActor_.side !== "party" || !this.actorIsAlive(this.currentActor_)) {
        this.advanceToNextActor();
        return;
      }
      if (this.activeTargetSide() === "party") {
        this.normalizePartyTargetIndex();
      } else {
        this.normalizeTargetIndex();
      }
      return;
    }

    if ((this.phase_ === "enemy-rolling" || this.phase_ === "player-rolling") && this.actionDelayMs_ <= 0) {
      this.advanceToNextActor();
    }
  }

  private advanceToNextActor(): void {
    for (let guard = 0; guard < 100; guard += 1) {
      const currentOutcome = outcome(this.battle_);
      if (currentOutcome !== "ongoing") {
        this.currentActor_ = null;
        if (currentOutcome === "win") {
          this.beginVictorySummary();
        } else {
          this.phase_ = "lose";
          this.transitionPhase_ = "none";
        }
        return;
      }

      if (shouldResetAutoFightRound(this.roundCursor_, this.roundOrder_.length)) {
        this.roundOrder_ = turnOrder(this.battle_);
        this.roundCursor_ = 0;
        this.autoFightRound_ = false;
      }

      const actor = this.roundOrder_[this.roundCursor_];
      this.roundCursor_ += 1;
      if (!actor || !this.actorIsAlive(actor)) {
        continue;
      }

      this.battle_ = beginCombatantTurn(this.battle_, actor);
      this.currentActor_ = actor;
      if (actor.side === "party") {
        this.phase_ = "menu";
        this.resetMenuForActor();
        this.normalizeTargetIndex();
        this.normalizePartyTargetIndex();
        if (this.autoFightRound_) {
          if (this.autoBashCurrentActor()) {
            return;
          }
          if (outcome(this.battle_) !== "ongoing") {
            continue;
          }
          this.autoFightRound_ = false;
        }
        return;
      }

      const result = resolveEnemyActionTurn(this.battle_, actor, this.rng_);
      this.battle_ = result.state;
      this.lastEnemyAction_ = result.action
        ? {
          enemyIndex: actor.index,
          actionIndex: result.action.actionIndex,
          actionId: result.action.actionId,
          actionType: result.action.actionType ?? null,
          target: result.action.target ?? null
        }
        : null;
      this.phase_ = "player-rolling";
      this.actionDelayMs_ = ACTION_ADVANCE_DELAY_MS;
      return;
    }
  }

  private autoBashCurrentActor(): boolean {
    if (!this.currentActor_ || this.currentActor_.side !== "party") {
      return false;
    }
    this.normalizeTargetIndex();
    const result = resolveDefaultBashTurn(this.battle_, this.currentActor_, this.rng_);
    if (result.defender?.side === "enemy") {
      this.targetIndex_ = result.defender.index;
    }
    if (result.skipped) {
      return false;
    }
    this.applyTurnResult(result.state);
    return true;
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
    const backgroundId = this.textures.exists(backgroundKey(this.group_.background1))
      ? this.group_.background1
      : this.group_.background2;
    const key = backgroundKey(backgroundId);
    const backgroundHeight = this.scale.height;
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
    for (const window of this.statusWindows) {
      window.destroy(true);
    }
    this.statusWindows = [];
    this.statusGraphics?.destroy();
    this.targetCursor?.destroy();
    this.menuCursorGraphics?.destroy();
    this.commandText?.destroy();
    this.partyText?.destroy();
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.targetCursor = this.add.graphics().setDepth(30);
    this.menuCursorGraphics = this.add.graphics().setDepth(31);
    this.statusLayoutSignature = "";
  }

  private layoutStatusWindows(commandLines: string[], partyLines: string[]): BattleStatusLayout {
    const commandRect = commandLines.length > 0 ? this.battleCommandRect(commandLines) : undefined;
    const statusRect = this.battleStatusRect(partyLines, commandRect);
    const layout = { commandRect, statusRect };
    const signature = JSON.stringify({ commandRect, statusRect });
    if (signature === this.statusLayoutSignature && this.partyText && (commandLines.length === 0 || this.commandText)) {
      return layout;
    }
    this.statusLayoutSignature = signature;

    for (const window of this.statusWindows) {
      window.destroy(true);
    }
    this.statusWindows = [];
    this.commandText?.destroy();
    this.commandText = undefined;
    this.partyText?.destroy();
    this.partyText = undefined;

    const graphics = this.statusGraphics;
    if (!graphics) {
      return layout;
    }
    graphics.clear();
    if (commandRect) {
      this.drawWindow(commandRect.x, commandRect.y, commandRect.width, commandRect.height);
      this.commandText = this.createGameText(
        commandRect.x + BATTLE_COMMAND_TEXT_PADDING_X + MENU_CURSOR_GUTTER_PX,
        commandRect.y + BATTLE_COMMAND_TEXT_PADDING_Y,
        "",
        {
          fontFamily: MONO,
          fontSize: "15px",
          color: "#f8fafc",
          lineSpacing: BATTLE_LINE_SPACING
        },
        {
          scale: EB_BITMAP_TEXT_SCALE,
          tint: 0xf8fafc,
          lineSpacing: BATTLE_LINE_SPACING,
          lineHeight: BATTLE_LINE_HEIGHT,
          maxWidth: Math.max(1, commandRect.width - BATTLE_COMMAND_TEXT_PADDING_X * 2 - MENU_CURSOR_GUTTER_PX)
        }
      ).setDepth(21);
    }
    this.drawWindow(statusRect.x, statusRect.y, statusRect.width, statusRect.height);
    this.partyText = this.createGameText(
      statusRect.x + BATTLE_STATUS_TEXT_PADDING_X + MENU_CURSOR_GUTTER_PX,
      statusRect.y + BATTLE_STATUS_TEXT_PADDING_Y,
      "",
      {
        fontFamily: MONO,
        fontSize: "14px",
        color: "#f8fafc",
        lineSpacing: BATTLE_LINE_SPACING
      },
      {
        scale: EB_BITMAP_TEXT_SCALE,
        tint: 0xf8fafc,
        lineSpacing: BATTLE_LINE_SPACING,
        lineHeight: BATTLE_LINE_HEIGHT,
        maxWidth: Math.max(1, statusRect.width - BATTLE_STATUS_TEXT_PADDING_X * 2 - MENU_CURSOR_GUTTER_PX)
      }
    ).setDepth(21);
    return layout;
  }

  private battleCommandRect(lines: string[]): CanvasRect {
    return battleWindowRect({
      screen: { width: this.scale.width, height: this.scale.height },
      x: BATTLE_LEFT_MARGIN,
      labels: lines,
      measureText: (label) => this.measureTextWidth(label),
      lineHeight: BATTLE_LINE_HEIGHT,
      paddingX: BATTLE_COMMAND_TEXT_PADDING_X + MENU_CURSOR_GUTTER_PX,
      paddingY: BATTLE_COMMAND_TEXT_PADDING_Y,
      bottomMargin: BATTLE_BOTTOM_MARGIN,
      leftMargin: BATTLE_LEFT_MARGIN,
      rightMargin: BATTLE_LEFT_MARGIN,
      minWidth: 80,
      maxWidth: 180,
      maxHeight: this.scale.height - STATUS_TOP - BATTLE_BOTTOM_MARGIN * 2
    });
  }

  private battleStatusRect(lines: string[], commandRect: CanvasRect | undefined): CanvasRect {
    const x = commandRect ? commandRect.x + commandRect.width + BATTLE_GAP : BATTLE_LEFT_MARGIN;
    return battleWindowRect({
      screen: { width: this.scale.width, height: this.scale.height },
      x,
      labels: lines,
      measureText: (label) => this.measureTextWidth(label),
      lineHeight: BATTLE_LINE_HEIGHT,
      paddingX: BATTLE_STATUS_TEXT_PADDING_X + MENU_CURSOR_GUTTER_PX,
      paddingY: BATTLE_STATUS_TEXT_PADDING_Y,
      bottomMargin: BATTLE_BOTTOM_MARGIN,
      leftMargin: BATTLE_LEFT_MARGIN,
      rightMargin: BATTLE_LEFT_MARGIN,
      minWidth: 160,
      maxWidth: Math.max(80, this.scale.width - x - BATTLE_LEFT_MARGIN),
      maxHeight: this.scale.height - STATUS_TOP - BATTLE_BOTTOM_MARGIN * 2
    });
  }

  private drawWindow(x: number, y: number, width: number, height: number): void {
    const graphics = this.statusGraphics;
    if (!graphics) {
      return;
    }
    if (this.windowFrames) {
      this.statusWindows.push(
        drawWindowFrame(this, this.windowFrames, x, y, width, height, { scale: EB_UI_SCALE }).setDepth(20)
      );
      return;
    }
    graphics.fillStyle(0x0a0f1e, 1);
    graphics.fillRoundedRect(x, y, width, height, 5);
    graphics.lineStyle(3, 0xf8fafc, 1);
    graphics.strokeRoundedRect(x + 2, y + 2, width - 4, height - 4, 4);
    graphics.lineStyle(1, 0x6b7280, 1);
    graphics.strokeRoundedRect(x + 7, y + 7, width - 14, height - 14, 3);
  }

  private createGameText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    bitmapOptions: BitmapTextOptions = {}
  ): GameText {
    if (this.bitmapFont) {
      return new BitmapFontText(this, this.bitmapFont, x, y, text, bitmapOptions);
    }
    return this.add.text(x, y, text, style);
  }

  private measureTextWidth(text: string): number {
    if (this.bitmapFont) {
      return measureBitmapText(this.bitmapFont.collection, this.bitmapFont.sheet, text, {
        scale: EB_BITMAP_TEXT_SCALE
      }).width;
    }
    return text.length * 8;
  }

  private updateBackground(): void {
    if (!this.backgroundAnimation) {
      return;
    }
    this.backgroundDebug = this.backgroundAnimation.update(this.time.now);
  }

  private renderStatus(): void {
    const menuVisible = this.phase_ === "menu" && this.currentActor_?.side === "party";
    let commandLines: string[] = [];
    let partyLines: string[] = [];
    if (this.phase_ === "victory-summary") {
      commandLines = ["OK"];
      partyLines = this.victorySummaryLines();
    } else if (this.phase_ === "lose") {
      commandLines = ["OK"];
      partyLines = ["The party fell."];
    } else if (this.phase_ === "flee") {
      commandLines = ["OK"];
      partyLines = ["Got away."];
    } else {
      commandLines = menuVisible ? this.menuTextLines() : this.menuMessage_ ? [this.menuMessage_] : [];
      partyLines = this.partyStatusLines();
    }
    const layout = this.layoutStatusWindows(commandLines, partyLines);
    this.commandText?.setText(commandLines.join("\n"));
    this.partyText?.setText(partyLines.join("\n"));
    this.renderEnemySpriteEffects(this.time.now);
    this.renderMenuCursors(menuVisible, commandLines, layout);
    this.renderTargetCursor(menuVisible);
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

  private renderMenuCursors(menuVisible: boolean, commandLines: string[], layout: BattleStatusLayout): void {
    const graphics = this.menuCursorGraphics;
    if (!graphics) {
      return;
    }
    graphics.clear();
    if (!menuCursorVisible(this.time.now)) {
      return;
    }

    const commandRow = this.selectedCommandRow(commandLines);
    if (layout.commandRect && commandRow !== null) {
      this.drawMenuCursorArrow(
        graphics,
        layout.commandRect.x + BATTLE_COMMAND_TEXT_PADDING_X + 1,
        layout.commandRect.y + BATTLE_COMMAND_TEXT_PADDING_Y + commandRow * BATTLE_LINE_HEIGHT,
        BATTLE_LINE_HEIGHT
      );
    }

    if (!menuVisible) {
      return;
    }
    for (const row of this.selectedPartyRows()) {
      this.drawMenuCursorArrow(
        graphics,
        layout.statusRect.x + BATTLE_STATUS_TEXT_PADDING_X + 1,
        layout.statusRect.y + BATTLE_STATUS_TEXT_PADDING_Y + row * BATTLE_LINE_HEIGHT,
        BATTLE_LINE_HEIGHT
      );
    }
  }

  private selectedCommandRow(commandLines: string[]): number | null {
    if (commandLines.length === 0) {
      return null;
    }
    if (this.phase_ === "victory-summary" || this.phase_ === "lose" || this.phase_ === "flee") {
      return 0;
    }
    if (this.phase_ !== "menu" || this.currentActor_?.side !== "party") {
      return null;
    }
    if (this.submenu_ === "command") {
      return this.commandIndex_;
    }
    if (this.submenu_ === "psi") {
      return visibleMenuRowIndex(this.learnedPsiForCurrentActor().length, this.submenuIndex_, this.menuMessage_);
    }
    if (this.submenu_ === "goods") {
      return visibleMenuRowIndex(this.goodsForCurrentActor().length, this.submenuIndex_, this.menuMessage_);
    }
    return null;
  }

  private selectedPartyRows(): number[] {
    if (!this.currentActor_ || this.currentActor_.side !== "party") {
      return [];
    }
    const rows = new Set<number>();
    if (this.battle_.party[this.currentActor_.index]) {
      rows.add(this.currentActor_.index);
    }
    if (this.activeTargetSide() === "party" && this.battle_.party[this.partyTargetIndex_]) {
      rows.add(this.partyTargetIndex_);
    }
    return [...rows].sort((a, b) => a - b);
  }

  private drawMenuCursorArrow(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    rowTop: number,
    rowHeight: number
  ): void {
    const triangle = selectionArrowTriangle(x, rowTop, rowHeight);
    graphics.fillStyle(0xf8fafc, 1);
    graphics.fillTriangle(triangle.x1, triangle.y1, triangle.x2, triangle.y2, triangle.x3, triangle.y3);
    graphics.lineStyle(1, 0x111827, 1);
    graphics.strokeTriangle(triangle.x1, triangle.y1, triangle.x2, triangle.y2, triangle.x3, triangle.y3);
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

  private partyStatusLines(): string[] {
    return this.battle_.party.map((member) => {
      const marker = isCombatantAlive(member) ? " " : "X";
      return `${marker} ${fitName(member.name, 9)} HP ${odometer(member.hp.displayed)} PP ${odometer(member.pp)}`;
    });
  }

  private victorySummaryLines(): string[] {
    if (!this.victorySummary_) {
      return [];
    }
    return buildVictorySummaryViewModel(this.victorySummary_)
      .lines
      .map((line) => fitLine(line, 28));
  }

  private menuTextLines(): string[] {
    if (this.submenu_ === "command") {
      return menuRowTexts(this.commandsForCurrentActor().map((command, index) => ({
        label: command,
        selected: index === this.commandIndex_
      })));
    }
    if (this.submenu_ === "psi") {
      const entries = this.learnedPsiForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No learned PSI."];
      }
      return fitMenuRows(menuRowTexts(entries.map((psi, index) => {
        const cost = psiPpCost(psi);
        return {
          label: `${fitName(psi.name || `[psi ${psi.id}]`, 8)} ${cost}`,
          selected: index === this.submenuIndex_
        };
      })), this.submenuIndex_, this.menuMessage_);
    }
    if (this.submenu_ === "goods") {
      const entries = this.goodsForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No goods."];
      }
      return fitMenuRows(menuRowTexts(entries.map((entry, index) => {
        const item = this.itemById(entry.itemId);
        return {
          label: fitName(item?.name || `[item ${entry.itemId}]`, 10),
          selected: index === this.submenuIndex_
        };
      })), this.submenuIndex_, this.menuMessage_);
    }

    const prompt = this.activeTargetSide() === "party" ? "To whom?" : "To enemy?";
    return [prompt, this.menuMessage_].filter(Boolean);
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
    cursor.fillTriangle(x, y + 14, x - 9, y, x + 9, y);
    cursor.lineStyle(1, 0x111827, 1);
    cursor.strokeTriangle(x, y + 14, x - 9, y, x + 9, y);
  }
}

function selectBattleGroup(data: BattleData, groupId: number | undefined): BattleGroup {
  return data.groups.find((group) => group.id === groupId) ?? data.groups[0];
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

function fitName(name: string, width: number): string {
  return name.length > width ? name.slice(0, width) : name.padEnd(width, " ");
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

function fitMenuRows(rows: string[], selectedIndex: number, message: string): string[] {
  const availableRows = message ? MENU_MAX_ROWS - 1 : MENU_MAX_ROWS;
  const start = visibleMenuRowStart(rows.length, selectedIndex, message);
  const visible = rows.slice(start, start + availableRows);
  if (!message) {
    return visible;
  }
  return [...visible, message];
}

function visibleMenuRowIndex(rowCount: number, selectedIndex: number, message: string): number | null {
  if (rowCount <= 0) {
    return null;
  }
  const start = visibleMenuRowStart(rowCount, selectedIndex, message);
  const availableRows = message ? MENU_MAX_ROWS - 1 : MENU_MAX_ROWS;
  const visibleIndex = selectedIndex - start;
  return visibleIndex >= 0 && visibleIndex < availableRows ? visibleIndex : null;
}

function visibleMenuRowStart(rowCount: number, selectedIndex: number, message: string): number {
  const availableRows = message ? MENU_MAX_ROWS - 1 : MENU_MAX_ROWS;
  return Math.min(
    Math.max(0, selectedIndex - availableRows + 1),
    Math.max(0, rowCount - availableRows)
  );
}

function targetModeForCommand(command: BattleCommand): BattleTargetMode | null {
  switch (command) {
    case "BASH":
      return "bash";
    case "SPY":
      return "spy";
    case "MIRROR":
      return "mirror";
    default:
      return null;
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

function odometer(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(PADDED_HP_DIGITS, "0");
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
