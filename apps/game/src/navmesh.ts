import type { Navmesh as NavmeshJson } from "@eb/schemas";

export type WorldRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NearestNavmeshComponent = {
  componentId: number;
  distanceCells: number;
};

export class NavmeshQuery {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;

  private readonly cells: Uint32Array;
  private readonly components: NavmeshJson["components"];
  private readonly rects: NavmeshJson["rects"];

  constructor(mesh: NavmeshJson) {
    this.cellSize = mesh.cellSize;
    this.width = mesh.width;
    this.height = mesh.height;
    this.components = mesh.components;
    this.rects = mesh.rects;
    this.cells = decodeRows(mesh);
  }

  componentAtWorldPixel(point: { x: number; y: number }): number {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return 0;
    }
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    return this.componentAtCell(cellX, cellY);
  }

  componentAtCell(cellX: number, cellY: number): number {
    if (cellX < 0 || cellY < 0 || cellX >= this.width || cellY >= this.height) {
      return 0;
    }
    return this.cells[cellY * this.width + cellX] ?? 0;
  }

  nearestComponentAt(point: { x: number; y: number }, maxRadiusCells = 2): NearestNavmeshComponent | undefined {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return undefined;
    }
    return this.nearestComponentAtCell(
      Math.floor(point.x / this.cellSize),
      Math.floor(point.y / this.cellSize),
      maxRadiusCells
    );
  }

  nearestComponentIdAtWorldPixel(x: number, y: number, maxRadiusCells = 2): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return 0;
    }
    const nearest = this.nearestComponentAtCell(
      Math.floor(x / this.cellSize),
      Math.floor(y / this.cellSize),
      maxRadiusCells
    );
    return nearest?.componentId ?? 0;
  }

  componentBounds(id: number): WorldRect | undefined {
    const component = this.components[String(id)];
    return component ? cellRectToWorldRect(component.bounds, this.cellSize) : undefined;
  }

  rectsForComponent(id: number): WorldRect[] {
    return this.rects
      .filter((rect) => rect.c === id)
      .map((rect) => cellRectToWorldRect(rect, this.cellSize));
  }

  private nearestComponentAtCell(cellX: number, cellY: number, maxRadiusCells: number): NearestNavmeshComponent | undefined {
    const maxRadius = Math.max(0, Math.floor(maxRadiusCells));
    for (let radius = 0; radius <= maxRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
            continue;
          }
          const componentId = this.componentAtCell(cellX + dx, cellY + dy);
          if (componentId !== 0) {
            return { componentId, distanceCells: radius };
          }
        }
      }
    }
    return undefined;
  }
}

export function decodeNavmesh(mesh: NavmeshJson): NavmeshQuery {
  return new NavmeshQuery(mesh);
}

export function componentAtWorldPixel(mesh: NavmeshQuery, point: { x: number; y: number }): number {
  return mesh.componentAtWorldPixel(point);
}

export function nearestComponentAt(
  mesh: NavmeshQuery,
  point: { x: number; y: number },
  maxRadiusCells = 2
): NearestNavmeshComponent | undefined {
  return mesh.nearestComponentAt(point, maxRadiusCells);
}

export function nearestComponentIdAtWorldPixel(
  mesh: NavmeshQuery,
  x: number,
  y: number,
  maxRadiusCells = 2
): number {
  return mesh.nearestComponentIdAtWorldPixel(x, y, maxRadiusCells);
}

export function componentBounds(mesh: NavmeshQuery, id: number): WorldRect | undefined {
  return mesh.componentBounds(id);
}

export function rectsForComponent(mesh: NavmeshQuery, id: number): WorldRect[] {
  return mesh.rectsForComponent(id);
}

function decodeRows(mesh: NavmeshJson): Uint32Array {
  const cells = new Uint32Array(mesh.width * mesh.height);
  if (mesh.rows.length !== mesh.height) {
    throw new Error(`navmesh row count ${mesh.rows.length} does not match height ${mesh.height}`);
  }

  for (let y = 0; y < mesh.height; y += 1) {
    const row = mesh.rows[y];
    let x = 0;
    for (const [componentId, runLength] of row) {
      if (x + runLength > mesh.width) {
        throw new Error(`navmesh row ${y} exceeds width ${mesh.width}`);
      }
      if (componentId !== 0) {
        cells.fill(componentId, y * mesh.width + x, y * mesh.width + x + runLength);
      }
      x += runLength;
    }
    if (x !== mesh.width) {
      throw new Error(`navmesh row ${y} length ${x} does not match width ${mesh.width}`);
    }
  }

  return cells;
}

function cellRectToWorldRect(rect: { x: number; y: number; w: number; h: number }, cellSize: number): WorldRect {
  return {
    x: rect.x * cellSize,
    y: rect.y * cellSize,
    w: rect.w * cellSize,
    h: rect.h * cellSize
  };
}
