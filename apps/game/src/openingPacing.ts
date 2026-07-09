export const OPENING_FLYOVER_ZOOM = 1.5;
export const OPENING_SHOT_ZERO_CENTER = { x: 2050, y: 1450 } as const;
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
export const OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX = 400;

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
    from: { x: 1980, y: 1420 },
    to: { x: 2080, y: 1580 },
    duration: 9_000,
    text: "Something reads the town, street by street, and calls the reading love."
  },
  {
    // Southern market block: NPC-heavy storefronts and doors on the main strip.
    from: { x: 1600, y: 1600 },
    to: { x: 1660, y: 1732 },
    duration: 9_000,
    text: "Tonight one signal came back wearing your name."
  }
] as const;

export function clampOpeningFlyoverPoint(point: { x: number; y: number }): { x: number; y: number } {
  const minX = OPENING_FLYOVER_SCENIC_BOUNDS.minX + OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
  const maxX = OPENING_FLYOVER_SCENIC_BOUNDS.maxX - OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
  const minY = OPENING_FLYOVER_SCENIC_BOUNDS.minY + OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
  const maxY = OPENING_FLYOVER_SCENIC_BOUNDS.maxY - OPENING_FLYOVER_SAFE_CENTER_MARGIN_PX;
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY)
  };
}

export function shouldRunOverworldRoamers(introMusicHold: boolean): boolean {
  return !introMusicHold;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
