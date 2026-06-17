import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemCollection, Manifest, ScriptCollection, ScriptCommand } from "@eb/schemas";
import { buildDialogueForReference, loadGameData } from "../src/loader";

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

describe("loadGameData", () => {
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
});

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
