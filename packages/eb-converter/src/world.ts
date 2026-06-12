import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  SCHEMA_VERSION,
  SpriteSheetCollectionSchema,
  WorldRegionSchema,
  type SpriteSheetCollection,
  type ValidationIssue,
  type WorldNpc,
  type WorldRegion
} from "@eb/schemas";
import { parseFts, drawArrangement, isBlankArrangement, isSolidSurface, type FtsTileset, type FtsPalette } from "./fts";
import {
  parseIntKeyedYaml,
  parseMapSprites,
  parseMapTiles,
  placementToWorldPixel,
  type SpritePlacement
} from "./coilsnakeYaml";
import { encodePngRgba, readPngHeader } from "./png";

export const TILE_SIZE = 32;
export const COLLISION_CELL_SIZE = 8;
export const SECTOR_WIDTH_TILES = 8;
export const SECTOR_HEIGHT_TILES = 4;
export const DEFAULT_MAP_WIDTH_TILES = 256;
export const DEFAULT_MAP_HEIGHT_TILES = 320;
export const REGION_WIDTH_TILES = 48;
export const REGION_HEIGHT_TILES = 44;
export const TUTORIAL_NPC_ID = 744;
export const PLAYER_SPRITE_GROUP = 1;

const WORLD_ASSET_DIR = "assets/world";
const SPRITE_ASSET_DIR = "assets/sprites";

type Issue = ValidationIssue;

function issue(severity: Issue["severity"], code: string, message: string, issuePath?: string): Issue {
  return { severity, code, message, ...(issuePath ? { path: issuePath } : {}) };
}

export type RegionBounds = {
  originTileX: number;
  originTileY: number;
  widthTiles: number;
  heightTiles: number;
};

/** Chooses a sector-aligned region containing the anchor pixel, clamped to the map. */
export function chooseRegion(
  anchorWorldPixel: { x: number; y: number },
  mapWidthTiles = DEFAULT_MAP_WIDTH_TILES,
  mapHeightTiles = DEFAULT_MAP_HEIGHT_TILES,
  widthTiles = REGION_WIDTH_TILES,
  heightTiles = REGION_HEIGHT_TILES
): RegionBounds {
  const clampedWidth = Math.min(widthTiles, mapWidthTiles);
  const clampedHeight = Math.min(heightTiles, mapHeightTiles);
  const anchorTileX = Math.floor(anchorWorldPixel.x / TILE_SIZE);
  const anchorTileY = Math.floor(anchorWorldPixel.y / TILE_SIZE);
  const rawOriginX = Math.round((anchorTileX - clampedWidth / 2) / SECTOR_WIDTH_TILES) * SECTOR_WIDTH_TILES;
  const rawOriginY = Math.round((anchorTileY - clampedHeight / 2) / SECTOR_HEIGHT_TILES) * SECTOR_HEIGHT_TILES;
  return {
    originTileX: Math.max(0, Math.min(rawOriginX, mapWidthTiles - clampedWidth)),
    originTileY: Math.max(0, Math.min(rawOriginY, mapHeightTiles - clampedHeight)),
    widthTiles: clampedWidth,
    heightTiles: clampedHeight
  };
}

export type ComposedRegion = {
  background: Uint8Array;
  foreground: Uint8Array;
  /** Surface-flag byte per 8x8 cell, row-major. */
  surface: Uint8Array;
  /** 1 where the cell belongs to a void/unrendered tile (forced solid). */
  voidSolid: Uint8Array;
  widthPixels: number;
  heightPixels: number;
  collisionWidth: number;
  collisionHeight: number;
  mapTilesetsUsed: Set<number>;
  palettesUsed: Set<string>;
  warnings: Issue[];
};

export type SectorInfo = { tileset: number; palette: number };

/**
 * Composes the region background/foreground RGBA buffers and the surface grid
 * from parsed map rows, per-sector tileset/palette info, and parsed tilesets.
 */
