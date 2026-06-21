import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseIntKeyedYaml, parseYamlInteger } from "../../packages/eb-converter/src/coilsnakeYaml";
import { readPngHeader } from "../../packages/eb-converter/src/png";

const BACKGROUNDS_SCHEMA = "swagbound.atlas.backgrounds.v1";
const UI_SCHEMA = "swagbound.atlas.ui.v1";
const TOWNMAPS_SCHEMA = "swagbound.atlas.townmaps.v1";
const DEFAULT_GENERATED_RELATIVE = "apps/game/public/generated";
const DEFAULT_PROJECT_RELATIVE = "external/coilsnake-full";
const DEFAULT_BACKGROUND_OVERRIDES_RELATIVE = "content/background-overrides.json";
const DEFAULT_ATLAS_CONTENT_DIR_RELATIVE = "content/atlas";
const DEFAULT_ATLAS_PUBLIC_DIR_RELATIVE = "apps/game/public/atlas";
const GENERATED_PUBLIC_PREFIX = "../generated";
const BATTLE_SCROLL_UNITS_PER_PIXEL = 256;
const BATTLE_SCROLL_FRAMES_PER_SECOND = 60;
const BATTLE_RIPPLE_AMPLITUDE_UNITS_PER_PIXEL = 1024;
const BATTLE_RIPPLE_FREQUENCY_UNITS_PER_RADIAN = 4096;

const TOWN_MAP_REGIONS_BY_INDEX = ["Onett", "Twoson", "Threed", "Fourside", "Summers", "Scaraba"] as const;

type Scroll = { x: number; y: number };
type Distortion = { kind: string; amplitude: number; frequency: number; speed: number };
type Rect = { x: number; y: number; w: number; h: number };
type Rgb = { r: number; g: number; b: number };

export type BackgroundAtlasEntry = {
  bgId: number;
  image: string;
  used: boolean;
  usedByEnemyGroups: number[];
  scroll?: Scroll;
  distortion?: Distortion;
  animated?: boolean;
  override?: string;
};

export type BackgroundAtlas = {
  schema: typeof BACKGROUNDS_SCHEMA;
  backgrounds: BackgroundAtlasEntry[];
  counts: {
    total: number;
    used: number;
    overridden: number;
  };
};

export type UiAtlasWindow = {
  id: string;
  image: string;
  configName?: string;
  geometry?: {
    sourceFile?: string;
    generatedFile?: string;
    sourceKind: "generated-flavor" | "raw-window-graphics";
    width?: number;
    height?: number;
    corner?: Rect;
    hEdge?: Rect;
    vEdge?: Rect;
    moreArrow?: Rect;
    interiorColor?: Rgb;
  };
};

export type UiAtlasWindowLayout = {
  id: number;
  configName?: string;
  geometry: {
    sourceKind: "window-configuration";
    units: "tiles";
    width: number;
    height: number;
    xOffset: number;
    yOffset: number;
  };
};

export type UiAtlasFont = {
  fontId: number | string;
  image: string;
  glyphCount: number;
  sampleGlyphWidths?: number[];
  geometry?: {
    sourceFile?: string;
    generatedFile?: string;
    width?: number;
    height?: number;
    columns?: number;
    cellWidth?: number;
    cellHeight?: number;
  };
};

export type UiAtlasIcon = {
  id: string;
  kind: "item" | "psi" | "status";
  image?: string | null;
  source: string;
  data: Record<string, unknown>;
  note?: string;
};

export type UiAtlas = {
  schema: typeof UI_SCHEMA;
  windows: UiAtlasWindow[];
  windowLayouts: UiAtlasWindowLayout[];
  fonts: UiAtlasFont[];
  icons: UiAtlasIcon[];
  counts: {
    windows: number;
    windowLayouts: number;
    fonts: number;
    glyphs: number;
    icons: number;
    unresolvedIcons: number;
  };
};

export type TownMapAtlasMap = {
  region: string;
  image: string;
  geometry?: {
    width?: number;
    height?: number;
  };
};

export type TownMapAtlasIcon = {
  id: string;
  image?: string;
  position?: {
    region: string;
    mapIndex: number;
    x: number;
    y: number;
    eventFlag?: string;
    icon: string;
  };
};

export type TownMapAtlas = {
  schema: typeof TOWNMAPS_SCHEMA;
  maps: TownMapAtlasMap[];
  iconSheetImage?: string;
  icons: TownMapAtlasIcon[];
  counts: {
    maps: number;
    icons: number;
    iconTypes: number;
  };
};

