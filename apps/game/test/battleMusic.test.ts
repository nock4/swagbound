import { describe, expect, it } from "vitest";
import { battleMusicCueForOutcome } from "../src/battleMusic";

describe("battle music cue selection", () => {
  it("uses the victory cue only for won battles", () => {
    expect(battleMusicCueForOutcome("ongoing")).toBe("battle");
    expect(battleMusicCueForOutcome("lose")).toBe("battle");
    expect(battleMusicCueForOutcome("win")).toBe("victory");
  });

  it("uses the boss cue for ongoing/lost story-boss battles, victory still on win", () => {
    expect(battleMusicCueForOutcome("ongoing", true)).toBe("boss");
    expect(battleMusicCueForOutcome("lose", true)).toBe("boss");
    expect(battleMusicCueForOutcome("win", true)).toBe("victory");
  });
});
