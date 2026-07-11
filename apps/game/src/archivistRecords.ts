import type { ArchivistSpot, ArchivistSpots } from "@eb/schemas";

export type FlagReader = {
  has(flag: string): boolean;
};

export type ArchivistRecordView = {
  id: string;
  spotId: number;
  flagName: string;
  locationLabel: string;
  caption: string;
};

export type ArchivistRecordsViewModel = {
  filed: number;
  total: number;
  records: ArchivistRecordView[];
};

export function archivistSpotFlag(spot: Pick<ArchivistSpot, "flag">): string {
  return spot.flag.name;
}

export function archivistRecordId(spotId: number): string {
  return `archivist-record-${spotId}`;
}

export function buildArchivistRecordsViewModel(
  spots: ArchivistSpots,
  flags: FlagReader
): ArchivistRecordsViewModel {
  const records = spots.spots
    .filter((spot) => flags.has(archivistSpotFlag(spot)))
    .sort((a, b) => a.spotId - b.spotId)
    .map((spot) => ({
      id: archivistRecordId(spot.spotId),
      spotId: spot.spotId,
      flagName: spot.flag.name,
      locationLabel: spot.locationLabel,
      caption: spot.caption
    }));
  return {
    filed: records.length,
    total: spots.spots.length,
    records
  };
}

export function archivistSpotById(spots: ArchivistSpots, spotId: number): ArchivistSpot | undefined {
  return spots.spots.find((spot) => spot.spotId === spotId);
}
