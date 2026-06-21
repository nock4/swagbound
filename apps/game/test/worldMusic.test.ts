import { describe, expect, it } from "vitest";
import { MusicManifestSchema } from "@eb/schemas";
import { resolveMusicCue } from "../src/audio/music";
import {
  areaMusicForSector,
  isInteriorMusicSector,
  overworldMusicCueForSector,
  overworldMusicCueForInteriorState
} from "../src/worldMusic";
import type { SectorAreaMetadata } from "../src/roomBounds";

describe("overworld music cue selection", () => {
  it("selects interior music only while the player is in an interior", () => {
    expect(overworldMusicCueForInteriorState(false)).toBe("overworld");
    expect(overworldMusicCueForInteriorState(true)).toBe("interior");
    expect(overworldMusicCueForInteriorState(true, true)).toBe("intro");
  });

  it("classifies bounded sector areas as interiors for music", () => {
    const sectors: SectorAreaMetadata = {
      cols: 3,
      rows: 1,
      sectorWidthTiles: 10,
      sectorHeightTiles: 10,
      tileSize: 8,
      areaIds: [1, 2, 3],
      indoor: [0, 0, 1],
      bounded: [0, 1, 0]
    };

    expect(isInteriorMusicSector(sectors, { x: 4, y: 4 })).toBe(false);
    expect(isInteriorMusicSector(sectors, { x: 84, y: 4 })).toBe(true);
    expect(isInteriorMusicSector(sectors, { x: 164, y: 4 })).toBe(true);
    expect(isInteriorMusicSector(sectors, { x: 260, y: 4 })).toBe(false);
  });

  it("selects the first matching area track for the current sector", () => {
    const sectors = testSectors();
    const manifest = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        overworld: { file: "audio/music/overworld.mp3" },
        interior: { file: "audio/music/interior.mp3" }
      },
      areas: [
        {
          id: "town-west",
          label: "Town West",
          match: { sectorRange: [1, 2] },
          file: "audio/music/town-west.mp3",
          loop: true,
          gain: 0.35
        },
        {
          id: "town-center",
          match: { sectorIds: [1] },
          file: "audio/music/town-center.mp3",
          loop: false,
          gain: 0.2
        }
      ]
    });

    const cue = overworldMusicCueForSector(manifest, sectors, { x: 84, y: 4 });

    expect(areaMusicForSector(manifest, sectors, { x: 84, y: 4 })?.id).toBe("town-west");
    expect(cue).toBe("area:town-west");
    expect(resolveMusicCue(manifest, cue)).toEqual({
      cue: "area:town-west",
      file: "audio/music/town-west.mp3",
      loop: true,
      gain: 0.35
    });
  });

  it("falls back to the interior/overworld cue when no area matches", () => {
    const sectors = testSectors();
    const manifest = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        overworld: { file: "audio/music/overworld.mp3" },
        interior: { file: "audio/music/interior.mp3" }
      },
      areas: [
        {
          id: "north",
          match: { sectorIds: [0] },
          file: "audio/music/north.mp3"
        }
      ]
    });

    expect(overworldMusicCueForSector(manifest, sectors, { x: 164, y: 4 })).toBe("interior");
    expect(overworldMusicCueForSector(manifest, sectors, { x: 260, y: 4 })).toBe("overworld");
  });

  it("can match town map names when sector metadata includes them", () => {
    const sectors = {
      ...testSectors(),
      townMaps: ["onett", "onett", "twoson", "threed"]
    };
    const manifest = MusicManifestSchema.parse({
      schema: "swagbound.music-manifest.v1",
      cues: {
        overworld: { file: "audio/music/overworld.mp3" }
      },
      areas: [
        {
          id: "twoson",
          match: { townMap: "Twoson" },
          file: "audio/music/twoson.mp3"
        }
      ]
    });

    expect(overworldMusicCueForSector(manifest, sectors, { x: 164, y: 4 })).toBe("area:twoson");
  });
});

function testSectors(): SectorAreaMetadata {
  return {
    cols: 4,
    rows: 1,
    sectorWidthTiles: 10,
    sectorHeightTiles: 10,
    tileSize: 8,
    areaIds: [1, 2, 3, 4],
    indoor: [0, 0, 1, 0],
    bounded: [0, 1, 0, 0]
  };
}
