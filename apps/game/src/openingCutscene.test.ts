import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OpeningCutsceneSchema,
  resolveScriptEvents,
  type EventEffect,
  type OpeningCutscene
} from "@eb/schemas";
import {
  AUTHORED_OPENING_CUTSCENE_REF,
  EARTHBOUND_OPENING_KNOCK_REF,
  buildOpeningCutsceneScript
} from "./newGameOpening";
import { RuntimeEventHost, RuntimeEventSequence } from "./eventHost";
import { GameFlags } from "./gameFlags";
import { createNpcState, stepNpc } from "./npcController";
import { OpeningCutsceneActorHoldSet } from "./openingCutsceneActorHold";
import { PartyState } from "./partyState";
import { DialogueController } from "./state";

describe("authored opening cutscene", () => {
  it("builds authored steps into a runnable sequence that can chain into the knock ref", () => {
    const script = buildOpeningCutsceneScript({
      schema: "swagbound.opening-cutscene.v1",
      steps: [{
        actorMove: {
          actor: { npcId: 78 },
          to: { x: 7820, y: 588 }
        }
      }]
    });
    const moves: Array<Extract<EventEffect, { kind: "actorMove" }>> = [];
    let chainedReference: string | undefined;
    const sequence = new RuntimeEventSequence(script, new RuntimeEventHost({
      dialogue: new DialogueController(),
      flags: new GameFlags(),
      partyState: new PartyState(),
      actorMove: (effect) => {
        moves.push(effect);
        return true;
      }
    }));

    expect(sequence.start(AUTHORED_OPENING_CUTSCENE_REF, {
      onComplete: () => {
        chainedReference = EARTHBOUND_OPENING_KNOCK_REF;
      }
    })).toBe(true);
    expect(sequence.running).toBe(true);
    expect(chainedReference).toBeUndefined();

    sequence.notifyActorArrived();

    expect(sequence.running).toBe(false);
    expect(chainedReference).toBe(EARTHBOUND_OPENING_KNOCK_REF);
    expect(moves).toEqual([{
      kind: "actorMove",
      actor: { npcId: 78 },
      to: { x: 7820, y: 588 }
    }]);
  });

  it("treats absent or empty authored cutscenes as no-op", () => {
    expect(buildOpeningCutsceneScript(undefined)).toBeUndefined();
    expect(buildOpeningCutsceneScript({
      schema: "swagbound.opening-cutscene.v1",
      steps: []
    })).toBeUndefined();
  });

  it("treats the authored opening cutscene as a no-op wake-up", () => {
    // Bosch now wakes at the foot of his bed (spawn 7592,364) with the world fade-in
    // and the MiFella knock event; the authored cutscene carries no NPC choreography.
    // (The prior version moved NPC 78 to 7820,588, the old wrong hotel spawn.)
    const cutscene = loadAuthoredOpeningCutscene();
    expect(buildOpeningCutsceneScript(cutscene)).toBeUndefined();
  });

  it("keeps a held wandering actor static until the startup releases it", () => {
    const holdSet = new OpeningCutsceneActorHoldSet();
    const npcState = createNpcState(10, 10, "right", {
      kind: "wander",
      radiusPx: 80,
      speedPxPerSec: 24,
      seed: 1,
      stepMs: 1000
    });
    const start = { x: npcState.player.x, y: npcState.player.y };

    holdSet.hold("npc:78", npcState, npcState.paused);
    stepNpc(npcState, {
      deltaMs: 1000,
      bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
      blocked: () => false
    });

    expect(npcState.paused).toBe(true);
    expect({ x: npcState.player.x, y: npcState.player.y }).toEqual(start);

    holdSet.release((key) => key === "npc:78" ? npcState : undefined);
    stepNpc(npcState, {
      deltaMs: 1000,
      bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
      blocked: () => false
    });

    expect(npcState.paused).toBe(false);
    expect({ x: npcState.player.x, y: npcState.player.y }).not.toEqual(start);
  });
});

function loadAuthoredOpeningCutscene(): OpeningCutscene {
  return OpeningCutsceneSchema.parse(JSON.parse(readFileSync(
    new URL("../../../content/opening-cutscene.json", import.meta.url),
    "utf8"
  )));
}
