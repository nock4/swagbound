import { describe, expect, it } from "vitest";
import {
  MAX_BATTLE_BACKGROUND_WARP_PX,
  hasAnimatedBattleBackground,
  normalizeDistortionMode,
  rowOffset,
  rowSampleOffsets,
  scrollOffset
} from "../src/battleBackground";

const FULL_WAVE_PER_ROW = Math.PI * 2;
const MAX_SHIFT_NOW = Math.PI * 500;
const TEST_DISTORTION = {
  kind: "horizontal-smooth",
  amplitude: 3,
  frequency: FULL_WAVE_PER_ROW,
  speed: 1
};

describe("battleBackground", () => {
  describe("hasAnimatedBattleBackground", () => {
    it("keeps backgrounds static when animation params are absent", () => {
      expect(hasAnimatedBattleBackground(undefined)).toBe(false);
      expect(hasAnimatedBattleBackground({ id: 1 })).toBe(false);
      expect(hasAnimatedBattleBackground({ id: 1, scroll: { x: 0, y: 0 } })).toBe(false);
      expect(hasAnimatedBattleBackground({
        id: 1,
        distortion: { kind: "unknown type 4", amplitude: 2, frequency: 0.25, speed: 1 }
      })).toBe(false);
    });

    it("enables animation for scroll or time-varying distortion params", () => {
      expect(hasAnimatedBattleBackground({ id: 1, scroll: { x: 1, y: 0 } })).toBe(true);
      expect(hasAnimatedBattleBackground({
        id: 1,
        distortion: { kind: "horizontal, synthetic", amplitude: 2, frequency: 0.25, speed: 1 }
      })).toBe(true);
    });
  });

  describe("normalizeDistortionMode", () => {
    it("maps authored tokens and EB kind strings to internal modes", () => {
      expect(normalizeDistortionMode("horizontal-smooth")).toBe("horizontal-smooth");
      expect(normalizeDistortionMode("horizontal, smooth")).toBe("horizontal-smooth");
      expect(normalizeDistortionMode("horizontal sine")).toBe("horizontal-smooth");
      expect(normalizeDistortionMode("sine-horizontal")).toBe("horizontal-smooth");
      expect(normalizeDistortionMode("horizontal, synthetic")).toBe("horizontal-smooth");
      expect(normalizeDistortionMode("horizontal-interlaced")).toBe("horizontal-interlaced");
      expect(normalizeDistortionMode("HORIZONTAL, INTERLACED")).toBe("horizontal-interlaced");
      expect(normalizeDistortionMode("vertical-compression")).toBe("vertical-compression");
      expect(normalizeDistortionMode("vertical, smooth")).toBe("vertical-compression");
    });

    it("maps absent, none, unknown, and unrelated kinds to none", () => {
      expect(normalizeDistortionMode(undefined)).toBe("none");
      expect(normalizeDistortionMode("none")).toBe("none");
      expect(normalizeDistortionMode("unknown type 4")).toBe("none");
      expect(normalizeDistortionMode("radial")).toBe("none");
    });
  });

  describe("scrollOffset", () => {
    it("is deterministic for an injected time", () => {
      const scroll = { x: 12, y: -3 };

      expect(scrollOffset(5_000, scroll)).toEqual(scrollOffset(5_000, scroll));
      expect(scrollOffset(5_000, scroll)).toEqual({ x: 60, y: -15 });
    });

    it("falls back to zero when scroll params are missing", () => {
      expect(scrollOffset(5_000, undefined)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("rowOffset", () => {
    it("is deterministic for an injected time", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 3, frequency: 0.25, speed: 2 };

      expect(rowOffset(24, 1_500, distortion)).toBe(rowOffset(24, 1_500, distortion));
    });

    it("stays bounded by the configured amplitude", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 5, frequency: 0.2, speed: 3 };

      for (let now = 0; now <= 5_000; now += 125) {
        for (let y = 0; y < 128; y += 7) {
          expect(Math.abs(rowOffset(y, now, distortion))).toBeLessThanOrEqual(5);
        }
      }
    });

    it("clamps large amplitudes to the runtime maximum", () => {
      const distortion = { kind: "horizontal, synthetic", amplitude: 999, frequency: 0.2, speed: 3 };

      for (let now = 0; now <= 5_000; now += 125) {
        expect(Math.abs(rowOffset(42, now, distortion))).toBeLessThanOrEqual(MAX_BATTLE_BACKGROUND_WARP_PX);
      }
    });

    it("returns zero when distortion params are missing", () => {
      expect(rowOffset(24, 1_500, undefined)).toBe(0);
    });
  });

  describe("rowSampleOffsets", () => {
    it("shifts horizontal smooth samples on x while keeping the sampled row", () => {
      expect(rowSampleOffsets("horizontal-smooth", 0, MAX_SHIFT_NOW, TEST_DISTORTION, 10, 5, 64, 64)).toEqual({
        sourceX: 13,
        sourceY: 5
      });
    });

    it("alternates horizontal interlaced signs on adjacent rows", () => {
      expect(rowSampleOffsets("horizontal-interlaced", 0, MAX_SHIFT_NOW, TEST_DISTORTION, 10, 5, 64, 64)).toEqual({
        sourceX: 13,
        sourceY: 5
      });
      expect(rowSampleOffsets("horizontal-interlaced", 1, MAX_SHIFT_NOW, TEST_DISTORTION, 10, 5, 64, 64)).toEqual({
        sourceX: 7,
        sourceY: 6
      });
    });

    it("shifts vertical compression samples on y while keeping x unshifted", () => {
      expect(rowSampleOffsets("vertical-compression", 0, MAX_SHIFT_NOW, TEST_DISTORTION, 10, 5, 64, 64)).toEqual({
        sourceX: 10,
        sourceY: 8
      });
    });

    it("leaves x and y unshifted in none mode", () => {
      expect(rowSampleOffsets("none", 0, MAX_SHIFT_NOW, TEST_DISTORTION, 10, 5, 64, 64)).toEqual({
        sourceX: 10,
        sourceY: 5
      });
    });
  });
});
