import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Scene: class Scene {}
  }
}));

import {
  advanceIntro,
  createIntroState,
  introBeatProgress,
  introOverlayAlpha,
  isIntroDisabled,
  shouldStartIntro,
  skipIntro,
  type IntroBeat
} from "../src/introScene";

const TEST_BEATS: readonly IntroBeat[] = [
  { kind: "fade", dir: "in", ms: 100 },
  { kind: "hold", ms: 50 },
  { kind: "fade", dir: "out", ms: 100 }
];

describe("intro sequencer", () => {
  it("advances beats by injected delta time", () => {
    const start = createIntroState(TEST_BEATS);
    const midFade = advanceIntro(start, 40);
    expect(midFade).toMatchObject({
      beatIndex: 0,
      elapsedMs: 40,
      complete: false
    });

    const hold = advanceIntro(midFade, 60);
    expect(hold).toMatchObject({
      beatIndex: 1,
      elapsedMs: 0,
      complete: false
    });

    const midFadeOut = advanceIntro(hold, 75);
    expect(midFadeOut).toMatchObject({
      beatIndex: 2,
      elapsedMs: 25,
      complete: false
    });
  });

  it("completes when enough delta crosses every beat", () => {
    const state = advanceIntro(createIntroState(TEST_BEATS), 250);
    expect(state).toMatchObject({
      beatIndex: TEST_BEATS.length,
      elapsedMs: 0,
      complete: true,
      skipped: false
    });
  });

  it("reports fade progress and overlay alpha deterministically", () => {
    const fadeIn = advanceIntro(createIntroState(TEST_BEATS), 25);
    expect(introBeatProgress(fadeIn)).toBe(0.25);
    expect(introOverlayAlpha(fadeIn)).toBe(0.75);

    const fadeOut = advanceIntro(createIntroState(TEST_BEATS), 175);
    expect(fadeOut.beatIndex).toBe(2);
    expect(introBeatProgress(fadeOut)).toBe(0.25);
    expect(introOverlayAlpha(fadeOut)).toBe(0.25);
  });

  it("skips immediately", () => {
    const skipped = skipIntro(advanceIntro(createIntroState(TEST_BEATS), 25));
    expect(skipped).toMatchObject({
      beatIndex: TEST_BEATS.length,
      elapsedMs: 0,
      complete: true,
      skipped: true
    });
  });
});

describe("intro new-game gating", () => {
  it("starts the intro only for a fresh new game without the bypass flag", () => {
    expect(shouldStartIntro({ hasSave: false, disabled: false })).toEqual({ startIntro: true });
  });

  it("skips the intro when a save exists", () => {
    expect(shouldStartIntro({ hasSave: true, disabled: false })).toEqual({
      startIntro: false,
      reason: "save_present"
    });
  });

  it("skips the intro when nointro is set", () => {
    expect(isIntroDisabled({ search: "?nointro=1" })).toBe(true);
    expect(shouldStartIntro({ hasSave: false, disabled: true })).toEqual({
      startIntro: false,
      reason: "disabled"
    });
  });
});
