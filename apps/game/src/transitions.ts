export type SwirlMask = {
  progress: number;
  coverage: number;
  revealRadiusRatio: number;
  rotationRadians: number;
  spiralPitch: number;
  armCount: number;
  bandCount: number;
  baseAlpha: number;
  bandAlpha: number;
  clear: boolean;
  fullyCovered: boolean;
};

const TAU = Math.PI * 2;

export function swirlMask(progress: number): SwirlMask {
  const t = clamp01(progress);
  const eased = smoothstep(t);
  const coverage = 1 - eased;
  return {
    progress: t,
    coverage,
    revealRadiusRatio: eased * 1.18,
    rotationRadians: t * TAU * 1.65,
    spiralPitch: 2.85 + coverage * 1.35,
    armCount: 4,
    bandCount: 22,
    baseAlpha: coverage,
    bandAlpha: Math.min(1, 0.68 + coverage * 0.32),
    clear: t >= 1,
    fullyCovered: t <= 0
  };
}

/** Minimal Phaser.GameObjects.Graphics surface — keeps this module Phaser-free + unit-testable. */
export interface SwirlGraphics {
  fillStyle(color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, width: number, height: number): unknown;
  beginPath(): unknown;
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
  fillPath(): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  strokePath(): unknown;
}

export interface SwirlDrawOptions {
  /** Swirl center (defaults to screen center). */
  cx?: number;
  cy?: number;
  /** Animation clock (ms) so the colors + highlights cycle over time. */
  clockMs?: number;
}

/**
 * Draw the EarthBound-style colored battle swirl for a given progress (0 = clear, 1 = covered/black).
 * Vivid hue-cycling spiral bands over a darkening base, with bright cycling arm highlights. Shared by
 * the overworld encounter transition (cover -> black) and the battle scene (reveal from black).
 */
export function drawSwirl(
  graphics: SwirlGraphics,
  progress: number,
  width: number,
  height: number,
  options: SwirlDrawOptions = {}
): void {
  const mask = swirlMask(progress);
  if (mask.clear) {
    return;
  }
  const cx = options.cx ?? width / 2;
  const cy = options.cy ?? height / 2;
  const clockMs = options.clockMs ?? 0;
  const maxRadius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));

  graphics.fillStyle(0x040406, mask.baseAlpha);
  graphics.fillRect(0, 0, width, height);
  if (mask.fullyCovered) {
    return;
  }

  const armSpan = TAU / mask.armCount;
  const segmentOverscan = 1.1 / mask.bandCount;
  for (let arm = 0; arm < mask.armCount; arm += 1) {
    for (let segment = 0; segment < mask.bandCount; segment += 1) {
      const innerRatio = Math.max(mask.revealRadiusRatio, segment / mask.bandCount);
      const outerRatio = Math.min(1.32, (segment + 1) / mask.bandCount + segmentOverscan);
      if (outerRatio <= mask.revealRadiusRatio) {
        continue;
      }
      const centerRatio = (innerRatio + outerRatio) / 2;
      const angle = mask.rotationRadians + arm * armSpan + centerRatio * mask.spiralPitch * TAU;
      const span = armSpan * (0.18 + mask.coverage * 0.18);
      const inner = innerRatio * maxRadius;
      const outer = outerRatio * maxRadius + 22 * mask.coverage;
      const points = [
        polarPoint(cx, cy, inner, angle - span * 0.58),
        polarPoint(cx, cy, outer, angle - span * 0.38),
        polarPoint(cx, cy, outer, angle + span * 0.38),
        polarPoint(cx, cy, inner, angle + span * 0.58)
      ];
      // vivid hue cycling by segment + arm + time (the EB multicolor swirl)
      const hue = wrap01(segment / mask.bandCount + arm / mask.armCount + clockMs / 700);
      graphics.fillStyle(hsvToHex(hue, 0.85, segment % 2 === 0 ? 1 : 0.74), mask.bandAlpha);
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        graphics.lineTo(points[index].x, points[index].y);
      }
      graphics.closePath();
      graphics.fillPath();
    }
  }

  const highlightAlpha = 0.4 * mask.coverage;
  if (highlightAlpha <= 0) {
    return;
  }
  for (let arm = 0; arm < mask.armCount; arm += 1) {
    const hue = wrap01(arm / mask.armCount + clockMs / 500 + 0.3);
    graphics.lineStyle(3, hsvToHex(hue, 0.55, 1), highlightAlpha);
    graphics.beginPath();
    let started = false;
    for (let segment = 0; segment <= mask.bandCount; segment += 1) {
      const ratio = segment / mask.bandCount;
      if (ratio < mask.revealRadiusRatio) {
        continue;
      }
      const radius = ratio * maxRadius;
      const angle = mask.rotationRadians + arm * armSpan + ratio * mask.spiralPitch * TAU;
      const point = polarPoint(cx, cy, radius, angle);
      if (!started) {
        graphics.moveTo(point.x, point.y);
        started = true;
      } else {
        graphics.lineTo(point.x, point.y);
      }
    }
    if (started) {
      graphics.strokePath();
    }
  }
}

function polarPoint(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/** h,s,v in 0..1 -> packed 0xRRGGBB. */
function hsvToHex(h: number, s: number, v: number): number {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r: number, g: number, b: number;
  switch (((i % 6) + 6) % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
