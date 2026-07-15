import { describe, expect, it } from "vitest";
import {
  InteriorSpriteCastingSchema,
  type SpriteOverrides,
  type WorldChunked
} from "@eb/schemas";
import { compileInteriorSpriteCasting } from "./interiorSpriteCasting";

const friendlyImage = "assets/swagbound/overworld-npc/lsw-1038-ow.png";
const hostileImage = "assets/swagbound/overworld-npc/malady-001-ow.png";

function casting(coveragePercent = 100) {
  return InteriorSpriteCastingSchema.parse({
    schema: "swagbound.interior-sprite-casting.v1",
    policy: {
      defaultFaction: "friendly-lsw",
      defaultCoveragePercent: coveragePercent,
      eligibleNpcTypes: ["person"],
      requireIndoor: true,
      requireBounded: true,
      preserveAuthoredByNpcId: true,
      preserveResolvedImageMarkers: ["milady"],
      seed: "test"
    },
    pools: {
      "friendly-lsw": pool(friendlyImage),
      "hostile-milady": pool(hostileImage)
    },
    rooms: [{
      id: "hostile-room",
      faction: "hostile-milady",
      anchors: [{ x: 24, y: 8 }],
      coveragePercent: 100
    }],
    protectedNpcIds: [],
    acceptance: {
      minimumInteriorLswPercent: 60,
      minimumLswIndoorSharePercent: 65,
      minimumHostileRoomMiladyPercent: 80
    }
  });
}

describe("compileInteriorSpriteCasting", () => {
  it("casts friendly and hostile connected rooms without overriding authored NPC identities", () => {
    const base: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: { "3": poolOverride("assets/swagbound/npc/npc-sal.png") }
    };
    const result = compileInteriorSpriteCasting(world(), base, casting());

    expect(result.byNpcId["1"]?.image).toBe(friendlyImage);
    expect(result.byNpcId["2"]?.image).toBe(hostileImage);
    expect(result.byNpcId["3"]).toBeUndefined();
    expect(result.report.counts).toMatchObject({
      assigned: 2,
      friendlyLswAssigned: 1,
      hostileMiladyAssigned: 1,
      preservedAuthoredNpcOverrides: 1
    });
    expect(result.report.rooms[0]).toMatchObject({ id: "hostile-room", eligibleNpcs: 1, assignedNpcs: 1 });
  });

  it("is deterministic and respects default coverage", () => {
    const zero = compileInteriorSpriteCasting(world(), { schema: "swagbound.sprite-overrides.v1" }, casting(0));
    const first = compileInteriorSpriteCasting(world(), { schema: "swagbound.sprite-overrides.v1" }, casting());
    const second = compileInteriorSpriteCasting(world(), { schema: "swagbound.sprite-overrides.v1" }, casting());

    expect(zero.byNpcId["1"]).toBeUndefined();
    expect(zero.byNpcId["2"]?.image).toBe(hostileImage);
    expect(first).toEqual(second);
  });

  it("avoids duplicate characters inside one room while the pool has alternatives", () => {
    const config = casting();
    config.pools["friendly-lsw"]?.images.push("assets/swagbound/overworld-npc/lsw-1120-ow.png");
    const sameRoomWorld = world();
    sameRoomWorld.npcs = [npc(1, 8, 8), npc(4, 8, 8)] as typeof sameRoomWorld.npcs;

    const result = compileInteriorSpriteCasting(
      sameRoomWorld,
      { schema: "swagbound.sprite-overrides.v1" },
      config
    );

    expect(result.byNpcId["1"]?.image).not.toBe(result.byNpcId["4"]?.image);
  });

  it("allows a room to recast an explicitly selected authored service NPC", () => {
    const config = casting();
    config.rooms.push({
      id: "friendly-shop",
      faction: "friendly-lsw",
      anchors: [{ x: 8, y: 8 }],
      coveragePercent: 100,
      overrideAuthoredNpcIds: [3],
      displayHeight: 32,
      originY: 1.15,
      renderLayer: "world"
    });
    const base: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: { "3": poolOverride("assets/swagbound/npc/npc-sal.png") }
    };

    const result = compileInteriorSpriteCasting(world(), base, config);

    expect(result.byNpcId["3"]?.image).toBe(friendlyImage);
    expect(result.byNpcId["3"]?.displayHeight).toBe(32);
    expect(result.byNpcId["3"]?.originY).toBe(1.15);
    expect(result.byNpcId["3"]?.renderLayer).toBe("world");
    expect(result.report.counts.preservedAuthoredNpcOverrides).toBe(0);
  });

  it("allows a room to include an explicitly selected humanoid with a non-person source type", () => {
    const config = casting();
    config.rooms.push({
      id: "hostile-prop-room",
      faction: "hostile-milady",
      anchors: [{ x: 8, y: 8 }],
      coveragePercent: 100,
      includeNpcIds: [5],
      overrideAuthoredNpcIds: [5]
    });
    const testWorld = world();
    testWorld.npcs = [...testWorld.npcs, npc(5, 8, 8, "item")] as typeof testWorld.npcs;
    const base: SpriteOverrides = {
      schema: "swagbound.sprite-overrides.v1",
      byNpcId: { "5": poolOverride("assets/swagbound/npc/humanoid-item.png") }
    };

    const result = compileInteriorSpriteCasting(testWorld, base, config);

    expect(result.byNpcId["5"]?.image).toBe(hostileImage);
    expect(result.report.assignments.find((assignment) => assignment.npcId === 5)?.roomId).toBe("hostile-prop-room");
  });

  it("uses one fixed image for every NPC in a uniform room", () => {
    const config = casting();
    config.rooms.push({
      id: "uniform-cult",
      faction: "hostile-milady",
      anchors: [{ x: 8, y: 8 }],
      coveragePercent: 100,
      fixedImage: hostileImage
    });
    const testWorld = world();
    testWorld.npcs = [npc(1, 8, 8), npc(4, 8, 8)] as typeof testWorld.npcs;

    const result = compileInteriorSpriteCasting(
      testWorld,
      { schema: "swagbound.sprite-overrides.v1" },
      config
    );

    expect(result.byNpcId["1"]?.image).toBe(hostileImage);
    expect(result.byNpcId["4"]?.image).toBe(hostileImage);
  });
});

function pool(image: string) {
  return {
    images: [image],
    frameWidth: 48,
    frameHeight: 48,
    displayHeight: 24,
    originX: 0.5,
    originY: 1
  };
}

function poolOverride(image: string) {
  return {
    image,
    frameWidth: 48,
    frameHeight: 48,
    animations: { down: [0], left: [0], right: [0], up: [0] },
    displayHeight: 24,
    originX: 0.5,
    originY: 1
  };
}

function world(): WorldChunked {
  return {
    collision: {
      cellSize: 8,
      width: 5,
      height: 3,
      solidRows: ["11111", "10101", "11111"],
      surfaceRows: ["00000", "00000", "00000"]
    },
    sectors: {
      cols: 5,
      rows: 3,
      sectorWidthTiles: 1,
      sectorHeightTiles: 1,
      tileSize: 8,
      areaIds: Array(15).fill(1),
      indoor: Array(15).fill(1),
      bounded: Array(15).fill(1),
      coverArt: Array(15).fill(0)
    },
    npcs: [npc(1, 8, 8), npc(2, 24, 8), npc(3, 8, 8)]
  } as unknown as WorldChunked;
}

function npc(npcId: number, x: number, y: number, type = "person") {
  return {
    npcId,
    spriteGroup: npcId,
    type,
    worldPixel: { x, y }
  };
}
