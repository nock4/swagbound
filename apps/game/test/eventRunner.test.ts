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

  it("uses textPointer2 when the NPC event flag is set", () => {
    const flags = new GameFlags();
    flags.setNum(0x22);

    expect(interactionEvents({
      npcId: 745,
      eventFlag: 0x22,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter_again" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("uses textPointer1 when the NPC event flag is unset", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      eventFlag: 0x22,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags)).toEqual([
      { kind: "dialogue", reference: "robot.greeter" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("keeps the talked fallback when the NPC event flag is zero", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      eventFlag: 0,
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

  it("uses custom dialogue pages by npcId before text-pointer overrides", () => {
    const flags = new GameFlags();

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter"
    }, FALLBACK_REFERENCE, flags, {
      byNpcId: {
        "745": { pages: ["NPC page one.", "NPC page two."] }
      },
      byTextPointer: {
        "robot.greeter": { pages: ["Pointer page."] }
      }
    })).toEqual([
      { kind: "dialogue", pages: ["NPC page one.", "NPC page two."] },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("uses custom dialogue pages by the ccscript pointer it would have selected", () => {
    const flags = new GameFlags();
    flags.set(talkedFlag(745));

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter",
      textPointer2: "robot.greeter_again"
    }, FALLBACK_REFERENCE, flags, {
      byNpcId: {},
      byTextPointer: {
        "robot.greeter_again": { pages: ["Repeat pointer page."] }
      }
    })).toEqual([
      { kind: "dialogue", pages: ["Repeat pointer page."] },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });

  it("keeps the ccscript reference when no custom dialogue override matches", () => {
    const flags = new GameFlags();

    expect(interactionEvents({
      npcId: 745,
      textPointer: "robot.greeter"
    }, FALLBACK_REFERENCE, flags, {
      byNpcId: {
        "999": { pages: ["Other NPC page."] }
      },
      byTextPointer: {
        "robot.other": { pages: ["Other pointer page."] }
      }
    })).toEqual([
      { kind: "dialogue", reference: "robot.greeter" },
      { kind: "setFlag", flag: "npc:745:talked" }
    ]);
  });
});
