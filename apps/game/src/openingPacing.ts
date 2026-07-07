export const OPENING_FLYOVER_ZOOM = 1.5;
export const OPENING_SHOT_ZERO_CENTER = { x: 2050, y: 1450 } as const;
export const OPENING_SHOT_ZERO_HOLD_MS = 26_000;
export const OPENING_ERA_TITLE = "MORNINGSIDE, 202X";
export const OPENING_ERA_TITLE_HOLD_MS = 6_000;
export const OPENING_ERA_TITLE_FADE_MS = 2_000;
export const OPENING_RUMBLE_INTERVAL_MS = 6_000;
export const OPENING_RUMBLE_DURATION_MS = 450;
export const OPENING_RUMBLE_AMPLITUDE = 0.0015;
export const OPENING_WAKE_FADE_IN_MS = 750;
export const OPENING_WAKE_SIGNAL_FIRST_FLASH_MS = 1_000;
export const OPENING_WAKE_SIGNAL_SECOND_FLASH_MS = 1_750;
export const OPENING_KNOCK_DELAY_AFTER_WAKE_MS = 2_600;
export const OPENING_GET_UP_WALK_MS = 420;

export type OpeningFlyoverShot = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  duration: number;
  text: string;
};

export const OPENING_FLYOVER_SHOTS: readonly OpeningFlyoverShot[] = [
  {
    from: { x: 1600, y: 900 },
    to: { x: 2200, y: 1150 },
    duration: 9_000,
    text: "Morningside files its dreams before it dreams them."
  },
  {
    from: { x: 2400, y: 1750 },
    to: { x: 3050, y: 2050 },
    duration: 9_000,
    text: "Something reads the town, street by street, and calls the reading love."
  },
  {
    from: { x: 2900, y: 1300 },
    to: { x: 2300, y: 1650 },
    duration: 9_000,
    text: "Tonight one signal came back wearing your name."
  }
] as const;

export function shouldRunOverworldRoamers(introMusicHold: boolean): boolean {
  return !introMusicHold;
}
