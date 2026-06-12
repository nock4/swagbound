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
  parseIntKeyedYaml,
  parseMapSprites,
  parseMapTiles,
  placementToWorldPixel
} from "../src/coilsnakeYaml";
import { chooseRegion, encodeCollisionRows, findSpawn } from "../src/world";
import { encodePngRgba, readPngHeader } from "../src/png";

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
    await writeFile(path.join(project, "ccscript", "robot.ccs"), 'hello_world:\n    "@Hello World!" end\n', "utf8");

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
      "  Text Pointer 2: $0",
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

  it("emits a renderable world with NPC placement, spawn, and assets", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-world-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeSyntheticProject(project);

      const result = await convertProject({ project, out });
      const world = result.world;

      expect(world.available).toBe(true);
      expect(world.region).toMatchObject({ originTile: { x: 8, y: 8 }, widthTiles: 48, heightTiles: 44 });
      expect(world.images).toEqual({ background: "assets/world/background.png", foreground: "assets/world/foreground.png" });

      const npc744 = world.npcs.find((npc) => npc.npcId === 744);
      expect(npc744).toMatchObject({
        interactable: true,
        visible: true,
        textPointer: "robot.hello_world",
        spriteGroup: 5,
        worldPixel: { x: 896, y: 896 },
        regionPixel: { x: 640, y: 640 },
        sheet: "assets/sprites/005.png"
      });
      const npc100 = world.npcs.find((npc) => npc.npcId === 100);
      expect(npc100).toMatchObject({ interactable: false, visible: false });

      expect(world.player).toMatchObject({ spriteGroup: 1, sheet: "assets/sprites/001.png" });
      expect(world.player?.spawnRegionPixel).toEqual({ x: 576, y: 640 });
      expect(world.counts).toMatchObject({ npcs: 2, visibleNpcs: 1 });

      expect(result.sprites.sheets.map((sheet) => sheet.groupId)).toEqual([1, 5]);
      expect(result.sprites.sheets[0]).toMatchObject({ frameWidth: 16, frameHeight: 24, columns: 4, rows: 4, frames: 16 });

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
