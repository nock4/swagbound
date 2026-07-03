import Phaser from "phaser";
import type {
  CardNfts,
  DrifellaSourceCheck,
  ItemCollection,
  SpriteOverrides
} from "@eb/schemas";
import type { ChunkedWorldRestore } from "./battleReturn";
import type { GameData } from "./loader";
import { PartyState } from "./partyState";
import type { SaveSlotPersistence } from "./saveState";
import type { Facing } from "./playerController";
import {
  CLEAN_UI_PANEL_BORDER,
  CLEAN_UI_PRIMARY,
  CLEAN_UI_SECONDARY,
  CLEAN_UI_SELECTION_CARET,
  CLEAN_UI_SELECTION_TEXT,
  cleanGridCells,
  createCleanText,
  drawCleanCaret,
  drawCleanPanel,
  drawCleanSelection,
  moveBattleCommandGridIndex
} from "./cleanUi";
import {
  CANCEL_KEY_NAMES,
  CONFIRM_KEY_NAMES,
  MENU_DOWN_KEY_NAMES,
  MENU_LEFT_KEY_NAMES,
  MENU_RIGHT_KEY_NAMES,
  MENU_UP_KEY_NAMES,
  registerDiscreteKeys
} from "./inputModel";
import { menuCursorVisible } from "./battleVisuals";
import { revealState } from "./dialogueRenderer";
import {
  createSourceCheckSfx,
  type SourceCheckCardRarity,
  type SourceCheckSfx,
  type SourceCheckSfxCue
} from "./audio/sourceCheckSfx";
import {
  cardById,
  drawSourceCheckQuestions,
  resolveSourceCheckRewards,
  type DrawnSourceCheckQuestion
} from "./sourceCheckModel";

export type SourceCheckReturnTo = {
  worldPixel: { x: number; y: number };
  facing: Facing;
  context: {
    sceneKey: "chunked-world";
    gameData: GameData;
    saveSlot: number;
    saveSlots?: SaveSlotPersistence;
    restore: ChunkedWorldRestore;
  };
};

export type SourceCheckSceneInit = {
  check: DrifellaSourceCheck;
  cards: CardNfts;
  items?: ItemCollection;
  spriteOverrides?: SpriteOverrides;
  returnTo: SourceCheckReturnTo;
  attempt: number;
  gameFlagsSnapshot?: string[];
};

type SourceCheckPhase = "splash" | "question" | "feedback" | "ceremony" | "exiting";
type SourceCheckOutcome = "declined" | "failed" | "cleared";

const TEXT_CPS = 42;
const SPLASH_MS = 520;
const PANEL_RECT = { x: 24, y: 228, width: 464, height: 196 };
const QUESTION_TEXT_RECT = { x: 44, y: 248, width: 424, height: 58 };
const ANSWER_GRID_RECT = { x: 52, y: 326, width: 408, height: 70 };

export class SourceCheckScene extends Phaser.Scene {
  private check!: DrifellaSourceCheck;
  private cards!: CardNfts;
  private items?: ItemCollection;
  private returnTo!: SourceCheckReturnTo;
  private attempt = 1;
  private flags = new Set<string>();
  private draw = drawSourceCheckQuestions(dummyCheck(), { has: () => false }, 1);
  private phase: SourceCheckPhase = "splash";
  private questionIndex = 0;
  private selectionIndex = 0;
  private correctSoFar = 0;
  private lastOutcome: "correct" | "wrong" | "cleared" | "declined" | null = null;
  private phaseStartedAt = 0;
  private revealStartedAt = 0;
  private revealForced = false;
  private feedbackText = "";
  private feedbackCorrect = false;
  private rewardApplied = false;
  private ceremonyItemHeld = false;
  private cardTextureLoading = false;
  private graphics?: Phaser.GameObjects.Graphics;
  private accentGraphics?: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private drifellaImage?: Phaser.GameObjects.Image;
  private cardImage?: Phaser.GameObjects.Image;
  private sourceCheckSfx: SourceCheckSfx = createSourceCheckSfx();
  private lastSfx: SourceCheckSfxCue | null = null;
  private sfxCount = 0;
  private usedCorrectReactionLines = new Set<string>();

