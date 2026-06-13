import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ManifestSchema,
  NpcReferenceCollectionSchema,
  SCHEMA_VERSION,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  type DialogueSegment,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type ScriptCommand,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TutorialStatus,
  type ValidationIssue,
  type ValidationReport,
  type WorldArtifact
} from "@eb/schemas";
import { buildWorldArtifacts, TUTORIAL_NPC_ID, type WorldMode } from "./world";

const DEFAULT_PROJECT = "external/coilsnake-project";
const DEFAULT_OUT = "apps/game/public/generated";
const GENERATED_FILES = {
  scripts: "scripts.json",
  npcs: "npcs.json",
  spriteGroups: "sprite-groups.json",
  tutorialStatus: "tutorial-status.json",
  validationReport: "validation-report.json",
  world: "world.json",
  sprites: "sprites.json"
} as const;

const TUTORIAL_URL = "https://github.com/pk-hack/CoilSnake/wiki/Tutorial%3A-Your-First-Hack";

type CliArgs = {
  project: string;
  out: string;
  worldMode: WorldMode;
  spawnWorldPixel?: { x: number; y: number };
};

type ConvertResult = {
  manifest: Manifest;
  scripts: ScriptCollection;
  npcs: NpcReferenceCollection;
  spriteGroups: SpriteGroupCollection;
  tutorialStatus: TutorialStatus;
  validationReport: ValidationReport;
  world: WorldArtifact;
  sprites: SpriteSheetCollection;
};

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    project: process.env.EB_PROJECT ?? DEFAULT_PROJECT,
    out: DEFAULT_OUT,
    worldMode: parseWorldMode(process.env.EB_WORLD_MODE),
    ...(process.env.EB_SPAWN ? { spawnWorldPixel: parseSpawn(process.env.EB_SPAWN) } : {})
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.project = argv[index + 1] ?? args.project;
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? args.out;
      index += 1;
    } else if (arg === "--world-mode") {
      args.worldMode = parseWorldMode(argv[index + 1]);
      index += 1;
    } else if (arg === "--spawn") {
      args.spawnWorldPixel = parseSpawn(argv[index + 1]);
      index += 1;
    }
  }
  return args;
}

function parseWorldMode(value: string | undefined): WorldMode {
  if (!value || value === "region") {
    return "region";
  }
  if (value === "full") {
    return "full";
  }
  throw new Error(`Unsupported EB_WORLD_MODE "${value}". Expected "region" or "full".`);
}

function parseSpawn(value: string | undefined): { x: number; y: number } {
  const match = /^(\d+),(\d+)$/.exec(value ?? "");
  if (!match) {
    throw new Error(`Invalid EB_SPAWN "${value ?? ""}". Expected "x,y" world pixels.`);
  }
  return { x: Number.parseInt(match[1], 10), y: Number.parseInt(match[2], 10) };
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

    const quotedLine = trimmed.match(/^"([^"]*)"\s*(.*)$/);
    if (quotedLine) {
      const text = quotedLine[1];
      const trailingCommand = quotedLine[2].trim();
      commands.push({
        cmd: "text",
        value: text,
        segments: tokenizeCcsString(text),
        raw: `"${text}"`,
        sourceLocation
      });
      if (trailingCommand) {
        commands.push({
          cmd: normalizeKnownCommand(trailingCommand),
          raw: trailingCommand,
          sourceLocation: {
            ...sourceLocation,
            column: line.indexOf(trailingCommand) + 1
          }
        });
        addUnknownWarning(commands.at(-1), warnings);
      }
      return;
    }

    const cmd = normalizeKnownCommand(trimmed);
    const command = { cmd, raw: trimmed, sourceLocation };
    commands.push(command);
    addUnknownWarning(command, warnings);
  });

  return { commands, labels, warnings };
}

type CcsTextCodeRegistryEntry = {
  opcode: string;
  length: number;
  matches: (bytes: number[], offset: number) => boolean;
  toSegment: (bytes: number[], raw: string) => DialogueSegment;
};

const byte = (value: number) => value.toString(16).toUpperCase().padStart(2, "0");

