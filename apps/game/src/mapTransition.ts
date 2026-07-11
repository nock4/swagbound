import screenTransitionTruth from "../../../content/rom-truth/screen-transitions.json";

export const EB_TRANSITION_FPS = 60;
export const EB_FRAME_MS = 1000 / EB_TRANSITION_FPS;
export const STANDARD_EB_TRANSITION_ID = 1;

export type TransitionKind = "door" | "stairway" | "escalator" | "teleport";
export type DoorTransitionType = Exclude<TransitionKind, "teleport">;
export type MapTransitionPhase = "idle" | "fadeOut" | "hold" | "fadeIn" | "done";
export type ActiveMapTransitionPhase = Exclude<MapTransitionPhase, "idle" | "done">;
export type MapTransitionEffect = "instant" | "fade" | "wipe";

type ScreenTransitionEntry = {
  duration: number;
  animId: number;
  animFlags: number;
  fadeStyle: number;
  direction: number;
  slideSpeed: number;
  sfxBegin: string;
  secDuration: number;
  secAnimId: number;
  secAnimFlags: number;
  sfxEnd: string;
};

type ScreenTransitionTruth = {
  transitions: ScreenTransitionEntry[];
};

export type EbMapTransitionConfig = {
  id: number;
  durationFrames: number;
  durationMs: number;
  animId: number;
  animFlags: number;
  fadeStyle: number;
  direction: number;
  slideSpeed: number;
  sfxBegin: string;
  secondaryDurationFrames: number;
  secondaryDurationMs: number;
  secondaryAnimId: number;
  secondaryAnimFlags: number;
  sfxEnd: string;
  effect: MapTransitionEffect;
};

export type MapTransitionState = {
  phase: MapTransitionPhase;
  kind?: TransitionKind;
  style?: number;
  configId?: number;
  elapsedMs: number;
  totalElapsedMs: number;
};

export type MapTransitionEvent =
  | { type: "start"; kind: TransitionKind }
  | { type: "swap" }
  | { type: "arrive"; kind: TransitionKind }
  | { type: "complete" };

export type TransitionSfxCue = "doorOpen" | "doorClose" | "footsteps" | "escalatorHum" | "whoosh";

export type MapTransitionOverlayState =
  | { effect: "none" }
  | { effect: "fade"; alpha: number }
  | { effect: "wipe"; coverage: number; direction: number; slideSpeed: number };

export type MapTransitionAdvance = {
  state: MapTransitionState;
  events: MapTransitionEvent[];
};

const RAW_SCREEN_TRANSITIONS = (screenTransitionTruth as ScreenTransitionTruth).transitions;
const EB_TRANSITION_CONFIGS: EbMapTransitionConfig[] = RAW_SCREEN_TRANSITIONS.map((entry, id) => ({
  id,
  durationFrames: entry.duration,
  durationMs: framesToMs(entry.duration),
  animId: entry.animId,
  animFlags: entry.animFlags,
  fadeStyle: entry.fadeStyle,
  direction: entry.direction,
  slideSpeed: entry.slideSpeed,
  sfxBegin: entry.sfxBegin,
  secondaryDurationFrames: entry.secDuration,
  secondaryDurationMs: framesToMs(entry.secDuration),
  secondaryAnimId: entry.secAnimId,
  secondaryAnimFlags: entry.secAnimFlags,
  sfxEnd: entry.sfxEnd,
  effect: transitionEffectForEntry(entry)
}));

export const FADE_OUT_MS = transitionConfigForStyle(STANDARD_EB_TRANSITION_ID).durationMs;
export const BLACK_HOLD_MS = 0;
export const FADE_IN_MS = transitionConfigForStyle(STANDARD_EB_TRANSITION_ID).secondaryDurationMs;

export function idleMapTransition(): MapTransitionState {
  return { phase: "idle", elapsedMs: 0, totalElapsedMs: 0 };
}

export function beginMapTransition(kind: TransitionKind, style?: number): MapTransitionAdvance {
  const config = transitionConfigForStyle(style);
  if (config.effect === "instant") {
    return {
      state: { phase: "done", kind, style, configId: config.id, elapsedMs: 0, totalElapsedMs: 0 },
      events: []
    };
  }
  return {
    state: { phase: "fadeOut", kind, style, configId: config.id, elapsedMs: 0, totalElapsedMs: 0 },
    events: [{ type: "start", kind }]
  };
}

