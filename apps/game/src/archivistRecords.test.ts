import { describe, expect, it } from "vitest";
import type { ArchivistSpots } from "@eb/schemas";
import {
  buildArchivistRecordsViewModel,
  CORRECTION_CLEARED_FLAG,
  CORRECTION_PLANTED_CAPTION,
  CORRECTION_PLANTED_FLAG
} from "./archivistRecords";

describe("buildArchivistRecordsViewModel", () => {
  it("builds filed records from persisted PHOTO flags", () => {
    const spots: ArchivistSpots = {
      schema: "swagbound.archivist-spots.v1",
      archivist: {
        spriteId: "drifella2-168",
        spriteNpcId: 100300,
        lines: ["Filed, not minted."]
      },
      spots: [
        spot(1, 698, "FLG_PHOTO_1", "Bosch front step", "A record of a thing that only happened once."),
        spot(2, 699, "FLG_PHOTO_2", "Morningside cape", "Filed, not minted.")
      ]
    };

    const records = buildArchivistRecordsViewModel(spots, {
      has: (flag) => flag === "FLG_PHOTO_2"
    });

    expect(records).toMatchObject({
      filed: 1,
      total: 2,
      records: [{
        spotId: 2,
        flagName: "FLG_PHOTO_2",
        locationLabel: "Morningside cape",
        caption: "Filed, not minted."
      }]
    });
  });

  it("types over the first filed record while the correction record is planted", () => {
    const spots: ArchivistSpots = {
      schema: "swagbound.archivist-spots.v1",
      archivist: {
        spriteId: "drifella2-168",
        spriteNpcId: 100300,
        lines: ["Filed, not minted."]
      },
      spots: [
        spot(2, 699, "FLG_PHOTO_2", "Morningside cape", "Filed, not minted."),
        spot(1, 698, "FLG_PHOTO_1", "Bosch front step", "A record of a thing that only happened once.")
      ]
    };
    const activeFlags = new Set(["FLG_PHOTO_1", "FLG_PHOTO_2", CORRECTION_PLANTED_FLAG]);

    const records = buildArchivistRecordsViewModel(spots, {
      has: (flag) => activeFlags.has(flag)
    });

    expect(records).toMatchObject({
      filed: 2,
      total: 2,
      records: [
        {
          spotId: 1,
          caption: CORRECTION_PLANTED_CAPTION,
          planted: true
        },
        {
          spotId: 2,
          caption: "Filed, not minted."
        }
      ]
    });
  });

  it("keeps true captions when the correction record has been cleared", () => {
    const spots: ArchivistSpots = {
      schema: "swagbound.archivist-spots.v1",
      archivist: {
        spriteId: "drifella2-168",
        spriteNpcId: 100300,
        lines: ["Filed, not minted."]
      },
      spots: [
        spot(1, 698, "FLG_PHOTO_1", "Bosch front step", "A record of a thing that only happened once.")
      ]
    };
    const activeFlags = new Set(["FLG_PHOTO_1", CORRECTION_PLANTED_FLAG, CORRECTION_CLEARED_FLAG]);

    const records = buildArchivistRecordsViewModel(spots, {
      has: (flag) => activeFlags.has(flag)
    });

    expect(records.records[0]).toMatchObject({
      spotId: 1,
      caption: "A record of a thing that only happened once."
    });
    expect(records.records[0]?.planted).not.toBeTruthy();
  });

  it("keeps true captions when the correction record is not planted", () => {
    const spots: ArchivistSpots = {
      schema: "swagbound.archivist-spots.v1",
      archivist: {
        spriteId: "drifella2-168",
        spriteNpcId: 100300,
        lines: ["Filed, not minted."]
      },
      spots: [
        spot(1, 698, "FLG_PHOTO_1", "Bosch front step", "A record of a thing that only happened once.")
      ]
    };

    const records = buildArchivistRecordsViewModel(spots, {
      has: (flag) => flag === "FLG_PHOTO_1"
    });

    expect(records.records[0]).toMatchObject({
      spotId: 1,
      caption: "A record of a thing that only happened once."
    });
    expect(records.records[0]?.planted).not.toBeTruthy();
  });

  it("does not plant a correction caption when no records are filed", () => {
    const spots: ArchivistSpots = {
      schema: "swagbound.archivist-spots.v1",
      archivist: {
        spriteId: "drifella2-168",
        spriteNpcId: 100300,
        lines: ["Filed, not minted."]
      },
      spots: [
        spot(1, 698, "FLG_PHOTO_1", "Bosch front step", "A record of a thing that only happened once.")
      ]
    };

    const records = buildArchivistRecordsViewModel(spots, {
      has: (flag) => flag === CORRECTION_PLANTED_FLAG
    });

    expect(records).toMatchObject({
      filed: 0,
      total: 1,
      records: []
    });
  });
});

function spot(
  spotId: number,
  flagId: number,
  flagName: string,
  locationLabel: string,
  caption: string
): ArchivistSpots["spots"][number] {
  return {
    spotId,
    flag: { id: flagId, name: flagName },
    anchor: { x: spotId * 8, y: spotId * 16 },
    photographer: { x: spotId * 8, y: spotId * 16 + 48 },
    party1: { x: spotId * 8, y: spotId * 16 },
    slide: { direction: 16, distance: 85 },
    extraNpcs: [],
    locationLabel,
    caption
  };
}
