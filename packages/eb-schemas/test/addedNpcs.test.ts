import { describe, expect, it } from "vitest";
import {
  ADDED_NPC_MIN_ID,
  AddedNpcsSchema,
  CustomDialogueSchema,
  DrifellaBarksSchema,
  NpcOverridesSchema,
  sanitizeAddedNpcs,
  SpriteOverridesSchema
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
        alwaysSpawn: true,
        requireFlags: ["intro:wake-done"],
        blockFlags: ["intro:morning"],
        interaction: { pages: ["Welcome."], shop: 2 }
      }]
    });

    expect(parsed.npcs[0]).toMatchObject({
      id: ADDED_NPC_MIN_ID,
      alwaysSpawn: true,
      requireFlags: ["intro:wake-done"],
      blockFlags: ["intro:morning"],
      interaction: { pages: ["Welcome."], shop: 2 }
    });
  });

  it("accepts positioning placeholders without interactions", () => {
    const parsed = AddedNpcsSchema.parse({
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: ADDED_NPC_MIN_ID,
        worldPixel: { x: 128, y: 256 },
        spriteGroup: 59,
        facing: "down"
      }]
    });

    expect(parsed.npcs[0]).toMatchObject({
      id: ADDED_NPC_MIN_ID,
      worldPixel: { x: 128, y: 256 },
      spriteGroup: 59,
      facing: "down"
    });
    expect(parsed.npcs[0].interaction).toBeUndefined();
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

describe("sanitizeAddedNpcs (per-entry guard)", () => {
  const valid = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    worldPixel: { x: 64, y: 64 },
    spriteGroup: 5,
    facing: "down",
    ...extra
  });

  it("keeps valid entries and drops ONLY the invalid one (the outage's exact cause)", () => {
    // A single pages+ref conflict once rejected the whole file and blanked every NPC.
    const { value, dropped } = sanitizeAddedNpcs({
      schema: "swagbound.added-npcs.v1",
      npcs: [
        valid(ADDED_NPC_MIN_ID),
        valid(ADDED_NPC_MIN_ID + 1, { interaction: { pages: ["Hi."], ref: "library:entry" } }),
        valid(ADDED_NPC_MIN_ID + 2, { interaction: { pages: ["Kept."] } })
      ]
    });

    expect(value.npcs.map((n) => n.id)).toEqual([ADDED_NPC_MIN_ID, ADDED_NPC_MIN_ID + 2]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]).toMatchObject({ index: 1, id: ADDED_NPC_MIN_ID + 1 });
  });

  it("drops duplicate ids (keeping the first) and reports them", () => {
    const { value, dropped } = sanitizeAddedNpcs({
      schema: "swagbound.added-npcs.v1",
      npcs: [valid(ADDED_NPC_MIN_ID), valid(ADDED_NPC_MIN_ID, { facing: "up" })]
    });

    expect(value.npcs).toHaveLength(1);
    expect(value.npcs[0].facing).toBe("down");
    expect(dropped[0].reason).toContain("duplicate");
  });

  it("returns an empty overlay (not a throw) for an unusable envelope", () => {
    expect(sanitizeAddedNpcs(null).value.npcs).toEqual([]);
    expect(sanitizeAddedNpcs({ schema: "wrong", npcs: [] }).value.npcs).toEqual([]);
    expect(sanitizeAddedNpcs({ schema: "swagbound.added-npcs.v1", npcs: "nope" }).value.npcs).toEqual([]);
  });

  it("preserves a clean overlay unchanged with no drops", () => {
    const { value, dropped } = sanitizeAddedNpcs({
      schema: "swagbound.added-npcs.v1",
      comment: "keep me",
      npcs: [valid(ADDED_NPC_MIN_ID, { interaction: { pages: ["Hi."], shop: 2 } })]
    });

    expect(dropped).toHaveLength(0);
    expect(value.comment).toBe("keep me");
    expect(value.npcs).toHaveLength(1);
  });
});