export function composeRegion(options: {
  bounds: RegionBounds;
  mapRows: number[][];
  sectorLookup: (sectorCol: number, sectorRow: number) => SectorInfo | undefined;
  tilesetForMapTileset: (mapTileset: number) => { tileset: FtsTileset; palettes: Map<number, FtsPalette> } | undefined;
}): ComposedRegion {
  const { bounds, mapRows, sectorLookup, tilesetForMapTileset } = options;
  const widthPixels = bounds.widthTiles * TILE_SIZE;
  const heightPixels = bounds.heightTiles * TILE_SIZE;
  const background = new Uint8Array(widthPixels * heightPixels * 4);
  const foreground = new Uint8Array(widthPixels * heightPixels * 4);
  const collisionWidth = bounds.widthTiles * (TILE_SIZE / COLLISION_CELL_SIZE);
  const collisionHeight = bounds.heightTiles * (TILE_SIZE / COLLISION_CELL_SIZE);
  const surface = new Uint8Array(collisionWidth * collisionHeight);
  const voidSolid = new Uint8Array(collisionWidth * collisionHeight).fill(1);
  const blankCache = new Map<string, boolean>();
  const warnings: Issue[] = [];
  const mapTilesetsUsed = new Set<number>();
  const palettesUsed = new Set<string>();
  const missingSectors = new Set<string>();
  const missingTilesets = new Set<number>();

  for (let ty = 0; ty < bounds.heightTiles; ty += 1) {
    const mapY = bounds.originTileY + ty;
    const row = mapRows[mapY];
    for (let tx = 0; tx < bounds.widthTiles; tx += 1) {
      const mapX = bounds.originTileX + tx;
      const arrangementIndex = row?.[mapX];
      if (arrangementIndex === undefined || Number.isNaN(arrangementIndex)) {
        continue;
      }
      const sectorCol = Math.floor(mapX / SECTOR_WIDTH_TILES);
      const sectorRow = Math.floor(mapY / SECTOR_HEIGHT_TILES);
      const sector = sectorLookup(sectorCol, sectorRow);
      if (!sector) {
        missingSectors.add(`${sectorCol},${sectorRow}`);
        continue;
      }
      const graphics = tilesetForMapTileset(sector.tileset);
      if (!graphics) {
        missingTilesets.add(sector.tileset);
        continue;
      }
      const palette = graphics.palettes.get(sector.palette) ?? graphics.palettes.values().next().value as FtsPalette | undefined;
      if (!palette) {
        missingTilesets.add(sector.tileset);
        continue;
      }
      mapTilesetsUsed.add(sector.tileset);
      palettesUsed.add(`${sector.tileset}:${sector.palette}`);

      drawArrangement({
        tileset: graphics.tileset,
        arrangementIndex,
        palette,
        target: background,
        targetWidth: widthPixels,
        targetX: tx * TILE_SIZE,
        targetY: ty * TILE_SIZE,
        priorityOnly: false
      });
      drawArrangement({
        tileset: graphics.tileset,
        arrangementIndex,
        palette,
        target: foreground,
        targetWidth: widthPixels,
        targetX: tx * TILE_SIZE,
        targetY: ty * TILE_SIZE,
        priorityOnly: true
      });

      const blankKey = `${sector.tileset}:${arrangementIndex}`;
      let blank = blankCache.get(blankKey);
      if (blank === undefined) {
        blank = isBlankArrangement(graphics.tileset, arrangementIndex);
        blankCache.set(blankKey, blank);
      }

      const cellBase = arrangementIndex * 16;
      for (let cellY = 0; cellY < 4; cellY += 1) {
        for (let cellX = 0; cellX < 4; cellX += 1) {
          const surfaceByte = graphics.tileset.collisions[cellBase + cellY * 4 + cellX];
          const gx = tx * 4 + cellX;
          const gy = ty * 4 + cellY;
          surface[gy * collisionWidth + gx] = surfaceByte;
          voidSolid[gy * collisionWidth + gx] = blank ? 1 : 0;
        }
      }
    }
  }

  if (missingSectors.size > 0) {
    warnings.push(issue("warning", "world_missing_sectors", `Missing sector metadata for ${missingSectors.size} sector(s).`, "map_sectors.yml"));
  }
  if (missingTilesets.size > 0) {
    warnings.push(issue(
      "warning",
      "world_missing_tilesets",
      `No tileset graphics/palette found for map tileset id(s): ${[...missingTilesets].sort((a, b) => a - b).join(", ")}.`,
      "Tilesets"
    ));
  }

  return {
    background,
    foreground,
    surface,
    voidSolid,
    widthPixels,
    heightPixels,
    collisionWidth,
    collisionHeight,
    mapTilesetsUsed,
    palettesUsed,
    warnings
  };
}

