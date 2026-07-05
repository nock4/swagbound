import { describe, expect, it } from "vitest";
import { GameFlags } from "../src/gameFlags";
import { PartyState } from "../src/partyState";
import {
  SAVE_STATE_SCHEMA_VERSION,
  applySaveState,
  captureSaveState,
  deserializeSaveState,
  serializeSaveState,
  type SaveState
} from "../src/saveState";

describe("SaveState", () => {
  it("round-trips flags, party state, and player snapshot through JSON", () => {
    const sourceFlags = new GameFlags();
    sourceFlags.set("flag:alpha");
    sourceFlags.set("flag:beta");
    sourceFlags.setNum(7);
    sourceFlags.setNum(3);

    const sourceParty = new PartyState();
    sourceParty.money(125);
    sourceParty.partyOp("add", 2);
    sourceParty.give(2, 10);
    sourceParty.give(2, 11);
    sourceParty.give(2, 10);
    sourceParty.equip(2, { id: 10, type: 0x10 });
    sourceParty.equip(2, { id: 11, type: 0x14 });
    sourceParty.restore({
      ...sourceParty.snapshot(),
      battleMembers: [{
        charId: 2,
        level: 4,
        experience: 250,
        hp: 33,
        maxHp: 60,
        pp: 7,
        maxPp: 12,
        inventory: [10, 11, 10],
        stats: { offense: 9, defense: 8, speed: 7, guts: 6, vitality: 5, iq: 4, luck: 3 }
      }]
    });

    const save = captureSaveState({
      flags: sourceFlags,
      partyState: sourceParty,
      player: {
        mode: "chunked",
        mapId: "synthetic-map",
        x: 123.5,
        y: 456.25,
        facing: "left"
      },
      savedAt: "2026-01-01T00:00:00.000Z"
    });

    const blob = serializeSaveState(save);
    expect(blob).toEqual(expect.any(String));
    const parsed = deserializeSaveState(blob);
    expect(parsed).not.toBeNull();

    const targetFlags = new GameFlags();
    targetFlags.set("stale");
    targetFlags.setNum(99);
    const targetParty = new PartyState();
    targetParty.money(1);
    targetParty.partyOp("add", 9);
    targetParty.give(9, 99);

    const player = applySaveState(parsed, {
      flags: targetFlags,
      partyState: targetParty
    });

    expect(player).toEqual({
      mode: "chunked",
      mapId: "synthetic-map",
      x: 123.5,
      y: 456.25,
      facing: "left"
    });
    expect(targetFlags.list()).toEqual(["flag:alpha", "flag:beta"]);
    expect(targetFlags.listNums()).toEqual([3, 7]);
    expect(targetParty.wallet).toBe(125);
    expect(targetParty.party()).toEqual([2]);
    expect(targetParty.inventory(2)).toEqual([10, 11, 10]);
    expect(targetParty.equipped(2)).toEqual({ weapon: 10, body: 11 });
    expect(targetParty.battleMember(2)).toMatchObject({ level: 4, experience: 250, hp: 33 });
  });

  it("round-trips an explicit party order through save/load", () => {
    const flags = new GameFlags();
    const party = new PartyState();
    for (const id of [0, 1, 2, 3]) {
      party.partyOp("add", id);
    }
    party.reorder([2, 0]); // Munch leads, then Bosch

    const save = captureSaveState({
      flags,
      partyState: party,
      player: { mode: "chunked", x: 0, y: 0, facing: "down" }
    });
    const parsed = deserializeSaveState(serializeSaveState(save));
    expect(parsed?.party.order).toEqual([2, 0, 1, 3]);

    const restored = new PartyState();
    applySaveState(parsed, { flags: new GameFlags(), partyState: restored });
    expect(restored.party()).toEqual([2, 0, 1, 3]);
  });

  it("returns null for empty, corrupt, missing, and older-version blobs", () => {
    expect(deserializeSaveState(null)).toBeNull();
    expect(deserializeSaveState("")).toBeNull();
    expect(deserializeSaveState("not-json")).toBeNull();
    expect(deserializeSaveState(JSON.stringify({ schemaVersion: SAVE_STATE_SCHEMA_VERSION }))).toBeNull();
    expect(deserializeSaveState(JSON.stringify({ schemaVersion: 0 }))).toBeNull();
    expect(applySaveState({ schemaVersion: 0 }, {
      flags: new GameFlags(),
      partyState: new PartyState()
    })).toBeNull();
  });

  it("tolerates unknown numeric ids when applying a valid save", () => {
    const save: SaveState = {
      schemaVersion: SAVE_STATE_SCHEMA_VERSION,
      flags: { strings: ["flag:unknown"], numeric: [404] },
      party: {
        wallet: 77,
        partyIds: [999],
        inventory: [{ charId: 999, itemIds: [888, 888] }],
        equipped: [{ charId: 999, slots: { weapon: 777 } }]
      },
      player: {
        mode: "region",
        mapId: "synthetic-region",
        region: {
          originTile: { x: 1, y: 2 },
          widthPixels: 320,
          heightPixels: 240
        },
        x: 12,
        y: 34,
        facing: "up"
      }
    };

    const flags = new GameFlags();
    const partyState = new PartyState();
    const player = applySaveState(save, { flags, partyState });

    expect(player).toEqual(save.player);
    expect(flags.list()).toEqual(["flag:unknown"]);
    expect(flags.listNums()).toEqual([404]);
    expect(partyState.wallet).toBe(77);
    expect(partyState.party()).toEqual([999]);
    expect(partyState.inventory(999)).toEqual([888, 888]);
    expect(partyState.equipped(999)).toEqual({ weapon: 777 });
  });
});
