import { surfaceAtCell, worldPixelToCollisionCell, type CollisionGrid, type WorldRect } from "./collisionOverlay";

export type RoomBoundsOptions = {
  /**
   * Maximum connected walkable cells for a region to be treated as an interior.
   * EB interiors in the generated full-world artifact are a few hundred cells;
   * the Onett overworld component sampled from the spawn point is ~32k cells.
   */
  maxInteriorWalkableCells?: number;
  /** Maximum walkable bounding-box area in collision cells for interior classification. */
  maxInteriorBoundsAreaCells?: number;
  /** Maximum solid wall/decor distance to assign to the current room's mask. */
  wallMaskThicknessCells?: number;
  /** Raw surface bytes; when present, solid surface 00 is treated as black void, not room wall/decor. */
  surfaceRows?: readonly string[];
};

export type RoomMaskCellRange = {
  cellY: number;
  minCellX: number;
  maxCellX: number;
};

export type ConnectedRoomBounds = {
  startCell: { cellX: number; cellY: number };
  walkableCells: number;
  walkableCellBounds: {
    minCellX: number;
    maxCellX: number;
    minCellY: number;
    maxCellY: number;
    widthCells: number;
    heightCells: number;
    areaCells: number;
  };
  maskCellBounds?: {
    minCellX: number;
    maxCellX: number;
    minCellY: number;
    maxCellY: number;
    widthCells: number;
    heightCells: number;
    areaCells: number;
  };
  maskCellRanges: RoomMaskCellRange[];
  rect: WorldRect;
  isInterior: boolean;
};

export type SectorAreaMetadata = {
  cols: number;
  rows: number;
  sectorWidthTiles: number;
  sectorHeightTiles: number;
  tileSize: number;
  areaIds: readonly number[];
  indoor: readonly number[];
  bounded: readonly number[];
};

export type SectorAreaBoundsOptions = {
  walkableUnionCellCap?: number;
};

export const DEFAULT_MAX_INTERIOR_WALKABLE_CELLS = 4096;
export const DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS = 8192;
export const DEFAULT_ROOM_WALL_MASK_THICKNESS_CELLS = 24;
export const DEFAULT_SECTOR_WALKABLE_UNION_CELL_CAP = 6000;

export function resolveSectorAreaBounds(
  sectors: SectorAreaMetadata | undefined,
  solidRows: readonly string[],
  grid: CollisionGrid,
  startWorldPixel: { x: number; y: number },
  options: SectorAreaBoundsOptions = {}
): ConnectedRoomBounds | undefined {
  if (!validSectorMetadata(sectors)) {
    return undefined;
  }
  const startCell = worldPixelToCollisionCell(startWorldPixel, grid.cellSize);
  if (
    !startCell ||
    !isCellInGrid(startCell.cellX, startCell.cellY, grid) ||
    isSolidCell(solidRows, startCell.cellX, startCell.cellY)
  ) {
    return undefined;
  }
  const startSector = sectorCoordForWorldPixel(startWorldPixel, sectors);
  if (!startSector) {
    return undefined;
  }

  const areaId = sectors.areaIds[startSector.index];
  if (!Number.isInteger(areaId)) {
    return undefined;
  }
  const areaSectorIndexes = floodSectorArea(sectors, startSector, areaId);
  const walkableFlood = floodWalkableComponent(
    solidRows,
    grid,
    startCell,
    Math.max(0, Math.floor(options.walkableUnionCellCap ?? DEFAULT_SECTOR_WALKABLE_UNION_CELL_CAP))
  );

  if (!walkableFlood.exceededCap) {
    for (const cell of walkableFlood.cells) {
      const sector = sectorCoordForCollisionCell(cell.cellX, cell.cellY, sectors, grid);
      if (sector) {
        areaSectorIndexes.add(sector.index);
      }
    }
  }

  const maskCellRanges = buildSectorMaskCellRanges(areaSectorIndexes, sectors, grid);
  const maskCellBounds = cellBoundsForRanges(maskCellRanges);
  const rectCellBounds = maskCellBounds ?? walkableFlood.walkableCellBounds;

  return {
    startCell,
    walkableCells: walkableFlood.walkableCells,
    walkableCellBounds: walkableFlood.walkableCellBounds,
    ...(maskCellBounds ? { maskCellBounds } : {}),
    maskCellRanges,
    rect: {
      x: rectCellBounds.minCellX * grid.cellSize,
      y: rectCellBounds.minCellY * grid.cellSize,
      width: rectCellBounds.widthCells * grid.cellSize,
      height: rectCellBounds.heightCells * grid.cellSize
    },
    isInterior: sectors.bounded[startSector.index] === 1
  };
}

