import { describe, expect, it } from "vitest";
import {
  applyFilingEdit,
  FILING_GRID_ITEMS,
  moveFilingGridCursor,
  sanitizeFilingValue,
  validateFilingIntake
} from "./filingIntakeModel";
import { deserializeSaveState, serializeSaveState } from "./saveState";

describe("filing intake grid cursor", () => {
  it("wraps inside the letter grid by row and column", () => {
    expect(moveFilingGridCursor(0, "right")).toBe(1);
    expect(moveFilingGridCursor(5, "right")).toBe(0);
    expect(moveFilingGridCursor(0, "left")).toBe(5);
    expect(moveFilingGridCursor(0, "up")).toBe(24);
    expect(moveFilingGridCursor(28, "down")).toBe(4);
  });
});

describe("filing intake value edits", () => {
  const defaults = ["BOSCH", "LEDGER", "KIOSK"];

  it("adds letters, spaces, and backspaces with the configured limit", () => {
    const a = FILING_GRID_ITEMS[0];
    const space = FILING_GRID_ITEMS.find((item) => item.kind === "space");
    const back = FILING_GRID_ITEMS.find((item) => item.kind === "backspace");
    expect(a?.kind).toBe("character");
    expect(space?.kind).toBe("space");
    expect(back?.kind).toBe("backspace");

    expect(applyFilingEdit("", a!, { defaults, defaultIndex: 0, maxLength: 2 }).value).toBe("A");
    expect(applyFilingEdit("A", space!, { defaults, defaultIndex: 0, maxLength: 2 }).value).toBe("A ");
    expect(applyFilingEdit("AB", a!, { defaults, defaultIndex: 0, maxLength: 2 }).value).toBe("AB");
    expect(applyFilingEdit("AB", back!, { defaults, defaultIndex: 0, maxLength: 2 }).value).toBe("A");
  });

  it("cycles don't care defaults and accepts a non-empty value", () => {
    const dontCare = FILING_GRID_ITEMS.find((item) => item.kind === "dontCare");
    const ok = FILING_GRID_ITEMS.find((item) => item.kind === "ok");
    expect(dontCare?.kind).toBe("dontCare");
    expect(ok?.kind).toBe("ok");

    const cycled = applyFilingEdit("BOSCH", dontCare!, { defaults, defaultIndex: 0, maxLength: 10 });
    expect(cycled).toEqual({ value: "LEDGER", defaultIndex: 1, complete: false });
    expect(applyFilingEdit("", ok!, { defaults, defaultIndex: 1, maxLength: 10 })).toEqual({
      value: "BOSCH",
      defaultIndex: 1,
      complete: true
    });
  });
});

describe("filing intake sanitization", () => {
  it("keeps saved intake values uppercase, compact, and retrievable", () => {
    expect(sanitizeFilingValue(" bosch!!  jr ", "BOSCH", 10)).toBe("BOSCH JR");
    expect(validateFilingIntake({
      name: "bosch",
      interest: "music!!",
      friend: "cloak?"
    })).toEqual({
      name: "BOSCH",
      interest: "MUSIC",
      friend: "CLOAK"
    });
  });
});

describe("filing intake save payload", () => {
  it("survives save serialization", () => {
    const blob = serializeSaveState({
      schemaVersion: 1,
      savedAt: "2026-07-07T00:00:00.000Z",
      intake: { name: "BOSCH", interest: "MUSIC", friend: "CLOAK" },
      flags: { strings: [], numeric: [] },
      party: { wallet: 0, partyIds: [], inventory: [], equipped: [] },
      player: { mode: "chunked", mapId: "full", x: 1, y: 2, facing: "down" }
    });
    expect(blob).not.toBeNull();
    expect(deserializeSaveState(blob)?.intake).toEqual({
      name: "BOSCH",
      interest: "MUSIC",
      friend: "CLOAK"
    });
  });
});
