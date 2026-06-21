import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { parseIntKeyedYaml } from "../../packages/eb-converter/src/coilsnakeYaml";
import { encodePngRgba, readPngHeader } from "../../packages/eb-converter/src/png";
import { spriteGroupAnimations } from "../../packages/eb-converter/src/world";

const SCHEMA = "swagbound.atlas.sprites.v1";
const DEFAULT_GENERATED_RELATIVE = "apps/game/public/generated";
const DEFAULT_PROJECT_RELATIVE = "external/coilsnake-full";
const DEFAULT_SPRITE_OVERRIDES_RELATIVE = "content/sprite-overrides.json";
const DEFAULT_CUSTOM_DIALOGUE_RELATIVE = "content/custom-dialogue.json";
const DEFAULT_ATLAS_IMAGE_DIR_RELATIVE = "apps/game/public/atlas/sprites";
const DEFAULT_ATLAS_JSON_RELATIVE = "content/atlas/sprites.json";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type Direction = "up" | "right" | "down" | "left";
type SpriteAnimations = Record<Direction, [number, number]>;
type RoleGuess = "shopkeeper" | "clerk" | "save" | "enemy" | "named" | "ambient" | "unknown";
type OverrideKind = "group" | "npc" | "none";

export type SpriteAtlasGroup = {
  groupId: number;
  image: string;
  portraitImage: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  animations: SpriteAnimations;
  usedByNpcCount: number;
  sampleNpcIds: number[];
  sampleLocations: Array<{ x: number; y: number }>;
  sampleEnemyIds: number[];
  overridden: boolean;
  overrideKind: OverrideKind;
  roleGuess: RoleGuess;
};

export type SpriteAtlasEnemy = {
  enemyId: number;
  name?: string;
  battleSprite?: string;
  overworldSpriteGroup?: number;
  overridden: boolean;
};

export type SpriteAtlasIndex = {
  schema: typeof SCHEMA;
  groups: SpriteAtlasGroup[];
  enemies: SpriteAtlasEnemy[];
  counts: {
    groups: number;
    usedGroups: number;
    overriddenGroups: number;
    unskinnedGroups: number;
  };
};

export type ExtractSpriteAtlasOptions = {
  rootDir?: string;
  generatedRelative?: string;
  projectRelative?: string;
  spriteOverridesRelative?: string;
  customDialogueRelative?: string;
  atlasImageDirRelative?: string;
  atlasJsonRelative?: string;
};

type SpriteSheet = {
  groupId: number;
  file: string;
  sourcePath?: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frames: number;
  animations?: Partial<Record<Direction, number[]>>;
};

type NormalizedNpc = {
  npcId: number;
  spriteGroup: number;
  worldPixel?: { x: number; y: number };
  textPointer?: string;
  textPointer2?: string;
  interaction?: NpcInteraction;
};

type NpcInteraction = {
  pages?: string[];
  ref?: string;
  shop?: number;
  heal?: boolean | "full";
  save?: boolean;
  give?: unknown;
};

type BattleEnemy = {
  id: number;
  name?: string;
  spriteId?: number;
  overworldSprite?: number;
};

type SpriteOverrides = {
  byNpcId?: Record<string, unknown>;
  bySpriteGroup?: Record<string, unknown>;
  byEnemyId?: Record<string, { image?: string } | unknown>;
};

type EnemyOverrides = {
  byEnemyId?: Record<string, { name?: string } | undefined>;
};

type CustomDialogue = {
  byNpcId?: Record<string, NpcInteraction | undefined>;
  byTextPointer?: Record<string, NpcInteraction | undefined>;
};

type SpriteAtlasInputs = {
  sheets: SpriteSheet[];
  worldNpcs: NormalizedNpc[];
  addedNpcs: NormalizedNpc[];
  battleEnemies: BattleEnemy[];
  battleSpriteDir: string | undefined;
  spriteOverrides: SpriteOverrides;
  enemyOverrides: EnemyOverrides;
  customDialogue: CustomDialogue;
  sourceSheets: Map<number, SpriteSheet>;
};

