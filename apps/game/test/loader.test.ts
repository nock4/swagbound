import { afterEach, describe, expect, it, vi } from "vitest";
import type { BattleData, CharacterCollection, CustomDialogue, DrifellaBarks, ItemCollection, Manifest, NpcOverrides, PsiCollection, ScriptCollection, ScriptCommand, WorldChunkedNpc } from "@eb/schemas";
import { applyEnemyOverrides, applyNpcOverride, buildCustomDialogueWithDrifellaBarks, buildDialogueForReference, loadGameData } from "../src/loader";
import { isGeneratedDrifellaBarkEntry } from "../src/customDialogueLookup";
import { drifellaBarkForNpcId } from "../src/drifellaBarks";

const file = "ccscript/alpha.ccs";
const sourceLocation = { file, line: 1, column: 1 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function command(command: ScriptCommand): ScriptCommand {
  return command;
}

function syntheticScripts(): ScriptCollection {
  const commands: ScriptCommand[] = [
    command({ cmd: "label", name: "start", raw: "start:", sourceLocation }),
    command({ cmd: "control", code: "goto", target: "target", raw: "goto(target)", sourceLocation }),
    command({
      cmd: "text",
      value: "Skipped synthetic text.",
      segments: [{ kind: "text", value: "Skipped synthetic text." }],
      raw: "\"Skipped synthetic text.\"",
      sourceLocation
    }),
    command({ cmd: "end", raw: "end", sourceLocation }),
    command({ cmd: "label", name: "target", raw: "target:", sourceLocation }),
    command({
      cmd: "text",
      value: "Resolved synthetic text.",
      segments: [{ kind: "text", value: "Resolved synthetic text." }],
      raw: "\"Resolved synthetic text.\"",
      sourceLocation
    }),
    command({ cmd: "end", raw: "end", sourceLocation })
  ];

  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path: file,
      commands,
      labels: ["start", "target"],
      counts: {
        commands: commands.length,
        labels: 2,
        textCommands: 2,
        unknownCommands: 0
      },
      warnings: []
    }],
    counts: {
      files: 1,
      commands: commands.length,
      labels: 2,
      textCommands: 2,
      unknownCommands: 0
    },
    warnings: []
  };
}

describe("buildDialogueForReference", () => {
  it("uses flow resolution for dialogue references", () => {
    const pages = buildDialogueForReference(syntheticScripts(), "alpha.start");

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      text: "Resolved synthetic text.",
      ended: true
    });
  });
});

describe("applyEnemyOverrides", () => {
  it("renames matching enemy ids and leaves other enemies untouched", () => {
    const battle = syntheticBattle();

    const resolved = applyEnemyOverrides(battle, {
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "159": { name: "AI Slop" }
      }
    });

    expect(resolved).not.toBe(battle);
    expect(resolved?.enemies.map((enemy) => enemy.name)).toEqual(["AI Slop", "Source B"]);
    expect(battle.enemies.map((enemy) => enemy.name)).toEqual(["Source A", "Source B"]);
    expect(resolved?.enemies[1]).toBe(battle.enemies[1]);
  });

  it("is a no-op without overrides or matching enemy ids", () => {
    const battle = syntheticBattle();

    expect(applyEnemyOverrides(battle, undefined)).toBe(battle);
    expect(applyEnemyOverrides(undefined, {
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "159": { name: "AI Slop" }
      }
    })).toBeUndefined();
    expect(applyEnemyOverrides(battle, {
      schema: "swagbound.enemy-overrides.v1",
      byEnemyId: {
        "999": { name: "Not Present" }
      }
    })).toBe(battle);
  });
});

