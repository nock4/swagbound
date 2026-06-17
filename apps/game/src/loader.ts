import {
  buildDialoguePages,
  ADDED_NPC_MIN_ID,
  AddedNpcsSchema,
  BattleDataSchema,
  CharacterCollectionSchema,
  CustomDialogueSchema,
  EncountersSchema,
  FontCollectionSchema,
  ItemCollectionSchema,
  ManifestSchema,
  NpcReferenceCollectionSchema,
  PsiCollectionSchema,
  resolveScriptReference,
  resolveScriptReferenceFlow,
  ScriptCollectionSchema,
  ShopDataSchema,
  SwagboundDialogueLibrarySchema,
  SpriteGroupCollectionSchema,
  SpriteSheetCollectionSchema,
  TeleportDestinationsSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  WindowCollectionSchema,
  WorldArtifactSchema,
  type DialoguePage,
  type AddedNpc,
  type AddedNpcs,
  type BattleData,
  type CharacterCollection,
  type CustomDialogue,
  type Encounters,
  type FontCollection,
  type ItemCollection,
  type Manifest,
  type NumericFlagState,
  type NpcReferenceCollection,
  type PsiCollection,
  type ScriptCollection,
  type ShopData,
  type SwagboundDialogueLibrary,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TeleportDestinations,
  type TutorialStatus,
  type ValidationReport,
  type WindowCollection,
  type WorldArtifact,
  type WorldChunkedNpc
} from "@eb/schemas";

export const TARGET_REFERENCE = "robot.hello_world";
const ADDED_NPCS_FILE = "added-npcs.json";
const CUSTOM_DIALOGUE_FILE = "custom-dialogue.json";
const SWAGBOUND_DIALOGUE_LIBRARY_FILE = "swagbound-dialogue-library.json";

export type GameData = {
  manifest: Manifest;
  scripts?: ScriptCollection;
  npcs?: NpcReferenceCollection;
  addedNpcs: AddedNpcs;
  customDialogue: CustomDialogue;
  dialogueLibrary: SwagboundDialogueLibrary;
  spriteGroups?: SpriteGroupCollection;
  tutorialStatus?: TutorialStatus;
  validationReport?: ValidationReport;
  world?: WorldArtifact;
  sprites?: SpriteSheetCollection;
  teleportDestinations?: TeleportDestinations;
  encounters?: Encounters;
  battle?: BattleData;
  font?: FontCollection;
  window?: WindowCollection;
  characters?: CharacterCollection;
  items?: ItemCollection;
  psi?: PsiCollection;
  shops?: ShopData;
};

export type AddedWorldChunkedNpc = WorldChunkedNpc & {
  addedNpc: true;
  addedInteraction?: AddedNpc["interaction"];
};

async function loadJson<T>(url: string, schema: { parse: (value: unknown) => T }): Promise<T | undefined> {
  try {
    const response = await fetch(url);
    return schema.parse(await response.json());
  } catch {
    return undefined;
  }
}

function emptyCustomDialogue(): CustomDialogue {
  return {
    schema: "swagbound.custom-dialogue.v1",
    byNpcId: {},
    byTextPointer: {}
  };
}

function emptyAddedNpcs(): AddedNpcs {
  return {
    schema: "swagbound.added-npcs.v1",
    npcs: []
  };
}

function emptyDialogueLibrary(): SwagboundDialogueLibrary {
  return {
    schema: "swagbound.dialogue-library.v1",
    generatedFrom: "empty generated dialogue library fallback",
    entries: {}
  };
}

