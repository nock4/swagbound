import type { NewGameOpeningStart } from "./newGameOpening";
import { resolveNewGameOpeningStart } from "./newGameOpening";
import type { TitleMenuData, TitleMenuTarget } from "./titleMenuScene";
import { deserializeSaveState, type SaveSlotPersistence, type SaveState } from "./saveState";
import type { GameData } from "./loader";

export type WorldStartData = {
  gameData: GameData;
  saveSlot: number;
  saveSlots?: SaveSlotPersistence;
  saveState?: SaveState | null;
  newGameOpening?: NewGameOpeningStart;
};

export type GameStartOptions = {
  saveSlot: number;
  saveSlots?: SaveSlotPersistence;
};

export function buildBaseWorldStartData(gameData: GameData, options: GameStartOptions): WorldStartData {
  return {
    gameData,
    saveSlot: options.saveSlot,
    saveSlots: options.saveSlots
  };
}

export function buildNewGameWorldData(gameData: GameData, options: GameStartOptions): WorldStartData {
  const baseWorld = buildBaseWorldStartData(gameData, options);
  const openingResolution = gameData.world?.available && "mode" in gameData.world && gameData.world.mode === "full"
    ? resolveNewGameOpeningStart(gameData.world, gameData.scripts)
    : { resolved: false as const, reason: "world_unavailable" };
  return {
    ...baseWorld,
    saveState: null,
    ...(openingResolution.resolved ? { newGameOpening: openingResolution.start } : {})
  };
}

export function buildFreshBedroomWorldTarget(gameData: GameData, options: GameStartOptions): TitleMenuTarget {
  return {
    sceneKey: "chunked-world",
    data: buildNewGameWorldData(gameData, options)
  };
}

export function buildNewGameTitleTarget(gameData: GameData, options: GameStartOptions): TitleMenuTarget {
  return {
    sceneKey: "filing-intake",
    data: {
      nextSceneKey: "chunked-world",
      nextSceneData: buildNewGameWorldData(gameData, options)
    },
    keepMusicPlaying: true
  };
}

export function readContinueWorldTarget(gameData: GameData, options: GameStartOptions): TitleMenuTarget | null {
  const saveBlob = options.saveSlots?.loadFromSlot(options.saveSlot) ?? null;
  if (saveBlob === null) {
    return null;
  }
  return {
    sceneKey: "chunked-world",
    data: {
      ...buildBaseWorldStartData(gameData, options),
      saveState: deserializeSaveState(saveBlob)
    }
  };
}

export function buildTitleMenuData(gameData: GameData, options: GameStartOptions): TitleMenuData {
  const continueTarget = readContinueWorldTarget(gameData, options);
  return {
    newGameTarget: buildNewGameTitleTarget(gameData, options),
    continueTarget,
    hasSave: continueTarget !== null,
    musicManifest: gameData.musicManifest
  };
}