  constructor() {
    super("source-check");
  }

  init(data: SourceCheckSceneInit): void {
    this.check = data.check;
    this.cards = data.cards;
    this.items = data.items;
    this.returnTo = data.returnTo;
    this.attempt = Math.max(1, Math.floor(data.attempt));
    this.flags = new Set(data.gameFlagsSnapshot ?? data.returnTo.context.restore.flags.strings);
    this.draw = drawSourceCheckQuestions(this.check, { has: (flag) => this.flags.has(flag) }, this.attempt);
    this.phase = "splash";
    this.questionIndex = 0;
    this.selectionIndex = 0;
    this.correctSoFar = 0;
    this.lastOutcome = null;
    this.phaseStartedAt = 0;
    this.revealStartedAt = 0;
    this.revealForced = false;
    this.feedbackText = "";
    this.feedbackCorrect = false;
    this.rewardApplied = false;
    this.ceremonyItemHeld = false;
    this.cardTextureLoading = false;
    this.lastSfx = null;
    this.sfxCount = 0;
    this.usedCorrectReactionLines.clear();
  }

  preload(): void {
    this.load.image(this.drifellaTextureKey(), publicAssetUrl(this.check.battleSprite));
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#06070b");
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.graphics = this.add.graphics().setDepth(1);
    this.accentGraphics = this.add.graphics().setDepth(12);
    this.phaseStartedAt = this.time.now;
    this.revealStartedAt = this.time.now;
    this.createDrifellaImage();
    this.registerSourceCheckSfxResume();
    registerDiscreteKeys(this.input.keyboard, CONFIRM_KEY_NAMES, () => this.confirm());
    registerDiscreteKeys(this.input.keyboard, CANCEL_KEY_NAMES, () => this.cancel());
    registerDiscreteKeys(this.input.keyboard, MENU_LEFT_KEY_NAMES, () => this.moveSelection("left"));
    registerDiscreteKeys(this.input.keyboard, MENU_RIGHT_KEY_NAMES, () => this.moveSelection("right"));
    registerDiscreteKeys(this.input.keyboard, MENU_UP_KEY_NAMES, () => this.moveSelection("up"));
    registerDiscreteKeys(this.input.keyboard, MENU_DOWN_KEY_NAMES, () => this.moveSelection("down"));
    this.publish();
  }

  update(): void {
    if (this.phase === "splash" && this.time.now - this.phaseStartedAt >= SPLASH_MS) {
      this.beginQuestion(0);
    }
    this.render();
    this.publish();
  }

  private confirm(): void {
    if (this.phase === "exiting") {
      return;
    }
    if (this.phase === "splash") {
      this.beginQuestion(0);
      return;
    }
    if ((this.phase === "question" || this.phase === "feedback") && !this.currentReveal().revealComplete) {
      this.revealForced = true;
      return;
    }
    if (this.phase === "question") {
      this.confirmAnswer();
      return;
    }
    if (this.phase === "feedback") {
      if (!this.feedbackCorrect) {
        this.returnToWorld("failed");
        return;
      }
      if (this.correctSoFar >= this.draw.drawCount) {
        this.beginCeremony();
      } else {
        this.beginQuestion(this.questionIndex + 1);
      }
      return;
    }
    if (this.phase === "ceremony") {
      this.returnToWorld("cleared");
    }
  }

  private cancel(): void {
    if (this.phase === "exiting") {
      return;
    }
    if (this.correctSoFar === 0 && this.lastOutcome === null) {
      this.lastOutcome = "declined";
      this.returnToWorld("declined");
    }
  }

  private moveSelection(direction: "left" | "right" | "up" | "down"): void {
    if (this.phase !== "question" || !this.currentReveal().revealComplete) {
      return;
    }
    const question = this.currentQuestion();
    if (!question) {
      return;
    }
    const columns = this.answerColumns(question);
    const nextIndex = moveBattleCommandGridIndex(this.selectionIndex, question.options.length, direction, columns);
    if (nextIndex !== this.selectionIndex) {
      this.selectionIndex = nextIndex;
      this.playSourceCheckSfx("menuMove");
    }
  }

