import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertProject } from "../src/index";
import { validateGeneratedOutput } from "../src/validate";
import {
  decodeArrangementCell,
  drawArrangement,
  isBlankArrangement,
  parseFts
} from "../src/fts";
import {
  doorTriggerToWorldPixel,
  parseIntKeyedYaml,
  parseMapDoors,
  parseMapSprites,
  parseMapTiles,
  parseTeleportDestinationTable,
  parseYamlInteger,
  placementToWorldPixel
} from "../src/coilsnakeYaml";
import { chooseRegion, encodeCollisionRows, findSpawn, spriteGroupAnimations } from "../src/world";
import { encodePngRgba, readPngHeader } from "../src/png";
import {
  EB_ROM_SIZE_BYTES,
  NEW_GAME_STARTUP_BANK_FILE_OFFSET,
  NEW_GAME_STARTUP_LOW16_FILE_OFFSET,
  NEW_GAME_START_X_FILE_OFFSET,
  NEW_GAME_START_Y_FILE_OFFSET,
  ROM_NEW_GAME_START_DERIVATION,
  ROM_NEW_GAME_STARTUP_DERIVATION
} from "../src/romStart";

/** Builds a fully synthetic .fts source (no extracted game data). */
function syntheticFts(): string {
  const zeroLine = "0".repeat(64);
  const oneLine = "1".repeat(64);
  const lines: string[] = [];
  for (let i = 0; i < 512; i += 1) {
    lines.push(i === 1 ? oneLine : zeroLine); // minitile i
    lines.push(zeroLine); // minitile i ^ 512
    lines.push("");
  }
  lines.push("");
  let colors = "";
  for (let colorIndex = 0; colorIndex < 96; colorIndex += 1) {
    colors += colorIndex === 1 ? "v00" : "000"; // subpalette 0, color 1 = red
  }
  lines.push(`00${colors}`); // map tileset 0, palette 0
  lines.push("");
  lines.push("");
  const cell = (minitile: number, collision: number, extraBits = 0): string => {
    const entry = (2 << 10) | extraBits | minitile; // subpalette raw 2 -> fts index 0
    return entry.toString(16).padStart(4, "0") + collision.toString(16).padStart(2, "0");
  };
  for (let i = 0; i < 1024; i += 1) {
    if (i === 1) {
      lines.push(cell(1, 0x00).repeat(16)); // visible walkable tile
    } else if (i === 2) {
      lines.push(cell(1, 0x80).repeat(16)); // visible solid tile
    } else if (i === 3) {
      lines.push(cell(1, 0x00, 1 << 13).repeat(16)); // high-priority foreground tile
    } else {
      lines.push(cell(0, 0x00).repeat(16)); // blank void tile
    }
  }
  return `${lines.join("\n")}\n`;
}

