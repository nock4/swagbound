import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(new URL("../src/chunkedWorldScene.ts", import.meta.url), "utf8");

describe("chunked world interior rendering contract", () => {
  it("keeps player follow active while clamping interior camera scroll to the active area", () => {
    expect(sceneSource).toContain("this.cameras.main.startFollow(this.player, true)");
    expect(sceneSource).not.toContain("stopFollow(");
    expect(sceneSource).not.toContain("positionInteriorCamera");
    expect(sceneSource).not.toContain("applyCameraBoundsForActiveRoom");
    expect(sceneSource).not.toContain("cameraBoundsMode");
    expect(sceneSource).toContain("clampCameraScrollToRoom(room)");
    expect(sceneSource).toContain("camera.setBounds(room.rect.x, room.rect.y, room.rect.width, room.rect.height, true)");
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

  it("resolves interior identity from sector metadata when available", () => {
    expect(sceneSource).toContain("resolveSectorAreaBounds");
    expect(sceneSource).toContain("this.world_.sectors");
    expect(sceneSource).toContain("this.activeRoomSectorKey === sectorKey");
  });

  it("derives interior masking and camera bounds from the full sector-area rect", () => {
    expect(sceneSource).toContain("deriveInteriorSectorAreaRoomBounds");
    expect(sceneSource).toContain("sectorAreaRectForPoint(point)");
    expect(sceneSource).toContain("rect: areaRect");
    expect(sceneSource).toContain("walkableCellBounds: areaCellBounds");
    expect(sceneSource).toContain("rectangularMaskRangesForBounds(areaCellBounds)");
    expect(sceneSource).toContain("this.sectorAreaBoundsKey(roomPoint)");
    expect(sceneSource).not.toContain("nearestComponentAt(this.navmesh, point, 2)");
    expect(sceneSource).not.toContain("expandInteriorComponentVisualRect");
    expect(sceneSource).not.toContain("intersectWorldRects");
    expect(sceneSource).not.toContain("unionWorldRects");
  });

  it("stabilizes the rendered geometry mask edge without a top headroom window", () => {
    expect(sceneSource).toContain("ROOM_MASK_EDGE_INSET_SCREEN_PX");
    expect(sceneSource).toContain("roomMaskEdgeInsetWorldPixels");
    expect(sceneSource).not.toContain("INTERIOR_ROOM_MASK_HEADROOM_PX");
    expect(sceneSource).not.toContain("roomMaskHeadroomTop");
    expect(sceneSource).toContain("range.maxCellX === maskBounds.maxCellX");
    expect(sceneSource).toContain("range.cellY === maskBounds.maxCellY");
    expect(sceneSource).toContain("const top = Math.floor(room.rect.y)");
  });

  it("only uses interior fill zoom when the full area is smaller than the default viewport", () => {
    expect(sceneSource).toContain("viewportWidthAtDefaultZoom");
    expect(sceneSource).toContain("viewportHeightAtDefaultZoom");
    expect(sceneSource).toContain("const shouldFillZoom");
    expect(sceneSource).toContain("room.rect.width < viewportWidthAtDefaultZoom");
    expect(sceneSource).toContain("room.rect.height < viewportHeightAtDefaultZoom");
  });
});
