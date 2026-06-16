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
    expect(sceneSource).not.toContain("setCrop(");
  });

  it("resolves interior masks from sector metadata when available", () => {
    expect(sceneSource).toContain("resolveSectorAreaBounds");
    expect(sceneSource).toContain("this.world_.sectors");
    expect(sceneSource).toContain("this.activeRoomSectorKey === sectorKey");
  });
});
