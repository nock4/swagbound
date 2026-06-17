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

  it("persists field-only HP/PP changes before any battle member exists", () => {
    const sourceParty = new PartyState();
    sourceParty.partyOp("add", 1);
    const hpItem = { id: 0x31, action: 0x1e02, argument: 20, miscFlags: ["item disappears when used"] };
    const ppItem = { id: 0x32, action: 0x1e06, argument: 5, miscFlags: ["item disappears when used"] };
    sourceParty.give(1, hpItem.id);
    sourceParty.give(1, ppItem.id);

    expect(sourceParty.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: hpItem,
      targetVitals: { hp: 12, maxHp: 40, pp: 2, maxPp: 10 }
    })).toMatchObject({ ok: true, previousValue: 12, nextValue: 32 });
    expect(sourceParty.useItem({
      ownerChar: 1,
      targetChar: 1,
      item: ppItem,
      targetVitals: { hp: 32, maxHp: 40, pp: 2, maxPp: 10 }
    })).toMatchObject({ ok: true, previousValue: 2, nextValue: 7 });
    expect(sourceParty.battleMember(1)).toBeUndefined();

    const save = captureSaveState({
      flags: new GameFlags(),
      partyState: sourceParty,
      player: { mode: "chunked", mapId: "field-heal", x: 9, y: 10, facing: "left" }
    });
    expect(save.party.vitals).toEqual([{
      charId: 1,
      hp: { current: 12, target: 32 },
      maxHp: 40,
      pp: 7,
      maxPp: 10
    }]);

    const reloadedParty = new PartyState();
    applySaveState(deserializeSaveState(serializeSaveState(save)), {
      flags: new GameFlags(),
      partyState: reloadedParty
    });

    const vitals = reloadedParty.vitals(1);
    expect(reloadedParty.battleMember(1)).toBeUndefined();
    expect(vitals?.hp).toMatchObject({ displayed: 12, target: 32, isRolling: true });
    expect(vitals?.maxHp).toBe(40);
    expect(vitals?.pp).toBe(7);
    expect(vitals?.maxPp).toBe(10);
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

  it("still loads older saves that do not have a party vitals section", () => {
    const legacySave = {
      schemaVersion: SAVE_STATE_SCHEMA_VERSION,
      flags: { strings: [], numeric: [] },
      party: {
        wallet: 0,
        bank: 0,
        partyIds: [1],
        inventory: [],
        equipped: [],
        battleMembers: [
          {
            charId: 1,
            level: 3,
            experience: 120,
            hp: 22,
            maxHp: 80,
            pp: 5,
            maxPp: 25,
            inventory: [],
            stats: { offense: 10, defense: 9, speed: 8, guts: 7, vitality: 6, iq: 5, luck: 4 }
          }
        ]
      },
      player: { mode: "chunked", mapId: "legacy", x: 0, y: 0, facing: "down" }
    };

    const parsed = deserializeSaveState(JSON.stringify(legacySave));
    expect(parsed).not.toBeNull();
    expect(parsed?.party.vitals).toBeUndefined();

    const reloadedParty = new PartyState();
    applySaveState(parsed, { flags: new GameFlags(), partyState: reloadedParty });

    expect(reloadedParty.vitals(1)?.hp.target).toBe(22);
    expect(reloadedParty.vitals(1)?.pp).toBe(5);
    expect(reloadedParty.battleMember(1)).toMatchObject({ hp: 22, pp: 5 });
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

  it("prefers saved field vitals when battle member and vitals sections disagree", () => {
    const party = new PartyState();
    party.restore({
      wallet: 0,
      bank: 0,
      partyIds: [1],
      inventory: [],
      equipped: [],
      vitals: [
        {
          charId: 1,
          hp: { current: 10, target: 35 },
          maxHp: 40,
          pp: 8,
          maxPp: 12
        }
      ],
      battleMembers: [
        {
          charId: 1,
          level: 5,
          experience: 300,
          hp: 1,
          maxHp: 40,
          pp: 0,
          maxPp: 12,
          inventory: [],
          stats: { offense: 12, defense: 11, speed: 10, guts: 9, vitality: 8, iq: 7, luck: 6 }
        }
      ]
    });

    expect(party.vitals(1)?.hp).toMatchObject({ displayed: 10, target: 35 });
    expect(party.vitals(1)?.pp).toBe(8);
    expect(party.battleMember(1)).toMatchObject({ hp: 35, pp: 8, maxHp: 40, maxPp: 12 });
  });
});
