export type FlashEffectState = {
  active: boolean;
  intensity: number;
};

export type WobbleEffectOffset = {
  dx: number;
  dy: number;
};

export type HitSparkEffectState = {
  active: boolean;
  progress: number;
  radius: number;
  alpha: number;
};

export type FlashOverlayEffectState = {
  active: boolean;
  alpha: number;
};

export type EffectDirection = {
  dx: number;
  dy: number;
};

export const DEFAULT_DAMAGE_FLASH_MS = 190;
const PSI_FLASH_COLOR_FIRE = 0xff7a2a;
const PSI_FLASH_COLOR_FREEZE = 0x5fe0ff;
const PSI_FLASH_COLOR_THUNDER = 0xffe14d;
const PSI_FLASH_COLOR_FLASH = 0xf2f2ff;
const PSI_FLASH_COLOR_STARSTORM = 0xb46bff;
const PSI_FLASH_COLOR_BEAM = 0xff54d8;
const PSI_FLASH_COLOR_NEUTRAL = 0x8fe0d8;

const TAU = Math.PI * 2;

export type PsiBattleAnimationFamily = "beam" | "fire" | "ice" | "thunder" | "flash" | "cosmic" | "support";

export type PsiBattleAnimationStyle =
  | "radial"
  | "fireSweep"
  | "iceCrystal"
  | "thunderBolt"
  | "flashBurst"
  | "cosmicSwirl"
  | "supportGlow";

export type PsiBattleAnimationDefinition = {
  family: PsiBattleAnimationFamily;
  style: PsiBattleAnimationStyle;
  durationMs: number;
  colors: readonly number[];
  baseAlpha: number;
  accentAlpha: number;
  pulses: number;
  burstCount: number;
};

export type PsiBattleAnimationPsiLike = {
  id?: number;
  name?: string;
  type?: string;
};

export const PSI_BATTLE_ANIMATION_DEFINITIONS: Record<PsiBattleAnimationFamily, PsiBattleAnimationDefinition> = {
  beam: {
    family: "beam",
    style: "radial",
    durationMs: 840,
    colors: [PSI_FLASH_COLOR_BEAM, 0xffffff, 0x6f4dff],
    baseAlpha: 0.22,
    accentAlpha: 0.7,
    pulses: 4,
    burstCount: 18
  },
  fire: {
    family: "fire",
    style: "fireSweep",
    durationMs: 780,
    colors: [PSI_FLASH_COLOR_FIRE, 0xff2f00, 0xffd04a],
    baseAlpha: 0.28,
    accentAlpha: 0.62,
    pulses: 3,
    burstCount: 10
  },
  ice: {
    family: "ice",
    style: "iceCrystal",
    durationMs: 720,
    colors: [PSI_FLASH_COLOR_FREEZE, 0xffffff, 0x3aa8ff],
    baseAlpha: 0.24,
    accentAlpha: 0.66,
    pulses: 3,
    burstCount: 14
  },
  thunder: {
    family: "thunder",
    style: "thunderBolt",
    durationMs: 680,
    colors: [PSI_FLASH_COLOR_THUNDER, 0xffffff, 0x7fd7ff],
    baseAlpha: 0.34,
    accentAlpha: 0.82,
    pulses: 7,
    burstCount: 5
  },
  flash: {
    family: "flash",
    style: "flashBurst",
    durationMs: 740,
    colors: [PSI_FLASH_COLOR_FLASH, 0xffffff, 0xfff49c],
    baseAlpha: 0.38,
    accentAlpha: 0.76,
    pulses: 4,
    burstCount: 12
  },
  cosmic: {
    family: "cosmic",
    style: "cosmicSwirl",
    durationMs: 1020,
    colors: [PSI_FLASH_COLOR_STARSTORM, 0x70d0ff, 0xffffff],
    baseAlpha: 0.24,
    accentAlpha: 0.68,
    pulses: 5,
    burstCount: 20
  },
  support: {
    family: "support",
    style: "supportGlow",
    durationMs: 650,
    colors: [PSI_FLASH_COLOR_NEUTRAL, 0xe8fff5, 0x95d4ff],
    baseAlpha: 0.18,
    accentAlpha: 0.46,
    pulses: 1,
    burstCount: 8
  }
};

export function flashState(
  now: number,
  lastHitAt: number | null,
  durationMs: number = DEFAULT_DAMAGE_FLASH_MS
): FlashEffectState {
  if (!Number.isFinite(now) || lastHitAt === null || !Number.isFinite(lastHitAt) || durationMs <= 0) {
    return inactiveFlash();
  }

  const elapsed = now - lastHitAt;
  if (elapsed < 0 || elapsed >= durationMs) {
    return inactiveFlash();
  }

  const cycleMs = Math.max(32, durationMs / 4);
  const cycleProgress = (elapsed % cycleMs) / cycleMs;
  const envelope = 1 - elapsed / durationMs;
  return {
    active: true,
    intensity: cycleProgress < 0.52 ? clamp01(0.4 + envelope * 0.6) : 0
  };
}

export function screenShakeOffset(
  now: number,
  startedAt: number | null,
  intensity: number,
  durationMs: number
): WobbleEffectOffset {
  const elapsed = activeElapsed(now, startedAt, durationMs);
  if (elapsed === null || !Number.isFinite(intensity)) {
    return { dx: 0, dy: 0 };
  }

  const amplitude = Math.max(0, intensity);
  if (amplitude <= 0) {
    return { dx: 0, dy: 0 };
  }

  const progress = elapsed / durationMs;
  const envelope = 1 - progress;
  return {
    dx: Math.sin(progress * TAU * 5.25) * amplitude * envelope,
    dy: Math.sin(progress * TAU * 7.5 + Math.PI / 3) * amplitude * 0.65 * envelope
  };
}