type PngRgba = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

function resolvePath(rootDir: string, pathLike: string): string {
  return path.isAbsolute(pathLike) ? pathLike : path.join(rootDir, pathLike);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readFrameSize(value: string | undefined): { frameWidth: number; frameHeight: number } | undefined {
  const [, rawWidth, rawHeight] = /^(\d+)x(\d+)$/.exec(value ?? "") ?? [];
  if (!rawWidth || !rawHeight) {
    return undefined;
  }
  return {
    frameWidth: Number.parseInt(rawWidth, 10),
    frameHeight: Number.parseInt(rawHeight, 10)
  };
}

function normalizeAnimations(animations: SpriteSheet["animations"] | undefined, frames: number): SpriteAnimations {
  const fallback = spriteGroupAnimations(frames);
  return {
    up: normalizeFramePair(animations?.up, fallback.up),
    right: normalizeFramePair(animations?.right, fallback.right),
    down: normalizeFramePair(animations?.down, fallback.down),
    left: normalizeFramePair(animations?.left, fallback.left)
  };
}

function normalizeFramePair(frames: number[] | undefined, fallback: [number, number]): [number, number] {
  if (!frames || frames.length === 0) {
    return fallback;
  }
  const first = isFiniteInteger(frames[0]) ? frames[0] : fallback[0];
  const second = isFiniteInteger(frames[1]) ? frames[1] : first;
  return [first, second];
}

function normalizeWorldNpcs(raw: unknown): NormalizedNpc[] {
  const records = Array.isArray((raw as { npcs?: unknown }).npcs) ? (raw as { npcs: unknown[] }).npcs : [];
  return records.flatMap((record) => {
    const npc = record as {
      npcId?: unknown;
      spriteGroup?: unknown;
      worldPixel?: unknown;
      textPointer?: unknown;
      textPointer2?: unknown;
    };
    if (!isFiniteInteger(npc.npcId) || !isFiniteInteger(npc.spriteGroup)) {
      return [];
    }
    return [{
      npcId: npc.npcId,
      spriteGroup: npc.spriteGroup,
      worldPixel: normalizePoint(npc.worldPixel),
      ...(typeof npc.textPointer === "string" ? { textPointer: npc.textPointer } : {}),
      ...(typeof npc.textPointer2 === "string" ? { textPointer2: npc.textPointer2 } : {})
    }];
  });
}

function normalizeAddedNpcs(raw: unknown): NormalizedNpc[] {
  const records = Array.isArray((raw as { npcs?: unknown }).npcs) ? (raw as { npcs: unknown[] }).npcs : [];
  return records.flatMap((record) => {
    const npc = record as {
      id?: unknown;
      spriteGroup?: unknown;
      worldPixel?: unknown;
      interaction?: unknown;
    };
    if (!isFiniteInteger(npc.id) || !isFiniteInteger(npc.spriteGroup)) {
      return [];
    }
    return [{
      npcId: npc.id,
      spriteGroup: npc.spriteGroup,
      worldPixel: normalizePoint(npc.worldPixel),
      interaction: normalizeInteraction(npc.interaction)
    }];
  });
}

function normalizePoint(value: unknown): { x: number; y: number } | undefined {
  const point = value as { x?: unknown; y?: unknown };
  return typeof point?.x === "number" && typeof point.y === "number"
    ? { x: point.x, y: point.y }
    : undefined;
}

function normalizeInteraction(value: unknown): NpcInteraction | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as NpcInteraction;
  return {
    ...(Array.isArray(raw.pages) ? { pages: raw.pages.filter((page): page is string => typeof page === "string") } : {}),
    ...(typeof raw.ref === "string" ? { ref: raw.ref } : {}),
    ...(isFiniteInteger(raw.shop) ? { shop: raw.shop } : {}),
    ...(raw.heal === true || raw.heal === "full" ? { heal: raw.heal } : {}),
    ...(raw.save === true ? { save: true } : {}),
    ...(raw.give !== undefined ? { give: raw.give } : {})
  };
}