describe("applyNpcOverride", () => {
  it("returns undefined for hidden NPCs so they are not spawned", () => {
    const npc = syntheticWorldNpc({ npcId: 111, worldPixel: { x: 7248, y: 1000 } });

    expect(applyNpcOverride(npc, npcOverrides({
      "111": { hide: true }
    }))).toBeUndefined();
  });

  it("uses override coordinates for repositioned NPCs and preserves all other fields", () => {
    const npc = syntheticWorldNpc({
      npcId: 111,
      spriteGroup: 45,
      movement: 2,
      worldPixel: { x: 7248, y: 1000 }
    });

    const resolved = applyNpcOverride(npc, npcOverrides({
      "111": { worldPixel: { x: 7248, y: 1016 } }
    }));

    expect(resolved).toMatchObject({
      npcId: 111,
      spriteGroup: 45,
      movement: 2,
      worldPixel: { x: 7248, y: 1016 }
    });
    expect(resolved).not.toBe(npc);
  });

  it("leaves NPCs without overrides unchanged", () => {
    const npc = syntheticWorldNpc({ npcId: 110, worldPixel: { x: 7200, y: 1000 } });

    expect(applyNpcOverride(npc, npcOverrides({
      "111": { worldPixel: { x: 7248, y: 1016 } }
    }))).toBe(npc);
  });
});

describe("buildCustomDialogueWithDrifellaBarks", () => {
  it("layers generated NPC barks under authored byNpcId entries", () => {
    const customDialogue: CustomDialogue = {
      schema: "swagbound.custom-dialogue.v1",
      byNpcId: {
        "7": { pages: ["Authored page."] }
      },
      byTextPointer: {
        "data_00.l_0x1": { pages: ["Pointer page."] }
      }
    };
    const barks: DrifellaBarks = {
      schema: "swagbound.drifella-barks.v1",
      phrases: ["alpha", "beta", "gamma", "delta"]
    };

    const merged = buildCustomDialogueWithDrifellaBarks(
      customDialogue,
      [{ npcId: 7 }, { npcId: 8 }, { npcId: 9 }],
      barks
    );

    expect(merged.byNpcId["7"]).toEqual({ pages: ["Authored page."] });
    expect(isGeneratedDrifellaBarkEntry(merged.byNpcId["7"])).toBe(false);
    expect(merged.byNpcId["8"]).toMatchObject({
      pages: [drifellaBarkForNpcId(8, barks.phrases)]
    });
    expect(isGeneratedDrifellaBarkEntry(merged.byNpcId["8"])).toBe(true);
    expect(merged.byNpcId["9"]).toMatchObject({
      pages: [drifellaBarkForNpcId(9, barks.phrases)]
    });
    expect(merged.byTextPointer).toEqual(customDialogue.byTextPointer);
  });
});