describe("fts parser", () => {
  const tileset = parseFts(syntheticFts());

  it("decodes minitile pairs, palettes, arrangements, and collisions", () => {
    expect(tileset.minitiles[1][0]).toBe(1);
    expect(tileset.minitiles[0][0]).toBe(0);
    expect(tileset.minitiles[513][0]).toBe(0);
    expect(tileset.palettes).toHaveLength(1);
    expect(tileset.palettes[0]).toMatchObject({ mapTileset: 0, mapPalette: 0 });
    // subpalette 0, color 1 should decode to full red
    expect([...tileset.palettes[0].colors.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    expect(tileset.arrangements[1 * 16] & 0x3ff).toBe(1);
    expect(tileset.collisions[2 * 16]).toBe(0x80);
  });

  it("decodes arrangement cell bitfields", () => {
    expect(decodeArrangementCell((2 << 10) | 5)).toMatchObject({ minitile: 5, subpalette: 0, priority: false, hFlip: false, vFlip: false });
    expect(decodeArrangementCell((7 << 10) | (1 << 13) | (1 << 14) | (1 << 15) | 9)).toMatchObject({
      minitile: 9,
      subpalette: 5,
      priority: true,
      hFlip: true,
      vFlip: true
    });
  });

  it("detects blank void arrangements", () => {
    expect(isBlankArrangement(tileset, 0)).toBe(true);
    expect(isBlankArrangement(tileset, 1)).toBe(false);
  });

  it("draws background pixels and priority-only foreground pixels", () => {
    const background = new Uint8Array(32 * 32 * 4);
    const foreground = new Uint8Array(32 * 32 * 4);
    drawArrangement({
      tileset,
      arrangementIndex: 1,
      palette: tileset.palettes[0],
      target: background,
      targetWidth: 32,
      targetX: 0,
      targetY: 0,
      priorityOnly: false
    });
    drawArrangement({
      tileset,
      arrangementIndex: 1,
      palette: tileset.palettes[0],
      target: foreground,
      targetWidth: 32,
      targetX: 0,
      targetY: 0,
      priorityOnly: true
    });
    expect([...background.slice(0, 4)]).toEqual([255, 0, 0, 255]); // red minitile pixel
    expect(foreground[3]).toBe(0); // not a priority tile -> transparent

    drawArrangement({
      tileset,
      arrangementIndex: 3,
      palette: tileset.palettes[0],
      target: foreground,
      targetWidth: 32,
      targetX: 0,
      targetY: 0,
      priorityOnly: true
    });
    expect([...foreground.slice(0, 4)]).toEqual([255, 0, 0, 255]); // priority tile drawn
  });
});

describe("coilsnake yaml readers", () => {
  it("parses int-keyed entries", () => {
    const entries = parseIntKeyedYaml(["744:", "  Sprite: 5", "  Text Pointer 1: robot.hello_world", "745:", "  Sprite: 6", ""].join("\n"));
    expect(entries.get(744)).toMatchObject({ Sprite: "5", "Text Pointer 1": "robot.hello_world" });
    expect(entries.get(745)).toMatchObject({ Sprite: "6" });
  });

  it("parses hex-formatted numeric tokens", () => {
    const entries = parseIntKeyedYaml(["0x10:", "  Event Flag: 0x274", ""].join("\n"));
    expect(entries.get(16)).toMatchObject({ "Event Flag": "0x274" });
    expect(parseYamlInteger("0x274")).toBe(628);
  });

  it("parses nested and flow map sprite placements with world math", () => {
    const placements = parseMapSprites([
      "27:",
      "  29:",
      "  - NPC ID: 744",
      "    X: 192",
      "    Y: 216",
      "4:",
      "  31:",
      "  - {NPC ID: 9, X: 64, Y: 64}",
      ""
    ].join("\n"));
    expect(placements).toHaveLength(2);
    expect(placements[0]).toMatchObject({ areaY: 27, areaX: 29, npcId: 744, x: 192, y: 216 });
    expect(placementToWorldPixel(placements[0])).toEqual({ x: 7616, y: 7128 });
    expect(placementToWorldPixel(placements[1])).toEqual({ x: 8000, y: 1088 });
  });

  it("parses map door entries and maps trigger cells to world pixels", () => {
    const doors = parseMapDoors([
      "1:",
      "  2:",
      "  - Destination X: 640",
      "    Destination Y: 768",
      "    Direction: up",
      "    Event Flag: 0x0",
      "    Style: 1",
      "    Text Pointer: $0",
      "    Type: door",
      "    X: 3",
      "    Y: 4",
      "  - Direction: ne",
      "    Type: stairway",
      "    X: 5",
      "    Y: 6",
      "  3: null",
      ""
    ].join("\n"));

    expect(doors).toHaveLength(2);
    expect(doors[0]).toMatchObject({
      areaY: 1,
      areaX: 2,
      type: "door",
      x: 3,
      y: 4,
      destinationX: 640,
      destinationY: 768,
      direction: "up",
      eventFlag: "0x0",
      style: 1,
      textPointer: "$0"
    });
    expect(doorTriggerToWorldPixel(doors[0])).toEqual({ x: 536, y: 288 });
    expect(doorTriggerToWorldPixel(doors[1])).toEqual({ x: 552, y: 304 });
  });

  it("parses teleport destinations as world-pixel coordinates", () => {
    const destinations = parseTeleportDestinationTable([
      "2:",
      "  Direction: 3",
      "  Unknown: 0",
      "  Warp Style: 7",
      "  X: 320",
      "  Y: 448",
      "5:",
      "  Direction: 7",
      "  Unknown: 0",
      "  Warp Style: 1",
      "  X: 640",
      "  Y: 768",
      ""
    ].join("\n"));

    // X/Y are scaled from 8px warp-grid units to world pixels (*8).
    expect(destinations).toEqual([
      { id: 2, x: 2560, y: 3584, direction: 3, warpStyle: 7 },
      { id: 5, x: 5120, y: 6144, direction: 7, warpStyle: 1 }
    ]);
  });

  it("parses map tile rows as hex", () => {
    const rows = parseMapTiles("000 001 00a\n0ff 100 3ff\n");
    expect(rows).toEqual([[0, 1, 10], [255, 256, 1023]]);
  });
});

describe("region selection and collision encoding", () => {
  it("chooses sector-aligned regions clamped to the map", () => {
    expect(chooseRegion({ x: 7616, y: 7128 })).toEqual({ originTileX: 208, originTileY: 200, widthTiles: 48, heightTiles: 44 });
    expect(chooseRegion({ x: 0, y: 0 })).toMatchObject({ originTileX: 0, originTileY: 0 });
    expect(chooseRegion({ x: 8191, y: 10239 })).toMatchObject({ originTileX: 208, originTileY: 276 });
  });

  it("encodes raw surface bytes and gameplay solidity with void override", () => {
    const surface = new Uint8Array([0x00, 0x80, 0x20, 0x00]);
    const voidSolid = new Uint8Array([1, 0, 0, 0]);
    const plain = encodeCollisionRows(surface, 4, 1);
    expect(plain.solidRows).toEqual(["0100"]);
    expect(plain.surfaceRows).toEqual(["00802000"]);
    const withVoid = encodeCollisionRows(surface, 4, 1, voidSolid);
    expect(withVoid.solidRows).toEqual(["1100"]);
    expect(withVoid.solidCells).toBe(2);
  });

  it("maps CoilSnake sprite-group frames to per-direction walk pairs", () => {
    // 16-frame sheets follow the decompiled pair order N, E, S, W, NE, SE, SW, NW.
    expect(spriteGroupAnimations(16)).toEqual({ up: [0, 1], right: [2, 3], down: [4, 5], left: [6, 7] });
    expect(spriteGroupAnimations(8)).toEqual({ up: [0, 1], right: [2, 3], down: [4, 5], left: [6, 7] });
    // Short sheets cannot encode directions; all facings reuse the lead pair.
    expect(spriteGroupAnimations(4)).toEqual({ up: [0, 1], right: [0, 1], down: [0, 1], left: [0, 1] });
    expect(spriteGroupAnimations(1)).toEqual({ up: [0, 0], right: [0, 0], down: [0, 0], left: [0, 0] });
  });

  it("finds a deterministic walkable spawn near the anchor", () => {
    const solidAt = (cellX: number) => cellX < 80; // everything west of cell 80 is solid
    const spawn = findSpawn(solidAt, 200, 200, { x: 640, y: 640 });
    // Ring 2 (64px): west candidate (576) is solid, east candidate wins.
    expect(spawn).toEqual({ x: 704, y: 640 });
  });
});

describe("png encoder", () => {
  it("round-trips RGBA data through a valid PNG", () => {
    const width = 3;
    const height = 2;
    const rgba = new Uint8Array(width * height * 4).map((_, index) => (index * 7) % 256);
    const png = encodePngRgba(width, height, rgba);
    expect(readPngHeader(png)).toEqual({ width, height });

    // Extract and inflate the IDAT chunk, then strip filter-0 bytes.
    let offset = 8;
    let idat = Buffer.alloc(0);
    const buffer = Buffer.from(png);
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      if (type === "IDAT") {
        idat = Buffer.concat([idat, buffer.subarray(offset + 8, offset + 8 + length)]);
      }
      offset += 12 + length;
    }
    const raw = inflateSync(idat);
    const stride = width * 4;
    for (let y = 0; y < height; y += 1) {
      expect(raw[y * (stride + 1)]).toBe(0); // filter type none
      const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      expect([...row]).toEqual([...rgba.subarray(y * stride, (y + 1) * stride)]);
    }
  });
});

describe("world artifact build (synthetic project)", () => {
  async function writeSyntheticProject(project: string): Promise<void> {
    await mkdir(path.join(project, "ccscript"), { recursive: true });
    await mkdir(path.join(project, "Tilesets"), { recursive: true });
    await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
    await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
    await writeFile(
      path.join(project, "ccscript", "robot.ccs"),
      [
        "hello_world:",
        '    "@Hello World!" end',
        "follow_up:",
        '    "@Still here." end',
        ""
      ].join("\n"),
      "utf8"
    );

    const mapRow = Array.from({ length: 64 }, () => "001").join(" ");
    await writeFile(path.join(project, "map_tiles.map"), `${Array.from({ length: 64 }, () => mapRow).join("\n")}\n`, "utf8");

    const sectors: string[] = [];
    for (let i = 0; i < 128; i += 1) {
      sectors.push(`${i}:`, "  Palette: 0", "  Tileset: 0");
    }
    await writeFile(path.join(project, "map_sectors.yml"), `${sectors.join("\n")}\n`, "utf8");
    await writeFile(path.join(project, "Tilesets", "00.fts"), syntheticFts(), "utf8");

    await writeFile(path.join(project, "map_sprites.yml"), [
      "3:",
      "  3:",
      "  - NPC ID: 744",
      "    X: 128",
      "    Y: 128",
      "  - NPC ID: 100",
      "    X: 160",
      "    Y: 128",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(project, "npc_config_table.yml"), [
      "100:",
      "  Direction: down",
      "  Event Flag: 0x2",
      "  Show Sprite: when event flag set",
      "  Sprite: 7",
      "  Text Pointer 1: $0",
      "  Type: person",
      "744:",
      "  Direction: down",
      "  Event Flag: 0",
      "  Movement: 605",
      "  Show Sprite: always",
      "  Sprite: 5",
      "  Text Pointer 1: robot.hello_world",
      "  Text Pointer 2: robot.follow_up",
      "  Type: person",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(project, "sprite_groups.yml"), [
      "1:",
      "  Length: 16",
      "  Size: 16x24",
      "5:",
      "  Length: 16",
      "  Size: 16x24",
      ""
    ].join("\n"), "utf8");

    const sheet = encodePngRgba(64, 96, new Uint8Array(64 * 96 * 4).fill(128));
    await writeFile(path.join(project, "SpriteGroups", "001.png"), sheet);
    await writeFile(path.join(project, "SpriteGroups", "005.png"), sheet);
  }

  async function writeSyntheticChunkProject(project: string): Promise<void> {
    await mkdir(path.join(project, "ccscript"), { recursive: true });
    await mkdir(path.join(project, "Tilesets"), { recursive: true });
    await mkdir(path.join(project, "SpriteGroups"), { recursive: true });
    await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
    await writeFile(
      path.join(project, "ccscript", "robot.ccs"),
      [
        "hello_world:",
        '    "@Hello World!" end',
        "follow_up:",
        '    "@Still here." end',
        ""
      ].join("\n"),
      "utf8"
    );

    const rows: string[] = [];
    for (let y = 0; y < 32; y += 1) {
      const row: string[] = [];
      for (let x = 0; x < 32; x += 1) {
        if (x >= 16 && y < 16) {
          row.push("000"); // void chunk
        } else if (x < 16 && y >= 16) {
          row.push("003"); // foreground-bearing chunk
        } else if (x >= 16 && y >= 16) {
          row.push("002"); // visible solid chunk
        } else {
          row.push("001"); // visible walkable chunk
        }
      }
      rows.push(row.join(" "));
    }
    await writeFile(path.join(project, "map_tiles.map"), `${rows.join("\n")}\n`, "utf8");

    const sectors: string[] = [];
    for (let i = 0; i < 32; i += 1) {
      sectors.push(
        `${i}:`,
        "  Palette: 0",
        "  Tileset: 0",
        `  Music: ${i === 2 ? 2 : 1}`,
        `  Setting: ${i === 3 ? "none" : i === 2 ? "cave-style" : "indoors"}`,
        `  Town Map: ${i === 2 ? "beta" : "alpha"}`,
        `  Item: ${i === 2 ? 3 : 0}`
      );
    }
    await writeFile(path.join(project, "map_sectors.yml"), `${sectors.join("\n")}\n`, "utf8");
    await writeFile(path.join(project, "Tilesets", "00.fts"), syntheticFts(), "utf8");

    await writeFile(path.join(project, "map_sprites.yml"), [
      "0:",
      "  0:",
      "  - {NPC ID: 744, X: 64, Y: 64}",
      "  2:",
      "  - {NPC ID: 100, X: 32, Y: 96}",
      "2:",
      "  2:",
      "  - {NPC ID: 101, X: 32, Y: 32}",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(project, "map_doors.yml"), [
      "1:",
      "  2:",
      "  - Destination X: 640",
      "    Destination Y: 768",
      "    Direction: up",
      "    Event Flag: 0x0",
      "    Style: 1",
      "    Text Pointer: $0",
      "    Type: door",
      "    X: 3",
      "    Y: 4",
      "  - Direction: sw",
      "    Type: stairway",
      "    X: 5",
      "    Y: 6",
      "  - Text Pointer: example.object",
      "    Type: object",
      "    X: 7",
      "    Y: 8",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(project, "npc_config_table.yml"), [
      "100:",
      "  Direction: left",
      "  Event Flag: 0x2",
      "  Show Sprite: when event flag set",
      "  Sprite: 7",
      "  Text Pointer 1: $0",
      "  Type: person",
      "101:",
      "  Direction: up",
      "  Event Flag: 0x3",
      "  Show Sprite: when event flag unset",
      "  Sprite: 6",
      "  Text Pointer 1: robot.follow_up",
      "  Type: person",
      "744:",
      "  Direction: down",
      "  Event Flag: 0x0",
      "  Movement: 605",
      "  Show Sprite: always",
      "  Sprite: 5",
      "  Text Pointer 1: robot.hello_world",
      "  Text Pointer 2: robot.follow_up",
      "  Type: person",
      ""
    ].join("\n"), "utf8");

    await writeFile(path.join(project, "sprite_groups.yml"), [
      "1:",
      "  Length: 16",
      "  Size: 16x24",
      "5:",
      "  Length: 16",
      "  Size: 16x24",
      "6:",
      "  Length: 16",
      "  Size: 16x24",
      "7:",
      "  Length: 16",
      "  Size: 16x24",
      ""
    ].join("\n"), "utf8");

    const sheet = encodePngRgba(64, 96, new Uint8Array(64 * 96 * 4).fill(128));
    await writeFile(path.join(project, "SpriteGroups", "001.png"), sheet);
    await writeFile(path.join(project, "SpriteGroups", "005.png"), sheet);
    await writeFile(path.join(project, "SpriteGroups", "006.png"), sheet);
  }

  it("emits a renderable world with NPC placement, spawn, and assets", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeSyntheticProject(project);

      const result = await convertProject({ project, out });
      const world = result.world;
      expect("mode" in world).toBe(false);
      if ("mode" in world) {
        throw new Error("expected region world");
      }

      expect(world.available).toBe(true);
      expect(world.region).toMatchObject({ originTile: { x: 8, y: 8 }, widthTiles: 48, heightTiles: 44 });
      expect(world.images).toEqual({ background: "assets/world/background.png", foreground: "assets/world/foreground.png" });

      const npc744 = world.npcs.find((npc) => npc.npcId === 744);
      expect(npc744).toMatchObject({
        eventFlag: 0,
        interactable: true,
        visible: true,
        textPointer: "robot.hello_world",
        textPointer2: "robot.follow_up",
        spriteGroup: 5,
        worldPixel: { x: 896, y: 896 },
        regionPixel: { x: 640, y: 640 },
        sheet: "assets/sprites/005.png"
      });
      const npc100 = world.npcs.find((npc) => npc.npcId === 100);
      expect(npc100).toMatchObject({
        eventFlag: 2,
        showSprite: "when event flag set",
        interactable: false,
        visible: false
      });

      expect(world.player).toMatchObject({ spriteGroup: 1, sheet: "assets/sprites/001.png" });
      expect(world.player?.spawnRegionPixel).toEqual({ x: 576, y: 640 });
      expect(world.counts).toMatchObject({ npcs: 2, visibleNpcs: 1 });

      expect(result.sprites.sheets.map((sheet) => sheet.groupId)).toEqual([1, 5]);
      expect(result.sprites.sheets[0]).toMatchObject({ frameWidth: 16, frameHeight: 24, columns: 4, rows: 4, frames: 16 });
      for (const sheet of result.sprites.sheets) {
        expect(sheet.animations, `sheet ${sheet.groupId} should carry walk-frame metadata`).toEqual({
          up: [0, 1],
          right: [2, 3],
          down: [4, 5],
          left: [6, 7]
        });
      }

      for (const asset of ["assets/world/background.png", "assets/world/foreground.png", "assets/sprites/001.png", "assets/sprites/005.png"]) {
        expect(existsSync(path.join(out, asset)), `${asset} should exist`).toBe(true);
      }

      expect(result.manifest.counts.worldNpcs).toBe(2);
      expect(result.manifest.counts.spriteSheets).toBe(2);
      expect(result.tutorialStatus.steps.find((step) => step.id === "world_region_rendered")?.status).toBe("pass");

      const validated = await validateGeneratedOutput(out);
      expect(validated.ok).toBe(true);
      expect(validated.worldAvailable).toBe(true);
      expect(validated.worldNpcs).toBe(2);
      expect(validated.spriteSheets).toBe(2);
      expect(validated.worldAssetsChecked).toBe(4);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it("emits a streamable chunked world in full mode", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-full-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeSyntheticChunkProject(project);
      await writeFile(path.join(project, "teleport_destination_table.yml"), [
        "2:",
        "  Direction: 3",
        "  Unknown: 0",
        "  Warp Style: 7",
        "  X: 320",
        "  Y: 448",
        "5:",
        "  Direction: 7",
        "  Unknown: 0",
        "  Warp Style: 1",
        "  X: 640",
        "  Y: 768",
        ""
      ].join("\n"), "utf8");

      const result = await convertProject({ project, out, worldMode: "full" });
      const world = result.world;
      expect("mode" in world && world.mode).toBe("full");
      if (!("mode" in world)) {
        throw new Error("expected chunked world");
      }

      expect(world).toMatchObject({
        available: true,
        mapWidthTiles: 32,
        mapHeightTiles: 32,
        chunkSizeTiles: 16
      });
      expect(world.sectors).toMatchObject({
        cols: 4,
        rows: 8,
        sectorWidthTiles: 8,
        sectorHeightTiles: 4,
        tileSize: 32
      });
      expect(world.sectors?.areaIds).toHaveLength(32);
      expect(world.sectors?.indoor).toHaveLength(32);
      expect(world.sectors?.bounded).toHaveLength(32);
      expect(world.sectors?.areaIds[0]).toBe(world.sectors?.areaIds[1]);
      expect(world.sectors?.areaIds[0]).not.toBe(world.sectors?.areaIds[2]);
      expect(world.sectors?.indoor[0]).toBe(1);
      expect(world.sectors?.indoor[2]).toBe(0);
      expect(world.sectors?.indoor[3]).toBe(0);
      expect(world.sectors?.bounded[0]).toBe(1);
      expect(world.sectors?.bounded[2]).toBe(1);
      expect(world.sectors?.bounded[3]).toBe(0);
      const sectorJson = JSON.stringify(world.sectors);
      expect(sectorJson).not.toContain("indoors");
      expect(sectorJson).not.toContain("none");
      expect(sectorJson).not.toContain("cave-style");
      expect(sectorJson).not.toContain("alpha");
      expect(sectorJson).not.toContain("beta");
      expect(world.chunks).toHaveLength(4);
      const byChunk = new Map(world.chunks.map((chunk) => [`${chunk.cx},${chunk.cy}`, chunk]));
      expect(byChunk.get("0,0")).toMatchObject({ background: "assets/world/chunks/background-0-0.png", foreground: null, void: false });
      expect(byChunk.get("1,0")).toMatchObject({ background: null, foreground: null, void: true });
      expect(byChunk.get("0,1")).toMatchObject({
        background: "assets/world/chunks/background-0-1.png",
        foreground: "assets/world/chunks/foreground-0-1.png",
        void: false
      });
      expect(byChunk.get("1,1")).toMatchObject({ background: "assets/world/chunks/background-1-1.png", foreground: null, void: false });
      expect(world.counts).toMatchObject({ chunks: 4, chunksWritten: 3, voidChunks: 1, chunkFiles: 4 });
      expect(world.counts.doors).toBe(2);
      expect(world.counts.doorTypes).toEqual({ door: 1, object: 1, stairway: 1 });
      expect(world.doors).toEqual([
        {
          type: "door",
          worldPixel: { x: 536, y: 288 },
          destinationWorldPixel: { x: 640, y: 768 },
          direction: "up",
          style: 1,
          eventFlag: "0x0",
          textPointer: "$0"
        },
        {
          type: "stairway",
          worldPixel: { x: 552, y: 304 },
          destinationWorldPixel: { x: 552, y: 304 },
          direction: "sw"
        }
      ]);

      expect(result.teleportDestinations).toMatchObject({
        units: { x: "world-pixels", y: "world-pixels" },
        destinations: [
          { id: 2, x: 2560, y: 3584, direction: 3, warpStyle: 7 },
          { id: 5, x: 5120, y: 6144, direction: 7, warpStyle: 1 }
        ],
        counts: { destinations: 2 }
      });
      expect(result.manifest.files.teleportDestinations).toBe("teleport-destinations.json");
      expect(result.manifest.counts.teleportDestinations).toBe(2);
      expect(existsSync(path.join(out, "teleport-destinations.json"))).toBe(true);

      expect(world.collision.width).toBe(128);
      expect(world.collision.height).toBe(128);
      expect(world.collision.solidRows).toHaveLength(128);
      expect(world.collision.surfaceRows).toHaveLength(128);
      expect(world.collision.solidRows[0]).toHaveLength(128);
      expect(world.collision.surfaceRows[0]).toHaveLength(256);

      expect(world.npcs).toHaveLength(3);
      expect(world.counts.visibleNpcs).toBe(2);
      const hidden = world.npcs.find((npc) => npc.npcId === 100);
      expect(hidden).toMatchObject({
        eventFlag: 2,
        showSprite: "when event flag set",
        visible: false,
        interactable: false,
        spriteGroup: 7,
        worldPixel: { x: 544, y: 96 }
      });
      expect(hidden?.sheet).toBeUndefined();
      expect(world.npcs.find((npc) => npc.npcId === 101)).toMatchObject({
        eventFlag: 3,
        showSprite: "when event flag unset",
        visible: true
      });
      expect(world.npcs.find((npc) => npc.npcId === 744)).toMatchObject({
        eventFlag: 0,
        visible: true,
        interactable: true,
        spriteGroup: 5,
        worldPixel: { x: 64, y: 64 },
        sheet: "assets/sprites/005.png"
      });

      expect(result.sprites.sheets.map((sheet) => sheet.groupId)).toEqual([1, 5, 6]);
      for (const asset of [
        "assets/world/chunks/background-0-0.png",
        "assets/world/chunks/background-0-1.png",
        "assets/world/chunks/foreground-0-1.png",
        "assets/world/chunks/background-1-1.png",
        "assets/sprites/001.png",
        "assets/sprites/005.png",
        "assets/sprites/006.png"
      ]) {
        expect(existsSync(path.join(out, asset)), `${asset} should exist`).toBe(true);
      }
      expect(existsSync(path.join(out, "assets/world/chunks/background-1-0.png"))).toBe(false);
      expect(existsSync(path.join(out, "assets/sprites/007.png"))).toBe(false);

      const validated = await validateGeneratedOutput(out);
      expect(validated.ok).toBe(true);
      expect(validated.worldAvailable).toBe(true);
      expect(validated.worldNpcs).toBe(3);
      expect(validated.spriteSheets).toBe(3);
      expect(validated.teleportDestinations).toBe(2);
      expect(validated.worldAssetsChecked).toBe(7);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it("scales map-door destinations from warp-grid units with raw over-range fallback", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-doors-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeSyntheticChunkProject(project);
      await writeFile(path.join(project, "map_doors.yml"), [
        "0:",
        "  0:",
        "  - Destination X: 100",
        "    Destination Y: 50",
        "    Text Pointer: synthetic.in_range",
        "    Type: door",
        "    X: 1",
        "    Y: 2",
        "  - Destination X: 129",
        "    Destination Y: 130",
        "    Text Pointer: synthetic.over_range",
        "    Type: door",
        "    X: 3",
        "    Y: 4",
        "  - Destination X: 128",
        "    Destination Y: 128",
        "    Text Pointer: synthetic.boundary",
        "    Type: door",
        "    X: 5",
        "    Y: 6",
        "  - Text Pointer: synthetic.no_destination",
        "    Type: door",
        "    X: 7",
        "    Y: 8",
        ""
      ].join("\n"), "utf8");

      const result = await convertProject({ project, out, worldMode: "full" });
      if (!("mode" in result.world)) {
        throw new Error("expected chunked world");
      }

      const doors = new Map(result.world.doors.map((door) => [door.textPointer, door]));
      expect(doors.get("synthetic.in_range")?.destinationWorldPixel).toEqual({ x: 800, y: 400 });
      expect(doors.get("synthetic.over_range")?.destinationWorldPixel).toEqual({ x: 129, y: 130 });
      expect(doors.get("synthetic.boundary")?.destinationWorldPixel).toEqual({ x: 1024, y: 1024 });
      expect(doors.get("synthetic.no_destination")?.destinationWorldPixel).toEqual({ x: 56, y: 64 });
      expect(doors.get("synthetic.no_destination")?.worldPixel).toEqual({ x: 56, y: 64 });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it("uses a ROM-derived full-world spawn when present and falls back when absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-rom-start-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      const rom = path.join(temp, "synthetic.sfc");
      await writeSyntheticChunkProject(project);
      await writeFile(path.join(project, "ccscript", "data_00.ccs"), [
        "l_0xc01234:",
        "    end",
        ""
      ].join("\n"), "utf8");

      const bytes = new Uint8Array(EB_ROM_SIZE_BYTES);
      bytes[NEW_GAME_START_X_FILE_OFFSET] = 0x20;
      bytes[NEW_GAME_START_X_FILE_OFFSET + 1] = 0x01;
      bytes[NEW_GAME_START_Y_FILE_OFFSET] = 0x80;
      bytes[NEW_GAME_START_Y_FILE_OFFSET + 1] = 0x01;
      bytes[NEW_GAME_STARTUP_LOW16_FILE_OFFSET] = 0x34;
      bytes[NEW_GAME_STARTUP_LOW16_FILE_OFFSET + 1] = 0x12;
      bytes[NEW_GAME_STARTUP_BANK_FILE_OFFSET] = 0xC0;
      await writeFile(rom, bytes);

      const romResult = await convertProject({ project, out, worldMode: "full", romPath: rom });
      if (!("mode" in romResult.world)) {
        throw new Error("expected chunked world");
      }
      expect(romResult.world.player.spawnWorldPixel).toEqual({ x: 0x0120, y: 0x0180 });
      expect(romResult.world.player.spawnDerivation).toBe(ROM_NEW_GAME_START_DERIVATION);
      expect(romResult.world.player.newGameStartupRef).toBe("data_00.l_0xc01234");
      expect(romResult.world.player.newGameStartupDerivation).toBe(ROM_NEW_GAME_STARTUP_DERIVATION);

      const fallbackResult = await convertProject({ project, out, worldMode: "full", romPath: path.join(temp, "missing.sfc") });
      if (!("mode" in fallbackResult.world)) {
        throw new Error("expected chunked world");
      }
      expect(fallbackResult.world.player.spawnWorldPixel).not.toEqual({ x: 0x0120, y: 0x0180 });
      expect(fallbackResult.world.player.spawnDerivation).toContain("nearest walkable point near NPC 744");
      expect(fallbackResult.world.player.newGameStartupRef).toBeUndefined();
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it("degrades to an unavailable world when map data is missing", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-missing-"));
    try {
      const project = path.join(temp, "project");
      await mkdir(path.join(project, "ccscript"), { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");

      const result = await convertProject({ project, out: path.join(temp, "generated") });

      expect(result.world.available).toBe(false);
      expect(result.world.warnings.some((warning) => warning.code === "world_missing_map_tiles")).toBe(true);
      expect(result.tutorialStatus.steps.find((step) => step.id === "world_region_rendered")?.status).toBe("fail");

      const validated = await validateGeneratedOutput(path.join(temp, "generated"));
      expect(validated.ok).toBe(true);
      expect(validated.worldAvailable).toBe(false);
      expect(validated.worldAssetsChecked).toBe(0);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
