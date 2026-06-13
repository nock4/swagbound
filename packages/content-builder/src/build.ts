import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ManifestSchema,
  NpcReferenceCollectionSchema,
  SCHEMA_VERSION,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  SpriteSheetCollectionSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  WorldRegionSchema,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type ScriptCommand,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TutorialStatus,
  type ValidationReport,
  type WorldRegion
} from "@eb/schemas";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  SPRITE_COLUMNS,
  SPRITE_FRAMES,
  SPRITE_ROWS,
  renderSpriteSheet,
  renderTransparentForeground,
  renderWorldBackground
} from "./art";
import type { AssetFile, NormalizedSlice, SliceNpc, SliceSource } from "./types";

export const DEFAULT_SLICE_SOURCE = "content/slice-01/slice.json";
export const DEFAULT_GENERATED_OUT = "apps/game/public/generated";
export const COLLISION_CELL_SIZE = 8;

export const GENERATED_FILES = {
  scripts: "scripts.json",
  npcs: "npcs.json",
  spriteGroups: "sprite-groups.json",
  tutorialStatus: "tutorial-status.json",
  validationReport: "validation-report.json",
  world: "world.json",
  sprites: "sprites.json"
} as const;

const SCRIPT_FILE_STEM = "slice";
const SCRIPT_FILE = `ccscript/${SCRIPT_FILE_STEM}.ccs`;
const WORLD_BACKGROUND = "assets/world/background.png";
const WORLD_FOREGROUND = "assets/world/foreground.png";
const FORBIDDEN_SOURCE_TERMS = [
  /\bEarthBound\b/i,
  /\bOnett\b/i,
  /\bNess\b/i,
  /\bPaula\b/i,
  /\bJeff\b/i,
  /\bPoo\b/i,
  /\bGiygas\b/i,
  /\bPokey\b/i,
  /\bCoilSnake\b/i,
  /\.(sfc|smc)\b/i,
  /\/Users\//
];

type RegionCollision = NonNullable<WorldRegion["collision"]>;

export type BuildSliceOptions = {
  sourcePath?: string;
  generatedAt?: string;
};

export type BuildContentSliceOptions = BuildSliceOptions & {
  sourceFile: string;
  out: string;
};

export type SliceBuildArtifacts = {
  source: NormalizedSlice;
  manifest: Manifest;
  scripts: ScriptCollection;
  npcs: NpcReferenceCollection;
  spriteGroups: SpriteGroupCollection;
  tutorialStatus: TutorialStatus;
  validationReport: ValidationReport;
  world: WorldRegion;
  sprites: SpriteSheetCollection;
  jsonFiles: Record<string, unknown>;
  assets: AssetFile[];
};

export async function readSliceSource(file: string): Promise<SliceSource> {
  return JSON.parse(await readFile(file, "utf8")) as SliceSource;
}

export async function buildContentSlice(options: BuildContentSliceOptions): Promise<SliceBuildArtifacts> {
  const root = findWorkspaceRoot(process.cwd());
  const sourceFile = resolveFromRoot(options.sourceFile, root);
  const outAbs = resolveFromRoot(options.out, root);
  const source = await readSliceSource(sourceFile);
  const sourcePath = options.sourcePath ?? toPosix(path.relative(root, path.dirname(sourceFile)));
  const artifacts = buildSliceArtifacts(source, {
    sourcePath,
    generatedAt: options.generatedAt
  });
  await writeGeneratedOutput(outAbs, artifacts);
  return artifacts;
}