async function loadSourceSheets(projectAbs: string, groupIds: Set<number>): Promise<Map<number, SpriteSheet>> {
  const sourceSheets = new Map<number, SpriteSheet>();
  const spriteGroupMetaPath = path.join(projectAbs, "sprite_groups.yml");
  const spriteGroupsDir = path.join(projectAbs, "SpriteGroups");
  if (!existsSync(spriteGroupsDir) || !existsSync(spriteGroupMetaPath)) {
    return sourceSheets;
  }

  const spriteGroupsMeta = parseIntKeyedYaml(await readFile(spriteGroupMetaPath, "utf8"));
  for (const groupId of [...groupIds].sort((a, b) => a - b)) {
    const padded = pad3(groupId);
    const sourcePath = `SpriteGroups/${padded}.png`;
    const sourceFile = path.join(projectAbs, sourcePath);
    if (!existsSync(sourceFile)) {
      continue;
    }
    const header = readPngHeader(await readFile(sourceFile));
    const meta = spriteGroupsMeta.get(groupId);
    const frameSize = readFrameSize(meta?.Size) ?? { frameWidth: 16, frameHeight: 24 };
    const frames = parsePositiveInteger(meta?.Length) ?? 16;
    const columns = header ? Math.max(1, Math.floor(header.width / frameSize.frameWidth)) : 4;
    const rows = Math.max(1, Math.ceil(frames / columns));
    sourceSheets.set(groupId, {
      groupId,
      file: sourcePath,
      sourcePath,
      ...frameSize,
      columns,
      rows,
      frames,
      animations: spriteGroupAnimations(frames)
    });
  }
  return sourceSheets;
}

export async function loadSpriteAtlasInputs(options: ExtractSpriteAtlasOptions = {}): Promise<SpriteAtlasInputs> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const generatedRelative = options.generatedRelative ?? DEFAULT_GENERATED_RELATIVE;
  const projectRelative = options.projectRelative ?? DEFAULT_PROJECT_RELATIVE;
  const generatedAbs = resolvePath(rootDir, generatedRelative);
  const projectAbs = resolvePath(rootDir, projectRelative);

  const [
    sprites,
    world,
    addedNpcs,
    battle,
    spriteOverrides,
    customDialogue
  ] = await Promise.all([
    readJson<{ sheets?: SpriteSheet[] }>(path.join(generatedAbs, "sprites.json")),
    readJson<unknown>(path.join(generatedAbs, "world.json")),
    readJson<unknown>(path.join(generatedAbs, "added-npcs.json")),
    readJson<{ enemies?: BattleEnemy[]; assetLayout?: { spriteDir?: string } }>(path.join(generatedAbs, "battle.json")),
    readJson<SpriteOverrides>(resolvePath(rootDir, options.spriteOverridesRelative ?? DEFAULT_SPRITE_OVERRIDES_RELATIVE)),
    readJson<CustomDialogue>(resolvePath(rootDir, options.customDialogueRelative ?? DEFAULT_CUSTOM_DIALOGUE_RELATIVE))
  ]);

  const enemyOverridesPath = existsSync(resolvePath(rootDir, "content/enemy-overrides.json"))
    ? resolvePath(rootDir, "content/enemy-overrides.json")
    : path.join(generatedAbs, "enemy-overrides.json");
  const enemyOverrides = await readJson<EnemyOverrides>(enemyOverridesPath);
  const worldNpcs = normalizeWorldNpcs(world);
  const normalizedAddedNpcs = normalizeAddedNpcs(addedNpcs);
  const battleEnemies = Array.isArray(battle.enemies) ? battle.enemies : [];
  const usedGroupIds = new Set<number>([
    ...(sprites.sheets ?? []).map((sheet) => sheet.groupId),
    ...worldNpcs.map((npc) => npc.spriteGroup),
    ...normalizedAddedNpcs.map((npc) => npc.spriteGroup),
    ...battleEnemies.flatMap((enemy) => isFiniteInteger(enemy.overworldSprite) ? [enemy.overworldSprite] : [])
  ]);

  return {
    sheets: [...(sprites.sheets ?? [])].sort((a, b) => a.groupId - b.groupId),
    worldNpcs,
    addedNpcs: normalizedAddedNpcs,
    battleEnemies,
    battleSpriteDir: battle.assetLayout?.spriteDir,
    spriteOverrides,
    enemyOverrides,
    customDialogue,
    sourceSheets: await loadSourceSheets(projectAbs, usedGroupIds)
  };
}

