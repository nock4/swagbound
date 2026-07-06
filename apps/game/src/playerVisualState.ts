import type { SpriteOverlayName, SpriteStateName } from "@eb/schemas";

/**
 * Pure resolver for a hero's overworld visual state. The render layer feeds it the live game inputs
 * (terrain, KO/status, ride, cutscene/debug event, area palette) once per frame and gets back a single
 * description of how to draw the sprite: which base sheet, which whole-texture transforms, which head
 * overlays, and -- crucially -- a generic APPROXIMATION to apply when the skin has no faithful sheet for
 * the chosen state. EarthBound swaps whole sheets for these (see playable_char_gfx_table.yml); we mirror
 * that when art exists and degrade gracefully (tiny->scale, dead->fade) when it doesn't, so any skin
 * "does the same" functionally even before bespoke art lands. No Phaser/DOM here -- keep it pure.
 */

export interface VisualStateInputs {
  /** Party member is downed (overworld dead/ghost sprite). */
  ko: boolean;
  /** Cutscene sleep pose: renderer rotates the normal idle sprite without treating the hero as KO'd. */
  sleeping: boolean;
  /** Standing in deep water (waterline clip). */
  deepWater: boolean;
  /** Standing on an EB 0x01-only cell (tall grass, shrub top, roof crest): lower body obscured. */
  lowerBodyHidden: boolean;
  onLadder: boolean;
  onRope: boolean;
  /** Active ride, if any. */
  riding: "bike" | null;
  status: {
    tiny?: boolean;
    mushroomized?: boolean;
    possessed?: boolean;
    diamondized?: boolean;
    sweating?: boolean;
  };
  /**
   * A cutscene/debug-forced base state that isn't derivable from terrain/status
   * (sitting, falling, pajamas, robot, meditating, teleportBurnt). Highest priority.
   */
  event?: SpriteStateName | null;
  /** Moonside-style negative-palette area. */
  invertPalette: boolean;
  /** Mid PSI-Teleport (the spin/dash animation). */
  teleporting: boolean;
}

export interface ResolvedVisualState {
  baseState: SpriteStateName | "default";
  /** Applied by the render layer ONLY when the skin lacks a sheet for `baseState`. */
  approximation: { scale?: number; alpha?: number; desaturate?: boolean };
  transforms: { invertPalette: boolean; waterClip: boolean; lowerBodyClip: boolean; teleportSpin: boolean };
  overlays: SpriteOverlayName[];
  /** ladder/rope/sitting/sleeping hold a static pose instead of cycling the walk animation. */
  lockAnimation: boolean;
  sleeping: boolean;
}

/** Generic look-alikes used when a skin has no faithful sheet for the resolved state. */
const APPROXIMATION: Partial<Record<SpriteStateName, ResolvedVisualState["approximation"]>> = {
  tiny: { scale: 0.55 },
  tinyDead: { scale: 0.55, alpha: 0.5 },
  dead: { alpha: 0.5 },
  diamondized: { desaturate: true }
};

const LOCKED_STATES = new Set<SpriteStateName>(["ladder", "rope", "sitting", "sleeping"]);
/** States during which the player is normally upright in water (so the waterline clip applies). */
const WADEABLE = new Set<SpriteStateName | "default">(["default", "tiny"]);

function resolveBaseState(inputs: VisualStateInputs): SpriteStateName | "default" {
  if (inputs.event) return inputs.event; // cutscene/debug override wins
  if (inputs.ko) return inputs.status.tiny ? "tinyDead" : "dead";
  if (inputs.status.diamondized) return "diamondized";
  if (inputs.riding === "bike") return "bike";
  if (inputs.onLadder) return "ladder";
  if (inputs.onRope) return "rope";
  if (inputs.status.tiny) return "tiny";
  return "default";
}

export function resolvePlayerVisualState(inputs: VisualStateInputs): ResolvedVisualState {
  const baseState = resolveBaseState(inputs);

  // Head/companion overlays layer on top of any LIVING base; a downed hero shows no overlays.
  const overlays: SpriteOverlayName[] = [];
  if (!inputs.ko) {
    if (inputs.status.mushroomized) overlays.push("mushroom");
    if (inputs.status.possessed) overlays.push("possessionGhost");
    if (inputs.status.sweating) overlays.push("sweat");
  }

  return {
    baseState,
    approximation: { ...(APPROXIMATION[baseState as SpriteStateName] ?? {}) },
    transforms: {
      invertPalette: inputs.invertPalette,
      waterClip: inputs.deepWater && WADEABLE.has(baseState),
      // Water wins over grass when both apply (you are IN the water, not the grass).
      lowerBodyClip: inputs.lowerBodyHidden && !inputs.deepWater && WADEABLE.has(baseState),
      teleportSpin: inputs.teleporting && !inputs.ko && !inputs.sleeping
    },
    overlays,
    lockAnimation: inputs.sleeping || LOCKED_STATES.has(baseState as SpriteStateName),
    sleeping: inputs.sleeping
  };
}

/**
 * Frame-pixels to crop off a sprite's bottom for the 0x01 lower-body hide (~8 world px
 * of feet, converted through the skin's display scale). Clamped so oversized skins never
 * lose more than a third of the frame.
 */
export function lowerHideFramePx(frameHeight: number, scale: number): number {
  const framePx = Math.round(8 / (scale > 0 ? scale : 1));
  return Math.max(2, Math.min(framePx, Math.round(frameHeight / 3)));
}

/** Default inputs (plain walking, nothing applied) -- a convenience for callers/tests. */
export function defaultVisualStateInputs(): VisualStateInputs {
  return { ko: false, sleeping: false, deepWater: false, lowerBodyHidden: false, onLadder: false, onRope: false, riding: null, status: {}, event: null, invertPalette: false, teleporting: false };
}
