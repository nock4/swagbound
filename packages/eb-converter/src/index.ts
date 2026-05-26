import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ManifestSchema,
  NpcReferenceCollectionSchema,
  SCHEMA_VERSION,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  ValidationReportSchema,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type ScriptCommand,
  type SpriteGroupCollection,
  type ValidationIssue,
  type ValidationReport
} from "@eb/schemas";

const DEFAULT_PROJECT = "external/coilsnake-project";
const DEFAULT_OUT = "apps/game/public/generated";
const GENERATED_FILES = {
  scripts: "scripts.json",
  npcs: "npcs.json",
  spriteGroups: "sprite-groups.json",
  validationReport: "validation-report.json"
} as const;

type CliArgs = {
  project: string;
  out: string;
};

type ConvertResult = {
  manifest: Manifest;
  scripts: ScriptCollection;
  npcs: NpcReferenceCollection;
  spriteGroups: SpriteGroupCollection;
  validationReport: ValidationReport;
};

export function parseArgs(argv: string[]): CliArgs {
  const args = { project: DEFAULT_PROJECT, out: DEFAULT_OUT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.project = argv[index + 1] ?? args.project;
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? args.out;
      index += 1;
    }
  }
  return args;
}

export function parseCcsFile(relativePath: string, source: string): {
  commands: ScriptCommand[];
  labels: string[];
  warnings: ValidationIssue[];
} {
  const commands: ScriptCommand[] = [];
  const labels: string[] = [];
  const warnings: ValidationIssue[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const withoutComment = stripComment(line);
    const trimmed = withoutComment.trim();
    if (!trimmed) {
      return;
    }
    const column = Math.max(1, withoutComment.search(/\S/) + 1);
    const sourceLocation = { file: relativePath, line: index + 1, column };

    const labelMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s*:\s*$/);
    if (labelMatch) {
      const name = labelMatch[1];
      labels.push(name);
      commands.push({ cmd: "label", name, raw: trimmed, sourceLocation });
      return;
    }

    const textAndCommand = trimmed.match(/^"([^"]*)"\s+([A-Za-z_][\w.]*)\s*$/);
    if (textAndCommand) {
      commands.push({
        cmd: "text",
        value: textAndCommand[1],
        raw: `"${textAndCommand[1]}"`,
        sourceLocation
      });
      commands.push({
        cmd: normalizeKnownCommand(textAndCommand[2]),
        raw: textAndCommand[2],
        sourceLocation: {
          ...sourceLocation,
          column: line.indexOf(textAndCommand[2]) + 1
        }
      });
      addUnknownWarning(commands.at(-1), warnings);
      return;
    }

    const textMatch = trimmed.match(/^"([^"]*)"\s*$/);
    if (textMatch) {
      commands.push({ cmd: "text", value: textMatch[1], raw: trimmed, sourceLocation });
      return;
    }

    const cmd = normalizeKnownCommand(trimmed);
    const command = { cmd, raw: trimmed, sourceLocation };
    commands.push(command);
    addUnknownWarning(command, warnings);
  });

  return { commands, labels, warnings };
}

