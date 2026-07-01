import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(new URL("../src/chunkedWorldScene.ts", import.meta.url), "utf8");

describe("chunked world interior rendering contract", () => {
  it("keeps normal player-follow camera behavior instead of applying an interior camera clamp", () => {
    expect(sceneSource).toContain("this.cameras.main.startFollow(this.player, true)");
    expect(sceneSource).not.toContain("stopFollow(");
    expect(sceneSource).not.toContain("positionInteriorCamera");
    expect(sceneSource).not.toContain("applyCameraBoundsForActiveRoom");
    expect(sceneSource).not.toContain("cameraBoundsMode");
  });

  it("uses a room mask rather than rectangular chunk crops for interior isolation", () => {
    expect(sceneSource).toContain("createGeometryMask");
    expect(sceneSource).toContain("setMask(mask)");
    // Interior isolation must clip the streamed chunk images with the geometry
    // mask, never a rectangular setCrop. The only allowed setCrop is the water
    // occluder waterline on a `sprite` (player/NPC) — unrelated to interiors.
    expect(sceneSource).not.toMatch(/(background|foreground|streamed|chunk\w*|image)\.setCrop\(/i);
    const cropReceivers = [...sceneSource.matchAll(/(\w+)\.setCrop\(/g)].map((match) => match[1]);
    expect(cropReceivers.every((receiver) => receiver === "sprite")).toBe(true);
  });

  it("resolves interior masks from sector metadata when available", () => {
    expect(sceneSource).toContain("resolveSectorAreaBounds");
    expect(sceneSource).toContain("this.world_.sectors");
    expect(sceneSource).toContain("this.activeRoomSectorKey === sectorKey");
  });

  it("stabilizes the rendered geometry mask edge without changing room bounds", () => {
    expect(sceneSource).toContain("ROOM_MASK_EDGE_INSET_SCREEN_PX");
    expect(sceneSource).toContain("roomMaskEdgeInsetWorldPixels");
    expect(sceneSource).toContain("range.maxCellX === maskBounds.maxCellX");
    expect(sceneSource).toContain("range.cellY === maskBounds.maxCellY");
  });
});
