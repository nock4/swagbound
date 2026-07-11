import { describe, expect, it } from "vitest";
import type { ArchivistSpots } from "@eb/schemas";
import { buildArchivistRecordsViewModel } from "./archivistRecords";

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