function interactionForNpc(npc: NormalizedNpc, customDialogue: CustomDialogue): NpcInteraction | undefined {
  return npc.interaction
    ?? customDialogue.byNpcId?.[String(npc.npcId)]
    ?? (npc.textPointer ? customDialogue.byTextPointer?.[npc.textPointer] : undefined)
    ?? (npc.textPointer2 ? customDialogue.byTextPointer?.[npc.textPointer2] : undefined);
}

function interactionText(interaction: NpcInteraction | undefined): string {
  if (!interaction) {
    return "";
  }
  return [
    ...(interaction.pages ?? []),
    interaction.ref ?? ""
  ].join(" ").toLowerCase();
}

function roleGuessForGroup(options: {
  npcs: NormalizedNpc[];
  enemyIds: number[];
  spriteOverrides: SpriteOverrides;
  customDialogue: CustomDialogue;
}): RoleGuess {
  const interactions = options.npcs.map((npc) => interactionForNpc(npc, options.customDialogue));
  if (interactions.some((interaction) => interaction?.shop !== undefined)) {
    return "shopkeeper";
  }
  if (interactions.some((interaction) => interaction?.save === true || interaction?.heal === true || interaction?.heal === "full")) {
    return "save";
  }
  if (options.enemyIds.length > 0) {
    return "enemy";
  }
  if (interactions.some((interaction) => /\b(clerk|cashier|counter|kiosk|drug store|shop)\b/.test(interactionText(interaction)))) {
    return "clerk";
  }
  if (options.npcs.some((npc) => options.spriteOverrides.byNpcId?.[String(npc.npcId)] || interactionForNpc(npc, options.customDialogue)?.ref || interactionForNpc(npc, options.customDialogue)?.give)) {
    return "named";
  }
  return options.npcs.length > 0 ? "ambient" : "unknown";
}

