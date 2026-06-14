export type FlashEffectState = {
  active: boolean;
  intensity: number;
};

export type WobbleEffectOffset = {
  dx: number;
  dy: number;
};

export const DEFAULT_DAMAGE_FLASH_MS = 190;
export const DEFAULT_ENEMY_WOBBLE_AMP_PX = 1.5;
export const DEFAULT_ENEMY_WOBBLE_PERIOD_MS = 1600;

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

function inactiveFlash(): FlashEffectState {
  return { active: false, intensity: 0 };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
