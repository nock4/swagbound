import { describe, expect, it } from "vitest";
import type { DialogueSegment, ScriptCollection, ScriptCommand } from "@eb/schemas";
import { RuntimeEventHost, RuntimeEventSequence } from "./eventHost";
import { GameFlags } from "./gameFlags";
import { PartyState, type PartyStateSnapshot } from "./partyState";
import { DialogueController } from "./state";

describe("RuntimeEventHost recovery effects", () => {
  it("applies event recovery effects to active party members through executor dispatch", () => {
    const partyState = damagedPartyState();
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags: new GameFlags(),
      partyState
    });
    const sequence = new RuntimeEventSequence(recoveryScript([
      { kind: "healHp", amount: 25 },
      { kind: "recoverPp", amount: 8 },
      { kind: "healHpPercent", percent: 100, char: 2 },
      { kind: "recoverPpPercent", percent: 100, char: 2 }
    ]), host);

    expect(sequence.start("test.main")).toBe(true);
    expect(sequence.running).toBe(false);

    const first = partyState.vitals(1);
    const second = partyState.vitals(2);
    expect(first?.hp.target).toBe(35);
    expect(first?.pp).toBe(13);
    expect(second?.hp.target).toBe(80);
    expect(second?.pp).toBe(20);
    expect(sequence.debug().effectsByKind).toMatchObject({
      healHp: 1,
      recoverPp: 1,
      healHpPercent: 1,
      recoverPpPercent: 1
    });
  });
});

function damagedPartyState(): PartyState {
  const partyState = new PartyState();
  partyState.restore({
    wallet: 0,
    partyIds: [1, 2],
    inventory: [],
    equipped: [],
    vitals: [
      { charId: 1, hp: { current: 10, target: 10 }, maxHp: 100, pp: 5, maxPp: 40 },
      { charId: 2, hp: { current: 0, target: 0 }, maxHp: 80, pp: 0, maxPp: 20 }
    ]
  } satisfies PartyStateSnapshot);
  return partyState;
}

function recoveryScript(effects: DialogueSegment[]): ScriptCollection {
  const commands: ScriptCommand[] = [
    command({ cmd: "label", raw: "label main", name: "main" }, 1),
    command({ cmd: "text", raw: "recover", segments: effects }, 2),
    command({ cmd: "end", raw: "end" }, 3)
  ];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [
      {
        path: "test.ccs",
        commands,
        labels: ["main"],
        counts: {
          commands: commands.length,
          labels: 1,
          textCommands: 1,
          unknownCommands: 0
        },
        warnings: []
      }
    ],
    counts: {
      files: 1,
      commands: commands.length,
      labels: 1,
      textCommands: 1,
      unknownCommands: 0
    },
    warnings: []
  };
}

function command(
  input: Omit<ScriptCommand, "sourceLocation">,
  line: number
): ScriptCommand {
  return {
    ...input,
    sourceLocation: { file: "test.ccs", line, column: 1 }
  };
}
