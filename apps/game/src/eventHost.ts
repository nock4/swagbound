import {
  EventExecutor,
  type EventActorMoveSelector,
  type DialoguePage,
  type DialogueSegment,
  type EventEffect,
  type EventExecutorAdvanceInput,
  type EventExecutorAdvanceResult,
  type EventExecutorHost,
  type EventRecoveryEffect,
  type EventWait,
  type ScriptCollection,
  type SpriteFacing,
  type TeleportDestinations
} from "@eb/schemas";
import { renderSegmentsToText } from "./dialogueRenderer";
import { buildInlineDialoguePages } from "./loader";
import {
  resolveCustomDialoguePages,
  resolveScriptedDialogueOverridePages,
  type CustomDialogueLookup,
  type DialogueLibraryLookup
} from "./scriptedDialogueResolver";
import { GameFlags } from "./gameFlags";
import type { DialogueController } from "./state";
import { PartyState, type ItemUseEffect, type PartyStateCounts } from "./partyState";

type EventEffectKind = EventEffect["kind"];

type CameraFade = {
  fadeOut(duration: number, red?: number, green?: number, blue?: number): unknown;
  fadeIn(duration: number, red?: number, green?: number, blue?: number): unknown;
  centerOn?(x: number, y: number): unknown;
};

type FadeScene = {
  cameras?: { main?: CameraFade };
  time?: { delayedCall(delay: number, callback: () => void): unknown };
};

export type EventMusicSink = {
  play(cue: string): unknown;
  stop(): unknown;
  resume(): unknown;
};

export type NormalizedActorMoveSelector =
  | { kind: "player" }
  | { kind: "npc"; npcId: number };

export type EventWarpDestination = {
  x: number;
  y: number;
  direction?: string;
  worldPixel?: { x: number; y: number };
  facing?: SpriteFacing;
  warpStyle?: number;
  transition?: "fade" | "instant";
};

export type EventHostDebug = {
  running: boolean;
  currentEffectKind?: EventEffectKind;
  effectsDispatched: number;
  effectsByKind: Partial<Record<EventEffectKind, number>>;
  result?: {
    status: "completed" | "aborted";
    truncated: boolean;
    truncatedReason?: "cycle" | "command_budget" | "jump_budget" | "missing_target";
    commandsVisited: number;
    jumps: number;
    reason?: string;
  };
  records: {
    warps: number;
    warpNoops: number;
    battles: number;
    battleNoops: number;
    shops: number;
    audio: number;
    actorMoves: number;
    actorMoveNoops: number;
    unsupported: number;
    unsupportedByKind: Partial<Record<EventEffectKind, number>>;
    lastWarpDest?: number;
    lastTeleportStyle?: number;
    lastBattleGroup?: number;
    lastShopStoreId?: number;
    lastAudioKind?: "music" | "sound" | "musicEffect";
    lastActorMoveActor?: string;
    lastUnsupportedKind?: EventEffectKind;
  };
};

export type RuntimeEventHostOptions = {
  dialogue: DialogueController;
  flags: GameFlags;
  partyState: PartyState;
  scene?: FadeScene;
  resolveWarpDestination?: (dest: number, style?: number) => EventWarpDestination | undefined;
  applyWarpDestination?: (destination: EventWarpDestination) => boolean | void;
  startBattle?: (group: number) => boolean;
  openShop?: (storeId: number) => boolean | void;
  actorMove?: (effect: Extract<EventEffect, { kind: "actorMove" }>) => boolean | void;
  music?: EventMusicSink;
  resolveMusicCueForTrack?: (track: number) => string | undefined;
  isEffectSupported?: (effect: EventEffect) => boolean;
  onUnsupportedEffect?: (effect: EventEffect) => void;
  customDialogue?: CustomDialogueLookup;
  dialogueLibrary?: DialogueLibraryLookup;
};

export type EventSequenceOptions = {
  onComplete?: (result: NonNullable<EventHostDebug["result"]>) => void;
  npcId?: number;
};

type RuntimeEventRunContext = {
  reference: string;
  npcId?: number;
};

