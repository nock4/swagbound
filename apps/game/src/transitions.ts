import type { MapTransitionOverlayState } from "./mapTransition";
import swirlColoursTruth from "../../../content/rom-truth/swirl-colours.json";

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
const SCREEN_RECT_POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 }
];

type SwirlColoursTruth = {
  colours: { hex: string }[];
};

export const EB_SWIRL_PALETTE = (swirlColoursTruth as SwirlColoursTruth).colours.map((entry) =>
  parseHexColor(entry.hex)
);

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
  /** Optional swirl tint: first strike = green, ambush = red, catchable mon = amber. */
  advantageTint?: "party" | "enemy" | "catch";
}

export function drawMapTransitionOverlay(
  graphics: SwirlGraphics,
  overlay: MapTransitionOverlayState,
  width: number,
  height: number
): void {
  if (overlay.effect === "none") {
    return;
  }
  if (overlay.effect === "fade") {
    const alpha = clamp01(overlay.alpha);
    if (alpha <= 0) {
      return;
    }
    graphics.fillStyle(0x000000, alpha);
    graphics.fillRect(0, 0, width, height);
    return;
  }
  drawDirectionalWipe(graphics, overlay.coverage, overlay.direction, width, height);
}

/**
 * Draw the EarthBound-style colored battle swirl for a given progress (0 = clear, 1 = covered/black).
 * The recreated spiral geometry is colored with the extracted five-color EB battle-swirl palette. Shared
 * by the overworld encounter transition (cover -> black) and the battle scene (reveal from black).
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
      const color = options.advantageTint
        ? tintedBandColor(options.advantageTint, segment, arm)
        : swirlPaletteColor(segment, arm, clockMs);
      graphics.fillStyle(color, mask.bandAlpha);
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
    const color = options.advantageTint
      ? tintedHighlightColor(options.advantageTint)
      : swirlPaletteColor(arm * 3, 1, clockMs + 180);
    graphics.lineStyle(3, color, highlightAlpha);
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

function tintedBandColor(tint: NonNullable<SwirlDrawOptions["advantageTint"]>, segment: number, arm: number): number {
  const party = [0x0a7f35, 0x20d96b, 0x71ff9d, 0x0f5f2a];
  const enemy = [0x7d1010, 0xd92c24, 0xff6a54, 0x5f0909];
  // Catchable mon: a warm amber swirl so the player reads "this is a catch, not a
  // fight" from the transition itself.
  const catchable = [0xb9720f, 0xe8a63d, 0xffcf6a, 0x7a4a0e];
  const palette = tint === "party" ? party : tint === "catch" ? catchable : enemy;
  return palette[(segment + arm) % palette.length] ?? palette[0];
}

function tintedHighlightColor(tint: NonNullable<SwirlDrawOptions["advantageTint"]>): number {
  return tint === "party" ? 0xbaffd0 : tint === "catch" ? 0xffe6a8 : 0xffc2ba;
}

function drawDirectionalWipe(
  graphics: SwirlGraphics,
  coverage: number,
  direction: number,
  width: number,
  height: number
): void {
  const amount = clamp01(coverage);
  if (amount <= 0) {
    return;
  }
  if (amount >= 1) {
    graphics.fillStyle(0x000000, 1);
    graphics.fillRect(0, 0, width, height);
    return;
  }
  const vector = directionVector(direction);
  const points = SCREEN_RECT_POINTS.map((point) => ({ x: point.x * width, y: point.y * height }));
  const projections = points.map((point) => projection(point, vector));
  const min = Math.min(...projections);
  const max = Math.max(...projections);
  const threshold = min + (max - min) * amount;
  const polygon = clipPolygonByProjection(points, vector, threshold);
  if (polygon.length < 3) {
    return;
  }
  graphics.fillStyle(0x000000, 1);
  graphics.beginPath();
  graphics.moveTo(polygon[0].x, polygon[0].y);
  for (let index = 1; index < polygon.length; index += 1) {
    graphics.lineTo(polygon[index].x, polygon[index].y);
  }
  graphics.closePath();
  graphics.fillPath();
}

function clipPolygonByProjection(
  points: { x: number; y: number }[],
  vector: { x: number; y: number },
  threshold: number
): { x: number; y: number }[] {
  const output: { x: number; y: number }[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentProjection = projection(current, vector);
    const nextProjection = projection(next, vector);
    const currentInside = currentProjection <= threshold;
    const nextInside = nextProjection <= threshold;
    if (currentInside) {
      output.push(current);
    }
    if (currentInside !== nextInside) {
      const span = nextProjection - currentProjection;
      const t = span === 0 ? 0 : (threshold - currentProjection) / span;
      output.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t
      });
    }
  }
  return output;
}

function projection(point: { x: number; y: number }, vector: { x: number; y: number }): number {
  return point.x * vector.x + point.y * vector.y;
}

function directionVector(direction: number): { x: number; y: number } {
  const radians = (direction / 64) * TAU;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function swirlPaletteColor(segment: number, arm: number, clockMs: number): number {
  const frame = Math.floor(clockMs / 90);
  const index = positiveModulo(segment + arm * 2 + frame, EB_SWIRL_PALETTE.length);
  return EB_SWIRL_PALETTE[index] ?? 0x787878;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
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

function parseHexColor(value: string): number {
  return Number.parseInt(value.replace(/^#/, ""), 16);
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