export type ExtraAtlas = {
  backgrounds: BackgroundAtlas;
  ui: UiAtlas;
  townmaps: TownMapAtlas;
};

export type ExtractExtraAtlasOptions = {
  rootDir?: string;
  generatedRelative?: string;
  projectRelative?: string;
  backgroundOverridesRelative?: string;
  atlasContentDirRelative?: string;
  atlasPublicDirRelative?: string;
  mirrorPublicJson?: boolean;
};

type GeneratedBattle = {
  groups?: Array<{
    id?: unknown;
    background1?: unknown;
    background2?: unknown;
  }>;
  backgrounds?: Array<{
    id?: unknown;
    scroll?: Scroll;
    distortion?: Distortion;
  }>;
};

type GeneratedWindow = {
  flavors?: Array<{
    id?: unknown;
    file?: unknown;
    corner?: Rect;
    hEdge?: Rect;
    vEdge?: Rect;
    moreArrow?: Rect;
    interiorColor?: Rgb;
  }>;
  layouts?: Array<{
    id?: unknown;
    width?: unknown;
    height?: unknown;
    xOffset?: unknown;
    yOffset?: unknown;
  }>;
};

type GeneratedFont = {
  fonts?: Array<{
    id?: unknown;
    file?: unknown;
    imageWidth?: unknown;
    imageHeight?: unknown;
    columns?: unknown;
    glyphCount?: unknown;
    cellWidth?: unknown;
    cellHeight?: unknown;
    widths?: unknown;
  }>;
};

type BackgroundOverrides = {
  byBackgroundId?: Record<string, unknown>;
};

type BackgroundAnimation = {
  scroll?: Scroll;
  distortion?: Distortion;
  animated: boolean;
};

type IconPositionRecord = {
  mapIndex: number;
  eventFlag?: string;
  icon?: string;
  x?: number;
  y?: number;
};

function resolvePath(rootDir: string, pathLike: string): string {
  return path.isAbsolute(pathLike) ? pathLike : path.join(rootDir, pathLike);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readOptionalJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return readJson<T>(filePath);
}

async function listPngFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) {
    return [];
  }
  const files = await readdir(dir);
  return files
    .filter((file) => /\.png$/i.test(file))
    .sort(naturalCompare);
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, "en-US", { numeric: true, sensitivity: "base" });
}

async function cleanPreviousPngs(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const files = await listPngFiles(dir);
  await Promise.all(files.map((file) => unlink(path.join(dir, file))));
}

