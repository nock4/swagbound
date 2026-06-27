import {
  buildDialoguePages,
  ADDED_NPC_MIN_ID,
  AddedNpcsSchema,
  BattleDataSchema,
  BattleRulesSchema,
  BackgroundOverridesSchema,
  CharacterCollectionSchema,
  CharacterOverridesSchema,
  CustomDialogueSchema,
  DrifellaBarksSchema,
  EnemyOverridesSchema,
  EnemyStatOverridesSchema,
  EncountersSchema,
  FontCollectionSchema,
  ItemCollectionSchema,
  ItemOverridesSchema,
  ManifestSchema,
  MusicManifestSchema,
  NpcOverridesSchema,
  NpcReferenceCollectionSchema,
  OpeningCutsceneSchema,
  PsiCollectionSchema,
  PsiOverridesSchema,
  resolveScriptReference,
  resolveScriptReferenceFlow,
  ScriptCollectionSchema,
  ShopDataSchema,
  SpriteOverridesSchema,
  SwagboundDialogueLibrarySchema,
  StoryTriggersSchema,
  CutscenesSchema,
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
  type BackgroundOverrides,
  type BattleData,
  type BattleRules,
  type CharacterCollection,
  type CharacterOverrides,
  type CustomDialogue,
  type DrifellaBarks,
  type EnemyOverrides,
  type EnemyStatOverrides,
  type Encounters,
  type FontCollection,
  type ItemCollection,
  type ItemOverrides,
  type Manifest,
  type MusicManifest,
  type NpcOverrides,
  type NumericFlagState,
  type NpcReferenceCollection,
  type OpeningCutscene,
  type Cutscenes,
  type PsiCollection,
  type PsiOverrides,
  type ScriptCollection,
  type ShopData,
  type SpriteOverrides,
  type SwagboundDialogueLibrary,
  type StoryTriggers,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TeleportDestinations,
  type TutorialStatus,
  type ValidationReport,
  type WindowCollection,
  type WorldArtifact,
  type WorldChunkedNpc
} from "@eb/schemas";
import {
  GENERATED_DRIFELLA_BARK_SOURCE,
  type RuntimeCustomDialogue
} from "./customDialogueLookup";
import { drifellaBarkForNpcId } from "./drifellaBarks";

export const TARGET_REFERENCE = "robot.hello_world";
const ADDED_NPCS_FILE = "added-npcs.json";
const CUSTOM_DIALOGUE_FILE = "custom-dialogue.json";
const SWAGBOUND_DIALOGUE_LIBRARY_FILE = "swagbound-dialogue-library.json";
const SPRITE_OVERRIDES_FILE = "sprite-overrides.json";
const NPC_OVERRIDES_FILE = "npc-overrides.json";
const BACKGROUND_OVERRIDES_FILE = "background-overrides.json";
const ITEM_OVERRIDES_FILE = "item-overrides.json";
const CHARACTER_OVERRIDES_FILE = "character-overrides.json";
const PSI_OVERRIDES_FILE = "psi-overrides.json";
const ENEMY_OVERRIDES_FILE = "enemy-overrides.json";
const ENEMY_STAT_OVERRIDES_FILE = "enemy-stat-overrides.json";
const BATTLE_RULES_FILE = "battle-rules.json";
const STORY_TRIGGERS_FILE = "triggers.json";
const MUSIC_MANIFEST_FILE = "music-manifest.json";
const DRIFELLA_BARKS_FILE = "drifella-barks.json";
const OPENING_CUTSCENE_FILE = "opening-cutscene.json";
const CUTSCENES_FILE = "cutscenes.json";

