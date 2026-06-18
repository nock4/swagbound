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
export const DEFAULT_ENEMY_WOBBLE_AMP_PX = 1.5;
export const DEFAULT_ENEMY_WOBBLE_PERIOD_MS = 1600;
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

export function wobbleOffset(
  now: number,
  enemyIndex: number,
  ampPx: number = DEFAULT_ENEMY_WOBBLE_AMP_PX,
  periodMs: number = DEFAULT_ENEMY_WOBBLE_PERIOD_MS
): WobbleEffectOffset {
  if (!Number.isFinite(now) || !Number.isFinite(enemyIndex) || !Number.isFinite(ampPx) || !Number.isFinite(periodMs)) {
    return { dx: 0, dy: 0 };
  }
  const amplitude = Math.max(0, ampPx);
  if (amplitude === 0 || periodMs <= 0) {
    return { dx: 0, dy: 0 };
  }

  const phase = (now / periodMs) * TAU + Math.floor(enemyIndex) * TAU * 0.37;
  return {
    dx: Math.sin(phase) * amplitude,
    dy: Math.sin(phase + Math.PI / 2) * amplitude * 0.35
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
