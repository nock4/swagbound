import { describe, expect, it } from "vitest";
import { FgOverridesSchema } from "../src/index";

describe("FgOverridesSchema", () => {
  it("parses foreground clear rectangles in world pixels", () => {
    const parsed = FgOverridesSchema.parse({
      schema: "swagbound.fg-overrides.v1",
      clears: [
        { x: 7600, y: 992, w: 16, h: 24, note: "lower plant foreground" }
      ]
    });

    expect(parsed.clears[0]).toMatchObject({ x: 7600, y: 992, w: 16, h: 24 });
  });

  it("rejects non-positive clear dimensions", () => {
    expect(FgOverridesSchema.safeParse({
      schema: "swagbound.fg-overrides.v1",
      clears: [
        { x: 7600, y: 992, w: 0, h: 24 }
      ]
    }).success).toBe(false);
  });
});