export type GameData = {
  manifest: Manifest;
  scripts?: ScriptCollection;
  npcs?: NpcReferenceCollection;
  addedNpcs: AddedNpcs;
  customDialogue: RuntimeCustomDialogue;
  drifellaBarks: DrifellaBarks;
  dialogueLibrary: SwagboundDialogueLibrary;
  openingCutscene?: OpeningCutscene;
  cutscenes?: Cutscenes;
  storyTriggers?: StoryTriggers;
  spriteGroups?: SpriteGroupCollection;
  tutorialStatus?: TutorialStatus;
  validationReport?: ValidationReport;
  world?: WorldArtifact;
  sprites?: SpriteSheetCollection;
  spriteOverrides?: SpriteOverrides;
  npcOverrides: NpcOverrides;
  backgroundOverrides?: BackgroundOverrides;
  teleportDestinations?: TeleportDestinations;
  encounters?: Encounters;
  battle?: BattleData;
  battleRules?: BattleRules;
  musicManifest?: MusicManifest;
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

function emptyDrifellaBarks(): DrifellaBarks {
  return {
    schema: "swagbound.drifella-barks.v1",
    phrases: []
  };
}

function emptyNpcOverrides(): NpcOverrides {
  return {
    schema: "swagbound.npc-overrides.v1",
    byNpcId: {}
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
    spriteOverrides,
    npcOverrides,
    backgroundOverrides,
    teleportDestinations,
    encounters,
    battle,
    battleRules,
    enemyOverrides,
    enemyStatOverrides,
    font,
    window,
    characters,
    characterOverrides,
    items,
    itemOverrides,
    psi,
    psiOverrides,
    shops,
    addedNpcs,
    customDialogue,
    dialogueLibrary,
    storyTriggers,
    musicManifest,
    drifellaBarks,
    openingCutscene,
    cutscenes
  ] = await Promise.all([
    loadJson(`/generated/${manifest.files.scripts}`, ScriptCollectionSchema),
    loadJson(`/generated/${manifest.files.npcs}`, NpcReferenceCollectionSchema),
    loadJson(`/generated/${manifest.files.spriteGroups}`, SpriteGroupCollectionSchema),
    loadJson(`/generated/${manifest.files.tutorialStatus}`, TutorialStatusSchema),
    loadJson(`/generated/${manifest.files.validationReport}`, ValidationReportSchema),
    loadJson(`/generated/${manifest.files.world}`, WorldArtifactSchema),
    loadJson(`/generated/${manifest.files.sprites}`, SpriteSheetCollectionSchema),
    loadJson(`/generated/${SPRITE_OVERRIDES_FILE}`, SpriteOverridesSchema),
    loadJson(`/generated/${NPC_OVERRIDES_FILE}`, NpcOverridesSchema),
    loadJson(`/generated/${BACKGROUND_OVERRIDES_FILE}`, BackgroundOverridesSchema),
    manifest.files.teleportDestinations
      ? loadJson(`/generated/${manifest.files.teleportDestinations}`, TeleportDestinationsSchema)
      : Promise.resolve(undefined),
    manifest.files.encounters
      ? loadJson(`/generated/${manifest.files.encounters}`, EncountersSchema)
      : Promise.resolve(undefined),
    manifest.files.battle
      ? loadJson(`/generated/${manifest.files.battle}`, BattleDataSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${BATTLE_RULES_FILE}`, BattleRulesSchema),
    loadJson(`/generated/${ENEMY_OVERRIDES_FILE}`, EnemyOverridesSchema),
    loadJson(`/generated/${ENEMY_STAT_OVERRIDES_FILE}`, EnemyStatOverridesSchema),
    manifest.files.font
      ? loadJson(`/generated/${manifest.files.font}`, FontCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.window
      ? loadJson(`/generated/${manifest.files.window}`, WindowCollectionSchema)
      : Promise.resolve(undefined),
    manifest.files.characters
      ? loadJson(`/generated/${manifest.files.characters}`, CharacterCollectionSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${CHARACTER_OVERRIDES_FILE}`, CharacterOverridesSchema),
    manifest.files.items
      ? loadJson(`/generated/${manifest.files.items}`, ItemCollectionSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${ITEM_OVERRIDES_FILE}`, ItemOverridesSchema),
    manifest.files.psi
      ? loadJson(`/generated/${manifest.files.psi}`, PsiCollectionSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${PSI_OVERRIDES_FILE}`, PsiOverridesSchema),
    manifest.files.shops
      ? loadJson(`/generated/${manifest.files.shops}`, ShopDataSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${ADDED_NPCS_FILE}`, AddedNpcsSchema),
    loadJson(`/generated/${CUSTOM_DIALOGUE_FILE}`, CustomDialogueSchema),
    loadJson(`/generated/${SWAGBOUND_DIALOGUE_LIBRARY_FILE}`, SwagboundDialogueLibrarySchema),
    loadJson(`/generated/${STORY_TRIGGERS_FILE}`, StoryTriggersSchema),
    loadJson(`/generated/${MUSIC_MANIFEST_FILE}`, MusicManifestSchema),
    loadJson(`/generated/${DRIFELLA_BARKS_FILE}`, DrifellaBarksSchema),
    loadJson(`/generated/${OPENING_CUTSCENE_FILE}`, OpeningCutsceneSchema),
    loadJson(`/generated/${CUTSCENES_FILE}`, CutscenesSchema)
  ]);
  const resolvedCharacters = applyCharacterOverrides(characters, characterOverrides);
  const resolvedItems = applyItemOverrides(items, itemOverrides);
  const resolvedPsi = applyPsiOverrides(psi, psiOverrides);
  const resolvedBattle = applyEnemyStatOverrides(applyEnemyOverrides(battle, enemyOverrides), enemyStatOverrides);
  const resolvedDrifellaBarks = drifellaBarks ?? emptyDrifellaBarks();
  const resolvedCustomDialogue = buildCustomDialogueWithDrifellaBarks(
    customDialogue ?? emptyCustomDialogue(),
    world?.npcs ?? [],
    resolvedDrifellaBarks
  );

  return {
    manifest,
    scripts,
    npcs,
    addedNpcs: addedNpcs ?? emptyAddedNpcs(),
    customDialogue: resolvedCustomDialogue,
    drifellaBarks: resolvedDrifellaBarks,
    dialogueLibrary: dialogueLibrary ?? emptyDialogueLibrary(),
    openingCutscene,
    cutscenes,
    storyTriggers,
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    spriteOverrides,
    npcOverrides: npcOverrides ?? emptyNpcOverrides(),
    backgroundOverrides,
    teleportDestinations,
    encounters,
    battle: resolvedBattle,
    battleRules,
    musicManifest,
    font,
    window,
    characters: resolvedCharacters,
    items: resolvedItems,
    psi: resolvedPsi,
    shops
  };
}

export function applyNpcOverride(npc: WorldChunkedNpc, npcOverrides: NpcOverrides | undefined): WorldChunkedNpc | undefined {
  const override = npcOverrides?.byNpcId[String(npc.npcId)];
  if (!override) {
    return npc;
  }
  if (override.hide === true) {
    return undefined;
  }
  if (!override.worldPixel) {
    return npc;
  }
  return {
    ...npc,
    worldPixel: { ...override.worldPixel }
  };
}

export function buildCustomDialogueWithDrifellaBarks(
  customDialogue: CustomDialogue,
  worldNpcs: readonly Pick<WorldChunkedNpc, "npcId">[],
  drifellaBarks: DrifellaBarks
): RuntimeCustomDialogue {
  const byNpcId: RuntimeCustomDialogue["byNpcId"] = { ...customDialogue.byNpcId };
  if (drifellaBarks.phrases.length === 0) {
    return {
      ...customDialogue,
      byNpcId,
      byTextPointer: { ...customDialogue.byTextPointer }
    };
  }
  for (const npc of worldNpcs) {
    const key = String(npc.npcId);
    if (byNpcId[key]) {
      continue;
    }
    byNpcId[key] = {
      pages: [drifellaBarkForNpcId(npc.npcId, drifellaBarks.phrases)],
      generated: { source: GENERATED_DRIFELLA_BARK_SOURCE }
    };
  }
  return {
    ...customDialogue,
    byNpcId,
    byTextPointer: { ...customDialogue.byTextPointer }
  };
}

function applyItemOverrides(items: ItemCollection | undefined, overrides: ItemOverrides | undefined): ItemCollection | undefined {
  if (!items || !overrides) {
    return items;
  }
  for (const item of items.items) {
    const override = overrides.byItemId[String(item.id)];
    if (override) {
      if (override.name) {
        item.name = override.name;
      }
      if (override.effect) {
        item.effect = override.effect;
      }
    }
  }
  return items;
}

function applyCharacterOverrides(
  characters: CharacterCollection | undefined,
  overrides: CharacterOverrides | undefined
): CharacterCollection | undefined {
  if (!characters || !overrides) {
    return characters;
  }
  for (const character of characters.characters) {
    const override = overrides.byCharId[String(character.id)];
    if (override) {
      character.name = override.name;
      if (override.startingItems) {
        character.startingItems = [...override.startingItems];
      }
    }
  }
  return characters;
}

function applyPsiOverrides(psi: PsiCollection | undefined, overrides: PsiOverrides | undefined): PsiCollection | undefined {
  if (!psi || !overrides) {
    return psi;
  }
  for (const entry of psi.psi) {
    const override = overrides.byPsiId[String(entry.id)];
    if (override) {
      if (override.name) {
        entry.name = override.name;
      }
      if (override.effect) {
        entry.effect = override.effect;
      }
    }
  }
  return psi;
}

export function applyEnemyOverrides(
  battle: BattleData | undefined,
  overrides: EnemyOverrides | undefined
): BattleData | undefined {
  if (!battle || !overrides) {
    return battle;
  }
  let changed = false;
  const enemies = battle.enemies.map((enemy) => {
    const override = overrides.byEnemyId[String(enemy.id)];
    if (!override || override.name === enemy.name) {
      return enemy;
    }
    changed = true;
    return {
      ...enemy,
      name: override.name
    };
  });
  return changed ? { ...battle, enemies } : battle;
}

const ENEMY_STAT_OVERRIDE_KEYS = ["hp", "offense", "defense", "speed"] as const;

export function applyEnemyStatOverrides(
  battle: BattleData | undefined,
  overrides: EnemyStatOverrides | undefined
): BattleData | undefined {
  if (!battle || !overrides) {
    return battle;
  }
  let changed = false;
  const enemies = battle.enemies.map((enemy) => {
    const override = overrides.byEnemyId[String(enemy.id)];
    if (!override) {
      return enemy;
    }
    let next = enemy;
    for (const key of ENEMY_STAT_OVERRIDE_KEYS) {
      const value = override[key];
      if (value !== undefined && value !== next[key]) {
        if (next === enemy) {
          next = { ...enemy };
        }
        next[key] = value;
        changed = true;
      }
    }
    return next;
  });
  return changed ? { ...battle, enemies } : battle;
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