function signature(...values: number[]) {
  return (bytes: number[], offset: number) =>
    values.every((value, index) => bytes[offset + index] === value);
}

function prefixed(...values: number[]) {
  return (bytes: number[], offset: number) =>
    values.every((value, index) => bytes[offset + index] === value);
}

const controlSegment = (code: string, raw: string): DialogueSegment => ({ kind: "control", code, raw });

const substitutionSegment = (
  name: Extract<DialogueSegment, { kind: "substitution" }>["name"],
  args: number[]
): DialogueSegment => ({ kind: "substitution", name, args });

const styleSegment = (
  style: Extract<DialogueSegment, { kind: "style" }>["style"],
  args: number[] = [],
  value?: string
): DialogueSegment => ({
  kind: "style",
  style,
  ...(value ? { value } : {}),
  ...(args.length > 0 ? { args } : {})
});

const windowSegment = (
  op: Extract<DialogueSegment, { kind: "window" }>["op"],
  args: number[] = []
): DialogueSegment => ({ kind: "window", op, args });

function fixedCode(
  opcode: string,
  values: number[],
  toSegment: (bytes: number[], raw: string) => DialogueSegment
): CcsTextCodeRegistryEntry {
  return {
    opcode,
    length: values.length,
    matches: (bytes, offset) => offset + values.length <= bytes.length && signature(...values)(bytes, offset),
    toSegment
  };
}

function prefixCode(
  opcode: string,
  length: number,
  values: number[],
  toSegment: (bytes: number[], raw: string) => DialogueSegment
): CcsTextCodeRegistryEntry {
  return {
    opcode,
    length,
    matches: (bytes, offset) => offset + length <= bytes.length && prefixed(...values)(bytes, offset),
    toSegment
  };
}

// Derived from CoilSnake-master/coilsnake/assets/mobile-sprout/lib/std.ccs.
export const CCS_TEXT_CODE_REGISTRY: CcsTextCodeRegistryEntry[] = [
  fixedCode("13 02", [0x13, 0x02], (_bytes, raw) => controlSegment("end", raw)),
  fixedCode("03 00", [0x03, 0x00], (_bytes, raw) => controlSegment("next", raw)),
  fixedCode("00", [0x00], () => ({ kind: "break", break: "line" })),
  fixedCode("01", [0x01], () => ({ kind: "break", break: "newline" })),
  fixedCode("02", [0x02], (_bytes, raw) => controlSegment("eob", raw)),
  fixedCode("13", [0x13], () => ({ kind: "prompt" })),
  fixedCode("14", [0x14], () => ({ kind: "prompt" })),
  prefixCode("10", 2, [0x10], (bytes) => ({ kind: "pause", frames: bytes[1] })),
  fixedCode("12", [0x12], () => ({ kind: "break", break: "clear" })),
  fixedCode("18 00", [0x18, 0x00], () => windowSegment("closeTop")),
  prefixCode("18 01", 3, [0x18, 0x01], (bytes) => windowSegment("open", [bytes[2]])),
  prefixCode("18 03", 3, [0x18, 0x03], (bytes) => windowSegment("switch", [bytes[2]])),
  fixedCode("18 04", [0x18, 0x04], () => windowSegment("closeAll")),
  fixedCode("18 06", [0x18, 0x06], () => windowSegment("clear")),
  prefixCode("1C 00", 3, [0x1C, 0x00], (bytes) => styleSegment("color", [bytes[2]])),
  prefixCode("1C 01", 3, [0x1C, 0x01], (bytes) => substitutionSegment("stat", [bytes[2]])),
  prefixCode("1C 02", 3, [0x1C, 0x02], (bytes) =>
    substitutionSegment(bytes[2] === 0 ? "playerName" : "partyChar", [bytes[2]])
  ),
  prefixCode("1C 05", 3, [0x1C, 0x05], (bytes) => substitutionSegment("item", [bytes[2]])),
  prefixCode("1C 06", 3, [0x1C, 0x06], (bytes) => substitutionSegment("teleport", [bytes[2]])),
  prefixCode("1C 0A", 6, [0x1C, 0x0A], (bytes) => substitutionSegment("number", [readLittleEndian(bytes.slice(2))])),
  prefixCode("1C 0B", 6, [0x1C, 0x0B], (bytes) => substitutionSegment("money", [readLittleEndian(bytes.slice(2))])),
  fixedCode("1C 0D", [0x1C, 0x0D], () => substitutionSegment("user", [])),
  fixedCode("1C 0E", [0x1C, 0x0E], () => substitutionSegment("target", [])),
  prefixCode("1C 12", 3, [0x1C, 0x12], (bytes) => substitutionSegment("psi", [bytes[2]])),
  prefixCode("1F 04", 3, [0x1F, 0x04], (bytes) => styleSegment("blips", [bytes[2]])),
  fixedCode("1F 30", [0x1F, 0x30], () => styleSegment("font", [], "normal")),
  fixedCode("1F 31", [0x1F, 0x31], () => styleSegment("font", [], "saturn")),
  prefixCode("04", 3, [0x04], (_bytes, raw) => controlSegment("set", raw)),
  prefixCode("05", 3, [0x05], (_bytes, raw) => controlSegment("unset", raw)),
  prefixCode("07", 3, [0x07], (_bytes, raw) => controlSegment("isset", raw)),
  prefixCode("08", 5, [0x08], (_bytes, raw) => controlSegment("call", raw)),
  prefixCode("0A", 5, [0x0A], (_bytes, raw) => controlSegment("goto", raw)),
  prefixCode("0B", 2, [0x0B], (_bytes, raw) => controlSegment("result_is", raw)),
  prefixCode("0C", 2, [0x0C], (_bytes, raw) => controlSegment("result_not", raw)),
  fixedCode("1B 00", [0x1B, 0x00], (_bytes, raw) => controlSegment("store_registers", raw)),
  fixedCode("1B 01", [0x1B, 0x01], (_bytes, raw) => controlSegment("load_registers", raw)),
  fixedCode("1B 04", [0x1B, 0x04], (_bytes, raw) => controlSegment("swap", raw)),
  prefixCode("1B", 2, [0x1B], (_bytes, raw) => controlSegment("register", raw))
];

