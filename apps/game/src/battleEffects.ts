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
const PSI_FLASH_COLOR_NEUTRAL = 0x8fe0d8;

const TAU = Math.PI * 2;

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
  const normalizedId = Number.isFinite(psiId) ? Math.floor(psiId) : 0;
  if (normalizedId >= 5 && normalizedId <= 8) {
    return PSI_FLASH_COLOR_FIRE;
  }
  if (normalizedId >= 9 && normalizedId <= 12) {
    return PSI_FLASH_COLOR_FREEZE;
  }
  if (normalizedId >= 13 && normalizedId <= 16) {
    return PSI_FLASH_COLOR_THUNDER;
  }
  if (normalizedId >= 17 && normalizedId <= 20) {
    return PSI_FLASH_COLOR_FLASH;
  }
  if (normalizedId >= 21 && normalizedId <= 24) {
    return PSI_FLASH_COLOR_STARSTORM;
  }
  return PSI_FLASH_COLOR_NEUTRAL;
}

export type PsiElementFlashProfile = {
  color: number;
  alpha: number;
  durationMs: number;
  pulses: number;
};

/**
 * Per-element PSI flash styling so each element *feels* distinct, not just a
 * different color: fire is a warm sustained wash, freeze a sharp cold snap,
 * thunder a fast strobe, flash a bright double-burst, starstorm a long twinkle.
 */
export function psiElementFlashProfile(psiId: number): PsiElementFlashProfile {
  const id = Number.isFinite(psiId) ? Math.floor(psiId) : 0;
  const color = psiElementFlashColor(id);
  if (id >= 5 && id <= 8) {
    return { color, alpha: 0.3, durationMs: 300, pulses: 1 };
  }
  if (id >= 9 && id <= 12) {
    return { color, alpha: 0.24, durationMs: 190, pulses: 1 };
  }
  if (id >= 13 && id <= 16) {
    return { color, alpha: 0.34, durationMs: 80, pulses: 3 };
  }
  if (id >= 17 && id <= 20) {
    return { color, alpha: 0.4, durationMs: 95, pulses: 2 };
  }
  if (id >= 21 && id <= 24) {
    return { color, alpha: 0.22, durationMs: 380, pulses: 1 };
  }
  return { color, alpha: 0.26, durationMs: 230, pulses: 1 };
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
