import { describe, expect, it } from "vitest";
import { GameFlags } from "../src/gameFlags";
import { PartyState, type PartyStateSnapshot } from "../src/partyState";
import {
  SAVE_STATE_SCHEMA_VERSION,
  applySaveState,
  captureSaveState,
  deserializeSaveState,
  serializeSaveState
} from "../src/saveState";

// QA lock-in for the save-rest domain.
// IP note: numeric ids + Swagbound-neutral names only; no upstream strings.

function makeFullParty(): PartyState {
  const party = new PartyState();
  party.money(250);
  party.deposit(100); // wallet -> 150, bank -> 100
  party.partyOp("add", 1);
  party.partyOp("add", 2);
  party.give(1, 0x10);
  party.give(1, 0x14);
  party.give(2, 200);
  party.equip(1, { id: 0x10, type: 0x10 }); // weapon slot
  party.equip(1, { id: 0x14, type: 0x14 }); // body slot
  // Establish damaged battle members so vitals participate in the snapshot.
  party.restore({
    ...party.snapshot(),
    battleMembers: [
      {
        charId: 1,
        level: 3,
        experience: 120,
        hp: 20,
        maxHp: 80,
        pp: 5,
        maxPp: 25,
        inventory: [0x10, 0x14],
        stats: { offense: 10, defense: 9, speed: 8, guts: 7, vitality: 6, iq: 5, luck: 4 }
      },
      {
        charId: 2,
        level: 2,
        experience: 40,
        hp: 30,
        maxHp: 30,
        pp: 0,
        maxPp: 0,
        inventory: [200],
        stats: { offense: 5, defense: 5, speed: 5, guts: 5, vitality: 5, iq: 5, luck: 5 }
      }
    ]
  });
  return party;
}

describe("save-rest: serialize -> deserialize round-trip", () => {
  it("preserves party, inventory, equipment, flags, wallet, bank, and position without loss", () => {
    const flags = new GameFlags();
    flags.set("flag:alpha");
    flags.set("flag:beta");
    flags.setNum(404);
    flags.setNum(5);

    const party = makeFullParty();

    const save = captureSaveState({
      flags,
      partyState: party,
      player: { mode: "chunked", mapId: "onett-slice", x: 532, y: 440, facing: "up" },
      savedAt: "2026-06-17T00:00:00.000Z"
    });

    const blob = serializeSaveState(save);
    expect(blob).toEqual(expect.any(String));

    const parsed = deserializeSaveState(blob);
    expect(parsed).not.toBeNull();

    const targetFlags = new GameFlags();
    const targetParty = new PartyState();
    const player = applySaveState(parsed, { flags: targetFlags, partyState: targetParty });

    // Position + facing survive exactly.
    expect(player).toEqual({
      mode: "chunked",
      mapId: "onett-slice",
      x: 532,
      y: 440,
      facing: "up"
    });

    // Flags survive (sorted-unique).
    expect(targetFlags.list()).toEqual(["flag:alpha", "flag:beta"]);
    expect(targetFlags.listNums()).toEqual([5, 404]);

    // Wallet + bank survive independently.
    expect(targetParty.wallet).toBe(150);
    expect(targetParty.bank).toBe(100);

    // Party membership + inventory + equipment survive.
    expect(targetParty.party()).toEqual([1, 2]);
    expect(targetParty.inventory(1)).toEqual([0x10, 0x14]);
    expect(targetParty.inventory(2)).toEqual([200]);
    expect(targetParty.equipped(1)).toEqual({ weapon: 0x10, body: 0x14 });

    // Battle members + reconstructed vitals survive at the saved (damaged) values.
    expect(targetParty.battleMember(1)).toMatchObject({ level: 3, hp: 20, maxHp: 80, pp: 5, maxPp: 25 });
    expect(targetParty.vitals(1)?.hp.target).toBe(20);
    expect(targetParty.vitals(1)?.maxHp).toBe(80);
    expect(targetParty.vitals(1)?.pp).toBe(5);
  });

  it("is idempotent across a second serialize pass (no drift)", () => {
    const save = captureSaveState({
      flags: new GameFlags(),
      partyState: makeFullParty(),
      player: { mode: "chunked", mapId: "onett-slice", x: 1, y: 2, facing: "down" }
    });
    const first = serializeSaveState(save);
    const second = serializeSaveState(deserializeSaveState(first));
    expect(second).toBe(first);
  });

  it("rejects empty, corrupt, missing-section, wrong-version, and out-of-range blobs", () => {
    expect(deserializeSaveState(null)).toBeNull();
    expect(deserializeSaveState(undefined)).toBeNull();
    expect(deserializeSaveState("")).toBeNull();
    expect(deserializeSaveState("   ")).toBeNull();
    expect(deserializeSaveState("{not json")).toBeNull();
    expect(deserializeSaveState(JSON.stringify({ schemaVersion: SAVE_STATE_SCHEMA_VERSION }))).toBeNull();
    expect(deserializeSaveState(JSON.stringify({ schemaVersion: SAVE_STATE_SCHEMA_VERSION + 1 }))).toBeNull();
    expect(deserializeSaveState(JSON.stringify({ schemaVersion: 0 }))).toBeNull();

    const base = {
      schemaVersion: SAVE_STATE_SCHEMA_VERSION,
      flags: { strings: [], numeric: [] },
      party: { wallet: 0, partyIds: [], inventory: [], equipped: [] },
      player: { mode: "region", x: 0, y: 0, facing: "up" }
    };
    // Missing party section.
    expect(deserializeSaveState(JSON.stringify({ ...base, party: undefined }))).toBeNull();
    // Negative wallet rejected.
    expect(deserializeSaveState(JSON.stringify({ ...base, party: { ...base.party, wallet: -5 } }))).toBeNull();
    // Non-integer wallet rejected.
    expect(deserializeSaveState(JSON.stringify({ ...base, party: { ...base.party, wallet: 5.5 } }))).toBeNull();
    // Invalid facing rejected.
    expect(deserializeSaveState(JSON.stringify({ ...base, player: { ...base.player, facing: "diagonal" } }))).toBeNull();
    // Invalid mode rejected.
    expect(deserializeSaveState(JSON.stringify({ ...base, player: { ...base.player, mode: "freefly" } }))).toBeNull();
    // Sanity: the well-formed base IS accepted.
    expect(deserializeSaveState(JSON.stringify(base))).not.toBeNull();
  });
});

