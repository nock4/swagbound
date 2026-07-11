import { hpMeterDigitsPerSecondForDelta } from "./ebTiming";

type RollingMeterRateMode = "earthboundHpPp" | "fixed";

export type RollingMeterState = {
  displayed: number;
  target: number;
  ratePerSec: number;
  isRolling: boolean;
  stepRemainder: number;
  rateMode?: RollingMeterRateMode;
};

export type SurviveFatalBlowWindowOptions = {
  initialDisplayed: number;
  ratePerSec: number;
  elapsedBeforeRescueMs: number;
  rescueTarget: number;
};

export function createRollingMeter(displayed: number): RollingMeterState {
  return createMeter(displayed, hpMeterDigitsPerSecondForDelta(1), "earthboundHpPp");
}

export function createFixedRollingMeter(displayed: number, ratePerSec: number): RollingMeterState {
  return createMeter(displayed, ratePerSec, "fixed");
}

function createMeter(displayed: number, ratePerSec: number, rateMode: RollingMeterRateMode): RollingMeterState {
  const value = clampHp(displayed);
  return {
    displayed: value,
    target: value,
    ratePerSec: normalizeRate(ratePerSec),
    isRolling: false,
    stepRemainder: 0,
    rateMode
  };
}

export function setTarget(state: RollingMeterState, target: number): RollingMeterState {
  const nextTarget = clampHp(target);
  const delta = nextTarget === state.target ? nextTarget - state.displayed : nextTarget - state.target;
  return {
    ...state,
    target: nextTarget,
    ratePerSec: state.rateMode === "fixed" ? state.ratePerSec : hpMeterDigitsPerSecondForDelta(delta),
    isRolling: state.displayed !== nextTarget,
    stepRemainder: 0
  };
}

export function tick(state: RollingMeterState, dtMs: number): RollingMeterState {
  if (!state.isRolling || state.displayed === state.target || dtMs <= 0) {
    return {
      ...state,
      isRolling: state.displayed !== state.target
    };
  }

  const distance = state.target - state.displayed;
  const direction = Math.sign(distance);
  const stepsFloat = state.stepRemainder + (state.ratePerSec * dtMs) / 1000;
  const steps = Math.floor(stepsFloat);
  if (steps <= 0) {
    return {
      ...state,
      stepRemainder: stepsFloat,
      isRolling: true
    };
  }

  const move = Math.min(Math.abs(distance), steps) * direction;
  const displayed = state.displayed + move;
  const reachedTarget = displayed === state.target;
  return {
    ...state,
    displayed,
    isRolling: !reachedTarget,
    stepRemainder: reachedTarget ? 0 : stepsFloat - steps
  };
}

export function isDepleted(state: Pick<RollingMeterState, "displayed">): boolean {
  return state.displayed <= 0;
}

export function survivesFatalBlowWindow(options: SurviveFatalBlowWindowOptions): boolean {
  const fatal = setTarget(createFixedRollingMeter(options.initialDisplayed, options.ratePerSec), 0);
  const beforeRescue = tick(fatal, options.elapsedBeforeRescueMs);
  const rescued = setTarget(beforeRescue, options.rescueTarget);
  return !isDepleted(rescued);
}

function clampHp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeRate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return hpMeterDigitsPerSecondForDelta(1);
  }
  return value;
}
