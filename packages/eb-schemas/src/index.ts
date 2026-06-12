import { z } from "zod";

export const SCHEMA_VERSION = "0.2.0";

export const ValidationSeveritySchema = z.enum(["info", "warning", "error"]);

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive()
});

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
  name: z.string().optional()
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

export const WorldNpcSchema = z.object({
  npcId: z.number().int().nonnegative(),
  spriteGroup: z.number().int().nonnegative().optional(),
  direction: z.string().optional(),
  type: z.string().optional(),
  movement: z.string().optional(),
  showSprite: z.string().optional(),
  textPointer: z.string().optional(),
  textPointer2: z.string().optional(),
  interactable: z.boolean(),
  visible: z.boolean(),
  worldPixel: z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }),
  regionPixel: z.object({ x: z.number().int(), y: z.number().int() }),
  sheet: z.string().optional(),
  sourceLocation: SourceLocationSchema.optional()
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
  collision: z
    .object({
      cellSize: z.number().int().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      solidRows: z.array(z.string()),
      surfaceRows: z.array(z.string())
    })
    .optional(),
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
  sources: z.object({
    mapTiles: z.boolean(),
    mapSectors: z.boolean(),
    tilesetFiles: z.number().int().nonnegative(),
    mapSprites: z.boolean(),
    npcConfig: z.boolean(),
    spriteGroupsYml: z.boolean()
  }),
  counts: z.object({
    npcs: z.number().int().nonnegative(),
    visibleNpcs: z.number().int().nonnegative(),
    solidCells: z.number().int().nonnegative(),
    mapTilesetsUsed: z.number().int().nonnegative(),
    palettesUsed: z.number().int().nonnegative()
  }),
  warnings: z.array(ValidationIssueSchema)
});

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
    sprites: z.string()
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
export type WorldNpc = z.infer<typeof WorldNpcSchema>;
export type SpriteSheet = z.infer<typeof SpriteSheetSchema>;
export type SpriteFacing = z.infer<typeof SpriteFacingSchema>;
export type SpriteAnimations = z.infer<typeof SpriteAnimationsSchema>;
export type SpriteSheetCollection = z.infer<typeof SpriteSheetCollectionSchema>;
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

export type DialoguePage = {
  text: string;
  ended: boolean;
  unknownCommands: ScriptCommand[];
};

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

export function buildDialoguePages(commands: ScriptCommand[]): DialoguePage[] {
  const pages: DialoguePage[] = [];
  let currentText: string[] = [];
  let currentUnknowns: ScriptCommand[] = [];
  let ended = false;

  const pushPage = () => {
    if (currentText.length === 0 && currentUnknowns.length === 0 && !ended) {
      return;
    }
    pages.push({
      text: currentText.join("\n"),
      ended,
      unknownCommands: currentUnknowns
    });
    currentText = [];
    currentUnknowns = [];
    ended = false;
  };

  for (const command of commands) {
    if (command.cmd === "text") {
      currentText.push(command.value ?? command.raw);
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

  return pages.length > 0 ? pages : [{ text: "No imported script text was found.", ended: true, unknownCommands: [] }];
}