export function tokenizeCcsString(value: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let textStart = 0;
  let index = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      segments.push({ kind: "text", value: value.slice(textStart, end) });
    }
  };

  while (index < value.length) {
    if (value[index] === "[") {
      const close = value.indexOf("]", index + 1);
      if (close >= 0) {
        const raw = value.slice(index, close + 1);
        const bytes = parseHexByteBlock(raw);
        if (bytes) {
          flushText(index);
          segments.push(...decodeByteSegments(bytes, raw));
          index = close + 1;
          textStart = index;
          continue;
        }
      }
    } else if (value[index] === "{") {
      const close = value.indexOf("}", index + 1);
      if (close >= 0) {
        const raw = value.slice(index, close + 1);
        const segment = segmentForMacro(raw);
        if (segment) {
          flushText(index);
          segments.push(segment);
          index = close + 1;
          textStart = index;
          continue;
        }
      }
    }
    index += 1;
  }

  flushText(value.length);
  return segments;
}

function decodeByteSegments(bytes: number[], raw: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const entry = CCS_TEXT_CODE_REGISTRY.find((item) => item.matches(bytes, offset));
    if (!entry) {
      segments.push({
        kind: "control",
        code: "unknown",
        raw: offset === 0 ? raw : `[${bytes.slice(offset).map(byte).join(" ")}]`
      });
      break;
    }

    const chunk = bytes.slice(offset, offset + entry.length);
    segments.push(entry.toSegment(chunk, `[${chunk.map(byte).join(" ")}]`));
    offset += entry.length;
  }

  return segments;
}

