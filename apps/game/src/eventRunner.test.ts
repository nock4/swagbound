import { describe, expect, it } from "vitest";
import type { DialogueEvent, GameEvent, InteractionEventDispatcher } from "./eventRunner";
import {
  addedNpcInteractionEvents,
  dispatchInteractionEvents,
  interactionEvents
} from "./eventRunner";
import { talkedFlag } from "./gameFlags";

describe("addedNpcInteractionEvents", () => {
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
});

function dispatchWithMock(events: readonly GameEvent[]): string[] {
  const log: string[] = [];
  let dialogueActive = false;
  let deferredShop: number | undefined;
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
    isDialogueActive: () => dialogueActive
  };

  dispatchInteractionEvents(events, dispatcher);
  dialogueActive = false;
  if (deferredShop !== undefined) {
    dispatcher.openShop(deferredShop);
  }
  return log;
}
