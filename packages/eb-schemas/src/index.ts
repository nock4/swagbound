import { z } from "zod";

export const SCHEMA_VERSION = "0.2.0";

export const ValidationSeveritySchema = z.enum(["info", "warning", "error"]);

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive()
});

const RawEffectMetadataSchema = z.object({
  raw: z.string().optional()
});

const PartyStatOpSchema = z.enum([
  "heal_percent",
  "hurt_percent",
  "heal",
  "hurt",
  "recoverpp_percent",
  "consumepp_percent",
  "recoverpp",
  "consumepp",
  "change_level",
  "boost_exp",
  "boost_iq",
  "boost_guts",
  "boost_speed",
  "boost_vitality",
  "boost_luck"
]);

const FunctionalEventSegmentSchema = z.union([
  RawEffectMetadataSchema.extend({
    kind: z.literal("setFlag"),
    flag: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("unsetFlag"),
    flag: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("party"),
    op: z.enum(["add", "remove"]),
    char: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("warp"),
    dest: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("teleport"),
    dest: z.number().int().nonnegative(),
    style: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("anchorWarp")
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("battle"),
    group: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("give"),
    char: z.number().int().nonnegative(),
    item: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("take"),
    char: z.number().int().nonnegative(),
    item: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("money"),
    op: z.enum(["give", "take"]),
    amount: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("atm"),
    op: z.enum(["deposit", "withdraw"]),
    amount: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("shop"),
    storeId: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("music"),
    op: z.literal("play"),
    track: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("music"),
    op: z.enum(["stop", "resume"])
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("sound"),
    id: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("musicEffect"),
    id: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("partyStat"),
    op: PartyStatOpSchema,
    char: z.number().int().nonnegative(),
    amount: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("inflict"),
    char: z.number().int().nonnegative(),
    status: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("learnPsi"),
    char: z.number().int().nonnegative(),
    psi: z.number().int().nonnegative()
  }),
  RawEffectMetadataSchema.extend({
    kind: z.literal("event"),
    id: z.number().int().nonnegative()
  })
]);

export const DialogueSegmentSchema = z.union([
  z.object({
    kind: z.literal("text"),
    value: z.string()
  }),
  z.object({
    kind: z.literal("break"),
    break: z.enum(["line", "newline", "clear"])
  }),
  z.object({
    kind: z.literal("pause"),
    frames: z.number().int().nonnegative()
  }),
  z.object({
    kind: z.literal("prompt")
  }),
  z.object({
    kind: z.literal("substitution"),
    name: z.enum([
      "playerName",
      "partyChar",
      "item",
      "psi",
      "number",
      "money",
      "user",
      "target",
      "teleport",
      "stat"
    ]),
    args: z.array(z.number().int())
  }),
  z.object({
    kind: z.literal("style"),
    style: z.enum(["color", "font", "blips"]),
    value: z.string().optional(),
    args: z.array(z.number().int()).optional()
  }),
  z.object({
    kind: z.literal("window"),
    op: z.enum(["open", "closeTop", "switch", "closeAll", "clear"]),
    args: z.array(z.number().int())
  }),
  z.object({
    kind: z.literal("control"),
    code: z.string(),
    raw: z.string(),
    target: z.string().optional()
  }),
  FunctionalEventSegmentSchema
]);

export const ValidationIssueSchema = z.object({
  severity: ValidationSeveritySchema,
  code: z.string(),
  message: z.string(),
  path: z.string().optional()
});

export const ScriptCommandSchema = z.object({
  cmd: z.string(),
  raw: z.string(),
  sourceLocation: SourceLocationSchema,
  value: z.string().optional(),
  segments: z.array(DialogueSegmentSchema).optional(),
  name: z.string().optional(),
  code: z.string().optional(),
  target: z.string().optional()
});

export const ScriptFileSchema = z.object({
  path: z.string(),
  commands: z.array(ScriptCommandSchema),
  labels: z.array(z.string()),
  counts: z.object({
    commands: z.number().int().nonnegative(),
    labels: z.number().int().nonnegative(),
    textCommands: z.number().int().nonnegative(),
    unknownCommands: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const ScriptCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  files: z.array(ScriptFileSchema),
  counts: z.object({
    files: z.number().int().nonnegative(),
    commands: z.number().int().nonnegative(),
    labels: z.number().int().nonnegative(),
    textCommands: z.number().int().nonnegative(),
    unknownCommands: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const SpriteImageSchema = z.object({
  path: z.string(),
  id: z.number().int().nonnegative().optional(),
  extension: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

export const SpriteGroupCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  images: z.array(SpriteImageSchema),
  counts: z.object({
    images: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const NpcMetadataSchema = z.object({
  indexedFiles: z.array(z.string()),
  referencesRobotHelloWorld: z.boolean()
});

export const NpcReferenceSchema = z.object({
  reference: z.string(),
  scriptFileStem: z.string(),
  label: z.string(),
  sourceLocation: SourceLocationSchema,
  raw: z.string(),
  contextType: z.string()
});

export const NpcReferenceCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  references: z.array(NpcReferenceSchema),
  counts: z.object({
    references: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

const CustomDialogueEntrySchema = z.object({
  pages: z.array(z.string()).min(1)
});

export const CustomDialogueSchema = z.object({
  schema: z.literal("swagbound.custom-dialogue.v1"),
  comment: z.string().optional(),
  byNpcId: z.record(CustomDialogueEntrySchema),
  byTextPointer: z.record(CustomDialogueEntrySchema)
});

export const TutorialStepStatusSchema = z.enum(["pass", "fail", "blocked", "unknown"]);

export const TutorialStepSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: TutorialStepStatusSchema,
  evidence: z.string(),
  path: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional()
});

export const TutorialStatusSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  sourceTutorialUrl: z.string(),
  steps: z.array(TutorialStepSchema),
  counts: z.object({
    steps: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

const PixelSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() });

export const WorldNpcSchema = z.object({
  npcId: z.number().int().nonnegative(),
  spriteGroup: z.number().int().nonnegative().optional(),
  eventFlag: z.number().int().nonnegative().optional(),
  direction: z.string().optional(),
  type: z.string().optional(),
  movement: z.number().int().nonnegative().optional(),
  showSprite: z.string().optional(),
  textPointer: z.string().optional(),
  textPointer2: z.string().optional(),
  interactable: z.boolean(),
  visible: z.boolean(),
  worldPixel: PixelSchema,
  regionPixel: z.object({ x: z.number().int(), y: z.number().int() }),
  sheet: z.string().optional(),
  sourceLocation: SourceLocationSchema.optional()
});

export const WorldChunkedNpcSchema = WorldNpcSchema.omit({ regionPixel: true });

export const WorldCollisionSchema = z.object({
  cellSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  solidRows: z.array(z.string()),
  surfaceRows: z.array(z.string())
});

export const WorldSectorAreasSchema = z
  .object({
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    sectorWidthTiles: z.number().int().positive(),
    sectorHeightTiles: z.number().int().positive(),
    tileSize: z.number().int().positive(),
    areaIds: z.array(z.number().int().nonnegative()),
    indoor: z.array(z.union([z.literal(0), z.literal(1)])),
    bounded: z.array(z.union([z.literal(0), z.literal(1)]))
  })
  .superRefine((value, context) => {
    const expected = value.cols * value.rows;
    if (value.areaIds.length !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `areaIds length ${value.areaIds.length} does not match cols*rows ${expected}`,
        path: ["areaIds"]
      });
    }
    if (value.indoor.length !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `indoor length ${value.indoor.length} does not match cols*rows ${expected}`,
        path: ["indoor"]
      });
    }
    if (value.bounded.length !== expected) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `bounded length ${value.bounded.length} does not match cols*rows ${expected}`,
        path: ["bounded"]
      });
    }
  });

export const WorldSourcesSchema = z.object({
  mapTiles: z.boolean(),
  mapSectors: z.boolean(),
  tilesetFiles: z.number().int().nonnegative(),
  mapSprites: z.boolean(),
  npcConfig: z.boolean(),
  spriteGroupsYml: z.boolean()
});

export const WorldCountsSchema = z.object({
  npcs: z.number().int().nonnegative(),
  visibleNpcs: z.number().int().nonnegative(),
  solidCells: z.number().int().nonnegative(),
  mapTilesetsUsed: z.number().int().nonnegative(),
  palettesUsed: z.number().int().nonnegative()
});

export const WorldRegionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  available: z.boolean(),
  tileSize: z.number().int().positive(),
  region: z
    .object({
      originTile: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }),
      widthTiles: z.number().int().positive(),
      heightTiles: z.number().int().positive(),
      widthPixels: z.number().int().positive(),
      heightPixels: z.number().int().positive()
    })
    .optional(),
  images: z
    .object({
      background: z.string(),
      foreground: z.string()
    })
    .optional(),
  collision: WorldCollisionSchema.optional(),
  sectors: WorldSectorAreasSchema.optional(),
  npcs: z.array(WorldNpcSchema),
  player: z
    .object({
      spriteGroup: z.number().int().nonnegative(),
      sheet: z.string().optional(),
      spawnRegionPixel: z.object({ x: z.number().int(), y: z.number().int() }),
      spawnWorldPixel: z.object({ x: z.number().int(), y: z.number().int() }),
      spawnDerivation: z.string(),
      newGameStartupRef: z.string().optional(),
      newGameStartupDerivation: z.string().optional()
    })
    .optional(),
  sources: WorldSourcesSchema,
  counts: WorldCountsSchema,
  warnings: z.array(ValidationIssueSchema)
});