export function buildSliceArtifacts(source: SliceSource, options: BuildSliceOptions = {}): SliceBuildArtifacts {
  assertOriginalSourceText(source);
  const slice = normalizeSlice(source);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourcePath = options.sourcePath ?? `content/${slice.id}`;
  const sourceProject = sourceProjectInfo(sourcePath);
  const scriptBuild = buildScripts(slice, sourcePath);
  const world = WorldRegionSchema.parse(buildWorld(slice, sourcePath, scriptBuild.referencesByNpcId));
  const sprites = SpriteSheetCollectionSchema.parse(buildSprites(slice, sourcePath));
  const spriteGroups = SpriteGroupCollectionSchema.parse(buildSpriteGroups(slice, sourcePath));
  const scripts = ScriptCollectionSchema.parse(scriptBuild.scripts);
  const npcs = NpcReferenceCollectionSchema.parse(scriptBuild.npcs);
  const tutorialStatus = TutorialStatusSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: sourcePath,
    sourceTutorialUrl: "original-content-slice",
    steps: [],
    counts: { steps: 0, passed: 0, failed: 0, blocked: 0, unknown: 0 },
    warnings: []
  });
  const generatedFiles = [
    "manifest.json",
    ...Object.values(GENERATED_FILES),
    WORLD_BACKGROUND,
    WORLD_FOREGROUND,
    ...slice.sprites.map((sprite) => spriteFile(sprite.id))
  ];
  const validationReport = ValidationReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    generatedFiles,
    issues: [],
    counts: { warnings: 0, errors: 0 }
  });
  const manifest = ManifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    files: GENERATED_FILES,
    counts: {
      scriptFiles: scripts.counts.files,
      scriptCommands: scripts.counts.commands,
      labels: scripts.counts.labels,
      textCommands: scripts.counts.textCommands,
      unknownCommands: scripts.counts.unknownCommands,
      npcReferences: npcs.counts.references,
      spriteImages: spriteGroups.counts.images,
      worldNpcs: world.counts.npcs,
      spriteSheets: sprites.counts.sheets,
      warnings: 0,
      errors: 0
    },
    warnings: [],
    errors: []
  });
  const assets = buildAssets(slice);
  return {
    source: slice,
    manifest,
    scripts,
    npcs,
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    jsonFiles: {
      "manifest.json": manifest,
      [GENERATED_FILES.scripts]: scripts,
      [GENERATED_FILES.npcs]: npcs,
      [GENERATED_FILES.spriteGroups]: spriteGroups,
      [GENERATED_FILES.tutorialStatus]: tutorialStatus,
      [GENERATED_FILES.validationReport]: validationReport,
      [GENERATED_FILES.world]: world,
      [GENERATED_FILES.sprites]: sprites
    },
    assets
  };
}

function normalizeSlice(source: SliceSource): NormalizedSlice {
  if (!source || typeof source !== "object") {
    throw new Error("Slice source must be a JSON object.");
  }
  if (!Number.isInteger(source.tileSize) || source.tileSize <= 0 || source.tileSize % COLLISION_CELL_SIZE !== 0) {
    throw new Error(`tileSize must be a positive multiple of ${COLLISION_CELL_SIZE}.`);
  }
  if (!Array.isArray(source.grid) || source.grid.length === 0) {
    throw new Error("grid must contain at least one row.");
  }
  const widthTiles = source.grid[0].length;
  if (widthTiles <= 0) {
    throw new Error("grid rows must not be empty.");
  }
  for (const [index, row] of source.grid.entries()) {
    if (row.length !== widthTiles) {
      throw new Error(`grid row ${index} has length ${row.length}; expected ${widthTiles}.`);
    }
  }

  const paletteBySymbol = new Map<string, SliceSource["palette"][number]>();
  for (const entry of source.palette) {
    if (entry.symbol.length !== 1) {
      throw new Error(`Palette symbol "${entry.symbol}" must be exactly one character.`);
    }
    if (paletteBySymbol.has(entry.symbol)) {
      throw new Error(`Duplicate palette symbol "${entry.symbol}".`);
    }
    paletteBySymbol.set(entry.symbol, entry);
  }
  for (let y = 0; y < source.grid.length; y += 1) {
    for (let x = 0; x < widthTiles; x += 1) {
      const symbol = source.grid[y][x];
      if (!paletteBySymbol.has(symbol)) {
        throw new Error(`grid uses unknown tile symbol "${symbol}" at ${x},${y}.`);
      }
    }
  }

  const spritesById = new Map<string, SliceSource["sprites"][number]>();
  const groupIds = new Set<number>();
  for (const sprite of source.sprites) {
    if (spritesById.has(sprite.id)) {
      throw new Error(`Duplicate sprite id "${sprite.id}".`);
    }
    if (!Number.isInteger(sprite.groupId) || sprite.groupId < 0 || groupIds.has(sprite.groupId)) {
      throw new Error(`Invalid or duplicate sprite groupId for "${sprite.id}".`);
    }
    spritesById.set(sprite.id, sprite);
    groupIds.add(sprite.groupId);
  }
  if (!spritesById.has(source.player.sprite)) {
    throw new Error(`Player references missing sprite "${source.player.sprite}".`);
  }
  assertWalkableTile(source, paletteBySymbol, source.player.spawn, "player spawn");

  const npcIds = new Set<number>();
  for (const npc of source.npcs) {
    if (!Number.isInteger(npc.id) || npc.id < 0 || npcIds.has(npc.id)) {
      throw new Error(`Invalid or duplicate NPC id "${npc.id}".`);
    }
    if (!spritesById.has(npc.sprite)) {
      throw new Error(`NPC "${npc.name}" references missing sprite "${npc.sprite}".`);
    }
    if (!Array.isArray(npc.dialogue) || npc.dialogue.length === 0 || npc.dialogue.some((page) => page.trim() === "")) {
      throw new Error(`NPC "${npc.name}" must have at least one non-empty dialogue page.`);
    }
    assertWalkableTile(source, paletteBySymbol, npc.position, `NPC "${npc.name}"`);
    npcIds.add(npc.id);
  }

  return {
    ...source,
    widthTiles,
    heightTiles: source.grid.length,
    paletteBySymbol,
    spritesById
  };
}