export function advanceMapTransition(state: MapTransitionState, deltaMs: number): MapTransitionAdvance {
  if (!isMapTransitionActive(state)) {
    return { state, events: [] };
  }

  let next: MapTransitionState = { ...state };
  let remainingMs = normalizeDeltaMs(deltaMs);
  const events: MapTransitionEvent[] = [];

  while (remainingMs > 0 && isMapTransitionActive(next)) {
    const phase = next.phase;
    const kind = next.kind;
    const duration = phaseDurationMs(phase, next);
    const phaseRemainingMs = Math.max(0, duration - next.elapsedMs);

    if (remainingMs < phaseRemainingMs) {
      next = {
        ...next,
        elapsedMs: next.elapsedMs + remainingMs,
        totalElapsedMs: next.totalElapsedMs + remainingMs
      };
      remainingMs = 0;
      break;
    }

    next = {
      ...next,
      elapsedMs: duration,
      totalElapsedMs: next.totalElapsedMs + phaseRemainingMs
    };
    remainingMs -= phaseRemainingMs;

    switch (phase) {
      case "fadeOut":
        next = { ...next, phase: "hold", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "swap" });
        break;
      case "hold":
        next = { ...next, phase: "fadeIn", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "arrive", kind });
        break;
      case "fadeIn":
        next = { ...next, phase: "done", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "complete" });
        break;
    }
  }

  return { state: next, events };
}

export function transitionOverlayAlpha(state: MapTransitionState): number {
  const overlay = transitionOverlayState(state);
  if (overlay.effect === "fade") {
    return overlay.alpha;
  }
  if (overlay.effect === "wipe") {
    return overlay.coverage;
  }
  return 0;
}

export function transitionOverlayState(state: MapTransitionState): MapTransitionOverlayState {
  if (!isMapTransitionActive(state)) {
    return { effect: "none" };
  }
  const config = transitionConfigForState(state);
  const coverage = transitionCoverage(state, config);
  if (config.effect === "wipe") {
    return {
      effect: "wipe",
      coverage,
      direction: config.direction,
      slideSpeed: config.slideSpeed
    };
  }
  if (config.effect === "fade") {
    return { effect: "fade", alpha: coverage };
  }
  return { effect: "none" };
}

export function isMapTransitionActive(state: MapTransitionState): state is MapTransitionState & {
  phase: ActiveMapTransitionPhase;
  kind: TransitionKind;
} {
  return state.phase === "fadeOut" || state.phase === "hold" || state.phase === "fadeIn";
}

export function transitionKindForDoorType(type: DoorTransitionType): TransitionKind {
  return type;
}

export function transitionSfxCueForEvent(event: MapTransitionEvent): TransitionSfxCue | undefined {
  if (event.type === "start") {
    switch (event.kind) {
      case "door":
        return "doorOpen";
      case "stairway":
        return "footsteps";
      case "escalator":
        return "escalatorHum";
      case "teleport":
        return "whoosh";
    }
  }
  if (event.type === "arrive" && event.kind === "door") {
    return "doorClose";
  }
  return undefined;
}

export function phaseDurationMs(
  phase: ActiveMapTransitionPhase,
  state?: Pick<MapTransitionState, "configId">
): number {
  const config = transitionConfigForState(state);
  switch (phase) {
    case "fadeOut":
      return config.durationMs;
    case "hold":
      return 0;
    case "fadeIn":
      return config.secondaryDurationMs;
  }
}

export function framesToMs(frames: number): number {
  return Math.max(0, frames) * EB_FRAME_MS;
}

export function transitionConfigForStyle(style: number | undefined): EbMapTransitionConfig {
  if (typeof style === "number" && Number.isInteger(style) && style >= 0) {
    const config = EB_TRANSITION_CONFIGS[style];
    if (config) {
      return config;
    }
  }
  return EB_TRANSITION_CONFIGS[STANDARD_EB_TRANSITION_ID];
}

export function transitionEffectForConfig(style: number | undefined): MapTransitionEffect {
  return transitionConfigForStyle(style).effect;
}

function normalizeDeltaMs(deltaMs: number): number {
  return Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
}

function transitionConfigForState(state?: Pick<MapTransitionState, "configId">): EbMapTransitionConfig {
  return transitionConfigForStyle(state?.configId);
}

function transitionCoverage(state: MapTransitionState, config: EbMapTransitionConfig): number {
  switch (state.phase) {
    case "fadeOut":
      return progressForDuration(state.elapsedMs, config.durationMs, 1);
    case "hold":
      return 1;
    case "fadeIn":
      return 1 - progressForDuration(state.elapsedMs, config.secondaryDurationMs, 1);
    default:
      return 0;
  }
}

function progressForDuration(elapsedMs: number, durationMs: number, zeroDurationValue: number): number {
  if (durationMs <= 0) {
    return zeroDurationValue;
  }
  return clamp01(elapsedMs / durationMs);
}

function transitionEffectForEntry(entry: ScreenTransitionEntry): MapTransitionEffect {
  if (entry.duration <= 0 && entry.secDuration <= 0) {
    return "instant";
  }
  if (entry.slideSpeed > 0 || entry.direction !== 0) {
    return "wipe";
  }
  return "fade";
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
