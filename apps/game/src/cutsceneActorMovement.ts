import { facingToward } from "./npcController";
import {
  WALK_FRAME_MS,
  type DirectionFrameSequence,
  type PlayerState
} from "./playerController";

export function advanceCutsceneActorTowardTarget(
  state: PlayerState,
  target: { x: number; y: number },
  options: {
    deltaMs: number;
    speed: number;
    bounds: { minX: number; maxX: number; minY: number; maxY: number };
    frames: DirectionFrameSequence;
    arrivalPx: number;
  }
): boolean {
  const dx = target.x - state.x;
  const dy = target.y - state.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= options.arrivalPx) {
    setCutsceneActorIdleAt(state, target, options.frames);
    return true;
  }

  const step = Math.min(distance, (options.speed * Math.max(0, options.deltaMs)) / 1000);
  if (step <= 0) {
    state.velocityX = 0;
    state.velocityY = 0;
    state.moving = false;
    state.animKey = `idle-${state.facing}`;
    state.animFrame = options.frames[state.facing][0];
    return false;
  }

  const unitX = dx / distance;
  const unitY = dy / distance;
  state.facing = facingToward(state.x, state.y, target.x, target.y);
  state.x = clamp(state.x + unitX * step, options.bounds.minX, options.bounds.maxX);
  state.y = clamp(state.y + unitY * step, options.bounds.minY, options.bounds.maxY);

  const remaining = Math.hypot(target.x - state.x, target.y - state.y);
  if (remaining <= options.arrivalPx) {
    setCutsceneActorIdleAt(state, target, options.frames);
    return true;
  }

  state.velocityX = unitX * options.speed;
  state.velocityY = unitY * options.speed;
  state.moving = true;
  state.walkClockMs += Math.max(0, options.deltaMs);
  const sequence = options.frames[state.facing];
  state.animKey = `walk-${state.facing}`;
  state.animFrame = sequence[Math.floor(state.walkClockMs / WALK_FRAME_MS) % sequence.length];
  return false;
}

function setCutsceneActorIdleAt(
  state: PlayerState,
  target: { x: number; y: number },
  frames: DirectionFrameSequence
): void {
  state.x = target.x;
  state.y = target.y;
  state.velocityX = 0;
  state.velocityY = 0;
  state.moving = false;
  state.walkClockMs = 0;
  state.animKey = `idle-${state.facing}`;
  state.animFrame = frames[state.facing][0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