function buildWorld(
  slice: NormalizedSlice,
  sourcePath: string,
  referencesByNpcId: Map<number, string>
): WorldRegion {
  const widthPixels = slice.widthTiles * slice.tileSize;
  const heightPixels = slice.heightTiles * slice.tileSize;
  const collision = buildCollision(slice);
  const usedSymbols = new Set(slice.grid.join(""));
  const npcs = slice.npcs.map((npc) => {
    const sprite = requiredSprite(slice, npc.sprite);
    const regionPixel = tileFeet(slice, npc.position);
    return {
      npcId: npc.id,
      spriteGroup: sprite.groupId,
      direction: npc.facing,
      type: "original-npc",
      movement: 0,
      showSprite: "always",
      textPointer: referencesByNpcId.get(npc.id),
      interactable: true,
      visible: true,
      worldPixel: regionPixel,
      regionPixel,
      sheet: spriteFile(sprite.id),
      sourceLocation: { file: "slice.json", line: 1, column: 1 }
    };
  });
  const playerSprite = requiredSprite(slice, slice.player.sprite);
  const playerSpawn = tileFeet(slice, slice.player.spawn);
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: sourcePath,
    available: true,
    tileSize: slice.tileSize,
    region: {
      originTile: { x: 0, y: 0 },
      widthTiles: slice.widthTiles,
      heightTiles: slice.heightTiles,
      widthPixels,
      heightPixels
    },
    images: {
      background: WORLD_BACKGROUND,
      foreground: WORLD_FOREGROUND
    },
    collision,
    npcs,
    player: {
      spriteGroup: playerSprite.groupId,
      sheet: spriteFile(playerSprite.id),
      spawnRegionPixel: playerSpawn,
      spawnWorldPixel: playerSpawn,
      spawnDerivation: "original slice player.spawn tile converted to bottom-center pixel"
    },
    sources: {
      mapTiles: true,
      mapSectors: false,
      tilesetFiles: 0,
      mapSprites: true,
      npcConfig: true,
      spriteGroupsYml: false
    },
    counts: {
      npcs: npcs.length,
      visibleNpcs: npcs.length,
      solidCells: collision.solidRows.reduce((sum, row) => sum + countChars(row, "1"), 0),
      mapTilesetsUsed: 1,
      palettesUsed: usedSymbols.size
    },
    warnings: []
  };
}

