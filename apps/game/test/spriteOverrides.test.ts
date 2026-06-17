import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AddedNpcsSchema, SpriteOverridesSchema, type SpriteOverride, type SpriteOverrides } from "@eb/schemas";
import {
  spriteOverrideForNpcId,
  spriteOverrideDirectionFrames,
  spriteOverrideFrame,
  spriteOverrideNpcEntries,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteOverrideScale
} from "../src/spriteOverrides";

const HERO_OVERRIDE: SpriteOverride = {
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
};

const SINGLE_FRAME_NPC_OVERRIDE: SpriteOverride = {
  image: "assets/swagbound/npc/npc-neighbor.png",
  frameWidth: 80,
  frameHeight: 80,
  animations: {
    down: [0],
    left: [0],
    right: [0],
    up: [0]
  },
  displayHeight: 24,
  originX: 0.5,
  originY: 1
};

describe("sprite override helpers", () => {
  it("maps facing and walk step into the override frame sequence", () => {
    expect(spriteOverrideFrame("down", 1, HERO_OVERRIDE)).toBe(1);
    expect(spriteOverrideFrame("left", 0, HERO_OVERRIDE)).toBe(4);
    expect(spriteOverrideFrame("right", 5, HERO_OVERRIDE)).toBe(9);
    expect(spriteOverrideFrame("up", 8, HERO_OVERRIDE)).toBe(12);
  });

  it("exposes override animations as player frame sequences", () => {
    expect(spriteOverrideDirectionFrames(HERO_OVERRIDE)).toEqual({
      down: [0, 1, 2, 3],
      left: [4, 5, 6, 7],
      right: [8, 9, 10, 11],
      up: [12, 13, 14, 15]
    });
  });

  it("computes a uniform display-height scale from the source frame height", () => {
    expect(spriteOverrideScale(24, 192)).toBe(0.125);
    expect(spriteOverrideScale(undefined, 192)).toBe(1);
  });

  it("keeps single-frame NPC overrides static at frame 0 for every facing", () => {
    for (const facing of ["down", "left", "right", "up"] as const) {
      expect(spriteOverrideFrame(facing, 0, SINGLE_FRAME_NPC_OVERRIDE)).toBe(0);
      expect(spriteOverrideFrame(facing, 1, SINGLE_FRAME_NPC_OVERRIDE)).toBe(0);
      expect(spriteOverrideFrame(facing, 42, SINGLE_FRAME_NPC_OVERRIDE)).toBe(0);
    }
    expect(spriteOverrideDirectionFrames(SINGLE_FRAME_NPC_OVERRIDE)).toEqual({
      down: [0],
      left: [0],
      right: [0],
      up: [0]
    });
  });

  it("selects NPC overrides by numeric NPC id and exposes stable sheet keys", () => {
    const overrides: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: {
        "100100": SINGLE_FRAME_NPC_OVERRIDE
      }
    };

    expect(spriteOverrideForNpcId(overrides, 100100)).toBe(SINGLE_FRAME_NPC_OVERRIDE);
    expect(spriteOverrideForNpcId(overrides, 100101)).toBeUndefined();
    expect(spriteOverrideNpcEntries(overrides)).toEqual([[100100, SINGLE_FRAME_NPC_OVERRIDE]]);
    expect(spriteOverrideNpcSheetKey(100100)).toBe("sprite-override-npc-100100");
    expect(spriteOverrideNpcIdFromSheetKey("sprite-override-npc-100100")).toBe(100100);
    expect(spriteOverrideNpcIdFromSheetKey("sheet-100100")).toBeUndefined();
  });

  it("covers all generated placeholder NPC ids with neighbor/kid single-frame skins", async () => {
    const addedNpcs = AddedNpcsSchema.parse(JSON.parse(
      await readFile(resolve("content/added-npcs.json"), "utf8")
    ));
    const overrides = SpriteOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/sprite-overrides.json"), "utf8")
    ));
    const ids = addedNpcs.npcs.map((npc) => String(npc.id));
    const byNpcId = overrides.byNpcId ?? {};
    const allowedImages = [
      "assets/swagbound/npc/npc-neighbor.png",
      "assets/swagbound/npc/npc-kid.png"
    ];

    expect(overrides.player?.image).toBe("assets/swagbound/hero/lsw-2821-walk.png");
    expect(Object.keys(byNpcId).sort((a, b) => Number(a) - Number(b))).toEqual(ids);
    ids.forEach((id, index) => {
      const override = byNpcId[id];
      expect(override).toMatchObject({
        image: allowedImages[index % allowedImages.length],
        frameWidth: 80,
        frameHeight: 80,
        displayHeight: 24,
        originX: 0.5,
        originY: 1
      });
      expect(override?.animations).toEqual({
        down: [0],
        left: [0],
        right: [0],
        up: [0]
      });
    });
    expect(new Set(Object.values(byNpcId).map((override) => override.image))).toEqual(new Set(allowedImages));
  });
});