export function sectorCoordForWorldPixel(
  point: { x: number; y: number },
  sectors: SectorAreaMetadata
): { sectorCol: number; sectorRow: number; index: number } | undefined {
  const sectorWidthPixels = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeightPixels = sectors.sectorHeightTiles * sectors.tileSize;
  if (
    sectorWidthPixels <= 0 ||
    sectorHeightPixels <= 0 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0
  ) {
    return undefined;
  }
  const sectorCol = Math.floor(point.x / sectorWidthPixels);
  const sectorRow = Math.floor(point.y / sectorHeightPixels);
  if (sectorCol < 0 || sectorRow < 0 || sectorCol >= sectors.cols || sectorRow >= sectors.rows) {
    return undefined;
  }
  return { sectorCol, sectorRow, index: sectorRow * sectors.cols + sectorCol };
}

export function resolveConnectedRoomBounds(
  solidRows: readonly string[],
  grid: CollisionGrid,
  startWorldPixel: { x: number; y: number },
  options: RoomBoundsOptions = {}
): ConnectedRoomBounds | undefined {
  const startCell = worldPixelToCollisionCell(startWorldPixel, grid.cellSize);
  if (
    !startCell ||
    !isCellInGrid(startCell.cellX, startCell.cellY, grid) ||
    isSolidCell(solidRows, startCell.cellX, startCell.cellY)
  ) {
    return undefined;
  }

  const seen = new Uint8Array(grid.width * grid.height);
  const queue: Array<{ cellX: number; cellY: number }> = [startCell];
  seen[startCell.cellY * grid.width + startCell.cellX] = 1;

  let cursor = 0;
  let walkableCells = 0;
  let minCellX = startCell.cellX;
  let maxCellX = startCell.cellX;
  let minCellY = startCell.cellY;
  let maxCellY = startCell.cellY;

  while (cursor < queue.length) {
    const cell = queue[cursor];
    cursor += 1;
    walkableCells += 1;
    minCellX = Math.min(minCellX, cell.cellX);
    maxCellX = Math.max(maxCellX, cell.cellX);
    minCellY = Math.min(minCellY, cell.cellY);
    maxCellY = Math.max(maxCellY, cell.cellY);

    enqueueWalkableNeighbor(cell.cellX + 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX - 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY + 1);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY - 1);
  }

  const widthCells = maxCellX - minCellX + 1;
  const heightCells = maxCellY - minCellY + 1;
  const areaCells = widthCells * heightCells;
  const maxWalkableCells = options.maxInteriorWalkableCells ?? DEFAULT_MAX_INTERIOR_WALKABLE_CELLS;
  const maxBoundsAreaCells = options.maxInteriorBoundsAreaCells ?? DEFAULT_MAX_INTERIOR_BOUNDS_AREA_CELLS;
  const isInterior = walkableCells <= maxWalkableCells && areaCells <= maxBoundsAreaCells;
  const wallMaskThicknessCells = Math.max(
    0,
    Math.floor(options.wallMaskThicknessCells ?? DEFAULT_ROOM_WALL_MASK_THICKNESS_CELLS)
  );
  const maskCellRanges = isInterior
    ? buildRoomMaskCellRanges({
      solidRows,
      surfaceRows: options.surfaceRows,
      grid,
      currentWalkableCells: queue,
      currentWalkableSeen: seen,
      walkableBounds: { minCellX, maxCellX, minCellY, maxCellY },
      wallMaskThicknessCells
    })
    : [];
  const maskCellBounds = cellBoundsForRanges(maskCellRanges);
  const rectCellBounds = maskCellBounds ?? {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY,
    widthCells,
    heightCells,
    areaCells
  };

  return {
    startCell,
    walkableCells,
    walkableCellBounds: {
      minCellX,
      maxCellX,
      minCellY,
      maxCellY,
      widthCells,
      heightCells,
      areaCells
    },
    ...(maskCellBounds ? { maskCellBounds } : {}),
    maskCellRanges,
    rect: {
      x: rectCellBounds.minCellX * grid.cellSize,
      y: rectCellBounds.minCellY * grid.cellSize,
      width: rectCellBounds.widthCells * grid.cellSize,
      height: rectCellBounds.heightCells * grid.cellSize
    },
    isInterior
  };

  function enqueueWalkableNeighbor(cellX: number, cellY: number): void {
    if (!isCellInGrid(cellX, cellY, grid) || isSolidCell(solidRows, cellX, cellY)) {
      return;
    }
    const index = cellY * grid.width + cellX;
    if (seen[index]) {
      return;
    }
    seen[index] = 1;
    queue.push({ cellX, cellY });
  }
}

