import type { ArchivistSpot, ArchivistSpots } from "@eb/schemas";

export type FlagReader = {
  has(flag: string): boolean;
};

export const CORRECTION_PLANTED_FLAG = "fuel:correction:record-planted";
export const CORRECTION_CLEARED_FLAG = "fuel:correction:cleared";
export const CORRECTION_PLANTED_CAPTION =
  "BOSCH AGREED. BOSCH SIGNED. BOSCH DONATED THE ORIGINAL AND FORGOT ON PURPOSE. Filed correctly. Do not refile.";

export type ArchivistRecordView = {
  id: string;
  spotId: number;
  flagName: string;
  locationLabel: string;
  caption: string;
  planted?: boolean;
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
  const records: ArchivistRecordView[] = spots.spots
    .filter((spot) => flags.has(archivistSpotFlag(spot)))
    .sort((a, b) => a.spotId - b.spotId)
    .map((spot) => ({
      id: archivistRecordId(spot.spotId),
      spotId: spot.spotId,
      flagName: spot.flag.name,
      locationLabel: spot.locationLabel,
      caption: spot.caption
    }));
  if (
    flags.has(CORRECTION_PLANTED_FLAG) &&
    !flags.has(CORRECTION_CLEARED_FLAG) &&
    records.length > 0
  ) {
    const firstRecord = records[0];
    if (firstRecord) {
      records[0] = {
        ...firstRecord,
        caption: CORRECTION_PLANTED_CAPTION,
        planted: true
      };
    }
  }
  return {
    filed: records.length,
    total: spots.spots.length,
    records
  };
}

export function archivistSpotById(spots: ArchivistSpots, spotId: number): ArchivistSpot | undefined {
  return spots.spots.find((spot) => spot.spotId === spotId);
}
