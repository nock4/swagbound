import { describe, expect, it } from "vitest";
import { flashState, wobbleOffset } from "../src/battleEffects";

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
});
