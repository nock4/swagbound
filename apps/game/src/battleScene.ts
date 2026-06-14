import Phaser from "phaser";
import {
  ItemCollectionSchema,
  PsiCollectionSchema,
  type BattleData,
  type BattleEnemy,
  type BattleGroup,
  type CharacterCollection,
  type FontCollection,
  type ItemCollection,
  type ItemData,
  type PsiCollection,
  type PsiData,
  type WindowCollection
} from "@eb/schemas";
import {
  applyVictoryRewards,
  buildVictorySummaryViewModel,
  combatantAt,
  createBattleState,
  firstLivingIndex,
  isCombatantAlive,
  learnedPsiForCombatant,
  outcome,
  psiBattleKind,
  psiPpCost,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolvePsiTurn,
  resolveTurn,
  tickBattleMeters,
  turnOrder,
  type BattleActor,
  type BattleOutcome,
  type BattleState,
  type BattleVictorySummary,
  type Rng
} from "./battleLogic";
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

const MONO = "Menlo, Consolas, monospace";
const COMMANDS = ["BASH", "PSI", "GOODS", "RUN"] as const;
const STATUS_TOP = 288;
const BATTLE_TEXT_SCALE = 2;
const BATTLE_LINE_SPACING = 2;
const PADDED_HP_DIGITS = 3;
const ACTION_ADVANCE_DELAY_MS = 350;
const MENU_MAX_ROWS = 4;
const ENTER_TRANSITION_MS = 650;
const EXIT_TRANSITION_MS = 450;

type BattleCommand = typeof COMMANDS[number];
type BattleSubmenu = "command" | "psi" | "goods" | "target";
type BattleTargetMode = "bash" | "psi-offense" | "psi-recovery" | "goods";
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