export const WorldChunkSchema = z.object({
  cx: z.number().int().nonnegative(),
  cy: z.number().int().nonnegative(),
  background: z.string().nullable(),
  foreground: z.string().nullable(),
  void: z.boolean()
});

export const WorldDoorTypeSchema = z.enum(["door", "stairway", "escalator"]);

export const WorldDoorSchema = z.object({
  type: WorldDoorTypeSchema,
  worldPixel: PixelSchema,
  destinationWorldPixel: PixelSchema,
  direction: z.string().optional(),
  style: z.number().int().nonnegative().optional(),
  eventFlag: z.string().optional(),
  textPointer: z.string().optional()
});

export const TeleportDestinationSchema = z.object({
  id: z.number().int().nonnegative(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  direction: z.number().int().nonnegative(),
  warpStyle: z.number().int().nonnegative()
});

export const TeleportDestinationsSchema = z.object({
  schemaVersion: z.string(),
  units: z.object({
    x: z.literal("world-pixels"),
    y: z.literal("world-pixels")
  }),
  destinations: z.array(TeleportDestinationSchema),
  counts: z.object({
    destinations: z.number().int().nonnegative()
  })
});

export const WorldChunkedSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  available: z.literal(true),
  mode: z.literal("full"),
  tileSize: z.number().int().positive(),
  mapWidthTiles: z.number().int().positive(),
  mapHeightTiles: z.number().int().positive(),
  chunkSizeTiles: z.number().int().positive(),
  sectors: WorldSectorAreasSchema.optional(),
  chunks: z.array(WorldChunkSchema),
  collision: WorldCollisionSchema,
  npcs: z.array(WorldChunkedNpcSchema),
  player: z.object({
    spriteGroup: z.number().int().nonnegative(),
    sheet: z.string().optional(),
    spawnWorldPixel: PixelSchema,
    spawnDerivation: z.string(),
    newGameStartupRef: z.string().optional(),
    newGameStartupDerivation: z.string().optional()
  }),
  sources: WorldSourcesSchema,
  counts: WorldCountsSchema.extend({
    doors: z.number().int().nonnegative(),
    doorTypes: z.record(z.number().int().nonnegative()),
    chunks: z.number().int().nonnegative(),
    chunksWritten: z.number().int().nonnegative(),
    voidChunks: z.number().int().nonnegative(),
    chunkFiles: z.number().int().nonnegative()
  }),
  doors: z.array(WorldDoorSchema),
  warnings: z.array(ValidationIssueSchema)
});

export const WorldArtifactSchema = z.union([WorldChunkedSchema, WorldRegionSchema]);

export const SpriteFacingSchema = z.enum(["up", "right", "down", "left"]);

/** Two walk frames (sheet frame indices) per cardinal facing. */
export const SpriteAnimationsSchema = z.record(
  SpriteFacingSchema,
  z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
);

export const SpriteSheetSchema = z.object({
  groupId: z.number().int().nonnegative(),
  file: z.string(),
  sourcePath: z.string(),
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  frames: z.number().int().positive(),
  animations: SpriteAnimationsSchema.optional()
});

export const SpriteSheetCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  sheets: z.array(SpriteSheetSchema),
  counts: z.object({
    sheets: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const EncounterCandidateSchema = z.object({
  enemyGroup: z.number().int().nonnegative(),
  probability: z.number().int().positive()
});

export const EncounterSubGroupSchema = z.object({
  rate: z.number().int().positive(),
  candidates: z.array(EncounterCandidateSchema).min(1)
});

export const EncounterMapGroupSchema = z.object({
  mapGroup: z.number().int().nonnegative(),
  eventFlag: z.number().int().nonnegative(),
  subGroups: z.array(EncounterSubGroupSchema).min(1)
});

export const EncounterSectorMapGroupSchema = EncounterMapGroupSchema.extend({
  cellCount: z.number().int().positive().optional()
});

export const EncounterSectorSchema = EncounterMapGroupSchema.extend({
  mapGroups: z.array(EncounterSectorMapGroupSchema).min(2).optional()
});

export const EncountersSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  sectorWidthTiles: z.number().int().positive(),
  sectorHeightTiles: z.number().int().positive(),
  sectorsPerRow: z.number().int().positive(),
  sectors: z.record(EncounterSectorSchema),
  counts: z.object({
    sectors: z.number().int().nonnegative(),
    mapGroups: z.number().int().nonnegative(),
    enemyGroups: z.number().int().nonnegative(),
    sourcePlacementCells: z.number().int().nonnegative(),
    mixedSectors: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const BattleActionSchema = z.object({
  id: z.number().int().nonnegative(),
  arg: z.number().int().nonnegative(),
  actionId: z.number().int().nonnegative().optional(),
  actionType: z.number().int().min(0).max(5).optional(),
  target: z.number().int().min(0).max(4).optional()
});

export const BattleDropRaritySchema = z.object({
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().positive()
});

export const BattleBackgroundScrollSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const BattleBackgroundDistortionSchema = z.object({
  kind: z.string(),
  amplitude: z.number().nonnegative(),
  frequency: z.number().nonnegative(),
  speed: z.number()
});

export const BattleBackgroundSchema = z.object({
  id: z.number().int().nonnegative(),
  scroll: BattleBackgroundScrollSchema.optional(),
  distortion: BattleBackgroundDistortionSchema.optional()
});

export const BattleEnemySchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  spriteId: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  offense: z.number().int().nonnegative(),
  speed: z.number().int().nonnegative(),
  experience: z.number().int().nonnegative(),
  money: z.number().int().nonnegative(),
  bossFlag: z.boolean(),
  actions: z.array(BattleActionSchema).length(4),
  itemDropped: z.number().int().nonnegative().nullable(),
  itemRarity: BattleDropRaritySchema.nullable()
});

export const BattleGroupSchema = z.object({
  id: z.number().int().nonnegative(),
  background1: z.number().int().nonnegative(),
  background2: z.number().int().nonnegative(),
  enemyIds: z.array(z.number().int().nonnegative()).min(1)
});

export const BattleDataSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  selection: z.object({
    method: z.string(),
    townMap: z.string().optional(),
    mapEnemyGroupIds: z.array(z.number().int().nonnegative()),
    battleGroupIds: z.array(z.number().int().nonnegative()),
    placementCellMapping: z.string(),
    fallbackUsed: z.boolean()
  }),
  statMapping: z.object({
    level: z.string(),
    hp: z.string(),
    defense: z.string(),
    offense: z.string(),
    speed: z.string(),
    experience: z.string(),
    money: z.string(),
    bossFlag: z.string(),
    actions: z.string(),
    itemDropped: z.string(),
    itemRarity: z.string()
  }),
  spriteFormat: z.object({
    source: z.string(),
    fileType: z.string(),
    indexedPaletteBits: z.number().int().positive(),
    transparentPaletteIndex: z.number().int().nonnegative(),
    allowedSizes: z.array(z.tuple([z.number().int().positive(), z.number().int().positive()]))
  }),
  assetLayout: z.object({
    spriteDir: z.string(),
    backgroundDir: z.string(),
    spriteFilePattern: z.string(),
    backgroundFilePattern: z.string()
  }),
  enemies: z.array(BattleEnemySchema),
  groups: z.array(BattleGroupSchema),
  backgrounds: z.array(BattleBackgroundSchema).optional(),
  counts: z.object({
    enemies: z.number().int().nonnegative(),
    groups: z.number().int().nonnegative(),
    spriteFiles: z.number().int().nonnegative(),
    backgroundFiles: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const FontGlyphSheetSchema = z.object({
  id: z.number().int().nonnegative(),
  file: z.string(),
  imageWidth: z.number().int().positive(),
  imageHeight: z.number().int().positive(),
  columns: z.number().int().positive(),
  glyphCount: z.number().int().positive(),
  cellWidth: z.number().int().positive(),
  cellHeight: z.number().int().positive(),
  widths: z.array(z.number().int().nonnegative())
}).refine((sheet) => sheet.widths.length === sheet.glyphCount, {
  message: "widths length must match glyphCount",
  path: ["widths"]
});

export const FontCollectionSchema = z.object({
  primaryFontId: z.number().int().nonnegative(),
  charCodeOffset: z.number().int().nonnegative(),
  fonts: z.array(FontGlyphSheetSchema)
}).refine((collection) => collection.fonts.some((font) => font.id === collection.primaryFontId), {
  message: "primaryFontId must reference an emitted font",
  path: ["primaryFontId"]
});

export const RgbColorSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255)
});

export const WindowRectSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive()
});

