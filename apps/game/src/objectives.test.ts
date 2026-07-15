import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ObjectivesSchema, type Objectives } from "@eb/schemas";
import { currentObjective, currentObjectiveNpcHint } from "./objectives";

function flags(values: string[]) {
  const set = new Set(values);
  return { has: (flag: string) => set.has(flag) };
}

describe("currentObjective", () => {
  it("returns the first objective whose required flags are set and blocked flags are unset", () => {
    const objectives: Objectives = {
      schema: "swagbound.objectives.v1",
      objectives: [
        {
          id: "first",
          when: { requireFlags: [], blockFlags: ["done:first"] },
          text: "Do first."
        },
        {
          id: "second",
          when: { requireFlags: ["done:first"], blockFlags: ["done:second"] },
          text: "Do second."
        },
        {
          id: "fallback",
          when: { requireFlags: [], blockFlags: [] },
          text: "Explore."
        }
      ]
    };

    expect(currentObjective(flags([]), objectives)?.id).toBe("first");
    expect(currentObjective(flags(["done:first"]), objectives)?.id).toBe("second");
    expect(currentObjective(flags(["done:first", "done:second"]), objectives)?.id).toBe("fallback");
  });

  it("resolves the authored Act 1 and Act 2 chain from content/objectives.json", () => {
    const objectives = ObjectivesSchema.parse(JSON.parse(
      readFileSync(resolve("content/objectives.json"), "utf8")
    ));

    expect(currentObjective(flags([]), objectives)?.id).toBe("act1-cold-signal");
    expect(currentObjective(flags(["intro:meteor-beat-fired"]), objectives)?.id).toBe("act1-card-clique");
    expect(currentObjective(flags(["intro:meteor-beat-fired", "signal:clique_cleared"]), objectives)?.id).toBe("act1-returnless-king");
    expect(currentObjective(flags(["intro:meteor-beat-fired", "signal:clique_cleared", "signal:route_open"]), objectives)?.id).toBe("act1-malady");
    expect(currentObjective(flags(["intro:meteor-beat-fired", "signal:clique_cleared", "signal:route_open", "signal:threshold_cleared"]), objectives)?.id)
      .toBe("act1-munch");
    expect(currentObjective(flags([
      "signal:clique_cleared",
      "intro:meteor-beat-fired",
      "signal:route_open",
      "signal:threshold_cleared",
      "recruit:munch"
    ]), objectives)?.id)
      .toBe("act1-leave-signal-town");
    const act1CompleteFlags = ["intro:meteor-beat-fired", "signal:clique_cleared", "signal:route_open", "signal:threshold_cleared", "recruit:munch", "act1:complete"];
    expect(currentObjective(flags(act1CompleteFlags), objectives)?.id).toBe("act2-reach-postwick");
    expect(currentObjective(flags([...act1CompleteFlags, "act2:begun", "postwick:arrived"]), objectives)?.id)
      .toBe("act2-postwick-registry");
    expect(currentObjective(flags([...act1CompleteFlags, "act2:begun", "postwick:arrived", "act2:registry_cleared"]), objectives)?.id)
      .toBe("act2-arena-venue-1");
    expect(currentObjective(flags([...act1CompleteFlags, "act2:begun", "postwick:arrived", "act2:registry_cleared", "arena:won:1"]), objectives)?.id)
      .toBe("act2-arena-venue-2");
    expect(currentObjective(flags([
      ...act1CompleteFlags,
      "act2:begun",
      "postwick:arrived",
      "act2:registry_cleared",
      "arena:won:1",
      "arena:won:2"
    ]), objectives)?.id).toBe("act2-arena-venue-3");
    expect(currentObjective(flags([
      ...act1CompleteFlags,
      "act2:begun",
      "postwick:arrived",
      "act2:registry_cleared",
      "arena:won:1",
      "arena:won:2",
      "arena:champion"
    ]), objectives)?.id)
      .toBe("act2-leave-postwick");
    const act2CompleteFlags = [
      ...act1CompleteFlags,
      "act2:begun",
      "postwick:arrived",
      "act2:registry_cleared",
      "arena:won:1",
      "arena:won:2",
      "arena:champion",
      "act2:complete"
    ];
    expect(currentObjective(flags(act2CompleteFlags), objectives)?.id).toBe("act2-source-spring");
    expect(currentObjective(flags([...act2CompleteFlags, "source:spring:cleared"]), objectives)?.id)
      .toBe("act3-reach-dead-letter");
    expect(currentObjective(flags([
      ...act2CompleteFlags,
      "source:spring:cleared",
      "deadletter:arrived",
      "source:undelivered:cleared",
      "signal:museum_starman_cleared",
      "signal:museum_frank_cleared"
    ]), objectives)?.id).toBe("act3-museum-worm");
  });

  it("selects stable story-aware NPC hints for the current objective", () => {
    const objectives = ObjectivesSchema.parse(JSON.parse(
      readFileSync(resolve("content/objectives.json"), "utf8")
    ));
    const first = currentObjectiveNpcHint(flags([]), objectives, 4);
    const again = currentObjectiveNpcHint(flags([]), objectives, 4);
    const neighbor = currentObjectiveNpcHint(flags([]), objectives, 5);

    expect(first).toBe(again);
    expect(first).not.toBe(neighbor);
    expect(first).toContain("meteor");
  });
});