export class BattleScene extends Phaser.Scene {
  private battleData_!: BattleData;
  private group_!: BattleGroup;
  private battle_!: BattleState;
  private items_?: ItemCollection;
  private psi_?: PsiCollection;
  private font_?: FontCollection;
  private window_?: WindowCollection;
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
  private lastEnemyAction_: LastEnemyActionDebug | null = null;
  private actionDelayMs_ = 0;
  private statusGraphics?: Phaser.GameObjects.Graphics;
  private statusWindows: Phaser.GameObjects.Container[] = [];
  private targetCursor?: Phaser.GameObjects.Graphics;
  private commandText?: GameText;
  private partyText?: GameText;
  private transitionGraphics?: Phaser.GameObjects.Graphics;
  private enemySprites: Phaser.GameObjects.Image[] = [];
  private enemySpriteBasePoints: Array<SpritePoint | undefined> = [];
  private enemyLastHitAt: Array<number | null> = [];

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
  }): void {
    this.battleData_ = data.battleData;
    this.group_ = selectBattleGroup(data.battleData, data.groupId);
    this.items_ = data.items;
    this.psi_ = data.psi;
    this.font_ = data.font;
    this.window_ = data.window;
    const enemies = enemiesForGroup(data.battleData, this.group_);
    if (enemies.length === 0) {
      throw new Error(`Battle group ${this.group_.id} has no matching runtime enemy.`);
    }
    this.battle_ = createBattleState(enemies, { characters: data.characters });
    this.enemyLastHitAt = enemies.map(() => null);
    this.enemySpriteBasePoints = [];
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
    this.lastEnemyAction_ = null;
    this.actionDelayMs_ = 0;
  }

  preload(): void {
    for (const backgroundId of unique([this.group_.background1, this.group_.background2])) {
      this.load.image(backgroundKey(backgroundId), generatedAssetUrl(this.battleData_.assetLayout.backgroundDir, backgroundId));
    }
    for (const enemy of enemiesForGroup(this.battleData_, this.group_)) {
      this.load.image(spriteKey(enemy.spriteId), generatedAssetUrl(this.battleData_.assetLayout.spriteDir, enemy.spriteId));
    }
    queueBitmapFontAssets(this, this.font_);
    queueWindowFrameAssets(this, this.window_);
  }

  create(): void {
    this.bitmapFont = prepareBitmapFont(this, this.font_);
    this.windowFrames = prepareWindowFrames(this, this.window_);
    this.cameras.main.setBackgroundColor("#050505");
    this.drawBackground();
    this.drawEnemySprites();
    this.createStatusWindow();
    this.input.keyboard?.on("keydown-UP", () => this.moveMenu(-1));
    this.input.keyboard?.on("keydown-DOWN", () => this.moveMenu(1));
    this.input.keyboard?.on("keydown-LEFT", () => this.moveTarget(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.moveTarget(1));
    this.input.keyboard?.on("keydown-SPACE", () => this.confirmMenu());
    this.input.keyboard?.on("keydown-ENTER", () => this.confirmMenu());
    this.input.keyboard?.on("keydown-ESC", () => this.cancelMenu());
    this.input.keyboard?.on("keydown-BACKSPACE", () => this.cancelMenu());
    void this.loadOptionalGeneratedMenuData();
    this.transitionGraphics = this.add.graphics().setDepth(90);
    this.renderTransition();
    this.renderStatus();
    this.publish();
  }

  update(_: number, delta: number): void {
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
      this.commandIndex_ = (this.commandIndex_ + direction + COMMANDS.length) % COMMANDS.length;
      this.targetMode_ = this.currentCommand() === "BASH" ? "bash" : this.targetMode_;
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

  private applyTurnResult(state: BattleState): void {
    const previousBattle = this.battle_;
    this.battle_ = state;
    this.recordEnemyDamageSignals(previousBattle, this.battle_, this.time.now);
    this.submenu_ = "command";
    this.submenuIndex_ = 0;
    this.pendingPsiId_ = null;
    this.pendingItem_ = null;
    this.targetMode_ = "bash";
    this.menuMessage_ = "";
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

      if (this.roundCursor_ >= this.roundOrder_.length) {
        this.roundOrder_ = turnOrder(this.battle_);
        this.roundCursor_ = 0;
      }

      const actor = this.roundOrder_[this.roundCursor_];
      this.roundCursor_ += 1;
      if (!actor || !this.actorIsAlive(actor)) {
        continue;
      }

      this.currentActor_ = actor;
      if (actor.side === "party") {
        this.phase_ = "menu";
        this.resetMenuForActor();
        this.normalizeTargetIndex();
        this.normalizePartyTargetIndex();
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

  private beginVictorySummary(): void {
    if (this.victorySummary_) {
      this.phase_ = "victory-summary";
      this.transitionPhase_ = "summary";
      return;
    }
    const result = applyVictoryRewards(this.battle_, {
      rng: this.rng_,
      items: this.items_?.items
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
      const fade = Math.max(0, 1 - progress);
      graphics.fillStyle(0xf8fafc, 0.18 * fade);
      graphics.fillRect(0, 0, this.scale.width, this.scale.height);
      const cx = this.scale.width / 2;
      const cy = STATUS_TOP / 2;
      for (let index = 0; index < 9; index += 1) {
        const radius = 24 + index * 30 + progress * 90;
        const alpha = Math.max(0, (0.6 - index * 0.045) * fade);
        graphics.lineStyle(4, index % 2 === 0 ? 0xf8fafc : 0x38bdf8, alpha);
        graphics.strokeCircle(cx, cy, radius);
      }
      graphics.lineStyle(6, 0xfb7185, 0.22 * fade);
      graphics.beginPath();
      graphics.moveTo(cx - 220 + progress * 140, cy - 140);
      graphics.lineTo(cx + 220 - progress * 80, cy + 140);
      graphics.strokePath();
      return;
    }

    if (this.transitionPhase_ === "exit") {
      const progress = 1 - this.transitionMs_ / EXIT_TRANSITION_MS;
      graphics.fillStyle(0x000000, Math.min(1, Math.max(0, progress)));
      graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    }
  }

  private exitBattle(): void {
    this.transitionGraphics?.clear();
    this.transitionPhase_ = "none";
    removeBattleSearchParam();
    this.scene.start("boot");
  }

  private drawBackground(): void {
    const key = this.textures.exists(backgroundKey(this.group_.background1))
      ? backgroundKey(this.group_.background1)
      : backgroundKey(this.group_.background2);
    if (this.textures.exists(key)) {
      this.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(this.scale.width, STATUS_TOP);
      return;
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(0x182033, 1);
    graphics.fillRect(0, 0, this.scale.width, STATUS_TOP);
    graphics.fillStyle(0x263248, 1);
    for (let y = 0; y < STATUS_TOP; y += 16) {
      graphics.fillRect(0, y, this.scale.width, 8);
    }
  }

  private drawEnemySprites(): void {
    const enemies = enemiesForGroup(this.battleData_, this.group_);
    const count = Math.max(1, enemies.length);
    this.enemySprites = [];
    this.enemySpriteBasePoints = [];
    enemies.forEach((enemy, index) => {
      const key = spriteKey(enemy.spriteId);
      if (!this.textures.exists(key)) {
        return;
      }
      const frame = this.textures.getFrame(key);
      const widthBudget = Math.max(64, 420 / count);
      const scale = Math.min(2, widthBudget / frame.width, 160 / frame.height);
      const point = enemySpritePoint(this.scale.width, count, index, widthBudget);
      this.enemySpriteBasePoints[index] = point;
      this.enemySprites[index] = this.add.image(point.x, point.y, key).setOrigin(0.5, 0.5).setScale(scale).setDepth(10);
    });
  }

  private createStatusWindow(): void {
    const windowTop = STATUS_TOP + 8;
    const windowHeight = this.scale.height - STATUS_TOP - 16;
    const textTop = STATUS_TOP + 16;
    for (const window of this.statusWindows) {
      window.destroy(true);
    }
    this.statusWindows = [];
    this.statusGraphics = this.add.graphics().setDepth(20);
    this.targetCursor = this.add.graphics().setDepth(30);
    this.commandText = this.createGameText(44, textTop, "", {
      fontFamily: MONO,
      fontSize: "15px",
      color: "#f8fafc",
      lineSpacing: 8
    }, {
      scale: BATTLE_TEXT_SCALE,
      tint: 0xf8fafc,
      lineSpacing: BATTLE_LINE_SPACING,
      maxWidth: 92
    }).setDepth(21);
    this.partyText = this.createGameText(178, textTop, "", {
      fontFamily: MONO,
      fontSize: "14px",
      color: "#f8fafc",
      lineSpacing: 7
    }, {
      scale: BATTLE_TEXT_SCALE,
      tint: 0xf8fafc,
      lineSpacing: BATTLE_LINE_SPACING,
      maxWidth: 292
    }).setDepth(21);

    const graphics = this.statusGraphics;
    graphics.clear();
    graphics.fillStyle(0x050914, 0.98);
    graphics.fillRect(0, STATUS_TOP, this.scale.width, this.scale.height - STATUS_TOP);
    this.drawWindow(24, windowTop, 120, windowHeight);
    this.drawWindow(160, windowTop, 328, windowHeight);
  }

  private drawWindow(x: number, y: number, width: number, height: number): void {
    const graphics = this.statusGraphics;
    if (!graphics) {
      return;
    }
    if (this.windowFrames) {
      this.statusWindows.push(
        drawWindowFrame(this, this.windowFrames, x, y, width, height, { scale: BATTLE_TEXT_SCALE }).setDepth(20)
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

  private renderStatus(): void {
    const menuVisible = this.phase_ === "menu" && this.currentActor_?.side === "party";
    if (this.phase_ === "victory-summary") {
      this.commandText?.setText("> OK");
      this.partyText?.setText(this.victorySummaryLines().join("\n"));
    } else if (this.phase_ === "lose") {
      this.commandText?.setText("> OK");
      this.partyText?.setText("The party fell.");
    } else if (this.phase_ === "flee") {
      this.commandText?.setText("> OK");
      this.partyText?.setText("Got away.");
    } else {
      this.commandText?.setText(menuVisible ? this.menuTextLines().join("\n") : "");
      this.partyText?.setText(this.partyStatusLines().join("\n"));
    }
    this.renderEnemySpriteEffects(this.time.now);
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
      windowLoaded: Boolean(this.window_),
      ...(this.window_ ? { defaultFlavorId: this.window_.defaultFlavorId } : {}),
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
      const baseAlpha = alive ? 1 : 0.25;
      const basePoint = this.enemySpriteBasePoints[index];
      const effect = this.enemyEffectFor(index, now);
      if (basePoint) {
        sprite.setPosition(basePoint.x + effect.wobble.dx, basePoint.y + effect.wobble.dy);
      }
      if (!alive || !effect.flashActive || effect.flashIntensity <= 0) {
        sprite.clearTint();
        sprite.setAlpha(baseAlpha);
        return;
      }
      sprite.setTint(0xffffff);
      sprite.setAlpha(Math.max(0.35, 1 - effect.flashIntensity * 0.55));
    });
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
    const targetParty = this.phase_ === "menu" && this.currentActor_?.side === "party" && this.activeTargetSide() === "party";
    return this.battle_.party.map((member, index) => {
      const actorCursor = this.phase_ === "menu" && this.currentActor_?.side === "party" && this.currentActor_.index === index;
      const targetCursor = targetParty && this.partyTargetIndex_ === index;
      const cursor = targetCursor || actorCursor ? ">" : " ";
      const marker = isCombatantAlive(member) ? " " : "X";
      return `${cursor}${marker} ${fitName(member.name, 9)} HP ${odometer(member.hp.displayed)} PP ${odometer(member.pp)}`;
    });
  }

  private victorySummaryLines(): string[] {
    if (!this.victorySummary_) {
      return [];
    }
    return buildVictorySummaryViewModel(this.victorySummary_)
      .lines
      .slice(0, 4)
      .map((line) => fitLine(line, 28));
  }

  private menuTextLines(): string[] {
    if (this.submenu_ === "command") {
      return COMMANDS.map((command, index) => `${index === this.commandIndex_ ? ">" : " "} ${command}`);
    }
    if (this.submenu_ === "psi") {
      const entries = this.learnedPsiForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No learned PSI."];
      }
      return fitMenuRows(entries.map((psi, index) => {
        const cost = psiPpCost(psi);
        return `${index === this.submenuIndex_ ? ">" : " "} ${fitName(psi.name || `[psi ${psi.id}]`, 8)} ${cost}`;
      }), this.submenuIndex_, this.menuMessage_);
    }
    if (this.submenu_ === "goods") {
      const entries = this.goodsForCurrentActor();
      if (entries.length === 0) {
        return [this.menuMessage_ || "No goods."];
      }
      return fitMenuRows(entries.map((entry, index) => {
        const item = this.itemById(entry.itemId);
        return `${index === this.submenuIndex_ ? ">" : " "} ${fitName(item?.name || `[item ${entry.itemId}]`, 10)}`;
      }), this.submenuIndex_, this.menuMessage_);
    }

    const prompt = this.activeTargetSide() === "party" ? "To whom?" : "To enemy?";
    return [prompt, this.menuMessage_].filter(Boolean);
  }

  private currentCommand(): BattleCommand {
    return COMMANDS[this.commandIndex_] ?? "BASH";
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
    if (this.submenu_ === "command" && this.currentCommand() === "BASH") {
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

function enemiesForGroup(data: BattleData, group: BattleGroup): BattleEnemy[] {
  return group.enemyIds
    .map((enemyId) => data.enemies.find((enemy) => enemy.id === enemyId))
    .filter((enemy): enemy is BattleEnemy => Boolean(enemy));
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
  const start = Math.min(
    Math.max(0, selectedIndex - availableRows + 1),
    Math.max(0, rows.length - availableRows)
  );
  const visible = rows.slice(start, start + availableRows);
  if (!message) {
    return visible;
  }
  return [...visible, message];
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
