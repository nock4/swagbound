import { describe, expect, it } from "vitest";
import { OverworldInteractablesSchema } from "../src/index";

describe("OverworldInteractablesSchema", () => {
  it("parses sign, present, and examine hotspots", () => {
    const parsed = OverworldInteractablesSchema.parse({
      schema: "swagbound.overworld-interactables.v1",
      interactables: [
        {
          id: "sign",
          kind: "sign",
          worldPixel: { x: 100, y: 120 },
          pages: ["Read me."]
        },
        {
          id: "present",
          kind: "present",
          label: "Gift box",
          worldPixel: { x: 120, y: 120 },
          item: { char: 1, item: 88 },
          openedPages: ["Empty."]
        },
        {
          id: "examine",
          kind: "examine",
          worldPixel: { x: 140, y: 120 },
          sprite: "assets/swagbound/props/intake-ledger.png",
          pages: ["Flavor."]
        }
      ]
    });

    expect(parsed.interactables.map((entry) => entry.kind)).toEqual(["sign", "present", "examine"]);
    expect(parsed.interactables[1]).toMatchObject({
      id: "present",
      item: { char: 1, item: 88 }
    });
    expect(parsed.interactables[2]).toMatchObject({
      id: "examine",
      sprite: "assets/swagbound/props/intake-ledger.png"
    });
  });

  it("rejects duplicate ids and signs without pages", () => {
    expect(OverworldInteractablesSchema.safeParse({
      schema: "swagbound.overworld-interactables.v1",
      interactables: [
        {
          id: "same",
          kind: "present",
          worldPixel: { x: 100, y: 120 },
          item: { char: 1, item: 88 }
        },
        {
          id: "same",
          kind: "examine",
          worldPixel: { x: 120, y: 120 },
          pages: ["Flavor."]
        }
      ]
    }).success).toBe(false);

    expect(OverworldInteractablesSchema.safeParse({
      schema: "swagbound.overworld-interactables.v1",
      interactables: [
        {
          id: "empty-sign",
          kind: "sign",
          worldPixel: { x: 100, y: 120 },
          pages: []
        }
      ]
    }).success).toBe(false);
  });
});