describe("loadGameData", () => {
  it("loads the generated Drifella bark pool overlay", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/drifella-barks.json")) {
        return jsonResponse({
          schema: "swagbound.drifella-barks.v1",
          phrases: ["wake up we gotta turn the power on"]
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const data = await loadGameData(syntheticManifest());

    expect(data.drifellaBarks).toEqual({
      schema: "swagbound.drifella-barks.v1",
      phrases: ["wake up we gotta turn the power on"]
    });
  });

  it("applies enemy override names after loading the battle collection", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/battle.json")) {
        return jsonResponse(syntheticBattle());
      }
      if (path.endsWith("/enemy-overrides.json")) {
        return jsonResponse({
          schema: "swagbound.enemy-overrides.v1",
          byEnemyId: {
            "159": { name: "AI Slop" }
          }
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const manifest = syntheticManifest();
    manifest.files.battle = "battle.json";
    const data = await loadGameData(manifest);

    expect(data.battle?.enemies.map((enemy) => enemy.name)).toEqual(["AI Slop", "Source B"]);
  });

  it("applies item override names after loading the items collection", async () => {
    const items: ItemCollection = {
      schemaVersion: "test",
      sourceProjectPath: "synthetic",
      derivation: {
        source: "synthetic",
        equippable: "synthetic",
        helpText: "synthetic"
      },
      items: [
        {
          id: 17,
          name: "Source A",
          type: 16,
          cost: 18,
          action: 239,
          argument: 0,
          equippable: true,
          miscFlags: []
        },
        {
          id: 18,
          name: "Source B",
          type: 16,
          cost: 48,
          action: 239,
          argument: 0,
          equippable: true,
          miscFlags: []
        }
      ],
      counts: {
        items: 2,
        equippable: 2
      },
      warnings: []
    };

    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/items.json")) {
        return jsonResponse(items);
      }
      if (path.endsWith("/item-overrides.json")) {
        return jsonResponse({
          schema: "swagbound.item-overrides.v1",
          byItemId: {
            "17": { name: "Practice Bat" }
          }
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const data = await loadGameData(syntheticManifest());

    expect(data.items?.items.map((item) => item.name)).toEqual(["Practice Bat", "Source B"]);
  });

  it("applies character override names after loading the characters collection", async () => {
    const characters: CharacterCollection = {
      schemaVersion: "test",
      sourceProjectPath: "synthetic",
      derivation: {
        source: "synthetic",
        baseStats: "synthetic",
        statFormula: "synthetic",
        hpPpFormula: "synthetic",
        uncertainty: "synthetic"
      },
      characters: [
        character(0, "SOURCE_HERO"),
        character(1, "SOURCE_OTHER")
      ],
      counts: {
        characters: 2,
        statFieldsPopulated: 14
      },
      warnings: []
    };

    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/characters.json")) {
        return jsonResponse(characters);
      }
      if (path.endsWith("/character-overrides.json")) {
        return jsonResponse({
          schema: "swagbound.character-overrides.v1",
          byCharId: {
            "0": { name: "Bosch" }
          }
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const manifest = syntheticManifest();
    manifest.files.characters = "characters.json";
    const data = await loadGameData(manifest);

    expect(data.characters?.characters.map((entry) => entry.name)).toEqual(["Bosch", "SOURCE_OTHER"]);
  });

  it("applies psi override names after loading the psi collection", async () => {
    const psi: PsiCollection = {
      schemaVersion: "test",
      sourceProjectPath: "synthetic",
      derivation: {
        source: "synthetic",
        names: "synthetic",
        learnedBy: "synthetic",
        usableOutsideBattle: "synthetic"
      },
      psi: [
        {
          id: 23,
          name: "Source Skill A",
          type: "recovery",
          strength: "alpha",
          usableOutsideBattle: true,
          learnedBy: [{ charId: 0, level: 2 }]
        },
        {
          id: 43,
          name: "Source Skill B",
          type: "assist",
          strength: "alpha",
          usableOutsideBattle: false,
          learnedBy: [{ charId: 0, level: 4 }]
        }
      ],
      counts: {
        psi: 2,
        learnedBy: 2
      },
      warnings: []
    };

    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/psi.json")) {
        return jsonResponse(psi);
      }
      if (path.endsWith("/psi-overrides.json")) {
        return jsonResponse({
          schema: "swagbound.psi-overrides.v1",
          byPsiId: {
            "23": { name: "Wake Up" }
          }
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const manifest = syntheticManifest();
    manifest.files.psi = "psi.json";
    const data = await loadGameData(manifest);

    expect(data.psi?.psi.map((entry) => entry.name)).toEqual(["Wake Up", "Source Skill B"]);
  });

  it("loads battle rules from the generated overlay", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/battle-rules.json")) {
        return jsonResponse({
          schema: "swagbound.battle-rules.v1",
          unescapableGroups: [450]
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const data = await loadGameData(syntheticManifest());

    expect(data.battleRules).toEqual({
      schema: "swagbound.battle-rules.v1",
      unescapableGroups: [450]
    });
  });

  it("loads the generated music manifest overlay", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/music-manifest.json")) {
        return jsonResponse({
          schema: "swagbound.music-manifest.v1",
          cues: {
            overworld: { file: "audio/music/overworld.mp3", gain: 0.4 },
            interior: { file: "audio/music/interior.mp3", gain: 0.4 },
            victory: { file: "audio/music/victory.mp3", loop: false, gain: 0.45 }
          }
        });
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const data = await loadGameData(syntheticManifest());

    expect(data.musicManifest).toEqual({
      schema: "swagbound.music-manifest.v1",
      cues: {
        overworld: {
          file: "audio/music/overworld.mp3",
          loop: true,
          gain: 0.4
        },
        interior: {
          file: "audio/music/interior.mp3",
          loop: true,
          gain: 0.4
        },
        victory: {
          file: "audio/music/victory.mp3",
          loop: false,
          gain: 0.45
        }
      }
    });
  });

  it("loads the generated NPC override overlay", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/npc-overrides.json")) {
        return jsonResponse(npcOverrides({
          "111": { worldPixel: { x: 7248, y: 1016 } },
          "112": { hide: true }
        }));
      }
      throw new Error(`No fixture for ${path}`);
    }));

    const data = await loadGameData(syntheticManifest());

    expect(data.npcOverrides.byNpcId["111"].worldPixel).toEqual({ x: 7248, y: 1016 });
    expect(data.npcOverrides.byNpcId["112"].hide).toBe(true);
  });
});

function character(id: number, name: string): CharacterCollection["characters"][number] {
  return {
    id,
    name,
    level: 1,
    experience: 0,
    maxHp: 30,
    maxPp: 10,
    offense: 2,
    defense: 2,
    speed: 2,
    guts: 2,
    vitality: 2,
    iq: 2,
    luck: 2,
    startingItems: [],
    money: 0
  };
}

function syntheticBattle(): BattleData {
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    selection: {
      method: "synthetic",
      mapEnemyGroupIds: [],
      battleGroupIds: [1],
      placementCellMapping: "synthetic",
      fallbackUsed: false
    },
    statMapping: {
      level: "synthetic",
      hp: "synthetic",
      defense: "synthetic",
      offense: "synthetic",
      speed: "synthetic",
      experience: "synthetic",
      money: "synthetic",
      bossFlag: "synthetic",
      actions: "synthetic",
      itemDropped: "synthetic",
      itemRarity: "synthetic"
    },
    spriteFormat: {
      source: "synthetic",
      fileType: "png",
      indexedPaletteBits: 4,
      transparentPaletteIndex: 0,
      allowedSizes: [[32, 32]]
    },
    assetLayout: {
      spriteDir: "BattleSprites",
      backgroundDir: "BattleBGs",
      spriteFilePattern: "{id}.png",
      backgroundFilePattern: "{id}.png"
    },
    enemies: [
      battleEnemy(159, "Source A"),
      battleEnemy(160, "Source B")
    ],
    groups: [{
      id: 1,
      background1: 1,
      background2: 2,
      enemyIds: [159, 160]
    }],
    counts: {
      enemies: 2,
      groups: 1,
      spriteFiles: 0,
      backgroundFiles: 0
    },
    warnings: []
  };
}

function battleEnemy(id: number, name: string): BattleData["enemies"][number] {
  return {
    id,
    name,
    spriteId: id,
    level: 1,
    hp: 10,
    defense: 1,
    offense: 1,
    speed: 1,
    experience: 1,
    money: 1,
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

function syntheticWorldNpc(overrides: Partial<WorldChunkedNpc> = {}): WorldChunkedNpc {
  return {
    npcId: 1,
    interactable: true,
    visible: true,
    showSprite: "always",
    worldPixel: { x: 64, y: 64 },
    ...overrides
  };
}

function npcOverrides(byNpcId: NpcOverrides["byNpcId"]): NpcOverrides {
  return {
    schema: "swagbound.npc-overrides.v1",
    byNpcId
  };
}

function jsonResponse(value: unknown): Response {
  return {
    json: async () => value
  } as Response;
}

function syntheticManifest(): Manifest {
  return {
    schemaVersion: "test",
    generatedAt: "test",
    sourceProject: {
      path: "synthetic",
      exists: true,
      hasProjectSnake: false,
      detectedFolders: [],
      tutorialFixtureHints: {
        hasRobotCcs: false,
        hasHelloWorldLabel: false,
        hasRobotHelloWorldContent: false,
        hasSpriteGroup005: false,
        npcReferencesRobotHelloWorld: false
      }
    },
    files: {
      scripts: "scripts.json",
      npcs: "npcs.json",
      spriteGroups: "sprite-groups.json",
      tutorialStatus: "tutorial-status.json",
      validationReport: "validation-report.json",
      world: "world.json",
      sprites: "sprites.json",
      items: "items.json"
    },
    counts: {
      scriptFiles: 0,
      scriptCommands: 0,
      labels: 0,
      textCommands: 0,
      unknownCommands: 0,
      npcReferences: 0,
      spriteImages: 0,
      worldNpcs: 0,
      spriteSheets: 0,
      warnings: 0,
      errors: 0
    },
    warnings: [],
    errors: []
  };
}
