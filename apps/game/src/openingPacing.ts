export const OPENING_FLYOVER_ZOOM = 1.5;
// The real on-screen world rect at flyover zoom (512x448 canvas / 1.5): what the
// player actually sees around a shot center. Clamp margins and the night overlay
// derive from this so shot authoring stays honest about the visible window.
export const OPENING_FLYOVER_VIEW = {
  width: 512 / OPENING_FLYOVER_ZOOM,
  height: 448 / OPENING_FLYOVER_ZOOM
} as const;
// Era-title hold over the southern market strip (Slice / Mons Link / cafe block):
// 7 NPCs + 3 doors + stamped storefronts in view, per the world.json density scan.
export const OPENING_SHOT_ZERO_CENTER = { x: 1630, y: 1666 } as const;
export const OPENING_SHOT_ZERO_HOLD_MS = 4_000;
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
  maxX: 2480,
  minY: 800,
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

export const OPENING_FLYOVER_SHOTS: readonly OpeningFlyoverShot[] = [
  {
    // Northern shop cluster: stamped storefronts, nearby doors, and visible NPCs.
    from: { x: 1600, y: 1200 },
    to: { x: 1700, y: 1240 },
    duration: 9_000,
    text: "Morningside files its dreams before it dreams them."
  },
  {
    // Civic hotel block: a separate dense cluster east of the northern shops.
    // (Shot zero now holds the market strip, so this block appears exactly once.)
    from: { x: 1980, y: 1420 },
    to: { x: 2080, y: 1580 },
    duration: 9_000,
    text: "Something reads the town, street by street, and calls the reading love."
  },
  {
    // Southern market strip again, panning this time: bookends the era-title hold
    // 20+ seconds earlier, and the "signal wearing your name" line lands here just
    // before the descent to bed. NOTE (2026-07-09 frame pass): the blocks further
    // south scored 5-9 NPCs in the density scan but are VISUALLY the town-entrance
    // trail (roadblocks, forest edge) - keep pans off them; trust frames over counts.
    from: { x: 1600, y: 1600 },
    to: { x: 1660, y: 1732 },
    duration: 9_000,
    text: "Tonight one signal came back wearing your name."
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
