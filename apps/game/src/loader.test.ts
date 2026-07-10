import { describe, expect, it } from "vitest";
import type { AddedNpcs, BattleData, DrifellaSourceChecks, EnemyStatOverrides, StoryTriggers, WorldChunkedNpc } from "@eb/schemas";
import {
  addedNpcsForSpawn,
  addedNpcSpawnEligible,
  applyEnemyStatOverrides,
  buildAddedWorldNpcs,
  contentReferencedAddedNpcIds,
  isAddedNpcExtrasEnabled,
  isAddedWorldChunkedNpc
} from "./loader";

function enemy(id: number, stats: Pick<BattleData["enemies"][number], "hp" | "offense" | "defense" | "speed">): BattleData["enemies"][number] {
  return {
    id,
    name: `Enemy ${id}`,
    spriteId: id,
    level: 1,
    hp: stats.hp,
    offense: stats.offense,
    defense: stats.defense,
    speed: stats.speed,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [
      { id: 0, arg: 0 },
      { id: 0, arg: 0 },
      { id: 0, arg: 0 },
      { id: 0, arg: 0 }
    ],
    itemDropped: null,
    itemRarity: null
  };
}

function battleData(enemies: BattleData["enemies"]): BattleData {
  return {
    schemaVersion: "test",
    sourceProjectPath: "test",
    selection: {
      method: "test",
      mapEnemyGroupIds: [],
      battleGroupIds: [],
      placementCellMapping: "test",
      fallbackUsed: false
    },
    statMapping: {
      level: "test",
      hp: "test",
      defense: "test",
      offense: "test",
      speed: "test",
      experience: "test",
      money: "test",
      bossFlag: "test",
      actions: "test",
      itemDropped: "test",
      itemRarity: "test"
    },
    spriteFormat: {
      source: "test",
      fileType: "png",
      indexedPaletteBits: 4,
      transparentPaletteIndex: 0,
      allowedSizes: [[64, 64]]
    },
    assetLayout: {
      spriteDir: "test",
      backgroundDir: "test",
      spriteFilePattern: "test",
      backgroundFilePattern: "test"
    },
    enemies,
    groups: [],
    counts: {
      enemies: enemies.length,
      groups: 0,
      spriteFiles: 0,
      backgroundFiles: 0
    },
    warnings: []
  };
}

describe("enemy stat overrides", () => {
  it("overwrites only listed numeric stats by enemy id", () => {
    const battle = battleData([
      enemy(131, { hp: 63, offense: 12, defense: 17, speed: 7 }),
      enemy(54, { hp: 75, offense: 15, defense: 18, speed: 5 })
    ]);
    const overrides: EnemyStatOverrides = {
      schema: "swagbound.enemy-stat-overrides.v1",
      byEnemyId: {
        "131": { hp: 80, offense: 18 },
        "999": { hp: 1, offense: 1, defense: 1, speed: 1 }
      }
    };

    const resolved = applyEnemyStatOverrides(battle, overrides);

    expect(resolved?.enemies.find((entry) => entry.id === 131)).toMatchObject({
      hp: 80,
      offense: 18,
      defense: 17,
      speed: 7
    });
    expect(resolved?.enemies.find((entry) => entry.id === 54)).toMatchObject({
      hp: 75,
      offense: 15,
      defense: 18,
      speed: 5
    });
  });
});