function buildCollision(slice: NormalizedSlice): RegionCollision {
  const cellsPerTile = slice.tileSize / COLLISION_CELL_SIZE;
  const width = slice.widthTiles * cellsPerTile;
  const height = slice.heightTiles * cellsPerTile;
  const solidRows: string[] = [];
  const surfaceRows: string[] = [];
  for (let cy = 0; cy < height; cy += 1) {
    let solidRow = "";
    let surfaceRow = "";
    const tileY = Math.floor(cy / cellsPerTile);
    for (let cx = 0; cx < width; cx += 1) {
      const tileX = Math.floor(cx / cellsPerTile);
      const tile = slice.paletteBySymbol.get(slice.grid[tileY][tileX]);
      const solid = tile?.solid === true;
      solidRow += solid ? "1" : "0";
      surfaceRow += (solid ? 0x80 : 0x00).toString(16).padStart(2, "0");
    }
    solidRows.push(solidRow);
    surfaceRows.push(surfaceRow);
  }
  return {
    cellSize: COLLISION_CELL_SIZE,
    width,
    height,
    solidRows,
    surfaceRows
  };
}

function buildScripts(slice: NormalizedSlice, sourcePath: string): {
  scripts: ScriptCollection;
  npcs: NpcReferenceCollection;
  referencesByNpcId: Map<number, string>;
} {
  const commands: ScriptCommand[] = [];
  const labels: string[] = [];
  const references = [];
  const referencesByNpcId = new Map<number, string>();
  let line = 1;

  for (const npc of slice.npcs) {
    const label = labelForNpc(npc);
    const reference = `${SCRIPT_FILE_STEM}.${label}`;
    referencesByNpcId.set(npc.id, reference);
    labels.push(label);
    references.push({
      reference,
      scriptFileStem: SCRIPT_FILE_STEM,
      label,
      sourceLocation: location(line),
      raw: `${npc.name}: ${reference}`,
      contextType: "original-content-slice"
    });
    commands.push({ cmd: "label", raw: `${label}:`, name: label, sourceLocation: location(line) });
    line += 1;
    npc.dialogue.forEach((page, pageIndex) => {
      commands.push({
        cmd: "text",
        raw: JSON.stringify(page),
        value: page,
        segments: [{ kind: "text", value: page }],
        sourceLocation: location(line)
      });
      line += 1;
      if (pageIndex < npc.dialogue.length - 1) {
        commands.push({ cmd: "next", raw: "next", sourceLocation: location(line) });
        line += 1;
      }
    });
    commands.push({ cmd: "end", raw: "end", sourceLocation: location(line) });
    line += 2;
  }

  const file = {
    path: SCRIPT_FILE,
    commands,
    labels,
    counts: {
      commands: commands.length,
      labels: labels.length,
      textCommands: commands.filter((command) => command.cmd === "text").length,
      unknownCommands: 0
    },
    warnings: []
  };
  return {
    scripts: {
      schemaVersion: SCHEMA_VERSION,
      sourceProjectPath: sourcePath,
      files: [file],
      counts: {
        files: 1,
        commands: file.counts.commands,
        labels: file.counts.labels,
        textCommands: file.counts.textCommands,
        unknownCommands: 0
      },
      warnings: []
    },
    npcs: {
      schemaVersion: SCHEMA_VERSION,
      sourceProjectPath: sourcePath,
      references,
      counts: { references: references.length },
      warnings: []
    },
    referencesByNpcId
  };
}

