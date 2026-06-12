/**
 * Pure player/actor movement, facing, and animation state machine.
 *
 * No Phaser dependency: the scene feeds in input + collision callbacks and
 * applies the resulting position/frame to its sprite. This keeps every
 * direction/facing/animation decision in one unit-testable place.
 *
 * Frame layout of CoilSnake sprite-group sheets (4 columns of frames,
 * two walk frames per facing). The pair order matches the order CoilSnake
 * decompiles sprite groups in (CoilSnake sprites.py SPRITE_COMPILATION_ORDER,
 * inverted): N, E, S, W, NE, SE, SW, NW. Verified visually against the
 * locally rendered sheets for groups 1 and 5:
 *   frames  0-1  walk up      frames  8-9  walk up-right
 *   frames  2-3  walk right   frames 10-11 walk down-right
 *   frames  4-5  walk down    frames 12-13 walk down-left
 *   frames  6-7  walk left    frames 14-15 walk up-left
 * The runtime renders cardinal facings only; diagonal movement resolves to a
 * cardinal facing (see resolveFacing).
 */

export type Facing = "up" | "down" | "left" | "right";

export type DirectionFrames = Record<Facing, [number, number]>;

export const CANONICAL_DIRECTION_FRAMES: DirectionFrames = {
  up: [0, 1],
  right: [2, 3],
  down: [4, 5],
  left: [6, 7]
};

export const WALK_FRAME_MS = 150;

export type MoveInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export const IDLE_INPUT: MoveInput = { up: false, down: false, left: false, right: false };

export type PlayerState = {
  x: number;
  y: number;
  /** World pixels per second, post collision intent (0 while locked/idle). */
  velocityX: number;
  velocityY: number;
  facing: Facing;
  moving: boolean;
  /** True while dialogue (or any future cutscene) owns the input. */
  inputLocked: boolean;
  /** Accumulated walking time driving the two-frame step cycle. */
  walkClockMs: number;
  /** e.g. "walk-left" / "idle-down" — stable identifier for tests and debug. */
  animKey: string;
  /** Current sheet frame index. */
  animFrame: number;
};

export type StepOptions = {
  deltaMs: number;
  /** World pixels per second. */
  speed: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Feet-position collision test in world pixels. */
  blocked: (x: number, y: number) => boolean;
  frames?: DirectionFrames;
  walkFrameMs?: number;
};

export function createPlayerState(
  x: number,
  y: number,
  facing: Facing = "down",
  frames: DirectionFrames = CANONICAL_DIRECTION_FRAMES
): PlayerState {
  return {
    x,
    y,
    velocityX: 0,
    velocityY: 0,
    facing,
    moving: false,
    inputLocked: false,
    walkClockMs: 0,
    animKey: `idle-${facing}`,
    animFrame: frames[facing][0]
  };
}

/** Normalizes any direction string from generated data to a Facing. */
export function toFacing(direction: string | undefined, fallback: Facing = "down"): Facing {
  switch ((direction ?? "").toLowerCase()) {
    case "up":
    case "north":
      return "up";
    case "down":
    case "south":
      return "down";
    case "left":
    case "west":
      return "left";
    case "right":
    case "east":
      return "right";
    default:
      return fallback;
  }
}

/**
 * Facing rule:
 * - One active axis: face that direction.
 * - Diagonal: keep the current facing when it still matches one of the held
 *   directions (no flicker while the same keys stay down); otherwise prefer
 *   the horizontal component.
 * - No movement (or opposing keys cancelling out): keep the current facing.
 */
