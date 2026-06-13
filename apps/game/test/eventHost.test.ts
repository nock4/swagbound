import { describe, expect, it, vi } from "vitest";
import {
  buildDialoguePages,
  EventExecutor,
  resolveScriptReferenceFlow,
  type DialogueSegment,
  type ScriptCollection,
  type ScriptCommand
} from "@eb/schemas";
import {
  dialoguePagesForConfirmEffects,
  RuntimeEventHost,
  RuntimeEventSequence,
  type EventWarpDestination
} from "../src/eventHost";
import { GameFlags } from "../src/gameFlags";
import { PartyState } from "../src/partyState";
import { DialogueController } from "../src/state";

function location(file: string, line: number) {
  return { file, line, column: 1 };
}

function label(file: string, name: string, line: number): ScriptCommand {
  return { cmd: "label", raw: `${name}:`, name, sourceLocation: location(file, line) };
}

function text(file: string, value: string, line: number): ScriptCommand {
  return {
    cmd: "text",
    raw: `"${value}"`,
    value,
    segments: [{ kind: "text", value }],
    sourceLocation: location(file, line)
  };
}

function runtime(file: string, cmd: "next" | "end", line: number): ScriptCommand {
  return { cmd, raw: cmd, sourceLocation: location(file, line) };
}

function effect(file: string, line: number, segment: DialogueSegment): ScriptCommand {
  return {
    cmd: "control",
    code: segment.kind,
    raw: "raw" in segment && typeof segment.raw === "string" ? segment.raw : segment.kind,
    segments: [segment],
    sourceLocation: location(file, line)
  };
}

function scripts(files: Record<string, ScriptCommand[]>): ScriptCollection {
  const scriptFiles = Object.entries(files).map(([path, commands]) => ({
    path,
    commands,
    labels: commands.filter((command) => command.cmd === "label").map((command) => command.name ?? ""),
    counts: {
      commands: commands.length,
      labels: commands.filter((command) => command.cmd === "label").length,
      textCommands: commands.filter((command) => command.cmd === "text").length,
      unknownCommands: 0
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
      unknownCommands: 0
    },
    warnings: []
  };
}

describe("RuntimeEventHost", () => {
  it("routes contiguous text effects through one DialogueController paging session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const file = "ccscript/alpha.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        text(file, "First synthetic page.", 2),
        runtime(file, "next", 3),
        text(file, "Second synthetic page.", 4),
        runtime(file, "end", 5)
      ]
    });
    const legacy = resolveScriptReferenceFlow(collection, "alpha.start");
    const executor = new EventExecutor(collection);
    const flow = executor.start("alpha.start");

    expect(dialoguePagesForConfirmEffects(flow?.effects ?? [], 0).map((page) => page.text))
      .toEqual(buildDialoguePages(legacy?.commands ?? []).map((page) => page.text));

    const dialogue = new DialogueController();
    const host = new RuntimeEventHost({
      dialogue,
      flags: new GameFlags(),
      partyState: new PartyState()
    });
    const sequence = new RuntimeEventSequence(collection, host);
    let completed = false;

    expect(sequence.start("alpha.start", { onComplete: () => { completed = true; } })).toBe(true);
    expect(dialogue.open).toBe(true);
    expect(dialogue.pages.map((page) => page.text)).toEqual(["First synthetic page.", "Second synthetic page."]);
    expect(dialogue.opens).toBe(1);

    vi.advanceTimersByTime(200);
    expect(dialogue.advance()).toBe(true);
    expect(dialogue.open).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(sequence.running).toBe(true);

    vi.advanceTimersByTime(200);
    expect(dialogue.advance()).toBe(false);
    sequence.confirm();

    expect(completed).toBe(true);
    expect(sequence.running).toBe(false);
    expect(dialogue.open).toBe(false);
    expect(dialogue.advances).toBe(2);
    expect(dialogue.closes).toBe(1);
    expect(host.debug().effectsDispatched).toBe(3);

    vi.useRealTimers();
  });

  it("applies host side effects and records stubbed calls", () => {
    const file = "ccscript/beta.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effect(file, 2, { kind: "setFlag", flag: 7, raw: "set" }),
        effect(file, 3, { kind: "give", char: 1, item: 4, raw: "give" }),
        effect(file, 4, { kind: "money", op: "give", amount: 25, raw: "money" }),
        effect(file, 5, { kind: "party", op: "add", char: 1, raw: "party" }),
        effect(file, 6, { kind: "warp", dest: 3, raw: "warp" }),
        effect(file, 7, { kind: "sound", id: 2, raw: "sound" }),
        effect(file, 8, { kind: "battle", group: 9, raw: "battle" }),
        runtime(file, "end", 9)
      ]
    });
    const flags = new GameFlags();
    const partyState = new PartyState();
    const applied: EventWarpDestination[] = [];
    const fadeCalls: string[] = [];
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags,
      partyState,
      scene: {
        cameras: {
          main: {
            fadeOut: () => fadeCalls.push("out"),
            fadeIn: () => fadeCalls.push("in")
          }
        },
        time: { delayedCall: (_delay, callback) => callback() }
      },
      resolveWarpDestination: () => ({ x: 40, y: 50, direction: "left" }),
      applyWarpDestination: (destination) => applied.push(destination),
      startBattle: () => false
    });
    const sequence = new RuntimeEventSequence(collection, host);

    expect(sequence.start("beta.start")).toBe(true);

    expect(sequence.running).toBe(false);
    expect(flags.isSet(7)).toBe(true);
    expect(partyState.inventory(1)).toEqual([4]);
    expect(partyState.wallet).toBe(25);
    expect(partyState.party()).toEqual([1]);
    expect(applied).toEqual([{ x: 40, y: 50, direction: "left" }]);
    expect(fadeCalls).toEqual(["out", "in"]);
    expect(host.debug().records).toMatchObject({
      warps: 1,
      warpNoops: 0,
      battles: 1,
      battleNoops: 1,
      audio: 1,
      lastBattleGroup: 9
    });
  });
});
