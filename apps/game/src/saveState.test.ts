import { describe, expect, it } from "vitest";
import {
  SAVE_STATE_SCHEMA_VERSION,
  deserializeSaveState,
  serializeSaveState,
  validateImportedSaveBlob,
  type SaveState
} from "./saveState";

describe("save import validation", () => {
  it("accepts a valid save blob and preserves the raw bytes for storage", () => {
    const save = saveState();
    const raw = serializeSaveState(save);
    expect(raw).not.toBeNull();

    const result = validateImportedSaveBlob(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.blob).toBe(raw);
    expect(result.save).toEqual(save);
    expect(deserializeSaveState(result.blob)).toEqual(save);
  });

  it("rejects invalid JSON before schema validation", () => {
    expect(validateImportedSaveBlob("{").ok).toBe(false);
  });

  it("rejects JSON that does not match the save schema", () => {
    expect(validateImportedSaveBlob(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
  });
});

function saveState(): SaveState {
  return {
    schemaVersion: SAVE_STATE_SCHEMA_VERSION,
    savedAt: "2026-07-13T12:00:00.000Z",
    flags: { strings: ["intro:bedroom-opening-done"], numeric: [7] },
    party: {
      wallet: 123,
      bank: 456,
      partyIds: [1],
      inventory: [{ charId: 1, itemIds: [101] }],
      equipped: [{ charId: 1, slots: { weapon: 101 } }]
    },
    player: {
      mode: "chunked",
      mapId: "full",
      x: 2144,
      y: 1788,
      facing: "left"
    }
  };
}
