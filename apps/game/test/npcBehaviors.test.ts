import { describe, expect, it } from "vitest";
import { behaviorForNpc, heuristicBehaviorForMovement } from "../src/npcBehaviors";

describe("NPC behavior selection", () => {
  it("uses explicit authored behavior before movement-id heuristics", () => {
    expect(behaviorForNpc(744, 10)).toEqual({ kind: "static" });
    expect(behaviorForNpc(745, 12)).toEqual({ kind: "static" });
    expect(behaviorForNpc(746, 8)).toEqual({ kind: "patrol", axis: "x", rangePx: 24, speedPxPerSec: 40 });
  });

  it("maps the conservative stationary movement-id bucket to static behavior", () => {
    for (const movementId of [undefined, 0, 8, 9]) {
      expect(heuristicBehaviorForMovement(100, movementId).kind).toBe("static");
    }
  });

  it("maps remaining movement ids to deterministic bounded wander", () => {
    for (const movementId of [10, 12, 605, 606, 599]) {
      const first = heuristicBehaviorForMovement(100, movementId);
      const second = heuristicBehaviorForMovement(100, movementId);

      expect(first).toEqual(second);
      expect(first).toMatchObject({
        kind: "wander",
        radiusPx: 16,
        speedPxPerSec: 22
      });
    }
  });
});
