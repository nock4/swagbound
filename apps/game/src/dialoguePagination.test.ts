import { describe, expect, it } from "vitest";
import type { DialoguePage } from "@eb/schemas";
import { TALK_WINDOW_VISIBLE_LINES } from "./ebWindowMetrics";
import {
  estimateDialogueTextWidth,
  paginateDialoguePage,
  wrapDialogueText
} from "./dialoguePagination";

function page(text: string): DialoguePage {
  return {
    text,
    ended: true,
    unknownCommands: [],
    segments: [{ kind: "text", value: text }]
  };
}

describe("dialogue pagination", () => {
  it("keeps every plain-text page within the three-line talk window", () => {
    const source = page(
      "On the east edge of Postwick, Remilia's registry is copying signatures into derivatives. Find the clerk who still remembers which names were real."
    );
    const pages = paginateDialoguePage(source);

    expect(pages.length).toBeGreaterThan(1);
    for (const result of pages) {
      expect(result.text.split("\n").length).toBeLessThanOrEqual(TALK_WINDOW_VISIBLE_LINES);
      expect(wrapDialogueText(result.text).length).toBeLessThanOrEqual(TALK_WINDOW_VISIBLE_LINES);
    }
    expect(pages.at(-1)?.ended).toBe(true);
    expect(pages.slice(0, -1).every((result) => !result.ended)).toBe(true);
  });

  it("leaves short pages unchanged", () => {
    const source = page("Bosch, check the mailbox.");
    expect(paginateDialoguePage(source)).toEqual([source]);
  });

  it("pins inferred lines so Phaser cannot reflow a three-line page to four", () => {
    const [result] = paginateDialoguePage(page(
      "A food becomes a movement the second enough mouths agree they found it first."
    ));
    expect(result?.text.split("\n")).toHaveLength(TALK_WINDOW_VISIBLE_LINES);
  });

  it("does not split pages with runtime substitutions or controls", () => {
    const source: DialoguePage = {
      text: "A deliberately long page whose runtime substitution must stay attached to its original command sequence and cannot be rewritten as plain text.",
      ended: true,
      unknownCommands: [],
      segments: [{ kind: "substitution", name: "playerName", args: [] }]
    };
    expect(paginateDialoguePage(source)).toEqual([source]);
  });

  it("breaks a word wider than the window instead of overflowing", () => {
    const lines = wrapDialogueText("W".repeat(100));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => estimateDialogueTextWidth(line) < 254)).toBe(true);
  });
});
