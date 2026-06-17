import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldChunkedSchema, type WorldDoor } from "@eb/schemas";
import { resolveDoorWarpLanding } from "../src/doorTriggers";
import { walkableFootprintClear, PLAYER_FOOT_BOX } from "../src/collisionFootprint";
import { resolveSectorAreaBounds, type SectorAreaMetadata } from "../src/roomBounds";
import type { CollisionGrid } from "../src/collisionOverlay";

// ---------------------------------------------------------------------------
// Maps & interiors QA: exercises the live runtime resolvers (doorTriggers /
// collisionFootprint / roomBounds) against the gitignored generated world.json.
// Scope = New Game -> Onett -> Giant Step. We assert ONLY in-slice invariants:
// reachability is measured as the walkable component flooded from the canonical
// new-game spawn (2112,1768); out-of-slice (Twoson+) doors are not asserted.
// No EarthBound strings are embedded; only numeric ids + world pixel coords.
// ---------------------------------------------------------------------------

const WORLD_PATH = "apps/game/public/generated/world.json";
const SPAWN = { x: 2112, y: 1768 } as const;
const TRIGGER_REACH_CELLS = 3; // door triggers sit on solid doormats; probe their walkable neighbourhood

const hasWorld = existsSync(resolve(WORLD_PATH));
const describeWorld = hasWorld ? describe : describe.skip;

