import { describe, expect, it } from "vitest";
import { GameFlags } from "./gameFlags";
import { cutsceneNpcHiddenFlag, isNpcVisibleForRuntimeFlags } from "./npcVisibility";

describe("isNpcVisibleForRuntimeFlags", () => {
  it("applies cutscene hidden flags before EB show-sprite event flag rules", () => {
    const flags = new GameFlags();
    const npc = { npcId: 77, showSprite: "always", eventFlag: undefined };

    expect(isNpcVisibleForRuntimeFlags(npc, flags)).toBe(true);

    flags.set(cutsceneNpcHiddenFlag(77));
    expect(isNpcVisibleForRuntimeFlags(npc, flags)).toBe(false);
  });

  it("preserves EB numeric event flag visibility when no cutscene hidden flag is set", () => {
    const flags = new GameFlags();
    const npc = { npcId: 124, showSprite: "when event flag set", eventFlag: 466 };

    expect(isNpcVisibleForRuntimeFlags(npc, flags)).toBe(false);

    flags.setNum(466);
    expect(isNpcVisibleForRuntimeFlags(npc, flags)).toBe(true);
  });
});
