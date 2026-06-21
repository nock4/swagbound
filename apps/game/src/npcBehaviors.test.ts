import { describe, expect, it } from "vitest";
import type {
  DialogueSegment,
  ScriptCollection,
  ScriptCommand
} from "@eb/schemas";
import type { GameEvent } from "./eventRunner";
import {
  behaviorForNpc,
  HEURISTIC_WANDER_RADIUS_PX,
  HEURISTIC_WANDER_SPEED_PX_PER_SEC,
  interactionEventsHaveServiceEffect
} from "./npcBehaviors";

describe("behaviorForNpc service static overrides", () => {
  it("keeps shop/service NPCs static when their interaction resolves to a service effect", () => {
    const hasServiceInteraction = interactionEventsHaveServiceEffect([
      { kind: "shop", storeId: 4 }
    ]);

    expect(behaviorForNpc(5000, 1, { hasServiceInteraction })).toEqual({ kind: "static" });
  });

  it("keeps scripted shop NPCs static when their dialogue reference resolves to a shop effect", () => {
    const collection = scripts({
      "ccscript/shopkeeper.ccs": [
        label("ccscript/shopkeeper.ccs", "start", 1),
        effectCommand("ccscript/shopkeeper.ccs", 2, "shop", { kind: "shop", storeId: 7, raw: "shop(7)" }),
        runtime("ccscript/shopkeeper.ccs", "end", 3)
      ]
    });
    const events: GameEvent[] = [{ kind: "dialogue", reference: "shopkeeper.start" }];
    const hasServiceInteraction = interactionEventsHaveServiceEffect(events, collection);

    expect(hasServiceInteraction).toBe(true);
    expect(behaviorForNpc(5001, 1, { hasServiceInteraction })).toEqual({ kind: "static" });
  });

  it("keeps interior-home NPCs static as a fallback while overworld wanderers still wander", () => {
    expect(behaviorForNpc(5002, 1, { isInteriorHome: true })).toEqual({ kind: "static" });

    expect(behaviorForNpc(5003, 1, { isInteriorHome: false })).toMatchObject({
      kind: "wander",
      radiusPx: HEURISTIC_WANDER_RADIUS_PX,
      speedPxPerSec: HEURISTIC_WANDER_SPEED_PX_PER_SEC
    });
  });
});

function location(file: string, line: number) {
  return { file, line, column: 1 };
}

function label(file: string, name: string, line: number): ScriptCommand {
  return { cmd: "label", raw: `${name}:`, name, sourceLocation: location(file, line) };
}

function effectCommand(file: string, line: number, code: string, effect: DialogueSegment): ScriptCommand {
  return {
    cmd: "control",
    code,
    raw: "raw" in effect && typeof effect.raw === "string" ? effect.raw : code,
    segments: [effect],
    sourceLocation: location(file, line)
  };
}

function runtime(file: string, cmd: "end" | "eob" | "next", line: number): ScriptCommand {
  return { cmd, raw: cmd, sourceLocation: location(file, line) };
}

function scripts(files: Record<string, ScriptCommand[]>): ScriptCollection {
  const scriptFiles = Object.entries(files).map(([path, commands]) => ({
    path,
    commands,
    labels: commands
      .filter((command) => command.cmd === "label")
      .map((command) => command.name ?? ""),
    counts: {
      commands: commands.length,
      labels: commands.filter((command) => command.cmd === "label").length,
      textCommands: commands.filter((command) => command.cmd === "text").length,
      unknownCommands: commands.filter((command) => command.cmd === "unknown").length
    },
    warnings: []
  }));

  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: scriptFiles,
    counts: {
      files: scriptFiles.length,
      commands: scriptFiles.reduce((total, file) => total + file.counts.commands, 0),
      labels: scriptFiles.reduce((total, file) => total + file.counts.labels, 0),
      textCommands: scriptFiles.reduce((total, file) => total + file.counts.textCommands, 0),
      unknownCommands: scriptFiles.reduce((total, file) => total + file.counts.unknownCommands, 0)
    },
    warnings: []
  };
}
