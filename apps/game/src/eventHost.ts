import {
  EventExecutor,
  type DialoguePage,
  type DialogueSegment,
  type EventEffect,
  type EventExecutorAdvanceInput,
  type EventExecutorAdvanceResult,
  type EventExecutorHost,
  type EventWait,
  type ScriptCollection
} from "@eb/schemas";
import { renderSegmentsToText } from "./dialogueRenderer";
import { GameFlags } from "./gameFlags";
import type { DialogueController } from "./state";
import { PartyState, type PartyStateCounts } from "./partyState";

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

export type EventWarpDestination = {
  x: number;
  y: number;
  direction?: string;
};

export type EventHostDebug = {
  running: boolean;
  currentEffectKind?: EventEffectKind;
  effectsDispatched: number;
  records: {
    warps: number;
    warpNoops: number;
    battles: number;
    battleNoops: number;
    audio: number;
    lastWarpDest?: number;
    lastTeleportStyle?: number;
    lastBattleGroup?: number;
    lastAudioKind?: "music" | "sound" | "musicEffect";
  };
};

export type RuntimeEventHostOptions = {
  dialogue: DialogueController;
  flags: GameFlags;
  partyState: PartyState;
  scene?: FadeScene;
  resolveWarpDestination?: (dest: number, style?: number) => EventWarpDestination | undefined;
  applyWarpDestination?: (destination: EventWarpDestination) => void;
  startBattle?: (group: number) => boolean;
};

export type EventSequenceOptions = {
  onComplete?: () => void;
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

export class RuntimeEventHost implements EventExecutorHost {
  private executor?: EventExecutor;
  private readonly coveredConfirmIndexes = new Set<number>();
  private debugState: EventHostDebug = emptyDebug();
  private transitionRequested = false;

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

  begin(executor: EventExecutor): void {
    this.executor = executor;
    this.coveredConfirmIndexes.clear();
    this.transitionRequested = false;
    this.debugState = { ...emptyDebug(), running: true };
  }

  finish(): void {
    this.debugState = {
      ...this.debugState,
      running: false,
      currentEffectKind: undefined
    };
    this.transitionRequested = false;
    this.executor = undefined;
    this.coveredConfirmIndexes.clear();
  }

  recordEffect(effect: EventEffect): void {
    this.debugState = {
      ...this.debugState,
      currentEffectKind: effect.kind,
      effectsDispatched: this.executor?.dispatchedEffects.length ?? this.debugState.effectsDispatched
    };
  }

  debug(): EventHostDebug {
    return {
      ...this.debugState,
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
    this.options.flags.setNum(flag);
  }

  unsetFlag(flag: number): void {
    this.options.flags.unsetNum(flag);
  }

  give(char: number, item: number): void {
    this.options.partyState.give(char, item);
  }

  take(char: number, item: number): void {
    this.options.partyState.take(char, item);
  }

  money(op: "give" | "take", amount: number): void {
    this.options.partyState.applyMoney(op, amount);
  }

  party(op: "add" | "remove", char: number): void {
    this.options.partyState.partyOp(op, char);
  }

  warp(dest: number): void {
    this.applyWarp(dest);
  }

  teleport(dest: number, style: number): void {
    this.applyWarp(dest, style);
  }

  anchorWarp(): void {
    this.recordWarpNoop(undefined);
  }

  startBattle(group: number): void {
    const started = this.options.startBattle?.(group) ?? false;
    this.debugState.records = {
      ...this.debugState.records,
      battles: this.debugState.records.battles + 1,
      battleNoops: this.debugState.records.battleNoops + (started ? 0 : 1),
      lastBattleGroup: group
    };
    this.transitionRequested = started;
  }

  music(effect: Extract<EventEffect, { kind: "music" }>): void {
    // Audio playback is Phase 7; this slice records calls for debug only.
    void effect;
    this.recordAudio("music");
  }

  sound(): void {
    this.recordAudio("sound");
  }

  musicEffect(): void {
    this.recordAudio("musicEffect");
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
    const pages = dialoguePagesForConfirmEffects(effects, index);
    for (let next = index; next < effects.length && isConfirmEffect(effects[next]); next += 1) {
      this.coveredConfirmIndexes.add(next);
    }
    this.options.dialogue.start(pages);
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
    this.fade();
    this.options.applyWarpDestination(destination);
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
}

export class RuntimeEventSequence {
  private executor?: EventExecutor;
  private onComplete?: () => void;

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
    this.host.begin(executor);
    this.pump();
    return true;
  }

  confirm(): void {
    if (!this.running) {
      return;
    }
    this.pump({ confirm: true });
  }

  update(deltaMs: number): void {
    if (!this.running) {
      return;
    }
    this.pump({ frames: deltaMs / (1000 / 60) });
  }

  abort(): void {
    if (!this.running) {
      return;
    }
    this.executor = undefined;
    this.host.finish();
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
      this.finish();
      return false;
    }
    if ("effect" in result) {
      this.host.recordEffect(result.effect);
      if (this.host.consumeTransitionRequested()) {
        this.finish();
        return false;
      }
    }
    if (!result.wait) {
      return true;
    }
    if (result.wait.kind === "confirm" && this.host.shouldAutoConfirmCurrentWait()) {
      this.pump({ confirm: true });
    }
    return false;
  }

  private finish(): void {
    const onComplete = this.onComplete;
    this.executor = undefined;
    this.onComplete = undefined;
    this.host.finish();
    onComplete?.();
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
    records: {
      warps: 0,
      warpNoops: 0,
      battles: 0,
      battleNoops: 0,
      audio: 0
    }
  };
}