export function roomMaskContainsCell(
  room: Pick<ConnectedRoomBounds, "maskCellRanges">,
  cellX: number,
  cellY: number
): boolean {
  if (!Number.isInteger(cellX) || !Number.isInteger(cellY)) {
    return false;
  }
  for (const range of room.maskCellRanges) {
    if (range.cellY < cellY) {
      continue;
    }
    if (range.cellY > cellY) {
      return false;
    }
    if (cellX >= range.minCellX && cellX <= range.maxCellX) {
      return true;
    }
  }
  return false;
}

export function roomMaskContainsWorldPoint(
  room: Pick<ConnectedRoomBounds, "maskCellRanges">,
  point: { x: number; y: number },
  grid: CollisionGrid
): boolean {
  const cell = worldPixelToCollisionCell(point, grid.cellSize);
  return Boolean(cell && roomMaskContainsCell(room, cell.cellX, cell.cellY));
}

function validSectorMetadata(sectors: SectorAreaMetadata | undefined): sectors is SectorAreaMetadata {
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
  const expected = sectors.cols * sectors.rows;
  return (
    sectors.areaIds.length >= expected &&
    sectors.indoor.length >= expected &&
    sectors.bounded.length >= expected
  );
}

function floodSectorArea(
  sectors: SectorAreaMetadata,
  start: { sectorCol: number; sectorRow: number; index: number },
  areaId: number
): Set<number> {
  const seen = new Uint8Array(sectors.cols * sectors.rows);
  const queue = [start];
  const indexes = new Set<number>([start.index]);
  seen[start.index] = 1;
  let cursor = 0;
  while (cursor < queue.length) {
    const sector = queue[cursor];
    cursor += 1;
    enqueueSector(sector.sectorCol + 1, sector.sectorRow);
    enqueueSector(sector.sectorCol - 1, sector.sectorRow);
    enqueueSector(sector.sectorCol, sector.sectorRow + 1);
    enqueueSector(sector.sectorCol, sector.sectorRow - 1);
  }
  return indexes;

  function enqueueSector(sectorCol: number, sectorRow: number): void {
    if (sectorCol < 0 || sectorRow < 0 || sectorCol >= sectors.cols || sectorRow >= sectors.rows) {
      return;
    }
    const index = sectorRow * sectors.cols + sectorCol;
    if (seen[index] || sectors.areaIds[index] !== areaId) {
      return;
    }
    seen[index] = 1;
    indexes.add(index);
    queue.push({ sectorCol, sectorRow, index });
  }
}

