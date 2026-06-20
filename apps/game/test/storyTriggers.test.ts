import { describe, expect, it } from "vitest";
import type { StoryBarrier, StoryTrigger } from "@eb/schemas";
import {
  pointInArea,
  triggerFiredFlag,
  triggerConditionsMet,
  selectStoryTrigger,
  bossGateActive,
  selectActiveBossGates,
  resolveSuppression,
  resolveStoryGateReturn,
  isBarrierActive,
  barrierBlocksPoint
} from "../src/storyTriggers";

const areaBattleGateArea = { x: 100, y: 100, w: 32, h: 32 };

const areaBattleGate: StoryTrigger = {
  id: "area-battle-gate",
  area: areaBattleGateArea,
  dialogue: ["Stop right there."],
  battleGroup: 448,
  setFlags: ["story:boss_cleared"]
};

const visibleBossGate: StoryTrigger = {
  id: "visible-boss-gate",
  boss: { x: 120, y: 120 },
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
    expect(pointInArea({ x: 100, y: 100 }, areaBattleGateArea)).toBe(true);
    expect(pointInArea({ x: 131, y: 131 }, areaBattleGateArea)).toBe(true);
    expect(pointInArea({ x: 132, y: 100 }, areaBattleGateArea)).toBe(false); // right edge exclusive
    expect(pointInArea({ x: 99, y: 100 }, areaBattleGateArea)).toBe(false);
  });

  it("fires inside the area when conditions hold", () => {
    expect(triggerConditionsMet(areaBattleGate, { x: 110, y: 110 }, has([]))).toBe(true);
    expect(triggerConditionsMet(areaBattleGate, { x: 10, y: 10 }, has([]))).toBe(false);
  });

  it("does not refire a one-shot trigger once its fired flag is set", () => {
    expect(triggerConditionsMet(areaBattleGate, { x: 110, y: 110 }, has([triggerFiredFlag("area-battle-gate")]))).toBe(false);
  });

  it("honors requireFlags and blockFlags", () => {
    const needFlag: StoryTrigger = { ...areaBattleGate, id: "g2", requireFlags: ["story:x"] };
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

describe("visible boss gates", () => {
  it("excludes boss gates from the invisible area path", () => {
    expect(triggerConditionsMet(visibleBossGate, { x: 120, y: 120 }, has([]))).toBe(false);
    expect(selectStoryTrigger([visibleBossGate], { x: 120, y: 120 }, has([]))).toBeUndefined();
  });

  it("excludes hybrid area + boss triggers from the invisible area path", () => {
    const hybrid: StoryTrigger = {
      ...areaBattleGate,
      id: "hybrid-boss-gate",
      boss: { x: 110, y: 110 }
    };
    expect(triggerConditionsMet(hybrid, { x: 110, y: 110 }, has([]))).toBe(false);
    expect(selectStoryTrigger([hybrid], { x: 110, y: 110 }, has([]))).toBeUndefined();
  });

  it("activates only when once and flag gates allow it", () => {
    expect(bossGateActive(visibleBossGate, has([]))).toBe(true);
    expect(bossGateActive(visibleBossGate, has([triggerFiredFlag("visible-boss-gate")]))).toBe(false);

    const requiresFlag: StoryTrigger = { ...visibleBossGate, id: "requires-flag", requireFlags: ["story:ready"] };
    expect(bossGateActive(requiresFlag, has([]))).toBe(false);
    expect(bossGateActive(requiresFlag, has(["story:ready"]))).toBe(true);

    const blocked: StoryTrigger = { ...visibleBossGate, id: "blocked", blockFlags: ["story:blocked"] };
    expect(bossGateActive(blocked, has(["story:blocked"]))).toBe(false);
  });

  it("selects active boss gates in declaration order", () => {
    const first: StoryTrigger = { ...visibleBossGate, id: "first" };
    const cleared: StoryTrigger = { ...visibleBossGate, id: "cleared" };
    const gated: StoryTrigger = { ...visibleBossGate, id: "gated", requireFlags: ["story:missing"] };
    const second: StoryTrigger = { ...visibleBossGate, id: "second", requireFlags: ["story:ready"] };

    expect(selectActiveBossGates(
      [first, cleared, gated, second],
      has([triggerFiredFlag("cleared"), "story:ready"])
    ).map((trigger) => trigger.id)).toEqual(["first", "second"]);
  });
});

describe("story trigger selection + suppression", () => {
  const triggers = [areaBattleGate, barricade];

  it("selects the first matching trigger in declaration order", () => {
    expect(selectStoryTrigger(triggers, { x: 110, y: 110 }, has([]))?.id).toBe("area-battle-gate");
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

describe("story-gate boss return (victory-gated flags)", () => {
  const gate = {
    triggerId: "area-battle-gate",
    once: true,
    setFlags: ["signal:route_open"],
    clearFlags: ["signal:road_closed"]
  };

  it("advances flags + the once-marker only on a win", () => {
    const resolution = resolveStoryGateReturn(gate, "win");
    expect(resolution).toEqual({
      kind: "advance",
      setFlags: ["signal:route_open"],
      clearFlags: ["signal:road_closed"],
      firedFlag: triggerFiredFlag("area-battle-gate")
    });
  });

  it("omits the once-marker for re-armable gates", () => {
    const resolution = resolveStoryGateReturn({ ...gate, once: false }, "win");
    expect(resolution).toMatchObject({ kind: "advance", firedFlag: undefined });
  });

  it("suppresses (never advances) on loss, flee, or unknown outcome", () => {
    for (const outcome of ["lose", "flee", undefined] as const) {
      expect(resolveStoryGateReturn(gate, outcome)).toEqual({ kind: "suppress", triggerId: "area-battle-gate" });
    }
  });
});
