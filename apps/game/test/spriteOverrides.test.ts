import { describe, expect, it } from "vitest";
import type { SpriteOverride } from "@eb/schemas";
import {
  spriteOverrideDirectionFrames,
  spriteOverrideFrame,
  spriteOverrideScale
} from "../src/spriteOverrides";

const HERO_OVERRIDE: SpriteOverride = {
  image: "assets/swagbound/hero/lsw-2821-walk.png",
  frameWidth: 192,
  frameHeight: 192,
  animations: {
    down: [0, 1, 2, 3],
    left: [4, 5, 6, 7],
    right: [8, 9, 10, 11],
    up: [12, 13, 14, 15]
  },
  displayHeight: 24,
  originX: 0.5,
  originY: 1
};

describe("sprite override helpers", () => {
  it("maps facing and walk step into the override frame sequence", () => {
    expect(spriteOverrideFrame("down", 1, HERO_OVERRIDE)).toBe(1);
    expect(spriteOverrideFrame("left", 0, HERO_OVERRIDE)).toBe(4);
    expect(spriteOverrideFrame("right", 5, HERO_OVERRIDE)).toBe(9);
    expect(spriteOverrideFrame("up", 8, HERO_OVERRIDE)).toBe(12);
  });

  it("exposes override animations as player frame sequences", () => {
    expect(spriteOverrideDirectionFrames(HERO_OVERRIDE)).toEqual({
      down: [0, 1, 2, 3],
      left: [4, 5, 6, 7],
      right: [8, 9, 10, 11],
      up: [12, 13, 14, 15]
    });
  });

  it("computes a uniform display-height scale from the source frame height", () => {
    expect(spriteOverrideScale(24, 192)).toBe(0.125);
    expect(spriteOverrideScale(undefined, 192)).toBe(1);
  });
});