  private confirmAnswer(): void {
    const question = this.currentQuestion();
    if (!question) {
      return;
    }
    this.playSourceCheckSfx("answerLock");
    const correct = this.selectionIndex === question.correctOptionIndex;
    this.feedbackCorrect = correct;
    this.lastOutcome = correct ? "correct" : "wrong";
    if (correct) {
      this.correctSoFar += 1;
      this.feedbackText = this.pickLine(this.check.reactions.correct, this.usedCorrectReactionLines);
      const streakStep = this.correctSoFar - 1;
      this.time.delayedCall(70, () => this.playSourceCheckSfx("correct", { streakStep }));
    } else {
      this.feedbackText = [
        question.failLine ?? "Not quite.",
        this.pickLine(this.check.reactions.failed)
      ].join("\n");
      this.time.delayedCall(70, () => this.playSourceCheckSfx("wrong"));
      this.cameras.main.shake(90, 0.0022);
    }
    this.phase = "feedback";
    this.phaseStartedAt = this.time.now;
    this.revealStartedAt = this.time.now;
    this.revealForced = false;
  }

  private beginQuestion(index: number): void {
    this.phase = "question";
    this.questionIndex = Math.max(0, Math.min(index, this.draw.questions.length - 1));
    this.selectionIndex = 0;
    this.phaseStartedAt = this.time.now;
    this.revealStartedAt = this.time.now;
    this.revealForced = false;
  }

  private beginCeremony(): void {
    this.phase = "ceremony";
    this.phaseStartedAt = this.time.now;
    this.revealStartedAt = this.time.now;
    this.revealForced = true;
    this.lastOutcome = "cleared";
    this.applyReward();
    this.ensureCardTexture();
    this.playSourceCheckSfx("ceremony");
    this.time.delayedCall(420, () => this.playSourceCheckSfx(`rarity:${this.rewardRarity()}`));
  }

  private applyReward(): void {
    if (this.rewardApplied) {
      return;
    }
    const party = new PartyState();
    party.restore(this.returnTo.context.restore.party);
    const leadCharId = this.returnTo.context.restore.party.partyIds[0] ?? 0;
    const result = resolveSourceCheckRewards(this.check, leadCharId, (charId, itemId) => party.give(charId, itemId));
    const restore = this.returnTo.context.restore;
    restore.party = party.snapshot();
    for (const flag of result.flagsToSet) {
      this.setRestoreFlag(flag);
    }
    for (const flag of result.flagsToClear) {
      this.clearRestoreFlag(flag);
    }
    this.ceremonyItemHeld = result.itemHeld;
    this.rewardApplied = true;
  }

  private returnToWorld(outcome: SourceCheckOutcome): void {
    this.phase = "exiting";
    const context = this.returnTo.context;
    // Normalize the return party through PartyState for EVERY outcome. The
    // cleared path already did this inside applyReward; declined/failed skip it,
    // and a raw (un-normalized) party snapshot can be rejected by the world
    // scene's restore — which would strand the player in this scene.
    if (!this.rewardApplied) {
      const party = new PartyState();
      party.restore(context.restore.party);
      context.restore.party = party.snapshot();
    }
    context.restore.player = {
      x: this.returnTo.worldPixel.x,
      y: this.returnTo.worldPixel.y,
      facing: this.returnTo.facing
    };
    context.restore.sourceCheck = {
      id: this.check.id,
      outcome,
      worldPixel: { ...this.check.placement.worldPixel }
    };
    this.scene.start(context.sceneKey, {
      gameData: context.gameData,
      saveSlot: context.saveSlot,
      saveSlots: context.saveSlots,
      restore: context.restore
    });
  }

  private render(): void {
    this.graphics?.clear();
    this.accentGraphics?.clear();
    this.clearTexts();
    this.drawBackdrop();
    this.drawPips();
    if (this.phase === "splash") {
      this.drawSplash();
      return;
    }
    if (this.phase === "ceremony") {
      this.drawCeremony();
      return;
    }
    this.drawQuestionPanel();
  }

