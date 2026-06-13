import { describe, expect, it } from "vitest";
import {
  buildDialoguePages,
  resolveScriptReferenceFlow,
  ManifestSchema,
  ScriptCollectionSchema,
  SpriteSheetCollectionSchema,
  WorldArtifactSchema,
  isNpcVisibleForEventFlags
} from "@eb/schemas";
import { buildSliceArtifacts, COLLISION_CELL_SIZE } from "../src/build";
import type { SliceSource } from "../src/types";

const syntheticSlice: SliceSource = {
  id: "synthetic",
  title: "Synthetic Meadow",
  description: "Small original compiler fixture.",
  tileSize: 32,
  palette: [
    { symbol: "T", name: "hedge", solid: true, color: "#224433", accent: "#336644" },
    { symbol: "P", name: "path", solid: false, color: "#c0a060", accent: "#d8bc7a" },
    { symbol: "G", name: "grass", solid: false, color: "#448a55", accent: "#66ad72" }
  ],
  grid: [
    "TTTT",
    "TPGT",
    "TTTT"
  ],
  player: {
    sprite: "player",
    spawn: { x: 1, y: 1 },
    facing: "right"
  },
  sprites: [
    {
      id: "player",
      groupId: 1,
      role: "player",
      colors: {
        hair: "#222222",
        shirt: "#315f9a",
        pants: "#30374a",
        accent: "#f2d17b",
        skin: "#d99f6d"
      }
    },
    {
      id: "guide",
      groupId: 2,
      role: "npc",
      colors: {
        hair: "#4f3426",
        shirt: "#7c4fa3",
        pants: "#394b59",
        accent: "#e7b8d8",
        skin: "#c8875f"
      }
    }
  ],
  npcs: [
    {
      id: 2001,
      name: "Guide",
      sprite: "guide",
      position: { x: 2, y: 1 },
      facing: "left",
      dialogue: ["First original page.", "Second original page."]
    }
  ]
};

describe("@eb/content-builder", () => {
  it("emits schema-valid generated artifacts from a synthetic original slice", () => {
    const artifacts = buildSliceArtifacts(syntheticSlice, {
      sourcePath: "synthetic",
      generatedAt: "2026-06-13T00:00:00.000Z"
    });

    expect(() => ManifestSchema.parse(artifacts.manifest)).not.toThrow();
    expect(() => WorldArtifactSchema.parse(artifacts.world)).not.toThrow();
    expect(() => ScriptCollectionSchema.parse(artifacts.scripts)).not.toThrow();
    expect(() => SpriteSheetCollectionSchema.parse(artifacts.sprites)).not.toThrow();
    expect(artifacts.manifest.counts).toMatchObject({
      scriptFiles: 1,
      labels: 1,
      textCommands: 2,
      npcReferences: 1,
      worldNpcs: 1,
      spriteSheets: 2
    });
    expect(artifacts.world.counts.visibleNpcs).toBe(artifacts.world.npcs.length);
    expect(artifacts.world.npcs).toEqual([
      expect.objectContaining({
        npcId: 2001,
        showSprite: "always",
        visible: true
      })
    ]);
    expect(artifacts.world.npcs.every((npc) =>
      isNpcVisibleForEventFlags(npc.showSprite, npc.eventFlag, { isSet: () => false })
    )).toBe(true);
    expect(artifacts.assets.map((asset) => asset.path).sort()).toEqual([
      "assets/sprites/guide.png",
      "assets/sprites/player.png",
      "assets/world/background.png",
      "assets/world/foreground.png"
    ]);
  });

  it("derives collision rows from solid tile symbols", () => {
    const artifacts = buildSliceArtifacts(syntheticSlice);
    const collision = artifacts.world.collision;
    const cellsPerTile = syntheticSlice.tileSize / COLLISION_CELL_SIZE;

    expect(collision?.width).toBe(16);
    expect(collision?.height).toBe(12);
    expect(collision?.solidRows.slice(0, cellsPerTile)).toEqual(Array(cellsPerTile).fill("1111111111111111"));
    expect(collision?.solidRows.slice(cellsPerTile, cellsPerTile * 2)).toEqual(
      Array(cellsPerTile).fill("1111000000001111")
    );
    expect(artifacts.world.counts.solidCells).toBe(160);
  });

  it("resolves NPC dialogue into expected pages", () => {
    const artifacts = buildSliceArtifacts(syntheticSlice);
    const flow = resolveScriptReferenceFlow(artifacts.scripts, "slice.guide");
    const pages = buildDialoguePages(flow?.commands ?? []);

    expect(pages.map((page) => page.text)).toEqual(["First original page.", "Second original page."]);
    expect(artifacts.world.npcs[0].textPointer).toBe("slice.guide");
  });
});