function floodWalkableComponent(
  solidRows: readonly string[],
  grid: CollisionGrid,
  startCell: { cellX: number; cellY: number },
  cellCap: number
): {
  cells: Array<{ cellX: number; cellY: number }>;
  exceededCap: boolean;
  walkableCells: number;
  walkableCellBounds: ConnectedRoomBounds["walkableCellBounds"];
} {
  const seen = new Uint8Array(grid.width * grid.height);
  const queue: Array<{ cellX: number; cellY: number }> = [startCell];
  seen[startCell.cellY * grid.width + startCell.cellX] = 1;
  let cursor = 0;
  let walkableCells = 0;
  let minCellX = startCell.cellX;
  let maxCellX = startCell.cellX;
  let minCellY = startCell.cellY;
  let maxCellY = startCell.cellY;

  while (cursor < queue.length) {
    const cell = queue[cursor];
    cursor += 1;
    walkableCells += 1;
    minCellX = Math.min(minCellX, cell.cellX);
    maxCellX = Math.max(maxCellX, cell.cellX);
    minCellY = Math.min(minCellY, cell.cellY);
    maxCellY = Math.max(maxCellY, cell.cellY);
    if (walkableCells > cellCap) {
      return finalize(true);
    }

    enqueueWalkableNeighbor(cell.cellX + 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX - 1, cell.cellY);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY + 1);
    enqueueWalkableNeighbor(cell.cellX, cell.cellY - 1);
  }

  return finalize(false);

  function enqueueWalkableNeighbor(cellX: number, cellY: number): void {
    if (!isCellInGrid(cellX, cellY, grid) || isSolidCell(solidRows, cellX, cellY)) {
      return;
    }
    const index = cellY * grid.width + cellX;
    if (seen[index]) {
      return;
    }
    seen[index] = 1;
    queue.push({ cellX, cellY });
  }

  function finalize(exceededCap: boolean): ReturnType<typeof floodWalkableComponent> {
    const widthCells = maxCellX - minCellX + 1;
    const heightCells = maxCellY - minCellY + 1;
    return {
      cells: exceededCap ? [] : queue,
      exceededCap,
      walkableCells,
      walkableCellBounds: {
        minCellX,
        maxCellX,
        minCellY,
        maxCellY,
        widthCells,
        heightCells,
        areaCells: widthCells * heightCells
      }
    };
  }
}

function sectorCoordForCollisionCell(
  cellX: number,
  cellY: number,
  sectors: SectorAreaMetadata,
  grid: CollisionGrid
): { sectorCol: number; sectorRow: number; index: number } | undefined {
  return sectorCoordForWorldPixel({ x: cellX * grid.cellSize, y: cellY * grid.cellSize }, sectors);
}

function buildSectorMaskCellRanges(
  sectorIndexes: Set<number>,
  sectors: SectorAreaMetadata,
  grid: CollisionGrid
): RoomMaskCellRange[] {
  const rangesByRow = new Map<number, Array<{ minCellX: number; maxCellX: number }>>();
  for (const index of sectorIndexes) {
    const sectorCol = index % sectors.cols;
    const sectorRow = Math.floor(index / sectors.cols);
    const bounds = sectorCellBounds(sectorCol, sectorRow, sectors, grid);
    if (!bounds) {
      continue;
    }
    for (let cellY = bounds.minCellY; cellY <= bounds.maxCellY; cellY += 1) {
      rangesByRow.set(cellY, [
        ...(rangesByRow.get(cellY) ?? []),
        { minCellX: bounds.minCellX, maxCellX: bounds.maxCellX }
      ]);
    }
  }

  const rows = [...rangesByRow.keys()].sort((a, b) => a - b);
  const mergedRanges: RoomMaskCellRange[] = [];
  for (const cellY of rows) {
    const rowRanges = (rangesByRow.get(cellY) ?? []).sort((a, b) => a.minCellX - b.minCellX || a.maxCellX - b.maxCellX);
    let current: { minCellX: number; maxCellX: number } | undefined;
    for (const range of rowRanges) {
      if (!current) {
        current = { ...range };
        continue;
      }
      if (range.minCellX <= current.maxCellX + 1) {
        current.maxCellX = Math.max(current.maxCellX, range.maxCellX);
        continue;
      }
      mergedRanges.push({ cellY, ...current });
      current = { ...range };
    }
    if (current) {
      mergedRanges.push({ cellY, ...current });
    }
  }
  return mergedRanges;
}

