import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CondimentPairsSchema } from "../src/index";

describe("CondimentPairsSchema", () => {
  it("parses the authored condiment pair overlay", () => {
    const parsed = CondimentPairsSchema.parse(JSON.parse(readFileSync(
      new URL("../../../content/condiment-pairs.json", import.meta.url),
      "utf8"
    )));

    expect(parsed.entries).toHaveLength(43);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.entries.find((entry) => entry.baseItemId === 89)).toMatchObject({
      condimentItemIds: [126, 118],
      healMultiplier: 2
    });
  });

  it("rejects duplicate base item ids", () => {
    const parsed = CondimentPairsSchema.safeParse({
      schema: "swagbound.condiment-pairs.v1",
      entries: [
        {
          baseItemId: 89,
          baseName: "Route Snack",
          ebBase: "BAG_OF_FRIES",
          condimentItemIds: [118],
          condimentNames: ["Permit Packet"],
          ebCondiments: ["KETCHUP_PACKET"],
          healMultiplier: 2
        },
        {
          baseItemId: 89,
          baseName: "Route Snack",
          ebBase: "BAG_OF_FRIES",
          condimentItemIds: [126],
          condimentNames: ["Charter Sauce"],
          ebCondiments: ["JAR_OF_DELISAUCE"],
          healMultiplier: 2
        }
      ],
      skipped: []
    });

    expect(parsed.success).toBe(false);
  });
});