export function dialoguePagesForConfirmEffects(
  effects: readonly EventEffect[],
  startIndex: number
): DialoguePage[] {
  const pages: DialoguePage[] = [];
  for (let index = startIndex; index < effects.length; index += 1) {
    const effect = effects[index];
    if (!isConfirmEffect(effect)) {
      break;
    }
    pages.push(pageForConfirmEffect(effect));
  }
  return pages.length > 0 ? pages : [emptyPage()];
}

export function teleportDirectionToFacing(direction: number | undefined): SpriteFacing | undefined {
  switch (direction) {
    case 1:
      return "up";
    case 3:
      return "right";
    case 5:
      return "down";
    case 7:
      return "left";
    default:
      return undefined;
  }
}

export function resolveTeleportDestination(
  table: TeleportDestinations | undefined,
  dest: number,
  style?: number
): EventWarpDestination | undefined {
  const entry = table?.destinations.find((item) => item.id === dest);
  if (!entry) {
    return undefined;
  }
  const worldPixel = { x: entry.x, y: entry.y };
  const facing = teleportDirectionToFacing(entry.direction);
  const warpStyle = style ?? entry.warpStyle;
  const transition = style !== undefined && style > 0 ? "fade" : "instant";
  return {
    x: worldPixel.x,
    y: worldPixel.y,
    worldPixel,
    warpStyle,
    transition,
    ...(facing ? { facing, direction: facing } : {})
  };
}

export class RuntimeEventHost implements EventExecutorHost {
  private executor?: EventExecutor;
  private readonly coveredConfirmIndexes = new Set<number>();
  private readonly reportedUnsupportedEffectKeys = new Set<string>();
  private debugState: EventHostDebug = emptyDebug();
  private transitionRequested = false;
  private abortRequested = false;
  private actorMoveNoopRequested = false;
  private runContext?: RuntimeEventRunContext;
  private dialogueOverrideConsumed = false;

  constructor(private readonly options: RuntimeEventHostOptions) {}

  get flags(): GameFlags {
    return this.options.flags;
  }

  get dialogue(): DialogueController {
    return this.options.dialogue;
  }

  get partyState(): PartyState {
    return this.options.partyState;
  }

  begin(executor: EventExecutor, context: RuntimeEventRunContext): void {
    this.executor = executor;
    this.runContext = context;
    this.coveredConfirmIndexes.clear();
    this.reportedUnsupportedEffectKeys.clear();
    this.transitionRequested = false;
    this.abortRequested = false;
    this.actorMoveNoopRequested = false;
    this.dialogueOverrideConsumed = false;
    this.debugState = { ...emptyDebug(), running: true };
  }

  finish(result?: NonNullable<EventHostDebug["result"]>): void {
    this.debugState = {
      ...this.debugState,
      running: false,
      currentEffectKind: undefined,
      ...(result ? { result } : {})
    };
    this.transitionRequested = false;
    this.abortRequested = false;
    this.actorMoveNoopRequested = false;
    this.executor = undefined;
    this.runContext = undefined;
    this.coveredConfirmIndexes.clear();
    this.reportedUnsupportedEffectKeys.clear();
    this.dialogueOverrideConsumed = false;
  }

  recordEffect(effect: EventEffect): void {
    const effectsByKind = {
      ...this.debugState.effectsByKind,
      [effect.kind]: (this.debugState.effectsByKind[effect.kind] ?? 0) + 1
    };
    this.debugState = {
      ...this.debugState,
      currentEffectKind: effect.kind,
      effectsDispatched: this.executor?.dispatchedEffects.length ?? this.debugState.effectsDispatched,
      effectsByKind
    };
  }

  debug(): EventHostDebug {
    return {
      ...this.debugState,
      effectsByKind: { ...this.debugState.effectsByKind },
      ...(this.debugState.result ? { result: { ...this.debugState.result } } : {}),
      records: { ...this.debugState.records }
    };
  }

  partyCounts(): PartyStateCounts {
    return this.options.partyState.counts();
  }

  shouldAutoConfirmCurrentWait(): boolean {
    return this.coveredConfirmIndexes.has(this.currentEffectIndex()) && !this.options.dialogue.open;
  }

  consumeTransitionRequested(): boolean {
    const requested = this.transitionRequested;
    this.transitionRequested = false;
    return requested;
  }

  consumeAbortRequested(): boolean {
    const requested = this.abortRequested;
    this.abortRequested = false;
    return requested;
  }

