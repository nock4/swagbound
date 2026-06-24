import { describe, expect, it } from "vitest";
import { behaviorForNpc, heuristicBehaviorForMovement } from "../src/npcBehaviors";

describe("NPC behavior selection", () => {
  it("uses explicit authored behavior before movement-id heuristics", () => {
    expect(behaviorForNpc(744, 10)).toEqual({ kind: "static" });
    expect(behaviorForNpc(745, 12)).toEqual({ kind: "static" });
    expect(behaviorForNpc(746, 8)).toEqual({ kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 });
  });

  it("maps decoded stationary/look-around movement ids to static behavior", () => {
    // Decoded from the EB action-script bytecode (see npcBehaviors.ts): zero-velocity
    // / no-move-callback scripts and the 606/693 look-around watchers never translate.
    for (const movementId of [undefined, 0, 7, 8, 9, 10, 597, 598, 600, 605, 606, 693]) {
      expect(heuristicBehaviorForMovement(100, movementId).kind, `movement ${movementId}`).toBe("static");
    }
  });

  it("maps decoded walker movement ids to deterministic bounded wander", () => {
    for (const movementId of [12, 13, 16, 599, 602]) {
      const first = heuristicBehaviorForMovement(100, movementId);
      const second = heuristicBehaviorForMovement(100, movementId);

      expect(first).toEqual(second);
      expect(first, `movement ${movementId}`).toMatchObject({
        kind: "wander",
        radiusPx: 16,
        speedPxPerSec: 22
      });
    }
  });
});
