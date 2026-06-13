import { describe, expect, it } from "vitest";
import {
  buildDialoguePages,
  isNpcVisibleForEventFlags,
  resolveScriptReference,
  resolveScriptReferenceFlow,
  type NumericFlagState,
  type ScriptCollection,
  type ScriptCommand
} from "../src/index";

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

function runtimeCommand(file: string, cmd: "next" | "end" | "eob", line: number): ScriptCommand {
  return { cmd, raw: cmd, sourceLocation: location(file, line) };
}

function control(file: string, code: string, line: number, target?: string): ScriptCommand {
  return {
    cmd: "control",
    code,
    raw: target ? `${code}(${target})` : `${code}()`,
    sourceLocation: location(file, line),
    ...(target ? { target } : {})
  };
}

function branchControl(file: string, code: "branch_true" | "branch_false", line: number, target: string): ScriptCommand {
  return control(file, code, line, target);
}

function flagControl(file: string, code: "set" | "unset" | "isset", flag: number, line: number): ScriptCommand {
  return {
    cmd: "control",
    code,
    raw: `${code}(${flag})`,
    sourceLocation: location(file, line)
  };
}

function hasItemControl(file: string, line: number): ScriptCommand {
  return {
    cmd: "control",
    code: "hasitem",
    raw: "hasitem(255, 202)",
    sourceLocation: location(file, line)
  };
}

function resultControl(file: string, code: "result_is" | "result_not", value: number, line: number): ScriptCommand {
  return {
    cmd: "control",
    code,
    raw: `${code}(${value})`,
    sourceLocation: location(file, line)
  };
}

function inlineControl(file: string, raw: string, line: number): ScriptCommand {
  const code = raw.startsWith("if ") ? "if" : raw === "else" ? "else" : "endif";
  return { cmd: "control", code, raw, sourceLocation: location(file, line) };
}