describe("CustomDialogueSchema shop entries", () => {
  it("accepts pages, refs, shop-only, heal, save, and composed service entries", () => {
    const parsed = CustomDialogueSchema.parse({
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: {
        "1": { pages: ["Inline."] },
        "2": { ref: "library:entry" },
        "3": { shop: 12 },
        "4": { pages: ["Shopkeeper."], shop: 12 },
        "5": { heal: "full" },
        "6": { pages: ["Rest."], heal: true, save: true },
        "7": { ref: "library:item", give: { char: 1, item: 54, once: true } }
      },
      byTextPointer: {
        "data_00.l_0x1": { shop: 7 }
      }
    });

    expect(parsed.byNpcId["3"].shop).toBe(12);
    expect(parsed.byNpcId["4"]).toMatchObject({ pages: ["Shopkeeper."], shop: 12 });
    expect(parsed.byNpcId["5"].heal).toBe("full");
    expect(parsed.byNpcId["6"]).toMatchObject({ pages: ["Rest."], heal: true, save: true });
    expect(parsed.byNpcId["7"].give).toEqual({ char: 1, item: 54, once: true });
  });

  it("rejects empty entries, entries with both pages and ref, and false service triggers", () => {
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

    expect(CustomDialogueSchema.safeParse({
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: { "1": { heal: false } },
      byTextPointer: {}
    }).success).toBe(false);
  });
});

describe("DrifellaBarksSchema", () => {
  it("parses the generated NPC-bark phrase pool", () => {
    const parsed = DrifellaBarksSchema.parse({
      schema: "swagbound.drifella-barks.v1",
      comment: "test pool",
      phrases: ["TAKE ALL YOUR MONEY OUT OF THE BANK", "wake up we gotta turn the power on"]
    });

    expect(parsed.phrases).toEqual([
      "TAKE ALL YOUR MONEY OUT OF THE BANK",
      "wake up we gotta turn the power on"
    ]);
  });

  it("rejects an empty phrase pool", () => {
    expect(DrifellaBarksSchema.safeParse({
      schema: "swagbound.drifella-barks.v1",
      phrases: []
    }).success).toBe(false);
  });
});

describe("NpcOverridesSchema", () => {
  it("parses hidden and repositioned map NPC overrides keyed by NPC id", () => {
    const parsed = NpcOverridesSchema.parse({
      schema: "swagbound.npc-overrides.v1",
      byNpcId: {
        "111": { worldPixel: { x: 7248, y: 1016 } },
        "112": { hide: true }
      }
    });

    expect(parsed.byNpcId["111"].worldPixel).toEqual({ x: 7248, y: 1016 });
    expect(parsed.byNpcId["112"].hide).toBe(true);
  });

  it("rejects non-numeric NPC ids and unknown override fields", () => {
    expect(NpcOverridesSchema.safeParse({
      schema: "swagbound.npc-overrides.v1",
      byNpcId: {
        clerk: { hide: true }
      }
    }).success).toBe(false);

    expect(NpcOverridesSchema.safeParse({
      schema: "swagbound.npc-overrides.v1",
      byNpcId: {
        "111": { worldPixel: { x: 7248, y: 1016 }, spriteGroup: 5 }
      }
    }).success).toBe(false);
  });
});

