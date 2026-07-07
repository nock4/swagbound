import { describe, expect, it } from "vitest";
import {
  buildFreshBedroomWorldTarget,
  buildTitleMenuData,
  readContinueWorldTarget,
  type WorldStartData
} from "./gameStartTargets";
import type { GameData } from "./loader";
import { serializeSaveState, type SaveSlotPersistence, type SaveState } from "./saveState";

describe("game start targets", () => {
  it("builds the title CONTINUE target from the current save slot", () => {
    const blob = serializeSaveState(saveState({ x: 320, y: 480 }));
    const saveSlots = slots(blob);
    const data = gameData();

    const titleData = buildTitleMenuData(data, { saveSlot: 0, saveSlots });
    const worldData = titleData.continueTarget?.data as WorldStartData;

    expect(titleData.hasSave).toBe(true);
    expect(titleData.continueTarget?.sceneKey).toBe("chunked-world");
    expect(worldData.saveSlot).toBe(0);
    expect(worldData.saveSlots).toBe(saveSlots);
    expect(worldData.saveState?.player).toMatchObject({ x: 320, y: 480, facing: "left" });
  });

  it("returns no CONTINUE target when the slot is empty", () => {
    expect(readContinueWorldTarget(gameData(), { saveSlot: 0, saveSlots: slots(null) })).toBeNull();
  });

  it("uses a fresh chunked-world bedroom target for no-save game-over CONTINUE fallback", () => {
    const target = buildFreshBedroomWorldTarget(gameData(), { saveSlot: 0, saveSlots: slots(null) });
    const worldData = target.data as WorldStartData;

    expect(target.sceneKey).toBe("chunked-world");
    expect(worldData.saveState).toBeNull();
    expect(worldData.gameData).toBeDefined();
    expect(worldData.saveSlot).toBe(0);
  });
});

function gameData(): GameData {
  return {
    manifest: { schemaVersion: "test", files: {} },
    addedNpcs: { npcs: [] },
    customDialogue: { byNpcId: {}, byTextPointer: {}, byReference: {} },
    drifellaBarks: { barks: [] },
    dialogueLibrary: { entries: [] },
    overworldInteractables: { interactables: [] },
    cardNfts: { cards: [] },
    sourceChecks: { checks: [] },
    npcOverrides: { overrides: [] }
  } as unknown as GameData;
}

function slots(blob: string | null): SaveSlotPersistence {
  return {
    saveToSlot: () => true,
    loadFromSlot: () => blob,
    hasSave: () => blob !== null,
    clearSlot: () => true
  };
}

function saveState(player: Pick<SaveState["player"], "x" | "y">): SaveState {
  return {
    schemaVersion: 1,
    savedAt: "2026-07-07T00:00:00.000Z",
    flags: { strings: ["intro:bedroom-opening-done"], numeric: [] },
    party: {
      wallet: 12,
      bank: 34,
      partyIds: [1],
      inventory: [],
      equipped: []
    },
    player: {
      mode: "chunked",
      mapId: "full",
      x: player.x,
      y: player.y,
      facing: "left"
    }
  };
}
