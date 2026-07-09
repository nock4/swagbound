import { describe, expect, it } from "vitest";
import type { DialogueSegment, ScriptCollection, ScriptCommand } from "@eb/schemas";
import type { DialogueEvent, GameEvent, InteractionEventDispatcher } from "./eventRunner";
import {
  addedNpcInteractionEvents,
  dispatchInteractionEvents,
  interactionEntryEvents,
  interactionEvents
} from "./eventRunner";
import { talkedFlag } from "./gameFlags";

describe("addedNpcInteractionEvents", () => {
  it("returns no events for a marker without interaction data", () => {
    expect(addedNpcInteractionEvents({
      npcId: 100099
    })).toEqual([]);
  });

  it("yields an immediate shop-open event for a shop-only entry", () => {
    const events = addedNpcInteractionEvents({
      npcId: 100000,
      interaction: { shop: 4 }
    });

    expect(events).toEqual([
      { kind: "shop", storeId: 4 },
      { kind: "setFlag", flag: talkedFlag(100000) }
    ]);

    const log = dispatchWithMock(events);
    expect(log).toEqual([
      "shop:4",
      `flag:${talkedFlag(100000)}`
    ]);
  });

  it("orders dialogue before the deferred shop-open for pages plus shop", () => {
    const events = addedNpcInteractionEvents({
      npcId: 100001,
      interaction: { pages: ["Take a look."], shop: 9 }
    });

    expect(events).toEqual([
      { kind: "dialogue", pages: ["Take a look."] },
      { kind: "shop", storeId: 9 },
      { kind: "setFlag", flag: talkedFlag(100001) }
    ]);

    const log = dispatchWithMock(events);
    expect(log).toEqual([
      "dialogue:Take a look.",
      "defer-shop:9",
      `flag:${talkedFlag(100001)}`,
      "shop:9"
    ]);
  });

  it("orders dialogue before deferred service screens for pages plus service", () => {
    const events = addedNpcInteractionEvents({
      npcId: 100003,
      interaction: { pages: ["Need a room?"], service: "hotel", cost: 100 }
    });

    expect(events).toEqual([
      { kind: "dialogue", pages: ["Need a room?"] },
      { kind: "service", service: "hotel", cost: 100 },
      { kind: "setFlag", flag: talkedFlag(100003) }
    ]);

    const log = dispatchWithMock(events);
    expect(log).toEqual([
      "dialogue:Need a room?",
      "defer-service:hotel:100",
      `flag:${talkedFlag(100003)}`,
      "service:hotel:100"
    ]);
  });

  it("emits heal and save events from interaction entries", () => {
    const events = interactionEntryEvents({
      pages: ["Rest here."],
      heal: "full",
      save: true
    });

    expect(events).toEqual([
      { kind: "dialogue", pages: ["Rest here."] },
      { kind: "heal", scope: "full" },
      { kind: "save" }
    ]);

    expect(dispatchWithMock(events)).toEqual([
      "dialogue:Rest here.",
      "heal:full",
      "save"
    ]);
  });

  it("emits one-time give events only before the talked flag is set", () => {
    const interaction = {
      pages: ["Take this."],
      give: { char: 1, item: 54, once: true as const }
    };
    const firstEvents = addedNpcInteractionEvents({
      npcId: 100002,
      interaction
    }, undefined, { has: () => false });
    const repeatEvents = addedNpcInteractionEvents({
      npcId: 100002,
      interaction
    }, undefined, { has: () => true });

    expect(firstEvents).toEqual([
      { kind: "dialogue", pages: ["Take this."] },
      { kind: "give", char: 1, item: 54 },
      { kind: "setFlag", flag: talkedFlag(100002) }
    ]);
    expect(dispatchWithMock(firstEvents)).toEqual([
      "dialogue:Take this.",
      "give:1:54",
      `flag:${talkedFlag(100002)}`
    ]);
    expect(repeatEvents).toEqual([
      { kind: "dialogue", pages: ["Take this."] },
      { kind: "setFlag", flag: talkedFlag(100002) }
    ]);
  });
});

