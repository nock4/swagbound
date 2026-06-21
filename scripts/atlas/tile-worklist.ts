import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TileOverridesSchema } from "../../packages/eb-schemas/src/index";

const SCHEMA = "swagbound.atlas.tile-worklist.v1";
const DEFAULT_TILE_ATLAS_RELATIVE = "content/atlas/tiles.json";
const DEFAULT_TILE_OVERRIDES_RELATIVE = "content/tile-overrides.json";
const DEFAULT_TILE_WORKLIST_RELATIVE = "content/atlas/tile-worklist.json";
const COVERAGE_MILESTONES = [0.5, 0.8, 0.95] as const;

type TileAtlasTile = {
  arrangement: number;
  gx: number;
  gy: number;
  solidCells: number;
  isForeground: boolean;
  paletteId: number;
  usageCount: number;
  overridden?: boolean;
};

type TileAtlasTileset = {
  tileset: number;
  atlasImage: string;
  tiles: TileAtlasTile[];
};

type TileAtlasIndex = {
  tilesets: TileAtlasTileset[];
};

export type TileWorklistTile = {
  tileset: number;
  arrangement: number;
  usageCount: number;
  solidCells: number;
  isForeground: boolean;
  paletteId: number;
  atlasImage: string;
  gx: number;
  gy: number;
  cumulativeCoverage: number;
};

export type TileWorklistSummary = {
  totalTilePlacements: number;
  totalUsedTiles: number;
  overriddenUsedTiles: number;
  worklistTiles: number;
  worklistPlacements: number;
  worklistCoverage: number;
  tilesToCover50Pct: number | null;
  tilesToCover80Pct: number | null;
  tilesToCover95Pct: number | null;
};

export type TileWorklistIndex = {
  schema: typeof SCHEMA;
  generatedFrom: {
    tileAtlas: string;
    tileOverrides: string;
  };
  summary: TileWorklistSummary;
  tiles: TileWorklistTile[];
};

export type BuildTileWorklistOptions = {
  tileAtlas: TileAtlasIndex;
  overrideKeys?: Set<string>;
  tileAtlasRelative?: string;
  tileOverridesRelative?: string;
};

export type GenerateTileWorklistOptions = {
  rootDir?: string;
  tileAtlasRelative?: string;
  tileOverridesRelative?: string;
  outJsonRelative?: string;
};

type RankedTileInput = Omit<TileWorklistTile, "cumulativeCoverage">;

function roundCoverage(value: number): number {
  return Number(value.toFixed(6));
}

function tileKey(tileset: number, arrangement: number): string {
  return `${tileset}:${arrangement}`;
}

function firstTileCountReaching(tiles: RankedTileInput[], totalTilePlacements: number, coverage: number): number | null {
  if (totalTilePlacements <= 0) {
    return null;
  }
  let runningPlacements = 0;
  for (let index = 0; index < tiles.length; index += 1) {
    runningPlacements += tiles[index]?.usageCount ?? 0;
    if (runningPlacements / totalTilePlacements >= coverage) {
      return index + 1;
    }
  }
  return null;
}

