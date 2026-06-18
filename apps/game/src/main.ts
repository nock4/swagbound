import Phaser from "phaser";
import { loadGameData, parseManifest, type GameData } from "./loader";
import { publishDebug } from "./state";
import { ChunkedWorldScene } from "./chunkedWorldScene";
import { IntroScene, isIntroDisabled, shouldStartIntro } from "./introScene";
import { decideNewGameOpening, resolveNewGameOpeningStart } from "./newGameOpening";
import { WorldScene } from "./worldScene";
import { UiScene } from "./uiScene";
import { FallbackScene } from "./fallbackScene";
import { BattleScene } from "./battleScene";
import { buildPartyMember, type PartyMember } from "./characterModel";
import { deserializeSaveState, type SaveSlotPersistence } from "./saveState";
import { registerWindowFlavorControls } from "./windowSettings";
import "./style.css";

const MONO = "Menlo, Consolas, monospace";
const DEFAULT_SAVE_SLOT = 0;
const SAVE_KEY_PREFIX = "coilsnake-tutorial-experiment:save:";
const SAVE_SLOTS: SaveSlotPersistence = {
  saveToSlot,
  loadFromSlot,
  hasSave,
  clearSlot
};

/**
 * Boot: fetches and validates the generated JSON pipeline, then starts the
 * playable world scene (real imported map/NPC data) or the fallback scene
 * (placeholder field) when world data is unavailable.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.json("manifest", "/generated/manifest.json");
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    const manifest = parseManifest(this.cache.json.get("manifest"));
    if (!manifest) {
      this.renderError("Generated manifest is missing or invalid.", "Run pnpm convert, then pnpm validate.");
      return;
    }
    const data: GameData = await loadGameData(manifest);
    registerWindowFlavorControls(data.window);
    const battleGroupId = battleGroupIdFromSearch(globalThis.location?.search);
    if (battleGroupId !== undefined && data.battle) {
      const debugPartyMembers = debugBattlePartyMembersFromSearch(globalThis.location?.search, data.characters);
      this.scene.start("battle", {
        battleData: data.battle,
        groupId: battleGroupId,
        characters: data.characters,
        partyMembers: debugPartyMembers,
        items: data.items,
        psi: data.psi,
        font: data.font,
        window: data.window,
        spriteOverrides: data.spriteOverrides,
        backgroundOverrides: data.backgroundOverrides,
        battleRules: data.battleRules
      });
      return;
    }
    const saveBlob = loadFromSlot(DEFAULT_SAVE_SLOT);
    const saveState = deserializeSaveState(saveBlob);
    if (data.world?.available && "mode" in data.world && data.world.mode === "full") {
      const introDisabled = isIntroDisabled({
        search: globalThis.location?.search,
        registryFlag: this.registry.get("nointro")
      });
      const openingResolution = resolveNewGameOpeningStart(data.world, data.scripts);
      const openingDecision = decideNewGameOpening({
        newGame: saveBlob === null,
        disabled: introDisabled,
        resolvedStart: openingResolution.resolved ? openingResolution.start : undefined
      });
      if (saveBlob === null && !introDisabled && !openingResolution.resolved) {
        console.warn("New-game opening unresolved; using fallback intro.", openingResolution.reason);
      }
      const chunkedWorldData = {
        gameData: data,
        saveState,
        saveSlot: DEFAULT_SAVE_SLOT,
        saveSlots: SAVE_SLOTS,
        ...(openingDecision.runOpening ? { newGameOpening: openingDecision.start } : {})
      };
      const introDecision = shouldStartIntro({
        hasSave: saveBlob !== null,
        disabled: introDisabled
      });
      if (openingDecision.runOpening) {
        this.scene.start("chunked-world", chunkedWorldData);
      } else if (introDecision.startIntro) {
        this.scene.start("intro", {
          nextSceneKey: "chunked-world",
          nextSceneData: chunkedWorldData
        });
      } else {
        this.scene.start("chunked-world", chunkedWorldData);
      }
      return;
    }
    if (data.world?.available && !("mode" in data.world) && data.world.images) {
      this.scene.start("world", {
        gameData: data,
        saveState,
        saveSlot: DEFAULT_SAVE_SLOT,
        saveSlots: SAVE_SLOTS
      });
      return;
    }
    this.scene.start("fallback", {
      gameData: data,
      reason: data.world ? "world.json reports unavailable" : "world.json missing or invalid"
    });
  }

  private renderError(title: string, message: string): void {
    publishDebug({
      mode: "error",
      dialogueOpen: false,
      dialogueText: "",
      dialoguePageIndex: 0,
      dialoguePageCount: 0,
      targetReference: "robot.hello_world",
      prompt: "",
      inInteractionRange: false,
      movementBounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      statusLines: [title],
      metadataLines: [],
      resolveStatus: "missing",
      windowLoaded: false,
      activeFlavorId: undefined,
      error: { title, message }
    });
    this.cameras.main.setBackgroundColor("#10141b");
    this.add.text(24, 24, title, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#f8fafc",
      wordWrap: { width: this.scale.width - 48 }
    });
    this.add.text(24, 64, message, {
      fontFamily: MONO,
      fontSize: "14px",
      color: "#fca5a5"
    });
  }
}

export function saveToSlot(slot: number, blob: string): boolean {
  const key = saveKey(slot);
  const storage = localStorageOrNull();
  if (!key || !storage) {
    return false;
  }
  try {
    storage.setItem(key, blob);
    return true;
  } catch {
    return false;
  }
}

export function loadFromSlot(slot: number): string | null {
  const key = saveKey(slot);
  const storage = localStorageOrNull();
  if (!key || !storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function hasSave(slot: number): boolean {
  const key = saveKey(slot);
  const storage = localStorageOrNull();
  if (!key || !storage) {
    return false;
  }
  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function clearSlot(slot: number): boolean {
  const key = saveKey(slot);
  const storage = localStorageOrNull();
  if (!key || !storage) {
    return false;
  }
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function saveKey(slot: number): string | null {
  return Number.isInteger(slot) && slot >= 0 ? `${SAVE_KEY_PREFIX}${slot}` : null;
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function battleGroupIdFromSearch(search: string | undefined): number | undefined {
  const value = new URLSearchParams(search ?? "").get("battle");
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function debugBattlePartyMembersFromSearch(
  search: string | undefined,
  characters: GameData["characters"]
): PartyMember[] | undefined {
  const source = characters?.characters ?? [];
  if (source.length === 0) {
    return undefined;
  }
  return source.slice(0, debugPartyCountFromSearch(search)).map(buildPartyMember);
}

function debugPartyCountFromSearch(search: string | undefined): number {
  const value = new URLSearchParams(search ?? "").get("party");
  if (value === null || value.trim() === "") {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(4, Math.max(1, parsed));
}

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "app",
  width: 512,
  height: 448,
  backgroundColor: "#000000",
  pixelArt: true,
  scene: [BootScene, IntroScene, WorldScene, ChunkedWorldScene, UiScene, FallbackScene, BattleScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
