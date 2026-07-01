import { describe, expect, it } from "vitest";
import type { OverworldInteractable } from "@eb/schemas";
import {
  overworldInteractableEvents,
  overworldInteractableIsOpened,
  overworldPresentOpenedFlag
} from "../src/overworldInteractables";

describe("overworldInteractableEvents", () => {
  it("plays confirm and read cues for signs", () => {
    const sign: OverworldInteractable = {
      id: "notice",
      kind: "sign",
      worldPixel: { x: 10, y: 20 },
      pages: ["Posted."]
    };

    expect(overworldInteractableEvents(sign, { has: () => false })).toEqual({
      events: [{ kind: "dialogue", pages: ["Posted."] }],
      sfxBeforeEvents: ["talkConfirm", "readCue"],
      opened: false
    });
  });

  it("opens presents once, grants the item, and sets the opened flag", () => {
    const present: OverworldInteractable = {
      id: "gift",
      kind: "present",
      worldPixel: { x: 10, y: 20 },
      item: { char: 1, item: 88 }
    };
    const flag = overworldPresentOpenedFlag(present);

    const first = overworldInteractableEvents(present, { has: () => false }, {
      itemName: (id) => id === 88 ? "Pocket Snack" : undefined
    });
    expect(first).toEqual({
      events: [
        { kind: "dialogue", pages: ["Bosch opened the present.", "Inside was a Pocket Snack!", "You got the Pocket Snack!"] },
        { kind: "give", char: 1, item: 88 },
        { kind: "setFlag", flag }
      ],
      sfxBeforeEvents: ["presentOpen"],
      opened: false
    });

    const repeat = overworldInteractableEvents(present, { has: (value) => value === flag });
    expect(repeat).toEqual({
      events: [{ kind: "dialogue", pages: ["The present is empty."] }],
      sfxBeforeEvents: [],
      opened: true
    });
    expect(overworldInteractableIsOpened(present, { has: (value) => value === flag })).toBe(true);
  });

  it("uses the read cue for examine hotspots", () => {
    const examine: OverworldInteractable = {
      id: "flier",
      kind: "examine",
      worldPixel: { x: 10, y: 20 },
      pages: ["A flier."]
    };

    expect(overworldInteractableEvents(examine, { has: () => false })).toEqual({
      events: [{ kind: "dialogue", pages: ["A flier."] }],
      sfxBeforeEvents: ["readCue"],
      opened: false
    });
  });
});