function sectorCellBounds(
  sectorCol: number,
  sectorRow: number,
  sectors: SectorAreaMetadata,
  grid: CollisionGrid
): ConnectedRoomBounds["walkableCellBounds"] | undefined {
  const sectorWidthPixels = sectors.sectorWidthTiles * sectors.tileSize;
  const sectorHeightPixels = sectors.sectorHeightTiles * sectors.tileSize;
  const minPixelX = sectorCol * sectorWidthPixels;
  const minPixelY = sectorRow * sectorHeightPixels;
  const maxPixelXExclusive = Math.min((sectorCol + 1) * sectorWidthPixels, grid.width * grid.cellSize);
  const maxPixelYExclusive = Math.min((sectorRow + 1) * sectorHeightPixels, grid.height * grid.cellSize);
  if (maxPixelXExclusive <= minPixelX || maxPixelYExclusive <= minPixelY) {
    return undefined;
  }
  const minCellX = clampCell(Math.floor(minPixelX / grid.cellSize), 0, grid.width - 1);
  const minCellY = clampCell(Math.floor(minPixelY / grid.cellSize), 0, grid.height - 1);
  const maxCellX = clampCell(Math.ceil(maxPixelXExclusive / grid.cellSize) - 1, 0, grid.width - 1);
  const maxCellY = clampCell(Math.ceil(maxPixelYExclusive / grid.cellSize) - 1, 0, grid.height - 1);
  if (maxCellX < minCellX || maxCellY < minCellY) {
    return undefined;
  }
  const widthCells = maxCellX - minCellX + 1;
  const heightCells = maxCellY - minCellY + 1;
  return {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY,
    widthCells,
    heightCells,
    areaCells: widthCells * heightCells
  };
}

