import { describe, expect, it } from "vitest";
import type { AddedNpcs, WorldChunkedNpc } from "@eb/schemas";
import {
  addedNpcSpawnEligible,
  buildAddedWorldNpcs,
  isAddedWorldChunkedNpc
} from "./loader";

describe("added NPC overlay normalization", () => {
  it("normalizes eligible added NPCs into chunked NPC runtime data", () => {
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: 100000,
        worldPixel: { x: 128, y: 160 },
        spriteGroup: 5,
        facing: "left",
        interaction: { pages: ["Counter service."], shop: 3 }
      }]
    };

    const normalized = buildAddedWorldNpcs(addedNpcs, []);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      npcId: 100000,
      spriteGroup: 5,
      direction: "left",
      type: "added-npc",
      movement: 0,
      showSprite: "always",
      interactable: true,
      visible: true,
      worldPixel: { x: 128, y: 160 },
      addedNpc: true,
      addedInteraction: { pages: ["Counter service."], shop: 3 }
    });
    expect(isAddedWorldChunkedNpc(normalized[0])).toBe(true);
  });

  it("guards against added NPC ids that collide with existing runtime NPC ids", () => {
    const existing: Pick<WorldChunkedNpc, "npcId">[] = [{ npcId: 100000 }];
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [
        {
          id: 100000,
          worldPixel: { x: 128, y: 160 },
          spriteGroup: 5,
          facing: "down",
          interaction: { shop: 1 }
        },
        {
          id: 100001,
          worldPixel: { x: 160, y: 160 },
          spriteGroup: 5,
          facing: "up",
          interaction: { ref: "library:neighbor" }
        }
      ]
    };

    expect(addedNpcSpawnEligible({ id: 100000 }, existing)).toBe(false);
    expect(addedNpcSpawnEligible({ id: 100001 }, existing)).toBe(true);
    expect(buildAddedWorldNpcs(addedNpcs, existing).map((npc) => npc.npcId)).toEqual([100001]);
  });

  it("spawns interaction-less added NPCs as non-interactable markers", () => {
    const addedNpcs: AddedNpcs = {
      schema: "swagbound.added-npcs.v1",
      npcs: [{
        id: 100002,
        worldPixel: { x: 192, y: 224 },
        spriteGroup: 59,
        facing: "down"
      }]
    };

    const normalized = buildAddedWorldNpcs(addedNpcs, []);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      npcId: 100002,
      interactable: false,
      visible: true,
      worldPixel: { x: 192, y: 224 },
      addedNpc: true
    });
    expect(normalized[0].addedInteraction).toBeUndefined();
  });
});
