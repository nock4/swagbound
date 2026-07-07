export const OPENING_FLYOVER_ZOOM = 1.5;
export const OPENING_SHOT_ZERO_CENTER = { x: 2050, y: 1450 } as const;
export const OPENING_SHOT_ZERO_HOLD_MS = 26_000;
export const OPENING_ERA_TITLE = "MORNINGSIDE, 202X";
export const OPENING_ERA_TITLE_HOLD_MS = 6_000;
export const OPENING_ERA_TITLE_FADE_MS = 2_000;
export const OPENING_RUMBLE_INTERVAL_MS = 6_000;
export const OPENING_RUMBLE_DURATION_MS = 450;
export const OPENING_RUMBLE_AMPLITUDE = 0.0015;
export const OPENING_BEDROOM_MUSIC_DROPOUT_FADE_MS = 600;
export const OPENING_WAKE_FADE_IN_MS = 750;
export const OPENING_WAKE_SIGNAL_FIRST_FLASH_MS = 1_000;
export const OPENING_WAKE_SIGNAL_SECOND_FLASH_MS = 1_750;
export const OPENING_KNOCK_DELAY_AFTER_WAKE_MS = 2_600;
export const OPENING_GET_UP_WALK_MS = 420;

export function shouldRunOverworldRoamers(introMusicHold: boolean): boolean {
  return !introMusicHold;
}