describeWorld("maps-interiors slice invariants", () => {
  const world = WorldChunkedSchema.parse(JSON.parse(readFileSync(resolve(WORLD_PATH), "utf8")));
  const grid: CollisionGrid = {
    cellSize: world.collision.cellSize,
    width: world.collision.width,
    height: world.collision.height
  };
  const solidRows = world.collision.solidRows;
  const doors = world.doors;

  function isSolidCell(cx: number, cy: number): boolean {
    return cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height || solidRows[cy]?.[cx] === "1";
  }

  // Walkable component flooded from the new-game spawn = the playable Onett overworld.
  const spawnReach = (() => {
    const startX = Math.floor(SPAWN.x / grid.cellSize);
    const startY = Math.floor(SPAWN.y / grid.cellSize);
    const seen = new Uint8Array(grid.width * grid.height);
    const queue: Array<[number, number]> = [[startX, startY]];
    seen[startY * grid.width + startX] = 1;
    let cursor = 0;
    let count = 0;
    while (cursor < queue.length) {
      const [cx, cy] = queue[cursor];
      cursor += 1;
      count += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (isSolidCell(nx, ny)) continue;
        const index = ny * grid.width + nx;
        if (seen[index]) continue;
        seen[index] = 1;
        queue.push([nx, ny]);
      }
    }
    return { seen, count };
  })();

  function reachableFromSpawn(point: { x: number; y: number }): boolean {
    const cx = Math.floor(point.x / grid.cellSize);
    const cy = Math.floor(point.y / grid.cellSize);
    for (let dy = -TRIGGER_REACH_CELLS; dy <= TRIGGER_REACH_CELLS; dy += 1) {
      for (let dx = -TRIGGER_REACH_CELLS; dx <= TRIGGER_REACH_CELLS; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < grid.width && ny < grid.height && spawnReach.seen[ny * grid.width + nx]) {
          return true;
        }
      }
    }
    return false;
  }

  const inSliceDoors: WorldDoor[] = doors.filter((door) => reachableFromSpawn(door.worldPixel));

  it("places the new-game spawn on a walkable, footprint-clear overworld cell", () => {
    expect(isSolidCell(Math.floor(SPAWN.x / grid.cellSize), Math.floor(SPAWN.y / grid.cellSize))).toBe(false);
    expect(walkableFootprintClear(SPAWN, solidRows, grid, PLAYER_FOOT_BOX)).toBe(true);
    // The spawn sits in the large Onett overworld component, not a tiny stub room.
    expect(spawnReach.count).toBeGreaterThan(10000);
  });

  it("exposes a non-trivial set of in-slice (spawn-reachable) door triggers", () => {
    expect(inSliceDoors.length).toBeGreaterThanOrEqual(20);
  });

  it("resolves every in-slice door warp to a walkable footprint landing within the runtime ring search", () => {
    const unresolved: Array<{ trigger: WorldDoor["worldPixel"]; dest: WorldDoor["destinationWorldPixel"] }> = [];
    for (const door of inSliceDoors) {
      const landing = resolveDoorWarpLanding(door.destinationWorldPixel, solidRows, grid, { box: PLAYER_FOOT_BOX });
      if (!landing.walkable) {
        unresolved.push({ trigger: door.worldPixel, dest: door.destinationWorldPixel });
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("never warps an in-slice door to the void origin (0,0) or out of map bounds", () => {
    const mapWidthPx = world.mapWidthTiles * world.tileSize;
    const mapHeightPx = world.mapHeightTiles * world.tileSize;
    for (const door of inSliceDoors) {
      const dest = door.destinationWorldPixel;
      expect(dest.x === 0 && dest.y === 0).toBe(false);
      expect(dest.x).toBeGreaterThanOrEqual(0);
      expect(dest.y).toBeGreaterThanOrEqual(0);
      expect(dest.x).toBeLessThan(mapWidthPx);
      expect(dest.y).toBeLessThan(mapHeightPx);
    }
  });

  it("isolates each known Onett slice interior into a bounded sector that renders alone", () => {
    const sectors = world.sectors as SectorAreaMetadata | undefined;
    expect(sectors).toBeDefined();
    if (!sectors) return;

    // Landing points verified to resolve walkable; each must classify as a bounded interior
    // and produce a mask whose bounding box is a small room (not the whole overworld).
    const interiorLandings: Array<{ id: number; point: { x: number; y: number } }> = [
      { id: 115, point: { x: 7872, y: 1000 } }, // hospital greeter room
      { id: 43, point: { x: 7352, y: 1384 } } // bakery (reachable on foot from spawn)
    ];

    for (const { point } of interiorLandings) {
      const bounds = resolveSectorAreaBounds(sectors, solidRows, grid, point);
      expect(bounds).toBeDefined();
      if (!bounds) continue;
      expect(bounds.isInterior).toBe(true);
      // A single Onett shop/clinic room mask stays far below the ~32k-cell overworld component.
      expect(bounds.rect.width).toBeLessThan(mapBoundCap(world));
      expect(bounds.rect.height).toBeLessThan(mapBoundCap(world));
    }
  });

  it("round-trips the bakery: enter door lands in the interior, exit door returns to the doormat", () => {
    // Bakery doormat (1856,1736) -> interior (7360,1384); interior exit (7376,1384) -> doormat (1856,1744).
    // Round-trip landings are accepted within one collision cell (the exit lands on the doormat threshold).
    const doormat = { x: 1856, y: 1736 };
    const interior = { x: 7360, y: 1384 };
    const doormatCell = cellKey(doormat);
    const interiorCell = cellKey(interior);

    const enter = doors.find((d) => cellKey(d.worldPixel) === doormatCell && cellKey(d.destinationWorldPixel) === interiorCell);
    expect(enter, "bakery enter door (doormat -> interior)").toBeDefined();

    // Exit door's trigger sits a couple cells from the enter-landing (same room) and warps back
    // to within one cell of the original doormat. That closes the round-trip.
    const exit = doors.find(
      (d) => nearCell(d.worldPixel, enter!.destinationWorldPixel, 3) && nearCell(d.destinationWorldPixel, enter!.worldPixel, 1)
    );
    expect(exit, "bakery exit door (interior -> doormat)").toBeDefined();

    // Both warp landings resolve to walkable footprints.
    expect(resolveDoorWarpLanding(enter!.destinationWorldPixel, solidRows, grid, { box: PLAYER_FOOT_BOX }).walkable).toBe(true);
    expect(resolveDoorWarpLanding(exit!.destinationWorldPixel, solidRows, grid, { box: PLAYER_FOOT_BOX }).walkable).toBe(true);
    // The bakery doormat is reachable on foot from the new-game spawn.
    expect(reachableFromSpawn({ x: 1856, y: 1736 })).toBe(true);
  });

  function cellKey(point: { x: number; y: number }): string {
    return `${Math.floor(point.x / grid.cellSize)},${Math.floor(point.y / grid.cellSize)}`;
  }

  function nearCell(a: { x: number; y: number }, b: { x: number; y: number }, cells: number): boolean {
    return (
      Math.abs(Math.floor(a.x / grid.cellSize) - Math.floor(b.x / grid.cellSize)) <= cells &&
      Math.abs(Math.floor(a.y / grid.cellSize) - Math.floor(b.y / grid.cellSize)) <= cells
    );
  }

  function mapBoundCap(w: typeof world): number {
    // Any single interior mask should be well under a quarter of the full map dimension.
    return Math.min(w.mapWidthTiles, w.mapHeightTiles) * w.tileSize * 0.25;
  }
});