describe("SpriteOverridesSchema", () => {
  it("parses a player override and future NPC/enemy override maps", () => {
    const parsed = SpriteOverridesSchema.parse({
      schema: "swagbound.sprite-overrides.v1",
      player: {
        image: "assets/swagbound/hero/lsw-2821-walk.png",
        frameWidth: 192,
        frameHeight: 192,
        animations: {
          down: [0, 1, 2, 3],
          left: [4, 5, 6, 7],
          right: [8, 9, 10, 11],
          up: [12, 13, 14, 15]
        },
        displayHeight: 24,
        originX: 0.5,
        originY: 1
      },
      byNpcId: {
        "744": {
          image: "assets/swagbound/hero/lsw-2821-walk.png",
          frameWidth: 192,
          frameHeight: 192,
          animations: {
            down: [0],
            left: [4],
            right: [8],
            up: [12]
          }
        }
      },
      bySpriteGroup: {
        "12": {
          image: "assets/swagbound/overworld-npc/ai-slop.png",
          frameWidth: 48,
          frameHeight: 48,
          animations: {
            down: [0],
            left: [0],
            right: [0],
            up: [0]
          },
          displayHeight: 24,
          originX: 0.5,
          originY: 1
        }
      },
      byEnemyId: {}
    });

    expect(parsed.player?.animations?.down).toEqual([0, 1, 2, 3]);
    expect(parsed.byNpcId?.["744"].animations?.left).toEqual([4]);
    expect(parsed.bySpriteGroup?.["12"].animations?.down).toEqual([0]);
  });

  it("accepts single-image enemy overrides without sheet frame fields", () => {
    const parsed = SpriteOverridesSchema.parse({
      schema: "swagbound.sprite-overrides.v1",
      byEnemyId: {
        "37": {
          image: "assets/swagbound/enemy/malady-battle-v1-alpha-extracted-source-size.png",
          displayHeight: 160,
          displayWidth: 200,
          originX: 0.5,
          originY: 0.5
        }
      }
    });

    expect(parsed.byEnemyId?.["37"]).toMatchObject({
      image: "assets/swagbound/enemy/malady-battle-v1-alpha-extracted-source-size.png",
      displayHeight: 160,
      displayWidth: 200
    });
    expect(parsed.byEnemyId?.["37"].frameWidth).toBeUndefined();
    expect(parsed.byEnemyId?.["37"].animations).toBeUndefined();
  });

  it("accepts a single-frame static NPC sprite override", () => {
    const parsed = SpriteOverridesSchema.parse({
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: {
        "100100": {
          image: "assets/swagbound/npc/npc-neighbor.png",
          frameWidth: 80,
          frameHeight: 80,
          animations: {
            down: [0]
          },
          displayHeight: 24,
          originX: 0.5,
          originY: 1
        }
      }
    });

    expect(parsed.byNpcId?.["100100"].animations).toEqual({
      down: [0]
    });
  });

  it("rejects invalid frame sequences and paths outside public assets", () => {
    expect(SpriteOverridesSchema.safeParse({
      schema: "swagbound.sprite-overrides.v1",
      player: {
        image: "../private/hero.png",
        frameWidth: 192,
        frameHeight: 192,
        animations: {
          down: [0],
          left: [4],
          right: [8],
          up: [12]
        }
      }
    }).success).toBe(false);

    expect(SpriteOverridesSchema.safeParse({
      schema: "swagbound.sprite-overrides.v1",
      player: {
        image: "assets/swagbound/hero/lsw-2821-walk.png",
        frameWidth: 192,
        frameHeight: 192,
        animations: {
          down: [],
          left: [4],
          right: [8],
          up: [12]
        }
      }
    }).success).toBe(false);

    expect(SpriteOverridesSchema.safeParse({
      schema: "swagbound.sprite-overrides.v1",
      byEnemyId: {
        "37": {
          image: "assets/swagbound/enemy/malady-battle-v1-alpha-extracted-source-size.png",
          frameWidth: 260
        }
      }
    }).success).toBe(false);

    expect(SpriteOverridesSchema.safeParse({
      schema: "swagbound.sprite-overrides.v1",
      bySpriteGroup: {
        person: {
          image: "assets/swagbound/overworld-npc/ai-slop.png",
          frameWidth: 48,
          frameHeight: 48,
          animations: {
            down: [0],
            left: [0],
            right: [0],
            up: [0]
          }
        }
      }
    }).success).toBe(false);
  });
});