export async function convertProject(options: Partial<CliArgs> = {}): Promise<ConvertResult> {
  const project = options.project ?? DEFAULT_PROJECT;
  const out = options.out ?? DEFAULT_OUT;
  const projectAbs = resolveFromRoot(project);
  const outAbs = resolveFromRoot(out);
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  const generatedAt = new Date().toISOString();

  await mkdir(outAbs, { recursive: true });
  await clearGeneratedOutput(outAbs);

  const projectExists = existsSync(projectAbs);
  const projectSnakePath = path.join(projectAbs, "Project.snake");
  const hasProjectSnake = projectExists && existsSync(projectSnakePath);
  const detectedFolders = projectExists ? await listDetectedFolders(projectAbs) : [];

  if (!projectExists) {
    warnings.push(issue("warning", "missing_project", "CoilSnake project path is missing.", project));
  } else if (!hasProjectSnake) {
    warnings.push(issue("warning", "missing_project_snake", "Project.snake is missing.", "Project.snake"));
  }

  const scripts = await readScripts(projectAbs, project, projectExists, warnings);
  const npcs = await readNpcReferences(projectAbs, project, projectExists);
  const spriteGroups = await readSpriteGroups(projectAbs, project, projectExists, warnings);
  const referencesRobotHelloWorld = npcs.references.some((reference) => reference.reference === "robot.hello_world");
  const robotFile = scripts.files.find((file) => file.path === "ccscript/robot.ccs");
  const helloWorldIndex = robotFile?.commands.findIndex(
    (command) => command.cmd === "label" && command.name === "hello_world"
  ) ?? -1;
  const hasRobotHelloWorldContent = helloWorldIndex >= 0
    ? robotFile?.commands.slice(helloWorldIndex + 1).some((command) => command.cmd === "text" || isKnownRuntimeCommand(command.cmd)) ?? false
    : false;

  const sourceProject = {
    path: makeDisplayPath(project),
    exists: projectExists,
    hasProjectSnake,
    detectedFolders,
    tutorialFixtureHints: {
      hasRobotCcs: Boolean(robotFile),
      hasHelloWorldLabel: Boolean(robotFile?.labels.includes("hello_world")),
      hasRobotHelloWorldContent,
      hasSpriteGroup005: spriteGroups.images.some((image) => image.path === "SpriteGroups/005.png"),
      npcReferencesRobotHelloWorld: referencesRobotHelloWorld
    }
  };

  if (projectExists && !sourceProject.tutorialFixtureHints.hasRobotCcs) {
    warnings.push(issue("warning", "missing_robot_ccs", "Tutorial robot.ccs is missing.", "ccscript/robot.ccs"));
  }
  if (projectExists && sourceProject.tutorialFixtureHints.hasRobotCcs && !sourceProject.tutorialFixtureHints.hasHelloWorldLabel) {
    warnings.push(issue("warning", "missing_hello_world", "robot.ccs does not contain hello_world label.", "ccscript/robot.ccs"));
  }
  if (projectExists && !sourceProject.tutorialFixtureHints.hasSpriteGroup005) {
    warnings.push(issue("info", "missing_sprite_group_005", "Tutorial SpriteGroups/005.png was not found.", "SpriteGroups/005.png"));
  }
  if (projectExists && !referencesRobotHelloWorld) {
    warnings.push(issue("info", "missing_robot_hello_world_reference", "No text/YML NPC reference to robot.hello_world was found.", "robot.hello_world"));
  }

  const manifest: Manifest = ManifestSchema.parse({
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
      warnings: warnings.length + scripts.warnings.length + npcs.warnings.length + spriteGroups.warnings.length,
      errors: errors.length
    },
    warnings: [...warnings, ...scripts.warnings, ...npcs.warnings, ...spriteGroups.warnings],
    errors
  });

  const validationReport: ValidationReport = ValidationReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    generatedFiles: ["manifest.json", GENERATED_FILES.scripts, GENERATED_FILES.npcs, GENERATED_FILES.spriteGroups, GENERATED_FILES.validationReport],
    issues: [...manifest.warnings, ...manifest.errors],
    counts: {
      warnings: manifest.warnings.filter((item) => item.severity !== "info").length,
      errors: manifest.errors.length
    }
  });

  await writeJson(path.join(outAbs, "manifest.json"), manifest);
  await writeJson(path.join(outAbs, GENERATED_FILES.scripts), scripts);
  await writeJson(path.join(outAbs, GENERATED_FILES.npcs), npcs);
  await writeJson(path.join(outAbs, GENERATED_FILES.spriteGroups), spriteGroups);
  await writeJson(path.join(outAbs, GENERATED_FILES.validationReport), validationReport);

  return { manifest, scripts, npcs, spriteGroups, validationReport };
}

async function readScripts(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  warnings: ValidationIssue[]
): Promise<ScriptCollection> {
  const ccscriptAbs = path.join(projectAbs, "ccscript");
  if (!projectExists || !existsSync(ccscriptAbs)) {
    if (projectExists) {
      warnings.push(issue("warning", "missing_ccscript", "ccscript directory is missing.", "ccscript"));
    }
    return emptyScripts(projectDisplayPath);
  }

  const ccsFiles = (await walk(ccscriptAbs))
    .filter((file) => file.endsWith(".ccs"))
    .sort();
  const files = [];
  const scriptWarnings: ValidationIssue[] = [];
  for (const fileAbs of ccsFiles) {
    const relativePath = toPosix(path.relative(projectAbs, fileAbs));
    const parsed = parseCcsFile(relativePath, await readFile(fileAbs, "utf8"));
    scriptWarnings.push(...parsed.warnings);
    files.push({
      path: relativePath,
      commands: parsed.commands,
      labels: parsed.labels,
      counts: countCommands(parsed.commands),
      warnings: parsed.warnings
    });
  }

  const collection = {
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    files,
    counts: {
      files: files.length,
      commands: sum(files, (file) => file.counts.commands),
      labels: sum(files, (file) => file.counts.labels),
      textCommands: sum(files, (file) => file.counts.textCommands),
      unknownCommands: sum(files, (file) => file.counts.unknownCommands)
    },
    warnings: scriptWarnings
  };
  return ScriptCollectionSchema.parse(collection);
}

async function readSpriteGroups(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  warnings: ValidationIssue[]
): Promise<SpriteGroupCollection> {
  const spriteAbs = path.join(projectAbs, "SpriteGroups");
  if (!projectExists || !existsSync(spriteAbs)) {
    if (projectExists) {
      warnings.push(issue("info", "missing_sprite_groups", "SpriteGroups directory is missing.", "SpriteGroups"));
    }
    return emptySpriteGroups(projectDisplayPath);
  }

  const images = [];
  for (const fileAbs of (await walk(spriteAbs)).filter((file) => file.toLowerCase().endsWith(".png")).sort()) {
    const parsed = await readPngSize(fileAbs);
    const basename = path.basename(fileAbs);
    const numericId = basename.match(/^(\d+)\.png$/i);
    images.push({
      path: toPosix(path.relative(projectAbs, fileAbs)),
      id: numericId ? Number(numericId[1]) : undefined,
      extension: ".png",
      ...(parsed ?? {})
    });
  }

  return SpriteGroupCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    images,
    counts: { images: images.length },
    warnings: []
  });
}

