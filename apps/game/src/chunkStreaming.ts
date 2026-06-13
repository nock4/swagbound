export type ChunkCoord = {
  cx: number;
  cy: number;
};

export type ChunkGrid = {
  mapWidthTiles: number;
  mapHeightTiles: number;
  tileSize: number;
  chunkSizeTiles: number;
};

export const ACTIVE_CHUNK_RADIUS = 1;
export const RETAIN_CHUNK_RADIUS = 2;

export function chunkPixelSize(grid: Pick<ChunkGrid, "tileSize" | "chunkSizeTiles">): number {
  return grid.tileSize * grid.chunkSizeTiles;
}

export function chunkColumns(grid: Pick<ChunkGrid, "mapWidthTiles" | "chunkSizeTiles">): number {
  return Math.ceil(grid.mapWidthTiles / grid.chunkSizeTiles);
}

export function chunkRows(grid: Pick<ChunkGrid, "mapHeightTiles" | "chunkSizeTiles">): number {
  return Math.ceil(grid.mapHeightTiles / grid.chunkSizeTiles);
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cy}`;
}

export function chunkForWorldPixel(position: { x: number; y: number }, grid: ChunkGrid): ChunkCoord {
  const size = chunkPixelSize(grid);
  const maxCx = chunkColumns(grid) - 1;
  const maxCy = chunkRows(grid) - 1;
  return {
    cx: clamp(Math.floor(position.x / size), 0, maxCx),
    cy: clamp(Math.floor(position.y / size), 0, maxCy)
  };
}

export function chunkRing(center: ChunkCoord, radius: number, grid: ChunkGrid): ChunkCoord[] {
  const maxCx = chunkColumns(grid) - 1;
  const maxCy = chunkRows(grid) - 1;
  const coords: ChunkCoord[] = [];
  for (let cy = center.cy - radius; cy <= center.cy + radius; cy += 1) {
    for (let cx = center.cx - radius; cx <= center.cx + radius; cx += 1) {
      if (cx < 0 || cy < 0 || cx > maxCx || cy > maxCy) {
        continue;
      }
      coords.push({ cx, cy });
    }
  }
  return coords;
}

export function chunkKeysForWorldPixel(position: { x: number; y: number }, radius: number, grid: ChunkGrid): Set<string> {
  const center = chunkForWorldPixel(position, grid);
  return new Set(chunkRing(center, radius, grid).map(chunkKey));
}

export function chebyshevChunkDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cy - b.cy));
}

export function isWithinChunkRadius(coord: ChunkCoord, center: ChunkCoord, radius: number): boolean {
  return chebyshevChunkDistance(coord, center) <= radius;
}

export function shouldSpawnForChunk(npcChunk: ChunkCoord, currentChunk: ChunkCoord): boolean {
  return isWithinChunkRadius(npcChunk, currentChunk, ACTIVE_CHUNK_RADIUS);
}

export function shouldRetainForChunk(npcChunk: ChunkCoord, currentChunk: ChunkCoord): boolean {
  return isWithinChunkRadius(npcChunk, currentChunk, RETAIN_CHUNK_RADIUS);
}

export function shouldDespawnForChunk(npcChunk: ChunkCoord, currentChunk: ChunkCoord): boolean {
  return !shouldRetainForChunk(npcChunk, currentChunk);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
