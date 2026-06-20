import { describe, expect, it } from "vitest";
import {
  EventExecutor,
  resolveScriptEvents,
  type DialogueSegment,
  type EventEffect,
  type EventExecutorHost,
  type ScriptCollection,
  type ScriptCommand
} from "../src/index";

function location(file: string, line: number) {
  return { file, line, column: 1 };
}

function label(file: string, name: string, line: number): ScriptCommand {
  return { cmd: "label", raw: `${name}:`, name, sourceLocation: location(file, line) };
}

function text(file: string, value: string, line: number, segments?: DialogueSegment[]): ScriptCommand {
  return {
    cmd: "text",
    raw: `"${value}"`,
    value,
    segments: segments ?? [{ kind: "text", value }],
    sourceLocation: location(file, line)
  };
}

function runtime(file: string, cmd: "next" | "end" | "eob", line: number): ScriptCommand {
  return { cmd, raw: cmd, sourceLocation: location(file, line) };
}

function control(file: string, code: string, raw: string, line: number, target?: string): ScriptCommand {
  return {
    cmd: "control",
    code,
    raw,
    sourceLocation: location(file, line),
    ...(target ? { target } : {})
  };
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

function textPayloads(effects: readonly EventEffect[]): string[] {
  return effects
    .filter((effect): effect is Extract<EventEffect, { kind: "text" }> => effect.kind === "text")
    .map((effect) => effect.segments
      .filter((segment): segment is Extract<DialogueSegment, { kind: "text" }> => segment.kind === "text")
      .map((segment) => segment.value)
      .join(""));
}

describe("EventExecutor", () => {
  it("resolves a set-flag side effect before a later branch without early host dispatch", () => {
    const file = "ccscript/alpha.ccs";
    const dispatchLog: string[] = [];
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "set", "set(7)", 2),
        control(file, "isset", "isset(7)", 3),
        control(file, "branch_true", "branch_true(done)", 4, "done"),
        text(file, "Synthetic clear path.", 5),
        runtime(file, "end", 6),
        label(file, "done", 7),
        text(file, "Synthetic set path.", 8),
        runtime(file, "end", 9)
      ]
    });
    const host: EventExecutorHost = {
      isSet: () => false,
      setFlag: (flag) => dispatchLog.push(`set:${flag}`)
    };

    const resolved = resolveScriptEvents(collection, "alpha.start", host);

    expect(dispatchLog).toEqual([]);
    expect(resolved?.effects.map((effect) => effect.kind)).toEqual(["setFlag", "text", "terminator"]);
    expect(textPayloads(resolved?.effects ?? [])).toEqual(["Synthetic set path."]);

    const executor = new EventExecutor(collection, host);
    executor.start("alpha.start");
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "setFlag", flag: 7 } });
    expect(dispatchLog).toEqual(["set:7"]);
  });

  it("dispatches pause, text, inventory, music, and warp effects in order with waits", () => {
    const file = "ccscript/alpha.ccs";
    const log: string[] = [];
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        text(file, "Synthetic delayed text.", 2, [
          { kind: "pause", frames: 4 },
          { kind: "text", value: "Synthetic delayed text." }
        ]),
        effectCommand(file, 3, "give", { kind: "give", char: 1, item: 9, raw: "give(1,9)" }),
        effectCommand(file, 4, "music", { kind: "music", op: "play", track: 3, raw: "music(3)" }),
        effectCommand(file, 5, "warp", { kind: "warp", dest: 2, raw: "warp(2)" }),
        runtime(file, "end", 6)
      ]
    });
    const host: EventExecutorHost = {
      showText: () => log.push("text"),
      wait: (wait) => log.push(`wait:${wait.kind}`),
      give: (char, item) => log.push(`give:${char}:${item}`),
      music: (effect) => log.push(`music:${effect.op === "play" ? effect.track : effect.op}`),
      warp: (dest) => log.push(`warp:${dest}`),
      terminator: (code) => log.push(`terminator:${code}`)
    };
    const executor = new EventExecutor(collection, host);
    executor.start("alpha.start");

    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "pause", frames: 4 } });
    expect(executor.advance()).toMatchObject({ done: false, wait: { kind: "pause", remainingFrames: 4 } });
    expect(executor.advance({ frames: 4 })).toMatchObject({ done: false, effect: { kind: "text" } });
    expect(executor.advance()).toMatchObject({ done: false, wait: { kind: "confirm" } });
    expect(log).not.toContain("give:1:9");
    expect(executor.advance({ confirm: true })).toMatchObject({ done: false, effect: { kind: "give" } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "music" } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "warp" } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "terminator" } });
    expect(executor.advance()).toMatchObject({ done: true, truncated: false });

    expect(log).toEqual([
      "wait:pause",
      "text",
      "wait:confirm",
      "give:1:9",
      "music:3",
      "warp:2",
      "terminator:end"
    ]);
  });

  it("waits for actorMove until the scene reports arrival", () => {
    const file = "ccscript/alpha.ccs";
    const log: string[] = [];
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effectCommand(file, 2, "actorMove", {
          kind: "actorMove",
          actor: { npcId: 744 },
          to: { x: 120, y: 160 }
        }),
        effectCommand(file, 3, "set", { kind: "setFlag", flag: 9, raw: "set(9)" }),
        runtime(file, "end", 4)
      ]
    });
    const host: EventExecutorHost = {
      actorMove: (effect) => log.push(`actorMove:${JSON.stringify(effect.actor)}:${effect.to.x},${effect.to.y}`),
      setFlag: (flag) => log.push(`set:${flag}`)
    };
    const executor = new EventExecutor(collection, host);
    executor.start("alpha.start");

    expect(executor.advance()).toMatchObject({
      done: false,
      effect: { kind: "actorMove", actor: { npcId: 744 }, to: { x: 120, y: 160 } },
      wait: { kind: "actorMove" }
    });
    expect(log).toEqual(["actorMove:{\"npcId\":744}:120,160"]);
    expect(executor.advance()).toMatchObject({ done: false, wait: { kind: "actorMove" } });
    expect(executor.advance({ frames: 300 })).toMatchObject({ done: false, wait: { kind: "actorMove" } });
    expect(log).not.toContain("set:9");
    expect(executor.advance({ actorMoveComplete: true })).toMatchObject({ done: false, effect: { kind: "setFlag", flag: 9 } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "terminator" } });
    expect(executor.advance()).toMatchObject({ done: true, truncated: false });
    expect(log).toContain("set:9");
  });

  it("changes the effect sequence for conditional paths", () => {
    const file = "ccscript/alpha.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "isset", "isset(4)", 2),
        control(file, "branch_false", "branch_false(clear)", 3, "clear"),
        text(file, "Synthetic set branch.", 4),
        runtime(file, "end", 5),
        label(file, "clear", 6),
        text(file, "Synthetic clear branch.", 7),
        runtime(file, "end", 8)
      ]
    });

    const setPath = resolveScriptEvents(collection, "alpha.start", { isSet: () => true });
    const clearPath = resolveScriptEvents(collection, "alpha.start", { isSet: () => false });

    expect(textPayloads(setPath?.effects ?? [])).toEqual(["Synthetic set branch."]);
    expect(textPayloads(clearPath?.effects ?? [])).toEqual(["Synthetic clear branch."]);
  });

  it("dispatches battle with the resolved group id", () => {
    const file = "ccscript/alpha.ccs";
    const groups: number[] = [];
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effectCommand(file, 2, "battle", { kind: "battle", group: 0x1234, raw: "battle(0x1234)" }),
        runtime(file, "end", 3)
      ]
    });
    const executor = new EventExecutor(collection, { startBattle: (group) => groups.push(group) });
    executor.start("alpha.start");

    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "battle", group: 0x1234 } });
    expect(groups).toEqual([0x1234]);
  });

  it("dispatches ATM and shop effects with numeric arguments", () => {
    const file = "ccscript/alpha.ccs";
    const log: string[] = [];
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        effectCommand(file, 2, "atm", { kind: "atm", op: "deposit", amount: 50, raw: "deposit(50)" }),
        effectCommand(file, 3, "atm", { kind: "atm", op: "withdraw", amount: 10, raw: "withdraw(10)" }),
        effectCommand(file, 4, "shop", { kind: "shop", storeId: 2, raw: "shop(2)" }),
        runtime(file, "end", 5)
      ]
    });
    const executor = new EventExecutor(collection, {
      atm: (op, amount) => log.push(`atm:${op}:${amount}`),
      openShop: (storeId) => log.push(`shop:${storeId}`)
    });
    executor.start("alpha.start");

    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "atm", op: "deposit", amount: 50 } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "atm", op: "withdraw", amount: 10 } });
    expect(executor.advance()).toMatchObject({ done: false, effect: { kind: "shop", storeId: 2 } });
    expect(log).toEqual(["atm:deposit:50", "atm:withdraw:10", "shop:2"]);
  });

  it("keeps cycle and command-budget guards on event resolution", () => {
    const cycleFile = "ccscript/cycle.ccs";
    const cycle = new EventExecutor(scripts({
      [cycleFile]: [
        label(cycleFile, "start", 1),
        control(cycleFile, "goto", "goto(start)", 2, "start")
      ]
    }));
    const cycleStart = cycle.start("cycle.start");

    expect(cycleStart?.truncated).toBe(true);
    expect(cycleStart?.truncatedReason).toBe("cycle");
    expect(cycle.advance()).toMatchObject({ done: true, truncated: true, truncatedReason: "cycle" });

    const budgetFile = "ccscript/budget.ccs";
    const budget = new EventExecutor(scripts({
      [budgetFile]: [
        label(budgetFile, "start", 1),
        text(budgetFile, "Synthetic first command.", 2),
        text(budgetFile, "Synthetic second command.", 3),
        runtime(budgetFile, "end", 4)
      ]
    }), {}, { maxCommands: 1 });
    const budgetStart = budget.start("budget.start");

    expect(budgetStart?.truncated).toBe(true);
    expect(budgetStart?.truncatedReason).toBe("command_budget");
    expect(textPayloads(budgetStart?.effects ?? [])).toEqual(["Synthetic first command."]);
  });
});