export function buildSpriteAtlasIndex(inputs: SpriteAtlasInputs): SpriteAtlasIndex {
  const sheetByGroup = new Map(inputs.sheets.map((sheet) => [sheet.groupId, sheet]));
  const allNpcs = [...inputs.worldNpcs, ...inputs.addedNpcs];
  const npcsByGroup = new Map<number, NormalizedNpc[]>();
  for (const npc of allNpcs) {
    const list = npcsByGroup.get(npc.spriteGroup) ?? [];
    list.push(npc);
    npcsByGroup.set(npc.spriteGroup, list);
  }

  const enemyIdsByOverworldGroup = new Map<number, number[]>();
  for (const enemy of inputs.battleEnemies) {
    if (!isFiniteInteger(enemy.overworldSprite)) {
      continue;
    }
    const list = enemyIdsByOverworldGroup.get(enemy.overworldSprite) ?? [];
    list.push(enemy.id);
    enemyIdsByOverworldGroup.set(enemy.overworldSprite, list);
  }

  const groupIds = new Set<number>([
    ...sheetByGroup.keys(),
    ...npcsByGroup.keys(),
    ...enemyIdsByOverworldGroup.keys()
  ]);
  const groups: SpriteAtlasGroup[] = [...groupIds].sort((a, b) => a - b).flatMap((groupId) => {
    const sheet = sheetByGroup.get(groupId) ?? inputs.sourceSheets.get(groupId);
    if (!sheet) {
      return [];
    }
    const npcs = npcsByGroup.get(groupId) ?? [];
    const groupOverride = inputs.spriteOverrides.bySpriteGroup?.[String(groupId)] !== undefined;
    const npcOverride = npcs.some((npc) => inputs.spriteOverrides.byNpcId?.[String(npc.npcId)] !== undefined);
    const overrideKind: OverrideKind = groupOverride ? "group" : npcOverride ? "npc" : "none";
    const enemyIds = (enemyIdsByOverworldGroup.get(groupId) ?? []).sort((a, b) => a - b);
    const image = sheetByGroup.has(groupId) ? sheet.file : `atlas/sprites/sheets/${pad3(groupId)}.png`;
    return [{
      groupId,
      image,
      portraitImage: `atlas/sprites/${pad3(groupId)}.png`,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frames: sheet.frames,
      animations: normalizeAnimations(sheet.animations, sheet.frames),
      usedByNpcCount: npcs.length,
      sampleNpcIds: npcs.map((npc) => npc.npcId).slice(0, 5),
      sampleLocations: npcs.flatMap((npc) => npc.worldPixel ? [npc.worldPixel] : []).slice(0, 5),
      sampleEnemyIds: enemyIds.slice(0, 5),
      overridden: overrideKind !== "none",
      overrideKind,
      roleGuess: roleGuessForGroup({
        npcs,
        enemyIds,
        spriteOverrides: inputs.spriteOverrides,
        customDialogue: inputs.customDialogue
      })
    }];
  });

  const enemies = inputs.battleEnemies
    .map((enemy): SpriteAtlasEnemy => ({
      enemyId: enemy.id,
      ...(inputs.enemyOverrides.byEnemyId?.[String(enemy.id)]?.name ?? enemy.name
        ? { name: inputs.enemyOverrides.byEnemyId?.[String(enemy.id)]?.name ?? enemy.name }
        : {}),
      ...(isFiniteInteger(enemy.spriteId) && inputs.battleSpriteDir
        ? { battleSprite: `${inputs.battleSpriteDir}/${pad3(enemy.spriteId)}.png` }
        : {}),
      ...(isFiniteInteger(enemy.overworldSprite) ? { overworldSpriteGroup: enemy.overworldSprite } : {}),
      overridden: inputs.spriteOverrides.byEnemyId?.[String(enemy.id)] !== undefined
    }))
    .sort((a, b) => a.enemyId - b.enemyId);

  const overriddenGroups = groups.filter((group) => group.overridden).length;
  return {
    schema: SCHEMA,
    groups,
    enemies,
    counts: {
      groups: groups.length,
      usedGroups: groups.filter((group) => group.usedByNpcCount > 0 || group.sampleEnemyIds.length > 0).length,
      overriddenGroups,
      unskinnedGroups: groups.length - overriddenGroups
    }
  };
}

async function cleanPreviousAtlasSprites(outDir: string): Promise<void> {
  if (!existsSync(outDir)) {
    return;
  }
  const entries = await readdir(outDir);
  await Promise.all(
    entries
      .filter((entry) => /^\d{3}\.png$/.test(entry))
      .map((entry) => unlink(path.join(outDir, entry)))
  );
  const sheetDir = path.join(outDir, "sheets");
  if (!existsSync(sheetDir)) {
    return;
  }
  const sheetEntries = await readdir(sheetDir);
  await Promise.all(
    sheetEntries
      .filter((entry) => /^\d{3}\.png$/.test(entry))
      .map((entry) => unlink(path.join(sheetDir, entry)))
  );
}

function bytesPerPixelForFilter(colorType: number, bitDepth: number): number {
  if (bitDepth < 8) {
    return 1;
  }
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 3:
      return 1;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`atlas: unsupported PNG color type ${colorType}`);
  }
}