export function resolveFacing(current: Facing, dx: number, dy: number): Facing {
  if (dx === 0 && dy === 0) {
    return current;
  }
  if (dx !== 0 && dy === 0) {
    return dx > 0 ? "right" : "left";
  }
  if (dy !== 0 && dx === 0) {
    return dy > 0 ? "down" : "up";
  }
  const matchesCurrent =
    (current === "right" && dx > 0) ||
    (current === "left" && dx < 0) ||
    (current === "down" && dy > 0) ||
    (current === "up" && dy < 0);
  if (matchesCurrent) {
    return current;
  }
  return dx > 0 ? "right" : "left";
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Advances one frame of movement + animation. Mutates and returns `state`.
 * Collision is resolved per axis so the player slides along walls instead of
 * sticking. While inputLocked, the player idles at the current facing.
 */
export function stepPlayer(state: PlayerState, input: MoveInput, options: StepOptions): PlayerState {
  const frames = options.frames ?? CANONICAL_DIRECTION_FRAMES;
  const walkFrameMs = options.walkFrameMs ?? WALK_FRAME_MS;

  const dx = state.inputLocked ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = state.inputLocked ? 0 : (input.down ? 1 : 0) - (input.up ? 1 : 0);
  state.moving = dx !== 0 || dy !== 0;

  if (!state.moving) {
    state.velocityX = 0;
    state.velocityY = 0;
    state.walkClockMs = 0;
    state.animKey = `idle-${state.facing}`;
    state.animFrame = frames[state.facing][0];
    return state;
  }

  state.facing = resolveFacing(state.facing, dx, dy);

  const scale = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
  state.velocityX = dx * scale * options.speed;
  state.velocityY = dy * scale * options.speed;
  const step = (options.speed * options.deltaMs) / 1000;

  const tryX = clamp(state.x + dx * scale * step, options.bounds.minX, options.bounds.maxX);
  if (!options.blocked(tryX, state.y)) {
    state.x = tryX;
  } else {
    state.velocityX = 0;
  }
  const tryY = clamp(state.y + dy * scale * step, options.bounds.minY, options.bounds.maxY);
  if (!options.blocked(state.x, tryY)) {
    state.y = tryY;
  } else {
    state.velocityY = 0;
  }

  state.walkClockMs += options.deltaMs;
  const pair = frames[state.facing];
  state.animKey = `walk-${state.facing}`;
  state.animFrame = pair[Math.floor(state.walkClockMs / walkFrameMs) % 2];
  return state;
}

/** Locks input (dialogue/cutscene) and freezes the actor on its idle frame. */
export function lockPlayer(state: PlayerState, frames: DirectionFrames = CANONICAL_DIRECTION_FRAMES): PlayerState {
  state.inputLocked = true;
  state.moving = false;
  state.velocityX = 0;
  state.velocityY = 0;
  state.walkClockMs = 0;
  state.animKey = `idle-${state.facing}`;
  state.animFrame = frames[state.facing][0];
  return state;
}

export function unlockPlayer(state: PlayerState): PlayerState {
  state.inputLocked = false;
  return state;
}

export type InteractionCandidate = {
  id: number;
  /** Feet position in the same pixel space as the player state. */
  x: number;
  y: number;
  interactable: boolean;
};

export type InteractionOptions = {
  /** Maximum feet-to-feet distance, world pixels. */
  maxDistance?: number;
  /** Required forward component along the facing axis (rules out "behind"). */
  minForward?: number;
  /** Allowed sideways offset from the facing axis. */
  maxLateral?: number;
};

export const INTERACTION_DEFAULTS: Required<InteractionOptions> = {
  maxDistance: 28,
  minForward: 2,
  maxLateral: 16
};

export type InteractionTarget = {
  candidate: InteractionCandidate;
  distance: number;
  /** Positive distance in front of the player along the facing axis. */
  forward: number;
  /** Absolute sideways offset from the facing axis. */
  lateral: number;
};

/** Decomposes the player→candidate vector into facing-relative axes. */
function facingComponents(facing: Facing, dx: number, dy: number): { forward: number; lateral: number } {
  switch (facing) {
    case "right":
      return { forward: dx, lateral: Math.abs(dy) };
    case "left":
      return { forward: -dx, lateral: Math.abs(dy) };
    case "down":
      return { forward: dy, lateral: Math.abs(dx) };
    case "up":
      return { forward: -dy, lateral: Math.abs(dx) };
  }
}

/**
 * Facing-aware interaction: the target must be interactable, close enough,
 * in front of the player (positive forward component), and roughly on the
 * facing axis. When several candidates qualify, the nearest one in front
 * wins (forward distance, then lateral offset).
 */
export function findInteractionTarget(
  state: Pick<PlayerState, "x" | "y" | "facing">,
  candidates: InteractionCandidate[],
  options: InteractionOptions = {}
): InteractionTarget | undefined {
  const { maxDistance, minForward, maxLateral } = { ...INTERACTION_DEFAULTS, ...options };
  let best: InteractionTarget | undefined;
  for (const candidate of candidates) {
    if (!candidate.interactable) {
      continue;
    }
    const dx = candidate.x - state.x;
    const dy = candidate.y - state.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxDistance) {
      continue;
    }
    const { forward, lateral } = facingComponents(state.facing, dx, dy);
    if (forward < minForward || lateral > maxLateral) {
      continue;
    }
    if (!best || forward < best.forward || (forward === best.forward && lateral < best.lateral)) {
      best = { candidate, distance, forward, lateral };
    }
  }
  return best;
}

/** Nearest interactable candidate by radius only (for "turn around" hints). */
export function nearestInteractable(
  state: Pick<PlayerState, "x" | "y">,
  candidates: InteractionCandidate[],
  maxDistance = INTERACTION_DEFAULTS.maxDistance
): { candidate: InteractionCandidate; distance: number } | undefined {
  let best: { candidate: InteractionCandidate; distance: number } | undefined;
  for (const candidate of candidates) {
    if (!candidate.interactable) {
      continue;
    }
    const distance = Math.hypot(candidate.x - state.x, candidate.y - state.y);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { candidate, distance };
    }
  }
  return best;
}
