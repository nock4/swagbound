import { describe, expect, it } from "vitest";
import {
  ADDED_NPC_MIN_ID,
  AddedNpcsSchema,
  CustomDialogueSchema
} from "../src/index";

describe("AddedNpcsSchema", () => {
  it("parses an added NPC overlay with synthetic ids and interactions", () => {
    const parsed = AddedNpcsSchema.parse({
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: ADDED_NPC_MIN_ID,
        worldPixel: { x: 128, y: 256 },
        spriteGroup: 5,
        facing: "down",
        interaction: { pages: ["Welcome."], shop: 2 }
      }]
    });

    expect(parsed.npcs[0]).toMatchObject({
      id: ADDED_NPC_MIN_ID,
      interaction: { pages: ["Welcome."], shop: 2 }
    });
  });

  it("rejects ids in the EarthBound NPC id range and duplicate synthetic ids", () => {
    expect(AddedNpcsSchema.safeParse({
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: 744,
        worldPixel: { x: 64, y: 64 },
        spriteGroup: 5,
        facing: "up",
        interaction: { shop: 1 }
      }]
    }).success).toBe(false);

    expect(AddedNpcsSchema.safeParse({
      schema: "swagbound.added-npcs.v1",
      npcs: [
        {
          id: ADDED_NPC_MIN_ID,
          worldPixel: { x: 64, y: 64 },
          spriteGroup: 5,
          facing: "up",
          interaction: { shop: 1 }
        },
        {
          id: ADDED_NPC_MIN_ID,
          worldPixel: { x: 96, y: 64 },
          spriteGroup: 5,
          facing: "left",
          interaction: { pages: ["Duplicate."] }
        }
      ]
    }).success).toBe(false);
  });
});

describe("CustomDialogueSchema shop entries", () => {
  it("accepts pages, refs, shop-only, and pages plus shop entries", () => {
    const parsed = CustomDialogueSchema.parse({
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: {
        "1": { pages: ["Inline."] },
        "2": { ref: "library:entry" },
        "3": { shop: 12 },
        "4": { pages: ["Shopkeeper."], shop: 12 }
      },
      byTextPointer: {
        "data_00.l_0x1": { shop: 7 }
      }
    });

    expect(parsed.byNpcId["3"].shop).toBe(12);
    expect(parsed.byNpcId["4"]).toMatchObject({ pages: ["Shopkeeper."], shop: 12 });
  });

  it("rejects empty entries and entries with both pages and ref", () => {
    expect(CustomDialogueSchema.safeParse({
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: { "1": {} },
      byTextPointer: {}
    }).success).toBe(false);

    expect(CustomDialogueSchema.safeParse({
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: { "1": { pages: ["Inline."], ref: "library:entry" } },
      byTextPointer: {}
    }).success).toBe(false);
  });
});
