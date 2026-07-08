import { describe, expect, it } from "vitest";
import { RoamerZoneCapsSchema } from "../src/index";

describe("RoamerZoneCapsSchema", () => {
  it("parses world-pixel rects with allowed battle group ids", () => {
    const parsed = RoamerZoneCapsSchema.parse({
      schema: "swagbound.roamer-zone-caps.v1",
      zones: [{
        id: "act1",
        rect: { x: 0, y: 0, w: 4096, h: 4096 },
        allowedGroups: [1, 2, 3]
      }]
    });

    expect(parsed.zones[0]?.allowedGroups).toEqual([1, 2, 3]);
  });

  it("rejects empty allow-lists and invalid rect sizes", () => {
    expect(RoamerZoneCapsSchema.safeParse({
      schema: "swagbound.roamer-zone-caps.v1",
      zones: [{
        id: "act1",
        rect: { x: 0, y: 0, w: 4096, h: 4096 },
        allowedGroups: []
      }]
    }).success).toBe(false);

    expect(RoamerZoneCapsSchema.safeParse({
      schema: "swagbound.roamer-zone-caps.v1",
      zones: [{
        id: "act1",
        rect: { x: 0, y: 0, w: 0, h: 4096 },
        allowedGroups: [1]
      }]
    }).success).toBe(false);
  });
});