export const WindowFlavorSchema = z.object({
  id: z.number().int().nonnegative(),
  file: z.string(),
  corner: WindowRectSchema,
  hEdge: WindowRectSchema,
  vEdge: WindowRectSchema,
  moreArrow: WindowRectSchema,
  interiorColor: RgbColorSchema,
  detectionNotes: z.record(z.string()).optional()
});

export const WindowLayoutSchema = z.object({
  id: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  xOffset: z.number().int().nonnegative(),
  yOffset: z.number().int().nonnegative()
});

export const WindowCollectionSchema = z.object({
  defaultFlavorId: z.number().int().nonnegative(),
  transparentKey: RgbColorSchema,
  flavors: z.array(WindowFlavorSchema),
  layouts: z.array(WindowLayoutSchema).optional()
}).refine((collection) => collection.flavors.some((flavor) => flavor.id === collection.defaultFlavorId), {
  message: "defaultFlavorId must reference an emitted window flavor",
  path: ["defaultFlavorId"]
});

export const CharacterGrowthSchema = z.object({
  offense: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  speed: z.number().int().nonnegative(),
  guts: z.number().int().nonnegative(),
  vitality: z.number().int().nonnegative(),
  iq: z.number().int().nonnegative(),
  luck: z.number().int().nonnegative()
});

export const CharacterExpThresholdSchema = z.object({
  level: z.number().int().positive(),
  experience: z.number().int().nonnegative()
});

export const CharacterDataSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  level: z.number().int().positive(),
  experience: z.number().int().nonnegative().optional(),
  maxHp: z.number().int().nonnegative(),
  maxPp: z.number().int().nonnegative(),
  offense: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  speed: z.number().int().nonnegative(),
  guts: z.number().int().nonnegative(),
  vitality: z.number().int().nonnegative(),
  iq: z.number().int().nonnegative(),
  luck: z.number().int().nonnegative(),
  startingItems: z.array(z.number().int().nonnegative()),
  money: z.number().int().nonnegative(),
  growth: CharacterGrowthSchema.optional(),
  expTable: z.array(CharacterExpThresholdSchema).optional()
});

export const CharacterCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  derivation: z.object({
    source: z.string(),
    baseStats: z.string(),
    statFormula: z.string(),
    hpPpFormula: z.string(),
    uncertainty: z.string()
  }),
  characters: z.array(CharacterDataSchema).max(8),
  counts: z.object({
    characters: z.number().int().nonnegative(),
    statFieldsPopulated: z.number().int().nonnegative(),
    growthFieldsPopulated: z.number().int().nonnegative().optional(),
    expThresholds: z.number().int().nonnegative().optional()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const ItemDataSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  type: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative(),
  action: z.number().int().nonnegative(),
  argument: z.number().int().nonnegative(),
  equippable: z.boolean(),
  miscFlags: z.array(z.string()),
  helpText: z.string().optional()
});

export const ItemCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  derivation: z.object({
    source: z.string(),
    equippable: z.string(),
    helpText: z.string()
  }),
  items: z.array(ItemDataSchema),
  counts: z.object({
    items: z.number().int().nonnegative(),
    equippable: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const PsiLearnedBySchema = z.object({
  charId: z.number().int().nonnegative(),
  level: z.number().int().positive()
});

export const PsiDataSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  type: z.string(),
  strength: z.string(),
  usableOutsideBattle: z.boolean(),
  learnedBy: z.array(PsiLearnedBySchema)
});

export const PsiCollectionSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  derivation: z.object({
    source: z.string(),
    names: z.string(),
    learnedBy: z.string(),
    usableOutsideBattle: z.string()
  }),
  psi: z.array(PsiDataSchema),
  counts: z.object({
    psi: z.number().int().nonnegative(),
    learnedBy: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const ShopEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  itemIds: z.array(z.number().int().nonnegative())
});

export const ShopDataSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  derivation: z.object({
    source: z.string(),
    slots: z.string(),
    unusedFields: z.string()
  }),
  shops: z.array(ShopEntrySchema),
  counts: z.object({
    shops: z.number().int().nonnegative(),
    entries: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

export const TutorialFixtureHintsSchema = z.object({
  hasRobotCcs: z.boolean(),
  hasHelloWorldLabel: z.boolean(),
  hasRobotHelloWorldContent: z.boolean(),
  hasSpriteGroup005: z.boolean(),
  npcReferencesRobotHelloWorld: z.boolean()
});

export const SourceProjectSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  hasProjectSnake: z.boolean(),
  detectedFolders: z.array(z.string()),
  tutorialFixtureHints: TutorialFixtureHintsSchema
});

export const ManifestSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  sourceProject: SourceProjectSchema,
  files: z.object({
    scripts: z.string(),
    npcs: z.string(),
    spriteGroups: z.string(),
    tutorialStatus: z.string(),
    validationReport: z.string(),
    world: z.string(),
    sprites: z.string(),
    teleportDestinations: z.string().optional(),
    encounters: z.string().optional(),
    battle: z.string().optional(),
    font: z.string().optional(),
    window: z.string().optional(),
    characters: z.string().optional(),
    items: z.string().optional(),
    psi: z.string().optional(),
    shops: z.string().optional()
  }),
  counts: z.object({
    scriptFiles: z.number().int().nonnegative(),
    scriptCommands: z.number().int().nonnegative(),
    labels: z.number().int().nonnegative(),
    textCommands: z.number().int().nonnegative(),
    unknownCommands: z.number().int().nonnegative(),
    npcReferences: z.number().int().nonnegative(),
    spriteImages: z.number().int().nonnegative(),
    worldNpcs: z.number().int().nonnegative(),
    spriteSheets: z.number().int().nonnegative(),
    teleportDestinations: z.number().int().nonnegative().optional(),
    encounterSectors: z.number().int().nonnegative().optional(),
    encounterEnemyGroups: z.number().int().nonnegative().optional(),
    battleEnemies: z.number().int().nonnegative().optional(),
    battleGroups: z.number().int().nonnegative().optional(),
    fontSheets: z.number().int().nonnegative().optional(),
    fontGlyphs: z.number().int().nonnegative().optional(),
    windowFlavors: z.number().int().nonnegative().optional(),
    windowLayouts: z.number().int().nonnegative().optional(),
    characters: z.number().int().nonnegative().optional(),
    characterStatFieldsPopulated: z.number().int().nonnegative().optional(),
    items: z.number().int().nonnegative().optional(),
    equippableItems: z.number().int().nonnegative().optional(),
    psi: z.number().int().nonnegative().optional(),
    psiLearnedByEntries: z.number().int().nonnegative().optional(),
    shops: z.number().int().nonnegative().optional(),
    shopItemEntries: z.number().int().nonnegative().optional(),
    warnings: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema),
  errors: z.array(ValidationIssueSchema)
});

