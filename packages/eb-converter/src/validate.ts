import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BattleDataSchema,
  CharacterCollectionSchema,
  EncountersSchema,
  FontCollectionSchema,
  ItemCollectionSchema,
  ManifestSchema,
  NpcReferenceCollectionSchema,
  PsiCollectionSchema,
  ScriptCollectionSchema,
  ShopDataSchema,
  SpriteGroupCollectionSchema,
  SpriteSheetCollectionSchema,
  TeleportDestinationsSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  WindowCollectionSchema,
  WorldArtifactSchema
} from "@eb/schemas";

const DEFAULT_OUT = "apps/game/public/generated";
const DEFAULT_CHARACTERS_FILE = "characters.json";
const DEFAULT_ITEMS_FILE = "items.json";
const DEFAULT_PSI_FILE = "psi.json";
const DEFAULT_SHOPS_FILE = "shops.json";
const DEFAULT_WINDOW_FILE = "window.json";
const DEFAULT_ENCOUNTERS_FILE = "encounters.json";

function parseOut(argv: string[]): string {
  const outIndex = argv.indexOf("--out");
  return outIndex >= 0 ? argv[outIndex + 1] ?? DEFAULT_OUT : DEFAULT_OUT;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

export type GeneratedValidationResult = {
  ok: boolean;
  manifest?: "valid";
  generatedFiles?: string[];
  counts?: unknown;
  validation?: unknown;
  tutorial?: unknown;
  scriptFiles?: number;
  npcReferences?: number;
  spriteImages?: number;
  worldAvailable?: boolean;
  worldNpcs?: number;
  spriteSheets?: number;
  worldAssetsChecked?: number;
  battleEnemies?: number;
  battleGroups?: number;
  battleAssetsChecked?: number;
  fontSheets?: number;
  fontGlyphs?: number;
  fontAssetsChecked?: number;
  windowFlavors?: number;
  windowAssetsChecked?: number;
  characters?: number;
  characterStatFieldsPopulated?: number;
  items?: number;
  equippableItems?: number;
  psi?: number;
  psiLearnedByEntries?: number;
  shops?: number;
  shopItemEntries?: number;
  teleportDestinations?: number;
  encounterSectors?: number;
  encounterEnemyGroups?: number;
};

export async function validateGeneratedOutput(outInput = DEFAULT_OUT): Promise<GeneratedValidationResult> {
  const out = resolveFromRoot(outInput);
  const manifestPath = path.join(out, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(JSON.stringify({
      severity: "error",
      code: "missing_manifest",
      message: "Generated manifest.json is missing.",
      path: "manifest.json"
    }));
  }

  const manifestRaw = await readJson(manifestPath);
  const manifest = ManifestSchema.parse(manifestRaw);
  const scriptsRaw = await readJson(path.join(out, manifest.files.scripts));
  const scripts = ScriptCollectionSchema.parse(scriptsRaw);
  const npcsRaw = await readJson(path.join(out, manifest.files.npcs));
  const npcs = NpcReferenceCollectionSchema.parse(npcsRaw);
  const spriteGroupsRaw = await readJson(path.join(out, manifest.files.spriteGroups));
  const spriteGroups = SpriteGroupCollectionSchema.parse(spriteGroupsRaw);
  const tutorialStatusRaw = await readJson(path.join(out, manifest.files.tutorialStatus));
  const tutorialStatus = TutorialStatusSchema.parse(tutorialStatusRaw);
  const validationReportRaw = await readJson(path.join(out, manifest.files.validationReport));
  const validationReport = ValidationReportSchema.parse(validationReportRaw);
  const worldRaw = await readJson(path.join(out, manifest.files.world));
  const world = WorldArtifactSchema.parse(worldRaw);
  const spritesRaw = await readJson(path.join(out, manifest.files.sprites));
  const sprites = SpriteSheetCollectionSchema.parse(spritesRaw);
  const teleportDestinationsFile = manifest.files.teleportDestinations ?? "teleport-destinations.json";
  const teleportDestinationsPath = path.join(out, teleportDestinationsFile);
  const shouldReadTeleportDestinations = Boolean(manifest.files.teleportDestinations) || existsSync(teleportDestinationsPath);
  const teleportDestinationsRaw = shouldReadTeleportDestinations ? await readJson(teleportDestinationsPath) : undefined;
  const teleportDestinations = teleportDestinationsRaw
    ? TeleportDestinationsSchema.parse(teleportDestinationsRaw)
    : undefined;
  const encountersFile = manifest.files.encounters ?? DEFAULT_ENCOUNTERS_FILE;
  const encountersPath = path.join(out, encountersFile);
  const shouldReadEncounters = Boolean(manifest.files.encounters) || existsSync(encountersPath);
  const encountersRaw = shouldReadEncounters ? await readJson(encountersPath) : undefined;
  const encounters = encountersRaw ? EncountersSchema.parse(encountersRaw) : undefined;
  const battleFile = manifest.files.battle ?? "battle.json";
  const battlePath = path.join(out, battleFile);
  const battleRaw = existsSync(battlePath) ? await readJson(battlePath) : undefined;
  const battle = battleRaw ? BattleDataSchema.parse(battleRaw) : undefined;
  const fontFile = manifest.files.font ?? "font.json";
  const fontPath = path.join(out, fontFile);
  const shouldReadFont = Boolean(manifest.files.font) || existsSync(fontPath);
  const fontRaw = shouldReadFont ? await readJson(fontPath) : undefined;
  const font = fontRaw ? FontCollectionSchema.parse(fontRaw) : undefined;
  const windowFile = manifest.files.window ?? DEFAULT_WINDOW_FILE;
  const windowPath = path.join(out, windowFile);
  const shouldReadWindow = Boolean(manifest.files.window) || existsSync(windowPath);
  const windowRaw = shouldReadWindow ? await readJson(windowPath) : undefined;
  const window = windowRaw ? WindowCollectionSchema.parse(windowRaw) : undefined;
  const characterFile = manifest.files.characters ?? DEFAULT_CHARACTERS_FILE;
  const characterPath = path.join(out, characterFile);
  const shouldReadCharacters = Boolean(manifest.files.characters) || existsSync(characterPath);
  const charactersRaw = shouldReadCharacters ? await readJson(characterPath) : undefined;
  const characters = charactersRaw ? CharacterCollectionSchema.parse(charactersRaw) : undefined;
  const itemFile = manifest.files.items ?? DEFAULT_ITEMS_FILE;
  const itemPath = path.join(out, itemFile);
  const shouldReadItems = Boolean(manifest.files.items) || existsSync(itemPath);
  const itemsRaw = shouldReadItems ? await readJson(itemPath) : undefined;
  const items = itemsRaw ? ItemCollectionSchema.parse(itemsRaw) : undefined;
  const psiFile = manifest.files.psi ?? DEFAULT_PSI_FILE;
  const psiPath = path.join(out, psiFile);
  const shouldReadPsi = Boolean(manifest.files.psi) || existsSync(psiPath);
  const psiRaw = shouldReadPsi ? await readJson(psiPath) : undefined;
  const psi = psiRaw ? PsiCollectionSchema.parse(psiRaw) : undefined;
  const shopFile = manifest.files.shops ?? DEFAULT_SHOPS_FILE;
  const shopPath = path.join(out, shopFile);
  const shouldReadShops = Boolean(manifest.files.shops) || existsSync(shopPath);
  const shopsRaw = shouldReadShops ? await readJson(shopPath) : undefined;
  const shops = shopsRaw ? ShopDataSchema.parse(shopsRaw) : undefined;

  assertNoPublicPathLeaks({
    "manifest.json": manifestRaw,
    [manifest.files.scripts]: scriptsRaw,
    [manifest.files.npcs]: npcsRaw,
    [manifest.files.spriteGroups]: spriteGroupsRaw,
    [manifest.files.tutorialStatus]: tutorialStatusRaw,
    [manifest.files.validationReport]: validationReportRaw,
    [manifest.files.world]: worldRaw,
    [manifest.files.sprites]: spritesRaw,
    ...(teleportDestinationsRaw ? { [teleportDestinationsFile]: teleportDestinationsRaw } : {}),
    ...(encountersRaw ? { [encountersFile]: encountersRaw } : {}),
    ...(battleRaw ? { [battleFile]: battleRaw } : {}),
    ...(fontRaw ? { [fontFile]: fontRaw } : {}),
    ...(windowRaw ? { [windowFile]: windowRaw } : {}),
    ...(charactersRaw ? { [characterFile]: charactersRaw } : {}),
    ...(itemsRaw ? { [itemFile]: itemsRaw } : {}),
    ...(psiRaw ? { [psiFile]: psiRaw } : {}),
    ...(shopsRaw ? { [shopFile]: shopsRaw } : {})
  });

  const worldAssetsChecked = assertWorldAssetsExist(out, world, sprites);
  const battleAssetsChecked = battle ? assertBattleAssetsExist(out, battle) : 0;
  const fontAssetsChecked = font ? assertFontAssetsExist(out, font) : 0;
  const windowAssetsChecked = window ? assertWindowAssetsExist(out, window) : 0;

  return {
    ok: true,
    manifest: "valid",
    generatedFiles: [
      "manifest.json",
      manifest.files.scripts,
      manifest.files.npcs,
      manifest.files.spriteGroups,
      manifest.files.tutorialStatus,
      manifest.files.validationReport,
      manifest.files.world,
      manifest.files.sprites,
      ...(teleportDestinations ? [teleportDestinationsFile] : []),
      ...(encounters ? [encountersFile] : []),
      ...(battle ? [battleFile] : []),
      ...(font ? [fontFile] : []),
      ...(window ? [windowFile] : []),
      ...(characters ? [characterFile] : []),
      ...(items ? [itemFile] : []),
      ...(psi ? [psiFile] : []),
      ...(shops ? [shopFile] : [])
    ],
    counts: manifest.counts,
    validation: validationReport.counts,
    tutorial: tutorialStatus.counts,
    scriptFiles: scripts.counts.files,
    npcReferences: npcs.counts.references,
    spriteImages: spriteGroups.counts.images,
    worldAvailable: world.available,
    worldNpcs: world.counts.npcs,
    spriteSheets: sprites.counts.sheets,
    worldAssetsChecked,
    ...(teleportDestinations ? {
      teleportDestinations: teleportDestinations.counts.destinations
    } : {}),
    ...(encounters ? {
      encounterSectors: encounters.counts.sectors,
      encounterEnemyGroups: encounters.counts.enemyGroups
    } : {}),
    ...(battle ? {
      battleEnemies: battle.counts.enemies,
      battleGroups: battle.counts.groups,
      battleAssetsChecked
    } : {}),
    ...(font ? {
      fontSheets: font.fonts.length,
      fontGlyphs: font.fonts.reduce((total, sheet) => total + sheet.glyphCount, 0),
      fontAssetsChecked
    } : {}),
    ...(window ? {
      windowFlavors: window.flavors.length,
      windowAssetsChecked
    } : {}),
    ...(characters ? {
      characters: characters.counts.characters,
      characterStatFieldsPopulated: characters.counts.statFieldsPopulated
    } : {}),
    ...(items ? {
      items: items.counts.items,
      equippableItems: items.counts.equippable
    } : {}),
    ...(psi ? {
      psi: psi.counts.psi,
      psiLearnedByEntries: psi.counts.learnedBy
    } : {}),
    ...(shops ? {
      shops: shops.counts.shops,
      shopItemEntries: shops.counts.entries
    } : {})
  };
}

function assertWorldAssetsExist(
  out: string,
  world: {
    available: boolean;
    images?: { background: string; foreground: string };
    chunks?: Array<{ background: string | null; foreground: string | null }>;
  },
  sprites: { sheets: Array<{ file: string }> }
): number {
  if (!world.available) {
    return 0;
  }
  const assetPaths = [
    ...(world.images ? [world.images.background, world.images.foreground] : []),
    ...(world.chunks ? world.chunks.flatMap((chunk) => [chunk.background, chunk.foreground].filter((item): item is string => item !== null)) : []),
    ...sprites.sheets.map((sheet) => sheet.file)
  ];
  for (const assetPath of assetPaths) {
    assertLocalAssetExists(out, assetPath, "missing_world_asset", "world/sprites JSON references a missing local asset");
  }
  return assetPaths.length;
}

function assertBattleAssetsExist(
  out: string,
  battle: {
    assetLayout: { spriteDir: string; backgroundDir: string };
    enemies: Array<{ spriteId: number }>;
    groups: Array<{ background1: number; background2: number }>;
  }
): number {
  const assetPaths = new Set<string>();
  for (const enemy of battle.enemies) {
    assetPaths.add(`${battle.assetLayout.spriteDir}/${pad3(enemy.spriteId)}.png`);
  }
  for (const group of battle.groups) {
    assetPaths.add(`${battle.assetLayout.backgroundDir}/${pad3(group.background1)}.png`);
    assetPaths.add(`${battle.assetLayout.backgroundDir}/${pad3(group.background2)}.png`);
  }
  for (const assetPath of assetPaths) {
    assertLocalAssetExists(out, assetPath, "missing_battle_asset", "battle JSON references a missing local asset");
  }
  return assetPaths.size;
}

function assertFontAssetsExist(out: string, font: { fonts: Array<{ file: string }> }): number {
  for (const sheet of font.fonts) {
    assertLocalAssetExists(out, sheet.file, "missing_font_asset", "font JSON references a missing local asset");
  }
  return font.fonts.length;
}

function assertWindowAssetsExist(out: string, window: { flavors: Array<{ file: string }> }): number {
  for (const flavor of window.flavors) {
    assertLocalAssetExists(out, flavor.file, "missing_window_asset", "window JSON references a missing local asset");
  }
  return window.flavors.length;
}

function assertLocalAssetExists(out: string, assetPath: string, code: string, message: string): void {
  if (assetPath.includes("..") || path.isAbsolute(assetPath)) {
    throw new Error(JSON.stringify({
      severity: "error",
      code: "unsafe_asset_path",
      message: `Generated asset path escapes the generated directory: ${assetPath}`,
      path: assetPath
    }));
  }
  if (!existsSync(path.join(out, assetPath))) {
    throw new Error(JSON.stringify({
      severity: "error",
      code,
      message: `${message}: ${assetPath}`,
      path: assetPath
    }));
  }
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

function assertNoPublicPathLeaks(files: Record<string, unknown>): void {
  const unsafePatterns = [
    { code: "absolute_user_path", pattern: /\/Users\// },
    { code: "rom_extension_path", pattern: /\.(sfc|smc)\b/i },
    { code: "concrete_rom_filename", pattern: /EarthBound\s*\(USA\)/i }
  ];

  for (const [file, value] of Object.entries(files)) {
    const text = JSON.stringify(value);
    const matched = unsafePatterns.find((item) => item.pattern.test(text));
    if (matched) {
      throw new Error(JSON.stringify({
        severity: "error",
        code: matched.code,
        message: `Generated public JSON contains unsafe path or ROM reference in ${file}.`,
        path: file
      }));
    }
  }
}

async function main(): Promise<void> {
  const result = await validateGeneratedOutput(parseOut(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

function resolveFromRoot(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.env.INIT_CWD ?? findWorkspaceRoot(process.cwd()), inputPath);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const parsedError = parseValidationError(error);
    console.error(JSON.stringify({
      ok: false,
      errors: [parsedError]
    }, null, 2));
    process.exitCode = 1;
  });
}

function parseValidationError(error: unknown): { severity: "error"; code: string; message: string; path?: string } {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.code === "missing_manifest") {
        return parsed;
      }
      if (parsed?.severity === "error" && typeof parsed.code === "string") {
        return parsed;
      }
    } catch {
      // Fall through to schema/JSON error reporting.
    }
    return { severity: "error", code: "invalid_generated_json", message: error.message };
  }
  return { severity: "error", code: "invalid_generated_json", message: String(error) };
}