function parseHexByteBlock(raw: string): number[] | undefined {
  const inner = raw.slice(1, -1).trim();
  if (!inner) {
    return undefined;
  }
  const parts = inner.split(/\s+/);
  if (!parts.every((part) => /^[0-9a-f]{2}$/i.test(part))) {
    return undefined;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

function segmentForMacro(raw: string): DialogueSegment | undefined {
  const match = raw.match(/^\{([A-Za-z_][\w.]*)\s*(?:\((.*)\))?\}$/);
  if (!match) {
    return undefined;
  }
  const name = match[1].toLowerCase();
  const args = parseNumericArgs(match[2]);

  switch (name) {
    case "linebreak":
      return { kind: "break", break: "line" };
    case "newline":
      return { kind: "break", break: "newline" };
    case "clearline":
      return { kind: "break", break: "clear" };
    case "pause":
      return args ? { kind: "pause", frames: args[0] ?? 0 } : controlSegment(name, raw);
    case "wait":
    case "prompt":
      return { kind: "prompt" };
    case "next":
    case "end":
    case "eob":
      return controlSegment(name, raw);
    case "window_open":
      return args ? windowSegment("open", [args[0] ?? 0]) : controlSegment(name, raw);
    case "window_closetop":
      return windowSegment("closeTop");
    case "window_switch":
      return args ? windowSegment("switch", [args[0] ?? 0]) : controlSegment(name, raw);
    case "window_closeall":
      return windowSegment("closeAll");
    case "window_clear":
      return windowSegment("clear");
    case "text_color":
      return args ? styleSegment("color", [args[0] ?? 0]) : controlSegment(name, raw);
    case "text_blips":
      return args ? styleSegment("blips", [args[0] ?? 0]) : controlSegment(name, raw);
    case "font_normal":
      return styleSegment("font", [], "normal");
    case "font_saturn":
      return styleSegment("font", [], "saturn");
    case "stat":
      return args ? substitutionSegment("stat", [args[0] ?? 0]) : controlSegment(name, raw);
    case "name":
      return args
        ? substitutionSegment((args[0] ?? 0) === 0 ? "playerName" : "partyChar", [args[0] ?? 0])
        : controlSegment(name, raw);
    case "itemname":
      return args ? substitutionSegment("item", [args[0] ?? 0]) : controlSegment(name, raw);
    case "teleportname":
      return args ? substitutionSegment("teleport", [args[0] ?? 0]) : controlSegment(name, raw);
    case "number":
      return args ? substitutionSegment("number", [args[0] ?? 0]) : controlSegment(name, raw);
    case "money":
      return args ? substitutionSegment("money", [args[0] ?? 0]) : controlSegment(name, raw);
    case "user":
      return substitutionSegment("user", []);
    case "target":
      return substitutionSegment("target", []);
    case "psiname":
      return args ? substitutionSegment("psi", [args[0] ?? 0]) : controlSegment(name, raw);
    case "set":
    case "unset":
    case "isset":
    case "call":
    case "goto":
    case "result_is":
    case "result_not":
    case "store_registers":
    case "load_registers":
    case "swap":
      return controlSegment(name, raw);
    default:
      return controlSegment("unknown_macro", raw);
  }
}

function parseNumericArgs(argsText: string | undefined): number[] | undefined {
  if (!argsText?.trim()) {
    return [];
  }
  const args = argsText.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = args.map(parseNumericLiteral);
  return parsed.every((item): item is number => item !== undefined) ? parsed : undefined;
}

function parseNumericLiteral(value: string): number | undefined {
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(2), 16);
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function readLittleEndian(bytes: number[]): number {
  return bytes.reduce((total, value, index) => total + value * (256 ** index), 0);
}

export async function convertProject(options: Partial<CliArgs> = {}): Promise<ConvertResult> {
  const project = options.project ?? process.env.EB_PROJECT ?? DEFAULT_PROJECT;
  const out = options.out ?? DEFAULT_OUT;
  const worldMode = options.worldMode ?? parseWorldMode(process.env.EB_WORLD_MODE);
  const spawnWorldPixel = options.spawnWorldPixel ?? (process.env.EB_SPAWN ? parseSpawn(process.env.EB_SPAWN) : undefined);
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
  const worldBuild = await buildWorldArtifacts({
    projectAbs,
    outAbs,
    displayPath: makeDisplayPath(project),
    projectExists,
    worldMode,
    spawnWorldPixel
  });
  const world = worldBuild.world;
  const sprites = worldBuild.sprites;
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

  const tutorialStatus = await readTutorialStatus(projectAbs, project, projectExists, scripts, npcs, spriteGroups, world);

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
      worldNpcs: world.counts.npcs,
      spriteSheets: sprites.counts.sheets,
      warnings: warnings.length + scripts.warnings.length + npcs.warnings.length + spriteGroups.warnings.length + tutorialStatus.warnings.length + world.warnings.length,
      errors: errors.length
    },
    warnings: [...warnings, ...scripts.warnings, ...npcs.warnings, ...spriteGroups.warnings, ...tutorialStatus.warnings, ...world.warnings],
    errors
  });

  const validationReport: ValidationReport = ValidationReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    generatedFiles: [
      "manifest.json",
      GENERATED_FILES.scripts,
      GENERATED_FILES.npcs,
      GENERATED_FILES.spriteGroups,
      GENERATED_FILES.tutorialStatus,
      GENERATED_FILES.validationReport,
      GENERATED_FILES.world,
      GENERATED_FILES.sprites
    ],
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
  await writeJson(path.join(outAbs, GENERATED_FILES.tutorialStatus), tutorialStatus);
  await writeJson(path.join(outAbs, GENERATED_FILES.validationReport), validationReport);
  await writeJson(path.join(outAbs, GENERATED_FILES.world), world);
  await writeJson(path.join(outAbs, GENERATED_FILES.sprites), sprites);

  return { manifest, scripts, npcs, spriteGroups, tutorialStatus, validationReport, world, sprites };
}

