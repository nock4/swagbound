import {
  buildDialoguePages,
  ADDED_NPC_MIN_ID,
  sanitizeAddedNpcs,
  ArchivistSpotsSchema,
  AttestationBattlesSchema,
  BattleDataSchema,
  BattleRulesSchema,
  BackgroundOverridesSchema,
  CardNftsSchema,
  CharacterCollectionSchema,
  CharacterOverridesSchema,
  CondimentPairsSchema,
  CustomDialogueSchema,
  DrifellaBarksSchema,
  DrifellaSourceChecksSchema,
  EarlyGameSequenceSchema,
  EnemyActionEffectsSchema,
  EnemyOverridesSchema,
  EnemyStatOverridesSchema,
  EncountersSchema,
  FgOverridesSchema,
  FontCollectionSchema,
  ItemCollectionSchema,
  ItemOverridesSchema,
  KeyItemsSchema,
  ManifestSchema,
  MusicManifestSchema,
  NavmeshSchema,
  NpcMovementPatternsSchema,
  SectorMusicSchema,
  CollisionOverridesSchema,
  NpcOverridesSchema,
  NpcReferenceCollectionSchema,
  ObjectivesSchema,
  OpeningClaritySchema,
  OpeningCutsceneSchema,
  OverworldInteractablesSchema,
  PsiCollectionSchema,
  PsiOverridesSchema,
  RoamerZoneCapsSchema,
  resolveScriptReference,
  resolveScriptReferenceFlow,
  ScriptCollectionSchema,
  ShopDataSchema,
  SpriteOverridesSchema,
  FlagMapSchema,
  StoryItemsSchema,
  SwagboundDialogueLibrarySchema,
  StoryTriggersSchema,
  TimedDeliveriesSchema,
  CutscenesSchema,
  SpriteGroupCollectionSchema,
  SpriteSheetCollectionSchema,
  TeleportDestinationsSchema,
  TutorialStatusSchema,
  UsabilityMatrixSchema,
  ValidationReportSchema,
  WindowCollectionSchema,
  WorldArtifactSchema,
  type DialoguePage,
  type AddedNpc,
  type AddedNpcs,
  type ArchivistSpots,
  type AttestationBattles,
  type BackgroundOverrides,
  type BattleData,
  type BattleRules,
  type CardNfts,
  type CharacterCollection,
  type CharacterOverrides,
  type CondimentPairs,
  type CustomDialogue,
  type DrifellaBarks,
  type DrifellaSourceChecks,
  type EarlyGameSequence,
  type EnemyActionEffects,
  type EnemyOverrides,
  type EnemyStatOverrides,
  type Encounters,
  type FgOverrides,
  type FontCollection,
  type ItemCollection,
  type ItemOverrides,
  type KeyItems,
  type Manifest,
  type MusicManifest,
  type Navmesh,
  type NpcMovementPatterns,
  type SectorMusic,
  type CollisionOverrides,
  type NpcOverrides,
  type NumericFlagState,
  type NpcReferenceCollection,
  type Objectives,
  type OpeningCutscene,
  type OverworldInteractables,
  type Cutscenes,
  type PsiCollection,
  type PsiOverrides,
  type RoamerZoneCaps,
  type ScriptCollection,
  type ShopData,
  type SpriteOverrides,
  type FlagMap,
  type StoryItems,
  type SwagboundDialogueLibrary,
  type StoryTriggers,
  type TimedDeliveries,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TeleportDestinations,
  type TutorialStatus,
  type UsabilityMatrix,
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
import {
  applyOpeningClarityBattle,
  applyOpeningClarityCutscenes,
  applyOpeningClarityDialogue,
  applyOpeningClarityObjectives,
  applyOpeningClaritySprites,
  applyOpeningClarityStoryTriggers
} from "./openingClarity";
import { suppressOwnedOpeningClarity } from "./earlyGameSequence";

export const TARGET_REFERENCE = "robot.hello_world";
const ADDED_NPCS_FILE = "added-npcs.json";
const CUSTOM_DIALOGUE_FILE = "custom-dialogue.json";
const SWAGBOUND_DIALOGUE_LIBRARY_FILE = "swagbound-dialogue-library.json";
const SPRITE_OVERRIDES_FILE = "sprite-overrides.json";
const NPC_OVERRIDES_FILE = "npc-overrides.json";
const NPC_MOVEMENT_PATTERNS_FILE = "npc-movement-patterns.json";
const BACKGROUND_OVERRIDES_FILE = "background-overrides.json";
const ITEM_OVERRIDES_FILE = "item-overrides.json";
const CONDIMENT_PAIRS_FILE = "condiment-pairs.json";
const KEY_ITEMS_FILE = "key-items.json";
const STORY_ITEMS_FILE = "story-items.json";
const FLAG_MAP_FILE = "flag-map.json";
const TIMED_DELIVERY_FILE = "timed-delivery.json";
const USABILITY_MATRIX_FILE = "usability-matrix.json";
const CHARACTER_OVERRIDES_FILE = "character-overrides.json";
const PSI_OVERRIDES_FILE = "psi-overrides.json";
const ENEMY_OVERRIDES_FILE = "enemy-overrides.json";
const ENEMY_STAT_OVERRIDES_FILE = "enemy-stat-overrides.json";
const ENEMY_ACTION_EFFECTS_FILE = "enemy-action-effects.json";
const BATTLE_RULES_FILE = "battle-rules.json";
const ROAMER_ZONE_CAPS_FILE = "roamer-zone-caps.json";
const STORY_TRIGGERS_FILE = "triggers.json";
const MUSIC_MANIFEST_FILE = "music-manifest.json";
const SECTOR_MUSIC_FILE = "sector-music.json";
const COLLISION_OVERRIDES_FILE = "collision-overrides.json";
const EARLY_GAME_SEQUENCE_FILE = "early-game-sequence.json";
const FG_OVERRIDES_FILE = "fg-overrides.json";
const NAVMESH_FILE = "navmesh.json";
const DRIFELLA_BARKS_FILE = "drifella-barks.json";
const ARCHIVIST_SPOTS_FILE = "archivist-spots.json";
const OPENING_CUTSCENE_FILE = "opening-cutscene.json";
const CUTSCENES_FILE = "cutscenes.json";
const OVERWORLD_INTERACTABLES_FILE = "overworld-interactables.json";
const CARD_NFTS_FILE = "card-nfts.json";
const DRIFELLA_SOURCE_CHECKS_FILE = "drifella-source-checks.json";
const ATTESTATION_BATTLES_FILE = "attestation-battles.json";
const OBJECTIVES_FILE = "objectives.json";
const OPENING_CLARITY_FILE = "opening-clarity.json";
const NARRATIVE_REDESIGN_FILE = "narrative-redesign.json";

export type GameData = {
  manifest: Manifest;
  scripts?: ScriptCollection;
  npcs?: NpcReferenceCollection;
  addedNpcs: AddedNpcs;
  customDialogue: RuntimeCustomDialogue;
  drifellaBarks: DrifellaBarks;
  archivistSpots: ArchivistSpots;
  dialogueLibrary: SwagboundDialogueLibrary;
  overworldInteractables: OverworldInteractables;
  cardNfts: CardNfts;
  sourceChecks: DrifellaSourceChecks;
  attestationBattles: AttestationBattles;
  objectives?: Objectives;
  earlyGameSequence: EarlyGameSequence;
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
  npcMovementPatterns: NpcMovementPatterns;
  backgroundOverrides?: BackgroundOverrides;
  teleportDestinations?: TeleportDestinations;
  encounters?: Encounters;
  battle?: BattleData;
  battleRules?: BattleRules;
  roamerZoneCaps?: RoamerZoneCaps;
  enemyActionEffects?: EnemyActionEffects;
  musicManifest?: MusicManifest;
  sectorMusic?: SectorMusic;
  collisionOverrides?: CollisionOverrides;
  fgOverrides?: FgOverrides;
  navmesh?: Navmesh;
  font?: FontCollection;
  window?: WindowCollection;
  characters?: CharacterCollection;
  items?: ItemCollection;
  condimentPairs: CondimentPairs;
  keyItems: KeyItems;
  storyItems: StoryItems;
  flagMap: FlagMap;
  timedDeliveries: TimedDeliveries;
  usabilityMatrix?: UsabilityMatrix;
  psi?: PsiCollection;
  shops?: ShopData;
};

export type AddedWorldChunkedNpc = WorldChunkedNpc & {
  addedNpc: true;
  addedInteraction?: AddedNpc["interaction"];
};

async function loadJson<T>(url: string, schema: { parse: (value: unknown) => T }): Promise<T | undefined> {
  // Absent layers are expected (most generated JSON is optional) - but a layer
  // that EXISTS and fails to parse/validate must be loud, or authoring mistakes
  // silently disable story triggers, collision overrides, cutscenes, etc.
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    console.warn(`[loader] fetch failed for ${url}; layer disabled`, error);
    return undefined;
  }
  if (!response.ok) {
    if (response.status !== 404) {
      console.warn(`[loader] ${url} responded ${response.status}; layer disabled`);
    }
    return undefined;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    console.warn(`[loader] ${url} returned non-JSON (${contentType || "unknown content-type"}); layer disabled`);
    return undefined;
  }
  try {
    return schema.parse(await response.json());
  } catch (error) {
    console.error(`[loader] ${url} exists but is INVALID - layer disabled`, error);
    return undefined;
  }
}

