export const ROUTE_OPEN_FLAG = "signal:route_open";
export const ACT1_COMPLETE_FLAG = "act1:complete";
const AFTER_ACT1_FLAGS = ["act2:begun", "act2:complete", "act3:begun", "act3:complete", "raid:morningside:active"];

export type NightFlagReader = {
  has(flag: string): boolean;
};

export type Act1NightInput = {
  flags: NightFlagReader;
};

export function shouldUseAct1Night(input: Act1NightInput): boolean {
  return !input.flags.has(ROUTE_OPEN_FLAG)
    && !input.flags.has(ACT1_COMPLETE_FLAG)
    && AFTER_ACT1_FLAGS.every((flag) => !input.flags.has(flag));
}

export function shouldHoldAct1IntroMusic(flags: NightFlagReader): boolean {
  return !flags.has(ROUTE_OPEN_FLAG);
}
