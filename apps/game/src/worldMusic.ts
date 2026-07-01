import type { MusicManifest, SectorMusic } from "@eb/schemas";
import { musicAreaCueId, musicInteriorCueId, type MusicAreaCueId, type MusicInteriorCueId } from "./audio/music";
import {
  sectorCoordForWorldPixel,
  type SectorAreaMetadata
} from "./roomBounds";

export type OverworldMusicCue = "intro" | "overworld" | "interior" | MusicAreaCueId | MusicInteriorCueId;
type MusicManifestArea = NonNullable<MusicManifest["areas"]>[number];
type SectorMusicMetadata = SectorAreaMetadata & {
  townMaps?: readonly string[];
};

export function overworldMusicCueForInteriorState(inInterior: boolean, introActive = false): OverworldMusicCue {
  if (introActive) {
    return "intro";
  }
  return inInterior ? "interior" : "overworld";
}

export function isInteriorMusicSector(
  sectors: SectorAreaMetadata | undefined,
  point: { x: number; y: number }
): boolean {
  if (!sectors) {
    return false;
  }
  const sector = sectorCoordForWorldPixel(point, sectors);
  if (!sector) {
    return false;
  }
  return sectors.bounded[sector.index] === 1 || sectors.indoor[sector.index] === 1;
}

export function overworldMusicCueForSector(
  manifest: MusicManifest | undefined,
  sectors: SectorAreaMetadata | undefined,
  point: { x: number; y: number },
  introActive = false,
  sectorMusic?: SectorMusic
): OverworldMusicCue {
  if (introActive) {
    return "intro";
  }
  const area = areaMusicForSector(manifest, sectors, point);
  if (area) {
    return musicAreaCueId(area.id);
  }
  if (!isInteriorMusicSector(sectors, point)) {
    return "overworld";
  }
  // Inside a building: pick the per-building-type interior track by EB song id,
  // so the song only changes when you enter a different KIND of building.
  const songId = interiorSongIdForSector(sectorMusic, sectors, point);
  return songId !== undefined ? musicInteriorCueId(songId) : "interior";
}

function interiorSongIdForSector(
  sectorMusic: SectorMusic | undefined,
  sectors: SectorAreaMetadata | undefined,
  point: { x: number; y: number }
): number | undefined {
  if (!sectorMusic || !sectors) {
    return undefined;
  }
  const sector = sectorCoordForWorldPixel(point, sectors);
  if (!sector) {
    return undefined;
  }
  const songId = sectorMusic.song[sector.index];
  return songId && songId > 0 ? songId : undefined;
}

export function areaMusicForSector(
  manifest: MusicManifest | undefined,
  sectors: SectorAreaMetadata | undefined,
  point: { x: number; y: number }
): MusicManifestArea | undefined {
  if (!manifest?.areas?.length || !sectors) {
    return undefined;
  }
  const sector = sectorCoordForWorldPixel(point, sectors);
  if (!sector) {
    return undefined;
  }
  return manifest.areas.find((area) => musicAreaMatchesSector(area, sector.index, sectors));
}

function musicAreaMatchesSector(
  area: MusicManifestArea,
  sectorIndex: number,
  sectors: SectorAreaMetadata
): boolean {
  const match = area.match;
  if (match.sectorIds?.includes(sectorIndex)) {
    return true;
  }
  if (match.sectorRange && sectorIndex >= match.sectorRange[0] && sectorIndex <= match.sectorRange[1]) {
    return true;
  }
  if (match.townMap) {
    const townMap = sectorTownMapAt(sectors, sectorIndex);
    return Boolean(townMap && normalizeTownMap(townMap) === normalizeTownMap(match.townMap));
  }
  return false;
}

function sectorTownMapAt(sectors: SectorAreaMetadata, sectorIndex: number): string | undefined {
  return (sectors as SectorMusicMetadata).townMaps?.[sectorIndex];
}

function normalizeTownMap(value: string): string {
  return value.trim().toLowerCase();
}