function buildRoomMaskCellRanges(options: {
  solidRows: readonly string[];
  surfaceRows: readonly string[] | undefined;
  grid: CollisionGrid;
  currentWalkableCells: Array<{ cellX: number; cellY: number }>;
  currentWalkableSeen: Uint8Array;
  walkableBounds: { minCellX: number; maxCellX: number; minCellY: number; maxCellY: number };
  wallMaskThicknessCells: number;
}): RoomMaskCellRange[] {
  const {
    solidRows,
    surfaceRows,
    grid,
    currentWalkableCells,
    currentWalkableSeen,
    walkableBounds,
    wallMaskThicknessCells
  } = options;
  const candidateMinCellX = clampCell(walkableBounds.minCellX - wallMaskThicknessCells, 0, grid.width - 1);
  const candidateMaxCellX = clampCell(walkableBounds.maxCellX + wallMaskThicknessCells, 0, grid.width - 1);
  const candidateMinCellY = clampCell(walkableBounds.minCellY - wallMaskThicknessCells, 0, grid.height - 1);
  const candidateMaxCellY = clampCell(walkableBounds.maxCellY + wallMaskThicknessCells, 0, grid.height - 1);
  const nearestSearchPaddingCells = wallMaskThicknessCells * 2;
  const localMinCellX = clampCell(walkableBounds.minCellX - nearestSearchPaddingCells, 0, grid.width - 1);
  const localMaxCellX = clampCell(walkableBounds.maxCellX + nearestSearchPaddingCells, 0, grid.width - 1);
  const localMinCellY = clampCell(walkableBounds.minCellY - nearestSearchPaddingCells, 0, grid.height - 1);
  const localMaxCellY = clampCell(walkableBounds.maxCellY + nearestSearchPaddingCells, 0, grid.height - 1);
  const localWidth = localMaxCellX - localMinCellX + 1;
  const localHeight = localMaxCellY - localMinCellY + 1;
  const currentDistance = filledDistanceArray(localWidth * localHeight);
  const otherDistance = filledDistanceArray(localWidth * localHeight);
  const currentQueue: Array<{ cellX: number; cellY: number }> = [];
  const otherQueue: Array<{ cellX: number; cellY: number }> = [];

  for (const cell of currentWalkableCells) {
    if (!cellInLocalBounds(cell.cellX, cell.cellY)) {
      continue;
    }
    const index = localIndex(cell.cellX, cell.cellY);
    currentDistance[index] = 0;
    currentQueue.push(cell);
  }

  if (surfaceRows) {
    for (let cellY = localMinCellY; cellY <= localMaxCellY; cellY += 1) {
      for (let cellX = localMinCellX; cellX <= localMaxCellX; cellX += 1) {
        if (!isOtherWalkable(cellX, cellY)) {
          continue;
        }
        const index = localIndex(cellX, cellY);
        otherDistance[index] = 0;
        otherQueue.push({ cellX, cellY });
      }
    }
    floodMaskDistance(currentQueue, currentDistance, (cellX, cellY) =>
      !isOtherWalkable(cellX, cellY) && (isCurrentWalkable(cellX, cellY) || isRenderedSolidCell(cellX, cellY))
    );
    floodMaskDistance(otherQueue, otherDistance, (cellX, cellY) =>
      !isCurrentWalkable(cellX, cellY) && (isOtherWalkable(cellX, cellY) || isRenderedSolidCell(cellX, cellY))
    );
  } else {
    for (let cellY = localMinCellY; cellY <= localMaxCellY; cellY += 1) {
      for (let cellX = localMinCellX; cellX <= localMaxCellX; cellX += 1) {
        if (isSolidCell(solidRows, cellX, cellY) || isCurrentWalkable(cellX, cellY)) {
          continue;
        }
        const index = localIndex(cellX, cellY);
        otherDistance[index] = 0;
        otherQueue.push({ cellX, cellY });
      }
    }
    floodMaskDistance(currentQueue, currentDistance, (cellX, cellY) => !isOtherWalkable(cellX, cellY));
    floodMaskDistance(otherQueue, otherDistance, (cellX, cellY) => !isCurrentWalkable(cellX, cellY));
  }

  const ranges: RoomMaskCellRange[] = [];
  for (let cellY = candidateMinCellY; cellY <= candidateMaxCellY; cellY += 1) {
    let rangeStart: number | undefined;
    for (let cellX = candidateMinCellX; cellX <= candidateMaxCellX; cellX += 1) {
      if (maskIncludesCell(cellX, cellY)) {
        rangeStart ??= cellX;
        continue;
      }
      rangeStart = flushRange(cellY, cellX - 1, rangeStart);
    }
    rangeStart = flushRange(cellY, candidateMaxCellX, rangeStart);
  }
  return ranges;

  function floodMaskDistance(
    queue: Array<{ cellX: number; cellY: number }>,
    distances: Int16Array,
    canEnter: (cellX: number, cellY: number) => boolean
  ): void {
    let cursor = 0;
    while (cursor < queue.length) {
      const cell = queue[cursor];
      cursor += 1;
      const nextDistance = distances[localIndex(cell.cellX, cell.cellY)] + 1;
      if (nextDistance > wallMaskThicknessCells) {
        continue;
      }
      enqueueNeighbor(cell.cellX + 1, cell.cellY, nextDistance, distances, queue, canEnter);
      enqueueNeighbor(cell.cellX - 1, cell.cellY, nextDistance, distances, queue, canEnter);
      enqueueNeighbor(cell.cellX, cell.cellY + 1, nextDistance, distances, queue, canEnter);
      enqueueNeighbor(cell.cellX, cell.cellY - 1, nextDistance, distances, queue, canEnter);
    }
  }

  function enqueueNeighbor(
    cellX: number,
    cellY: number,
    distance: number,
    distances: Int16Array,
    queue: Array<{ cellX: number; cellY: number }>,
    canEnter: (cellX: number, cellY: number) => boolean
  ): void {
    if (!cellInLocalBounds(cellX, cellY) || !canEnter(cellX, cellY)) {
      return;
    }
    const index = localIndex(cellX, cellY);
    if (distances[index] >= 0) {
      return;
    }
    distances[index] = distance;
    queue.push({ cellX, cellY });
  }

  function maskIncludesCell(cellX: number, cellY: number): boolean {
    if (isCurrentWalkable(cellX, cellY)) {
      return true;
    }
    if (!isSolidCell(solidRows, cellX, cellY)) {
      return false;
    }
    const index = localIndex(cellX, cellY);
    const current = currentDistance[index];
    if (surfaceRows) {
      const other = otherDistance[index];
      return (
        current >= 0 &&
        current <= wallMaskThicknessCells &&
        isRenderedSolidCell(cellX, cellY) &&
        (other < 0 || current <= other)
      );
    }
    const other = otherDistance[index];
    return current >= 0 && current <= wallMaskThicknessCells && (other < 0 || current < other);
  }

  function flushRange(cellY: number, rangeEnd: number, rangeStart: number | undefined): undefined {
    if (rangeStart === undefined) {
      return undefined;
    }
    ranges.push({ cellY, minCellX: rangeStart, maxCellX: rangeEnd });
    return undefined;
  }

  function localIndex(cellX: number, cellY: number): number {
    return (cellY - localMinCellY) * localWidth + (cellX - localMinCellX);
  }

  function cellInLocalBounds(cellX: number, cellY: number): boolean {
    return (
      cellX >= localMinCellX &&
      cellX <= localMaxCellX &&
      cellY >= localMinCellY &&
      cellY <= localMaxCellY
    );
  }

  function isCurrentWalkable(cellX: number, cellY: number): boolean {
    return currentWalkableSeen[cellY * grid.width + cellX] === 1;
  }

  function isOtherWalkable(cellX: number, cellY: number): boolean {
    return !isSolidCell(solidRows, cellX, cellY) && !isCurrentWalkable(cellX, cellY);
  }

  function isRenderedSolidCell(cellX: number, cellY: number): boolean {
    return isSolidCell(solidRows, cellX, cellY) && surfaceRows !== undefined && surfaceAtCell(surfaceRows, cellX, cellY) !== 0;
  }
}