  consumeActorMoveNoopRequested(): boolean {
    const requested = this.actorMoveNoopRequested;
    this.actorMoveNoopRequested = false;
    return requested;
  }

  showText(): void {
    this.startConfirmRun();
  }

  wait(wait: EventWait): void {
    if (wait.kind === "confirm") {
      this.startConfirmRun();
    }
  }

  isSet(flag: number): boolean {
    return this.options.flags.isSet(flag);
  }

  setFlag(flag: number): void {
    if (this.skipUnsupported({ kind: "setFlag", flag })) {
      return;
    }
    this.options.flags.setNum(flag);
  }

  unsetFlag(flag: number): void {
    if (this.skipUnsupported({ kind: "unsetFlag", flag })) {
      return;
    }
    this.options.flags.unsetNum(flag);
  }

  give(char: number, item: number): void {
    if (this.skipUnsupported({ kind: "give", char, item })) {
      return;
    }
    this.options.partyState.give(char, item);
  }

  take(char: number, item: number): void {
    if (this.skipUnsupported({ kind: "take", char, item })) {
      return;
    }
    this.options.partyState.take(char, item);
  }

  money(op: "give" | "take", amount: number): void {
    if (this.skipUnsupported({ kind: "money", op, amount })) {
      return;
    }
    this.options.partyState.applyMoney(op, amount);
  }

  atm(op: "deposit" | "withdraw", amount: number): void {
    if (this.skipUnsupported({ kind: "atm", op, amount })) {
      return;
    }
    this.options.partyState.applyAtm(op, amount);
  }

  party(op: "add" | "remove", char: number): void {
    if (this.skipUnsupported({ kind: "party", op, char })) {
      return;
    }
    this.options.partyState.partyOp(op, char);
  }

  warp(dest: number): void {
    if (this.skipUnsupported({ kind: "warp", dest })) {
      return;
    }
    this.applyWarp(dest);
  }

  teleport(dest: number, style: number): void {
    if (this.skipUnsupported({ kind: "teleport", dest, style })) {
      return;
    }
    this.applyWarp(dest, style);
  }

  anchorWarp(): void {
    if (this.skipUnsupported({ kind: "anchorWarp" })) {
      return;
    }
    this.recordWarpNoop(undefined);
  }

  startBattle(group: number): void {
    if (this.skipUnsupported({ kind: "battle", group })) {
      return;
    }
    const started = this.options.startBattle?.(group) ?? false;
    this.debugState.records = {
      ...this.debugState.records,
      battles: this.debugState.records.battles + 1,
      battleNoops: this.debugState.records.battleNoops + (started ? 0 : 1),
      lastBattleGroup: group
    };
    this.transitionRequested = started;
  }

  actorMove(effect: Extract<EventEffect, { kind: "actorMove" }>): void {
    if (this.skipUnsupported(effect)) {
      this.recordActorMove(effect, false);
      this.actorMoveNoopRequested = true;
      return;
    }
    if (!this.options.actorMove) {
      this.recordActorMove(effect, false);
      this.actorMoveNoopRequested = true;
      return;
    }
    const accepted = this.options.actorMove(effect) !== false;
    this.recordActorMove(effect, accepted);
    if (!accepted) {
      this.actorMoveNoopRequested = true;
    }
  }

  openShop(storeId: number): void {
    if (this.skipUnsupported({ kind: "shop", storeId })) {
      return;
    }
    const opened = this.options.openShop?.(storeId) !== false;
    this.debugState.records = {
      ...this.debugState.records,
      shops: this.debugState.records.shops + 1,
      lastShopStoreId: storeId
    };
    this.transitionRequested = opened;
  }

  music(effect: Extract<EventEffect, { kind: "music" }>): void {
    if (this.skipUnsupported(effect)) {
      return;
    }
    if (effect.op === "stop") {
      this.options.music?.stop();
    } else if (effect.op === "resume") {
      this.options.music?.resume();
    } else if ("track" in effect) {
      const cue = this.options.resolveMusicCueForTrack?.(effect.track);
      if (cue) {
        void this.options.music?.play(cue);
      }
    }
    this.recordAudio("music");
  }

  sound(id: number): void {
    if (this.skipUnsupported({ kind: "sound", id })) {
      return;
    }
    this.recordAudio("sound");
  }

