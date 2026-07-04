import { describe, expect, it } from "vitest";
import type { BossBattleDialogue } from "@eb/schemas";
import {
  DEFAULT_BOSS_LOW_HP_THRESHOLD,
  bossHpFraction,
  resolveBossTaunts,
  shouldQueueLowHpTaunt,
  wrapTauntLines
} from "./bossTaunts";

const data: BossBattleDialogue = {
  schema: "swagbound.boss-battle-dialogue.v1",
  ambient: [],
  byBattleGroup: {
    "448": {
      personaName: "MIFELLA CONGREGANT",
      onStart: ["We completed your read before you walked in."],
      onLowHp: ["A face on loan. Cut it and we wear another."],
      onDefeat: ["One mask folds; the print does not."],
      onTurn: ["We are still reading you."],
      lowHpThreshold: 0.25
    },
    "36": {
      onStart: ["You arrived pre-filed."],
      onLowHp: [],
      onDefeat: [],
      onTurn: []
    },
    "99": {
      onStart: [],
      onLowHp: [],
      onDefeat: [],
      onTurn: []
    }
  }
};

describe("resolveBossTaunts", () => {
  it("resolves a group's taunts with its explicit threshold", () => {
    const taunts = resolveBossTaunts(data, 448);
    expect(taunts).toBeDefined();
    expect(taunts?.personaName).toBe("MIFELLA CONGREGANT");
    expect(taunts?.onStart).toEqual(["We completed your read before you walked in."]);
    expect(taunts?.lowHpThreshold).toBe(0.25);
  });

  it("defaults the low-HP threshold when unset", () => {
    expect(resolveBossTaunts(data, 36)?.lowHpThreshold).toBe(DEFAULT_BOSS_LOW_HP_THRESHOLD);
  });

  it("returns undefined for a group with no taunt lines at all", () => {
    expect(resolveBossTaunts(data, 99)).toBeUndefined();
  });

  it("returns undefined for an unknown group or missing data", () => {
    expect(resolveBossTaunts(data, 12345)).toBeUndefined();
    expect(resolveBossTaunts(undefined, 448)).toBeUndefined();
  });

  it("prefers a boss's own onTurn barks over the shared ambient pool", () => {
    const withAmbient: BossBattleDialogue = { ...data, ambient: ["Shared swarm bark."] };
    expect(resolveBossTaunts(withAmbient, 448)?.onTurn).toEqual(["We are still reading you."]);
  });

  it("falls back to the shared ambient pool when a boss has no onTurn", () => {
    const withAmbient: BossBattleDialogue = { ...data, ambient: ["Shared swarm bark."] };
    expect(resolveBossTaunts(withAmbient, 36)?.onTurn).toEqual(["Shared swarm bark."]);
    // an otherwise-empty entry still resolves purely to get ambient barks
    expect(resolveBossTaunts(withAmbient, 99)?.onTurn).toEqual(["Shared swarm bark."]);
  });
});

describe("bossHpFraction", () => {
  it("computes the clamped remaining fraction", () => {
    expect(bossHpFraction(50, 200)).toBe(0.25);
    expect(bossHpFraction(-5, 200)).toBe(0);
    expect(bossHpFraction(500, 200)).toBe(1);
  });

  it("returns 1 when max HP is unknown or non-positive", () => {
    expect(bossHpFraction(10, 0)).toBe(1);
    expect(bossHpFraction(10, Number.NaN)).toBe(1);
  });
});

describe("shouldQueueLowHpTaunt", () => {
  it("fires only when alive and at/below threshold", () => {
    expect(shouldQueueLowHpTaunt(0.3, true, 0.34)).toBe(true);
    expect(shouldQueueLowHpTaunt(0.34, true, 0.34)).toBe(true);
    expect(shouldQueueLowHpTaunt(0.5, true, 0.34)).toBe(false);
    expect(shouldQueueLowHpTaunt(0.1, false, 0.34)).toBe(false);
  });
});

describe("wrapTauntLines", () => {
  it("keeps a short line as a single line", () => {
    expect(wrapTauntLines("Hold still.")).toEqual(["Hold still."]);
  });

  it("word-wraps within the max width and never splits a word", () => {
    const text = "We completed your read before you walked in and kept the version of you that lasts.";
    const wrapped = wrapTauntLines(text, 20, 10);
    expect(wrapped.every((line) => line.length <= 20)).toBe(true);
    expect(wrapped.join(" ")).toBe(text);
  });

  it("caps the number of lines rather than clipping mid-word", () => {
    const wrapped = wrapTauntLines("one two three four five six seven eight nine ten", 5, 2);
    expect(wrapped.length).toBe(2);
    // a single over-long word is still emitted whole on its own line
    expect(wrapTauntLines("antidisestablishmentarianism", 5)).toEqual(["antidisestablishmentarianism"]);
  });
});