function cellBoundsForRanges(ranges: RoomMaskCellRange[]): ConnectedRoomBounds["maskCellBounds"] | undefined {
  if (ranges.length === 0) {
    return undefined;
  }
  let minCellX = Number.POSITIVE_INFINITY;
  let maxCellX = Number.NEGATIVE_INFINITY;
  let minCellY = Number.POSITIVE_INFINITY;
  let maxCellY = Number.NEGATIVE_INFINITY;
  for (const range of ranges) {
    minCellX = Math.min(minCellX, range.minCellX);
    maxCellX = Math.max(maxCellX, range.maxCellX);
    minCellY = Math.min(minCellY, range.cellY);
    maxCellY = Math.max(maxCellY, range.cellY);
  }
  const widthCells = maxCellX - minCellX + 1;
  const heightCells = maxCellY - minCellY + 1;
  return {
    minCellX,
    maxCellX,
    minCellY,
    maxCellY,
    widthCells,
    heightCells,
    areaCells: widthCells * heightCells
  };
}

function filledDistanceArray(length: number): Int16Array {
  const distances = new Int16Array(length);
  distances.fill(-1);
  return distances;
}

function isCellInGrid(cellX: number, cellY: number, grid: CollisionGrid): boolean {
  return (
    Number.isInteger(cellX) &&
    Number.isInteger(cellY) &&
    cellX >= 0 &&
    cellY >= 0 &&
    cellX < grid.width &&
    cellY < grid.height
  );
}

function isSolidCell(solidRows: readonly string[], cellX: number, cellY: number): boolean {
  return solidRows[cellY]?.[cellX] !== "0";
}

function clampCell(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