  musicEffect(id: number): void {
    if (this.skipUnsupported({ kind: "musicEffect", id })) {
      return;
    }
    this.recordAudio("musicEffect");
  }

  recover(effect: EventRecoveryEffect): void {
    if (this.skipUnsupported(effect)) {
      return;
    }
    this.options.partyState.applyRecovery(effect, effect.char);
  }

  partyStat(op: Extract<EventEffect, { kind: "partyStat" }>["op"], char: number, amount: number): void {
    if (this.skipUnsupported({ kind: "partyStat", op, char, amount })) {
      return;
    }
    const effect = itemUseEffectForPartyStat(op, amount);
    if (effect) {
      this.options.partyState.applyPartyStat(char, effect);
    }
  }

  inflict(char: number, status: number): void {
    this.skipUnsupported({ kind: "inflict", char, status });
  }

  learnPsi(char: number, psi: number): void {
    this.skipUnsupported({ kind: "learnPsi", char, psi });
  }

  event(id: number): void {
    this.skipUnsupported({ kind: "event", id });
  }

  control(effect: Extract<EventEffect, { kind: "control" }>): void {
    this.recordUnsupported(effect);
  }

  terminator(_code: "end" | "eob"): void {
    // Script terminators end the executor flow; no host-side action is needed.
  }

  private startConfirmRun(): void {
    const index = this.currentEffectIndex();
    if (this.coveredConfirmIndexes.has(index)) {
      return;
    }
    const effects = this.executor?.effects ?? [];
    if (!isConfirmEffect(effects[index])) {
      return;
    }
    const pages = this.resolveDialogueOverridePages()
      ?? dialoguePagesForConfirmEffects(effects, index);
    for (let next = index; next < effects.length && isConfirmEffect(effects[next]); next += 1) {
      this.coveredConfirmIndexes.add(next);
    }
    this.options.dialogue.start(pages);
  }

  private resolveDialogueOverridePages(): DialoguePage[] | undefined {
    if (this.dialogueOverrideConsumed) {
      return undefined;
    }
    const customDialogue = this.options.customDialogue;
    const context = this.runContext;
    if (!customDialogue || !context) {
      return undefined;
    }
    this.dialogueOverrideConsumed = true;

    // Granularity: an override is keyed to the sequence entry reference, or to
    // the active NPC id when supplied, and replaces this run's first contiguous
    // text/prompt block. Non-dialogue effects and later blocks still execute.
    const npcEntry = context.npcId !== undefined
      ? customDialogue.byNpcId[String(context.npcId)]
      : undefined;
    const npcPages = resolveCustomDialoguePages(npcEntry, this.options.dialogueLibrary);
    if (npcPages && npcPages.length > 0) {
      return buildInlineDialoguePages(npcPages);
    }
    return resolveScriptedDialogueOverridePages(
      customDialogue,
      this.options.dialogueLibrary,
      context.reference
    );
  }

  private currentEffectIndex(): number {
    return Math.max(0, (this.executor?.dispatchedEffects.length ?? 1) - 1);
  }

  private applyWarp(dest: number, style?: number): void {
    const destination = this.options.resolveWarpDestination?.(dest, style);
    if (!destination || !this.options.applyWarpDestination) {
      this.recordWarpNoop(dest, style);
      return;
    }
    this.recordWarp(dest, style);
    const applied = this.options.applyWarpDestination(destination);
    if (applied === false) {
      this.abortRequested = true;
      return;
    }
    if (this.shouldFadeWarp(destination, style)) {
      this.fade();
    }
  }

  private shouldFadeWarp(destination: EventWarpDestination, style?: number): boolean {
    if (destination.transition === "fade") {
      return true;
    }
    if (destination.transition === "instant") {
      return false;
    }
    return style !== undefined && style > 0;
  }

  private fade(): void {
    const camera = this.options.scene?.cameras?.main;
    if (!camera) {
      return;
    }
    camera.fadeOut(90, 0, 0, 0);
    const fadeIn = () => camera.fadeIn(120, 0, 0, 0);
    if (this.options.scene?.time) {
      this.options.scene.time.delayedCall(90, fadeIn);
      return;
    }
    fadeIn();
  }