/**
 * The overworld follower sprite defaults to the 2nd hero's (joinOrder 2) party
 * sprite so the roster is the single source of truth - an explicit `follower`
 * override still wins when authored.
 */
function withDerivedFollower(overrides: SpriteOverrides | undefined): SpriteOverrides | undefined {
  if (!overrides || overrides.follower) {
    return overrides;
  }
  const second = overrides.party?.find((hero) => hero.joinOrder === 2);
  return second ? { ...overrides, follower: second.sprite } : overrides;
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

function emptyArchivistSpots(): ArchivistSpots {
  return {
    schema: "swagbound.archivist-spots.v1",
    archivist: {
      spriteId: "drifella2-168",
      spriteNpcId: 100300,
      lines: ["Filed, not minted."]
    },
    spots: []
  };
}

function emptyNpcOverrides(): NpcOverrides {
  return {
    schema: "swagbound.npc-overrides.v1",
    byNpcId: {}
  };
}

function emptyNpcMovementPatterns(): NpcMovementPatterns {
  return {
    schema: "swagbound.npc-movement-patterns.v1",
    byNpcId: {}
  };
}

function emptyOverworldInteractables(): OverworldInteractables {
  return {
    schema: "swagbound.overworld-interactables.v1",
    interactables: []
  };
}

function emptyCardNfts(): CardNfts {
  return {
    schema: "swagbound.card-nfts.v1",
    cards: []
  };
}

function emptySourceChecks(): DrifellaSourceChecks {
  return {
    schema: "swagbound.drifella-source-checks.v1",
    checks: []
  };
}

function emptyAttestationBattles(): AttestationBattles {
  return {
    schema: "swagbound.attestation-battles.v1",
    tierStats: {},
    checks: []
  };
}

function emptyKeyItems(): KeyItems {
  return {
    schema: "swagbound.key-items.v1",
    itemIds: []
  };
}

function emptyCondimentPairs(): CondimentPairs {
  return {
    schema: "swagbound.condiment-pairs.v1",
    entries: [],
    skipped: []
  };
}

function emptyFlagMap(): FlagMap {
  return {
    schema: "swagbound.flag-map.v1",
    entries: []
  };
}

function emptyTimedDeliveries(): TimedDeliveries {
  return {
    schema: "swagbound.timed-delivery.v1",
    deliveries: []
  };
}

function emptyStoryItems(): StoryItems {
  return {
    schema: "swagbound.story-items.v1",
    items: []
  };
}

function emptyEarlyGameSequence(): EarlyGameSequence {
  return {
    schema: "swagbound.early-game-sequence.v1",
    flyover: { captions: [] },
    dialogue: {},
    sourceCheckAvailabilityPhase: "morning",
    morningObjective: "",
    ownership: {
      dialogueKeys: [],
      npcIds: [],
      cutsceneIds: [],
      spriteOverrideNpcIds: []
    }
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
    npcMovementPatterns,
    backgroundOverrides,
    teleportDestinations,
    encounters,
    battle,
    battleRules,
    roamerZoneCaps,
    enemyOverrides,
    enemyStatOverrides,
    enemyActionEffects,
    font,
    window,
    characters,
    characterOverrides,
    items,
    itemOverrides,
    condimentPairs,
    keyItems,
    storyItems,
    flagMap,
    timedDeliveries,
    usabilityMatrix,
    psi,
    psiOverrides,
    shops,
    addedNpcs,
    customDialogue,
    dialogueLibrary,
    storyTriggers,
    musicManifest,
    sectorMusic,
    collisionOverrides,
    fgOverrides,
    navmesh,
    drifellaBarks,
    archivistSpots,
    openingCutscene,
    cutscenes,
    overworldInteractables,
    cardNfts,
    sourceChecks,
    attestationBattles,
    objectives,
    earlyGameSequence,
    openingClarity,
    narrativeRedesign
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
    loadJson(`/generated/${NPC_MOVEMENT_PATTERNS_FILE}`, NpcMovementPatternsSchema),
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
    loadJson(`/generated/${ROAMER_ZONE_CAPS_FILE}`, RoamerZoneCapsSchema),
    loadJson(`/generated/${ENEMY_OVERRIDES_FILE}`, EnemyOverridesSchema),
    loadJson(`/generated/${ENEMY_STAT_OVERRIDES_FILE}`, EnemyStatOverridesSchema),
    loadJson(`/generated/${ENEMY_ACTION_EFFECTS_FILE}`, EnemyActionEffectsSchema),
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
    loadJson(`/generated/${CONDIMENT_PAIRS_FILE}`, CondimentPairsSchema),
    loadJson(`/generated/${KEY_ITEMS_FILE}`, KeyItemsSchema),
    loadJson(`/generated/${STORY_ITEMS_FILE}`, StoryItemsSchema),
    loadJson(`/generated/${FLAG_MAP_FILE}`, FlagMapSchema),
    loadJson(`/generated/${TIMED_DELIVERY_FILE}`, TimedDeliveriesSchema),
    loadJson(`/generated/${USABILITY_MATRIX_FILE}`, UsabilityMatrixSchema),
    manifest.files.psi
      ? loadJson(`/generated/${manifest.files.psi}`, PsiCollectionSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${PSI_OVERRIDES_FILE}`, PsiOverridesSchema),
    manifest.files.shops
      ? loadJson(`/generated/${manifest.files.shops}`, ShopDataSchema)
      : Promise.resolve(undefined),
    loadJson(`/generated/${ADDED_NPCS_FILE}`, {
      // Lenient: drop only the invalid/duplicate entries, keep the rest. A single
      // bad entry must never disable the whole overlay (a stray pages+ref conflict
      // once silently blanked all promoted NPCs game-wide).
      parse: (raw: unknown): AddedNpcs => {
        const { value, dropped } = sanitizeAddedNpcs(raw);
        if (dropped.length > 0) {
          console.warn(
            `[loader] added-npcs: dropped ${dropped.length} invalid/duplicate entr${dropped.length === 1 ? "y" : "ies"}, kept ${value.npcs.length}:`,
            dropped
          );
        }
        return value;
      }
    }),
    loadJson(`/generated/${CUSTOM_DIALOGUE_FILE}`, CustomDialogueSchema),
    loadJson(`/generated/${SWAGBOUND_DIALOGUE_LIBRARY_FILE}`, SwagboundDialogueLibrarySchema),
    loadJson(`/generated/${STORY_TRIGGERS_FILE}`, StoryTriggersSchema),
    loadJson(`/generated/${MUSIC_MANIFEST_FILE}`, MusicManifestSchema),
    loadJson(`/generated/${SECTOR_MUSIC_FILE}`, SectorMusicSchema),
    loadJson(`/generated/${COLLISION_OVERRIDES_FILE}`, CollisionOverridesSchema),
    loadJson(`/generated/${FG_OVERRIDES_FILE}`, FgOverridesSchema),
    loadJson(`/generated/${NAVMESH_FILE}`, NavmeshSchema),
    loadJson(`/generated/${DRIFELLA_BARKS_FILE}`, DrifellaBarksSchema),
    loadJson(`/generated/${ARCHIVIST_SPOTS_FILE}`, ArchivistSpotsSchema),
    loadJson(`/generated/${OPENING_CUTSCENE_FILE}`, OpeningCutsceneSchema),
    loadJson(`/generated/${CUTSCENES_FILE}`, CutscenesSchema),
    loadJson(`/generated/${OVERWORLD_INTERACTABLES_FILE}`, OverworldInteractablesSchema),
    loadJson(`/generated/${CARD_NFTS_FILE}`, CardNftsSchema),
    loadJson(`/generated/${DRIFELLA_SOURCE_CHECKS_FILE}`, DrifellaSourceChecksSchema),
    loadJson(`/generated/${ATTESTATION_BATTLES_FILE}`, AttestationBattlesSchema),
    loadJson(`/generated/${OBJECTIVES_FILE}`, ObjectivesSchema),
    loadJson(`/generated/${EARLY_GAME_SEQUENCE_FILE}`, EarlyGameSequenceSchema),
    loadJson(`/generated/${OPENING_CLARITY_FILE}`, OpeningClaritySchema),
    loadJson(`/generated/${NARRATIVE_REDESIGN_FILE}`, OpeningClaritySchema)
  ]);
  const resolvedCharacters = applyCharacterOverrides(characters, characterOverrides);
  const resolvedItems = applyItemOverrides(items, itemOverrides);
  const resolvedPsi = applyPsiOverrides(psi, psiOverrides);
  const resolvedEarlyGameSequence = earlyGameSequence ?? emptyEarlyGameSequence();
  const unownedOpeningClarity = suppressOwnedOpeningClarity(
    openingClarity,
    resolvedEarlyGameSequence,
    "opening-clarity",
    import.meta.env.DEV
  );
  const unownedNarrativeRedesign = suppressOwnedOpeningClarity(
    narrativeRedesign,
    resolvedEarlyGameSequence,
    "narrative-redesign",
    import.meta.env.DEV
  );
  const resolvedBattle = applyOpeningClarityBattle(
    applyOpeningClarityBattle(
      applyEnemyActionEffects(
        applyEnemyStatOverrides(applyEnemyOverrides(battle, enemyOverrides), enemyStatOverrides),
        enemyActionEffects
      ),
      unownedOpeningClarity
    ),
    unownedNarrativeRedesign
  );
  const resolvedDrifellaBarks = drifellaBarks ?? emptyDrifellaBarks();
  const resolvedCustomDialogue = applyOpeningClarityDialogue(
    applyOpeningClarityDialogue(
      buildCustomDialogueWithDrifellaBarks(
        customDialogue ?? emptyCustomDialogue(),
        world?.npcs ?? [],
        resolvedDrifellaBarks
      ),
      unownedOpeningClarity
    ),
    unownedNarrativeRedesign
  );
  const resolvedSpriteOverrides = applyOpeningClaritySprites(
    applyOpeningClaritySprites(spriteOverrides, unownedOpeningClarity),
    unownedNarrativeRedesign
  );

  return {
    manifest,
    scripts,
    npcs,
    addedNpcs: addedNpcs ?? emptyAddedNpcs(),
    customDialogue: resolvedCustomDialogue,
    drifellaBarks: resolvedDrifellaBarks,
    archivistSpots: archivistSpots ?? emptyArchivistSpots(),
    dialogueLibrary: dialogueLibrary ?? emptyDialogueLibrary(),
    overworldInteractables: overworldInteractables ?? emptyOverworldInteractables(),
    cardNfts: cardNfts ?? emptyCardNfts(),
    sourceChecks: sourceChecks ?? emptySourceChecks(),
    attestationBattles: attestationBattles ?? emptyAttestationBattles(),
    objectives: applyOpeningClarityObjectives(
      applyOpeningClarityObjectives(objectives, unownedOpeningClarity),
      unownedNarrativeRedesign
    ),
    earlyGameSequence: resolvedEarlyGameSequence,
    openingCutscene,
    cutscenes: applyOpeningClarityCutscenes(
      applyOpeningClarityCutscenes(cutscenes, unownedOpeningClarity),
      unownedNarrativeRedesign
    ),
    storyTriggers: applyOpeningClarityStoryTriggers(
      applyOpeningClarityStoryTriggers(storyTriggers, unownedOpeningClarity),
      unownedNarrativeRedesign
    ),
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    spriteOverrides: withDerivedFollower(resolvedSpriteOverrides),
    npcOverrides: npcOverrides ?? emptyNpcOverrides(),
    npcMovementPatterns: npcMovementPatterns ?? emptyNpcMovementPatterns(),
    backgroundOverrides,
    teleportDestinations,
    encounters,
    battle: resolvedBattle,
    battleRules,
    roamerZoneCaps,
    enemyActionEffects,
    musicManifest,
    sectorMusic,
    collisionOverrides,
    fgOverrides,
    navmesh,
    font,
    window,
    characters: resolvedCharacters,
    items: resolvedItems,
    condimentPairs: condimentPairs ?? emptyCondimentPairs(),
    keyItems: keyItems ?? emptyKeyItems(),
    storyItems: storyItems ?? emptyStoryItems(),
    flagMap: flagMap ?? emptyFlagMap(),
    timedDeliveries: timedDeliveries ?? emptyTimedDeliveries(),
    usabilityMatrix,
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
      if (override.learnedBy) {
        entry.learnedBy = override.learnedBy.map((l) => ({ charId: l.charId, level: l.level }));
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

export function applyEnemyActionEffects(
  battle: BattleData | undefined,
  effects: EnemyActionEffects | undefined
): BattleData | undefined {
  if (!battle || !effects) {
    return battle;
  }
  let changed = false;
  const enemies = battle.enemies.map((enemy) => {
    const actions = enemy.actions.map((action) => {
      const actionId = String(action.actionId ?? action.id);
      const effect = effects.byActionId[actionId];
      if (!effect) {
        return action;
      }
      changed = true;
      return {
        ...action,
        ...(effect.name ? { name: effect.name } : {}),
        effect: { ...effect.effect }
      };
    }) as typeof enemy.actions;
    return actions === enemy.actions ? enemy : { ...enemy, actions };
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
      movement: npc.movement ?? 0,
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

export function isAddedNpcExtrasEnabled(search: string | undefined): boolean {
  return new URLSearchParams(search ?? "").get("extras") === "1";
}

export function contentReferencedAddedNpcIds(
  addedNpcs: AddedNpcs | undefined,
  sourceChecks: DrifellaSourceChecks | undefined,
  storyTriggers: StoryTriggers | undefined,
  cutscenes?: Cutscenes
): Set<number> {
  const hintNpcIds = new Set<number>();
  for (const check of sourceChecks?.checks ?? []) {
    for (const hint of check.hints) {
      if (hint.kind === "rumorNpc") {
        hintNpcIds.add(hint.npcId);
      }
    }
  }
  const triggerText = storyTriggers ? JSON.stringify(storyTriggers) : "";
  // Cutscene actors count as references too: an authored scene that shows or
  // faces an added NPC needs that NPC to exist without ?extras=1.
  const cutsceneText = cutscenes ? JSON.stringify(cutscenes) : "";
  const referenced = new Set<number>();
  for (const npc of addedNpcs?.npcs ?? []) {
    if (npc.alwaysSpawn) {
      referenced.add(npc.id);
      continue;
    }
    if (hintNpcIds.has(npc.id) || triggerText.includes(String(npc.id)) || cutsceneText.includes(String(npc.id))) {
      referenced.add(npc.id);
    }
  }
  return referenced;
}

export function addedNpcsForSpawn(
  addedNpcs: AddedNpcs | undefined,
  options: {
    extrasEnabled: boolean;
    sourceChecks?: DrifellaSourceChecks;
    storyTriggers?: StoryTriggers;
    cutscenes?: Cutscenes;
  }
): AddedNpcs | undefined {
  if (!addedNpcs || options.extrasEnabled) {
    return addedNpcs;
  }
  const referenced = contentReferencedAddedNpcIds(addedNpcs, options.sourceChecks, options.storyTriggers, options.cutscenes);
  if (referenced.size === 0) {
    return { ...addedNpcs, npcs: [] };
  }
  return {
    ...addedNpcs,
    npcs: addedNpcs.npcs.filter((npc) => referenced.has(npc.id))
  };
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
