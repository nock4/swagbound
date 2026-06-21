import { afterEach, describe, expect, it, vi } from "vitest";
import type { DialoguePage, DialogueSegment } from "@eb/schemas";
import {
  createDialogueResolver,
  DefaultResolver,
  INSTANT_TEXT_SPEED_CPS,
  confirmActionForReveal,
  perPagePauseMs,
  renderPageToText,
  renderPageToTextRuns,
  renderSegmentsToText,
  renderSegmentsToTextRuns,
  revealTextRuns,
  revealState,
  type DialogueResolver
} from "../src/dialogueRenderer";
import { buildInlineDialoguePages } from "../src/loader";
import { DialogueController } from "../src/state";

const fakeResolver: DialogueResolver = {
  playerName: () => "PLAYER_TEST",
  partyCharName: (i) => `CHAR_${i}`,
  itemName: (i) => `ITEM_${i}`,
  psiName: (i) => `PSI_${i}`,
  teleportName: (i) => `TELEPORT_${i}`,
  statName: (i) => `STAT_${i}`,
  formatNumber: (n) => `NUMBER_${n}`,
  formatMoney: (n) => `MONEY_${n}`
};

function page(text: string, segments: DialogueSegment[]): DialoguePage {
  return {
    text,
    ended: false,
    unknownCommands: [],
    segments
  };
}

describe("renderSegmentsToText", () => {
  it("renders plain text verbatim", () => {
    expect(renderSegmentsToText([{ kind: "text", value: "Alpha beta." }])).toBe("Alpha beta.");
  });

  it("flattens line, newline, and clear breaks to newline characters", () => {
    expect(renderSegmentsToText([
      { kind: "text", value: "A" },
      { kind: "break", break: "line" },
      { kind: "text", value: "B" },
      { kind: "break", break: "newline" },
      { kind: "text", value: "C" },
      { kind: "break", break: "clear" },
      { kind: "text", value: "D" }
    ])).toBe("A\nB\nC\nD");
  });

  it("resolves substitutions through the injected resolver", () => {
    expect(renderSegmentsToText([
      { kind: "substitution", name: "playerName", args: [] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "partyChar", args: [2] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "item", args: [5] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "psi", args: [7] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "number", args: [42] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "money", args: [99] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "teleport", args: [3] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "stat", args: [4] }
    ], fakeResolver)).toBe("PLAYER_TEST / CHAR_2 / ITEM_5 / PSI_7 / NUMBER_42 / MONEY_99 / TELEPORT_3 / STAT_4");
  });

  it("uses neutral default placeholders for unresolved generated names", () => {
    expect(DefaultResolver.playerName()).toBe("PLAYER");
    expect(renderSegmentsToText([
      { kind: "substitution", name: "item", args: [] },
      { kind: "text", value: " / " },
      { kind: "substitution", name: "partyChar", args: [3] }
    ])).toBe("[item] / [char 3]");
  });

  it("resolves generated item and PSI names with neutral fallback", () => {
    const resolver = createDialogueResolver({
      items: {
        schemaVersion: "test",
        sourceProjectPath: "synthetic",
        derivation: { source: "synthetic", equippable: "synthetic", helpText: "synthetic" },
        items: [{
          id: 5,
          name: "[item 5 data]",
          type: 0x10,
          cost: 0,
          action: 0,
          argument: 0,
          equippable: true,
          miscFlags: []
        }],
        counts: { items: 1, equippable: 1 },
        warnings: []
      },
      psi: {
        schemaVersion: "test",
        sourceProjectPath: "synthetic",
        derivation: { source: "synthetic", names: "synthetic", learnedBy: "synthetic", usableOutsideBattle: "synthetic" },
        psi: [{
          id: 7,
          name: "[psi 7 data]",
          type: "assist",
          strength: "stage",
          usableOutsideBattle: true,
          learnedBy: [{ charId: 1, level: 3 }]
        }],
        counts: { psi: 1, learnedBy: 1 },
        warnings: []
      }
    });

    expect(resolver.itemName(5)).toBe("[item 5 data]");
    expect(resolver.itemName(6)).toBe("[item 6]");
    expect(resolver.psiName(7)).toBe("[psi 7 data]");
    expect(resolver.psiName(8)).toBe("[psi 8]");
  });

  it("omits timing, flow, style, window, and raw control segments from display text", () => {
    expect(renderSegmentsToText([
      { kind: "text", value: "A" },
      { kind: "pause", frames: 12 },
      { kind: "prompt" },
      { kind: "style", style: "color", value: "1" },
      { kind: "window", op: "switch", args: [1] },
      { kind: "control", code: "raw", raw: "[00]" },
      { kind: "text", value: "B" }
    ])).toBe("AB");
  });

  it("strips raw CCS control artifacts from display text", () => {
    const text = "In the next election, please give a speech supporting Mayor Pirkle.";
    const rawControlText = `[06 49 00 {e(l_0xc72fbe)}]@${text}`;
    expect(renderSegmentsToText([{ kind: "text", value: rawControlText }])).toBe(text);
    expect(renderSegmentsToText([{ kind: "text", value: `]@${text}` }])).toBe(text);
    expect(renderSegmentsToTextRuns([{ kind: "text", value: rawControlText }])).toEqual([
      { text, fontId: 0 }
    ]);
  });

  it("emits font-tagged runs while keeping font 0 as the default", () => {
    expect(renderSegmentsToTextRuns([
      { kind: "text", value: "A" },
      { kind: "style", style: "font", value: "saturn", args: [1] },
      { kind: "text", value: "B" },
      { kind: "style", style: "font", value: "normal", args: [0] },
      { kind: "text", value: "C" }
    ])).toEqual([
      { text: "A", fontId: 0 },
      { text: "B", fontId: 1 },
      { text: "C", fontId: 0 }
    ]);
  });

  it("preserves page.text for plain all-text pages in the run model", () => {
    const dialoguePage = page("First text command.\nSecond text command.", [
      { kind: "text", value: "First text command." },
      { kind: "text", value: "Second text command." }
    ]);

    expect(renderPageToTextRuns(dialoguePage)).toEqual([
      { text: dialoguePage.text, fontId: 0 }
    ]);
  });

  it("reveals text runs without losing their font ids", () => {
    expect(revealTextRuns([
      { text: "AB", fontId: 0 },
      { text: "CD", fontId: 1 }
    ], 3)).toEqual([
      { text: "AB", fontId: 0 },
      { text: "C", fontId: 1 }
    ]);
  });

  it("keeps a single plain-text segment identical to page.text", () => {
    const dialoguePage = page("Synthetic page text.", [{ kind: "text", value: "Synthetic page text." }]);
    expect(renderSegmentsToText(dialoguePage.segments)).toBe(dialoguePage.text);
  });

  it("keeps synthetic tutorial pages identical to their flattened text", () => {
    const tutorialPages = [
      page("Training page one.", [{ kind: "text", value: "Training page one." }]),
      page("Training page two.\nContinued.", [
        { kind: "text", value: "Training page two." },
        { kind: "break", break: "newline" },
        { kind: "text", value: "Continued." }
      ])
    ];

    expect(tutorialPages.map((dialoguePage) => renderSegmentsToText(dialoguePage.segments))).toEqual(
      tutorialPages.map((dialoguePage) => dialoguePage.text)
    );
  });

  it("keeps page.text for all-text pages that were already flattened by the page builder", () => {
    const dialoguePage = page("First text command.\nSecond text command.", [
      { kind: "text", value: "First text command." },
      { kind: "text", value: "Second text command." }
    ]);

    expect(renderPageToText(dialoguePage)).toBe(dialoguePage.text);
  });
});