describe("interactionEvents custom-dialogue shops", () => {
  it("opens a shop immediately for an EB NPC shop-only override", () => {
    const events = interactionEvents(
      { npcId: 744, textPointer: "robot.hello_world" },
      "fallback.reference",
      { has: () => false },
      {
        byNpcId: { "744": { shop: 2 } },
        byTextPointer: {}
      }
    );

    expect(events).toEqual([
      { kind: "shop", storeId: 2 },
      { kind: "setFlag", flag: talkedFlag(744) }
    ]);
  });

  it("keeps override dialogue before shop for EB NPC pages plus shop", () => {
    const events = interactionEvents(
      { npcId: 745, textPointer: "data_00.l_0x1" },
      "fallback.reference",
      { has: () => false },
      {
        byNpcId: {},
        byTextPointer: {
          "data_00.l_0x1": { pages: ["Welcome."], shop: 6 }
        }
      }
    );

    expect(events).toEqual([
      { kind: "dialogue", pages: ["Welcome."] },
      { kind: "shop", storeId: 6 },
      { kind: "setFlag", flag: talkedFlag(745) }
    ]);
  });

  it("keeps pure custom dialogue reference-backed so CCS behavior still runs", () => {
    const events = interactionEvents(
      { npcId: 9, textPointer: "data_28.l_0xc74e83" },
      "fallback.reference",
      { has: () => false },
      {
        byNpcId: {
          "9": { pages: ["What can I do for you?"] }
        },
        byTextPointer: {}
      },
      undefined,
      selectorScript("data_28", "l_0xc74e83", 226)
    );

    expect(events).toEqual([
      // Custom pages render inline (no redundant reference); the CCS shop behavior
      // still runs as its own event derived from the reference.
      { kind: "dialogue", pages: ["What can I do for you?"] },
      { kind: "shop", storeId: 1 },
      { kind: "setFlag", flag: talkedFlag(9) }
    ]);
  });

  it("preserves the reference for pure custom dialogue backed by a CCS choice", () => {
    const events = interactionEvents(
      { npcId: 159, textPointer: "data_20.l_0xc67237" },
      "fallback.reference",
      { has: () => false },
      {
        byNpcId: {
          "159": { pages: ["Question.", "Yes    No"] }
        },
        byTextPointer: {}
      },
      undefined,
      choiceScript("data_20", "l_0xc67237")
    );

    expect(events).toEqual([
      { kind: "dialogue", reference: "data_20.l_0xc67237", pages: ["Question.", "Yes    No"] },
      { kind: "setFlag", flag: talkedFlag(159) }
    ]);
  });

  it("lets authored service keys win over reference-backed behavior", () => {
    const events = interactionEvents(
      { npcId: 1375, textPointer: "data_17.l_0xc62d30" },
      "fallback.reference",
      { has: () => false },
      {
        byNpcId: {
          "1375": { pages: ["Bank terminal."], service: "atm" }
        },
        byTextPointer: {}
      }
    );

    expect(events).toEqual([
      { kind: "dialogue", pages: ["Bank terminal."] },
      { kind: "service", service: "atm" },
      { kind: "setFlag", flag: talkedFlag(1375) }
    ]);
  });
});

function dispatchWithMock(events: readonly GameEvent[]): string[] {
  const log: string[] = [];
  let dialogueActive = false;
  let deferredShop: number | undefined;
  let deferredService: { service: "hospital" | "hotel" | "phone" | "atm"; cost?: number } | undefined;
  const dispatcher: InteractionEventDispatcher = {
    startDialogue: (event: DialogueEvent) => {
      dialogueActive = true;
      log.push(`dialogue:${event.pages ? event.pages.join("|") : event.reference}`);
    },
    setFlag: (flag) => log.push(`flag:${flag}`),
    openShop: (storeId) => log.push(`shop:${storeId}`),
    deferShop: (storeId) => {
      deferredShop = storeId;
      log.push(`defer-shop:${storeId}`);
    },
    openService: (service, cost) => log.push(cost === undefined ? `service:${service}` : `service:${service}:${cost}`),
    deferService: (service, cost) => {
      deferredService = { service, ...(cost !== undefined ? { cost } : {}) };
      log.push(cost === undefined ? `defer-service:${service}` : `defer-service:${service}:${cost}`);
    },
    heal: (scope) => log.push(`heal:${scope}`),
    save: () => log.push("save"),
    give: (char, item) => log.push(`give:${char}:${item}`),
    money: (op, amount) => log.push(`money:${op}:${amount}`),
    isDialogueActive: () => dialogueActive
  };

  dispatchInteractionEvents(events, dispatcher);
  dialogueActive = false;
  if (deferredShop !== undefined) {
    dispatcher.openShop(deferredShop);
  }
  if (deferredService) {
    dispatcher.openService(deferredService.service, deferredService.cost);
  }
  return log;
}

function selectorScript(fileStem: string, labelName: string, flag: number): ScriptCollection {
  const path = `ccscript/${fileStem}.ccs`;
  const commands: ScriptCommand[] = [
    command({ cmd: "label", raw: `${labelName}:`, name: labelName }, path, 1),
    command({
      cmd: "text",
      raw: "selector",
      segments: [{ kind: "setFlag", flag, raw: `set(${flag})` } satisfies DialogueSegment]
    }, path, 2),
    command({ cmd: "end", raw: "end" }, path, 3)
  ];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path,
      commands,
      labels: [labelName],
      counts: {
        commands: commands.length,
        labels: 1,
        textCommands: 1,
        unknownCommands: 0
      },
      warnings: []
    }],
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

function choiceScript(fileStem: string, labelName: string): ScriptCollection {
  const path = `ccscript/${fileStem}.ccs`;
  const commands: ScriptCommand[] = [
    command({ cmd: "label", raw: `${labelName}:`, name: labelName }, path, 1),
    command({
      cmd: "text",
      raw: "choice",
      segments: [{
        kind: "control",
        code: "unknown",
        raw: "[19 02]"
      }, {
        kind: "text",
        value: "Yes"
      }, {
        kind: "control",
        code: "eob",
        raw: "[02]"
      }, {
        kind: "text",
        value: " "
      }, {
        kind: "control",
        code: "unknown",
        raw: "[19 02]"
      }, {
        kind: "text",
        value: "No"
      }, {
        kind: "control",
        code: "eob",
        raw: "[02]"
      }, {
        kind: "control",
        code: "unknown",
        raw: "[09 02 {e(l_yes)} {e(l_no)}]",
        target: "l_yes"
      }]
    }, path, 2),
    command({ cmd: "end", raw: "end" }, path, 3)
  ];
  return {
    schemaVersion: "test",
    sourceProjectPath: "synthetic",
    files: [{
      path,
      commands,
      labels: [labelName],
      counts: {
        commands: commands.length,
        labels: 1,
        textCommands: 1,
        unknownCommands: 0
      },
      warnings: []
    }],
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
  file: string,
  line: number
): ScriptCommand {
  return {
    ...input,
    sourceLocation: { file, line, column: 1 }
  };
}