export const ValidationReportSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  sourceProject: SourceProjectSchema,
  generatedFiles: z.array(z.string()),
  issues: z.array(ValidationIssueSchema),
  counts: z.object({
    warnings: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative()
  })
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type WorldRegion = z.infer<typeof WorldRegionSchema>;
export type WorldChunked = z.infer<typeof WorldChunkedSchema>;
export type WorldArtifact = z.infer<typeof WorldArtifactSchema>;
export type WorldNpc = z.infer<typeof WorldNpcSchema>;
export type WorldChunkedNpc = z.infer<typeof WorldChunkedNpcSchema>;
export type WorldDoor = z.infer<typeof WorldDoorSchema>;
export type TeleportDestination = z.infer<typeof TeleportDestinationSchema>;
export type TeleportDestinations = z.infer<typeof TeleportDestinationsSchema>;
export type SpriteSheet = z.infer<typeof SpriteSheetSchema>;
export type SpriteFacing = z.infer<typeof SpriteFacingSchema>;
export type SpriteAnimations = z.infer<typeof SpriteAnimationsSchema>;
export type SpriteSheetCollection = z.infer<typeof SpriteSheetCollectionSchema>;
export type EncounterCandidate = z.infer<typeof EncounterCandidateSchema>;
export type EncounterSubGroup = z.infer<typeof EncounterSubGroupSchema>;
export type EncounterMapGroup = z.infer<typeof EncounterMapGroupSchema>;
export type EncounterSector = z.infer<typeof EncounterSectorSchema>;
export type Encounters = z.infer<typeof EncountersSchema>;
export type BattleData = z.infer<typeof BattleDataSchema>;
export type BattleEnemy = z.infer<typeof BattleEnemySchema>;
export type BattleGroup = z.infer<typeof BattleGroupSchema>;
export type BattleBackground = z.infer<typeof BattleBackgroundSchema>;
export type BattleBackgroundScroll = z.infer<typeof BattleBackgroundScrollSchema>;
export type BattleBackgroundDistortion = z.infer<typeof BattleBackgroundDistortionSchema>;
export type BattleDropRarity = z.infer<typeof BattleDropRaritySchema>;
export type FontGlyphSheet = z.infer<typeof FontGlyphSheetSchema>;
export type FontCollection = z.infer<typeof FontCollectionSchema>;
export type RgbColor = z.infer<typeof RgbColorSchema>;
export type WindowRect = z.infer<typeof WindowRectSchema>;
export type WindowFlavor = z.infer<typeof WindowFlavorSchema>;
export type WindowLayout = z.infer<typeof WindowLayoutSchema>;
export type WindowCollection = z.infer<typeof WindowCollectionSchema>;
export type CharacterCollection = z.infer<typeof CharacterCollectionSchema>;
export type CharacterData = z.infer<typeof CharacterDataSchema>;
export type CharacterGrowth = z.infer<typeof CharacterGrowthSchema>;
export type CharacterExpThreshold = z.infer<typeof CharacterExpThresholdSchema>;
export type ItemCollection = z.infer<typeof ItemCollectionSchema>;
export type ItemData = z.infer<typeof ItemDataSchema>;
export type PsiCollection = z.infer<typeof PsiCollectionSchema>;
export type PsiData = z.infer<typeof PsiDataSchema>;
export type ShopData = z.infer<typeof ShopDataSchema>;
export type ShopEntry = z.infer<typeof ShopEntrySchema>;
export type DialogueSegment = z.infer<typeof DialogueSegmentSchema>;
export type EventEffect = z.infer<typeof EventEffectSchema>;
export type ScriptCollection = z.infer<typeof ScriptCollectionSchema>;
export type ScriptCommand = z.infer<typeof ScriptCommandSchema>;
export type NpcReferenceCollection = z.infer<typeof NpcReferenceCollectionSchema>;
export type CustomDialogue = z.infer<typeof CustomDialogueSchema>;
export type SpriteGroupCollection = z.infer<typeof SpriteGroupCollectionSchema>;
export type TutorialStatus = z.infer<typeof TutorialStatusSchema>;
export type TutorialStep = z.infer<typeof TutorialStepSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export type ResolvedScript = {
  reference: string;
  filePath: string;
  label: string;
  commands: ScriptCommand[];
};

export type NumericFlagState = {
  isSet(flag: number): boolean;
  setNum?(flag: number): void;
  unsetNum?(flag: number): void;
};

export type ConditionalJumpEvent = {
  control: "call" | "goto" | "branch_true" | "branch_false" | "if";
  target?: string;
  condition: boolean;
  action: "taken" | "fallthrough";
};

export type ResolveScriptReferenceFlowOptions = {
  maxCommands?: number;
  maxJumps?: number;
  flags?: NumericFlagState;
  onConditionalJump?: (event: ConditionalJumpEvent) => void;
};

export type ResolvedScriptFlow = ResolvedScript & {
  truncated: boolean;
  truncatedReason?: "cycle" | "command_budget" | "jump_budget" | "missing_target";
  commandsVisited: number;
  jumps: number;
};

export type ResolvedScriptEvents = Omit<ResolvedScriptFlow, "commands"> & {
  commands: ScriptCommand[];
  effects: EventEffect[];
};

export type EventWait =
  | { kind: "confirm"; effect: Extract<EventEffect, { kind: "text" | "prompt" }> }
  | { kind: "pause"; frames: number; remainingFrames: number; effect: Extract<EventEffect, { kind: "pause" }> };

export type EventExecutorAdvanceInput = {
  confirm?: boolean;
  frames?: number;
};

export type EventExecutorAdvanceResult =
  | { done: false; effect: EventEffect; wait?: EventWait }
  | { done: false; wait: EventWait }
  | {
    done: true;
    truncated: boolean;
    truncatedReason?: ResolvedScriptFlow["truncatedReason"];
    commandsVisited: number;
    jumps: number;
  };

export type EventExecutorHost = {
  showText?(segments: readonly DialogueSegment[]): void;
  wait?(wait: EventWait): void;
  isSet?(flag: number): boolean;
  setFlag?(flag: number): void;
  unsetFlag?(flag: number): void;
  give?(char: number, item: number): void;
  take?(char: number, item: number): void;
  money?(op: "give" | "take", amount: number): void;
  atm?(op: "deposit" | "withdraw", amount: number): void;
  openShop?(storeId: number): void;
  party?(op: "add" | "remove", char: number): void;
  warp?(dest: number): void;
  teleport?(dest: number, style: number): void;
  anchorWarp?(): void;
  music?(effect: Extract<EventEffect, { kind: "music" }>): void;
  sound?(id: number): void;
  musicEffect?(id: number): void;
  partyStat?(op: z.infer<typeof PartyStatOpSchema>, char: number, amount: number): void;
  inflict?(char: number, status: number): void;
  learnPsi?(char: number, psi: number): void;
  event?(id: number): void;
  startBattle?(group: number): void;
  control?(effect: Extract<EventEffect, { kind: "control" }>): void;
  terminator?(code: "end" | "eob"): void;
};

export type EventExecutorOptions = Omit<ResolveScriptReferenceFlowOptions, "flags"> & {
  flags?: Pick<NumericFlagState, "isSet">;
};

export const DialoguePageSchema = z.object({
  text: z.string(),
  ended: z.boolean(),
  unknownCommands: z.array(ScriptCommandSchema),
  segments: z.array(DialogueSegmentSchema).default([])
});

export const EventEffectSchema = z.union([
  z.object({
    kind: z.literal("text"),
    segments: z.array(DialogueSegmentSchema)
  }),
  z.object({
    kind: z.literal("pause"),
    frames: z.number().int().nonnegative()
  }),
  z.object({
    kind: z.literal("prompt")
  }),
  FunctionalEventSegmentSchema,
  z.object({
    kind: z.literal("terminator"),
    code: z.enum(["end", "eob"]),
    raw: z.string().optional()
  }),
  z.object({
    kind: z.literal("control"),
    code: z.string().optional(),
    raw: z.string()
  })
]);

export type DialoguePage = z.input<typeof DialoguePageSchema>;

