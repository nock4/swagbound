import { describe, expect, it } from "vitest";
import {
  buildIndoorRoomSectorGroups,
  canonicalMirrorSignature,
  extractObjectComponents,
  growSolidFootprint,
  isIndoorAnchorTile,
  sectorIndexForTile,
  splitTerrainTiles,
  type MapCell,
  type TerrainTileStat
} from "../../../scripts/atlas/extract-motifs";
import type { WorldSectorAreas } from "../src/world";

describe("motif atlas terrain and signature helpers", () => {
  it("marks a known fill as terrain while preserving a one-tile object", () => {
    const stats: TerrainTileStat[] = [
      {
        key: "grass",
        coverage: 8,
        maxSameTileConnectedComponent: 8,
        solidCells: 0,
        isForeground: false,
        greenishRatio: 0.8
      },
      {
        key: "bush",
        coverage: 1,
        maxSameTileConnectedComponent: 1,
        solidCells: 4,
        isForeground: true,
        greenishRatio: 0.7
      }
    ];

    const split = splitTerrainTiles(stats, 9, {
      densityTargetPct: 35,
      retuneTargetPct: 35,
      largeSameTileCc: 16,
      veryHighCoverage: 50,
      highCoverage: 50
    });

    expect(split.terrainKeys.has("grass")).toBe(true);
    expect(split.terrainKeys.has("bush")).toBe(false);
    expect(split.objectDensityPct).toBeCloseTo(11.11, 2);
  });

  it("keeps one-tile object components and claims every tile once", () => {
    const claimed = new Set<string>();
    const components = extractObjectComponents({
      width: 3,
      height: 3,
      isCandidate: (x, y) => (x === 1 && y === 1) || (x === 2 && y === 1),
      isClaimed: (x, y) => claimed.has(`${x},${y}`),
      claim: (x, y) => claimed.add(`${x},${y}`)
    });

    expect(components).toHaveLength(1);
    expect(components[0]?.cells).toHaveLength(2);
    expect(claimed).toEqual(new Set(["1,1", "2,1"]));

    const singleton = extractObjectComponents({
      width: 2,
      height: 2,
      isCandidate: (x, y) => x === 0 && y === 1
    });
    expect(singleton).toHaveLength(1);
    expect(singleton[0]?.cells).toEqual([{ x: 0, y: 1 }]);
  });

  it("folds horizontal and vertical mirrors into one signature", () => {
    const original = [
      ".#",
      "##"
    ];
    const horizontal = [
      "#.",
      "##"
    ];
    const vertical = [
      "##",
      ".#"
    ];

    expect(canonicalMirrorSignature(2, 2, original)).toBe(canonicalMirrorSignature(2, 2, horizontal));
    expect(canonicalMirrorSignature(2, 2, original)).toBe(canonicalMirrorSignature(2, 2, vertical));
  });

  it("routes indoor door anchors to rooms and caps outdoor building footprints", () => {
    const width = 32;
    const height = 16;
    const sectors: WorldSectorAreas = {
      cols: 2,
      rows: 1,
      sectorWidthTiles: 16,
      sectorHeightTiles: 16,
      tileSize: 32,
      areaIds: [100, 200],
      indoor: [0, 1],
      bounded: [0, 1]
    };
    const cells = makeCells(width, height, (x, y) => ({
      solidCells: x >= 0 && x < width && y >= 0 && y < height ? 1 : 0,
      sector: sectorIndexForTile({ x, y }, sectors) ?? 0
    }));
    const outdoorAnchor = { x: 8, y: 11 };
    const indoorAnchor = { x: 20, y: 11 };

    expect(isIndoorAnchorTile(outdoorAnchor, sectors)).toBe(false);
    const outdoorBuilding = growSolidFootprint({ cells, width, height, anchor: outdoorAnchor, sectors });
    expect(outdoorBuilding).toBeDefined();
    expect((outdoorBuilding?.maxX ?? 0) - (outdoorBuilding?.minX ?? 0) + 1).toBeLessThanOrEqual(14);
    expect((outdoorBuilding?.maxY ?? 0) - (outdoorBuilding?.minY ?? 0) + 1).toBeLessThanOrEqual(14);

    expect(isIndoorAnchorTile(indoorAnchor, sectors)).toBe(true);
    const indoorBuilding = isIndoorAnchorTile(indoorAnchor, sectors)
      ? undefined
      : growSolidFootprint({ cells, width, height, anchor: indoorAnchor, sectors });
    expect(indoorBuilding).toBeUndefined();
    expect(buildIndoorRoomSectorGroups(sectors)).toEqual([
      { sector: 1, sectorIndexes: [1], area: 200 }
    ]);
  });
});

function makeCells(
  width: number,
  height: number,
  overrides: (x: number, y: number) => Pick<MapCell, "sector" | "solidCells">
): MapCell[] {
  const cells: MapCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const override = overrides(x, y);
      cells.push({
        mapX: x,
        mapY: y,
        key: "test:1",
        tileset: 0,
        arrangement: 1,
        palette: 0,
        area: override.sector === 0 ? 100 : 200,
        sector: override.sector,
        solidCells: override.solidCells,
        isForeground: true
      });
    }
  }
  return cells;
}