export async function readNpcReferences(
  projectAbs: string,
  projectDisplayPath: string = projectAbs,
  projectExists = existsSync(projectAbs)
): Promise<NpcReferenceCollection> {
  if (!projectExists) {
    return emptyNpcReferences(projectDisplayPath);
  }
  const files = (await walk(projectAbs)).filter((file) => {
    const name = path.basename(file).toLowerCase();
    const looksText = name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".txt");
    const looksRelevant = ["npc", "sprite", "event", "hotspot", "placement"].some((part) => name.includes(part));
    return looksText && looksRelevant;
  });

  const references = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const relativePath = toPosix(path.relative(projectAbs, file));
    const lines = contents.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const referencePattern = /\b([A-Za-z_][\w-]*)\.([A-Za-z_][\w-]*)\b/g;
      for (const match of line.matchAll(referencePattern)) {
        const scriptFileStem = match[1];
        const label = match[2];
        references.push({
          reference: `${scriptFileStem}.${label}`,
          scriptFileStem,
          label,
          sourceLocation: {
            file: relativePath,
            line: lineIndex + 1,
            column: (match.index ?? 0) + 1
          },
          raw: line.trim(),
          contextType: inferContextType(relativePath)
        });
      }
    }
  }

  return NpcReferenceCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    references,
    counts: { references: references.length },
    warnings: []
  });
}

function stripComment(line: string): string {
  let inQuote = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    if (line[index] === '"') {
      inQuote = !inQuote;
    }
    if (!inQuote && line[index] === "/" && line[index + 1] === "/") {
      return line.slice(0, index);
    }
  }
  return line;
}

function normalizeKnownCommand(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return isKnownRuntimeCommand(lower) ? lower : "unknown";
}

function isKnownRuntimeCommand(cmd: string): boolean {
  return cmd === "next" || cmd === "end" || cmd === "eob";
}

function addUnknownWarning(command: ScriptCommand | undefined, warnings: ValidationIssue[]): void {
  if (command?.cmd !== "unknown") {
    return;
  }
  warnings.push(issue("warning", "unknown_ccscript_command", `Unknown CCScript command preserved: ${command.raw}`, command.sourceLocation.file));
}

function countCommands(commands: ScriptCommand[]) {
  return {
    commands: commands.length,
    labels: commands.filter((command) => command.cmd === "label").length,
    textCommands: commands.filter((command) => command.cmd === "text").length,
    unknownCommands: commands.filter((command) => command.cmd === "unknown").length
  };
}

async function listDetectedFolders(projectAbs: string): Promise<string[]> {
  const entries = await readdir(projectAbs, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  }));
  return files.flat();
}

async function readPngSize(file: string): Promise<{ width: number; height: number } | undefined> {
  const buffer = await readFile(file);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function clearGeneratedOutput(outAbs: string): Promise<void> {
  const entries = await readdir(outAbs, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.name === ".gitkeep") {
      return;
    }
    await rm(path.join(outAbs, entry.name), { recursive: true, force: true });
  }));
}

function emptyScripts(projectDisplayPath: string): ScriptCollection {
  return ScriptCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    files: [],
    counts: { files: 0, commands: 0, labels: 0, textCommands: 0, unknownCommands: 0 },
    warnings: []
  });
}

function emptySpriteGroups(projectDisplayPath: string): SpriteGroupCollection {
  return SpriteGroupCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    images: [],
    counts: { images: 0 },
    warnings: []
  });
}

function emptyNpcReferences(projectDisplayPath: string): NpcReferenceCollection {
  return NpcReferenceCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    references: [],
    counts: { references: 0 },
    warnings: []
  });
}

function inferContextType(relativePath: string): string {
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.includes("npc")) {
    return "npc";
  }
  if (lowerPath.includes("sprite")) {
    return "sprite";
  }
  if (lowerPath.includes("event")) {
    return "event";
  }
  return "unknown";
}

function issue(severity: "info" | "warning" | "error", code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: makeDisplayPath(issuePath) } : {}) };
}

function makeDisplayPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? `[debug-absolute] ${toPosix(inputPath)}` : toPosix(inputPath);
}

function resolveFromRoot(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.env.INIT_CWD ?? process.cwd(), inputPath);
}

function toPosix(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}

function sum<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  convertProject(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        ok: result.manifest.errors.length === 0,
        files: ["manifest.json", GENERATED_FILES.scripts, GENERATED_FILES.npcs, GENERATED_FILES.spriteGroups, GENERATED_FILES.validationReport],
        counts: result.manifest.counts,
        warnings: result.manifest.warnings,
        errors: result.manifest.errors
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
