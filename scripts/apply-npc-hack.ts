import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_ROOT = path.join(REPO_ROOT, "external", "coilsnake-project");

const FILES = {
  mapSprites: "map_sprites.yml",
  npcConfig: "npc_config_table.yml",
  robotCcs: path.join("ccscript", "robot.ccs")
} as const;

const NPC_744_BLOCK = ["  - NPC ID: 744", "    X: 192", "    Y: 216"];
const NPC_745_BLOCK = ["  - NPC ID: 745", "    X: 112", "    Y: 240"];
const NPC_746_BLOCK = ["  - NPC ID: 746", "    X: 168", "    Y: 240"];

const MAP_29_BASE = ["  29:", ...NPC_744_BLOCK];
const MAP_29_APPLIED = ["  29:", ...NPC_744_BLOCK, ...NPC_745_BLOCK];
const MAP_30_BASE = ["  30: "];
const MAP_30_APPLIED = ["  30:", ...NPC_746_BLOCK];

const GREETER_V1_BLOCK = [
  "greeter:",
  '    "@Beep boop. I greet, therefore I am." end'
];
const GREETER_V2_BLOCK = [
  "greeter:",
  '    "@Beep boop. I greet, therefore I am." next',
  '    "@New parts arrive tomorrow. Come back then." end'
];
const PATROLLER_BLOCK = [
  "patroller:",
  '    "@Patrolling this canyon. Step aside, hero." end'
];
const GREETER_AGAIN_BLOCK = [
  "greeter_again:",
  '    "@Told you already. Parts. Tomorrow." end'
];

type TextFile = {
  source: string;
  lines: string[];
  eol: string;
  finalNewline: boolean;
};

type PlannedEdit = {
  absolutePath: string;
  relativePath: string;
  before: string;
  after: string;
};

class HackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HackError";
  }
}

function fixturePath(relativePath: string): string {
  const absolutePath = path.resolve(FIXTURE_ROOT, relativePath);
  if (!absolutePath.startsWith(`${FIXTURE_ROOT}${path.sep}`)) {
    throw new HackError(`Refusing to touch path outside fixture: ${relativePath}`);
  }
  if (/\.(sfc|smc)$/i.test(absolutePath)) {
    throw new HackError(`Refusing to touch ROM path: ${relativePath}`);
  }
  return absolutePath;
}

async function readFixture(relativePath: string): Promise<{ absolutePath: string; relativePath: string; file: TextFile }> {
  const absolutePath = fixturePath(relativePath);
  const source = await readFile(absolutePath, "utf8");
  return { absolutePath, relativePath, file: splitText(source) };
}

function splitText(source: string): TextFile {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const finalNewline = source.endsWith("\n");
  const body = finalNewline ? source.replace(/\r?\n$/, "") : source;
  return {
    source,
    lines: body.length > 0 ? body.split(/\r?\n/) : [],
    eol,
    finalNewline
  };
}

function joinText(file: TextFile): string {
  return `${file.lines.join(file.eol)}${file.finalNewline ? file.eol : ""}`;
}

function sameLines(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((line, index) => line === expected[index]);
}

function isLabelLine(line: string): boolean {
  return /^[A-Za-z_][\w.]*:\s*$/.test(line);
}

function findLabelBlock(lines: string[], label: string): { start: number; end: number; block: string[] } | undefined {
  const start = lines.findIndex((line) => line === `${label}:`);
  if (start < 0) {
    return undefined;
  }

  const next = lines.findIndex((line, index) => index > start && isLabelLine(line));
  const end = next >= 0 ? next : lines.length;
  return { start, end, block: lines.slice(start, end) };
}

function formatBlockForError(block: string[] | undefined): string {
  return block === undefined ? "<missing>" : `\n${block.join("\n")}`;
}

function findOuterBlock(lines: string[], key: number): { start: number; end: number } {
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) {
    throw new HackError(`Precondition failed: missing outer key ${key}: in map_sprites.yml`);
  }

  const next = lines.findIndex((line, index) => index > start && /^\d+:\s*$/.test(line));
  return { start, end: next >= 0 ? next : lines.length };
}

function findTopLevelEntry(lines: string[], key: number, fileName: string): { start: number; end: number } {
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) {
    throw new HackError(`Precondition failed: missing entry ${key}: in ${fileName}`);
  }

  const next = lines.findIndex((line, index) => index > start && /^\d+:\s*$/.test(line));
  return { start, end: next >= 0 ? next : lines.length };
}