/** Loads every generated file referenced by an already-validated manifest. */
export async function loadGameData(manifest: Manifest): Promise<GameData> {
  const [
    scripts,
    npcs,
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    teleportDestinations,
    encounters,
    battle,
    font,
    window,
    characters,
    items,
    psi,
    shops,
    addedNpcs,
    customDialogue,
    dialogueLibrary
  ] = await Promise.all([
    loadJson(`/generated/${manifest.files.scripts}`, ScriptCollectionSchema),
    loadJson(`/generated/${manifest.files.npcs}`, NpcReferenceCollectionSchema),
    loadJson(`/generated/${manifest.files.spriteGroups}`, SpriteGroupCollectionSchema),
    loadJson(`/generated/${manifest.files.tutorialStatus}`, TutorialStatusSchema),
    loadJson(`/generated/${manifest.files.validationReport}`, ValidationReportSchema),
    loadJson(`/generated/${manifest.files.world}`, WorldArtifactSchema),
    loadJson(`/generated/${manifest.files.sprites}`, SpriteSheetCollectionSchema),
    manifest.files.teleportDestinations
      ? loadJson(`/generated/${manifest.files.teleportDestinations}`, TeleportDestinationsSchema)
      : Promise.resolve(undefined),
    manifest.files.encounters
      ? loadJson(`/generated/${manifest.files.encounters}`, EncountersSchema)
      : Promise.resolve(undefined),
    manifest.files.battle
      ? loadJson(`/generated/${manifest.files.battle}`, BattleDataSchema)
      : Promise.resolve(undefined),
    manifest.files.font
      ? loadJson(`/generated/${manifest.files.font}`, FontCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.window
      ? loadJson(`/generated/${manifest.files.window}`, WindowCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.characters
      ? loadJson(`/generated/${manifest.files.characters}`, CharacterCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.items
      ? loadJson(`/generated/${manifest.files.items}`, ItemCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.psi
      ? loadJson(`/generated/${manifest.files.psi}`, PsiCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.shops
      ? loadJson(`/generated/${manifest.files.shops}`, ShopDataSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${ADDED_NPCS_FILE}`, AddedNpcsSchema),
    loadJson(`/generated/${CUSTOM_DIALOGUE_FILE}`, CustomDialogueSchema),
    loadJson(`/generated/${SWAGBOUND_DIALOGUE_LIBRARY_FILE}`, SwagboundDialogueLibrarySchema)
  ]);
  return {
    manifest,
    scripts,
    npcs,
    addedNpcs: addedNpcs ?? emptyAddedNpcs(),
    customDialogue: customDialogue ?? emptyCustomDialogue(),
    dialogueLibrary: dialogueLibrary ?? emptyDialogueLibrary(),
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    teleportDestinations,
    encounters,
    battle,
    font,
    window,
    characters,
    items,
    psi,
    shops
  };
}

export function addedNpcSpawnEligible(
  addedNpc: Pick<AddedNpc, "id">,
  existingNpcs: readonly Pick<WorldChunkedNpc, "npcId">[]
): boolean {
  return addedNpc.id >= ADDED_NPC_MIN_ID && !existingNpcs.some((npc) => npc.npcId === addedNpc.id);
}

export function isAddedWorldChunkedNpc(npc: WorldChunkedNpc | AddedWorldChunkedNpc): npc is AddedWorldChunkedNpc {
  return (npc as Partial<AddedWorldChunkedNpc>).addedNpc === true;
}

export function buildAddedWorldNpcs(
  addedNpcs: AddedNpcs | undefined,
  existingNpcs: readonly Pick<WorldChunkedNpc, "npcId">[]
): AddedWorldChunkedNpc[] {
  const seenIds = new Set(existingNpcs.map((npc) => npc.npcId));
  const result: AddedWorldChunkedNpc[] = [];
  for (const npc of addedNpcs?.npcs ?? []) {
    if (npc.id < ADDED_NPC_MIN_ID || seenIds.has(npc.id)) {
      continue;
    }
    seenIds.add(npc.id);
    result.push({
      npcId: npc.id,
      spriteGroup: npc.spriteGroup,
      direction: npc.facing,
      type: "added-npc",
      movement: 0,
      showSprite: "always",
      interactable: npc.interaction !== undefined,
      visible: true,
      worldPixel: { ...npc.worldPixel },
      addedNpc: true,
      ...(npc.interaction ? { addedInteraction: { ...npc.interaction } } : {})
    });
  }
  return result;
}

export function parseManifest(raw: unknown): Manifest | undefined {
  const result = ManifestSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}

export function chooseReference(data: GameData): string {
  if (hasNpcReference(data.npcs, TARGET_REFERENCE)) {
    return TARGET_REFERENCE;
  }
  if (data.scripts && resolveScriptReference(data.scripts, TARGET_REFERENCE)) {
    return TARGET_REFERENCE;
  }
  return data.npcs?.references[0]?.reference ?? TARGET_REFERENCE;
}

export function buildDialogueForReference(
  scripts: ScriptCollection | undefined,
  reference: string,
  flags?: NumericFlagState
): DialoguePage[] {
  if (!scripts) {
    return [{ text: "Generated scripts.json could not be loaded.", ended: true, unknownCommands: [] }];
  }
  const resolved = resolveScriptReferenceFlow(scripts, reference, flags ? { flags } : {});
  if (!resolved) {
    return [{ text: "No imported script text was found.", ended: true, unknownCommands: [] }];
  }
  return buildDialoguePages(resolved.commands);
}

export function buildInlineDialoguePages(pages: readonly string[]): DialoguePage[] {
  return pages.map((text, index) => ({
    text,
    ended: index + 1 >= pages.length,
    unknownCommands: [],
    segments: [{ kind: "text" as const, value: text }]
  }));
}

export function hasNpcReference(npcs: NpcReferenceCollection | undefined, reference: string): boolean {
  return Boolean(npcs?.references.some((item) => item.reference === reference));
}

export function resolveStatus(data: GameData): string {
  const scriptResolved = data.scripts ? Boolean(resolveScriptReference(data.scripts, TARGET_REFERENCE)) : false;
  const npcResolved = hasNpcReference(data.npcs, TARGET_REFERENCE);
  if (scriptResolved && npcResolved) {
    return "script + npc ref";
  }
  if (scriptResolved) {
    return "script only";
  }
  if (npcResolved) {
    return "npc ref only";
  }
  return "missing";
}

export function buildStatusLines(data: GameData): string[] {
  const manifest = data.manifest;
  const world = data.world;
  const worldLine = world?.available && "mode" in world && world.mode === "full"
    ? `World: full ${world.mapWidthTiles}x${world.mapHeightTiles} tiles | chunks: ${world.counts.chunksWritten}/${world.counts.chunks} | NPCs: ${world.counts.visibleNpcs}/${world.counts.npcs}`
    : world?.available && !("mode" in world) && world.region
    ? `World: ${world.region.widthTiles}x${world.region.heightTiles} tiles @ (${world.region.originTile.x},${world.region.originTile.y}) | NPCs: ${world.counts.visibleNpcs}/${world.counts.npcs}`
    : "World: unavailable (run pnpm convert with the local fixture)";
  return [
    statusPanelTitle(data),
    `Project: ${manifest.sourceProject.exists ? "found" : "missing"} | Project.snake: ${manifest.sourceProject.hasProjectSnake ? "found" : "missing"}`,
    `Scripts: ${manifest.counts.scriptFiles} files, ${manifest.counts.scriptCommands} commands`,
    `Labels: ${manifest.counts.labels} | Text: ${manifest.counts.textCommands} | Unknown: ${manifest.counts.unknownCommands}`,
    `NPC refs: ${manifest.counts.npcReferences} | robot.hello_world: ${resolveStatus(data)}`,
    worldLine,
    `Tutorial: ${tutorialSummary(data.tutorialStatus)}`,
    `Validation issues: ${data.validationReport?.issues.length ?? manifest.counts.warnings + manifest.counts.errors}`
  ];
}

export function statusPanelTitle(data: GameData): string {
  const manifest = data.manifest as { title?: unknown; name?: unknown };
  const world = data.world as { title?: unknown; name?: unknown } | undefined;
  return firstText(world?.title, manifest.title, world?.name, manifest.name) ?? "Game Status";
}

export function buildMetadataLines(data: GameData): string[] {
  const spriteGroups = data.spriteGroups;
  const sprite005 = spriteGroups?.images.find((image) => image.path === "SpriteGroups/005.png");
  return [
    "Imported Asset Pipeline",
    `Sprite PNGs indexed: ${spriteGroups?.counts.images ?? 0}`,
    `SpriteGroups/005.png: ${sprite005 ? "detected" : "not detected"}`,
    `Sheets copied: ${data.sprites?.counts.sheets ?? 0}`,
    `Font data: ${data.font ? `${data.font.fonts.length} sheets` : "not loaded"}`,
    `Window data: ${data.window ? `${data.window.flavors.length} flavors` : "not loaded"}`,
    `World render: ${data.world?.available && "mode" in data.world && data.world.mode === "full" ? "chunked PNGs" : data.world?.available ? "background + foreground PNG" : "skipped"}`,
    "Asset rendering: local-only, gitignored"
  ];
}

export function tutorialSummary(tutorialStatus: TutorialStatus | undefined): string {
  if (!tutorialStatus) {
    return "status unavailable";
  }
  const counts = tutorialStatus.counts;
  return `${counts.passed}/${counts.steps} pass, ${counts.failed} gaps, ${counts.blocked} blocked`;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