  private recordWarp(dest: number, style?: number): void {
    this.debugState.records = {
      ...this.debugState.records,
      warps: this.debugState.records.warps + 1,
      lastWarpDest: dest,
      ...(style !== undefined ? { lastTeleportStyle: style } : {})
    };
  }

  private recordWarpNoop(dest: number | undefined, style?: number): void {
    this.debugState.records = {
      ...this.debugState.records,
      warps: this.debugState.records.warps + 1,
      warpNoops: this.debugState.records.warpNoops + 1,
      ...(dest !== undefined ? { lastWarpDest: dest } : {}),
      ...(style !== undefined ? { lastTeleportStyle: style } : {})
    };
  }

  private recordAudio(kind: "music" | "sound" | "musicEffect"): void {
    this.debugState.records = {
      ...this.debugState.records,
      audio: this.debugState.records.audio + 1,
      lastAudioKind: kind
    };
  }

  private recordActorMove(effect: Extract<EventEffect, { kind: "actorMove" }>, accepted: boolean): void {
    this.debugState.records = {
      ...this.debugState.records,
      actorMoves: this.debugState.records.actorMoves + 1,
      actorMoveNoops: this.debugState.records.actorMoveNoops + (accepted ? 0 : 1),
      lastActorMoveActor: actorMoveSelectorLabel(effect.actor)
    };
  }

  private skipUnsupported(effect: EventEffect): boolean {
    if (this.options.isEffectSupported?.(effect) !== false) {
      return false;
    }
    this.recordUnsupported(effect);
    return true;
  }

  private recordUnsupported(effect: EventEffect): void {
    const key = unsupportedEffectKey(effect);
    if (!this.reportedUnsupportedEffectKeys.has(key)) {
      this.reportedUnsupportedEffectKeys.add(key);
      this.options.onUnsupportedEffect?.(effect);
    }
    this.debugState.records = {
      ...this.debugState.records,
      unsupported: this.debugState.records.unsupported + 1,
      unsupportedByKind: {
        ...this.debugState.records.unsupportedByKind,
        [effect.kind]: (this.debugState.records.unsupportedByKind[effect.kind] ?? 0) + 1
      },
      lastUnsupportedKind: effect.kind
    };
  }
}

export class RuntimeEventSequence {
  private executor?: EventExecutor;
  private onComplete?: EventSequenceOptions["onComplete"];

  constructor(
    private readonly scripts: ScriptCollection | undefined,
    private readonly host: RuntimeEventHost
  ) {}

  get running(): boolean {
    return this.host.debug().running;
  }

  start(reference: string, options: EventSequenceOptions = {}): boolean {
    if (!this.scripts) {
      return false;
    }
    const executor = new EventExecutor(this.scripts, this.host, { flags: this.host.flags });
    const flow = executor.start(reference);
    if (!flow) {
      return false;
    }
    this.executor = executor;
    this.onComplete = options.onComplete;
    this.host.begin(executor, { reference, ...(options.npcId !== undefined ? { npcId: options.npcId } : {}) });
    this.pump();
    return true;
  }

  confirm(): void {
    if (!this.running) {
      return;
    }
    this.pump({ confirm: true });
  }

  notifyActorArrived(): void {
    if (!this.running) {
      return;
    }
    this.pump({ actorMoveComplete: true });
  }

  update(deltaMs: number): void {
    if (!this.running) {
      return;
    }
    this.pump({ frames: deltaMs / (1000 / 60) });
  }

  abort(reason = "aborted"): void {
    if (!this.running) {
      return;
    }
    this.executor = undefined;
    this.host.finish({
      status: "aborted",
      truncated: false,
      commandsVisited: 0,
      jumps: 0,
      reason
    });
    this.onComplete = undefined;
  }

  debug(): EventHostDebug {
    return this.host.debug();
  }

  partyCounts(): PartyStateCounts {
    return this.host.partyCounts();
  }

  private pump(input: EventExecutorAdvanceInput = {}): void {
    let nextInput = input;
    while (this.executor && this.running) {
      const result = this.executor.advance(nextInput);
      nextInput = {};
      if (this.handleResult(result)) {
        continue;
      }
      return;
    }
  }

