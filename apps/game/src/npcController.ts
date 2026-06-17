import {
  CANONICAL_DIRECTION_FRAMES,
  IDLE_INPUT,
  createPlayerState,
  stepPlayer,
  type DirectionFrameSequence,
  type Facing,
  type MoveInput,
  type PlayerState
} from "./playerController";

export type NpcBehavior =
  | { kind: "static" }
  | { kind: "patrol"; axis: "x" | "y"; rangePx: number; speedPxPerSec: number }
  | { kind: "wander"; radiusPx: number; speedPxPerSec: number; seed: number; stepMs?: number };

export type NpcRuntimeState = {
  player: PlayerState;
  behavior: NpcBehavior;
  patrolOriginX: number;
  patrolOriginY: number;
  patrolDirection: -1 | 1;
  wanderStepIndex: number;
  wanderElapsedMs: number;
  paused: boolean;
  homeFacing: Facing;
};

export type NpcStepOptions = {
  deltaMs: number;
  blocked: (x: number, y: number) => boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  frames?: DirectionFrameSequence;
};

const EPSILON = 0.000001;
// Slow enough to read as EarthBound-style wandering instead of frame jitter.
const DEFAULT_WANDER_STEP_MS = 1200;
const WANDER_DIRECTION_ORDERS: ReadonlyArray<readonly Facing[]> = [
  ["up", "right", "down", "left"],
  ["right", "down", "left", "up"],
  ["down", "left", "up", "right"],
  ["left", "up", "right", "down"]
];

export function createNpcState(
  x: number,
  y: number,
  facing: Facing,
  behavior: NpcBehavior,
  frames: DirectionFrameSequence = CANONICAL_DIRECTION_FRAMES
): NpcRuntimeState {
  return {
    player: createPlayerState(x, y, facing, frames),
    behavior,
    patrolOriginX: x,
    patrolOriginY: y,
    patrolDirection: initialPatrolDirection(behavior, facing),
    wanderStepIndex: initialWanderStepIndex(behavior),
    wanderElapsedMs: 0,
    paused: false,
    homeFacing: facing
  };
}

export function stepNpc(state: NpcRuntimeState, options: NpcStepOptions): NpcRuntimeState {
  const frames = options.frames ?? CANONICAL_DIRECTION_FRAMES;
  if (state.paused || state.behavior.kind === "static") {
    stepPlayer(state.player, IDLE_INPUT, {
      deltaMs: options.deltaMs,
      speed: 0,
      bounds: options.bounds,
      blocked: options.blocked,
      frames
    });
    return state;
  }

  const behavior = state.behavior;
  if (behavior.kind === "wander") {
    stepWander(state, behavior, options, frames);
    return state;
  }

  normalizePatrolDirectionAtEdge(state);
  const beforeX = state.player.x;
  const beforeY = state.player.y;
  const input = patrolInput(behavior.axis, state.patrolDirection);

  stepPlayer(state.player, input, {
    deltaMs: options.deltaMs,
    speed: behavior.speedPxPerSec,
    bounds: patrolBounds(state, behavior, options.bounds),
    blocked: options.blocked,
    frames
  });

  const before = behavior.axis === "x" ? beforeX : beforeY;
  const after = behavior.axis === "x" ? state.player.x : state.player.y;
  const origin = behavior.axis === "x" ? state.patrolOriginX : state.patrolOriginY;
  const min = origin - behavior.rangePx;
  const max = origin + behavior.rangePx;
  const reachedLowerEnd = state.patrolDirection < 0 && after <= min + EPSILON;
  const reachedUpperEnd = state.patrolDirection > 0 && after >= max - EPSILON;
  const blockedWithoutMoving = Math.abs(after - before) <= EPSILON;

  if (reachedLowerEnd || reachedUpperEnd || blockedWithoutMoving) {
    state.patrolDirection = state.patrolDirection === 1 ? -1 : 1;
  }
  return state;
}

export function facingToward(fromX: number, fromY: number, toX: number, toY: number): Facing {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }
  return dy < 0 ? "up" : "down";
}

