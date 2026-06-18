import { describe, expect, it } from "vitest";
import {
  attackerLungeOffset,
  flashOverlayState,
  flashState,
  hitSparkState,
  psiElementFlashColor,
  screenShakeOffset,
  wobbleOffset
} from "../src/battleEffects";

describe("battleEffects", () => {
  describe("flashState", () => {
    it("is inactive before a hit", () => {
      expect(flashState(100, null, 190)).toEqual({ active: false, intensity: 0 });
      expect(flashState(100, 120, 190)).toEqual({ active: false, intensity: 0 });
    });

    it("is active and cycles during the flash window", () => {
      const hitAt = 1_000;
      const firstPulse = flashState(hitAt + 10, hitAt, 190);
      const offPulse = flashState(hitAt + 32, hitAt, 190);
      const secondPulse = flashState(hitAt + 54, hitAt, 190);

      expect(firstPulse.active).toBe(true);
      expect(firstPulse.intensity).toBeGreaterThan(0);
      expect(offPulse.active).toBe(true);
      expect(offPulse.intensity).toBe(0);
      expect(secondPulse.active).toBe(true);
      expect(secondPulse.intensity).toBeGreaterThan(0);
      expect(secondPulse.intensity).toBeLessThan(firstPulse.intensity);
    });

    it("is inactive after the flash window", () => {
      expect(flashState(1_191, 1_000, 190)).toEqual({ active: false, intensity: 0 });
    });
  });

  describe("wobbleOffset", () => {
    it("is deterministic for a passed-in time", () => {
      expect(wobbleOffset(750, 1, 1.5, 1600)).toEqual(wobbleOffset(750, 1, 1.5, 1600));
    });

    it("stays bounded by the configured amplitude", () => {
      for (let now = 0; now <= 5_000; now += 125) {
        const offset = wobbleOffset(now, 2, 1.5, 1600);
        expect(Math.abs(offset.dx)).toBeLessThanOrEqual(1.5);
        expect(Math.abs(offset.dy)).toBeLessThanOrEqual(1.5);
      }
    });

    it("phase-offsets different enemy indexes", () => {
      expect(wobbleOffset(1_000, 0, 1.5, 1600)).not.toEqual(wobbleOffset(1_000, 1, 1.5, 1600));
    });
  });

  describe("screenShakeOffset", () => {
    it("is inactive outside the shake window", () => {
      expect(screenShakeOffset(90, 100, 4, 220)).toEqual({ dx: 0, dy: 0 });
      expect(screenShakeOffset(320, 100, 4, 220)).toEqual({ dx: 0, dy: 0 });
      expect(screenShakeOffset(120, null, 4, 220)).toEqual({ dx: 0, dy: 0 });
    });

    it("decays while staying bounded by intensity", () => {
      const early = screenShakeOffset(120, 100, 4, 220);
      const late = screenShakeOffset(290, 100, 4, 220);

      expect(Math.hypot(early.dx, early.dy)).toBeGreaterThan(Math.hypot(late.dx, late.dy));
      for (const offset of [early, late]) {
        expect(Math.abs(offset.dx)).toBeLessThanOrEqual(4);
        expect(Math.abs(offset.dy)).toBeLessThanOrEqual(4);
      }
    });
  });

  describe("hitSparkState", () => {
    it("expands and fades during the active window", () => {
      const start = hitSparkState(100, 100, 240);
      const mid = hitSparkState(180, 100, 240);

      expect(start.active).toBe(true);
      expect(mid.active).toBe(true);
      expect(mid.progress).toBeGreaterThan(start.progress);
      expect(mid.radius).toBeGreaterThan(start.radius);
      expect(mid.alpha).toBeLessThan(start.alpha);
      expect(mid.radius).toBeGreaterThanOrEqual(5);
      expect(mid.radius).toBeLessThanOrEqual(34);
      expect(mid.alpha).toBeGreaterThanOrEqual(0);
      expect(mid.alpha).toBeLessThanOrEqual(1);
    });

    it("is inactive after the spark window", () => {
      expect(hitSparkState(341, 100, 240)).toEqual({ active: false, progress: 1, radius: 0, alpha: 0 });
    });
  });

  describe("flashOverlayState", () => {
    it("rises quickly, then falls within the configured alpha", () => {
      const rising = flashOverlayState(116, 100, 180, 0.32);
      const peak = flashOverlayState(140, 100, 180, 0.32);
      const falling = flashOverlayState(230, 100, 180, 0.32);

      expect(rising.active).toBe(true);
      expect(peak.active).toBe(true);
      expect(falling.active).toBe(true);
      expect(peak.alpha).toBeGreaterThan(rising.alpha);
      expect(peak.alpha).toBeGreaterThan(falling.alpha);
      expect(peak.alpha).toBeLessThanOrEqual(0.32);
    });

    it("is inactive outside the flash window", () => {
      expect(flashOverlayState(99, 100, 180, 0.32)).toEqual({ active: false, alpha: 0 });
      expect(flashOverlayState(280, 100, 180, 0.32)).toEqual({ active: false, alpha: 0 });
    });
  });

  describe("psiElementFlashColor", () => {
    it("maps EarthBound PSI id ranges to element flash colors", () => {
      expect(psiElementFlashColor(5)).toBe(0xff7a2a);
      expect(psiElementFlashColor(8)).toBe(0xff7a2a);
      expect(psiElementFlashColor(9)).toBe(0x5fe0ff);
      expect(psiElementFlashColor(12)).toBe(0x5fe0ff);
      expect(psiElementFlashColor(13)).toBe(0xffe14d);
      expect(psiElementFlashColor(16)).toBe(0xffe14d);
      expect(psiElementFlashColor(17)).toBe(0xf2f2ff);
      expect(psiElementFlashColor(20)).toBe(0xf2f2ff);
      expect(psiElementFlashColor(21)).toBe(0xb46bff);
      expect(psiElementFlashColor(24)).toBe(0xb46bff);
    });

    it("uses a neutral tint outside known offense PSI ranges", () => {
      expect(psiElementFlashColor(4)).toBe(0x8fe0d8);
      expect(psiElementFlashColor(25)).toBe(0x8fe0d8);
      expect(psiElementFlashColor(Number.NaN)).toBe(0x8fe0d8);
    });
  });

  describe("attackerLungeOffset", () => {
    it("nudges toward the supplied direction and returns", () => {
      const start = attackerLungeOffset(100, 100, 260, { dx: 4, dy: 12 });
      const peak = attackerLungeOffset(230, 100, 260, { dx: 4, dy: 12 });
      const late = attackerLungeOffset(348, 100, 260, { dx: 4, dy: 12 });

      expect(start).toEqual({ dx: 0, dy: 0 });
      expect(peak.dx).toBeGreaterThan(3.9);
      expect(peak.dy).toBeGreaterThan(11.9);
      expect(late.dx).toBeGreaterThan(0);
      expect(late.dx).toBeLessThan(peak.dx);
      expect(late.dy).toBeGreaterThan(0);
      expect(late.dy).toBeLessThan(peak.dy);
    });

    it("is inactive after the lunge window", () => {
      expect(attackerLungeOffset(361, 100, 260, { dx: 4, dy: 12 })).toEqual({ dx: 0, dy: 0 });
    });
  });
});