describe("added NPC overlay normalization", () => {
  it("normalizes eligible added NPCs into chunked NPC runtime data", () => {
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: 100000,
        worldPixel: { x: 128, y: 160 },
        spriteGroup: 5,
        facing: "left",
        interaction: { pages: ["Counter service."], shop: 3 }
      }]
    };

    const normalized = buildAddedWorldNpcs(addedNpcs, []);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      npcId: 100000,
      spriteGroup: 5,
      direction: "left",
      type: "added-npc",
      movement: 0,
      showSprite: "always",
      interactable: true,
      visible: true,
      worldPixel: { x: 128, y: 160 },
      addedNpc: true,
      addedInteraction: { pages: ["Counter service."], shop: 3 }
    });
    expect(isAddedWorldChunkedNpc(normalized[0])).toBe(true);
  });

  it("guards against added NPC ids that collide with existing runtime NPC ids", () => {
    const existing: Pick<WorldChunkedNpc, "npcId">[] = [{ npcId: 100000 }];
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [
        {
          id: 100000,
          worldPixel: { x: 128, y: 160 },
          spriteGroup: 5,
          facing: "down",
          interaction: { shop: 1 }
        },
        {
          id: 100001,
          worldPixel: { x: 160, y: 160 },
          spriteGroup: 5,
          facing: "up",
          interaction: { ref: "library:neighbor" }
        }
      ]
    };

    expect(addedNpcSpawnEligible({ id: 100000 }, existing)).toBe(false);
    expect(addedNpcSpawnEligible({ id: 100001 }, existing)).toBe(true);
    expect(buildAddedWorldNpcs(addedNpcs, existing).map((npc) => npc.npcId)).toEqual([100001]);
  });

  it("spawns interaction-less added NPCs as non-interactable markers", () => {
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: 100002,
        worldPixel: { x: 192, y: 224 },
        spriteGroup: 59,
        facing: "down"
      }]
    };

    const normalized = buildAddedWorldNpcs(addedNpcs, []);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      npcId: 100002,
      interactable: false,
      visible: true,
      worldPixel: { x: 192, y: 224 },
      addedNpc: true
    });
    expect(normalized[0].addedInteraction).toBeUndefined();
  });

  it("keeps added NPCs loaded but filters default spawning to content-referenced exceptions", () => {
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [
        { id: 100010, worldPixel: { x: 128, y: 160 }, spriteGroup: 5, facing: "down", alwaysSpawn: true },
        { id: 100011, worldPixel: { x: 160, y: 160 }, spriteGroup: 5, facing: "down" },
        { id: 100012, worldPixel: { x: 192, y: 160 }, spriteGroup: 5, facing: "down" }
      ]
    };
    const sourceChecks: DrifellaSourceChecks = {
      schema: "swagbound.drifella-source-checks.v1",
      checks: [{
        id: "check",
        drifellaId: "drifella2-1",
        npcId: 100300,
        region: "test",
        tier: 1,
        placement: { kind: "test", worldPixel: { x: 0, y: 0 }, facing: "down" },
        visibility: { requireFlags: [], blockFlags: [] },
        battleSprite: "sprite.png",
        hints: [{ kind: "rumorNpc", npcId: 100011, page: "hint" }],
        entryPrompt: ["prompt"],
        questions: {
          drawCount: 1,
          pool: [{ type: "trueFalse", prompt: "Ready?", answer: true }]
        },
        rewards: { cardId: "card", itemId: 1 },
        retry: { policy: "leaveArea", rotatePool: false, checkpointAt: null },
        reactions: {
          correct: ["correct"],
          cleared: ["cleared"],
          failed: ["failed"],
          alreadyCleared: ["already"]
        }
      }]
    };
    const storyTriggers = {
      schema: "swagbound.story-triggers.v1",
      triggers: [{
        id: "trigger",
        area: { x: 0, y: 0, w: 8, h: 8 },
        setFlags: ["saw:100012"]
      }]
    } as StoryTriggers;

    expect([...contentReferencedAddedNpcIds(addedNpcs, sourceChecks, storyTriggers)].sort()).toEqual([100010, 100011, 100012]);
    expect(addedNpcsForSpawn(addedNpcs, {
      extrasEnabled: false,
      sourceChecks,
      storyTriggers
    })?.npcs.map((npc) => npc.id)).toEqual([100010, 100011, 100012]);
    expect(addedNpcsForSpawn(addedNpcs, {
      extrasEnabled: true,
      sourceChecks,
      storyTriggers
    })?.npcs.map((npc) => npc.id)).toEqual([100010, 100011, 100012]);
  });

  it("reads extras=1 as the opt-in added NPC spawn query", () => {
    expect(isAddedNpcExtrasEnabled("?extras=1")).toBe(true);
    expect(isAddedNpcExtrasEnabled("?extras=0")).toBe(false);
    expect(isAddedNpcExtrasEnabled("?nointro=1")).toBe(false);
  });
});