function buildSprites(slice: NormalizedSlice, sourcePath: string): SpriteSheetCollection {
  const sheets = slice.sprites.map((sprite) => ({
    groupId: sprite.groupId,
    file: spriteFile(sprite.id),
    sourcePath: `${sourcePath}#sprites.${sprite.id}`,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    columns: SPRITE_COLUMNS,
    rows: SPRITE_ROWS,
    frames: SPRITE_FRAMES,
    animations: {
      up: [0, 1] as [number, number],
      right: [2, 3] as [number, number],
      down: [4, 5] as [number, number],
      left: [6, 7] as [number, number]
    }
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: sourcePath,
    sheets,
    counts: { sheets: sheets.length },
    warnings: []
  };
}

function buildSpriteGroups(slice: NormalizedSlice, sourcePath: string): SpriteGroupCollection {
  const images = slice.sprites.map((sprite) => ({
    path: spriteFile(sprite.id),
    id: sprite.groupId,
    extension: ".png",
    width: FRAME_WIDTH * SPRITE_COLUMNS,
    height: FRAME_HEIGHT * SPRITE_ROWS
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: sourcePath,
    images,
    counts: { images: images.length },
    warnings: []
  };
}

function buildAssets(slice: NormalizedSlice): AssetFile[] {
  const width = slice.widthTiles * slice.tileSize;
  const height = slice.heightTiles * slice.tileSize;
  return [
    { path: WORLD_BACKGROUND, buffer: renderWorldBackground(slice) },
    { path: WORLD_FOREGROUND, buffer: renderTransparentForeground(width, height) },
    ...slice.sprites.map((sprite) => ({
      path: spriteFile(sprite.id),
      buffer: renderSpriteSheet(sprite)
    }))
  ];
}

async function writeGeneratedOutput(outAbs: string, artifacts: SliceBuildArtifacts): Promise<void> {
  await mkdir(outAbs, { recursive: true });
  await clearGeneratedOutput(outAbs);
  await writeFile(path.join(outAbs, ".gitkeep"), "", "utf8");
  for (const [file, value] of Object.entries(artifacts.jsonFiles)) {
    await writeJson(path.join(outAbs, file), value);
  }
  for (const asset of artifacts.assets) {
    await mkdir(path.dirname(path.join(outAbs, asset.path)), { recursive: true });
    await writeFile(path.join(outAbs, asset.path), asset.buffer);
  }
}

async function clearGeneratedOutput(outAbs: string): Promise<void> {
  const entries = await readdir(outAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".gitkeep") {
      continue;
    }
    await rm(path.join(outAbs, entry.name), { recursive: true, force: true });
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertWalkableTile(
  source: SliceSource,
  paletteBySymbol: Map<string, SliceSource["palette"][number]>,
  position: { x: number; y: number },
  label: string
): void {
  if (
    !Number.isInteger(position.x) ||
    !Number.isInteger(position.y) ||
    position.x < 0 ||
    position.y < 0 ||
    position.y >= source.grid.length ||
    position.x >= source.grid[0].length
  ) {
    throw new Error(`${label} is outside the grid.`);
  }
  const tile = paletteBySymbol.get(source.grid[position.y][position.x]);
  if (tile?.solid) {
    throw new Error(`${label} is placed on solid tile "${tile.symbol}".`);
  }
}

function assertOriginalSourceText(source: SliceSource): void {
  const text = JSON.stringify(source);
  const matched = FORBIDDEN_SOURCE_TERMS.find((pattern) => pattern.test(text));
  if (matched) {
    throw new Error(`Original slice source contains a forbidden external-reference term: ${matched.source}`);
  }
}

function sourceProjectInfo(sourcePath: string): Manifest["sourceProject"] {
  return {
    path: sourcePath,
    exists: true,
    hasProjectSnake: false,
    detectedFolders: ["slice.json"],
    tutorialFixtureHints: {
      hasRobotCcs: false,
      hasHelloWorldLabel: false,
      hasRobotHelloWorldContent: false,
      hasSpriteGroup005: false,
      npcReferencesRobotHelloWorld: false
    }
  };
}

function requiredSprite(slice: NormalizedSlice, id: string): NormalizedSlice["sprites"][number] {
  const sprite = slice.spritesById.get(id);
  if (!sprite) {
    throw new Error(`Missing sprite "${id}".`);
  }
  return sprite;
}

function tileFeet(slice: NormalizedSlice, tile: { x: number; y: number }): { x: number; y: number } {
  return {
    x: tile.x * slice.tileSize + Math.floor(slice.tileSize / 2),
    y: (tile.y + 1) * slice.tileSize
  };
}

function labelForNpc(npc: SliceNpc): string {
  const slug = npc.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const label = /^[a-z_]/.test(slug) ? slug : `npc_${npc.id}`;
  return label || `npc_${npc.id}`;
}

function location(line: number): ScriptCommand["sourceLocation"] {
  return { file: SCRIPT_FILE, line, column: 1 };
}

function spriteFile(id: string): string {
  return `assets/sprites/${id}.png`;
}

function countChars(value: string, char: string): number {
  let count = 0;
  for (const item of value) {
    if (item === char) {
      count += 1;
    }
  }
  return count;
}

function resolveFromRoot(inputPath: string, root = findWorkspaceRoot(process.cwd())): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(root, inputPath);
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