async function readTutorialStatus(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  scripts: ScriptCollection,
  npcs: NpcReferenceCollection,
  spriteGroups: SpriteGroupCollection,
  world?: WorldArtifact
): Promise<TutorialStatus> {
  const steps: TutorialStatus["steps"] = [];
  const warnings: ValidationIssue[] = [];
  const addStep = (step: TutorialStatus["steps"][number]) => {
    steps.push(step);
    if (step.status === "fail" || step.status === "blocked") {
      warnings.push(issue(
        step.status === "blocked" ? "warning" : "info",
        `tutorial_${step.id}`,
        step.evidence,
        step.path
      ));
    }
  };

  const robotFile = scripts.files.find((file) => file.path === "ccscript/robot.ccs");
  const robotCommands = robotFile?.commands ?? [];
  const labelIndex = robotCommands.findIndex((command) => command.cmd === "label" && command.name === "hello_world");
  const labelCommands = labelIndex >= 0 ? robotCommands.slice(labelIndex + 1) : [];
  const sprite005 = spriteGroups.images.find((image) => image.path === "SpriteGroups/005.png");
  const npc744 = projectExists ? await readNpcConfigEntry(projectAbs, "744") : undefined;
  const mapNpc744 = projectExists ? await findMapSpriteNpc(projectAbs, "744") : undefined;
  const runProof = projectExists ? await readTutorialRunProof(projectAbs) : undefined;

  addStep({
    id: "project_snake",
    label: "CoilSnake project metadata exists",
    status: projectExists && existsSync(path.join(projectAbs, "Project.snake")) ? "pass" : "fail",
    evidence: projectExists ? "Project.snake was checked in the local fixture." : "Local CoilSnake project is missing.",
    path: "Project.snake"
  });
  addStep({
    id: "robot_ccs",
    label: "robot.ccs exists",
    status: robotFile ? "pass" : "fail",
    evidence: robotFile ? "ccscript/robot.ccs was parsed." : "ccscript/robot.ccs was not found.",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_label",
    label: "hello_world label exists",
    status: labelIndex >= 0 ? "pass" : "fail",
    evidence: labelIndex >= 0 ? "hello_world label was parsed from robot.ccs." : "hello_world label was not parsed.",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_text",
    label: "Hello World dialogue text exists",
    status: labelCommands.some((command) => command.cmd === "text" && command.value === "@Hello World!") ? "pass" : "fail",
    evidence: "Expected imported text command value @Hello World! after robot.hello_world.",
    expected: "@Hello World!",
    actual: labelCommands.find((command) => command.cmd === "text")?.value ?? "missing",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_end",
    label: "Dialogue terminates with end or eob",
    status: labelCommands.some((command) => command.cmd === "end" || command.cmd === "eob") ? "pass" : "fail",
    evidence: "Expected robot.hello_world to terminate with end/eob.",
    expected: "end or eob",
    actual: labelCommands.find((command) => command.cmd === "end" || command.cmd === "eob")?.cmd ?? "missing",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "sprite_group_005",
    label: "Robot Ness sprite metadata exists",
    status: sprite005 ? "pass" : "fail",
    evidence: sprite005 ? "SpriteGroups/005.png was indexed as metadata only." : "SpriteGroups/005.png was not indexed.",
    path: "SpriteGroups/005.png"
  });
  addStep({
    id: "scanner_reference",
    label: "Text/YML scanner finds robot.hello_world",
    status: npcs.references.some((reference) => reference.reference === "robot.hello_world") ? "pass" : "fail",
    evidence: "Scanner should find a local text/YML reference to robot.hello_world.",
    expected: "robot.hello_world",
    actual: String(npcs.references.map((reference) => reference.reference).join(", ") || "none"),
    path: "npcs.json"
  });
  addStep({
    id: "npc_744_exists",
    label: "NPC 744 config entry exists",
    status: npc744 ? "pass" : "fail",
    evidence: npc744 ? "npc_config_table.yml contains entry 744." : "npc_config_table.yml entry 744 was not found.",
    path: "npc_config_table.yml"
  });
  addNpcFieldStep(steps, warnings, npc744, "npc_744_sprite", "NPC 744 sprite id", "Sprite", "5");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_movement", "NPC 744 movement id", "Movement", "605");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_event_flag", "NPC 744 event flag", "Event Flag", "0x0");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_appears", "NPC 744 appears always", "Show Sprite", "always");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_dialogue", "NPC 744 dialogue pointer", "Text Pointer 1", "robot.hello_world");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_type", "NPC 744 interaction type", "Type", "person");
  addStep({
    id: "map_sprites_npc_744",
    label: "Map sprites include NPC 744",
    status: mapNpc744 ? "pass" : "unknown",
    evidence: mapNpc744
      ? `map_sprites.yml references NPC 744 at line ${mapNpc744.line}. Bedroom placement is not inferred.`
      : "No map_sprites.yml reference to NPC 744 was found.",
    path: "map_sprites.yml",
    actual: mapNpc744?.raw ?? "missing"
  });
  const worldNpc744 = world?.npcs.find((npc) => npc.npcId === TUTORIAL_NPC_ID);
  const worldNpc744RegionPixel = world && !("mode" in world)
    ? world.npcs.find((npc) => npc.npcId === TUTORIAL_NPC_ID)?.regionPixel
    : undefined;
  const worldNpc744Pixel = worldNpc744RegionPixel
    ? `region pixel ${worldNpc744RegionPixel.x},${worldNpc744RegionPixel.y}`
    : worldNpc744?.worldPixel
      ? `world pixel ${worldNpc744.worldPixel.x},${worldNpc744.worldPixel.y}`
      : "missing";
  addStep({
    id: "world_region_rendered",
    label: "Map region around NPC 744 renders from imported data",
    status: world?.available && worldNpc744 ? "pass" : "fail",
    evidence: world?.available
      ? "world.json includes a rendered region and the tutorial NPC placement."
      : "World region rendering was skipped; see world.json warnings.",
    path: "world.json",
    actual: worldNpc744Pixel
  });
  addStep({
    id: "rom_compile_run",
    label: "Compile and run patched ROM",
    status: runProof?.compileSucceeded && runProof.bootVerified ? "pass" : "blocked",
    evidence: runProof?.compileSucceeded && runProof.bootVerified
      ? "Ignored local ROM output was compiled and boot-verified in an emulator."
      : "ROM compilation and emulator testing require explicit permission and local-only proof.",
    path: "tutorial-run-proof.json",
    actual: runProof?.reviewUrl ?? "local proof only"
  });

  return TutorialStatusSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    sourceTutorialUrl: TUTORIAL_URL,
    steps,
    counts: {
      steps: steps.length,
      passed: steps.filter((step) => step.status === "pass").length,
      failed: steps.filter((step) => step.status === "fail").length,
      blocked: steps.filter((step) => step.status === "blocked").length,
      unknown: steps.filter((step) => step.status === "unknown").length
    },
    warnings
  });
}

