import { describe, expect, it, vi } from "vitest";
import {
  buildDialoguePages,
  EventExecutor,
  resolveScriptReferenceFlow,
  type DialogueSegment,
  type ScriptCollection,
  type ScriptCommand,
  type TeleportDestinations
} from "@eb/schemas";
import {
  dialoguePagesForConfirmEffects,
  resolveTeleportDestination,
  RuntimeEventHost,
  RuntimeEventSequence,
  teleportDirectionToFacing,
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

function unknown(file: string, raw: string, line: number): ScriptCommand {
  return { cmd: "unknown", raw, sourceLocation: location(file, line) };
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

function teleportDestinations(): TeleportDestinations {
  return {
    schemaVersion: "test",
    units: { x: "world-pixels", y: "world-pixels" },
    destinations: [
      { id: 0, x: 0, y: 0, direction: 0, warpStyle: 0 },
      { id: 2, x: 320, y: 448, direction: 3, warpStyle: 7 },
      { id: 5, x: 640, y: 768, direction: 7, warpStyle: 1 }
    ],
    counts: { destinations: 3 }
  };
}

describe("teleport destination resolver", () => {
  it("maps CoilSnake direction ids to cardinal facings", () => {
    expect(teleportDirectionToFacing(1)).toBe("up");
    expect(teleportDirectionToFacing(3)).toBe("right");
    expect(teleportDirectionToFacing(5)).toBe("down");
    expect(teleportDirectionToFacing(7)).toBe("left");
    expect(teleportDirectionToFacing(0)).toBeUndefined();
  });

  it("resolves an index to world pixels, facing, and warp style", () => {
    expect(resolveTeleportDestination(teleportDestinations(), 2)).toMatchObject({
      x: 320,
      y: 448,
      worldPixel: { x: 320, y: 448 },
      direction: "right",
      facing: "right",
      warpStyle: 7,
      transition: "instant"
    });

    expect(resolveTeleportDestination(teleportDestinations(), 5, 4)).toMatchObject({
      x: 640,
      y: 768,
      worldPixel: { x: 640, y: 768 },
      direction: "left",
      facing: "left",
      warpStyle: 4,
      transition: "fade"
    });
  });

  it("returns undefined for absent destination ids", () => {
    expect(resolveTeleportDestination(teleportDestinations(), 99)).toBeUndefined();
  });
});

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
        effect(file, 5, { kind: "atm", op: "deposit", amount: 10, raw: "deposit" }),
        effect(file, 6, { kind: "atm", op: "withdraw", amount: 4, raw: "withdraw" }),
        effect(file, 7, { kind: "party", op: "add", char: 1, raw: "party" }),
        effect(file, 8, { kind: "warp", dest: 3, raw: "warp" }),
        effect(file, 9, { kind: "sound", id: 2, raw: "sound" }),
        effect(file, 10, { kind: "battle", group: 9, raw: "battle" }),
        effect(file, 11, { kind: "shop", storeId: 2, raw: "shop" }),
        runtime(file, "end", 12)
      ]
    });
    const flags = new GameFlags();
    const partyState = new PartyState();
    const applied: EventWarpDestination[] = [];
    const fadeCalls: string[] = [];
    const shops: number[] = [];
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
      applyWarpDestination: (destination) => {
        applied.push(destination);
      },
      startBattle: () => false,
      openShop: (storeId) => {
        shops.push(storeId);
      }
    });
    const sequence = new RuntimeEventSequence(collection, host);

    expect(sequence.start("beta.start")).toBe(true);

    expect(sequence.running).toBe(false);
    expect(flags.isSet(7)).toBe(true);
    expect(partyState.inventory(1)).toEqual([4]);
    expect(partyState.wallet).toBe(19);
    expect(partyState.bank).toBe(6);
    expect(partyState.party()).toEqual([1]);
    expect(applied).toEqual([{ x: 40, y: 50, direction: "left" }]);
    expect(fadeCalls).toEqual([]);
    expect(shops).toEqual([2]);
    expect(host.debug().records).toMatchObject({
      warps: 1,
      warpNoops: 0,
      battles: 1,
      battleNoops: 1,
      shops: 1,
      lastShopStoreId: 2,
      audio: 1,
      lastBattleGroup: 9
    });
  });

  it("records missing warp destinations as no-ops", () => {
    const file = "ccscript/missing.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effect(file, 2, { kind: "warp", dest: 99, raw: "warp" }),
        runtime(file, "end", 3)
      ]
    });
    const applied: EventWarpDestination[] = [];
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags: new GameFlags(),
      partyState: new PartyState(),
      resolveWarpDestination: (dest, style) => resolveTeleportDestination(teleportDestinations(), dest, style),
      applyWarpDestination: (destination) => {
        applied.push(destination);
      }
    });
    const sequence = new RuntimeEventSequence(collection, host);

    expect(sequence.start("missing.start")).toBe(true);

    expect(applied).toEqual([]);
    expect(host.debug().records).toMatchObject({
      warps: 1,
      warpNoops: 1,
      lastWarpDest: 99
    });
  });

  it("aborts the sequence when the host rejects a warp destination", () => {
    const file = "ccscript/rejected-warp.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effect(file, 2, { kind: "setFlag", flag: 7, raw: "set" }),
        effect(file, 3, { kind: "warp", dest: 2, raw: "warp" }),
        effect(file, 4, { kind: "setFlag", flag: 8, raw: "set" }),
        runtime(file, "end", 5)
      ]
    });
    const flags = new GameFlags();
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags,
      partyState: new PartyState(),
      resolveWarpDestination: (dest, style) => resolveTeleportDestination(teleportDestinations(), dest, style),
      applyWarpDestination: () => false
    });
    const sequence = new RuntimeEventSequence(collection, host);

    expect(sequence.start("rejected-warp.start")).toBe(true);

    expect(sequence.running).toBe(false);
    expect(host.debug().result).toMatchObject({
      status: "aborted",
      reason: "host_abort_requested"
    });
    expect(flags.isSet(7)).toBe(true);
    expect(flags.isSet(8)).toBe(false);
    expect(host.debug().records).toMatchObject({
      warps: 1,
      warpNoops: 0,
      lastWarpDest: 2
    });
  });

  it("fades teleport styles while applying the resolved destination", () => {
    const file = "ccscript/teleport.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effect(file, 2, { kind: "teleport", dest: 5, style: 4, raw: "teleport" }),
        runtime(file, "end", 3)
      ]
    });
    const applied: EventWarpDestination[] = [];
    const fadeCalls: string[] = [];
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags: new GameFlags(),
      partyState: new PartyState(),
      scene: {
        cameras: {
          main: {
            fadeOut: () => fadeCalls.push("out"),
            fadeIn: () => fadeCalls.push("in")
          }
        },
        time: { delayedCall: (_delay, callback) => callback() }
      },
      resolveWarpDestination: (dest, style) => resolveTeleportDestination(teleportDestinations(), dest, style),
      applyWarpDestination: (destination) => {
        applied.push(destination);
      }
    });
    const sequence = new RuntimeEventSequence(collection, host);

    expect(sequence.start("teleport.start")).toBe(true);

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      worldPixel: { x: 640, y: 768 },
      facing: "left",
      warpStyle: 4,
      transition: "fade"
    });
    expect(fadeCalls).toEqual(["out", "in"]);
    expect(host.debug().records).toMatchObject({
      warps: 1,
      warpNoops: 0,
      lastWarpDest: 5,
      lastTeleportStyle: 4
    });
  });

  it("treats unknown event controls as safe no-ops and ends controllable", () => {
    const file = "ccscript/unknown.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        unknown(file, "synthetic_unknown()", 2),
        runtime(file, "end", 3)
      ]
    });
    const dialogue = new DialogueController();
    const host = new RuntimeEventHost({
      dialogue,
      flags: new GameFlags(),
      partyState: new PartyState()
    });
    const sequence = new RuntimeEventSequence(collection, host);
    let inputLocked = true;

    expect(sequence.start("unknown.start", {
      onComplete: () => {
        inputLocked = false;
      }
    })).toBe(true);

    expect(sequence.running).toBe(false);
    expect(dialogue.open).toBe(false);
    expect(inputLocked).toBe(false);
    expect(host.debug().effectsByKind.control).toBe(1);
    expect(host.debug().result).toMatchObject({
      status: "completed",
      truncated: false
    });
  });
});
