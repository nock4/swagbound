import { describe, expect, it } from "vitest";
import {
  BLACK_HOLD_MS,
  FADE_IN_MS,
  FADE_OUT_MS,
  advanceMapTransition,
  beginMapTransition,
  isMapTransitionActive,
  transitionKindForDoorType,
  transitionOverlayAlpha,
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
  for (const deltaMs of [FADE_OUT_MS, BLACK_HOLD_MS, FADE_IN_MS]) {
    result = advance(result.state, deltaMs);
    cues.push(...cuesFor(result.events));
  }
  return cues;
}

describe("map transition phase machine", () => {
  it("fades out, holds black, fades in, then completes with the locked durations", () => {
    let result = beginMapTransition("door");
    expect(result.events).toEqual([{ type: "start", kind: "door" }]);
    expect(result.state.phase).toBe("fadeOut");
    expect(transitionOverlayAlpha(result.state)).toBe(0);

    result = advance(result.state, FADE_OUT_MS / 2);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("fadeOut");
    expect(transitionOverlayAlpha(result.state)).toBe(0.5);

    result = advance(result.state, FADE_OUT_MS / 2);
    expect(result.events).toEqual([{ type: "swap" }]);
    expect(result.state.phase).toBe("hold");
    expect(transitionOverlayAlpha(result.state)).toBe(1);

    result = advance(result.state, BLACK_HOLD_MS - 1);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("hold");
    expect(transitionOverlayAlpha(result.state)).toBe(1);

    result = advance(result.state, 1);
    expect(result.events).toEqual([{ type: "arrive", kind: "door" }]);
    expect(result.state.phase).toBe("fadeIn");
    expect(transitionOverlayAlpha(result.state)).toBe(1);

    result = advance(result.state, FADE_IN_MS / 2);
    expect(result.events).toEqual([]);
    expect(result.state.phase).toBe("fadeIn");
    expect(transitionOverlayAlpha(result.state)).toBe(0.5);

    result = advance(result.state, FADE_IN_MS / 2);
    expect(result.events).toEqual([{ type: "complete" }]);
    expect(result.state.phase).toBe("done");
    expect(transitionOverlayAlpha(result.state)).toBe(0);
    expect(isMapTransitionActive(result.state)).toBe(false);
    expect(result.state.totalElapsedMs).toBe(FADE_OUT_MS + BLACK_HOLD_MS + FADE_IN_MS);
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