function findInnerCell(lines: string[], outer: { start: number; end: number }, key: number): { start: number; end: number } {
  const pattern = new RegExp(`^  ${key}:\\s*$`);
  const start = lines.findIndex((line, index) => index > outer.start && index < outer.end && pattern.test(line));
  if (start < 0) {
    throw new HackError(`Precondition failed: missing area 27 cell ${key}: in map_sprites.yml`);
  }

  const next = lines.findIndex((line, index) => index > start && index < outer.end && /^ {2}\d+:\s*$/.test(line));
  return { start, end: next >= 0 ? next : outer.end };
}

function replaceCell(lines: string[], cell: { start: number; end: number }, replacement: string[]): void {
  lines.splice(cell.start, cell.end - cell.start, ...replacement);
}

function applyMapSpriteHack(file: TextFile): { changed: boolean; after: string } {
  const lines = [...file.lines];
  const outer = findOuterBlock(lines, 27);
  const cell29 = findInnerCell(lines, outer, 29);
  const segment29 = lines.slice(cell29.start, cell29.end);
  let changed = false;

  if (sameLines(segment29, MAP_29_BASE)) {
    replaceCell(lines, cell29, MAP_29_APPLIED);
    changed = true;
  } else if (!sameLines(segment29, MAP_29_APPLIED)) {
    throw new HackError("Precondition failed: area 27 cell 29 must contain exactly NPC 744, or NPCs 744 and 745 after apply.");
  }

  const updatedOuter = findOuterBlock(lines, 27);
  const cell30 = findInnerCell(lines, updatedOuter, 30);
  const segment30 = lines.slice(cell30.start, cell30.end);

  if (sameLines(segment30, MAP_30_BASE)) {
    replaceCell(lines, cell30, MAP_30_APPLIED);
    changed = true;
  } else if (!sameLines(segment30, MAP_30_APPLIED)) {
    throw new HackError("Precondition failed: area 27 cell 30 must be the empty target cell, or contain exactly NPC 746 after apply.");
  }

  return { changed, after: joinText({ ...file, lines }) };
}

