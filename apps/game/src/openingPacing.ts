export const OPENING_FLYOVER_ZOOM = 1.5;
export const OPENING_FLYOVER_END_ZOOM = 2.35;
export const OPENING_FLYOVER_ZOOM_IN_MS = 3_800;
// The real on-screen world rect at flyover zoom (512x448 canvas / 1.5): what the
// player actually sees around a shot center. Clamp margins and the night overlay
// derive from this so shot authoring stays honest about the visible window.
export const OPENING_FLYOVER_VIEW = {
  width: 512 / OPENING_FLYOVER_ZOOM,
  height: 448 / OPENING_FLYOVER_ZOOM
} as const;
export const OPENING_ERA_TITLE = "MORNINGSIDE, 202X";
export const OPENING_ERA_TITLE_HOLD_MS = 2_400;
export const OPENING_ERA_TITLE_FADE_MS = 1_200;
export const OPENING_RUMBLE_INTERVAL_MS = 3_000;
export const OPENING_RUMBLE_DURATION_MS = 450;
export const OPENING_RUMBLE_AMPLITUDE = 0.0015;
export const OPENING_WAKE_FADE_IN_MS = 750;
export const OPENING_WAKE_SIGNAL_FIRST_FLASH_MS = 1_000;
export const OPENING_WAKE_SIGNAL_SECOND_FLASH_MS = 1_750;
export const OPENING_KNOCK_DELAY_AFTER_WAKE_MS = 2_600;
export const OPENING_KNOCK_SFX_PATTERN_MS = 760;
export const OPENING_KNOCK_POST_SFX_HOLD_MS = 800;
export const OPENING_KNOCK_SFX_TO_DIALOGUE_MS = OPENING_KNOCK_SFX_PATTERN_MS + OPENING_KNOCK_POST_SFX_HOLD_MS;
export const OPENING_GET_UP_WALK_MS = 420;

export const OPENING_FLYOVER_SCENIC_BOUNDS = {
  minX: 1200,
  maxX: 2900,
  minY: 100,
  maxY: 2260
} as const;
// Clamp shot centers so the VISIBLE window stays inside the scenic bounds: the
// margin is exactly half the on-screen view per axis. (The old flat 400px margin
// was tuned for a different zoom and silently forbade the dense southern blocks.)
export const OPENING_FLYOVER_SAFE_CENTER_MARGIN_X = OPENING_FLYOVER_VIEW.width / 2;
export const OPENING_FLYOVER_SAFE_CENTER_MARGIN_Y = OPENING_FLYOVER_VIEW.height / 2;

export type OpeningFlyoverShot = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
  text: string;
};

export type OpeningFlyoverCue = {
  t: number;
  kind: "photo-flash" | "sync-turn" | "caption";
  text: string;
};

export const OPENING_FLYOVER_CUES: readonly OpeningFlyoverCue[] = [
  {
    t: 0.04,
    kind: "photo-flash",
    text: "MiFella saw another Bosch and took a picture."
  },
  {
    t: 0.42,
    kind: "sync-turn",
    text: "Across Morningside, strangers turned toward the same signal."
  },
  {
    t: 0.72,
    kind: "caption",
    text: "The picture reached MONS LINK before Bosch woke."
  }
] as const;

export const OPENING_FLYOVER_SHOTS: readonly OpeningFlyoverShot[] = [
  {
    // One continuous establishing move: begin over the MONS LINK arcade where
    // Bosch's first confrontation waits, travel east through his block, then end
    // centered on his house for the zoom and cut to the bedroom.
    from: { x: 1504, y: 1704 },
    to: { x: 2656, y: 344 },
    duration: 20_000,
    text: "Before sunrise, something wearing Bosch's face crossed Morningside."
  }
] as const;

export function clampOpeningFlyoverPoint(point: { x: number; y: number }): { x: number; y: number } {
  const minX = OPENING_FLYOVER_SCENIC_BOUNDS.minX + OPENING_FLYOVER_SAFE_CENTER_MARGIN_X;
  const maxX = OPENING_FLYOVER_SCENIC_BOUNDS.maxX - OPENING_FLYOVER_SAFE_CENTER_MARGIN_X;
  const minY = OPENING_FLYOVER_SCENIC_BOUNDS.minY + OPENING_FLYOVER_SAFE_CENTER_MARGIN_Y;
  const maxY = OPENING_FLYOVER_SCENIC_BOUNDS.maxY - OPENING_FLYOVER_SAFE_CENTER_MARGIN_Y;
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY)
  };
}

/** World-space rect the flyover night tint must cover: the scenic bounds plus the
 * full visible window, so no pan can out-run the overlay. */
export function openingFlyoverNightRect(): { x: number; y: number; width: number; height: number } {
  const b = OPENING_FLYOVER_SCENIC_BOUNDS;
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    width: b.maxX - b.minX + OPENING_FLYOVER_VIEW.width * 2,
    height: b.maxY - b.minY + OPENING_FLYOVER_VIEW.height * 2
  };
}

export function shouldRunOverworldRoamers(introMusicHold: boolean): boolean {
  return !introMusicHold;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