function bitsPerPixel(colorType: number, bitDepth: number): number {
  switch (colorType) {
    case 0:
      return bitDepth;
    case 2:
      return bitDepth * 3;
    case 3:
      return bitDepth;
    case 4:
      return bitDepth * 2;
    case 6:
      return bitDepth * 4;
    default:
      throw new Error(`atlas: unsupported PNG color type ${colorType}`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function unfilterScanlines(options: {
  inflated: Buffer;
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
}): Uint8Array {
  const { inflated, width, height, colorType, bitDepth } = options;
  const stride = Math.ceil(width * bitsPerPixel(colorType, bitDepth) / 8);
  const bpp = bytesPerPixelForFilter(colorType, bitDepth);
  const raw = new Uint8Array(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousRowOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bpp ? raw[rowOffset + x - bpp] : 0;
      const up = y > 0 ? raw[previousRowOffset + x] : 0;
      const upLeft = y > 0 && x >= bpp ? raw[previousRowOffset + x - bpp] : 0;
      switch (filter) {
        case 0:
          raw[rowOffset + x] = value;
          break;
        case 1:
          raw[rowOffset + x] = (value + left) & 0xff;
          break;
        case 2:
          raw[rowOffset + x] = (value + up) & 0xff;
          break;
        case 3:
          raw[rowOffset + x] = (value + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          raw[rowOffset + x] = (value + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`atlas: unsupported PNG filter ${filter}`);
      }
    }
    sourceOffset += stride;
  }
  return raw;
}

function indexedPixel(raw: Uint8Array, stride: number, bitDepth: number, x: number, y: number): number {
  const rowOffset = y * stride;
  if (bitDepth === 8) {
    return raw[rowOffset + x];
  }
  const pixelsPerByte = 8 / bitDepth;
  const byte = raw[rowOffset + Math.floor(x / pixelsPerByte)];
  const shift = (pixelsPerByte - 1 - (x % pixelsPerByte)) * bitDepth;
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function decodePngRgba(buffer: Buffer): PngRgba {
  if (buffer.length < 24 || !PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    throw new Error("atlas: source image is not a PNG");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      transparency = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || interlace !== 0) {
    throw new Error("atlas: unsupported PNG header");
  }
  if (bitDepth !== 8 && !(colorType === 3 && [1, 2, 4].includes(bitDepth))) {
    throw new Error(`atlas: unsupported PNG bit depth ${bitDepth} for color type ${colorType}`);
  }

  const raw = unfilterScanlines({
    inflated: inflateSync(Buffer.concat(idat)),
    width,
    height,
    colorType,
    bitDepth
  });
  const rgba = new Uint8Array(width * height * 4);
  const stride = Math.ceil(width * bitsPerPixel(colorType, bitDepth) / 8);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (colorType === 3) {
        if (!palette) {
          throw new Error("atlas: indexed PNG is missing PLTE");
        }
        const index = indexedPixel(raw, stride, bitDepth, x, y);
        rgba[out] = palette[index * 3] ?? 0;
        rgba[out + 1] = palette[index * 3 + 1] ?? 0;
        rgba[out + 2] = palette[index * 3 + 2] ?? 0;
        rgba[out + 3] = transparency?.[index] ?? 255;
      } else if (colorType === 6) {
        const source = y * stride + x * 4;
        rgba[out] = raw[source];
        rgba[out + 1] = raw[source + 1];
        rgba[out + 2] = raw[source + 2];
        rgba[out + 3] = raw[source + 3];
      } else if (colorType === 2) {
        const source = y * stride + x * 3;
        rgba[out] = raw[source];
        rgba[out + 1] = raw[source + 1];
        rgba[out + 2] = raw[source + 2];
        rgba[out + 3] = 255;
      } else if (colorType === 0) {
        const gray = raw[y * stride + x];
        rgba[out] = gray;
        rgba[out + 1] = gray;
        rgba[out + 2] = gray;
        rgba[out + 3] = 255;
      } else {
        throw new Error(`atlas: unsupported PNG color type ${colorType}`);
      }
    }
  }
  return { width, height, rgba };
}

function cropFrame(source: PngRgba, sheet: SpriteSheet): Buffer {
  const animations = normalizeAnimations(sheet.animations, sheet.frames);
  const frame = animations.down[0] ?? 0;
  const sourceX = (frame % sheet.columns) * sheet.frameWidth;
  const sourceY = Math.floor(frame / sheet.columns) * sheet.frameHeight;
  if (sourceX + sheet.frameWidth > source.width || sourceY + sheet.frameHeight > source.height) {
    throw new Error(`atlas: frame ${frame} for sprite group ${sheet.groupId} exceeds source image bounds`);
  }
  const out = new Uint8Array(sheet.frameWidth * sheet.frameHeight * 4);
  for (let y = 0; y < sheet.frameHeight; y += 1) {
    const sourceOffset = ((sourceY + y) * source.width + sourceX) * 4;
    const targetOffset = y * sheet.frameWidth * 4;
    out.set(source.rgba.subarray(sourceOffset, sourceOffset + sheet.frameWidth * 4), targetOffset);
  }
  return encodePngRgba(sheet.frameWidth, sheet.frameHeight, out);
}

async function writeAtlasSpriteImages(options: {
  rootDir: string;
  generatedRelative: string;
  projectRelative: string;
  outImageDir: string;
  groups: SpriteAtlasGroup[];
  inputs: SpriteAtlasInputs;
}): Promise<void> {
  const { rootDir, generatedRelative, projectRelative, outImageDir, groups, inputs } = options;
  const sheetByGroup = new Map(inputs.sheets.map((sheet) => [sheet.groupId, sheet]));
  await mkdir(outImageDir, { recursive: true });
  await mkdir(path.join(outImageDir, "sheets"), { recursive: true });
  await cleanPreviousAtlasSprites(outImageDir);

  for (const group of groups) {
    const generatedSheet = sheetByGroup.get(group.groupId);
    const sourceSheet = generatedSheet ?? inputs.sourceSheets.get(group.groupId);
    if (!sourceSheet) {
      continue;
    }
    const sourceFile = generatedSheet
      ? resolvePath(rootDir, path.join(generatedRelative, generatedSheet.file))
      : resolvePath(rootDir, path.join(projectRelative, sourceSheet.file));
    const source = await readFile(sourceFile);
    await writeFile(path.join(outImageDir, `${pad3(group.groupId)}.png`), cropFrame(decodePngRgba(source), sourceSheet));
    if (!generatedSheet) {
      await writeFile(path.join(outImageDir, "sheets", `${pad3(group.groupId)}.png`), source);
    }
  }
}

export async function extractSpriteAtlas(options: ExtractSpriteAtlasOptions = {}): Promise<SpriteAtlasIndex> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const generatedRelative = options.generatedRelative ?? DEFAULT_GENERATED_RELATIVE;
  const projectRelative = options.projectRelative ?? DEFAULT_PROJECT_RELATIVE;
  const atlasImageDirRelative = options.atlasImageDirRelative ?? DEFAULT_ATLAS_IMAGE_DIR_RELATIVE;
  const atlasJsonRelative = options.atlasJsonRelative ?? DEFAULT_ATLAS_JSON_RELATIVE;
  const outImageDir = resolvePath(rootDir, atlasImageDirRelative);
  const outJsonPath = resolvePath(rootDir, atlasJsonRelative);
  const inputs = await loadSpriteAtlasInputs({ ...options, rootDir, generatedRelative, projectRelative });
  const index = buildSpriteAtlasIndex(inputs);

  await writeAtlasSpriteImages({
    rootDir,
    generatedRelative,
    projectRelative,
    outImageDir,
    groups: index.groups,
    inputs
  });
  await mkdir(path.dirname(outJsonPath), { recursive: true });
  await writeFile(outJsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

async function main(): Promise<void> {
  const index = await extractSpriteAtlas();
  const top = index.groups
    .slice()
    .sort((a, b) => b.usedByNpcCount - a.usedByNpcCount || a.groupId - b.groupId)
    .slice(0, 10)
    .map((group) => `${group.groupId}:${group.usedByNpcCount}:${group.overrideKind}`)
    .join(", ");
  console.log(`atlas: wrote ${index.counts.groups} sprite groups, ${index.counts.usedGroups} used, ${index.counts.overriddenGroups} overridden, ${index.counts.unskinnedGroups} unskinned`);
  console.log(`atlas: top used ${top}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