/**
 * Encodes the surface grid into raw hex rows plus a 0/1 gameplay solidity map.
 * Gameplay solidity = imported solid flag (0x80) OR void/unrendered tile.
 * surfaceRows always carry the unmodified imported bytes.
 */
export function encodeCollisionRows(
  surface: Uint8Array,
  width: number,
  height: number,
  voidSolid?: Uint8Array
): {
  solidRows: string[];
  surfaceRows: string[];
  solidCells: number;
} {
  const solidRows: string[] = [];
  const surfaceRows: string[] = [];
  let solidCells = 0;
  for (let y = 0; y < height; y += 1) {
    let solidRow = "";
    let surfaceRow = "";
    for (let x = 0; x < width; x += 1) {
      const byte = surface[y * width + x];
      surfaceRow += byte.toString(16).padStart(2, "0");
      const solid = isSolidSurface(byte) || voidSolid?.[y * width + x] === 1;
      solidRow += solid ? "1" : "0";
      if (solid) {
        solidCells += 1;
      }
    }
    solidRows.push(solidRow);
    surfaceRows.push(surfaceRow);
  }
  return { solidRows, surfaceRows, solidCells };
}

/**
 * Finds a walkable spawn point near the anchor by scanning deterministic
 * offsets (west, then east, then south, then north, widening per ring) and
 * requiring a clear 16x12 pixel foot box.
 */
export function findSpawn(
  solidAt: (cellX: number, cellY: number) => boolean,
  collisionWidth: number,
  collisionHeight: number,
  anchorRegionPixel: { x: number; y: number }
): { x: number; y: number } | undefined {
  const clear = (px: number, py: number): boolean => {
    for (const [dx, dy] of [[-8, -11], [7, -11], [-8, -1], [7, -1], [0, -6]] as const) {
      const cx = Math.floor((px + dx) / COLLISION_CELL_SIZE);
      const cy = Math.floor((py + dy) / COLLISION_CELL_SIZE);
      if (cx < 0 || cy < 0 || cx >= collisionWidth || cy >= collisionHeight || solidAt(cx, cy)) {
        return false;
      }
    }
    return true;
  };

  for (let ring = 2; ring <= 8; ring += 1) {
    const distance = ring * TILE_SIZE;
    const candidates: Array<{ x: number; y: number }> = [
      { x: anchorRegionPixel.x - distance, y: anchorRegionPixel.y },
      { x: anchorRegionPixel.x + distance, y: anchorRegionPixel.y },
      { x: anchorRegionPixel.x, y: anchorRegionPixel.y + distance },
      { x: anchorRegionPixel.x, y: anchorRegionPixel.y - distance },
      { x: anchorRegionPixel.x - distance, y: anchorRegionPixel.y + distance },
      { x: anchorRegionPixel.x + distance, y: anchorRegionPixel.y + distance }
    ];
    for (const candidate of candidates) {
      if (clear(candidate.x, candidate.y)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Walk-frame pairs per cardinal facing for a CoilSnake sprite-group sheet.
 * CoilSnake decompiles sprite groups in pair order N, E, S, W, NE, SE, SW, NW
 * (CoilSnake sprites.py SPRITE_COMPILATION_ORDER inverted), so frames 0-7 are
 * up, up, right, right, down, down, left, left. Sheets with fewer than 8
 * frames cannot encode per-direction walks; every facing then reuses the
 * first frame pair (or a single frame).
 */
export function spriteGroupAnimations(frameCount: number): Record<"up" | "right" | "down" | "left", [number, number]> {
  if (frameCount >= 8) {
    return { up: [0, 1], right: [2, 3], down: [4, 5], left: [6, 7] };
  }
  const second = frameCount >= 2 ? 1 : 0;
  return { up: [0, second], right: [0, second], down: [0, second], left: [0, second] };
}

/** True when a text pointer looks like a resolvable ccscript "file.label" reference. */
export function isCcsReference(pointer: string | undefined): pointer is string {
  return Boolean(pointer && /^[A-Za-z_][\w-]*\.[A-Za-z_][\w-]*$/.test(pointer));
}

export type WorldBuildResult = {
  world: WorldRegion;
  sprites: SpriteSheetCollection;
  warnings: Issue[];
};

function emptyWorld(displayPath: string, reasons: Issue[]): WorldRegion {
  return WorldRegionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: displayPath,
    available: false,
    tileSize: TILE_SIZE,
    npcs: [],
    sources: {
      mapTiles: false,
      mapSectors: false,
      tilesetFiles: 0,
      mapSprites: false,
      npcConfig: false,
      spriteGroupsYml: false
    },
    counts: { npcs: 0, visibleNpcs: 0, solidCells: 0, mapTilesetsUsed: 0, palettesUsed: 0 },
    warnings: reasons
  });
}

function emptySprites(displayPath: string): SpriteSheetCollection {
  return SpriteSheetCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: displayPath,
    sheets: [],
    counts: { sheets: 0 },
    warnings: []
  });
}