describe("save-rest: restore() rehydrates vitals to the saved values", () => {
  it("restoring a full-HP/PP snapshot puts each member at max vitals (the rest target shape)", () => {
    // A 'rested' party = every member at full HP/PP. This is the data shape a rest
    // effect would need to persist; we lock the restore path that backs it.
    const restedSnapshot: PartyStateSnapshot = {
      wallet: 0,
      bank: 0,
      partyIds: [1, 2],
      inventory: [],
      equipped: [],
      battleMembers: [
        {
          charId: 1,
          level: 5,
          experience: 300,
          hp: 90,
          maxHp: 90, // full
          pp: 40,
          maxPp: 40, // full
          inventory: [],
          stats: { offense: 12, defense: 11, speed: 10, guts: 9, vitality: 8, iq: 7, luck: 6 }
        },
        {
          charId: 2,
          level: 4,
          experience: 150,
          hp: 60,
          maxHp: 60, // full
          pp: 0,
          maxPp: 0,
          inventory: [],
          stats: { offense: 8, defense: 7, speed: 6, guts: 5, vitality: 4, iq: 3, luck: 2 }
        }
      ]
    };

    const party = new PartyState();
    // Pre-damage to prove restore overwrites rather than merges.
    party.partyOp("add", 1);
    party.restore({
      ...party.snapshot(),
      battleMembers: [
        {
          charId: 1,
          level: 5,
          experience: 300,
          hp: 1,
          maxHp: 90,
          pp: 0,
          maxPp: 40,
          inventory: [],
          stats: { offense: 12, defense: 11, speed: 10, guts: 9, vitality: 8, iq: 7, luck: 6 }
        }
      ]
    });
    expect(party.vitals(1)?.hp.target).toBe(1);

    party.restore(restedSnapshot);

    const v1 = party.vitals(1);
    const v2 = party.vitals(2);
    expect(v1?.hp.target).toBe(v1?.maxHp);
    expect(v1?.hp.target).toBe(90);
    expect(v1?.pp).toBe(v1?.maxPp);
    expect(v1?.pp).toBe(40);
    expect(v2?.hp.target).toBe(v2?.maxHp);
    expect(v2?.hp.target).toBe(60);
  });

  it("a rested (full-vitals) party round-trips through save without losing the restore", () => {
    const party = new PartyState();
    party.partyOp("add", 1);
    party.restore({
      ...party.snapshot(),
      battleMembers: [
        {
          charId: 1,
          level: 5,
          experience: 300,
          hp: 90,
          maxHp: 90,
          pp: 40,
          maxPp: 40,
          inventory: [],
          stats: { offense: 12, defense: 11, speed: 10, guts: 9, vitality: 8, iq: 7, luck: 6 }
        }
      ]
    });

    const blob = serializeSaveState(
      captureSaveState({
        flags: new GameFlags(),
        partyState: party,
        player: { mode: "chunked", mapId: "home", x: 0, y: 0, facing: "down" }
      })
    );
    const reloaded = new PartyState();
    applySaveState(deserializeSaveState(blob), { flags: new GameFlags(), partyState: reloaded });

    const v = reloaded.vitals(1);
    expect(v?.hp.target).toBe(90);
    expect(v?.hp.target).toBe(v?.maxHp);
    expect(v?.pp).toBe(40);
    expect(v?.pp).toBe(v?.maxPp);
  });
});
