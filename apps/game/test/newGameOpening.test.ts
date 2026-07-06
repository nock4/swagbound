import { describe, expect, it } from "vitest";
import type { ScriptCollection, ScriptCommand, WorldChunked, WorldDoor } from "@eb/schemas";
import {
  decideNewGameOpening,
  resolveNewGameOpeningStart,
  type NewGameOpeningStart
} from "../src/newGameOpening";

function location(file: string, line: number) {
  return { file, line, column: 1 };
}

function label(file: string, name: string, line: number): ScriptCommand {
  return { cmd: "label", raw: `${name}:`, name, sourceLocation: location(file, line) };
}

function scripts(reference = "alpha.start"): ScriptCollection {
  const [stem, name] = reference.split(".");
  const path = `ccscript/${stem}.ccs`;
  const commands = [label(path, name, 1)];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path,
      commands,
      labels: [name],
      counts: { commands: 1, labels: 1, textCommands: 0, unknownCommands: 0 },
      warnings: []
    }],
    counts: { files: 1, commands: 1, labels: 1, textCommands: 0, unknownCommands: 0 },
    warnings: []
  };
}

function rows(width: number, height: number, solidCells: Array<[number, number]> = []): string[] {
  const solid = new Set(solidCells.map(([x, y]) => `${x},${y}`));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => solid.has(`${x},${y}`) ? "1" : "0").join("")
  );
}

function door(worldPixel: { x: number; y: number }, destinationWorldPixel: { x: number; y: number }): WorldDoor {
  return {
    type: "door",
    worldPixel,
    destinationWorldPixel,
    direction: "down",
    style: 1,
    eventFlag: "0x0",
    textPointer: "$0"
  };
}

function world(overrides: Partial<WorldChunked> = {}): WorldChunked {
  const entryDoor = door({ x: 32, y: 80 }, { x: 160, y: 160 });
  const upstairsDoor = door({ x: 160, y: 96 }, { x: 240, y: 64 });
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    available: true,
    mode: "full",
    tileSize: 8,
    mapWidthTiles: 64,
    mapHeightTiles: 64,
    chunkSizeTiles: 16,
    chunks: [{ cx: 0, cy: 0, background: null, foreground: null, void: false }],
    collision: { cellSize: 8, width: 64, height: 64, solidRows: rows(64, 64), surfaceRows: rows(64, 64) },
    npcs: [],
    player: {
      spriteGroup: 1,
      spawnWorldPixel: { x: 40, y: 80 },
      spawnDerivation: "synthetic"
    },
    sources: {
      mapTiles: true,
      mapSectors: true,
      tilesetFiles: 1,
      mapSprites: true,
      npcConfig: true,
      spriteGroupsYml: true
    },
    counts: {
      npcs: 0,
      visibleNpcs: 0,
      solidCells: 0,
      mapTilesetsUsed: 1,
      palettesUsed: 1,
      doors: 2,
      doorTypes: { door: 2 },
      chunks: 1,
      chunksWritten: 1,
      voidChunks: 0,
      chunkFiles: 1
    },
    doors: [entryDoor, upstairsDoor],
    warnings: [],
    ...overrides
  };
}

describe("new-game opening decision", () => {
  const start: NewGameOpeningStart = {
    eventRef: "alpha.start",
    spawn: { x: 1, y: 2 },
    derivation: "synthetic"
  };

  it("runs the resolved opening only for an enabled fresh new game", () => {
    expect(decideNewGameOpening({ newGame: true, disabled: false, resolvedStart: start })).toEqual({
      runOpening: true,
      start
    });
  });

  it("falls back when bypassed, loading a save, or unresolved", () => {
    expect(decideNewGameOpening({ newGame: true, disabled: true, resolvedStart: start })).toEqual({
      runOpening: false,
      fallbackReason: "disabled"
    });
    expect(decideNewGameOpening({ newGame: false, disabled: false, resolvedStart: start })).toEqual({
      runOpening: false,
      fallbackReason: "not_new_game"
    });
    expect(decideNewGameOpening({ newGame: true, disabled: false })).toEqual({
      runOpening: false,
      fallbackReason: "unresolved_opening"
    });
  });
});

describe("new-game opening resolver", () => {
  it("anchors the start to the bedroom spawn, snapped to a walkable cell", () => {
    // The resolver ignores the door graph and anchors to Bosch's bedroom coordinate
    // (injectable here so the synthetic world's small collision grid is in-bounds).
    const resolved = resolveNewGameOpeningStart(world(), scripts("alpha.start"), "alpha.start", { x: 240, y: 64 });

    expect(resolved).toMatchObject({
      resolved: true,
      start: {
        eventRef: "alpha.start",
        spawn: { x: 240, y: 64 }
      }
    });
  });

  it("reports missing inputs and unwalkable bedrooms without falling back to literals", () => {
    expect(resolveNewGameOpeningStart(world(), scripts("alpha.start"), "missing.start")).toEqual({
      resolved: false,
      reason: "missing_script"
    });
    // A bedroom coordinate with no walkable cell in range resolves unwalkable.
    expect(resolveNewGameOpeningStart(world(), scripts("alpha.start"), "alpha.start", { x: 100000, y: 100000 })).toEqual({
      resolved: false,
      reason: "unwalkable_spawn"
    });
  });
});
