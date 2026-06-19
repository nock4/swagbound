import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AddedNpcsSchema, SpriteOverridesSchema, type SpriteOverride, type SpriteOverrides } from "@eb/schemas";
import {
  resolveSpriteOverrideImageFrame,
  spriteOverrideEnemyEntries,
  spriteOverrideEnemyImageKey,
  spriteOverrideForEnemyId,
  spriteOverrideForNpc,
  spriteOverrideForNpcId,
  spriteOverrideForSpriteGroup,
  spriteOverrideDirectionFrames,
  spriteOverrideFrame,
  spriteOverrideGroupEntries,
  spriteOverrideGroupSheetKey,
  spriteOverrideNpcEntries,
  spriteOverrideNpcIdFromSheetKey,
  spriteOverrideNpcSheetKey,
  spriteOverrideSpriteGroupFromSheetKey,
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

const GROUP_FRAME_NPC_OVERRIDE: SpriteOverride = {
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
};

const SINGLE_IMAGE_ENEMY_OVERRIDE: SpriteOverride = {
  image: "assets/swagbound/enemy/ai-slop-battle-v0.png",
  displayHeight: 160,
  originX: 0.5,
  originY: 0.5
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

  it("resolves single-image overrides as one whole-image frame fitted to a battle box", () => {
    const resolved = resolveSpriteOverrideImageFrame(
      SINGLE_IMAGE_ENEMY_OVERRIDE,
      { width: 260, height: 260 },
      { maxWidth: 420, maxHeight: 160, maxScale: 2 }
    );

    expect(resolved).toEqual({
      frameWidth: 260,
      frameHeight: 260,
      displayWidth: 160,
      displayHeight: 160,
      scale: 160 / 260
    });
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

  it("resolves NPC sprite overrides by NPC id before sprite group and uses hashed group sheet keys", () => {
    const overrides: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: {
        "100100": SINGLE_FRAME_NPC_OVERRIDE
      },
      bySpriteGroup: {
        "12": GROUP_FRAME_NPC_OVERRIDE
      }
    };
    const key = spriteOverrideGroupSheetKey(12, GROUP_FRAME_NPC_OVERRIDE.image);

    expect(spriteOverrideForNpc(overrides, 100100, 12)).toBe(SINGLE_FRAME_NPC_OVERRIDE);
    expect(spriteOverrideForNpc(overrides, 100101, 12)).toBe(GROUP_FRAME_NPC_OVERRIDE);
    expect(spriteOverrideForNpc(overrides, 100101, 13)).toBeUndefined();
    expect(spriteOverrideForSpriteGroup(overrides, 12)).toBe(GROUP_FRAME_NPC_OVERRIDE);
    expect(spriteOverrideForSpriteGroup(overrides, undefined)).toBeUndefined();
    expect(spriteOverrideGroupEntries(overrides)).toEqual([[12, GROUP_FRAME_NPC_OVERRIDE]]);
    expect(key).toBe(spriteOverrideGroupSheetKey(12, GROUP_FRAME_NPC_OVERRIDE.image));
    expect(key).toMatch(/^sprite-override-group-12-[0-9a-z]+$/);
    expect(key).not.toBe(spriteOverrideGroupSheetKey(12, "assets/swagbound/overworld-npc/bat-poncho.png"));
    expect(spriteOverrideSpriteGroupFromSheetKey(key)).toBe(12);
    expect(spriteOverrideSpriteGroupFromSheetKey("sprite-override-npc-12")).toBeUndefined();
  });

  it("selects enemy overrides by numeric enemy id and exposes stable image keys", () => {
    const overrides: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byEnemyId: {
        "37": SINGLE_IMAGE_ENEMY_OVERRIDE
      }
    };

    expect(spriteOverrideForEnemyId(overrides, 37)).toBe(SINGLE_IMAGE_ENEMY_OVERRIDE);
    expect(spriteOverrideForEnemyId(overrides, 159)).toBeUndefined();
    expect(spriteOverrideEnemyEntries(overrides)).toEqual([[37, SINGLE_IMAGE_ENEMY_OVERRIDE]]);
    expect(spriteOverrideEnemyImageKey(37)).toBe("sprite-override-enemy-37");
    expect(spriteOverrideEnemyImageKey(37, "assets/swagbound/enemy/one.png")).not.toBe(
      spriteOverrideEnemyImageKey(37, "assets/swagbound/enemy/two.png")
    );
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
    // Bonkle stays an overlay NPC; Sal/Morrow now skin the real EB shop clerks (404/749).
    const namedAdded: Record<string, string> = {
      "100102": "assets/swagbound/npc/npc-bonkle.png"
    };
    const clerkOverrides: Record<string, string> = {
      "404": "assets/swagbound/npc/npc-sal.png",
      "749": "assets/swagbound/npc/npc-morrow.png"
    };

    expect(overrides.player?.image).toBe("assets/swagbound/hero/lsw-2821-walk.png");
    // every overlay placeholder has a sprite, plus the two EB clerk overrides
    for (const id of ids) expect(byNpcId[id]).toBeDefined();
    const extraKeys = Object.keys(byNpcId).filter((k) => !ids.includes(k)).sort();
    expect(extraKeys).toEqual(["404", "749"]);
    for (const [id, image] of Object.entries(clerkOverrides)) {
      expect(byNpcId[id]).toMatchObject({ image, frameWidth: 80, frameHeight: 80, displayHeight: 24, originX: 0.5, originY: 1 });
    }
    ids.forEach((id, index) => {
      const override = byNpcId[id];
      expect(override).toMatchObject({
        image: namedAdded[id] ?? allowedImages[index % allowedImages.length],
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
    expect(new Set(ids.map((id) => byNpcId[id].image))).toEqual(
      new Set([...allowedImages, ...Object.values(namedAdded)])
    );
  });

  it("authors the full enemy battle roster as single-image mappings", async () => {
    const overrides = SpriteOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/sprite-overrides.json"), "utf8")
    ));
    const byEnemyId = overrides.byEnemyId ?? {};

    // Anchor mappings that must remain stable.
    const anchors = {
      "37": "assets/swagbound/enemy/pfp-malady-battle-v1.png",
      "159": "assets/swagbound/enemy/ai-slop-battle-v0.png",
      "55": "assets/swagbound/enemy/lsw-signal-stutter-battle-v0.png",
      "121": "assets/swagbound/enemy/lsw-sawtooth-bun-battle-v0.png",
      "64": "assets/swagbound/enemy/lsw-cinder-cap-battle-v0.png",
      "134": "assets/swagbound/enemy/lsw-question-marketeer-battle-v0.png",
      "81": "assets/swagbound/enemy/lsw-ushanka-shade-battle-v0.png"
    } as const;
    for (const [enemyId, image] of Object.entries(anchors)) {
      expect(byEnemyId[enemyId]).toMatchObject({ image });
    }

    // Full roster: at least 36 enemy ids skinned.
    expect(Object.keys(byEnemyId).length).toBeGreaterThanOrEqual(36);

    // Same-named EB enemy variants share one coherent skin.
    for (const [a, b] of [["5", "209"], ["121", "211"], ["8", "210"]] as const) {
      expect(byEnemyId[a]?.image).toBe(byEnemyId[b]?.image);
    }

    // Every enemy override is a single-image sprite anchored to the battle box.
    for (const override of Object.values(byEnemyId)) {
      expect(override.image.startsWith("assets/swagbound/enemy/")).toBe(true);
      expect(override.displayHeight).toBe(160);
      expect(override.originX).toBe(0.5);
      expect(override.originY).toBe(0.5);
      expect(override.frameWidth).toBeUndefined();
      expect(override.frameHeight).toBeUndefined();
      expect(override.animations).toBeUndefined();
    }
  });
});

describe("named NPC trio (Bonkle / Sal / Morrow)", () => {
  it("skins the real EB shop clerks as Sal/Morrow and keeps Bonkle as an overlay NPC", async () => {
    const overrides = SpriteOverridesSchema.parse(JSON.parse(
      await readFile(resolve("content/sprite-overrides.json"), "utf8")
    ));
    const added = AddedNpcsSchema.parse(JSON.parse(
      await readFile(resolve("content/added-npcs.json"), "utf8")
    ));
    const customDialogue = JSON.parse(await readFile(resolve("content/custom-dialogue.json"), "utf8"));

    // Sal -> EB drug-store clerk (npc 404), Morrow -> EB market clerk (npc 749).
    const clerks = [
      { npcId: 404, sprite: "assets/swagbound/npc/npc-sal.png", ref: "interior:corner-shop-v0", shop: 1 },
      { npcId: 749, sprite: "assets/swagbound/npc/npc-morrow.png", ref: "interior:burger-shop-v0", shop: 4 }
    ];
    for (const c of clerks) {
      expect(overrides.byNpcId?.[String(c.npcId)]?.image).toBe(c.sprite);
      expect(overrides.byNpcId?.[String(c.npcId)]?.displayHeight).toBe(24);
      const entry = customDialogue.byNpcId[String(c.npcId)];
      expect(entry?.ref).toBe(c.ref);
      expect(entry?.shop).toBe(c.shop);
    }

    // Bonkle stays an overlay NPC (added npc 100102) with a dialogue ref, no shop.
    expect(overrides.byNpcId?.["100102"]?.image).toBe("assets/swagbound/npc/npc-bonkle.png");
    const bonkle = added.npcs.find((n) => n.id === 100102)?.interaction;
    expect(bonkle?.ref).toBe("interior:neighbor-house-v0");
    expect(bonkle?.shop).toBeUndefined();
  });
});

describe("added NPC interaction coverage", () => {
  it("keeps Bonkle's ref and gives every other placeholder short inline dialogue", async () => {
    const added = AddedNpcsSchema.parse(JSON.parse(
      await readFile(resolve("content/added-npcs.json"), "utf8")
    ));

    // Every building placeholder is interactable.
    expect(added.npcs.filter((npc) => npc.interaction === undefined).map((npc) => npc.id)).toEqual([]);

    const sourceQuestionNpcIds = new Set<number>();
    for (const npc of added.npcs) {
      const interaction = npc.interaction;
      if (npc.id === 100102) {
        // Bonkle uses a dialogue-library ref.
        expect(interaction?.ref).toBe("interior:neighbor-house-v0");
        expect(interaction?.pages).toBeUndefined();
        continue;
      }
      // All other placeholders are townsfolk with short inline pages.
      const pages = interaction?.pages ?? [];
      expect(interaction?.ref).toBeUndefined();
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.length).toBeLessThanOrEqual(2);
      for (const page of pages) {
        expect(page.trim()).toBe(page);
        expect(page.length).toBeGreaterThan(0);
        expect(page.length).toBeLessThanOrEqual(120);
        expect(page).not.toContain("@");
        expect(page).not.toContain("/Users/");
      }
      if (pages.some((page) => page.includes("SOURCE?"))) {
        sourceQuestionNpcIds.add(npc.id);
      }
    }
    expect(sourceQuestionNpcIds.size).toBeLessThanOrEqual(8);
  });
});