  private drawBackdrop(): void {
    const graphics = this.graphics;
    if (!graphics) {
      return;
    }
    graphics.fillStyle(0x111827, 0.74);
    graphics.fillRoundedRect(78, 34, 356, 162, 10);
    graphics.lineStyle(1, CLEAN_UI_PANEL_BORDER, 0.22);
    graphics.strokeRoundedRect(78.5, 34.5, 355, 161, 10);
    if (this.phase === "feedback" && this.feedbackCorrect) {
      const pulse = 0.22 + Math.sin(this.time.now / 70) * 0.1;
      this.accentGraphics?.fillStyle(0xffffff, pulse);
      this.accentGraphics?.fillCircle(256, 116, 58);
    }
  }

  private drawPips(): void {
    const graphics = this.graphics;
    if (!graphics) {
      return;
    }
    for (let index = 0; index < this.draw.drawCount; index += 1) {
      const x = 416 + index * 16;
      graphics.fillStyle(index < this.correctSoFar ? 0xffffff : 0x111827, index < this.correctSoFar ? 0.95 : 0.8);
      graphics.fillCircle(x, 28, 5);
      graphics.lineStyle(1, CLEAN_UI_PANEL_BORDER, 0.8);
      graphics.strokeCircle(x, 28, 5);
    }
  }

  private drawSplash(): void {
    this.addText(256, 236, "SOURCE CHECK", {
      fontSize: 26,
      color: CLEAN_UI_PRIMARY,
      fixedWidth: 300,
      align: "center",
      weight: 500
    }).setOrigin(0.5, 0);
    const tic = this.check.personality?.tic;
    if (tic) {
      this.addText(86, 274, tic, {
        fontSize: 14,
        color: CLEAN_UI_SECONDARY,
        fixedWidth: 340,
        align: "center",
        wordWrapWidth: 340,
        lineSpacing: 2
      });
    }
  }

  private drawQuestionPanel(): void {
    const graphics = this.graphics;
    if (!graphics) {
      return;
    }
    drawCleanPanel(graphics, PANEL_RECT);
    const reveal = this.currentReveal();
    const text = this.phase === "feedback" ? this.feedbackText : this.currentQuestion()?.prompt ?? "";
    this.addText(QUESTION_TEXT_RECT.x, QUESTION_TEXT_RECT.y, reveal.revealedText || text.slice(0, reveal.revealedChars), {
      fontSize: 15,
      color: CLEAN_UI_PRIMARY,
      fixedWidth: QUESTION_TEXT_RECT.width,
      wordWrapWidth: QUESTION_TEXT_RECT.width,
      lineSpacing: 2
    });
    if (this.phase !== "question" || !reveal.revealComplete) {
      return;
    }
    const question = this.currentQuestion();
    if (!question) {
      return;
    }
    this.drawAnswers(question);
  }

  private drawAnswers(question: DrawnSourceCheckQuestion): void {
    const graphics = this.graphics;
    if (!graphics) {
      return;
    }
    const columns = this.answerColumns(question);
    const cells = cleanGridCells(ANSWER_GRID_RECT, question.options.length, columns, 8, 8);
    cells.forEach((cell) => {
      const selected = cell.index === this.selectionIndex;
      if (selected) {
        drawCleanSelection(graphics, cell, true);
        if (menuCursorVisible(this.time.now)) {
          drawCleanCaret(graphics, cell.x + 4, cell.y, cell.height, CLEAN_UI_SELECTION_CARET);
        }
      } else {
        drawCleanSelection(graphics, cell, false);
      }
      this.addText(cell.x + 17, cell.y + 6, question.options[cell.index] ?? "", {
        fontSize: 14,
        color: selected ? CLEAN_UI_SELECTION_TEXT : CLEAN_UI_PRIMARY,
        fixedWidth: Math.max(1, cell.width - 22),
        fixedHeight: cell.height,
        weight: selected ? 500 : 400
      });
    });
  }

