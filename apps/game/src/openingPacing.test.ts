import { describe, expect, it } from "vitest";
import {
  OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX,
  OPENING_FLYOVER_SCENIC_BOUNDS,
  OPENING_FLYOVER_SHOTS,
  OPENING_KNOCK_POST_SFX_HOLD_MS,
  OPENING_KNOCK_SFX_PATTERN_MS,
  OPENING_KNOCK_SFX_TO_DIALOGUE_MS,
  clampOpeningFlyoverPoint
} from "./openingPacing";

describe("opening flyover pacing", () => {
  it("keeps all authored shot centers inside the safe scenic flyover region", () => {
    const minX = OPENING_FLYOVER_SCENIC_BOUNDS.minX + OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
    const maxX = OPENING_FLYOVER_SCENIC_BOUNDS.maxX - OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
    const minY = OPENING_FLYOVER_SCENIC_BOUNDS.minY + OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
    const maxY = OPENING_FLYOVER_SCENIC_BOUNDS.maxY - OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;

    for (const shot of OPENING_FLYOVER_SHOTS) {
      for (const point of [shot.from, shot.to]) {
        expect(point.x).toBeGreaterThanOrEqual(minX);
        expect(point.x).toBeLessThanOrEqual(maxX);
        expect(point.y).toBeGreaterThanOrEqual(minY);
        expect(point.y).toBeLessThanOrEqual(maxY);
        expect(clampOpeningFlyoverPoint(point)).toEqual(point);
      }
    }
  });

  it("clamps future shot centers back inside the scenic flyover region", () => {
    expect(clampOpeningFlyoverPoint({ x: 800, y: 500 })).toEqual({ x: 1600, y: 1200 });
    expect(clampOpeningFlyoverPoint({ x: 3600, y: 2600 })).toEqual({ x: 2080, y: 1860 });
  });

  it("preserves three distinct 9-second pan regions", () => {
    expect(OPENING_FLYOVER_SHOTS.map((shot) => shot.duration)).toEqual([9_000, 9_000, 9_000]);
    expect(OPENING_FLYOVER_SHOTS.map((shot) => ({ from: shot.from, to: shot.to }))).toEqual([
      { from: { x: 1600, y: 1200 }, to: { x: 1700, y: 1240 } },
      { from: { x: 1980, y: 1420 }, to: { x: 2080, y: 1580 } },
      { from: { x: 1600, y: 1600 }, to: { x: 1660, y: 1732 } }
    ]);

    const mids = OPENING_FLYOVER_SHOTS.map((s) => ({ x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 }));
    for (let i = 0; i < mids.length; i++) {
      for (let j = i + 1; j < mids.length; j++) {
        const d = Math.hypot(mids[i].x - mids[j].x, mids[i].y - mids[j].y);
        expect(d).toBeGreaterThan(400);
      }
    }
  });

  it("waits for the knock pattern plus the post-knock beat before dialogue", () => {
    expect(OPENING_KNOCK_SFX_TO_DIALOGUE_MS).toBe(OPENING_KNOCK_SFX_PATTERN_MS + OPENING_KNOCK_POST_SFX_HOLD_MS);
    expect(OPENING_KNOCK_POST_SFX_HOLD_MS).toBe(800);
  });
});