async function copyPng(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function pngDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  const header = readPngHeader(await readFile(filePath));
  return header ? { width: header.width, height: header.height } : {};
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function basenameWithoutExt(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function signed16(value: number): number {
  const normalized = value & 0xffff;
  return normalized >= 0x8000 ? normalized - 0x10000 : normalized;
}

function roundBattleNumber(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isEffectivelyZero(value: number): boolean {
  return Math.abs(value) < 0.0005;
}

function optionalYamlInteger(entry: Record<string, string>, field: string): number | undefined {
  const parsed = parseYamlInteger(entry[field]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function leadingYamlInteger(value: string | undefined): number | undefined {
  const match = /^(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+)/.exec(value?.trim() ?? "");
  if (!match) {
    return undefined;
  }
  const parsed = parseYamlInteger(match[1]);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function resolveBackgroundScroll(
  dataRow: Record<string, string>,
  scrollingRows: ReturnType<typeof parseIntKeyedYaml>
): Scroll | undefined {
  let x = 0;
  let y = 0;
  for (let index = 1; index <= 4; index += 1) {
    const rowId = optionalYamlInteger(dataRow, `Scrolling Movement ${index}`);
    if (rowId === undefined || rowId <= 0) {
      continue;
    }
    const row = scrollingRows.get(rowId);
    if (!row) {
      continue;
    }
    const horizontal = optionalYamlInteger(row, "Horizontal Movement");
    const vertical = optionalYamlInteger(row, "Vertical Movement");
    if (horizontal === undefined || vertical === undefined) {
      continue;
    }
    x += signed16(horizontal) / BATTLE_SCROLL_UNITS_PER_PIXEL * BATTLE_SCROLL_FRAMES_PER_SECOND;
    y += signed16(vertical) / BATTLE_SCROLL_UNITS_PER_PIXEL * BATTLE_SCROLL_FRAMES_PER_SECOND;
  }
  if (isEffectivelyZero(x) && isEffectivelyZero(y)) {
    return undefined;
  }
  return {
    x: roundBattleNumber(x),
    y: roundBattleNumber(y)
  };
}

function resolveBackgroundDistortion(
  dataRow: Record<string, string>,
  distortionRows: ReturnType<typeof parseIntKeyedYaml>
): Distortion | undefined {
  for (let index = 1; index <= 4; index += 1) {
    const rowId = optionalYamlInteger(dataRow, `Distortion ${index}`);
    if (rowId === undefined || rowId <= 0) {
      continue;
    }
    const row = distortionRows.get(rowId);
    if (!row) {
      continue;
    }
    const amplitude = optionalYamlInteger(row, "Ripple Amplitude");
    const frequency = optionalYamlInteger(row, "Ripple Frequency");
    const speed = optionalYamlInteger(row, "Speed");
    if (amplitude === undefined || frequency === undefined || speed === undefined) {
      continue;
    }
    const normalizedAmplitude = amplitude / BATTLE_RIPPLE_AMPLITUDE_UNITS_PER_PIXEL;
    const normalizedFrequency = frequency / BATTLE_RIPPLE_FREQUENCY_UNITS_PER_RADIAN;
    if (normalizedAmplitude <= 0 || normalizedFrequency <= 0) {
      continue;
    }
    return {
      kind: row.Type?.trim() || "unknown",
      amplitude: roundBattleNumber(normalizedAmplitude),
      frequency: roundBattleNumber(normalizedFrequency),
      speed: roundBattleNumber(speed)
    };
  }
  return undefined;
}

function hasPaletteAnimation(dataRow: Record<string, string>): boolean {
  const cycle = leadingYamlInteger(dataRow["Palette Cycle"]) ?? 0;
  const speed = leadingYamlInteger(dataRow["Palette-changing speed"]) ?? 0;
  const begin1 = leadingYamlInteger(dataRow["Palette Cycle 1 Begin"]) ?? 0;
  const end1 = leadingYamlInteger(dataRow["Palette Cycle 1 End"]) ?? 0;
  const begin2 = leadingYamlInteger(dataRow["Palette Cycle 2 Begin"]) ?? 0;
  const end2 = leadingYamlInteger(dataRow["Palette Cycle 2 End"]) ?? 0;
  return cycle > 0 && speed > 0 && (begin1 !== end1 || begin2 !== end2);
}

async function readBackgroundAnimations(projectAbs: string): Promise<Map<number, BackgroundAnimation>> {
  const dataPath = path.join(projectAbs, "bg_data_table.yml");
  if (!existsSync(dataPath)) {
    return new Map();
  }
  const dataRows = parseIntKeyedYaml(await readFile(dataPath, "utf8"));
  const scrollingRows = existsSync(path.join(projectAbs, "bg_scrolling_table.yml"))
    ? parseIntKeyedYaml(await readFile(path.join(projectAbs, "bg_scrolling_table.yml"), "utf8"))
    : new Map<number, Record<string, string>>();
  const distortionRows = existsSync(path.join(projectAbs, "bg_distortion_table.yml"))
    ? parseIntKeyedYaml(await readFile(path.join(projectAbs, "bg_distortion_table.yml"), "utf8"))
    : new Map<number, Record<string, string>>();
  const animations = new Map<number, BackgroundAnimation>();
  for (const [id, dataRow] of dataRows) {
    const scroll = resolveBackgroundScroll(dataRow, scrollingRows);
    const distortion = resolveBackgroundDistortion(dataRow, distortionRows);
    const paletteAnimated = hasPaletteAnimation(dataRow);
    animations.set(id, {
      ...(scroll ? { scroll } : {}),
      ...(distortion ? { distortion } : {}),
      animated: Boolean(scroll || distortion || paletteAnimated)
    });
  }
  return animations;
}

function generatedBattleBackgrounds(generatedBattle: GeneratedBattle): Map<number, { scroll?: Scroll; distortion?: Distortion }> {
  const byId = new Map<number, { scroll?: Scroll; distortion?: Distortion }>();
  for (const entry of generatedBattle.backgrounds ?? []) {
    if (!isFiniteInteger(entry.id)) {
      continue;
    }
    byId.set(entry.id, {
      ...(entry.scroll ? { scroll: entry.scroll } : {}),
      ...(entry.distortion ? { distortion: entry.distortion } : {})
    });
  }
  return byId;
}

function backgroundUsageByGroup(generatedBattle: GeneratedBattle): Map<number, number[]> {
  const usage = new Map<number, Set<number>>();
  for (const group of generatedBattle.groups ?? []) {
    if (!isFiniteInteger(group.id)) {
      continue;
    }
    for (const bgId of [group.background1, group.background2]) {
      if (!isFiniteInteger(bgId)) {
        continue;
      }
      let groups = usage.get(bgId);
      if (!groups) {
        groups = new Set<number>();
        usage.set(bgId, groups);
      }
      groups.add(group.id);
    }
  }
  return new Map([...usage.entries()].map(([bgId, groups]) => [bgId, [...groups].sort((a, b) => a - b)]));
}

async function buildBackgroundAtlas(options: {
  projectAbs: string;
  generatedAbs: string;
  backgroundOverridesAbs: string;
  publicAtlasAbs: string;
}): Promise<BackgroundAtlas> {
  const battleBgDir = path.join(options.projectAbs, "BattleBGs");
  const generatedBattle = await readOptionalJson<GeneratedBattle>(path.join(options.generatedAbs, "battle.json"), {});
  const generatedBackgroundDir = path.join(options.generatedAbs, "assets/battle/backgrounds");
  const generatedBackgroundFiles = new Set(await listPngFiles(generatedBackgroundDir));
  const animations = await readBackgroundAnimations(options.projectAbs);
  const generatedMeta = generatedBattleBackgrounds(generatedBattle);
  const usedByGroup = backgroundUsageByGroup(generatedBattle);
  const overrides = await readOptionalJson<BackgroundOverrides>(options.backgroundOverridesAbs, {});
  const backgroundFiles = await listPngFiles(battleBgDir);
  const outDir = path.join(options.publicAtlasAbs, "backgrounds");
  await cleanPreviousPngs(outDir);

  const backgrounds: BackgroundAtlasEntry[] = [];
  for (const fileName of backgroundFiles) {
    const bgId = Number.parseInt(basenameWithoutExt(fileName), 10);
    if (!Number.isFinite(bgId)) {
      continue;
    }
    const source = path.join(battleBgDir, fileName);
    const image = generatedBackgroundFiles.has(fileName)
      ? `${GENERATED_PUBLIC_PREFIX}/assets/battle/backgrounds/${fileName}`
      : `atlas/backgrounds/${fileName}`;
    if (!generatedBackgroundFiles.has(fileName)) {
      await copyPng(source, path.join(outDir, fileName));
    }
    const tableMeta = animations.get(bgId);
    const buildMeta = generatedMeta.get(bgId);
    const scroll = buildMeta?.scroll ?? tableMeta?.scroll;
    const distortion = buildMeta?.distortion ?? tableMeta?.distortion;
    const override = optionalString(overrides.byBackgroundId?.[String(bgId)]);
    backgrounds.push({
      bgId,
      image,
      used: usedByGroup.has(bgId),
      usedByEnemyGroups: usedByGroup.get(bgId) ?? [],
      ...(scroll ? { scroll } : {}),
      ...(distortion ? { distortion } : {}),
      animated: Boolean(scroll || distortion || tableMeta?.animated),
      ...(override ? { override } : {})
    });
  }

  backgrounds.sort((a, b) => a.bgId - b.bgId);
  return {
    schema: BACKGROUNDS_SCHEMA,
    backgrounds,
    counts: {
      total: backgrounds.length,
      used: backgrounds.filter((background) => background.used).length,
      overridden: backgrounds.filter((background) => background.override).length
    }
  };
}

function windowFlavorName(flavorNames: string[], sourceGroup: string, flavorId: number): string | undefined {
  const name = flavorNames[flavorId];
  if (!name) {
    return undefined;
  }
  return sourceGroup === "1" ? name : `${name} secondary frame`;
}

async function readFlavorNames(windowGraphicsDir: string): Promise<string[]> {
  const file = path.join(windowGraphicsDir, "flavor_names.txt");
  if (!existsSync(file)) {
    return [];
  }
  return (await readFile(file, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function generatedWindowFlavorMap(generatedWindow: GeneratedWindow): Map<number, NonNullable<GeneratedWindow["flavors"]>[number]> {
  const byId = new Map<number, NonNullable<GeneratedWindow["flavors"]>[number]>();
  for (const flavor of generatedWindow.flavors ?? []) {
    if (isFiniteInteger(flavor.id)) {
      byId.set(flavor.id, flavor);
    }
  }
  return byId;
}

function normalizeGeneratedLayouts(generatedWindow: GeneratedWindow): UiAtlasWindowLayout[] {
  return (generatedWindow.layouts ?? [])
    .flatMap((layout): UiAtlasWindowLayout[] => {
      if (
        !isFiniteInteger(layout.id) ||
        !isFiniteInteger(layout.width) ||
        !isFiniteInteger(layout.height) ||
        !isFiniteInteger(layout.xOffset) ||
        !isFiniteInteger(layout.yOffset)
      ) {
        return [];
      }
      return [{
        id: layout.id,
        configName: `window_configuration_table[${layout.id}]`,
        geometry: {
          sourceKind: "window-configuration",
          units: "tiles",
          width: layout.width,
          height: layout.height,
          xOffset: layout.xOffset,
          yOffset: layout.yOffset
        }
      }];
    })
    .sort((a, b) => a.id - b.id);
}

async function buildUiWindows(options: {
  projectAbs: string;
  generatedAbs: string;
  publicAtlasAbs: string;
  generatedWindow: GeneratedWindow;
}): Promise<UiAtlasWindow[]> {
  const windowGraphicsDir = path.join(options.projectAbs, "WindowGraphics");
  const windowFiles = await listPngFiles(windowGraphicsDir);
  const generatedByFlavor = generatedWindowFlavorMap(options.generatedWindow);
  const flavorNames = await readFlavorNames(windowGraphicsDir);
  const outDir = path.join(options.publicAtlasAbs, "ui");
  await mkdir(outDir, { recursive: true });

  const windows: UiAtlasWindow[] = [];
  for (const fileName of windowFiles) {
    const match = /^Windows([12])_(\d+)\.png$/i.exec(fileName);
    const sourceGroup = match?.[1];
    const flavorId = match ? Number.parseInt(match[2], 10) : undefined;
    const source = path.join(windowGraphicsDir, fileName);
    const dimensions = await pngDimensions(source);
    const generatedFlavor = flavorId !== undefined && sourceGroup === "1" ? generatedByFlavor.get(flavorId) : undefined;
    const generatedFile = optionalString(generatedFlavor?.file);
    const generatedFileExists = generatedFile ? existsSync(path.join(options.generatedAbs, generatedFile)) : false;
    const image = generatedFile && generatedFileExists
      ? `${GENERATED_PUBLIC_PREFIX}/${generatedFile}`
      : `atlas/ui/window-${basenameWithoutExt(fileName)}.png`;
    if (!generatedFile || !generatedFileExists) {
      await copyPng(source, path.join(outDir, `window-${basenameWithoutExt(fileName)}.png`));
    }
    windows.push({
      id: basenameWithoutExt(fileName),
      image,
      ...(flavorId !== undefined && sourceGroup ? { configName: windowFlavorName(flavorNames, sourceGroup, flavorId) } : {}),
      geometry: {
        sourceFile: `WindowGraphics/${fileName}`,
        ...(generatedFile ? { generatedFile } : {}),
        sourceKind: generatedFile && generatedFileExists ? "generated-flavor" : "raw-window-graphics",
        ...dimensions,
        ...(generatedFlavor?.corner ? { corner: generatedFlavor.corner } : {}),
        ...(generatedFlavor?.hEdge ? { hEdge: generatedFlavor.hEdge } : {}),
        ...(generatedFlavor?.vEdge ? { vEdge: generatedFlavor.vEdge } : {}),
        ...(generatedFlavor?.moreArrow ? { moreArrow: generatedFlavor.moreArrow } : {}),
        ...(generatedFlavor?.interiorColor ? { interiorColor: generatedFlavor.interiorColor } : {})
      }
    });
  }
  return windows.sort((a, b) => naturalCompare(a.id, b.id));
}

function normalizeGeneratedFonts(generatedFont: GeneratedFont): NonNullable<GeneratedFont["fonts"]> {
  return (generatedFont.fonts ?? [])
    .filter((font) => isFiniteInteger(font.id) && typeof font.file === "string")
    .sort((a, b) => Number(a.id) - Number(b.id));
}

async function buildUiFonts(options: {
  projectAbs: string;
  generatedAbs: string;
  publicAtlasAbs: string;
  generatedFont: GeneratedFont;
}): Promise<UiAtlasFont[]> {
  const fontsDir = path.join(options.projectAbs, "Fonts");
  const generatedFonts = normalizeGeneratedFonts(options.generatedFont);
  const generatedSourceNames = new Set<string>();
  const outDir = path.join(options.publicAtlasAbs, "ui");
  const fonts: UiAtlasFont[] = [];

  for (const font of generatedFonts) {
    const fontId = Number(font.id);
    const generatedFile = String(font.file);
    const image = existsSync(path.join(options.generatedAbs, generatedFile))
      ? `${GENERATED_PUBLIC_PREFIX}/${generatedFile}`
      : `atlas/ui/font-${fontId}.png`;
    const sourceName = `${fontId}.png`;
    generatedSourceNames.add(sourceName);
    if (!existsSync(path.join(options.generatedAbs, generatedFile)) && existsSync(path.join(fontsDir, sourceName))) {
      await copyPng(path.join(fontsDir, sourceName), path.join(outDir, `font-${fontId}.png`));
    }
    const widths = Array.isArray(font.widths) ? font.widths.filter((value): value is number => typeof value === "number") : [];
    fonts.push({
      fontId,
      image,
      glyphCount: isFiniteInteger(font.glyphCount) ? font.glyphCount : widths.length,
      ...(widths.length > 0 ? { sampleGlyphWidths: widths.slice(0, 16) } : {}),
      geometry: {
        sourceFile: `Fonts/${sourceName}`,
        generatedFile,
        ...(isFiniteInteger(font.imageWidth) ? { width: font.imageWidth } : {}),
        ...(isFiniteInteger(font.imageHeight) ? { height: font.imageHeight } : {}),
        ...(isFiniteInteger(font.columns) ? { columns: font.columns } : {}),
        ...(isFiniteInteger(font.cellWidth) ? { cellWidth: font.cellWidth } : {}),
        ...(isFiniteInteger(font.cellHeight) ? { cellHeight: font.cellHeight } : {})
      }
    });
  }

  const rawFontFiles = await listPngFiles(fontsDir);
  for (const fileName of rawFontFiles) {
    if (generatedSourceNames.has(fileName)) {
      continue;
    }
    const source = path.join(fontsDir, fileName);
    const outName = `font-${basenameWithoutExt(fileName)}.png`;
    await copyPng(source, path.join(outDir, outName));
    fonts.push({
      fontId: basenameWithoutExt(fileName),
      image: `atlas/ui/${outName}`,
      glyphCount: 0,
      geometry: {
        sourceFile: `Fonts/${fileName}`,
        ...(await pngDimensions(source))
      }
    });
  }

  return fonts.sort((a, b) => naturalCompare(String(a.fontId), String(b.fontId)));
}

function compactData(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) {
      out[key] = record[key];
    }
  }
  return out;
}

async function readStatusCodes(generatedAbs: string): Promise<number[]> {
  const scriptsPath = path.join(generatedAbs, "scripts.json");
  if (!existsSync(scriptsPath)) {
    return [];
  }
  const statuses = new Set<number>();
  collectStatusCodes(await readJson<unknown>(scriptsPath), statuses);
  return [...statuses].sort((a, b) => a - b);
}

function collectStatusCodes(value: unknown, statuses: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStatusCodes(item, statuses);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  if (isFiniteInteger(record.status)) {
    statuses.add(record.status);
  }
  for (const item of Object.values(record)) {
    collectStatusCodes(item, statuses);
  }
}

async function buildUiIcons(generatedAbs: string): Promise<UiAtlasIcon[]> {
  const items = await readOptionalJson<{ items?: Record<string, unknown>[] }>(path.join(generatedAbs, "items.json"), {});
  const psi = await readOptionalJson<{ psi?: Record<string, unknown>[] }>(path.join(generatedAbs, "psi.json"), {});
  const unresolvedNote = "No explicit icon image field is emitted; visual glyphs remain embedded in font/window graphics.";
  const itemIcons = (items.items ?? [])
    .filter((item) => isFiniteInteger(item.id))
    .map((item): UiAtlasIcon => ({
      id: `item:${item.id}`,
      kind: "item",
      image: null,
      source: "generated/items.json",
      data: compactData(item, ["id", "name", "type", "equippable", "effect"]),
      note: unresolvedNote
    }));
  const psiIcons = (psi.psi ?? [])
    .filter((entry) => isFiniteInteger(entry.id))
    .map((entry): UiAtlasIcon => ({
      id: `psi:${entry.id}`,
      kind: "psi",
      image: null,
      source: "generated/psi.json",
      data: compactData(entry, ["id", "name", "strength", "usableOutsideBattle"]),
      note: unresolvedNote
    }));
  const statusIcons = (await readStatusCodes(generatedAbs)).map((status): UiAtlasIcon => ({
    id: `status:${status}`,
    kind: "status",
    image: null,
    source: "generated/scripts.json",
    data: { status },
    note: unresolvedNote
  }));
  return [...itemIcons, ...psiIcons, ...statusIcons].sort((a, b) => naturalCompare(a.id, b.id));
}

async function buildUiAtlas(options: {
  projectAbs: string;
  generatedAbs: string;
  publicAtlasAbs: string;
}): Promise<UiAtlas> {
  const outDir = path.join(options.publicAtlasAbs, "ui");
  await cleanPreviousPngs(outDir);
  const generatedWindow = await readOptionalJson<GeneratedWindow>(path.join(options.generatedAbs, "window.json"), {});
  const generatedFont = await readOptionalJson<GeneratedFont>(path.join(options.generatedAbs, "font.json"), {});
  const [windows, fonts, icons] = await Promise.all([
    buildUiWindows({ ...options, generatedWindow }),
    buildUiFonts({ ...options, generatedFont }),
    buildUiIcons(options.generatedAbs)
  ]);
  const windowLayouts = normalizeGeneratedLayouts(generatedWindow);
  return {
    schema: UI_SCHEMA,
    windows,
    windowLayouts,
    fonts,
    icons,
    counts: {
      windows: windows.length,
      windowLayouts: windowLayouts.length,
      fonts: fonts.length,
      glyphs: fonts.reduce((sum, font) => sum + font.glyphCount, 0),
      icons: icons.length,
      unresolvedIcons: icons.filter((icon) => !icon.image).length
    }
  };
}

function iconRegionForIndex(index: number): string {
  return TOWN_MAP_REGIONS_BY_INDEX[index] ?? `TownMap${index}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "icon";
}

function parseTownMapIconPositions(source: string): IconPositionRecord[] {
  const icons: IconPositionRecord[] = [];
  let mapIndex = 0;
  let current: IconPositionRecord | undefined;
  const commit = () => {
    if (current?.icon && current.x !== undefined && current.y !== undefined) {
      icons.push(current);
    }
    current = undefined;
  };

  for (const line of source.split(/\r?\n/)) {
    const mapMatch = /^(\d+):\s*$/.exec(line);
    if (mapMatch) {
      commit();
      mapIndex = Number.parseInt(mapMatch[1], 10);
      continue;
    }
    const eventMatch = /^-\s*Event Flag:\s*(.+?)\s*$/.exec(line);
    if (eventMatch) {
      commit();
      current = { mapIndex, eventFlag: eventMatch[1].trim() };
      continue;
    }
    if (!current) {
      continue;
    }
    const fieldMatch = /^ {2}([^:]+):\s*(.+?)\s*$/.exec(line);
    if (!fieldMatch) {
      continue;
    }
    const key = fieldMatch[1].trim();
    const value = fieldMatch[2].trim();
    if (key === "Icon") {
      current.icon = value;
    } else if (key === "X") {
      current.x = parseYamlInteger(value);
    } else if (key === "Y") {
      current.y = parseYamlInteger(value);
    }
  }
  commit();
  return icons.sort((a, b) =>
    a.mapIndex - b.mapIndex ||
    (a.y ?? 0) - (b.y ?? 0) ||
    (a.x ?? 0) - (b.x ?? 0) ||
    String(a.icon).localeCompare(String(b.icon))
  );
}

function mapSortIndex(fileName: string): number {
  const region = basenameWithoutExt(fileName);
  const index = TOWN_MAP_REGIONS_BY_INDEX.findIndex((candidate) => candidate === region);
  return index >= 0 ? index : TOWN_MAP_REGIONS_BY_INDEX.length;
}

async function buildTownMapAtlas(options: {
  projectAbs: string;
  publicAtlasAbs: string;
}): Promise<TownMapAtlas> {
  const townMapsDir = path.join(options.projectAbs, "TownMaps");
  const outDir = path.join(options.publicAtlasAbs, "townmaps");
  await cleanPreviousPngs(outDir);
  const allPngs = await listPngFiles(townMapsDir);
  const mapFiles = allPngs
    .filter((file) => file.toLowerCase() !== "icons.png")
    .sort((a, b) => mapSortIndex(a) - mapSortIndex(b) || naturalCompare(a, b));
  const maps: TownMapAtlasMap[] = [];
  for (const fileName of mapFiles) {
    const source = path.join(townMapsDir, fileName);
    await copyPng(source, path.join(outDir, fileName));
    maps.push({
      region: basenameWithoutExt(fileName),
      image: `atlas/townmaps/${fileName}`,
      geometry: await pngDimensions(source)
    });
  }

  const iconSheet = path.join(townMapsDir, "icons.png");
  const iconSheetImage = existsSync(iconSheet) ? "atlas/townmaps/icons.png" : undefined;
  if (existsSync(iconSheet)) {
    await copyPng(iconSheet, path.join(outDir, "icons.png"));
  }

  const iconPositionsPath = path.join(townMapsDir, "icon_positions.yml");
  const iconPositions = existsSync(iconPositionsPath)
    ? parseTownMapIconPositions(await readFile(iconPositionsPath, "utf8"))
    : [];
  const icons = iconPositions.map((icon, index): TownMapAtlasIcon => {
    const region = iconRegionForIndex(icon.mapIndex);
    return {
      id: `${region}:${slug(icon.icon ?? "icon")}:${icon.eventFlag ?? index}`,
      ...(iconSheetImage ? { image: iconSheetImage } : {}),
      position: {
        region,
        mapIndex: icon.mapIndex,
        x: icon.x ?? 0,
        y: icon.y ?? 0,
        ...(icon.eventFlag ? { eventFlag: icon.eventFlag } : {}),
        icon: icon.icon ?? "icon"
      }
    };
  });

  return {
    schema: TOWNMAPS_SCHEMA,
    maps,
    ...(iconSheetImage ? { iconSheetImage } : {}),
    icons,
    counts: {
      maps: maps.length,
      icons: icons.length,
      iconTypes: new Set(icons.map((icon) => icon.position?.icon ?? icon.id)).size
    }
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeAtlasDatasets(options: {
  contentAtlasAbs: string;
  publicAtlasAbs: string;
  mirrorPublicJson: boolean;
  atlas: ExtraAtlas;
}): Promise<void> {
  const pairs: Array<[string, unknown]> = [
    ["backgrounds.json", options.atlas.backgrounds],
    ["ui.json", options.atlas.ui],
    ["townmaps.json", options.atlas.townmaps]
  ];
  for (const [fileName, value] of pairs) {
    await writeJson(path.join(options.contentAtlasAbs, fileName), value);
    if (options.mirrorPublicJson) {
      await writeJson(path.join(options.publicAtlasAbs, fileName), value);
    }
  }
}

export async function extractExtraAtlas(options: ExtractExtraAtlasOptions = {}): Promise<ExtraAtlas> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const generatedRelative = options.generatedRelative ?? DEFAULT_GENERATED_RELATIVE;
  const projectRelative = options.projectRelative ?? DEFAULT_PROJECT_RELATIVE;
  const backgroundOverridesRelative = options.backgroundOverridesRelative ?? DEFAULT_BACKGROUND_OVERRIDES_RELATIVE;
  const contentAtlasRelative = options.atlasContentDirRelative ?? DEFAULT_ATLAS_CONTENT_DIR_RELATIVE;
  const publicAtlasRelative = options.atlasPublicDirRelative ?? DEFAULT_ATLAS_PUBLIC_DIR_RELATIVE;
  const generatedAbs = resolvePath(rootDir, generatedRelative);
  const projectAbs = resolvePath(rootDir, projectRelative);
  const publicAtlasAbs = resolvePath(rootDir, publicAtlasRelative);
  const contentAtlasAbs = resolvePath(rootDir, contentAtlasRelative);
  const backgroundOverridesAbs = resolvePath(rootDir, backgroundOverridesRelative);

  const [backgrounds, ui, townmaps] = await Promise.all([
    buildBackgroundAtlas({ projectAbs, generatedAbs, backgroundOverridesAbs, publicAtlasAbs }),
    buildUiAtlas({ projectAbs, generatedAbs, publicAtlasAbs }),
    buildTownMapAtlas({ projectAbs, publicAtlasAbs })
  ]);
  const atlas: ExtraAtlas = { backgrounds, ui, townmaps };
  await writeAtlasDatasets({
    contentAtlasAbs,
    publicAtlasAbs,
    mirrorPublicJson: options.mirrorPublicJson ?? true,
    atlas
  });
  return atlas;
}

async function main(): Promise<void> {
  const atlas = await extractExtraAtlas();
  console.log(`atlas: backgrounds ${atlas.backgrounds.counts.total} total, ${atlas.backgrounds.counts.used} used, ${atlas.backgrounds.counts.overridden} overridden`);
  console.log(`atlas: ui windows ${atlas.ui.counts.windows}, layouts ${atlas.ui.counts.windowLayouts}, fonts ${atlas.ui.counts.fonts}/${atlas.ui.counts.glyphs} glyphs, icons ${atlas.ui.counts.icons} unresolved ${atlas.ui.counts.unresolvedIcons}`);
  console.log(`atlas: townmaps ${atlas.townmaps.counts.maps}, icons ${atlas.townmaps.counts.icons}, icon types ${atlas.townmaps.counts.iconTypes}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
