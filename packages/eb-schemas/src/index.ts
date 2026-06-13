import { z } from "zod";

export const SCHEMA_VERSION = "0.2.0";

export const ValidationSeveritySchema = z.enum(["info", "warning", "error"]);

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive()
});

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
  })
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
  movement: z.string().optional(),
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
  npcs: z.array(WorldNpcSchema),
  player: z
    .object({
      spriteGroup: z.number().int().nonnegative(),
      sheet: z.string().optional(),
      spawnRegionPixel: z.object({ x: z.number().int(), y: z.number().int() }),
      spawnWorldPixel: z.object({ x: z.number().int(), y: z.number().int() }),
      spawnDerivation: z.string()
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

export const WorldChunkedSchema = z.object({
  schemaVersion: z.string(),
  sourceProjectPath: z.string(),
  available: z.literal(true),
  mode: z.literal("full"),
  tileSize: z.number().int().positive(),
  mapWidthTiles: z.number().int().positive(),
  mapHeightTiles: z.number().int().positive(),
  chunkSizeTiles: z.number().int().positive(),
  chunks: z.array(WorldChunkSchema),
  collision: WorldCollisionSchema,
  npcs: z.array(WorldChunkedNpcSchema),
  player: z.object({
    spriteGroup: z.number().int().nonnegative(),
    sheet: z.string().optional(),
    spawnWorldPixel: PixelSchema,
    spawnDerivation: z.string()
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

export const BattleActionSchema = z.object({
  id: z.number().int().nonnegative(),
  arg: z.number().int().nonnegative()
});

export const BattleEnemySchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  spriteId: z.number().int().nonnegative(),
  level: z.number().int().nonnegative(),
  hp: z.number().int().nonnegative(),
  defense: z.number().int().nonnegative(),
  offense: z.number().int().nonnegative(),
  experience: z.number().int().nonnegative(),
  bossFlag: z.boolean(),
  actions: z.array(BattleActionSchema).length(4),
  itemDropped: z.number().int().nonnegative().nullable()
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
    experience: z.string(),
    bossFlag: z.string(),
    actions: z.string(),
    itemDropped: z.string()
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
  counts: z.object({
    enemies: z.number().int().nonnegative(),
    groups: z.number().int().nonnegative(),
    spriteFiles: z.number().int().nonnegative(),
    backgroundFiles: z.number().int().nonnegative()
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
    battle: z.string().optional()
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
    battleEnemies: z.number().int().nonnegative().optional(),
    battleGroups: z.number().int().nonnegative().optional(),
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
export type SpriteSheet = z.infer<typeof SpriteSheetSchema>;
export type SpriteFacing = z.infer<typeof SpriteFacingSchema>;
export type SpriteAnimations = z.infer<typeof SpriteAnimationsSchema>;
export type SpriteSheetCollection = z.infer<typeof SpriteSheetCollectionSchema>;
export type BattleData = z.infer<typeof BattleDataSchema>;
export type BattleEnemy = z.infer<typeof BattleEnemySchema>;
export type BattleGroup = z.infer<typeof BattleGroupSchema>;
export type DialogueSegment = z.infer<typeof DialogueSegmentSchema>;
export type ScriptCollection = z.infer<typeof ScriptCollectionSchema>;
export type ScriptCommand = z.infer<typeof ScriptCommandSchema>;
export type NpcReferenceCollection = z.infer<typeof NpcReferenceCollectionSchema>;
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

export const DialoguePageSchema = z.object({
  text: z.string(),
  ended: z.boolean(),
  unknownCommands: z.array(ScriptCommandSchema),
  segments: z.array(DialogueSegmentSchema).default([])
});

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

function isTerminatorControl(code: string): boolean {
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
