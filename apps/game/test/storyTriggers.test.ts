import { describe, expect, it } from "vitest";
import type { StoryBarrier, StoryTrigger } from "@eb/schemas";
import {
  pointInArea,
  triggerFiredFlag,
  triggerConditionsMet,
  selectStoryTrigger,
  resolveSuppression,
  isBarrierActive,
  barrierBlocksPoint
} from "../src/storyTriggers";

const bossGate: StoryTrigger = {
  id: "boss-gate",
  area: { x: 100, y: 100, w: 32, h: 32 },
  dialogue: ["Stop right there."],
  battleGroup: 448,
  setFlags: ["story:boss_cleared"]
};

const barricade: StoryTrigger = {
  id: "north-barricade",
  area: { x: 200, y: 100, w: 16, h: 16 },
  once: false,
  blockFlags: ["story:boss_cleared"],
  dialogue: ["The way north is blocked."],
  warp: { x: 200, y: 140 }
};

const has = (set: string[]) => (flag: string) => set.includes(flag);

describe("story trigger geometry + conditions", () => {
  it("treats area as a half-open world-pixel rect", () => {
    expect(pointInArea({ x: 100, y: 100 }, bossGate.area)).toBe(true);
    expect(pointInArea({ x: 131, y: 131 }, bossGate.area)).toBe(true);
    expect(pointInArea({ x: 132, y: 100 }, bossGate.area)).toBe(false); // right edge exclusive
    expect(pointInArea({ x: 99, y: 100 }, bossGate.area)).toBe(false);
  });

  it("fires inside the area when conditions hold", () => {
    expect(triggerConditionsMet(bossGate, { x: 110, y: 110 }, has([]))).toBe(true);
    expect(triggerConditionsMet(bossGate, { x: 10, y: 10 }, has([]))).toBe(false);
  });

  it("does not refire a one-shot trigger once its fired flag is set", () => {
    expect(triggerConditionsMet(bossGate, { x: 110, y: 110 }, has([triggerFiredFlag("boss-gate")]))).toBe(false);
  });

  it("honors requireFlags and blockFlags", () => {
    const needFlag: StoryTrigger = { ...bossGate, id: "g2", requireFlags: ["story:x"] };
    expect(triggerConditionsMet(needFlag, { x: 110, y: 110 }, has([]))).toBe(false);
    expect(triggerConditionsMet(needFlag, { x: 110, y: 110 }, has(["story:x"]))).toBe(true);
    // barricade blocks itself once the prerequisite flag is set
    expect(triggerConditionsMet(barricade, { x: 205, y: 105 }, has([]))).toBe(true);
    expect(triggerConditionsMet(barricade, { x: 205, y: 105 }, has(["story:boss_cleared"]))).toBe(false);
  });

  it("re-armable (once:false) triggers ignore the fired flag", () => {
    expect(triggerConditionsMet(barricade, { x: 205, y: 105 }, has([triggerFiredFlag("north-barricade")]))).toBe(true);
  });
});

describe("story trigger selection + suppression", () => {
  const triggers = [bossGate, barricade];

  it("selects the first matching trigger in declaration order", () => {
    expect(selectStoryTrigger(triggers, { x: 110, y: 110 }, has([]))?.id).toBe("boss-gate");
    expect(selectStoryTrigger(triggers, { x: 205, y: 105 }, has([]))?.id).toBe("north-barricade");
    expect(selectStoryTrigger(triggers, { x: 0, y: 0 }, has([]))).toBeUndefined();
  });

  it("skips the suppressed trigger while the player is still inside it", () => {
    expect(selectStoryTrigger(triggers, { x: 205, y: 105 }, has([]), "north-barricade")).toBeUndefined();
  });

  it("clears suppression only after the player leaves the suppressed area", () => {
    expect(resolveSuppression("north-barricade", triggers, { x: 205, y: 105 })).toBe("north-barricade");
    expect(resolveSuppression("north-barricade", triggers, { x: 400, y: 400 })).toBeUndefined();
  });
});

describe("story barriers (solid gates)", () => {
  const barrier: StoryBarrier = {
    id: "road-guard",
    area: { x: 100, y: 50, w: 64, h: 16 },
    blockFlags: ["story:boss_cleared"]
  };
  const has = (set: string[]) => (flag: string) => set.includes(flag);

  it("is active until the block flag is set", () => {
    expect(isBarrierActive(barrier, has([]))).toBe(true);
    expect(isBarrierActive(barrier, has(["story:boss_cleared"]))).toBe(false);
  });

  it("respects requireFlags", () => {
    const gated: StoryBarrier = { ...barrier, requireFlags: ["story:arrived"], blockFlags: [] };
    expect(isBarrierActive(gated, has([]))).toBe(false);
    expect(isBarrierActive(gated, has(["story:arrived"]))).toBe(true);
  });

  it("blocks points inside an active barrier only", () => {
    expect(barrierBlocksPoint([barrier], { x: 110, y: 55 }, has([]))).toBe(true);
    expect(barrierBlocksPoint([barrier], { x: 300, y: 55 }, has([]))).toBe(false); // outside area
    expect(barrierBlocksPoint([barrier], { x: 110, y: 55 }, has(["story:boss_cleared"]))).toBe(false); // inactive
  });
});
