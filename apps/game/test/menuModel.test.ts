import { describe, expect, it } from "vitest";
import type { CharacterCollection } from "@eb/schemas";
import type { PartyMember } from "../src/characterModel";
import {
  buildStatusScreen,
  buildStatusViewModel,
  cancelMenu,
  closedMenu,
  confirmMenu,
  menuDebugState,
  moveMenu,
  openMenu,
  type MenuScreen
} from "../src/menuModel";

const rootScreen: MenuScreen = {
  id: "root",
  title: "Root",
  items: [
    { id: "first", label: "First", enabled: true },
    { id: "disabled", label: "Disabled", enabled: false },
    { id: "third", label: "Third", enabled: true }
  ]
};

describe("menuModel navigation", () => {
  it("wraps movement through enabled items by default", () => {
    let state = openMenu(rootScreen);

    state = moveMenu(state, -1);
    expect(menuDebugState(state)).toMatchObject({ cursorIndex: 2, currentItemId: "third" });

    state = moveMenu(state, 1);
    expect(menuDebugState(state)).toMatchObject({ cursorIndex: 0, currentItemId: "first" });
  });

  it("clamps movement when the screen disables wrapping", () => {
    const state = openMenu({ ...rootScreen, wrap: false });

    expect(menuDebugState(moveMenu(state, -1))).toMatchObject({ cursorIndex: 0, currentItemId: "first" });
    expect(menuDebugState(moveMenu(state, 99))).toMatchObject({ cursorIndex: 2, currentItemId: "third" });
  });

  it("pushes child screens on confirm", () => {
    const child: MenuScreen = {
      id: "child",
      title: "Child",
      items: [{ id: "child-line", label: "Child line", enabled: false }]
    };
    const root: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "open-child", label: "Open", enabled: true, childScreenId: "child" }]
    };

    const result = confirmMenu(openMenu(root), (id) => id === "child" ? child : undefined);

    expect(result.actionId).toBeUndefined();
    expect(menuDebugState(result.state)).toMatchObject({
      open: true,
      stack: ["root", "child"],
      cursorIndex: 0,
      currentItemId: "child-line"
    });
  });

  it("pops child screens and closes at the root", () => {
    const child: MenuScreen = {
      id: "child",
      title: "Child",
      items: []
    };
    const root: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "open-child", label: "Open", enabled: true, childScreenId: "child" }]
    };
    const pushed = confirmMenu(openMenu(root), () => child).state;

    const popped = cancelMenu(pushed);
    expect(menuDebugState(popped)).toMatchObject({ open: true, stack: ["root"] });

    const closed = cancelMenu(popped);
    expect(closed).toEqual(closedMenu());
  });

  it("dispatches action ids without mutating the stack", () => {
    const actionScreen: MenuScreen = {
      id: "root",
      title: "Root",
      items: [{ id: "use", label: "Use", enabled: true, actionId: "use-selected" }]
    };
    const state = openMenu(actionScreen);

    const result = confirmMenu(state, () => undefined);

    expect(result.actionId).toBe("use-selected");
    expect(result.state).toEqual(state);
  });
});

describe("Status view model", () => {
  it("builds a structured status screen from synthetic party members", () => {
    const members: PartyMember[] = [
      partyMember(1, "MEMBER_A", 10),
      partyMember(2, "MEMBER_B", 20)
    ];

    const status = buildStatusViewModel({ partyMembers: members, wallet: 77 });
    const screen = buildStatusScreen(status);

    expect(status.wallet).toBe(77);
    expect(status.members).toHaveLength(2);
    expect(status.members[0]).toMatchObject({
      id: 1,
      name: "MEMBER_A",
      level: 10,
      hp: 50,
      maxHp: 50,
      pp: 12,
      maxPp: 12,
      stats: { offense: 11, defense: 12, speed: 13, guts: 14, vitality: 15, iq: 16, luck: 17 }
    });
    expect(screen.items.map((item) => item.id)).toEqual([
      "wallet",
      "member-0-vitals",
      "member-0-stats",
      "member-1-vitals",
      "member-1-stats"
    ]);
  });

  it("builds status from generated character data and session wallet", () => {
    const characters: CharacterCollection = {
      schemaVersion: "test",
      sourceProjectPath: "",
      derivation: {
        source: "synthetic",
        baseStats: "synthetic",
        statFormula: "synthetic",
        hpPpFormula: "synthetic",
        uncertainty: "synthetic"
      },
      characters: [
        {
          id: 1,
          name: "MEMBER_A",
          level: 4,
          maxHp: 44,
          maxPp: 8,
          offense: 9,
          defense: 8,
          speed: 7,
          guts: 6,
          vitality: 5,
          iq: 4,
          luck: 3,
          startingItems: [],
          money: 0
        },
        {
          id: 2,
          name: "MEMBER_B",
          level: 6,
          maxHp: 66,
          maxPp: 10,
          offense: 13,
          defense: 12,
          speed: 11,
          guts: 10,
          vitality: 9,
          iq: 8,
          luck: 7,
          startingItems: [],
          money: 0
        }
      ],
      counts: { characters: 2, statFieldsPopulated: 20 },
      warnings: []
    };

    const status = buildStatusViewModel({
      characters,
      partyState: {
        wallet: 125,
        party: () => [2]
      }
    });

    expect(status.wallet).toBe(125);
    expect(status.members).toHaveLength(1);
    expect(status.members[0]).toMatchObject({
      id: 2,
      name: "MEMBER_B",
      level: 6,
      hp: 66,
      maxHp: 66,
      stats: { offense: 13, defense: 12, speed: 11, guts: 10, vitality: 9, iq: 8, luck: 7 }
    });
  });

  it("uses a neutral default party when generated character data is absent", () => {
    const status = buildStatusViewModel();

    expect(status.members).toHaveLength(1);
    expect(status.members[0]).toMatchObject({
      id: 0,
      name: "PLAYER",
      level: 1,
      hp: 40,
      maxHp: 40
    });
  });
});

function partyMember(id: number, name: string, level: number): PartyMember {
  return {
    id,
    name,
    level,
    maxHp: 50,
    hp: 50,
    maxPp: 12,
    pp: 12,
    stats: {
      offense: 11,
      defense: 12,
      speed: 13,
      guts: 14,
      vitality: 15,
      iq: 16,
      luck: 17
    },
    inventory: [],
    money: 0
  };
}