function initialPatrolDirection(behavior: NpcBehavior, facing: Facing): -1 | 1 {
  if (behavior.kind !== "patrol") {
    return 1;
  }
  if (behavior.axis === "x") {
    return facing === "left" ? -1 : 1;
  }
  return facing === "up" ? -1 : 1;
}

function initialWanderStepIndex(behavior: NpcBehavior): number {
  return behavior.kind === "wander" ? behavior.seed % 4 : 0;
}

function normalizePatrolDirectionAtEdge(state: NpcRuntimeState): void {
  if (state.behavior.kind !== "patrol") {
    return;
  }
  const behavior = state.behavior;
  const position = behavior.axis === "x" ? state.player.x : state.player.y;
  const origin = behavior.axis === "x" ? state.patrolOriginX : state.patrolOriginY;
  if (position <= origin - behavior.rangePx + EPSILON && state.patrolDirection < 0) {
    state.patrolDirection = 1;
  } else if (position >= origin + behavior.rangePx - EPSILON && state.patrolDirection > 0) {
    state.patrolDirection = -1;
  }
}

function stepWander(
  state: NpcRuntimeState,
  behavior: Extract<NpcBehavior, { kind: "wander" }>,
  options: NpcStepOptions,
  frames: DirectionFrameSequence
): void {
  const stepMs = behavior.stepMs ?? DEFAULT_WANDER_STEP_MS;
  state.wanderElapsedMs += options.deltaMs;
  if (state.wanderElapsedMs >= stepMs) {
    state.wanderStepIndex += Math.floor(state.wanderElapsedMs / stepMs);
    state.wanderElapsedMs %= stepMs;
  }

  const input = facingInput(wanderFacing(behavior.seed, state.wanderStepIndex));
  stepPlayer(state.player, input, {
    deltaMs: options.deltaMs,
    speed: behavior.speedPxPerSec,
    bounds: wanderBounds(state, behavior, options.bounds),
    blocked: options.blocked,
    frames
  });
}

function patrolInput(axis: "x" | "y", sign: -1 | 1): MoveInput {
  return {
    left: axis === "x" && sign < 0,
    right: axis === "x" && sign > 0,
    up: axis === "y" && sign < 0,
    down: axis === "y" && sign > 0
  };
}

function facingInput(facing: Facing): MoveInput {
  return {
    left: facing === "left",
    right: facing === "right",
    up: facing === "up",
    down: facing === "down"
  };
}

function wanderFacing(seed: number, stepIndex: number): Facing {
  const order = WANDER_DIRECTION_ORDERS[seed % WANDER_DIRECTION_ORDERS.length] ?? WANDER_DIRECTION_ORDERS[0];
  return order[stepIndex % order.length];
}

function patrolBounds(
  state: NpcRuntimeState,
  behavior: Extract<NpcBehavior, { kind: "patrol" }>,
  bounds: NpcStepOptions["bounds"]
): NpcStepOptions["bounds"] {
  if (behavior.axis === "x") {
    return {
      ...bounds,
      minX: Math.max(bounds.minX, state.patrolOriginX - behavior.rangePx),
      maxX: Math.min(bounds.maxX, state.patrolOriginX + behavior.rangePx)
    };
  }
  return {
    ...bounds,
    minY: Math.max(bounds.minY, state.patrolOriginY - behavior.rangePx),
    maxY: Math.min(bounds.maxY, state.patrolOriginY + behavior.rangePx)
  };
}

function wanderBounds(
  state: NpcRuntimeState,
  behavior: Extract<NpcBehavior, { kind: "wander" }>,
  bounds: NpcStepOptions["bounds"]
): NpcStepOptions["bounds"] {
  return {
    minX: Math.max(bounds.minX, state.patrolOriginX - behavior.radiusPx),
    maxX: Math.min(bounds.maxX, state.patrolOriginX + behavior.radiusPx),
    minY: Math.max(bounds.minY, state.patrolOriginY - behavior.radiusPx),
    maxY: Math.min(bounds.maxY, state.patrolOriginY + behavior.radiusPx)
  };
}