function updateNpcField(lines: string[], entry: { start: number; end: number }, npcId: number, field: string, value: string): boolean {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  ${escapedField}:\\s*(.*)$`);
  const index = lines.findIndex((line, lineIndex) => lineIndex > entry.start && lineIndex < entry.end && pattern.test(line));

  if (index < 0) {
    throw new HackError(`Precondition failed: missing field "${field}" in npc_config_table.yml entry ${npcId}`);
  }

  const desiredLine = `  ${field}: ${value}`;
  if (lines[index] === desiredLine) {
    return false;
  }

  lines[index] = desiredLine;
  return true;
}

function applyNpcConfigHack(file: TextFile): { changed: boolean; after: string } {
  const lines = [...file.lines];
  let changed = false;

  for (const [npcId, fields] of [
    [745, {
      Direction: "right",
      Movement: "0",
      "Show Sprite": "always",
      Sprite: "2",
      "Text Pointer 1": "robot.greeter",
      "Text Pointer 2": "robot.greeter_again"
    }],
    [746, {
      Direction: "left",
      Movement: "0",
      "Show Sprite": "always",
      Sprite: "4",
      "Text Pointer 1": "robot.patroller"
    }]
  ] as const) {
    const entry = findTopLevelEntry(lines, npcId, "npc_config_table.yml");
    for (const [field, value] of Object.entries(fields)) {
      changed = updateNpcField(lines, entry, npcId, field, value) || changed;
    }
  }

  return { changed, after: joinText({ ...file, lines }) };
}

function applyRobotCcsHack(file: TextFile): { changed: boolean; after: string } {
  const lines = [...file.lines];
  if (!lines.includes("hello_world:")) {
    throw new HackError("Precondition failed: missing hello_world label in ccscript/robot.ccs");
  }

  let changed = false;
  const greeter = findLabelBlock(lines, "greeter");
  if (!greeter) {
    if (lines.some((line) => line === "patroller:") || lines.some((line) => line === "greeter_again:")) {
      throw new HackError("Precondition failed: greeter label is missing but v2 companion labels already exist in ccscript/robot.ccs");
    }

    lines.push(...GREETER_V2_BLOCK, ...PATROLLER_BLOCK, ...GREETER_AGAIN_BLOCK);
    return { changed: true, after: joinText({ ...file, lines }) };
  }

  if (sameLines(greeter.block, GREETER_V1_BLOCK)) {
    lines.splice(greeter.start, greeter.end - greeter.start, ...GREETER_V2_BLOCK);
    changed = true;
  } else if (!sameLines(greeter.block, GREETER_V2_BLOCK)) {
    throw new HackError(
      `Precondition failed: greeter label exists but matches neither the v1 nor v2 block in ccscript/robot.ccs. Actual block:${formatBlockForError(greeter.block)}`
    );
  }

  const patroller = findLabelBlock(lines, "patroller");
  if (!patroller) {
    throw new HackError("Precondition failed: patroller label is missing from an already-hacked ccscript/robot.ccs");
  }
  if (!sameLines(patroller.block, PATROLLER_BLOCK)) {
    throw new HackError(
      `Precondition failed: patroller label exists but does not match the requested block in ccscript/robot.ccs. Actual block:${formatBlockForError(patroller.block)}`
    );
  }

  const greeterAgain = findLabelBlock(lines, "greeter_again");
  if (!greeterAgain) {
    lines.push(...GREETER_AGAIN_BLOCK);
    changed = true;
  } else if (!sameLines(greeterAgain.block, GREETER_AGAIN_BLOCK)) {
    throw new HackError(
      `Precondition failed: greeter_again label exists but does not match the requested block in ccscript/robot.ccs. Actual block:${formatBlockForError(greeterAgain.block)}`
    );
  }

  return { changed, after: changed ? joinText({ ...file, lines }) : file.source };
}

async function backupIfNeeded(absolutePath: string): Promise<boolean> {
  const backupPath = `${absolutePath}.orig-backup`;
  if (existsSync(backupPath)) {
    return false;
  }
  await copyFile(absolutePath, backupPath);
  return true;
}

async function applyHack(): Promise<void> {
  const mapSprites = await readFixture(FILES.mapSprites);
  const npcConfig = await readFixture(FILES.npcConfig);
  const robotCcs = await readFixture(FILES.robotCcs);

  const mapResult = applyMapSpriteHack(mapSprites.file);
  const npcResult = applyNpcConfigHack(npcConfig.file);
  const robotResult = applyRobotCcsHack(robotCcs.file);

  const plannedEdits: PlannedEdit[] = [
    { ...mapSprites, before: mapSprites.file.source, after: mapResult.after },
    { ...npcConfig, before: npcConfig.file.source, after: npcResult.after },
    { ...robotCcs, before: robotCcs.file.source, after: robotResult.after }
  ].filter((edit) => edit.before !== edit.after);

  if (plannedEdits.length === 0) {
    console.log("already applied");
    return;
  }

  for (const edit of plannedEdits) {
    const backupCreated = await backupIfNeeded(edit.absolutePath);
    await writeFile(edit.absolutePath, edit.after, "utf8");
    console.log(`${backupCreated ? "created backup and updated" : "updated"} ${path.relative(FIXTURE_ROOT, edit.absolutePath)}`);
  }
  console.log("applied second NPC hack");
}

async function revertHack(): Promise<void> {
  const targets = [FILES.mapSprites, FILES.npcConfig, FILES.robotCcs];
  let restored = 0;

  for (const relativePath of targets) {
    const absolutePath = fixturePath(relativePath);
    const backupPath = `${absolutePath}.orig-backup`;
    if (!existsSync(backupPath)) {
      console.log(`no backup found for ${path.relative(FIXTURE_ROOT, absolutePath)}`);
      continue;
    }

    await copyFile(backupPath, absolutePath);
    restored += 1;
    console.log(`restored ${path.relative(FIXTURE_ROOT, absolutePath)} from ${path.basename(backupPath)}`);
  }

  console.log(`revert complete: ${restored} file${restored === 1 ? "" : "s"} restored`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== "--revert");
  if (unknownArgs.length > 0) {
    throw new HackError(`Unknown argument(s): ${unknownArgs.join(", ")}`);
  }

  if (args.includes("--revert")) {
    await revertHack();
    return;
  }

  await applyHack();
}

main().catch((error: unknown) => {
  if (error instanceof HackError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
