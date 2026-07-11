import { describe, expect, it } from "vitest";
import {
  BLACK_HOLD_MS,
  EB_FRAME_MS,
  FADE_IN_MS,
  FADE_OUT_MS,
  STANDARD_EB_TRANSITION_ID,
  advanceMapTransition,
  beginMapTransition,
  framesToMs,
  isMapTransitionActive,
  phaseDurationMs,
  transitionConfigForStyle,
  transitionEffectForConfig,
  transitionKindForDoorType,
  transitionOverlayAlpha,
  transitionOverlayState,
  transitionSfxCueForEvent,
  type MapTransitionEvent,
  type MapTransitionState,
  type TransitionKind,
  type TransitionSfxCue
} from "../src/mapTransition";

function advance(state: MapTransitionState, deltaMs: number): {
  state: MapTransitionState;
  events: MapTransitionEvent[];
} {
  return advanceMapTransition(state, deltaMs);
}

function cuesFor(events: readonly MapTransitionEvent[]): TransitionSfxCue[] {
  return events.flatMap((event) => {
    const cue = transitionSfxCueForEvent(event);
    return cue ? [cue] : [];
  });
}

function allCuesFor(kind: TransitionKind): TransitionSfxCue[] {
  let result = beginMapTransition(kind);
  const cues: TransitionSfxCue[] = cuesFor(result.events);
  result = advance(result.state, FADE_OUT_MS + BLACK_HOLD_MS + FADE_IN_MS);
  cues.push(...cuesFor(result.events));
  return cues;
}

describe("map transition phase machine", () => {
  it("fades out and in with the standard EB 20-frame transition", () => {
    let result = beginMapTransition("door");
    expect(result.events).toEqual([{ type: "start", kind: "door" }]);
    expect(result.state.phase).toBe("fadeOut");
    expect(result.state.configId).toBe(STANDARD_EB_TRANSITION_ID);
    expect(transitionOverlayAlpha(result.state)).toBe(0);
    expect(BLACK_HOLD_MS).toBe(0);
    expect(FADE_OUT_MS).toBeCloseTo(framesToMs(20));
    expect(FADE_IN_MS).toBeCloseTo(framesToMs(20));

    result = advance(result.state, FADE_OUT_MS / 2);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("fadeOut");
    expect(transitionOverlayAlpha(result.state)).toBe(0.5);

    result = advance(result.state, FADE_OUT_MS / 2);
    expect(result.events).toEqual([{ type: "swap" }]);
    expect(result.state.phase).toBe("hold");
    expect(transitionOverlayAlpha(result.state)).toBe(1);

    result = advance(result.state, EB_FRAME_MS);
    expect(result.events).toEqual([{ type: "arrive", kind: "door" }]);
    expect(result.state.phase).toBe("fadeIn");
    expect(transitionOverlayAlpha(result.state)).toBeLessThan(1);

    result = advance(result.state, phaseDurationMs("fadeIn", result.state) / 2);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("fadeIn");
    expect(transitionOverlayAlpha(result.state)).toBeCloseTo(0.45);

    result = advance(result.state, FADE_IN_MS);
    expect(result.events).toEqual([{ type: "complete" }]);
    expect(result.state.phase).toBe("done");
    expect(transitionOverlayAlpha(result.state)).toBe(0);
    expect(isMapTransitionActive(result.state)).toBe(false);
    expect(result.state.totalElapsedMs).toBeCloseTo(FADE_OUT_MS + FADE_IN_MS);
  });

  it("emits all skipped boundary events in order for a large injected delta", () => {
    const started = beginMapTransition("teleport");
    const result = advance(started.state, FADE_OUT_MS + BLACK_HOLD_MS + FADE_IN_MS);

    expect(result.events).toEqual([
      { type: "swap" },
      { type: "arrive", kind: "teleport" },
      { type: "complete" }
    ]);
    expect(result.state.phase).toBe("done");
  });
});

describe("EB transition config mapping", () => {
  it("converts SNES frames to milliseconds at 60fps", () => {
    expect(framesToMs(0)).toBe(0);
    expect(framesToMs(20)).toBeCloseTo(333.333, 3);
    expect(framesToMs(60)).toBeCloseTo(1000);
  });

  it("defaults missing styles to the standard EB fade config", () => {
    const config = transitionConfigForStyle(undefined);
    expect(config.id).toBe(STANDARD_EB_TRANSITION_ID);
    expect(config.effect).toBe("fade");
    expect(config.durationFrames).toBe(20);
    expect(config.secondaryDurationFrames).toBe(20);
  });

  it("maps style 0 to an instant transition", () => {
    expect(transitionEffectForConfig(0)).toBe("instant");
    const result = beginMapTransition("door", 0);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("done");
    expect(isMapTransitionActive(result.state)).toBe(false);
  });

  it("maps slide-speed configs to directional wipes", () => {
    const config = transitionConfigForStyle(17);
    expect(config.effect).toBe("wipe");
    expect(config.durationFrames).toBe(60);
    expect(config.direction).toBe(38);
    expect(config.slideSpeed).toBe(12);

    const falling = transitionConfigForStyle(33);
    expect(falling.effect).toBe("wipe");
    expect(falling.durationFrames).toBe(30);
    expect(falling.direction).toBe(0);
    expect(falling.slideSpeed).toBe(16);

    const started = beginMapTransition("teleport", 17);
    let result = advance(started.state, framesToMs(30));
    const overlay = transitionOverlayState(result.state);
    expect(overlay).toEqual({ effect: "wipe", coverage: 0.5, direction: 38, slideSpeed: 12 });

    result = advance(result.state, framesToMs(30));
    expect(result.events).toEqual([{ type: "swap" }]);
    expect(result.state.phase).toBe("hold");
  });

  it("maps long fadeStyle configs to black fades using their EB durations", () => {
    const config = transitionConfigForStyle(29);
    expect(config.effect).toBe("fade");
    expect(config.fadeStyle).toBe(100);
    expect(config.durationMs).toBeCloseTo(framesToMs(120));
    expect(config.secondaryDurationMs).toBeCloseTo(framesToMs(100));
  });
});

describe("map transition SFX cues", () => {
  it("maps boundary events to the kind-specific cue sequence", () => {
    expect(allCuesFor("door")).toEqual(["doorOpen", "doorClose"]);
    expect(allCuesFor("stairway")).toEqual(["footsteps"]);
    expect(allCuesFor("escalator")).toEqual(["escalatorHum"]);
    expect(allCuesFor("teleport")).toEqual(["whoosh"]);
  });
});

describe("door transition kind mapping", () => {
  it("keeps generated door types mapped to their transition kinds", () => {
    expect(transitionKindForDoorType("door")).toBe("door");
    expect(transitionKindForDoorType("stairway")).toBe("stairway");
    expect(transitionKindForDoorType("escalator")).toBe("escalator");
  });
});
