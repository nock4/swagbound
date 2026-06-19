import type { StoryBarrier, StoryTrigger, StoryTriggerArea } from "@eb/schemas";

/** True when a point (the player's feet) is inside a trigger area (world pixels). */
export function pointInArea(point: { x: number; y: number }, area: StoryTriggerArea): boolean {
  return (
    point.x >= area.x &&
    point.x < area.x + area.w &&
    point.y >= area.y &&
    point.y < area.y + area.h
  );
}

/** The persisted flag that records a one-shot trigger has already fired. */
export function triggerFiredFlag(id: string): string {
  return `trigger:${id}`;
}

/** A trigger defaults to firing once. */
export function isOnce(trigger: Pick<StoryTrigger, "once">): boolean {
  return trigger.once ?? true;
}

/**
 * Whether a trigger's conditions are met for the current player position + flags.
 * `suppressedId` is the trigger currently held off until the player leaves its
 * area (re-arm guard, mirroring door suppression), so it cannot re-fire every
 * frame while the player stands inside it.
 */
export function triggerConditionsMet(
  trigger: StoryTrigger,
  feet: { x: number; y: number },
  hasFlag: (flag: string) => boolean,
  suppressedId?: string
): boolean {
  if (!pointInArea(feet, trigger.area)) {
    return false;
  }
  if (suppressedId === trigger.id) {
    return false;
  }
  if (isOnce(trigger) && hasFlag(triggerFiredFlag(trigger.id))) {
    return false;
  }
  if (trigger.requireFlags && !trigger.requireFlags.every((flag) => hasFlag(flag))) {
    return false;
  }
  if (trigger.blockFlags && trigger.blockFlags.some((flag) => hasFlag(flag))) {
    return false;
  }
  return true;
}

/** The first trigger (declaration order) whose conditions are currently met. */
export function selectStoryTrigger(
  triggers: readonly StoryTrigger[],
  feet: { x: number; y: number },
  hasFlag: (flag: string) => boolean,
  suppressedId?: string
): StoryTrigger | undefined {
  return triggers.find((trigger) => triggerConditionsMet(trigger, feet, hasFlag, suppressedId));
}

/**
 * A barrier is active (solid + visible) when all of its requireFlags are set and
 * none of its blockFlags are set. The boss-cleared flag goes in blockFlags so the
 * barrier opens once the boss is beaten.
 */
export function isBarrierActive(barrier: StoryBarrier, hasFlag: (flag: string) => boolean): boolean {
  if (barrier.requireFlags && !barrier.requireFlags.every((flag) => hasFlag(flag))) {
    return false;
  }
  if (barrier.blockFlags && barrier.blockFlags.some((flag) => hasFlag(flag))) {
    return false;
  }
  return true;
}

/** True when an active barrier covers the point (used for solid collision). */
export function barrierBlocksPoint(
  barriers: readonly StoryBarrier[],
  point: { x: number; y: number },
  hasFlag: (flag: string) => boolean
): boolean {
  return barriers.some((barrier) => isBarrierActive(barrier, hasFlag) && pointInArea(point, barrier.area));
}

/**
 * Clears a suppression once the player has walked out of the suppressed
 * trigger's area, so it can fire again on the next entry (re-armable gates).
 */
export function resolveSuppression(
  suppressedId: string | undefined,
  triggers: readonly StoryTrigger[],
  feet: { x: number; y: number }
): string | undefined {
  if (!suppressedId) {
    return undefined;
  }
  const suppressed = triggers.find((trigger) => trigger.id === suppressedId);
  if (!suppressed || !pointInArea(feet, suppressed.area)) {
    return undefined;
  }
  return suppressedId;
}