function addNpcFieldStep(
  steps: TutorialStatus["steps"],
  warnings: ValidationIssue[],
  npc744: Record<string, string> | undefined,
  id: string,
  label: string,
  field: string,
  expected: string
): void {
  const actual = npc744?.[field] ?? "missing";
  const status = normalizeYamlValue(actual) === normalizeYamlValue(expected) ? "pass" : "fail";
  const step = {
    id,
    label,
    status,
    evidence: `Expected NPC 744 ${field} to match the tutorial value.`,
    path: "npc_config_table.yml",
    expected,
    actual
  } as TutorialStatus["steps"][number];
  steps.push(step);
  if (step.status === "fail") {
    warnings.push(issue("info", `tutorial_${step.id}`, step.evidence, step.path));
  }
}

type TutorialRunProof = {
  compileSucceeded: boolean;
  bootVerified: boolean;
  emulator: string;
  reviewUrl?: string;
};

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

async function readNpcConfigEntry(projectAbs: string, npcId: string): Promise<Record<string, string> | undefined> {
  const file = path.join(projectAbs, "npc_config_table.yml");
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${npcId}:`);
  if (start < 0) {
    return undefined;
  }

  const entry: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim().endsWith(":")) {
      break;
    }
    const match = line.match(/^\s{2}([^:]+):\s*(.*)$/);
    if (match) {
      entry[match[1].trim()] = match[2].trim();
    }
  }
  return entry;
}

async function findMapSpriteNpc(projectAbs: string, npcId: string): Promise<{ line: number; raw: string } | undefined> {
  const file = path.join(projectAbs, "map_sprites.yml");
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  const pattern = new RegExp(`\\bNPC ID:\\s*${escapeRegExp(npcId)}\\b`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) {
    return undefined;
  }
  return { line: index + 1, raw: lines[index].trim() };
}

async function readTutorialRunProof(projectAbs: string): Promise<TutorialRunProof | undefined> {
  const file = path.join(projectAbs, "tutorial-run-proof.json");
  if (!existsSync(file)) {
    return undefined;
  }
  const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<TutorialRunProof>;
  if (typeof parsed.compileSucceeded !== "boolean" || typeof parsed.bootVerified !== "boolean") {
    return undefined;
  }
  return {
    compileSucceeded: parsed.compileSucceeded,
    bootVerified: parsed.bootVerified,
    emulator: typeof parsed.emulator === "string" ? parsed.emulator : "unknown",
    ...(typeof parsed.reviewUrl === "string" ? { reviewUrl: parsed.reviewUrl } : {})
  };
}

function normalizeYamlValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^(?:0x[0-9a-f]+|\d+)$/.test(normalized)) {
    return `number:${Number.parseInt(normalized, normalized.startsWith("0x") ? 16 : 10)}`;
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  return path.resolve(process.env.INIT_CWD ?? findWorkspaceRoot(process.cwd()), inputPath);
}

function toPosix(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
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

function sum<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  convertProject(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        ok: result.manifest.errors.length === 0,
        files: [
          "manifest.json",
          GENERATED_FILES.scripts,
          GENERATED_FILES.npcs,
          GENERATED_FILES.spriteGroups,
          GENERATED_FILES.tutorialStatus,
          GENERATED_FILES.validationReport,
          GENERATED_FILES.world,
          GENERATED_FILES.sprites
        ],
        counts: result.manifest.counts,
        world: {
          available: result.world.available,
          npcs: result.world.counts.npcs,
          spriteSheets: result.sprites.counts.sheets,
          ...("mode" in result.world && result.world.mode === "full" ? {
            chunks: result.world.counts.chunks,
            chunksWritten: result.world.counts.chunksWritten,
            voidChunks: result.world.counts.voidChunks,
            chunkFiles: result.world.counts.chunkFiles
          } : {})
        },
        tutorial: result.tutorialStatus.counts,
        warnings: result.manifest.warnings,
        errors: result.manifest.errors
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