  private drawCeremony(): void {
    const graphics = this.graphics;
    if (!graphics) {
      return;
    }
    graphics.fillStyle(0x000000, 0.54);
    graphics.fillRect(0, 0, this.scale.width, this.scale.height);
    const card = cardById(this.cards, this.check.rewards.cardId);
    this.ensureCardTexture();
    if (card && this.textures.exists(this.cardTextureKey())) {
      if (!this.cardImage || !this.cardImage.active) {
        this.cardImage = this.add.image(256, 188, this.cardTextureKey()).setDepth(8);
      }
      const scale = Math.min(1.18, 224 / Math.max(1, this.cardImage.height));
      this.cardImage.setScale(scale).setPosition(256, 184).setVisible(true);
    }
    drawCleanPanel(graphics, { x: 70, y: 314, width: 372, height: 82 });
    const cardName = card?.name ?? this.check.rewards.cardId;
    const itemLine = this.ceremonyItemHeld
      ? `Drifella holds ${this.itemName(this.check.rewards.itemId)}.`
      : `+ ${this.itemName(this.check.rewards.itemId)}`;
    this.addText(88, 332, cardName, {
      fontSize: 15,
      color: CLEAN_UI_PRIMARY,
      fixedWidth: 336,
      align: "center",
      weight: 500
    });
    this.addText(88, 360, itemLine, {
      fontSize: 14,
      color: CLEAN_UI_SECONDARY,
      fixedWidth: 336,
      align: "center"
    });
  }

  private currentQuestion(): DrawnSourceCheckQuestion | undefined {
    return this.draw.questions[this.questionIndex];
  }

  private currentReveal(): { revealedText: string; revealedChars: number; revealComplete: boolean } {
    const text = this.phase === "feedback" ? this.feedbackText : this.currentQuestion()?.prompt ?? "";
    const cps = this.currentTextCps();
    return this.revealForced
      ? revealState(text, Number.MAX_SAFE_INTEGER, cps)
      : revealState(text, this.time.now - this.revealStartedAt, cps);
  }

  private currentTextCps(): number {
    return this.phase === "question" && this.questionIndex === this.draw.drawCount - 1
      ? TEXT_CPS * 0.85
      : TEXT_CPS;
  }

  private answerColumns(question: DrawnSourceCheckQuestion): number {
    return question.type === "trueFalse" ? 2 : 2;
  }

  private createDrifellaImage(): void {
    if (!this.textures.exists(this.drifellaTextureKey())) {
      const fallback = this.add.rectangle(256, 162, 72, 96, 0x9aa3b2, 0.9).setDepth(5);
      fallback.setOrigin(0.5, 1);
      return;
    }
    this.drifellaImage = this.add.image(256, 174, this.drifellaTextureKey()).setDepth(5).setOrigin(0.5, 1);
    const scale = Math.min(1.5, 126 / Math.max(1, this.drifellaImage.height));
    this.drifellaImage.setScale(scale);
  }

  private ensureCardTexture(): void {
    const card = cardById(this.cards, this.check.rewards.cardId);
    if (!card || this.textures.exists(this.cardTextureKey()) || this.cardTextureLoading) {
      return;
    }
    this.cardTextureLoading = true;
    this.load.image(this.cardTextureKey(), publicAssetUrl(card.image));
    this.load.once("complete", () => {
      this.cardTextureLoading = false;
    });
    if (!this.load.isLoading()) {
      this.load.start();
    }
  }

  private setRestoreFlag(flag: string): void {
    const strings = this.returnTo.context.restore.flags.strings;
    if (!strings.includes(flag)) {
      strings.push(flag);
    }
    this.flags.add(flag);
  }

  private clearRestoreFlag(flag: string): void {
    this.returnTo.context.restore.flags.strings = this.returnTo.context.restore.flags.strings.filter((entry) => entry !== flag);
    this.flags.delete(flag);
  }

  private pickLine(lines: readonly string[], usedLines?: Set<string>): string {
    if (lines.length === 0) {
      return "";
    }
    const unused = usedLines ? lines.filter((line) => !usedLines.has(line)) : lines;
    if (usedLines && unused.length === 0) {
      usedLines.clear();
    }
    const candidates = usedLines && unused.length > 0 ? unused : lines;
    const index = Math.abs(Math.floor((this.time.now + this.questionIndex * 17) % candidates.length));
    const line = candidates[index] ?? candidates[0] ?? "";
    usedLines?.add(line);
    return line;
  }

