import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { SCHEMA_VERSION, ScriptCollectionSchema, type ScriptCollection, type ScriptCommand } from "../packages/eb-schemas/src/index";
import { parseTeleportDestinationTable } from "../packages/eb-converter/src/coilsnakeYaml";
import { parseCcsFile } from "../packages/eb-converter/src/index";
import { buildWorldDoors } from "../packages/eb-converter/src/world";

const EB_PROJECT = "external/coilsnake-full";
const GENERATED_WORLD = "apps/game/public/generated/world.json";

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = join(root, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  }));
  return files.flat();
}

function toPosix(inputPath: string): string {
  return inputPath.split(sep).join("/");
}

function countCommands(commands: ScriptCommand[]) {
  return {
    commands: commands.length,
    labels: commands.filter((command) => command.cmd === "label").length,
    textCommands: commands.filter((command) => command.cmd === "text").length,
    unknownCommands: commands.filter((command) => command.cmd === "unknown").length
  };
}

async function readScripts(projectAbs: string): Promise<ScriptCollection> {
  const ccscriptAbs = join(projectAbs, "ccscript");
  if (!existsSync(ccscriptAbs)) {
    return ScriptCollectionSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      sourceProjectPath: EB_PROJECT,
      files: [],
      counts: { files: 0, commands: 0, labels: 0, textCommands: 0, unknownCommands: 0 },
      warnings: []
    });
  }

  const files = [];
  const warnings = [];
  for (const fileAbs of (await walk(ccscriptAbs)).filter((file) => file.endsWith(".ccs")).sort()) {
    const relativePath = toPosix(relative(projectAbs, fileAbs));
    const parsed = parseCcsFile(relativePath, await readFile(fileAbs, "utf8"));
    warnings.push(...parsed.warnings);
    files.push({
      path: relativePath,
      commands: parsed.commands,
      labels: parsed.labels,
      counts: countCommands(parsed.commands),
      warnings: parsed.warnings
    });
  }

  return ScriptCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: EB_PROJECT,
    files,
    counts: {
      files: files.length,
      commands: files.reduce((sum, file) => sum + file.counts.commands, 0),
      labels: files.reduce((sum, file) => sum + file.counts.labels, 0),
      textCommands: files.reduce((sum, file) => sum + file.counts.textCommands, 0),
      unknownCommands: files.reduce((sum, file) => sum + file.counts.unknownCommands, 0)
    },
    warnings
  });
}

async function readTeleportDestinations(projectAbs: string) {
  const file = join(projectAbs, "teleport_destination_table.yml");
  if (!existsSync(file)) {
    return [];
  }
  return parseTeleportDestinationTable(await readFile(file, "utf8"));
}

function findTopLevelArrayRange(source: string, propertyName: string): { start: number; end: number } {
  const match = new RegExp(`^  "${propertyName}": \\[`, "m").exec(source);
  if (!match) {
    throw new Error(`Could not find top-level ${propertyName} array in ${GENERATED_WORLD}.`);
  }
  const start = source.indexOf("[", match.index);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: index };
      }
    }
  }
  throw new Error(`Could not find end of top-level ${propertyName} array in ${GENERATED_WORLD}.`);
}

async function main(): Promise<void> {
  const projectAbs = resolve(EB_PROJECT);
  const worldAbs = resolve(GENERATED_WORLD);
  const [scripts, teleportDestinations, worldSource] = await Promise.all([
    readScripts(projectAbs),
    readTeleportDestinations(projectAbs),
    readFile(worldAbs, "utf8")
  ]);
  const doors = await buildWorldDoors({
    projectAbs,
    scripts,
    teleportDestinations
  });

  const range = findTopLevelArrayRange(worldSource, "doors");
  const doorsJson = JSON.stringify(doors, null, 2).replace(/\n/g, "\n  ");
  let nextWorldSource = `${worldSource.slice(0, range.start)}${doorsJson}${worldSource.slice(range.end + 1)}`;
  if (!nextWorldSource.endsWith("\n")) {
    nextWorldSource += "\n";
  }
  await writeFile(worldAbs, nextWorldSource, "utf8");

  const world = JSON.parse(nextWorldSource) as {
    doors: Array<{
      worldPixel: { x: number; y: number };
      destinationWorldPixel: { x: number; y: number };
      style?: number;
    }>;
  };
  console.log(JSON.stringify({
    ok: true,
    world: GENERATED_WORLD,
    doors: world.doors.length,
    caveHoleDoors: [477, 478].map((index) => ({
      index,
      source: world.doors[index]?.worldPixel,
      style: world.doors[index]?.style,
      destination: world.doors[index]?.destinationWorldPixel
    }))
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
