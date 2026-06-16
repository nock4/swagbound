import { describe, expect, it } from "vitest";
import type {
  CustomDialogue,
  ScriptCollection,
  ScriptCommand,
  SwagboundDialogueLibrary
} from "@eb/schemas";
import {
  resolveScriptedDialoguePages,
  startScriptedBeatDialogue
} from "./scriptedDialogueResolver";

describe("resolveScriptedDialoguePages", () => {
  it("uses inline byTextPointer override pages before EB script text", () => {
    const pages = resolveScriptedDialoguePages(
      customDialogue({ "data_15.l_0xc5eb0b": { pages: ["Bosch Terminal.", "Override page two."] } }),
      emptyDialogueLibrary(),
      syntheticScripts("data_15.l_0xc5eb0b", "EarthBound fallback."),
      "data_15.l_0xc5eb0b"
    );

    expect(pages.map((page) => page.text)).toEqual(["Bosch Terminal.", "Override page two."]);
  });

  it("resolves byTextPointer library refs through the dialogue library", () => {
    const pages = resolveScriptedDialoguePages(
      customDialogue({ "data_20.l_0xc65efc": { ref: "public-version-clique" } }),
      dialogueLibrary({ "public-version-clique": ["Public Version Clique."] }),
      syntheticScripts("data_20.l_0xc65efc", "Frank fallback."),
      "data_20.l_0xc65efc"
    );

    expect(pages.map((page) => page.text)).toEqual(["Public Version Clique."]);
  });

  it("falls back to EB script text when the ref has no byTextPointer override", () => {
    const pages = resolveScriptedDialoguePages(
      emptyCustomDialogue(),
      emptyDialogueLibrary(),
      syntheticScripts("data_20.l_0xc66b97", "Someone's knocking."),
      "data_20.l_0xc66b97"
    );

    expect(pages.map((page) => page.text)).toEqual(["Someone's knocking."]);
  });
});

describe("startScriptedBeatDialogue", () => {
  it("starts override pages and preserves the beat completion handoff", () => {
    let capturedComplete: (() => void) | undefined;
    let eventSequenceStarted = false;
    let introFlagSet = false;
    let battleStarted = false;

    const result = startScriptedBeatDialogue({
      reference: "data_15.l_0xc5eb0b",
      customDialogue: customDialogue({ "data_15.l_0xc5eb0b": { pages: ["Bosch Terminal."] } }),
      dialogueLibrary: emptyDialogueLibrary(),
      onComplete: () => {
        introFlagSet = true;
        battleStarted = true;
      },
      startOverrideDialogue: (pages, onComplete) => {
        expect(pages.map((page) => page.text)).toEqual(["Bosch Terminal."]);
        capturedComplete = onComplete;
      },
      startEventSequence: () => {
        eventSequenceStarted = true;
        return true;
      }
    });

    expect(result).toBe("override");
    expect(eventSequenceStarted).toBe(false);

    capturedComplete?.();

    expect(introFlagSet).toBe(true);
    expect(battleStarted).toBe(true);
  });

  it("leaves non-overridden refs on the event sequence path", () => {
    const result = startScriptedBeatDialogue({
      reference: "data_20.l_0xc65efc",
      customDialogue: emptyCustomDialogue(),
      dialogueLibrary: emptyDialogueLibrary(),
      onComplete: () => undefined,
      startOverrideDialogue: () => {
        throw new Error("unexpected override branch");
      },
      startEventSequence: (reference, onComplete) => {
        expect(reference).toBe("data_20.l_0xc65efc");
        onComplete();
        return true;
      }
    });

    expect(result).toBe("eventSequence");
  });
});

function emptyCustomDialogue(): CustomDialogue {
  return customDialogue({});
}

function customDialogue(byTextPointer: CustomDialogue["byTextPointer"]): CustomDialogue {
  return {
    schema: "swagbound.custom-dialogue.v1",
    byNpcId: {},
    byTextPointer
  };
}

function emptyDialogueLibrary(): SwagboundDialogueLibrary {
  return dialogueLibrary({});
}

function dialogueLibrary(entries: Record<string, string[]>): SwagboundDialogueLibrary {
  return {
    schema: "swagbound.dialogue-library.v1",
    generatedFrom: "synthetic test fixture",
    entries: Object.fromEntries(
      Object.entries(entries).map(([key, pages]) => [key, { speaker: "Synthetic", pages }])
    )
  };
}

function syntheticScripts(reference: string, text: string): ScriptCollection {
  const [fileStem, labelName] = reference.split(".");
  const path = `${fileStem}.ccs`;
  const commands: ScriptCommand[] = [
    { cmd: "label", raw: `${labelName}:`, name: labelName, sourceLocation: { file: path, line: 1, column: 1 } },
    {
      cmd: "text",
      raw: `"${text}"`,
      value: text,
      segments: [{ kind: "text", value: text }],
      sourceLocation: { file: path, line: 2, column: 1 }
    },
    { cmd: "end", raw: "end", sourceLocation: { file: path, line: 3, column: 1 } }
  ];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path,
      commands,
      labels: [labelName],
      counts: { commands: commands.length, labels: 1, textCommands: 1, unknownCommands: 0 },
      warnings: []
    }],
    counts: { files: 1, commands: commands.length, labels: 1, textCommands: 1, unknownCommands: 0 },
    warnings: []
  };
}
