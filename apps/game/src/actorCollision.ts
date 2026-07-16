export const ACTOR_BODY_HALF_WIDTH = 14;
export const ACTOR_BODY_TOP = 18;
export const ACTOR_BODY_BOTTOM = 10;

export type ActorBodyPoint = {
  x: number;
  y: number;
};

export function isActorBodyPoint(value: unknown): value is ActorBodyPoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as Partial<ActorBodyPoint>;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function actorBodyBlocked(x: number, y: number, bodyX: number, bodyY: number): boolean {
  return Math.abs(x - bodyX) < ACTOR_BODY_HALF_WIDTH
    && y > bodyY - ACTOR_BODY_TOP
    && y < bodyY + ACTOR_BODY_BOTTOM;
}

export function actorsBlockingAt(
  x: number,
  y: number,
  actors: Iterable<unknown>,
  escapeOverlapAt?: ActorBodyPoint
): boolean {
  for (const actor of actors) {
    if (!isActorBodyPoint(actor)) {
      continue;
    }
    if (escapeOverlapAt && actorBodyBlocked(escapeOverlapAt.x, escapeOverlapAt.y, actor.x, actor.y)) {
      continue;
    }
    if (actorBodyBlocked(x, y, actor.x, actor.y)) {
      return true;
    }
  }
  return false;
}