describe("perPagePauseMs", () => {
  it("sums pause frames as 60 fps milliseconds", () => {
    expect(perPagePauseMs([
      { kind: "pause", frames: 3 },
      { kind: "text", value: "A" },
      { kind: "pause", frames: 6 }
    ])).toBeCloseTo(150);
  });
});

describe("revealState", () => {
  it("reveals full text immediately at instant speed", () => {
    expect(revealState("ABCDE", 0, INSTANT_TEXT_SPEED_CPS)).toEqual({
      revealedText: "ABCDE",
      revealComplete: true,
      revealedChars: 5,
      totalChars: 5
    });
    expect(revealState("ABCDE", 0, 0).revealComplete).toBe(true);
  });

  it("reveals partial text before completing at finite speed", () => {
    expect(revealState("abcdef", 500, 4)).toEqual({
      revealedText: "ab",
      revealComplete: false,
      revealedChars: 2,
      totalChars: 6
    });
    expect(revealState("abcdef", 1500, 4)).toEqual({
      revealedText: "abcdef",
      revealComplete: true,
      revealedChars: 6,
      totalChars: 6
    });
  });
});

describe("confirmActionForReveal", () => {
  it("advances only after the current reveal is complete", () => {
    expect(confirmActionForReveal(true)).toBe("advance");
    expect(confirmActionForReveal(false)).toBe("completeReveal");
  });
});

describe("DialogueController reveal-aware confirm behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function twoPages(): DialoguePage[] {
    return [
      page("Training page one.", [{ kind: "text", value: "Training page one." }]),
      page("Training page two.", [{ kind: "text", value: "Training page two." }])
    ];
  }

  it("instant speed advances one page per confirm press", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dialogue = new DialogueController({ textSpeedCps: INSTANT_TEXT_SPEED_CPS });
    dialogue.start(twoPages());

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.revealComplete).toBe(true);
    expect(dialogue.revealedText).toBe("Training page one.");

    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.advances).toBe(1);
    expect(dialogue.currentText).toBe("Training page two.");
  });

  it("finite speed uses first confirm to complete reveal, then second confirm to advance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dialogue = new DialogueController({ textSpeedCps: 2 });
    dialogue.start(twoPages());

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.revealComplete).toBe(false);
    expect(dialogue.revealedText).not.toBe(dialogue.currentText);

    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(0);
    expect(dialogue.advances).toBe(0);
    expect(dialogue.revealComplete).toBe(true);
    expect(dialogue.revealedText).toBe(dialogue.currentText);

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.advance()).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.advances).toBe(1);
  });

  it("advances and closes custom inline pages through the shared pager", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const dialogue = new DialogueController({ textSpeedCps: INSTANT_TEXT_SPEED_CPS });

    dialogue.start(buildInlineDialoguePages(["Inline page one.", "Inline page two."]));

    expect(dialogue.open).toBe(true);
    expect(dialogue.pageIndex).toBe(0);
    expect(dialogue.currentText).toBe("Inline page one.");

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.advance()).toBe(true);
    expect(dialogue.open).toBe(true);
    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.currentText).toBe("Inline page two.");

    vi.advanceTimersByTime(DialogueController.ADVANCE_COOLDOWN_MS);
    expect(dialogue.advance()).toBe(false);
    expect(dialogue.open).toBe(false);
    expect(dialogue.closes).toBe(1);
  });
});