export function buildTileWorklist(options: BuildTileWorklistOptions): TileWorklistIndex {
  const tileAtlasRelative = options.tileAtlasRelative ?? DEFAULT_TILE_ATLAS_RELATIVE;
  const tileOverridesRelative = options.tileOverridesRelative ?? DEFAULT_TILE_OVERRIDES_RELATIVE;
  const overrideKeys = options.overrideKeys ?? new Set<string>();
  const rankedInputs: RankedTileInput[] = [];
  let totalTilePlacements = 0;
  let totalUsedTiles = 0;
  let overriddenUsedTiles = 0;

  for (const tileset of options.tileAtlas.tilesets) {
    for (const tile of tileset.tiles) {
      const usageCount = tile.usageCount ?? 0;
      if (usageCount <= 0) {
        continue;
      }
      totalTilePlacements += usageCount;
      totalUsedTiles += 1;

      const hasOverride = Boolean(tile.overridden) || overrideKeys.has(tileKey(tileset.tileset, tile.arrangement));
      if (hasOverride) {
        overriddenUsedTiles += 1;
        continue;
      }

      rankedInputs.push({
        tileset: tileset.tileset,
        arrangement: tile.arrangement,
        usageCount,
        solidCells: tile.solidCells,
        isForeground: tile.isForeground,
        paletteId: tile.paletteId,
        atlasImage: tileset.atlasImage,
        gx: tile.gx,
        gy: tile.gy
      });
    }
  }

  rankedInputs.sort((a, b) =>
    b.usageCount - a.usageCount ||
    a.tileset - b.tileset ||
    a.arrangement - b.arrangement
  );

  let runningPlacements = 0;
  const tiles = rankedInputs.map((tile) => {
    runningPlacements += tile.usageCount;
    return {
      ...tile,
      cumulativeCoverage: totalTilePlacements > 0 ? roundCoverage(runningPlacements / totalTilePlacements) : 0
    };
  });
  const worklistPlacements = rankedInputs.reduce((sum, tile) => sum + tile.usageCount, 0);

  return {
    schema: SCHEMA,
    generatedFrom: {
      tileAtlas: tileAtlasRelative,
      tileOverrides: tileOverridesRelative
    },
    summary: {
      totalTilePlacements,
      totalUsedTiles,
      overriddenUsedTiles,
      worklistTiles: tiles.length,
      worklistPlacements,
      worklistCoverage: totalTilePlacements > 0 ? roundCoverage(worklistPlacements / totalTilePlacements) : 0,
      tilesToCover50Pct: firstTileCountReaching(rankedInputs, totalTilePlacements, COVERAGE_MILESTONES[0]),
      tilesToCover80Pct: firstTileCountReaching(rankedInputs, totalTilePlacements, COVERAGE_MILESTONES[1]),
      tilesToCover95Pct: firstTileCountReaching(rankedInputs, totalTilePlacements, COVERAGE_MILESTONES[2])
    },
    tiles
  };
}

async function loadTileOverrideKeys(tileOverridesPath: string): Promise<Set<string>> {
  if (!existsSync(tileOverridesPath)) {
    return new Set();
  }
  const raw = JSON.parse(await readFile(tileOverridesPath, "utf8"));
  const parsed = TileOverridesSchema.parse(raw);
  return new Set(Object.keys(parsed.byTile));
}

export async function generateTileWorklist(options: GenerateTileWorklistOptions = {}): Promise<TileWorklistIndex> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const tileAtlasRelative = options.tileAtlasRelative ?? DEFAULT_TILE_ATLAS_RELATIVE;
  const tileOverridesRelative = options.tileOverridesRelative ?? DEFAULT_TILE_OVERRIDES_RELATIVE;
  const outJsonRelative = options.outJsonRelative ?? DEFAULT_TILE_WORKLIST_RELATIVE;
  const tileAtlasPath = path.join(rootDir, tileAtlasRelative);
  const tileOverridesPath = path.join(rootDir, tileOverridesRelative);
  const outJsonPath = path.join(rootDir, outJsonRelative);

  const [tileAtlas, overrideKeys] = await Promise.all([
    readFile(tileAtlasPath, "utf8").then((source) => JSON.parse(source) as TileAtlasIndex),
    loadTileOverrideKeys(tileOverridesPath)
  ]);
  const worklist = buildTileWorklist({
    tileAtlas,
    overrideKeys,
    tileAtlasRelative,
    tileOverridesRelative
  });

  await mkdir(path.dirname(outJsonPath), { recursive: true });
  await writeFile(outJsonPath, `${JSON.stringify(worklist, null, 2)}\n`, "utf8");
  return worklist;
}

async function main(): Promise<void> {
  const worklist = await generateTileWorklist();
  const summary = worklist.summary;
  console.log(
    `atlas: wrote ${summary.worklistTiles} tile worklist entries covering ${summary.worklistPlacements}/${summary.totalTilePlacements} placements`
  );
  console.log(
    `atlas: high-leverage tiles 50%=${summary.tilesToCover50Pct ?? "unreached"}, 80%=${summary.tilesToCover80Pct ?? "unreached"}, 95%=${summary.tilesToCover95Pct ?? "unreached"}`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
