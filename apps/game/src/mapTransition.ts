export const FADE_OUT_MS = 300;
export const BLACK_HOLD_MS = 700;
export const FADE_IN_MS = 300;

export type TransitionKind = "door" | "stairway" | "escalator" | "teleport";
export type DoorTransitionType = Exclude<TransitionKind, "teleport">;
export type MapTransitionPhase = "idle" | "fadeOut" | "hold" | "fadeIn" | "done";
export type ActiveMapTransitionPhase = Exclude<MapTransitionPhase, "idle" | "done">;

export type MapTransitionState = {
  phase: MapTransitionPhase;
  kind?: TransitionKind;
  elapsedMs: number;
  totalElapsedMs: number;
};

export type MapTransitionEvent =
  | { type: "start"; kind: TransitionKind }
  | { type: "swap" }
  | { type: "arrive"; kind: TransitionKind }
  | { type: "complete" };

export type TransitionSfxCue = "doorOpen" | "doorClose" | "footsteps" | "escalatorHum" | "whoosh";

export type MapTransitionAdvance = {
  state: MapTransitionState;
  events: MapTransitionEvent[];
};

const PHASE_DURATIONS: Record<ActiveMapTransitionPhase, number> = {
  fadeOut: FADE_OUT_MS,
  hold: BLACK_HOLD_MS,
  fadeIn: FADE_IN_MS
};

export function idleMapTransition(): MapTransitionState {
  return { phase: "idle", elapsedMs: 0, totalElapsedMs: 0 };
}

export function beginMapTransition(kind: TransitionKind): MapTransitionAdvance {
  return {
    state: { phase: "fadeOut", kind, elapsedMs: 0, totalElapsedMs: 0 },
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
    const duration = phaseDurationMs(phase);
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
        next = { phase: "hold", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "swap" });
        break;
      case "hold":
        next = { phase: "fadeIn", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "arrive", kind });
        break;
      case "fadeIn":
        next = { phase: "done", kind, elapsedMs: 0, totalElapsedMs: next.totalElapsedMs };
        events.push({ type: "complete" });
        break;
    }
  }

  return { state: next, events };
}

export function transitionOverlayAlpha(state: MapTransitionState): number {
  if (!isMapTransitionActive(state)) {
    return 0;
  }
  switch (state.phase) {
    case "fadeOut":
      return clamp01(state.elapsedMs / FADE_OUT_MS);
    case "hold":
      return 1;
    case "fadeIn":
      return clamp01(1 - state.elapsedMs / FADE_IN_MS);
  }
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

export function phaseDurationMs(phase: ActiveMapTransitionPhase): number {
  return PHASE_DURATIONS[phase];
}

function normalizeDeltaMs(deltaMs: number): number {
  return Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
