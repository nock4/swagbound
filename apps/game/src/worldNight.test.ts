import { describe, expect, it } from "vitest";
import { ACT1_COMPLETE_FLAG, ROUTE_OPEN_FLAG, shouldUseAct1Night } from "./worldNight";

function flags(values: string[]) {
  return { has: (flag: string) => values.includes(flag) };
}

describe("shouldUseAct1Night", () => {
  it("keeps Act 1 outdoors at night until the route opens", () => {
    expect(shouldUseAct1Night({ flags: flags([]), indoors: false })).toBe(true);
    expect(shouldUseAct1Night({ flags: flags([ROUTE_OPEN_FLAG]), indoors: false })).toBe(false);
  });

  it("turns off indoors and outside Act 1", () => {
    expect(shouldUseAct1Night({ flags: flags([]), indoors: true })).toBe(false);
    expect(shouldUseAct1Night({ flags: flags([ACT1_COMPLETE_FLAG]), indoors: false })).toBe(false);
    expect(shouldUseAct1Night({ flags: flags(["act2:begun"]), indoors: false })).toBe(false);
  });
});