export function hitSparkState(
  now: number,
  startedAt: number | null,
  durationMs: number
): HitSparkEffectState {
  const elapsed = activeElapsed(now, startedAt, durationMs);
  if (elapsed === null) {
    return inactiveHitSpark();
  }

  const progress = clamp01(elapsed / durationMs);
  const easeOut = 1 - Math.pow(1 - progress, 3);
  return {
    active: true,
    progress,
    radius: 5 + easeOut * 29,
    alpha: clamp01(0.92 * (1 - progress))
  };
}

export function flashOverlayState(
  now: number,
  startedAt: number | null,
  durationMs: number,
  baseAlpha: number
): FlashOverlayEffectState {
  const elapsed = activeElapsed(now, startedAt, durationMs);
  if (elapsed === null || !Number.isFinite(baseAlpha)) {
    return inactiveFlashOverlay();
  }

  const peakProgress = 0.22;
  const progress = clamp01(elapsed / durationMs);
  const envelope = progress <= peakProgress
    ? progress / peakProgress
    : 1 - (progress - peakProgress) / (1 - peakProgress);
  const alpha = clamp01(baseAlpha) * clamp01(envelope);
  return {
    active: true,
    alpha
  };
}

export function psiElementFlashColor(psiId: number): number {
  const family = offensivePsiAnimationFamilyForId(psiId) ?? "support";
  return PSI_BATTLE_ANIMATION_DEFINITIONS[family].colors[0] ?? PSI_FLASH_COLOR_NEUTRAL;
}

export type PsiElementFlashProfile = {
  color: number;
  alpha: number;
  durationMs: number;
  pulses: number;
};

/**
 * Legacy compact profile view backed by the full PSI animation definitions.
 * Scene playback consumes the richer table directly.
 */
export function psiElementFlashProfile(psiId: number): PsiElementFlashProfile {
  const definition = psiBattleAnimationForPsi({ id: psiId });
  return {
    color: definition.colors[0] ?? PSI_FLASH_COLOR_NEUTRAL,
    alpha: definition.baseAlpha,
    durationMs: definition.durationMs,
    pulses: definition.pulses
  };
}

export function psiBattleAnimationForPsi(psi: PsiBattleAnimationPsiLike | undefined): PsiBattleAnimationDefinition {
  return PSI_BATTLE_ANIMATION_DEFINITIONS[psiBattleAnimationFamilyForPsi(psi)];
}

export function psiBattleAnimationFamilyForPsi(
  psi: PsiBattleAnimationPsiLike | undefined
): PsiBattleAnimationFamily {
  const tokens = psiTypeTokens(psi?.type);
  if (tokens.has("recovery") || tokens.has("recover") || tokens.has("assist") || tokens.has("other")) {
    return "support";
  }
  const idFamily = offensivePsiAnimationFamilyForId(psi?.id);
  if (idFamily) {
    return idFamily;
  }
  const nameFamily = psiBattleAnimationFamilyForName(psi?.name);
  if (nameFamily) {
    return nameFamily;
  }
  return tokens.has("offense") ? "beam" : "support";
}

export function offensivePsiAnimationFamilyForId(
  psiId: number | undefined
): Exclude<PsiBattleAnimationFamily, "support"> | null {
  if (psiId === undefined || !Number.isFinite(psiId)) {
    return null;
  }
  const id = Math.floor(psiId);
  if (id >= 1 && id <= 4) return "beam";
  if (id >= 5 && id <= 8) return "fire";
  if (id >= 9 && id <= 12) return "ice";
  if (id >= 13 && id <= 16) return "thunder";
  if (id >= 17 && id <= 20) return "flash";
  if (id >= 21 && id <= 22) return "cosmic";
  return null;
}

export function attackerLungeOffset(
  now: number,
  startedAt: number | null,
  durationMs: number,
  dir: EffectDirection
): WobbleEffectOffset {
  const elapsed = activeElapsed(now, startedAt, durationMs);
  if (
    elapsed === null ||
    !Number.isFinite(dir.dx) ||
    !Number.isFinite(dir.dy)
  ) {
    return { dx: 0, dy: 0 };
  }

  const progress = clamp01(elapsed / durationMs);
  const outAndBack = Math.sin(progress * Math.PI);
  return {
    dx: dir.dx * outAndBack,
    dy: dir.dy * outAndBack
  };
}

function inactiveFlash(): FlashEffectState {
  return { active: false, intensity: 0 };
}

function inactiveHitSpark(): HitSparkEffectState {
  return { active: false, progress: 1, radius: 0, alpha: 0 };
}

function inactiveFlashOverlay(): FlashOverlayEffectState {
  return { active: false, alpha: 0 };
}

function activeElapsed(now: number, startedAt: number | null, durationMs: number): number | null {
  if (
    !Number.isFinite(now) ||
    startedAt === null ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }

  const elapsed = now - startedAt;
  return elapsed >= 0 && elapsed < durationMs ? elapsed : null;
}

function psiBattleAnimationFamilyForName(name: string | undefined): Exclude<PsiBattleAnimationFamily, "support"> | null {
  const normalized = name?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.includes("fire")) return "fire";
  if (normalized.includes("freeze") || normalized.includes("cold")) return "ice";
  if (normalized.includes("thunder") || normalized.includes("shock")) return "thunder";
  if (normalized.includes("flash")) return "flash";
  if (normalized.includes("starstorm") || normalized.includes("cosmic")) return "cosmic";
  if (normalized.includes("rockin") || normalized.includes("static") || normalized.includes("beam")) return "beam";
  return null;
}

function psiTypeTokens(type: string | undefined): Set<string> {
  return new Set((type ?? "").toLowerCase().match(/[a-z]+/g) ?? []);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
