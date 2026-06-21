import type { MusicManifest } from "@eb/schemas";
import { musicAreaCueId, type MusicAreaCueId } from "./audio/music";
import {
  sectorCoordForWorldPixel,
  type SectorAreaMetadata
} from "./roomBounds";

export type OverworldMusicCue = "intro" | "overworld" | "interior" | MusicAreaCueId;
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
  introActive = false
): OverworldMusicCue {
  if (introActive) {
    return "intro";
  }
  const area = areaMusicForSector(manifest, sectors, point);
  if (area) {
    return musicAreaCueId(area.id);
  }
  return overworldMusicCueForInteriorState(isInteriorMusicSector(sectors, point));
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
