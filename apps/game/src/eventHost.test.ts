import { describe, expect, it } from "vitest";
import type { DialogueSegment, EventEffect, ScriptCollection, ScriptCommand } from "@eb/schemas";
import { RuntimeEventHost, RuntimeEventSequence, normalizeActorMoveSelector } from "./eventHost";
import { GENERATED_DRIFELLA_BARK_SOURCE } from "./customDialogueLookup";
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

describe("RuntimeEventHost dialogue overrides", () => {
  it("uses a byNpcId override once for the whole event while preserving later non-dialogue effects", () => {
    const dialogue = new DialogueController();
    const partyState = new PartyState();
    const host = new RuntimeEventHost({
      dialogue,
      flags: new GameFlags(),
      partyState,
      customDialogue: {
        byNpcId: { "744": { pages: ["Override bark."] } },
        byTextPointer: {}
      }
    });
    const sequence = new RuntimeEventSequence(eventScript([
      { kind: "text", value: "First EB block." },
      { kind: "control", code: "unknown", raw: "[06 49 00 {e(l_0xc72fbe)}]" },
      { kind: "text", value: "Mayor Pirkle leak." },
      { kind: "give", char: 1, item: 54, raw: "{give(1,54)}" }
    ]), host);

    expect(sequence.start("test.main", { npcId: 744 })).toBe(true);
    expect(sequence.running).toBe(true);
    expect(dialogue.open).toBe(true);
    expect(dialogue.pages.map((page) => page.text)).toEqual(["Override bark."]);
    expect(dialogue.currentText).toBe("Override bark.");

    dialogue.close();
    sequence.confirm();

    expect(dialogue.open).toBe(false);
    expect(partyState.inventory(1)).toEqual([54]);
    expect(sequence.running).toBe(false);
    expect(sequence.debug().effectsByKind).toMatchObject({
      text: 2,
      control: 1,
      give: 1
    });
  });

  it("does not let generated Drifella barks override the reference event text", () => {
    const dialogue = new DialogueController();
    const host = new RuntimeEventHost({
      dialogue,
      flags: new GameFlags(),
      partyState: new PartyState(),
      customDialogue: {
        byNpcId: {
          "744": {
            pages: ["Generated bark."],
            generated: { source: GENERATED_DRIFELLA_BARK_SOURCE }
          }
        },
        byTextPointer: {}
      }
    });
    const sequence = new RuntimeEventSequence(eventScript([
      { kind: "text", value: "Original event text." }
    ]), host);

    expect(sequence.start("test.main", { npcId: 744 })).toBe(true);
    expect(dialogue.currentText).toBe("Original event text.");
  });
});

describe("RuntimeEventHost actorMove effects", () => {
  it("pauses the sequence until actor arrival is reported", () => {
    const flags = new GameFlags();
    const moves: Array<Extract<EventEffect, { kind: "actorMove" }>> = [];
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags,
      partyState: new PartyState(),
      actorMove: (effect) => {
        moves.push(effect);
        return true;
      }
    });
    const sequence = new RuntimeEventSequence(recoveryScript([
      { kind: "actorMove", actor: { npcId: 744 }, to: { x: 120, y: 160 } },
      { kind: "setFlag", flag: 42, raw: "set(42)" }
    ]), host);

    expect(sequence.start("test.main")).toBe(true);
    expect(sequence.running).toBe(true);
    expect(flags.isSet(42)).toBe(false);
    expect(moves).toHaveLength(1);
    expect(sequence.debug().currentEffectKind).toBe("actorMove");

    sequence.update(1000);
    expect(sequence.running).toBe(true);
    expect(flags.isSet(42)).toBe(false);

    sequence.notifyActorArrived();
    expect(sequence.running).toBe(false);
    expect(flags.isSet(42)).toBe(true);
    expect(sequence.debug().effectsByKind).toMatchObject({
      actorMove: 1,
      setFlag: 1
    });
  });

  it("fires onComplete with an aborted result on external abort", () => {
    const flags = new GameFlags();
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags,
      partyState: new PartyState(),
      actorMove: () => true
    });
    const sequence = new RuntimeEventSequence(recoveryScript([
      { kind: "actorMove", actor: { npcId: 744 }, to: { x: 120, y: 160 } },
      { kind: "setFlag", flag: 42, raw: "set(42)" }
    ]), host);
    const results: Array<{ status: string; reason?: string }> = [];
    expect(sequence.start("test.main", { onComplete: (result) => results.push(result) })).toBe(true);
    expect(sequence.running).toBe(true);

    sequence.abort("player_cancel");
    expect(sequence.running).toBe(false);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "aborted", reason: "player_cancel" });
  });

  it("auto-resumes actorMove when no scene sink is registered", () => {
    const flags = new GameFlags();
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags,
      partyState: new PartyState()
    });
    const sequence = new RuntimeEventSequence(recoveryScript([
      { kind: "actorMove", actor: "player", to: { x: 10, y: 12 } },
      { kind: "setFlag", flag: 7, raw: "set(7)" }
    ]), host);

    expect(sequence.start("test.main")).toBe(true);
    expect(sequence.running).toBe(false);
    expect(flags.isSet(7)).toBe(true);
    expect(sequence.debug().records).toMatchObject({
      actorMoves: 1,
      actorMoveNoops: 1,
      lastActorMoveActor: "player"
    });
  });

  it("normalizes supported actor move selectors", () => {
    expect(normalizeActorMoveSelector("player")).toEqual({ kind: "player" });
    expect(normalizeActorMoveSelector({ kind: "player" })).toEqual({ kind: "player" });
    expect(normalizeActorMoveSelector({ npcId: 744 })).toEqual({ kind: "npc", npcId: 744 });
    expect(normalizeActorMoveSelector({ kind: "npc", npcId: 744 })).toEqual({ kind: "npc", npcId: 744 });
  });
});

describe("RuntimeEventHost party effects", () => {
  it("notifies when party composition changes", () => {
    const partyState = new PartyState();
    const changes: Array<{ op: "add" | "remove"; char: number; partyIds: number[] }> = [];
    const host = new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags: new GameFlags(),
      partyState,
      onPartyChange: (op, char, partyIds) => changes.push({ op, char, partyIds })
    });

    host.party("add", 2);
    host.party("add", 2);
    host.party("remove", 2);

    expect(changes).toEqual([
      { op: "add", char: 2, partyIds: [2] },
      { op: "remove", char: 2, partyIds: [] }
    ]);
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

function eventScript(effects: DialogueSegment[]): ScriptCollection {
  const commands: ScriptCommand[] = [
    command({ cmd: "label", raw: "label main", name: "main" }, 1),
    ...effects.map((effect, index) =>
      command({ cmd: "text", raw: `effect ${index}`, segments: [effect] }, index + 2)
    ),
    command({ cmd: "end", raw: "end" }, effects.length + 2)
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
          textCommands: effects.length,
          unknownCommands: 0
        },
        warnings: []
      }
    ],
    counts: {
      files: 1,
      commands: commands.length,
      labels: 1,
      textCommands: effects.length,
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
