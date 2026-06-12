import { describe, expect, it } from "vitest";
import { interactionEvents } from "../src/eventRunner";
import { GameFlags, talkedFlag } from "../src/gameFlags";

const FALLBACK_REFERENCE = "robot.hello_world";

describe("interactionEvents", () => {
  it("uses textPointer on the first interaction and then marks the NPC talked", () => {
    const flags = new GameFlags();

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("uses textPointer2 on repeat interactions when the talked flag is set", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter_again" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("keeps textPointer on repeat interactions when textPointer2 is missing", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("ignores non-ccscript textPointer2 values", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter",
      textPointer2: "123.bad"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("falls back when textPointer is absent before the NPC has been talked to", () => {
    const flags = new GameFlags();

    expect(interactionEvents({
      npcId: 745,
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: FALLBACK_REFERENCE },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("emits dialogue before setFlag so selection uses the pre-talk state", () => {
    const flags = new GameFlags();
    const events = interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags);

    expect(events.map((event) => event.kind)).toEqual(["dialogue", "setFlag"]);
  });
});