  private handleResult(result: EventExecutorAdvanceResult): boolean {
    if (result.done) {
      this.finish(result);
      return false;
    }
    if ("effect" in result) {
      this.host.recordEffect(result.effect);
      if (this.host.consumeAbortRequested()) {
        this.finishAborted("host_abort_requested");
        return false;
      }
      if (this.host.consumeTransitionRequested()) {
        this.finishAborted("transition_requested");
        return false;
      }
    }
    if (!result.wait) {
      return true;
    }
    if (result.wait.kind === "confirm" && this.host.shouldAutoConfirmCurrentWait()) {
      this.pump({ confirm: true });
    } else if (result.wait.kind === "actorMove" && this.host.consumeActorMoveNoopRequested()) {
      this.pump({ actorMoveComplete: true });
    }
    return false;
  }

  private finish(result: Extract<EventExecutorAdvanceResult, { done: true }>): void {
    const onComplete = this.onComplete;
    const finishResult: NonNullable<EventHostDebug["result"]> = {
      status: "completed",
      truncated: result.truncated,
      ...(result.truncatedReason ? { truncatedReason: result.truncatedReason } : {}),
      commandsVisited: result.commandsVisited,
      jumps: result.jumps
    };
    this.executor = undefined;
    this.onComplete = undefined;
    this.host.finish(finishResult);
    onComplete?.(finishResult);
  }

  private finishAborted(reason: string): void {
    const onComplete = this.onComplete;
    const finishResult: NonNullable<EventHostDebug["result"]> = {
      status: "aborted",
      truncated: false,
      commandsVisited: 0,
      jumps: 0,
      reason
    };
    this.executor = undefined;
    this.onComplete = undefined;
    this.host.finish(finishResult);
    onComplete?.(finishResult);
  }
}

function isConfirmEffect(effect: EventEffect | undefined): effect is Extract<EventEffect, { kind: "text" | "prompt" }> {
  return effect?.kind === "text" || effect?.kind === "prompt";
}

function pageForConfirmEffect(effect: Extract<EventEffect, { kind: "text" | "prompt" }>): DialoguePage {
  if (effect.kind === "prompt") {
    return emptyPage();
  }
  const segments: DialogueSegment[] = [...effect.segments];
  return {
    text: renderSegmentsToText(segments),
    ended: false,
    unknownCommands: [],
    segments
  };
}

function emptyPage(): DialoguePage {
  return {
    text: "",
    ended: false,
    unknownCommands: [],
    segments: []
  };
}

function emptyDebug(): EventHostDebug {
  return {
    running: false,
    effectsDispatched: 0,
    effectsByKind: {},
    records: {
      warps: 0,
      warpNoops: 0,
      battles: 0,
      battleNoops: 0,
      shops: 0,
      audio: 0,
      actorMoves: 0,
      actorMoveNoops: 0,
      unsupported: 0,
      unsupportedByKind: {}
    }
  };
}

export function normalizeActorMoveSelector(actor: EventActorMoveSelector): NormalizedActorMoveSelector | undefined {
  if (actor === "player") {
    return { kind: "player" };
  }
  if ("kind" in actor && actor.kind === "player") {
    return { kind: "player" };
  }
  if (Number.isInteger(actor.npcId) && actor.npcId >= 0) {
    return { kind: "npc", npcId: actor.npcId };
  }
  return undefined;
}

function actorMoveSelectorLabel(actor: EventActorMoveSelector): string {
  const normalized = normalizeActorMoveSelector(actor);
  if (!normalized) {
    return "unknown";
  }
  return normalized.kind === "player" ? "player" : `npc:${normalized.npcId}`;
}

function itemUseEffectForPartyStat(
  op: Extract<EventEffect, { kind: "partyStat" }>["op"],
  amount: number
): ItemUseEffect | undefined {
  switch (op) {
    case "heal":
      return { kind: "healHp", amount };
    case "heal_percent":
      return { kind: "healHpPercent", percent: amount };
    case "recoverpp":
      return { kind: "recoverPp", amount };
    case "recoverpp_percent":
      return { kind: "recoverPpPercent", percent: amount };
    default:
      return undefined;
  }
}

function unsupportedEffectKey(effect: EventEffect): string {
  if (effect.kind === "control") {
    return `${effect.kind}:${effect.code ?? ""}:${effect.raw}`;
  }
  return effect.kind;
}