  private itemName(itemId: number): string {
    return this.items?.items.find((item) => item.id === itemId)?.name.trim() || `item ${itemId}`;
  }

  private rewardRarity(): SourceCheckCardRarity {
    return cardById(this.cards, this.check.rewards.cardId)?.rarity ?? "common";
  }

  private registerSourceCheckSfxResume(): void {
    const resume = () => {
      this.sourceCheckSfx.resume();
    };
    this.input.once("pointerdown", resume);
    this.input.keyboard?.once("keydown", resume);
    this.events.once("shutdown", () => {
      this.input.off("pointerdown", resume);
      this.input.keyboard?.off("keydown", resume);
    });
  }

  private playSourceCheckSfx(cue: SourceCheckSfxCue, options: { streakStep?: number } = {}): void {
    this.lastSfx = cue;
    this.sfxCount += 1;
    switch (cue) {
      case "menuMove":
        this.sourceCheckSfx.menuMove();
        break;
      case "answerLock":
        this.sourceCheckSfx.answerLock();
        break;
      case "correct":
        this.sourceCheckSfx.correct(options.streakStep ?? 0);
        break;
      case "wrong":
        this.sourceCheckSfx.wrong();
        break;
      case "ceremony":
        this.sourceCheckSfx.ceremony();
        break;
      case "rarity:common":
        this.sourceCheckSfx.raritySting("common");
        break;
      case "rarity:holo":
        this.sourceCheckSfx.raritySting("holo");
        break;
      case "rarity:source-grade":
        this.sourceCheckSfx.raritySting("source-grade");
        break;
    }
  }

  private drifellaTextureKey(): string {
    return `source-check-battle-${this.check.id}`;
  }

  private cardTextureKey(): string {
    return `source-check-card-${this.check.rewards.cardId}`;
  }

  private addText(
    x: number,
    y: number,
    text: string,
    options: Parameters<typeof createCleanText>[4]
  ): Phaser.GameObjects.Text {
    const object = createCleanText(this, x, y, text, options).setDepth(20);
    this.texts.push(object);
    return object;
  }

  private clearTexts(): void {
    for (const text of this.texts) {
      text.destroy();
    }
    this.texts = [];
    if (this.phase !== "ceremony") {
      this.cardImage?.setVisible(false);
    }
  }

  private publish(): void {
    (globalThis as Record<string, unknown>).__sourceCheckDebug = {
      phase: this.phase,
      checkId: this.check.id,
      questionIndex: this.phase === "splash" ? -1 : this.questionIndex,
      drawCount: this.draw.drawCount,
      pips: this.correctSoFar,
      selection: this.selectionIndex,
      correctSoFar: this.correctSoFar,
      lastOutcome: this.lastOutcome,
      lastSfx: this.lastSfx,
      sfxCount: this.sfxCount,
      personality: this.check.personality ?? null,
      drawnPrompts: this.draw.questions.map((question) => question.prompt),
      // Rendered option order for the CURRENT question (post-shuffle) — lets
      // headless drivers answer deterministically by matching option text.
      options: this.draw.questions[this.questionIndex]?.options ?? [],
      correctOptionIndex: this.draw.questions[this.questionIndex]?.correctOptionIndex ?? -1
    };
  }
}

function publicAssetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function dummyCheck(): DrifellaSourceCheck {
  return {
    id: "dummy",
    drifellaId: "dummy",
    drifellaName: "Drifella",
    npcId: 100300,
    region: "dummy",
    tier: 1,
    placement: { kind: "dummy", worldPixel: { x: 0, y: 0 }, facing: "down" },
    visibility: { requireFlags: [], blockFlags: [] },
    battleSprite: "assets/dummy.png",
    hints: [],
    entryPrompt: ["dummy"],
    questions: {
      drawCount: 1,
      pool: [{ type: "trueFalse", prompt: "dummy", answer: true }]
    },
    rewards: { cardId: "dummy", itemId: 1 },
    retry: { policy: "leaveArea", rotatePool: false, checkpointAt: null },
    reactions: {
      correct: ["correct"],
      cleared: ["cleared"],
      failed: ["failed"],
      alreadyCleared: ["already"]
    }
  };
}
