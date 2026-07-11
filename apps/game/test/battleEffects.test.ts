import { readFileSync } from "node:fs";
import { PsiCollectionSchema, UsabilityMatrixSchema } from "@eb/schemas";
import { describe, expect, it } from "vitest";
import {
  PSI_BATTLE_ANIMATION_DEFINITIONS,
  attackerLungeOffset,
  flashOverlayState,
  flashState,
  hitSparkState,
  offensivePsiAnimationFamilyForId,
  psiBattleAnimationFamilyForPsi,
  psiBattleAnimationForPsi,
  psiElementFlashColor,
  psiElementFlashProfile,
  screenShakeOffset
} from "../src/battleEffects";

const psiCollection = PsiCollectionSchema.parse(JSON.parse(
  readFileSync(new URL("../public/generated/psi.json", import.meta.url), "utf8")
));
const usabilityMatrix = UsabilityMatrixSchema.parse(JSON.parse(
  readFileSync(new URL("../../../content/usability-matrix.json", import.meta.url), "utf8")
));
const generatedPsiById = new Map(psiCollection.psi.map((psi) => [psi.id, psi]));

describe("psiElementFlashProfile", () => {
  it("strobes thunder, sustains fire, and bursts flash", () => {
    expect(psiElementFlashProfile(14).pulses).toBe(7); // thunder = strobe
    expect(psiElementFlashProfile(6).pulses).toBe(3); // fire = sweeping wash
    expect(psiElementFlashProfile(18).pulses).toBe(4); // flash = repeated burst
  });

  it("carries the element color and a positive, bounded alpha", () => {
    const fire = psiElementFlashProfile(6);
    expect(fire.color).toBe(psiElementFlashColor(6));
    expect(fire.alpha).toBeGreaterThan(0);
    expect(fire.alpha).toBeLessThanOrEqual(1);
    expect(fire.durationMs).toBeGreaterThan(0);
  });

  it("falls back to a single neutral pulse for non-element ids", () => {
    const support = PSI_BATTLE_ANIMATION_DEFINITIONS.support;
    expect(psiElementFlashProfile(0)).toEqual({
      color: support.colors[0],
      alpha: support.baseAlpha,
      durationMs: support.durationMs,
      pulses: support.pulses
    });
  });
});

describe("psi battle animation mapping", () => {
  it("defines a snappy effect for every PSI animation family", () => {
    expect(Object.keys(PSI_BATTLE_ANIMATION_DEFINITIONS).sort()).toEqual([
      "beam",
      "cosmic",
      "fire",
      "flash",
      "ice",
      "support",
      "thunder"
    ]);
    for (const definition of Object.values(PSI_BATTLE_ANIMATION_DEFINITIONS)) {
      expect(definition.durationMs).toBeGreaterThanOrEqual(600);
      expect(definition.durationMs).toBeLessThanOrEqual(1200);
      expect(definition.colors.length).toBeGreaterThan(0);
      expect(definition.baseAlpha).toBeGreaterThan(0);
      expect(definition.baseAlpha).toBeLessThanOrEqual(1);
    }
  });

  it("maps every battle-usable PSI row to a concrete effect definition", () => {
    const familyById = new Map<number, string>();
    for (const row of usabilityMatrix.psi.filter((entry) => entry.battleUse)) {
      const generated = generatedPsiById.get(row.id);
      const psi = generated
        ? { id: row.id, name: row.name, type: generated.type }
        : { id: row.id, name: row.name };
      const family = psiBattleAnimationFamilyForPsi(psi);
      const definition = psiBattleAnimationForPsi(psi);

      expect(definition).toBe(PSI_BATTLE_ANIMATION_DEFINITIONS[family]);
      expect(definition.family).toBe(family);
      familyById.set(row.id, family);

      if (generated?.type === "offense") {
        expect(family).not.toBe("support");
      } else {
        expect(family).toBe("support");
      }
    }

    expect(familyById.get(1)).toBe("beam");
    expect(familyById.get(5)).toBe("fire");
    expect(familyById.get(9)).toBe("ice");
    expect(familyById.get(13)).toBe("thunder");
    expect(familyById.get(17)).toBe("flash");
    expect(familyById.get(21)).toBe("cosmic");
    expect(familyById.get(23)).toBe("support");
    expect(familyById.get(31)).toBe("support");
    expect(familyById.get(50)).toBe("support");
  });
});

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
      expect(psiElementFlashColor(1)).toBe(0xff54d8);
      expect(psiElementFlashColor(4)).toBe(0xff54d8);
      expect(psiElementFlashColor(5)).toBe(0xff7a2a);
      expect(psiElementFlashColor(8)).toBe(0xff7a2a);
      expect(psiElementFlashColor(9)).toBe(0x5fe0ff);
      expect(psiElementFlashColor(12)).toBe(0x5fe0ff);
      expect(psiElementFlashColor(13)).toBe(0xffe14d);
      expect(psiElementFlashColor(16)).toBe(0xffe14d);
      expect(psiElementFlashColor(17)).toBe(0xf2f2ff);
      expect(psiElementFlashColor(20)).toBe(0xf2f2ff);
      expect(psiElementFlashColor(21)).toBe(0xb46bff);
      expect(psiElementFlashColor(22)).toBe(0xb46bff);
    });

    it("uses a neutral tint outside known offense PSI ranges", () => {
      expect(offensivePsiAnimationFamilyForId(23)).toBeNull();
      expect(psiElementFlashColor(23)).toBe(0x8fe0d8);
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
