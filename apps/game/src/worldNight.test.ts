import { describe, expect, it } from "vitest";
import { ACT1_COMPLETE_FLAG, ROUTE_OPEN_FLAG, shouldHoldAct1IntroMusic, shouldUseAct1Night } from "./worldNight";

function flags(values: string[]) {
  return { has: (flag: string) => values.includes(flag) };
}

describe("shouldUseAct1Night", () => {
  it("keeps Act 1 at night until the route opens", () => {
    expect(shouldUseAct1Night({ flags: flags([]) })).toBe(true);
    expect(shouldUseAct1Night({ flags: flags([ROUTE_OPEN_FLAG]) })).toBe(false);
  });

  it("turns off outside Act 1", () => {
    expect(shouldUseAct1Night({ flags: flags([ACT1_COMPLETE_FLAG]) })).toBe(false);
    expect(shouldUseAct1Night({ flags: flags(["act2:begun"]) })).toBe(false);
  });
});

describe("shouldHoldAct1IntroMusic", () => {
  it("holds the intro cue until signal:route_open", () => {
    expect(shouldHoldAct1IntroMusic(flags([]))).toBe(true);
    expect(shouldHoldAct1IntroMusic(flags([ACT1_COMPLETE_FLAG]))).toBe(true);
    expect(shouldHoldAct1IntroMusic(flags([ROUTE_OPEN_FLAG]))).toBe(false);
  });
});