function flagState(initial: number[] = []): NumericFlagState & { listNums(): number[] } {
  const values = new Set(initial);
  return {
    isSet: (flag) => values.has(flag),
    setNum: (flag) => values.add(flag),
    unsetNum: (flag) => values.delete(flag),
    listNums: () => [...values].sort((a, b) => a - b)
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

describe("resolveScriptReferenceFlow", () => {
  it("matches the legacy resolver for a linear block", () => {
    const file = "ccscript/alpha.ccs";
    const collection = scripts({
      [file]: [
        label(file, "start", 1),
        text(file, "First synthetic page.", 2),
        runtimeCommand(file, "next", 3),
        text(file, "Second synthetic page.", 4),
        runtimeCommand(file, "end", 5)
      ]
    });

    const legacy = resolveScriptReference(collection, "alpha.start");
    const flow = resolveScriptReferenceFlow(collection, "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(flow?.commands).toEqual(legacy?.commands);
    expect(buildDialoguePages(flow?.commands ?? [])).toEqual(buildDialoguePages(legacy?.commands ?? []));
  });

  it("follows a same-file goto", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "goto", 2, "target"),
        text(file, "Skipped synthetic text.", 3),
        runtimeCommand(file, "end", 4),
        label(file, "target", 5),
        text(file, "Reached synthetic text.", 6),
        runtimeCommand(file, "end", 7)
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Reached synthetic text."]);
  });

  it("follows a cross-file goto", () => {
    const alpha = "ccscript/alpha.ccs";
    const beta = "ccscript/beta.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [alpha]: [
        label(alpha, "start", 1),
        control(alpha, "goto", 2, "beta.target")
      ],
      [beta]: [
        label(beta, "target", 1),
        text(beta, "Cross-file synthetic text.", 2),
        runtimeCommand(beta, "end", 3)
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Cross-file synthetic text."]);
  });

  it("returns from a call and continues after the call site", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "call", 2, "helper"),
        text(file, "After synthetic call.", 3),
        runtimeCommand(file, "end", 4),
        label(file, "helper", 5),
        text(file, "Inside synthetic helper.", 6),
        runtimeCommand(file, "eob", 7)
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? [])[0]).toMatchObject({
      text: "Inside synthetic helper.\nAfter synthetic call.",
      ended: true
    });
  });

  it("does not take a jump gated by a preceding conditional control", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "result_is", 2),
        control(file, "goto", 3, "alternate"),
        text(file, "Default synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "alternate", 6),
        text(file, "Alternate synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Default synthetic path."]);
  });

  it("takes an isset-gated jump when the numeric flag is set", () => {
    const file = "ccscript/alpha.ccs";
    const flags = flagState([7]);
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 7, 2),
        control(file, "goto", 3, "alternate"),
        text(file, "Default synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "alternate", 6),
        text(file, "Alternate synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Alternate synthetic path."]);
  });

  it("falls through an isset-gated jump when the numeric flag is clear", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 7, 2),
        control(file, "goto", 3, "alternate"),
        text(file, "Default synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "alternate", 6),
        text(file, "Alternate synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Default synthetic path."]);
  });

  it("applies set and unset side effects while walking the resolved path", () => {
    const file = "ccscript/alpha.ccs";
    const flags = flagState([3]);
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "set", 2, 2),
        flagControl(file, "unset", 3, 3),
        text(file, "Synthetic side-effect path.", 4),
        runtimeCommand(file, "end", 5)
      ]
    }), "alpha.start", { flags });

    expect(flow?.truncated).toBe(false);
    expect(flags.listNums()).toEqual([2]);
  });

  it("lets a flag mutation flip a later conditional path", () => {
    const file = "ccscript/alpha.ccs";
    const flags = flagState();
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "set", 9, 2),
        flagControl(file, "isset", 9, 3),
        control(file, "goto", 4, "after_set"),
        text(file, "Default synthetic path.", 5),
        runtimeCommand(file, "end", 6),
        label(file, "after_set", 7),
        text(file, "Set synthetic path.", 8),
        runtimeCommand(file, "end", 9)
      ]
    }), "alpha.start", { flags });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Set synthetic path."]);
    expect(flags.listNums()).toEqual([9]);
  });

  it("supports result tests derived from an isset check", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 12, 2),
        resultControl(file, "result_not", 1, 3),
        control(file, "goto", 4, "clear_path"),
        text(file, "Set synthetic path.", 5),
        runtimeCommand(file, "end", 6),
        label(file, "clear_path", 7),
        text(file, "Clear synthetic path.", 8),
        runtimeCommand(file, "end", 9)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Clear synthetic path."]);
  });

  it("follows a branch-false opcode when an isset condition is false", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 7, 2),
        branchControl(file, "branch_false", 3, "else_path"),
        text(file, "Then synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "else_path", 6),
        text(file, "Else synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Else synthetic path."]);
  });

  it("falls through a branch-false opcode when an isset condition is true", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 7, 2),
        branchControl(file, "branch_false", 3, "else_path"),
        text(file, "Then synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "else_path", 6),
        text(file, "Else synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags: flagState([7]) });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Then synthetic path."]);
  });

  it("follows branch-true opcodes for result_is and result_not conditions", () => {
    const file = "ccscript/alpha.ccs";
    const resultIsFlow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 4, 2),
        resultControl(file, "result_is", 1, 3),
        branchControl(file, "branch_true", 4, "matched"),
        text(file, "Unmatched synthetic path.", 5),
        runtimeCommand(file, "end", 6),
        label(file, "matched", 7),
        text(file, "Matched synthetic path.", 8),
        runtimeCommand(file, "end", 9)
      ]
    }), "alpha.start", { flags: flagState([4]) });
    const resultNotFlow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 4, 2),
        resultControl(file, "result_not", 1, 3),
        branchControl(file, "branch_true", 4, "matched"),
        text(file, "Unmatched synthetic path.", 5),
        runtimeCommand(file, "end", 6),
        label(file, "matched", 7),
        text(file, "Matched synthetic path.", 8),
        runtimeCommand(file, "end", 9)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(resultIsFlow?.truncated).toBe(false);
    expect(resultNotFlow?.truncated).toBe(false);
    expect(buildDialoguePages(resultIsFlow?.commands ?? []).map((page) => page.text)).toEqual(["Matched synthetic path."]);
    expect(buildDialoguePages(resultNotFlow?.commands ?? []).map((page) => page.text)).toEqual(["Matched synthetic path."]);
  });

  it("treats hasitem as false for an all-clear no-inventory runtime", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        hasItemControl(file, 2),
        branchControl(file, "branch_false", 3, "no_item"),
        text(file, "Item synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "no_item", 6),
        text(file, "No item synthetic path.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["No item synthetic path."]);
  });

  it("keeps unknown result comparisons on deterministic fall-through", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        resultControl(file, "result_is", 1, 2),
        branchControl(file, "branch_false", 3, "unknown_branch"),
        text(file, "Fall-through synthetic path.", 4),
        runtimeCommand(file, "end", 5),
        label(file, "unknown_branch", 6),
        text(file, "Unknown synthetic branch.", 7),
        runtimeCommand(file, "end", 8)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Fall-through synthetic path."]);
  });

  it("collects the then block from an inline if/else", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        inlineControl(file, "if isset(2)", 2),
        text(file, "Then synthetic block.", 3),
        inlineControl(file, "else", 4),
        text(file, "Else synthetic block.", 5),
        inlineControl(file, "endif", 6),
        runtimeCommand(file, "end", 7)
      ]
    }), "alpha.start", { flags: flagState([2]) });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Then synthetic block."]);
  });

  it("collects the else block from an inline if/else", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        inlineControl(file, "if isset(2)", 2),
        text(file, "Then synthetic block.", 3),
        inlineControl(file, "else", 4),
        text(file, "Else synthetic block.", 5),
        inlineControl(file, "endif", 6),
        runtimeCommand(file, "end", 7)
      ]
    }), "alpha.start", { flags: flagState() });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Else synthetic block."]);
  });

  it("handles nested inline conditionals", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        inlineControl(file, "if isset(1)", 2),
        inlineControl(file, "if isset(2)", 3),
        text(file, "Nested then synthetic block.", 4),
        inlineControl(file, "else", 5),
        text(file, "Nested else synthetic block.", 6),
        inlineControl(file, "endif", 7),
        inlineControl(file, "else", 8),
        text(file, "Outer else synthetic block.", 9),
        inlineControl(file, "endif", 10),
        runtimeCommand(file, "end", 11)
      ]
    }), "alpha.start", { flags: flagState([1]) });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Nested else synthetic block."]);
  });

  it("applies side effects in a taken inline path before a later conditional", () => {
    const file = "ccscript/alpha.ccs";
    const flags = flagState([1]);
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        inlineControl(file, "if isset(1)", 2),
        flagControl(file, "set", 8, 3),
        inlineControl(file, "else", 4),
        flagControl(file, "unset", 8, 5),
        inlineControl(file, "endif", 6),
        flagControl(file, "isset", 8, 7),
        branchControl(file, "branch_true", 8, "after_effect"),
        text(file, "No effect synthetic path.", 9),
        runtimeCommand(file, "end", 10),
        label(file, "after_effect", 11),
        text(file, "Effect synthetic path.", 12),
        runtimeCommand(file, "end", 13)
      ]
    }), "alpha.start", { flags });

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["Effect synthetic path."]);
    expect(flags.listNums()).toEqual([1, 8]);
  });

  it("detects cycles through conditional branches", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        flagControl(file, "isset", 1, 2),
        branchControl(file, "branch_true", 3, "start"),
        runtimeCommand(file, "end", 4)
      ]
    }), "alpha.start", { flags: flagState([1]) });

    expect(flow?.truncated).toBe(true);
    expect(flow?.truncatedReason).toBe("cycle");
  });

  it("detects cycles and truncates safely", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        control(file, "goto", 2, "start")
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(true);
    expect(flow?.truncatedReason).toBe("cycle");
  });

  it("truncates safely when the command budget is reached", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        text(file, "First synthetic command.", 2),
        text(file, "Second synthetic command.", 3),
        runtimeCommand(file, "end", 4)
      ]
    }), "alpha.start", { maxCommands: 1 });

    expect(flow?.truncated).toBe(true);
    expect(flow?.truncatedReason).toBe("command_budget");
    expect(buildDialoguePages(flow?.commands ?? []).map((page) => page.text)).toEqual(["First synthetic command."]);
  });

  it("stops at a top-level terminator", () => {
    const file = "ccscript/alpha.ccs";
    const flow = resolveScriptReferenceFlow(scripts({
      [file]: [
        label(file, "start", 1),
        text(file, "Before synthetic terminator.", 2),
        runtimeCommand(file, "end", 3),
        text(file, "After synthetic terminator.", 4)
      ]
    }), "alpha.start");

    expect(flow?.truncated).toBe(false);
    expect(buildDialoguePages(flow?.commands ?? [])).toHaveLength(1);
    expect(buildDialoguePages(flow?.commands ?? [])[0]).toMatchObject({
      text: "Before synthetic terminator.",
      ended: true
    });
  });
});

describe("NPC event-flag visibility", () => {
  it("implements the three Show Sprite rules against a numeric flag state", () => {
    const clear = flagState();
    const set = flagState([5]);

    expect(isNpcVisibleForEventFlags("always", 5, clear)).toBe(true);
    expect(isNpcVisibleForEventFlags("always", 5, set)).toBe(true);
    expect(isNpcVisibleForEventFlags("when event flag unset", 5, clear)).toBe(true);
    expect(isNpcVisibleForEventFlags("when event flag unset", 5, set)).toBe(false);
    expect(isNpcVisibleForEventFlags("when event flag set", 5, clear)).toBe(false);
    expect(isNpcVisibleForEventFlags("when event flag set", 5, set)).toBe(true);
  });
});
