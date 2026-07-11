export const ROUTE_OPEN_FLAG = "signal:route_open";
export const THRESHOLD_CLEARED_FLAG = "signal:threshold_cleared";
export const ACT1_COMPLETE_FLAG = "act1:complete";
/** FLG_ONET_DAYBREAK — EB flips Onett to day after the first sanctuary boss. */
export const EB_ONET_DAYBREAK_FLAG = 422;
const AFTER_ACT1_FLAGS = ["act2:begun", "act2:complete", "act3:begun", "act3:complete", "raid:morningside:active"];

export type NightFlagReader = {
  has(flag: string): boolean;
  /** Numeric EB event flags (optional so plain string-flag fakes still satisfy the reader). */
  isSet?(flag: number): boolean;
};

export type Act1NightInput = {
  flags: NightFlagReader;
};

export function shouldUseAct1Night(input: Act1NightInput): boolean {
  // EB structure (approved beat-sheet PROPOSAL 1): Morningside stays night until the
  // Malady falls at the first threshold — the moment FLG_ONET_DAYBREAK fires through
  // the flag-map bridge. The string flag is the fallback for readers without numeric
  // flag support; both fire on the same beat.
  const daybreak = input.flags.isSet?.(EB_ONET_DAYBREAK_FLAG)
    ?? input.flags.has(THRESHOLD_CLEARED_FLAG);
  return !daybreak
    && !input.flags.has(THRESHOLD_CLEARED_FLAG)
    && !input.flags.has(ACT1_COMPLETE_FLAG)
    && AFTER_ACT1_FLAGS.every((flag) => !input.flags.has(flag));
}

export function shouldHoldAct1IntroMusic(flags: NightFlagReader): boolean {
  return !flags.has(ROUTE_OPEN_FLAG);
}