export function resolveScriptReference(scripts: ScriptCollection, reference: string): ResolvedScript | undefined {
  const [scriptFileStem, label] = reference.split(".");
  if (!scriptFileStem || !label) {
    return undefined;
  }
  const file = scripts.files.find((scriptFile) => {
    const normalized = scriptFile.path.replace(/^ccscript\//, "").replace(/\.ccs$/i, "");
    return normalized === scriptFileStem;
  });
  if (!file) {
    return undefined;
  }

  const labelIndex = file.commands.findIndex((command) => command.cmd === "label" && command.name === label);
  if (labelIndex < 0) {
    return undefined;
  }

  const commands: ScriptCommand[] = [];
  for (const command of file.commands.slice(labelIndex + 1)) {
    if (command.cmd === "label") {
      break;
    }
    commands.push(command);
    if (command.cmd === "end" || command.cmd === "eob") {
      break;
    }
  }

  return {
    reference,
    filePath: file.path,
    label,
    commands
  };
}

type ScriptFile = ScriptCollection["files"][number];

type FlowPointer = {
  file: ScriptFile;
  index: number;
  label: string;
  labelKey: string;
};

type FlowFrame = FlowPointer;

type FlowCondition = {
  known: boolean;
  value: boolean;
  result?: boolean;
};

type FlowControl =
  | { kind: "call" | "goto"; target?: string }
  | { kind: "branch"; branchWhen: boolean; code: "branch_true" | "branch_false"; target?: string }
  | { kind: "conditional"; condition: FlowCondition }
  | { kind: "inline_if"; condition: FlowCondition }
  | { kind: "inline_else" | "inline_endif" }
  | { kind: "set" | "unset"; flag?: number };

type FlowAction =
  | { kind: "next" }
  | { kind: "jumped" }
  | { kind: "stop" };

export function resolveScriptReferenceFlow(
  scripts: ScriptCollection,
  reference: string,
  options: ResolveScriptReferenceFlowOptions = {}
): ResolvedScriptFlow | undefined {
  const maxCommands = options.maxCommands ?? 800;
  const maxJumps = options.maxJumps ?? 64;
  const start = resolveLabelPointer(scripts, reference);
  if (!start) {
    return undefined;
  }

  const commands: ScriptCommand[] = [];
  const callStack: FlowFrame[] = [];
  const activeLabels = new Set<string>([start.labelKey]);
  let current: FlowPointer = start;
  let pendingCondition: FlowCondition | undefined;
  let lastFlagResult: boolean | undefined;
  let commandsVisited = 0;
  let jumps = 0;
  let truncated = false;
  let truncatedReason: ResolvedScriptFlow["truncatedReason"];

  const markTruncated = (reason: NonNullable<ResolvedScriptFlow["truncatedReason"]>): FlowAction => {
    truncated = true;
    truncatedReason = reason;
    return { kind: "stop" };
  };

  const popFrame = (): FlowAction => {
    activeLabels.delete(current.labelKey);
    const frame = callStack.pop();
    if (!frame) {
      return { kind: "stop" };
    }
    current = frame;
    pendingCondition = undefined;
    return { kind: "jumped" };
  };

  const followControl = (control: Extract<FlowControl, { kind: "call" | "goto" }>): FlowAction => {
    if (pendingCondition !== undefined) {
      const condition = pendingCondition;
      pendingCondition = undefined;
      if (condition.known) {
        options.onConditionalJump?.({
          control: control.kind,
          ...(control.target ? { target: control.target } : {}),
          condition: condition.value,
          action: condition.value ? "taken" : "fallthrough"
        });
      }
      if (!condition.known || !condition.value) {
        return { kind: "next" };
      }
    }
    if (!control.target) {
      return markTruncated("missing_target");
    }
    const target = resolveTargetPointer(scripts, current.file, control.target);
    if (!target) {
      return markTruncated("missing_target");
    }
    if (activeLabels.has(target.labelKey)) {
      return markTruncated("cycle");
    }
    jumps += 1;
    if (jumps > maxJumps) {
      return markTruncated("jump_budget");
    }

    if (control.kind === "call") {
      callStack.push({
        file: current.file,
        index: current.index + 1,
        label: current.label,
        labelKey: current.labelKey
      });
    } else {
      activeLabels.delete(current.labelKey);
    }

    activeLabels.add(target.labelKey);
    current = target;
    pendingCondition = undefined;
    return { kind: "jumped" };
  };

  const followBranch = (control: Extract<FlowControl, { kind: "branch" }>): FlowAction => {
    const condition = pendingCondition;
    pendingCondition = undefined;
    if (!condition?.known) {
      return { kind: "next" };
    }

    const shouldJump = condition.value === control.branchWhen;
    options.onConditionalJump?.({
      control: control.code,
      ...(control.target ? { target: control.target } : {}),
      condition: condition.value,
      action: shouldJump ? "taken" : "fallthrough"
    });
    if (!shouldJump) {
      return { kind: "next" };
    }
    if (!control.target) {
      return markTruncated("missing_target");
    }
    const target = resolveTargetPointer(scripts, current.file, control.target);
    if (!target) {
      return markTruncated("missing_target");
    }
    if (activeLabels.has(target.labelKey)) {
      return markTruncated("cycle");
    }
    jumps += 1;
    if (jumps > maxJumps) {
      return markTruncated("jump_budget");
    }

    activeLabels.delete(current.labelKey);
    activeLabels.add(target.labelKey);
    current = target;
    return { kind: "jumped" };
  };

  const applyFlagSideEffect = (control: Extract<FlowControl, { kind: "set" | "unset" }>): void => {
    if (control.flag === undefined) {
      return;
    }
    if (control.kind === "set") {
      options.flags?.setNum?.(control.flag);
    } else {
      options.flags?.unsetNum?.(control.flag);
    }
  };

  const skipInlineConditionalBlock = (
    pointer: FlowPointer
  ): { kind: "found"; pointer: FlowPointer } | { kind: "stop" } => {
    let depth = 0;
    for (let index = pointer.index + 1; index < pointer.file.commands.length; index += 1) {
      const command = pointer.file.commands[index];
      if (command.cmd === "label") {
        return { kind: "stop" };
      }
      const flow = flowControlFromCommand(command, options.flags, lastFlagResult);
      if (flow?.kind === "inline_if") {
        depth += 1;
      } else if (flow?.kind === "inline_endif") {
        if (depth === 0) {
          return { kind: "found", pointer: { ...pointer, index: index + 1 } };
        }
        depth -= 1;
      } else if (flow?.kind === "inline_else" && depth === 0) {
        return { kind: "found", pointer: { ...pointer, index: index + 1 } };
      }
    }
    return { kind: "stop" };
  };

  const skipInlineElseBlock = (
    pointer: FlowPointer
  ): { kind: "found"; pointer: FlowPointer } | { kind: "stop" } => {
    let depth = 0;
    for (let index = pointer.index + 1; index < pointer.file.commands.length; index += 1) {
      const command = pointer.file.commands[index];
      if (command.cmd === "label") {
        return { kind: "stop" };
      }
      const flow = flowControlFromCommand(command, options.flags, lastFlagResult);
      if (flow?.kind === "inline_if") {
        depth += 1;
      } else if (flow?.kind === "inline_endif") {
        if (depth === 0) {
          return { kind: "found", pointer: { ...pointer, index: index + 1 } };
        }
        depth -= 1;
      }
    }
    return { kind: "stop" };
  };

  const collectTextCommand = (command: ScriptCommand, segments: DialogueSegment[]) => {
    if (segments.length === 0) {
      return;
    }
    commands.push({
      ...command,
      segments
    });
  };

  const processTextCommand = (command: ScriptCommand): FlowAction => {
    const sourceSegments = command.segments ?? [{ kind: "text" as const, value: command.value ?? command.raw }];
    const collectedSegments: DialogueSegment[] = [];

    for (const segment of sourceSegments) {
      if (segment.kind === "control" && isTerminatorControl(segment.code)) {
        if (callStack.length > 0) {
          collectTextCommand(command, collectedSegments);
          return popFrame();
        }
        collectTextCommand(command, [...collectedSegments, segment]);
        return { kind: "stop" };
      }

      const flow = flowControlFromSegment(segment, options.flags, lastFlagResult);
      if (flow?.kind === "conditional") {
        pendingCondition = flow.condition;
        if (flow.condition.result !== undefined) {
          lastFlagResult = flow.condition.result;
        }
        continue;
      }
      if (flow?.kind === "branch") {
        collectTextCommand(command, collectedSegments);
        const action = followBranch(flow);
        if (action.kind === "next") {
          continue;
        }
        return action;
      }
      if (flow?.kind === "call" || flow?.kind === "goto") {
        collectTextCommand(command, collectedSegments);
        const action = followControl(flow);
        if (action.kind === "next") {
          continue;
        }
        return action;
      }
      if (flow?.kind === "set" || flow?.kind === "unset") {
        applyFlagSideEffect(flow);
        collectedSegments.push(segment);
        pendingCondition = undefined;
        continue;
      }

      collectedSegments.push(segment);
      pendingCondition = undefined;
    }

    collectTextCommand(command, collectedSegments);
    return { kind: "next" };
  };

  while (true) {
    if (commandsVisited >= maxCommands) {
      markTruncated("command_budget");
      break;
    }

    const command = current.file.commands[current.index];
    if (!command) {
      if (callStack.length > 0) {
        const action = popFrame();
        if (action.kind === "stop") {
          break;
        }
        continue;
      }
      break;
    }

    if (command.cmd === "label") {
      if (callStack.length > 0) {
        const action = popFrame();
        if (action.kind === "stop") {
          break;
        }
        continue;
      }
      break;
    }

    commandsVisited += 1;

    if (command.cmd === "text") {
      const action = processTextCommand(command);
      if (action.kind === "stop") {
        break;
      }
      if (action.kind === "next") {
        current = { ...current, index: current.index + 1 };
      }
      continue;
    }

    const flow = flowControlFromCommand(command, options.flags, lastFlagResult);
    if (flow?.kind === "conditional") {
      pendingCondition = flow.condition;
      if (flow.condition.result !== undefined) {
        lastFlagResult = flow.condition.result;
      }
      current = { ...current, index: current.index + 1 };
      continue;
    }
    if (flow?.kind === "branch") {
      const action = followBranch(flow);
      if (action.kind === "stop") {
        break;
      }
      if (action.kind === "next") {
        current = { ...current, index: current.index + 1 };
      }
      continue;
    }
    if (flow?.kind === "inline_if") {
      if (flow.condition.known) {
        options.onConditionalJump?.({
          control: "if",
          condition: flow.condition.value,
          action: flow.condition.value ? "taken" : "fallthrough"
        });
      }
      if (!flow.condition.known || flow.condition.value) {
        current = { ...current, index: current.index + 1 };
      } else {
        const skipped = skipInlineConditionalBlock(current);
        if (skipped.kind === "stop") {
          markTruncated("missing_target");
          break;
        }
        current = skipped.pointer;
      }
      pendingCondition = undefined;
      continue;
    }
    if (flow?.kind === "inline_else") {
      const skipped = skipInlineElseBlock(current);
      if (skipped.kind === "stop") {
        markTruncated("missing_target");
        break;
      }
      current = skipped.pointer;
      pendingCondition = undefined;
      continue;
    }
    if (flow?.kind === "inline_endif") {
      current = { ...current, index: current.index + 1 };
      pendingCondition = undefined;
      continue;
    }
    if (flow?.kind === "call" || flow?.kind === "goto") {
      const action = followControl(flow);
      if (action.kind === "stop") {
        break;
      }
      if (action.kind === "next") {
        current = { ...current, index: current.index + 1 };
      }
      continue;
    }
    if (flow?.kind === "set" || flow?.kind === "unset") {
      applyFlagSideEffect(flow);
      commands.push(command);
      pendingCondition = undefined;
      current = { ...current, index: current.index + 1 };
      continue;
    }

    if (command.cmd === "end" || command.cmd === "eob") {
      if (callStack.length > 0) {
        const action = popFrame();
        if (action.kind === "stop") {
          break;
        }
        continue;
      }
      commands.push(command);
      break;
    }

    commands.push(command);
    pendingCondition = undefined;
    current = { ...current, index: current.index + 1 };
  }

  return {
    reference,
    filePath: start.file.path,
    label: start.label,
    commands,
    truncated,
    ...(truncatedReason ? { truncatedReason } : {}),
    commandsVisited,
    jumps
  };
}

export function resolveScriptEvents(
  scripts: ScriptCollection,
  reference: string,
  host: EventExecutorHost = {},
  options: EventExecutorOptions = {}
): ResolvedScriptEvents | undefined {
  return new EventExecutor(scripts, host, options).start(reference);
}

export class EventExecutor {
  private flow?: ResolvedScriptEvents;
  private index = 0;
  private waiting?: EventWait;
  private readonly dispatched: EventEffect[] = [];

  constructor(
    private readonly scripts: ScriptCollection,
    private readonly host: EventExecutorHost = {},
    private readonly options: EventExecutorOptions = {}
  ) {}

  start(reference: string): ResolvedScriptEvents | undefined {
    const flow = resolveScriptReferenceFlow(this.scripts, reference, {
      maxCommands: this.options.maxCommands,
      maxJumps: this.options.maxJumps,
      onConditionalJump: this.options.onConditionalJump,
      flags: shadowFlagState(this.host, this.options.flags)
    });
    if (!flow) {
      this.flow = undefined;
      this.index = 0;
      this.waiting = undefined;
      this.dispatched.length = 0;
      return undefined;
    }

    this.flow = {
      ...flow,
      effects: eventEffectsFromCommands(flow.commands)
    };
    this.index = 0;
    this.waiting = undefined;
    this.dispatched.length = 0;
    return this.flow;
  }

  get effects(): readonly EventEffect[] {
    return this.flow?.effects ?? [];
  }

  get dispatchedEffects(): readonly EventEffect[] {
    return this.dispatched;
  }

  advance(input: EventExecutorAdvanceInput = {}): EventExecutorAdvanceResult {
    if (!this.releaseWait(input)) {
      return { done: false, wait: this.waiting! };
    }

    const flow = this.flow;
    if (!flow || this.index >= flow.effects.length) {
      return this.completeResult();
    }

    const effect = flow.effects[this.index];
    this.index += 1;
    this.dispatch(effect);
    const wait = waitForEventEffect(effect);
    if (wait) {
      this.waiting = wait;
      this.host.wait?.(wait);
      return { done: false, effect, wait };
    }
    return { done: false, effect };
  }

  private releaseWait(input: EventExecutorAdvanceInput): boolean {
    if (!this.waiting) {
      return true;
    }
    if (this.waiting.kind === "confirm") {
      if (!input.confirm) {
        return false;
      }
      this.waiting = undefined;
      return true;
    }

    const elapsedFrames = Math.max(0, input.frames ?? 0);
    if (elapsedFrames <= 0) {
      return false;
    }
    const remainingFrames = Math.max(0, this.waiting.remainingFrames - elapsedFrames);
    if (remainingFrames > 0) {
      this.waiting = {
        ...this.waiting,
        remainingFrames
      };
      return false;
    }
    this.waiting = undefined;
    return true;
  }

  private completeResult(): EventExecutorAdvanceResult {
    const flow = this.flow;
    return {
      done: true,
      truncated: flow?.truncated ?? false,
      ...(flow?.truncatedReason ? { truncatedReason: flow.truncatedReason } : {}),
      commandsVisited: flow?.commandsVisited ?? 0,
      jumps: flow?.jumps ?? 0
    };
  }

  private dispatch(effect: EventEffect): void {
    this.dispatched.push(effect);
    switch (effect.kind) {
      case "text":
        this.host.showText?.(effect.segments);
        break;
      case "setFlag":
        this.host.setFlag?.(effect.flag);
        break;
      case "unsetFlag":
        this.host.unsetFlag?.(effect.flag);
        break;
      case "give":
        this.host.give?.(effect.char, effect.item);
        break;
      case "take":
        this.host.take?.(effect.char, effect.item);
        break;
      case "money":
        this.host.money?.(effect.op, effect.amount);
        break;
      case "atm":
        this.host.atm?.(effect.op, effect.amount);
        break;
      case "shop":
        this.host.openShop?.(effect.storeId);
        break;
      case "party":
        this.host.party?.(effect.op, effect.char);
        break;
      case "warp":
        this.host.warp?.(effect.dest);
        break;
      case "teleport":
        this.host.teleport?.(effect.dest, effect.style);
        break;
      case "anchorWarp":
        this.host.anchorWarp?.();
        break;
      case "music":
        this.host.music?.(effect);
        break;
      case "sound":
        this.host.sound?.(effect.id);
        break;
      case "musicEffect":
        this.host.musicEffect?.(effect.id);
        break;
      case "partyStat":
        this.host.partyStat?.(effect.op, effect.char, effect.amount);
        break;
      case "inflict":
        this.host.inflict?.(effect.char, effect.status);
        break;
      case "learnPsi":
        this.host.learnPsi?.(effect.char, effect.psi);
        break;
      case "event":
        this.host.event?.(effect.id);
        break;
      case "battle":
        this.host.startBattle?.(effect.group);
        break;
      case "control":
        this.host.control?.(effect);
        break;
      case "terminator":
        this.host.terminator?.(effect.code);
        break;
      case "pause":
      case "prompt":
        break;
    }
  }
}

function shadowFlagState(host: EventExecutorHost, initial?: Pick<NumericFlagState, "isSet">): NumericFlagState {
  const overrides = new Map<number, boolean>();
  return {
    isSet: (flag) => overrides.has(flag)
      ? overrides.get(flag) === true
      : initial?.isSet(flag) ?? host.isSet?.(flag) ?? false,
    setNum: (flag) => {
      overrides.set(flag, true);
    },
    unsetNum: (flag) => {
      overrides.set(flag, false);
    }
  };
}

function waitForEventEffect(effect: EventEffect): EventWait | undefined {
  if (effect.kind === "text" || effect.kind === "prompt") {
    return { kind: "confirm", effect };
  }
  if (effect.kind === "pause" && effect.frames > 0) {
    return {
      kind: "pause",
      frames: effect.frames,
      remainingFrames: effect.frames,
      effect
    };
  }
  return undefined;
}

function eventEffectsFromCommands(commands: ScriptCommand[]): EventEffect[] {
  const effects: EventEffect[] = [];
  let textSegments: DialogueSegment[] = [];
  let lastTextCommand: ScriptCommand | undefined;

  const flushText = (): boolean => {
    if (textSegments.length === 0) {
      return false;
    }
    effects.push({ kind: "text", segments: textSegments });
    textSegments = [];
    lastTextCommand = undefined;
    return true;
  };

  const appendTextSegment = (command: ScriptCommand, segment: DialogueSegment): void => {
    if (lastTextCommand && lastTextCommand !== command && textSegments.length > 0) {
      textSegments.push({ kind: "break", break: "newline" });
    }
    textSegments.push(segment);
    lastTextCommand = command;
  };

  const applySegment = (command: ScriptCommand, segment: DialogueSegment): boolean => {
    if (segment.kind === "control" && segment.code === "next") {
      flushText();
      return true;
    }
    if (segment.kind === "control" && isTerminatorControl(segment.code)) {
      flushText();
      effects.push({ kind: "terminator", code: segment.code, raw: segment.raw });
      return false;
    }
    if (segment.kind === "prompt") {
      const hadText = flushText();
      if (!hadText) {
        effects.push({ kind: "prompt" });
      }
      return true;
    }

    const effect = eventEffectFromSegment(segment);
    if (effect) {
      flushText();
      effects.push(effect);
      return true;
    }
    appendTextSegment(command, segment);
    return true;
  };

  for (const command of commands) {
    if (command.cmd === "text") {
      const sourceSegments = command.segments ?? [{ kind: "text" as const, value: command.value ?? command.raw }];
      for (const segment of sourceSegments) {
        if (!applySegment(command, segment)) {
          return effects;
        }
      }
      continue;
    }

    if (command.cmd === "next") {
      flushText();
      continue;
    }
    if (command.cmd === "end" || command.cmd === "eob") {
      flushText();
      effects.push({ kind: "terminator", code: command.cmd, raw: command.raw });
      return effects;
    }

    const commandEffects = eventEffectsFromCommand(command);
    if (commandEffects.length > 0) {
      flushText();
      effects.push(...commandEffects);
      continue;
    }

    if (command.cmd === "unknown") {
      flushText();
      effects.push({ kind: "control", raw: command.raw });
    }
  }

  flushText();
  return effects;
}

function eventEffectsFromCommand(command: ScriptCommand): EventEffect[] {
  if (command.segments?.length) {
    return command.segments.map(eventEffectFromSegment).filter((effect): effect is EventEffect => Boolean(effect));
  }

  const code = command.cmd === "control" ? command.code : command.cmd;
  if (!code || code === "next") {
    return [];
  }
  if (code === "end" || code === "eob") {
    return [{ kind: "terminator", code, raw: command.raw }];
  }

  const effect = eventEffectFromControlCode(code, command.raw);
  if (effect) {
    return [effect];
  }
  return command.cmd === "control" ? [{ kind: "control", code, raw: command.raw }] : [];
}

function eventEffectFromSegment(segment: DialogueSegment): EventEffect | undefined {
  switch (segment.kind) {
    case "pause":
      return { kind: "pause", frames: segment.frames };
    case "prompt":
      return { kind: "prompt" };
    case "setFlag":
    case "unsetFlag":
    case "party":
    case "warp":
    case "teleport":
    case "anchorWarp":
    case "battle":
    case "give":
    case "take":
    case "money":
    case "atm":
    case "shop":
    case "music":
    case "sound":
    case "musicEffect":
    case "partyStat":
    case "inflict":
    case "learnPsi":
    case "event":
      return segment;
    case "control":
      if (segment.code === "end" || segment.code === "eob") {
        return { kind: "terminator", code: segment.code, raw: segment.raw };
      }
      if (segment.code === "next") {
        return undefined;
      }
      return eventEffectFromControlCode(segment.code, segment.raw) ?? {
        kind: "control",
        code: segment.code,
        raw: segment.raw
      };
    case "text":
    case "break":
    case "substitution":
    case "style":
    case "window":
      return undefined;
  }
}

function eventEffectFromControlCode(code: string, raw: string): EventEffect | undefined {
  const args = numericArgumentsFromRaw(raw);
  switch (code) {
    case "set": {
      const flag = numericArgumentFromRaw(code, raw);
      return flag === undefined ? undefined : { kind: "setFlag", flag, raw };
    }
    case "unset": {
      const flag = numericArgumentFromRaw(code, raw);
      return flag === undefined ? undefined : { kind: "unsetFlag", flag, raw };
    }
    case "party_add":
      return args && args[0] !== undefined ? { kind: "party", op: "add", char: args[0], raw } : undefined;
    case "party_remove":
      return args && args[0] !== undefined ? { kind: "party", op: "remove", char: args[0], raw } : undefined;
    case "warp":
      return args && args[0] !== undefined ? { kind: "warp", dest: args[0], raw } : undefined;
    case "teleport":
      return args && args[0] !== undefined && args[1] !== undefined
        ? { kind: "teleport", dest: args[0], style: args[1], raw }
        : undefined;
    case "anchor_warp":
      return { kind: "anchorWarp", raw };
    case "battle":
      return args && args[0] !== undefined ? { kind: "battle", group: args[0], raw } : undefined;
    case "give":
      return args && args[0] !== undefined && args[1] !== undefined
        ? { kind: "give", char: args[0], item: args[1], raw }
        : undefined;
    case "take":
      return args && args[0] !== undefined && args[1] !== undefined
        ? { kind: "take", char: args[0], item: args[1], raw }
        : undefined;
    case "givemoney":
      return args && args[0] !== undefined ? { kind: "money", op: "give", amount: args[0], raw } : undefined;
    case "takemoney":
      return args && args[0] !== undefined ? { kind: "money", op: "take", amount: args[0], raw } : undefined;
    case "deposit":
    case "atm_deposit":
      return args && args[0] !== undefined ? { kind: "atm", op: "deposit", amount: args[0], raw } : undefined;
    case "withdraw":
    case "atm_withdraw":
      return args && args[0] !== undefined ? { kind: "atm", op: "withdraw", amount: args[0], raw } : undefined;
    case "shop":
      return args && args[0] !== undefined ? { kind: "shop", storeId: args[0], raw } : undefined;
    case "music":
      return args && args[0] !== undefined ? { kind: "music", op: "play", track: args[0], raw } : undefined;
    case "music_stop":
      return { kind: "music", op: "stop", raw };
    case "music_resume":
      return { kind: "music", op: "resume", raw };
    case "sound":
      return args && args[0] !== undefined ? { kind: "sound", id: args[0], raw } : undefined;
    case "music_effect":
      return args && args[0] !== undefined ? { kind: "musicEffect", id: args[0], raw } : undefined;
    case "inflict":
      return args && args[0] !== undefined && args[1] !== undefined
        ? { kind: "inflict", char: args[0], status: args[1], raw }
        : undefined;
    case "learnpsi":
      return args && args[0] !== undefined && args[1] !== undefined
        ? { kind: "learnPsi", char: args[0], psi: args[1], raw }
        : undefined;
    case "event":
      return args && args[0] !== undefined ? { kind: "event", id: args[0], raw } : undefined;
  }

  if (isPartyStatOp(code)) {
    return args && args[0] !== undefined && args[1] !== undefined
      ? { kind: "partyStat", op: code, char: args[0], amount: args[1], raw }
      : undefined;
  }
  return undefined;
}

function isPartyStatOp(code: string): code is z.infer<typeof PartyStatOpSchema> {
  return PARTY_STAT_OPS.has(code as z.infer<typeof PartyStatOpSchema>);
}

const PARTY_STAT_OPS = new Set<z.infer<typeof PartyStatOpSchema>>(PartyStatOpSchema.options);

function resolveLabelPointer(scripts: ScriptCollection, reference: string): FlowPointer | undefined {
  const split = splitScriptReference(reference);
  if (!split) {
    return undefined;
  }
  const file = findScriptFileByStem(scripts, split.scriptFileStem);
  if (!file) {
    return undefined;
  }
  const labelIndex = file.commands.findIndex((command) => command.cmd === "label" && command.name === split.label);
  if (labelIndex < 0) {
    return undefined;
  }
  return {
    file,
    index: labelIndex + 1,
    label: split.label,
    labelKey: labelKey(file, split.label)
  };
}

function resolveTargetPointer(
  scripts: ScriptCollection,
  sourceFile: ScriptFile,
  targetReference: string
): FlowPointer | undefined {
  const trimmed = targetReference.trim();
  const split = splitScriptReference(trimmed);
  const file = split ? findScriptFileByStem(scripts, split.scriptFileStem) : sourceFile;
  const label = split?.label ?? trimmed;
  if (!file || !label) {
    return undefined;
  }
  const labelIndex = file.commands.findIndex((command) => command.cmd === "label" && command.name === label);
  if (labelIndex < 0) {
    return undefined;
  }
  return {
    file,
    index: labelIndex + 1,
    label,
    labelKey: labelKey(file, label)
  };
}

function splitScriptReference(reference: string): { scriptFileStem: string; label: string } | undefined {
  const separator = reference.indexOf(".");
  if (separator < 1 || separator >= reference.length - 1) {
    return undefined;
  }
  return {
    scriptFileStem: reference.slice(0, separator),
    label: reference.slice(separator + 1)
  };
}

function findScriptFileByStem(scripts: ScriptCollection, scriptFileStem: string): ScriptFile | undefined {
  return scripts.files.find((scriptFile) => scriptFileStemForPath(scriptFile.path) === scriptFileStem);
}

function scriptFileStemForPath(filePath: string): string {
  return filePath.replace(/^ccscript\//, "").replace(/\.ccs$/i, "");
}

function labelKey(file: ScriptFile, label: string): string {
  return `${scriptFileStemForPath(file.path)}.${label}`;
}

export function isNpcVisibleForEventFlags(
  showSprite: string | undefined,
  eventFlag: number | undefined,
  flags: Pick<NumericFlagState, "isSet">
): boolean {
  const isSet = eventFlag !== undefined ? flags.isSet(eventFlag) : false;
  switch (showSprite) {
    case "always":
      return true;
    case "when event flag unset":
      return !isSet;
    case "when event flag set":
      return isSet;
    default:
      return false;
  }
}

/** New-game runtime starts with all numeric EarthBound event flags clear. */
export function isNpcVisibleAtAllClear(showSprite: string | undefined, eventFlag: number | undefined): boolean {
  return isNpcVisibleForEventFlags(showSprite, eventFlag, { isSet: () => false });
}

function flowControlFromCommand(
  command: ScriptCommand,
  flags?: NumericFlagState,
  lastFlagResult?: boolean
): FlowControl | undefined {
  const code = command.cmd === "control" ? command.code : command.cmd;
  if (!code) {
    return undefined;
  }
  if (code === "if") {
    return { kind: "inline_if", condition: evaluateInlineIfControl(command.raw, flags, lastFlagResult) };
  }
  if (code === "else") {
    return { kind: "inline_else" };
  }
  if (code === "endif") {
    return { kind: "inline_endif" };
  }
  if (code === "set" || code === "unset") {
    return { kind: code, flag: numericArgumentFromRaw(code, command.raw) };
  }
  if (isConditionalControl(code)) {
    return { kind: "conditional", condition: evaluateConditionalControl(code, command.raw, flags, lastFlagResult) };
  }
  if (code === "branch_true" || code === "branch_false") {
    return {
      kind: "branch",
      code,
      branchWhen: code === "branch_true",
      target: command.target
    };
  }
  if (code === "call" || code === "goto") {
    return { kind: code, target: command.target };
  }
  return undefined;
}

function flowControlFromSegment(
  segment: DialogueSegment,
  flags?: NumericFlagState,
  lastFlagResult?: boolean
): FlowControl | undefined {
  if (segment.kind === "setFlag") {
    return { kind: "set", flag: segment.flag };
  }
  if (segment.kind === "unsetFlag") {
    return { kind: "unset", flag: segment.flag };
  }
  if (segment.kind !== "control") {
    return undefined;
  }
  if (segment.code === "set" || segment.code === "unset") {
    return { kind: segment.code, flag: numericArgumentFromRaw(segment.code, segment.raw) };
  }
  if (isConditionalControl(segment.code)) {
    return { kind: "conditional", condition: evaluateConditionalControl(segment.code, segment.raw, flags, lastFlagResult) };
  }
  if (segment.code === "branch_true" || segment.code === "branch_false") {
    return {
      kind: "branch",
      code: segment.code,
      branchWhen: segment.code === "branch_true",
      target: segment.target
    };
  }
  if (segment.code === "call" || segment.code === "goto") {
    return { kind: segment.code, target: segment.target };
  }
  return undefined;
}

function isConditionalControl(code: string): boolean {
  return CONDITIONAL_CONTROL_CODES.has(code);
}

function isTerminatorControl(code: string): code is "end" | "eob" {
  return code === "end" || code === "eob";
}

function evaluateConditionalControl(
  code: string,
  raw: string,
  flags?: NumericFlagState,
  lastFlagResult?: boolean
): FlowCondition {
  if (code === "isset") {
    const flag = numericArgumentFromRaw(code, raw);
    if (flag === undefined || !flags) {
      return { known: false, value: false };
    }
    const result = flags.isSet(flag);
    return { known: true, value: result, result };
  }
  if (code === "hasitem" || code === "has_item") {
    if (!flags) {
      return { known: false, value: false };
    }
    return { known: true, value: false, result: false };
  }
  if (code === "result_is" || code === "result_not") {
    const expected = booleanArgumentFromRaw(code, raw) ?? true;
    if (lastFlagResult === undefined) {
      return { known: false, value: false };
    }
    const condition = code === "result_is"
      ? lastFlagResult === expected
      : lastFlagResult !== expected;
    return { known: true, value: condition };
  }
  return { known: false, value: false };
}

function evaluateInlineIfControl(
  raw: string,
  flags?: NumericFlagState,
  lastFlagResult?: boolean
): FlowCondition {
  const expression = raw.trim().replace(/^if\b/i, "").replace(/\{\s*$/u, "").trim();
  const negated = expression.startsWith("not ");
  const normalized = negated ? expression.slice(4).trim() : expression;
  const match = /^([A-Za-z_][\w.]*)\s*(?:\((.*)\))?$/u.exec(normalized);
  if (!match) {
    return { known: false, value: false };
  }
  const condition = evaluateConditionalControl(match[1].toLowerCase(), `${match[1]}(${match[2] ?? ""})`, flags, lastFlagResult);
  if (!negated || !condition.known) {
    return condition;
  }
  return {
    known: true,
    value: !condition.value,
    ...(condition.result !== undefined ? { result: condition.result } : {})
  };
}

function numericArgumentFromRaw(code: string, raw: string): number | undefined {
  const bytes = rawBytes(raw);
  if (bytes) {
    if ((code === "set" || code === "unset" || code === "isset") && bytes.length >= 3) {
      return bytes[1] + bytes[2] * 256;
    }
    if ((code === "result_is" || code === "result_not") && bytes.length >= 2) {
      return bytes[1];
    }
  }

  const stripped = raw.trim().replace(/^\{|\}$/g, "");
  const match = /^[A-Za-z_][\w.]*\s*\(([^),]*)/.exec(stripped);
  if (!match) {
    return undefined;
  }
  return parseNumericLiteral(match[1].trim());
}

function booleanArgumentFromRaw(code: string, raw: string): boolean | undefined {
  const value = numericArgumentFromRaw(code, raw);
  return value === undefined ? undefined : value !== 0;
}

function numericArgumentsFromRaw(raw: string): number[] | undefined {
  const stripped = raw.trim().replace(/^\{|\}$/g, "");
  const match = /^[A-Za-z_][\w.]*\s*(?:\((.*)\))?$/.exec(stripped);
  if (!match) {
    return undefined;
  }
  const argsText = match[1];
  if (!argsText?.trim()) {
    return [];
  }
  const parsed = argsText.split(",").map((item) => parseNumericLiteral(item.trim()));
  return parsed.every((item): item is number => item !== undefined) ? parsed : undefined;
}

function rawBytes(raw: string): number[] | undefined {
  const match = /^\[([0-9a-f]{2}(?:\s+[0-9a-f]{2})*)\]$/i.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  return match[1].split(/\s+/).map((part) => Number.parseInt(part, 16));
}

function parseNumericLiteral(value: string): number | undefined {
  const flagMatch = /^flag\s+(0x[0-9a-f]+|\d+)$/i.exec(value);
  if (flagMatch) {
    return parseNumericLiteral(flagMatch[1]);
  }
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(2), 16);
  }
  if (/^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

const CONDITIONAL_CONTROL_CODES = new Set([
  "result_is",
  "result_not",
  "isset",
  "hasitem",
  "has_item",
  "hasmoney",
  "has_money",
  "checkgoods",
  "check_goods"
]);

export function buildDialoguePages(commands: ScriptCommand[]): DialoguePage[] {
  const pages: DialoguePage[] = [];
  let currentText = "";
  let currentSegments: DialogueSegment[] = [];
  let currentUnknowns: ScriptCommand[] = [];
  let ended = false;
  let lastTextCommand: ScriptCommand | undefined;

  const pushPage = () => {
    if (currentText.length === 0 && currentSegments.length === 0 && currentUnknowns.length === 0 && !ended) {
      return;
    }
    pages.push({
      text: currentText,
      ended,
      unknownCommands: currentUnknowns,
      segments: currentSegments
    });
    currentText = "";
    currentSegments = [];
    currentUnknowns = [];
    ended = false;
    lastTextCommand = undefined;
  };

  const appendFlattenedText = (command: ScriptCommand, value: string) => {
    if (lastTextCommand && lastTextCommand !== command && currentText.length > 0) {
      currentText += "\n";
    }
    currentText += value;
    lastTextCommand = command;
  };

  for (const command of commands) {
    if (command.cmd === "text") {
      const segments = command.segments ?? [{ kind: "text" as const, value: command.value ?? command.raw }];
      for (const segment of segments) {
        currentSegments.push(segment);
        if (segment.kind === "text") {
          appendFlattenedText(command, segment.value);
        } else if (segment.kind === "break") {
          appendFlattenedText(command, "\n");
        }

        if (segment.kind === "prompt" || (segment.kind === "control" && segment.code === "next")) {
          pushPage();
        } else if (segment.kind === "control" && (segment.code === "end" || segment.code === "eob")) {
          ended = true;
          pushPage();
          return pages;
        }
      }
    } else if (command.cmd === "next") {
      pushPage();
    } else if (command.cmd === "end" || command.cmd === "eob") {
      ended = true;
      pushPage();
      break;
    } else if (command.cmd === "unknown") {
      currentUnknowns.push(command);
    }
  }
  pushPage();

  return pages.length > 0
    ? pages
    : [{ text: "No imported script text was found.", ended: true, unknownCommands: [], segments: [] }];
}
