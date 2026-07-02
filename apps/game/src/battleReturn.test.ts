import { describe, expect, it } from "vitest";
import { applyDefeatReturn } from "./battleReturn";
import type { PartyStateSnapshot } from "./partyState";
import type { SavePlayerSnapshot } from "./saveState";

describe("applyDefeatReturn", () => {
  it("halves wallet, preserves bank, revives only the lead member, and respawns at save", () => {
    const result = applyDefeatReturn({
      party: defeatParty(),
      savedPlayer: player(320, 480, "left"),
      newGamePlayer: player(64, 96, "down")
    });

    expect(result.respawnSource).toBe("save");
    expect(result.player).toMatchObject({ x: 320, y: 480, facing: "left" });
    expect(result.party.wallet).toBe(50);
    expect(result.party.bank).toBe(999);
    expect(result.party.battleMembers?.map((member) => ({
      charId: member.charId,
      hp: member.hp
    }))).toEqual([
      { charId: 1, hp: 120 },
      { charId: 2, hp: 0 }
    ]);
    expect(result.party.vitals?.map((entry) => ({
      charId: entry.charId,
      hp: entry.hp
    }))).toEqual([
      { charId: 1, hp: { current: 120, target: 120 } },
      { charId: 2, hp: { current: 0, target: 0 } }
    ]);
  });

  it("falls back to new-game spawn when no save exists", () => {
    const result = applyDefeatReturn({
      party: defeatParty(),
      newGamePlayer: player(64, 96, "down")
    });

    expect(result.respawnSource).toBe("newGame");
    expect(result.player).toMatchObject({ x: 64, y: 96, facing: "down" });
  });
});

function defeatParty(): PartyStateSnapshot {
  return {
    wallet: 101,
    bank: 999,
    partyIds: [1, 2],
    inventory: [],
    equipped: [],
    battleMembers: [
      {
        charId: 1,
        level: 8,
        experience: 1200,
        hp: 0,
        maxHp: 120,
        pp: 4,
        maxPp: 10,
        inventory: [],
        stats: { offense: 10, defense: 8, speed: 6, guts: 4, vitality: 5, iq: 3, luck: 2 }
      },
      {
        charId: 2,
        level: 6,
        experience: 800,
        hp: 0,
        maxHp: 80,
        pp: 0,
        maxPp: 20,
        inventory: [],
        stats: { offense: 8, defense: 6, speed: 7, guts: 2, vitality: 4, iq: 8, luck: 3 }
      }
    ],
    vitals: [
      { charId: 1, hp: { current: 0, target: 0 }, maxHp: 120, pp: 4, maxPp: 10 },
      { charId: 2, hp: { current: 0, target: 0 }, maxHp: 80, pp: 0, maxPp: 20 }
    ]
  };
}

function player(x: number, y: number, facing: SavePlayerSnapshot["facing"]): SavePlayerSnapshot {
  return {
    mode: "chunked",
    mapId: "full",
    x,
    y,
    facing
  };
}