/**
 * Builds world.json, sprites.json, and the local-only rendered/copied PNG
 * assets under the (gitignored) generated output directory.
 */
export async function buildWorldArtifacts(options: {
  projectAbs: string;
  outAbs: string;
  displayPath: string;
  projectExists: boolean;
}): Promise<WorldBuildResult> {
  const { projectAbs, outAbs, displayPath, projectExists } = options;
  const warnings: Issue[] = [];

  if (!projectExists) {
    return {
      world: emptyWorld(displayPath, [issue("warning", "world_missing_project", "CoilSnake project path is missing; world rendering skipped.", displayPath)]),
      sprites: emptySprites(displayPath),
      warnings
    };
  }

  const readOptional = async (relative: string): Promise<string | undefined> => {
    const file = path.join(projectAbs, relative);
    if (!existsSync(file)) {
      return undefined;
    }
    return readFile(file, "utf8");
  };

  const [mapTilesSource, mapSectorsSource, mapSpritesSource, npcConfigSource, spriteGroupsSource] = await Promise.all([
    readOptional("map_tiles.map"),
    readOptional("map_sectors.yml"),
    readOptional("map_sprites.yml"),
    readOptional("npc_config_table.yml"),
    readOptional("sprite_groups.yml")
  ]);

  const sources = {
    mapTiles: Boolean(mapTilesSource),
    mapSectors: Boolean(mapSectorsSource),
    tilesetFiles: 0,
    mapSprites: Boolean(mapSpritesSource),
    npcConfig: Boolean(npcConfigSource),
    spriteGroupsYml: Boolean(spriteGroupsSource)
  };

  const missing: Issue[] = [];
  if (!mapTilesSource) {
    missing.push(issue("warning", "world_missing_map_tiles", "map_tiles.map is missing; world rendering skipped.", "map_tiles.map"));
  }
  if (!mapSectorsSource) {
    missing.push(issue("warning", "world_missing_map_sectors", "map_sectors.yml is missing; world rendering skipped.", "map_sectors.yml"));
  }
  if (!mapSpritesSource) {
    missing.push(issue("warning", "world_missing_map_sprites", "map_sprites.yml is missing; world rendering skipped.", "map_sprites.yml"));
  }
  if (missing.length > 0) {
    const world = emptyWorld(displayPath, missing);
    return { world, sprites: emptySprites(displayPath), warnings };
  }

  const placements = parseMapSprites(mapSpritesSource as string);
  const tutorialPlacements = placements.filter((placement) => placement.npcId === TUTORIAL_NPC_ID);
  if (tutorialPlacements.length === 0) {
    const world = emptyWorld(displayPath, [
      issue("warning", "world_missing_npc_744", `No map_sprites.yml placement found for NPC ${TUTORIAL_NPC_ID}; world rendering skipped.`, "map_sprites.yml")
    ]);
    return { world, sprites: emptySprites(displayPath), warnings };
  }
  if (tutorialPlacements.length > 1) {
    warnings.push(issue("warning", "world_multiple_npc_744", `Found ${tutorialPlacements.length} placements for NPC ${TUTORIAL_NPC_ID}; using the first.`, "map_sprites.yml"));
  }
  const anchorPlacement = tutorialPlacements[0];
  const anchorWorld = placementToWorldPixel(anchorPlacement);

  const mapRows = parseMapTiles(mapTilesSource as string);
  const mapHeightTiles = mapRows.length || DEFAULT_MAP_HEIGHT_TILES;
  const mapWidthTiles = mapRows[0]?.length || DEFAULT_MAP_WIDTH_TILES;
  const sectorsPerRow = Math.max(1, Math.floor(mapWidthTiles / SECTOR_WIDTH_TILES));
  const sectorEntries = parseIntKeyedYaml(mapSectorsSource as string);

  // Parse every available tileset file and index palettes by map tileset id.
  const tilesetDir = path.join(projectAbs, "Tilesets");
  const tilesetByMapTileset = new Map<number, { tileset: FtsTileset; palettes: Map<number, FtsPalette> }>();
  if (existsSync(tilesetDir)) {
    const ftsFiles = (await readdir(tilesetDir)).filter((file) => file.toLowerCase().endsWith(".fts")).sort();
    for (const file of ftsFiles) {
      try {
        const parsed = parseFts(await readFile(path.join(tilesetDir, file), "utf8"));
        sources.tilesetFiles += 1;
        for (const palette of parsed.palettes) {
          const existing = tilesetByMapTileset.get(palette.mapTileset);
          if (existing) {
            existing.palettes.set(palette.mapPalette, palette);
          } else {
            tilesetByMapTileset.set(palette.mapTileset, {
              tileset: parsed,
              palettes: new Map([[palette.mapPalette, palette]])
            });
          }
        }
      } catch (error) {
        warnings.push(issue("warning", "world_tileset_parse_failed", `Failed to parse Tilesets/${file}: ${error instanceof Error ? error.message : String(error)}`, `Tilesets/${file}`));
      }
    }
  } else {
    const world = emptyWorld(displayPath, [issue("warning", "world_missing_tilesets_dir", "Tilesets directory is missing; world rendering skipped.", "Tilesets")]);
    return { world, sprites: emptySprites(displayPath), warnings };
  }

  const bounds = chooseRegion(anchorWorld, mapWidthTiles, mapHeightTiles);
  const composed = composeRegion({
    bounds,
    mapRows,
    sectorLookup: (sectorCol, sectorRow) => {
      const entry = sectorEntries.get(sectorRow * sectorsPerRow + sectorCol);
      if (!entry) {
        return undefined;
      }
      const tileset = Number.parseInt(entry.Tileset ?? "", 10);
      const palette = Number.parseInt(entry.Palette ?? "", 10);
      if (Number.isNaN(tileset) || Number.isNaN(palette)) {
        return undefined;
      }
      return { tileset, palette };
    },
    tilesetForMapTileset: (mapTileset) => tilesetByMapTileset.get(mapTileset)
  });
  warnings.push(...composed.warnings);

  const regionPixelOrigin = { x: bounds.originTileX * TILE_SIZE, y: bounds.originTileY * TILE_SIZE };
  const npcConfig = npcConfigSource ? parseIntKeyedYaml(npcConfigSource) : new Map<number, Record<string, string>>();
  const spriteGroupsMeta = spriteGroupsSource ? parseIntKeyedYaml(spriteGroupsSource) : new Map<number, Record<string, string>>();

  // NPCs placed inside the rendered region.
  const npcs: WorldNpc[] = [];
  for (const placement of placements) {
    const world = placementToWorldPixel(placement);
    const regionX = world.x - regionPixelOrigin.x;
    const regionY = world.y - regionPixelOrigin.y;
    if (regionX < 0 || regionY < 0 || regionX >= composed.widthPixels || regionY >= composed.heightPixels) {
      continue;
    }
    const config = npcConfig.get(placement.npcId);
    const spriteGroup = config ? Number.parseInt(config.Sprite ?? "", 10) : Number.NaN;
    const textPointer = config?.["Text Pointer 1"];
    const textPointer2 = config?.["Text Pointer 2"];
    const showSprite = config?.["Show Sprite"];
    const isTutorialNpc = placement.npcId === TUTORIAL_NPC_ID;
    npcs.push({
      npcId: placement.npcId,
      ...(Number.isNaN(spriteGroup) ? {} : { spriteGroup }),
      ...(config?.Direction ? { direction: config.Direction } : {}),
      ...(config?.Type ? { type: config.Type } : {}),
      ...(config?.Movement ? { movement: config.Movement } : {}),
      ...(showSprite ? { showSprite } : {}),
      ...(textPointer ? { textPointer } : {}),
      ...(textPointer2 ? { textPointer2 } : {}),
      interactable: isCcsReference(textPointer),
      visible: isTutorialNpc || showSprite === "always",
      worldPixel: world,
      regionPixel: { x: regionX, y: regionY },
      sourceLocation: { file: "map_sprites.yml", line: placement.line, column: 1 }
    });
  }
  npcs.sort((a, b) => a.npcId - b.npcId || a.worldPixel.y - b.worldPixel.y);

  const tutorialNpc = npcs.find((npc) => npc.npcId === TUTORIAL_NPC_ID);
  if (!tutorialNpc) {
    warnings.push(issue("warning", "world_npc_744_outside_region", `NPC ${TUTORIAL_NPC_ID} placement fell outside the rendered region.`, "map_sprites.yml"));
  }

  // Player spawn near the tutorial NPC on walkable ground.
  const { solidRows, surfaceRows, solidCells } = encodeCollisionRows(
    composed.surface,
    composed.collisionWidth,
    composed.collisionHeight,
    composed.voidSolid
  );
  const solidAt = (cellX: number, cellY: number): boolean => solidRows[cellY]?.[cellX] === "1";
  const anchorRegion = tutorialNpc?.regionPixel ?? { x: Math.floor(composed.widthPixels / 2), y: Math.floor(composed.heightPixels / 2) };
  const spawn = findSpawn(solidAt, composed.collisionWidth, composed.collisionHeight, anchorRegion)
    ?? { x: anchorRegion.x - 2 * TILE_SIZE, y: anchorRegion.y };

  // Copy sprite sheets for the player group plus every visible region NPC group.
  const neededGroups = new Set<number>([PLAYER_SPRITE_GROUP]);
  for (const npc of npcs) {
    if (npc.visible && npc.spriteGroup !== undefined) {
      neededGroups.add(npc.spriteGroup);
    }
  }
  const sheets: SpriteSheetCollection["sheets"] = [];
  const spriteWarnings: Issue[] = [];
  const spriteOutDir = path.join(outAbs, SPRITE_ASSET_DIR);
  await mkdir(spriteOutDir, { recursive: true });
  for (const groupId of [...neededGroups].sort((a, b) => a - b)) {
    const padded = String(groupId).padStart(3, "0");
    const sourceRelative = `SpriteGroups/${padded}.png`;
    const sourceFile = path.join(projectAbs, sourceRelative);
    if (!existsSync(sourceFile)) {
      spriteWarnings.push(issue("warning", "world_missing_sprite_png", `Sprite sheet ${sourceRelative} is missing; affected sprites use a placeholder.`, sourceRelative));
      continue;
    }
    const header = readPngHeader(await readFile(sourceFile));
    const meta = spriteGroupsMeta.get(groupId);
    const sizeMatch = /^(\d+)x(\d+)$/.exec(meta?.Size ?? "");
    const frameWidth = sizeMatch ? Number.parseInt(sizeMatch[1], 10) : 16;
    const frameHeight = sizeMatch ? Number.parseInt(sizeMatch[2], 10) : 24;
    const frames = Number.parseInt(meta?.Length ?? "16", 10) || 16;
    const columns = header ? Math.max(1, Math.floor(header.width / frameWidth)) : 4;
    const rows = Math.max(1, Math.ceil(frames / columns));
    const targetRelative = `${SPRITE_ASSET_DIR}/${padded}.png`;
    await copyFile(sourceFile, path.join(outAbs, targetRelative));
    sheets.push({
      groupId,
      file: targetRelative,
      sourcePath: sourceRelative,
      frameWidth,
      frameHeight,
      columns,
      rows,
      frames,
      animations: spriteGroupAnimations(frames)
    });
  }

  const sheetByGroup = new Map(sheets.map((sheet) => [sheet.groupId, sheet.file]));
  for (const npc of npcs) {
    if (npc.spriteGroup !== undefined && sheetByGroup.has(npc.spriteGroup)) {
      npc.sheet = sheetByGroup.get(npc.spriteGroup);
    }
  }

  // Write the rendered (local-only, gitignored) region images.
  const worldOutDir = path.join(outAbs, WORLD_ASSET_DIR);
  await mkdir(worldOutDir, { recursive: true });
  const backgroundRelative = `${WORLD_ASSET_DIR}/background.png`;
  const foregroundRelative = `${WORLD_ASSET_DIR}/foreground.png`;
  await writeFile(path.join(outAbs, backgroundRelative), encodePngRgba(composed.widthPixels, composed.heightPixels, composed.background));
  await writeFile(path.join(outAbs, foregroundRelative), encodePngRgba(composed.widthPixels, composed.heightPixels, composed.foreground));

  const world = WorldRegionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: displayPath,
    available: true,
    tileSize: TILE_SIZE,
    region: {
      originTile: { x: bounds.originTileX, y: bounds.originTileY },
      widthTiles: bounds.widthTiles,
      heightTiles: bounds.heightTiles,
      widthPixels: composed.widthPixels,
      heightPixels: composed.heightPixels
    },
    images: { background: backgroundRelative, foreground: foregroundRelative },
    collision: {
      cellSize: COLLISION_CELL_SIZE,
      width: composed.collisionWidth,
      height: composed.collisionHeight,
      solidRows,
      surfaceRows
    },
    npcs,
    player: {
      spriteGroup: PLAYER_SPRITE_GROUP,
      ...(sheetByGroup.has(PLAYER_SPRITE_GROUP) ? { sheet: sheetByGroup.get(PLAYER_SPRITE_GROUP) } : {}),
      spawnRegionPixel: spawn,
      spawnWorldPixel: { x: spawn.x + regionPixelOrigin.x, y: spawn.y + regionPixelOrigin.y },
      spawnDerivation:
        "Derived, not fixture data: nearest walkable point near the tutorial NPC placement (deterministic ring search). CoilSnake projects do not define a player start for this slice."
    },
    sources,
    counts: {
      npcs: npcs.length,
      visibleNpcs: npcs.filter((npc) => npc.visible).length,
      solidCells,
      mapTilesetsUsed: composed.mapTilesetsUsed.size,
      palettesUsed: composed.palettesUsed.size
    },
    warnings: [...warnings, ...spriteWarnings]
  });

  const sprites = SpriteSheetCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: displayPath,
    sheets,
    counts: { sheets: sheets.length },
    warnings: spriteWarnings
  });

  return { world, sprites, warnings };
}
