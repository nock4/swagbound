import type { WorldRect } from "./collisionOverlay";

export type IndoorSectorCoverMetadata = {
  cols: number;
  rows: number;
  sectorWidthTiles: number;
  sectorHeightTiles: number;
  tileSize: number;
  indoor: readonly number[];
  coverArt?: readonly number[];
};

export type IndoorSectorCoverRect = WorldRect;

export function indoorSectorCoverRectsForChunk(
  sectors: IndoorSectorCoverMetadata | undefined,
  chunkRect: WorldRect
): IndoorSectorCoverRect[] {
  if (!validMetadata(sectors) || !validRect(chunkRect)) {
    return [];
  }

  const sectorWidth = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeight = sectors.sectorHeightTiles * sectors.tileSize;
  const chunkRight = chunkRect.x + chunkRect.width;
  const chunkBottom = chunkRect.y + chunkRect.height;
  const mapRight = sectors.cols * sectorWidth;
  const mapBottom = sectors.rows * sectorHeight;
  const queryLeft = Math.max(0, chunkRect.x);
  const queryTop = Math.max(0, chunkRect.y);
  const queryRight = Math.min(mapRight, chunkRight);
  const queryBottom = Math.min(mapBottom, chunkBottom);
  if (queryRight <= queryLeft || queryBottom <= queryTop) {
    return [];
  }

  const minCol = clamp(Math.floor(queryLeft / sectorWidth), 0, sectors.cols - 1);
  const maxCol = clamp(Math.ceil(queryRight / sectorWidth) - 1, 0, sectors.cols - 1);
  const minRow = clamp(Math.floor(queryTop / sectorHeight), 0, sectors.rows - 1);
  const maxRow = clamp(Math.ceil(queryBottom / sectorHeight) - 1, 0, sectors.rows - 1);
  const rects: IndoorSectorCoverRect[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    let col = minCol;
    while (col <= maxCol) {
      if (!sectorIsIndoor(sectors, col, row)) {
        col += 1;
        continue;
      }
      const runStartCol = col;
      while (col + 1 <= maxCol && sectorIsIndoor(sectors, col + 1, row)) {
        col += 1;
      }
      rects.push(intersectRects(
        {
          x: runStartCol * sectorWidth,
          y: row * sectorHeight,
          width: (col - runStartCol + 1) * sectorWidth,
          height: sectorHeight
        },
        chunkRect
      ));
      col += 1;
    }
  }

  return rects.filter(validRect);
}

function sectorIsIndoor(sectors: IndoorSectorCoverMetadata, col: number, row: number): boolean {
  return coverFlags(sectors)[row * sectors.cols + col] === 1;
}

/**
 * coverArt (indoors flag OR interior tileset, converter-derived) supersedes the
 * bare indoors flag: EB leaves embedded cave/dungeon regions unflagged, and those
 * were exactly the sectors bleeding into the overworld. Falls back to `indoor`
 * for worlds generated before coverArt existed.
 */
export function coverFlags(sectors: IndoorSectorCoverMetadata): readonly number[] {
  return sectors.coverArt ?? sectors.indoor;
}

/** True when the world position sits inside a covered (interior-art) sector. */
export function worldPositionInCoveredSector(
  sectors: IndoorSectorCoverMetadata | undefined,
  position: { x: number; y: number } | undefined
): boolean {
  if (!validMetadata(sectors) || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return false;
  }
  const sectorWidth = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeight = sectors.sectorHeightTiles * sectors.tileSize;
  const col = Math.floor(position.x / sectorWidth);
  const row = Math.floor(position.y / sectorHeight);
  if (col < 0 || row < 0 || col >= sectors.cols || row >= sectors.rows) {
    return false;
  }
  return coverFlags(sectors)[row * sectors.cols + col] === 1;
}

function intersectRects(a: WorldRect, b: WorldRect): WorldRect {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function validMetadata(sectors: IndoorSectorCoverMetadata | undefined): sectors is IndoorSectorCoverMetadata {
  if (!sectors) {
    return false;
  }
  if (
    !Number.isInteger(sectors.cols) ||
    !Number.isInteger(sectors.rows) ||
    !Number.isInteger(sectors.sectorWidthTiles) ||
    !Number.isInteger(sectors.sectorHeightTiles) ||
    !Number.isInteger(sectors.tileSize) ||
    sectors.cols <= 0 ||
    sectors.rows <= 0 ||
    sectors.sectorWidthTiles <= 0 ||
    sectors.sectorHeightTiles <= 0 ||
    sectors.tileSize <= 0
  ) {
    return false;
  }
  return sectors.indoor.length >= sectors.cols * sectors.rows;
}

function validRect(rect: WorldRect): boolean {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
