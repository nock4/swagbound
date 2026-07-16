import { describe, expect, it } from "vitest";
import {
  ACTOR_BODY_BOTTOM,
  ACTOR_BODY_HALF_WIDTH,
  ACTOR_BODY_TOP,
  actorsBlockingAt
} from "../src/actorCollision";

const ACTOR = { x: 100, y: 100 };

describe("actor collision", () => {
  it("keeps the shared actor feet-box dimensions explicit", () => {
    expect({
      halfWidth: ACTOR_BODY_HALF_WIDTH,
      top: ACTOR_BODY_TOP,
      bottom: ACTOR_BODY_BOTTOM
    }).toEqual({ halfWidth: 14, top: 18, bottom: 10 });
  });

  it.each([
    ["from below", { x: 100, y: 109 }],
    ["from above", { x: 100, y: 83 }],
    ["from left", { x: 87, y: 100 }],
    ["from right", { x: 113, y: 100 }]
  ])("blocks an approach %s", (_direction, candidate) => {
    expect(actorsBlockingAt(candidate.x, candidate.y, [ACTOR])).toBe(true);
  });

  it("allows a mover to step off an actor already overlapping its current spot", () => {
    expect(actorsBlockingAt(101, 100, [ACTOR], { x: 100, y: 100 })).toBe(false);
  });

  it("skips actors without a valid finite world pixel", () => {
    expect(actorsBlockingAt(100, 100, [undefined, null, {}, { x: Number.NaN, y: 100 }])).toBe(false);
  });
});
