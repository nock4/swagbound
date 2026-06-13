/**
 * Phase-1 Act-1 parity scorecard.
 *
 * This scores DATA-EXTRACTION parity for Phase 1 traversal: full-world map
 * extraction, chunk coverage, NPC placement extraction, emitted sprite sheets,
 * collision dimensions, and imported door triggers. It does not score
 * behavioral/script parity; event flags, text engine behavior, and action
 * scripts belong to later phases.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { convertProject } from "../packages/eb-converter/src/index";
import { parseMapDoors, parseMapSprites, parseMapTiles } from "../packages/eb-converter/src/coilsnakeYaml";
import type { WorldChunked, WorldDoor } from "../packages/eb-schemas/src/index";

type Status = "PASS" | "FAIL" | "INFO";

type Row = {
  check: string;
  value: string;
  expected: string;
  status: Status;
  hard?: boolean;
};

const SOURCE_PROJECT = "external/coilsnake-full";
const EXPECTED_CHUNKS = 320;
const EXPECTED_COLLISION = { width: 1024, height: 1280 };
const ROM_EXTENSION_PATTERN = new RegExp(String.raw`\S+\.` + "sfc" + String.raw`\b`, "g");

async function main(): Promise<void> {
  const tempOut = await mkdtemp(path.join(os.tmpdir(), "coilsnake-parity-"));
  try {
    const result = await convertProject({
      project: SOURCE_PROJECT,
      worldMode: "full",
      out: tempOut
    });

    if (!("mode" in result.world) || result.world.mode !== "full") {
      printRows([
        {
          check: "Full-world mode",
          value: "not emitted",
          expected: "mode full",
          status: "FAIL",
          hard: true
        }
      ]);
      console.log("PARITY: FAIL");
      process.exitCode = 1;
      return;
    }

    const world = result.world;
    const source = await readSourceFixture();
    const rows = buildRows(world, result.sprites.counts.sheets, source);
    printRows(rows);

    const hardFailures = rows.filter((row) => row.hard && row.status === "FAIL");
    const parity = hardFailures.length === 0 ? "PASS" : "FAIL";
    console.log(`PARITY: ${parity}`);
    process.exitCode = parity === "PASS" ? 0 : 1;
  } catch (error) {
    console.error(sanitize(String(error instanceof Error ? error.message : error)));
    console.log("PARITY: FAIL");
    process.exitCode = 1;
  } finally {
    await rm(tempOut, { recursive: true, force: true });
  }
}

async function readSourceFixture(): Promise<{
  npcCount: number;
  doorTypes: Record<string, number>;
  mapWidthTiles: number;
  mapHeightTiles: number;
}> {
  const [mapSpritesSource, mapDoorsSource, mapTilesSource] = await Promise.all([
    readFile(path.join(SOURCE_PROJECT, "map_sprites.yml"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "map_doors.yml"), "utf8"),
    readFile(path.join(SOURCE_PROJECT, "map_tiles.map"), "utf8")
  ]);
  const mapRows = parseMapTiles(mapTilesSource);
  return {
    npcCount: parseMapSprites(mapSpritesSource).length,
    doorTypes: countDoorTypes(parseMapDoors(mapDoorsSource)),
    mapWidthTiles: mapRows[0]?.length ?? 0,
    mapHeightTiles: mapRows.length
  };
}

function buildRows(
  world: WorldChunked,
  spriteSheetCount: number,
  source: Awaited<ReturnType<typeof readSourceFixture>>
): Row[] {
  const rows: Row[] = [];
  const generatedDoorTypes = countDoorTypes(world.doors);
  const requiredSheetGroups = new Set<number>([world.player.spriteGroup]);
  for (const npc of world.npcs) {
    if (npc.visible && npc.spriteGroup !== undefined) {
      requiredSheetGroups.add(npc.spriteGroup);
    }
  }
  const visibleMissingSheets = world.npcs.filter((npc) => npc.visible && !npc.sheet);
  const totalChunks = world.counts.chunks;

  rows.push({
    check: "NPC placements",
    value: `${world.counts.visibleNpcs} visible / ${world.counts.npcs} total`,
    expected: `${source.npcCount} source NPC IDs`,
    status: world.counts.npcs === source.npcCount ? "PASS" : "FAIL"
  });

  for (const type of sortedKeys({ ...source.doorTypes, ...generatedDoorTypes })) {
    const emitted = generatedDoorTypes[type] ?? 0;
    const expected = source.doorTypes[type] ?? 0;
    const supported = type === "door" || type === "stairway" || type === "escalator";
    rows.push({
      check: `Doors: ${type}`,
      value: String(emitted),
      expected: supported ? String(expected) : `${expected} source (${type} not emitted in Phase 1)`,
      status: supported ? (emitted === expected ? "PASS" : "FAIL") : "INFO",
      hard: type === "door"
    });
  }

  rows.push({
    check: "Chunk coverage",
    value: `${world.counts.chunksWritten} written / ${world.counts.voidChunks} void / ${totalChunks} total`,
    expected: `${EXPECTED_CHUNKS} total`,
    status: totalChunks === EXPECTED_CHUNKS ? "PASS" : "FAIL",
    hard: true
  });
  rows.push({
    check: "Sprite sheets emitted",
    value: `${spriteSheetCount} sheets; ${visibleMissingSheets.length} visible NPCs missing sheets`,
    expected: `${requiredSheetGroups.size} required groups; 0 missing`,
    status: spriteSheetCount === requiredSheetGroups.size && visibleMissingSheets.length === 0 ? "PASS" : "FAIL",
    hard: true
  });
  rows.push({
    check: "Collision grid",
    value: `${world.collision.width}x${world.collision.height}`,
    expected: `${EXPECTED_COLLISION.width}x${EXPECTED_COLLISION.height}`,
    status: world.collision.width === EXPECTED_COLLISION.width && world.collision.height === EXPECTED_COLLISION.height
      ? "PASS"
      : "FAIL",
    hard: true
  });
  rows.push({
    check: "Map dimensions",
    value: `${world.mapWidthTiles}x${world.mapHeightTiles} tiles`,
    expected: `${source.mapWidthTiles}x${source.mapHeightTiles} source tiles`,
    status: world.mapWidthTiles === source.mapWidthTiles && world.mapHeightTiles === source.mapHeightTiles
      ? "PASS"
      : "FAIL"
  });

  return rows;
}

function countDoorTypes(doors: Array<Pick<WorldDoor, "type">> | Array<{ type: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const door of doors) {
    counts[door.type] = (counts[door.type] ?? 0) + 1;
  }
  return counts;
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort((a, b) => a.localeCompare(b));
}

function printRows(rows: Row[]): void {
  const headers = ["Check", "Value", "Expected", "Status"];
  const body = rows.map((row) => [row.check, row.value, row.expected, row.status]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index].length))
  );
  const print = (cells: string[]) => {
    console.log(`| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`);
  };
  print(headers);
  console.log(`| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`);
  for (const row of body) {
    print(row);
  }
}

function sanitize(value: string): string {
  return value
    .replace(/\/Users\/[^/\s]+(?:\/[^\s]*)?/g, "<local-path>")
    .replace(/EarthBound \(USA\)/g, "<rom>")
    .replace(ROM_EXTENSION_PATTERN, "<rom-file>");
}

void main();
