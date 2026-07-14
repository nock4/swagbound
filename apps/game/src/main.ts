import Phaser from "phaser";
import { loadGameData, parseManifest, type GameData } from "./loader";
import { publishDebug } from "./state";
import { ChunkedWorldScene } from "./chunkedWorldScene";
import { IntroScene, isIntroDisabled } from "./introScene";
import { Act1IntroScene } from "./act1IntroScene";
import { resolveNewGameOpeningStart } from "./newGameOpening";
import { WorldScene } from "./worldScene";
import { UiScene } from "./uiScene";
import { FallbackScene } from "./fallbackScene";
import { BattleScene } from "./battleScene";
import { GameOverScene } from "./gameOverScene";
import { SourceCheckScene } from "./sourceCheckScene";
import { TitleMenuScene } from "./titleMenuScene";
import { buildNoIntroWorldData, buildTitleMenuData } from "./gameStartTargets";
import { FilingIntakeScene } from "./filingIntakeScene";
import { buildPartyMember, type PartyMember } from "./characterModel";
import type { EncounterAdvantage } from "./battleLogic";
import { deserializeSaveState, type SaveSlotPersistence, type SaveState } from "./saveState";
import type { DrifellaSourceCheck } from "@eb/schemas";
import { registerWindowFlavorControls } from "./windowSettings";
import { mountMusicAuditioner } from "./musicAuditioner";
import "./style.css";

const MONO = "Menlo, Consolas, monospace";
const DEFAULT_SAVE_SLOT = 0;
const SAVE_KEY_PREFIX = "swagbound:save:";
// The save namespace followed the 2026-07-13 repo rename (coilsnake-tutorial-experiment
// -> swagbound). Players who saved under the old prefix keep their progress: any legacy
// key is copied to the new prefix once at boot (old keys are left in place as backup).
const LEGACY_SAVE_KEY_PREFIX = "coilsnake-tutorial-experiment:save:";
const SAVE_SLOTS: SaveSlotPersistence = {
  saveToSlot,
  loadFromSlot,
  hasSave,
  clearSlot
};

function migrateLegacySaves(): void {
  const storage = localStorageOrNull();
  if (!storage) {
    return;
  }
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_SAVE_KEY_PREFIX)) {
        legacyKeys.push(key);
      }
    }
    for (const key of legacyKeys) {
      const newKey = `${SAVE_KEY_PREFIX}${key.slice(LEGACY_SAVE_KEY_PREFIX.length)}`;
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, value);
      }
    }
  } catch {
    // Storage unavailable or full; the game still boots (fresh-save path).
  }
}
migrateLegacySaves();

/**
 * Boot: fetches and validates the generated JSON pipeline, then starts the
 * playable world scene (real imported map/NPC data) or the fallback scene
 * (placeholder field) when world data is unavailable.
 */
// Preload the menu/dialogue typefaces linked in index.html before the scenes
// render any text, so Phaser caches glyphs in the real face rather than the system fallback.
// Times out or fails open: if a font file is unavailable, the UI falls back gracefully.
async function loadMenuFont(): Promise<void> {
  try {
    const fonts = document.fonts;
    if (!fonts?.load) {
      return;
    }
    const menuFontLoads = [
      "16px 'EarthBound Dialogue Gold'",
      "500 16px 'EarthBound Dialogue Gold'",
      "16px 'Pixelify Sans'",
      "500 16px 'Pixelify Sans'"
    ];
    await Promise.race([
      Promise.all(menuFontLoads.map((font) => fonts.load(font))),
      new Promise<void>((resolve) => setTimeout(resolve, 2500))
    ]);
  } catch {
    // Font unavailable - createCleanText's fallback stack keeps the UI readable.
  }
}

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
    const [data] = await Promise.all([loadGameData(manifest), loadMenuFont()]);
    registerWindowFlavorControls(data.window);
    const battleGroupId = battleGroupIdFromSearch(globalThis.location?.search);
    if (battleGroupId !== undefined && data.battle) {
      const debugPartyMembers = debugBattlePartyMembersFromSearch(globalThis.location?.search, data.characters);
      const encounterAdvantage = debugEncounterAdvantageFromSearch(globalThis.location?.search);
      document.getElementById("game-loading")?.remove();
      this.scene.start("battle", {
        battleData: data.battle,
        groupId: battleGroupId,
        boss: debugBattleBossFromSearch(globalThis.location?.search),
        characters: data.characters,
        partyMembers: debugPartyMembers,
        items: data.items,
        psi: grantDebugPsi(data.psi, globalThis.location?.search),
        usabilityMatrix: data.usabilityMatrix,
        font: data.font,
        window: data.window,
        spriteOverrides: data.spriteOverrides,
        backgroundOverrides: data.backgroundOverrides,
        battleRules: data.battleRules,
        musicManifest: data.musicManifest,
        encounterAdvantage
      });
      return;
    }
    const saveBlob = loadFromSlot(DEFAULT_SAVE_SLOT);
    const saveState = deserializeSaveState(saveBlob);
    const sourceCheckId = sourceCheckIdFromSearch(globalThis.location?.search);
    const sourceCheck = sourceCheckId
      ? data.sourceChecks.checks.find((check) => check.id === sourceCheckId)
      : undefined;
    if (sourceCheck && data.battle) {
      const debugPartyMembers = debugBattlePartyMembersFromSearch(globalThis.location?.search, data.characters);
      document.getElementById("game-loading")?.remove();
      this.scene.start("battle", {
        battleData: data.battle,
        characters: data.characters,
        partyMembers: debugPartyMembers,
        items: data.items,
        psi: grantDebugPsi(data.psi, globalThis.location?.search),
        usabilityMatrix: data.usabilityMatrix,
        font: data.font,
        window: data.window,
        spriteOverrides: data.spriteOverrides,
        backgroundOverrides: data.backgroundOverrides,
        battleRules: data.battleRules,
        musicManifest: data.musicManifest,
        encounterAdvantage: "normal",
        encounterSeed: seedFromString(sourceCheck.id),
        returnTo: debugSourceCheckReturnTo(data, sourceCheck, saveState).context,
        attestation: {
          check: sourceCheck,
          cards: data.cardNfts,
          battles: data.attestationBattles,
          attempt: 1,
          gameFlagsSnapshot: saveState?.flags.strings ?? []
        }
      });
      return;
    }
    if (data.world?.available && "mode" in data.world && data.world.mode === "full") {
      const introDisabled = isIntroDisabled({
        search: globalThis.location?.search,
        registryFlag: this.registry.get("nointro")
      });
      const openingResolution = resolveNewGameOpeningStart(data.world, data.scripts);
      if (!introDisabled && !openingResolution.resolved) {
        console.warn("New-game opening unresolved; using fallback intro.", openingResolution.reason);
      }
      if (introDisabled) {
        // Dev fast-path (?nointro): skip the title menu AND the in-world bedroom
        // wake, spawning the player controllable immediately (honoring ?spawn) so
        // QA/automation lands on a movable player. Opt back into the wake with
        // ?wake when you specifically want to exercise the opening sequence.
        const wantWake = new URLSearchParams(globalThis.location?.search ?? "").has("wake");
        this.scene.start("chunked-world", buildNoIntroWorldData(data, {
          saveSlot: DEFAULT_SAVE_SLOT,
          saveSlots: SAVE_SLOTS,
          ...(wantWake && openingResolution.resolved ? { newGameOpening: openingResolution.start } : {})
        }));
        return;
      }
      this.scene.start("title-menu", buildTitleMenuData(data, {
        saveSlot: DEFAULT_SAVE_SLOT,
        saveSlots: SAVE_SLOTS
      }));
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

/** `?battle=449&boss=1` launches the debug battle as a boss fight (boss music/taunts/phases). */
function debugBattleBossFromSearch(search: string | undefined): boolean {
  const value = new URLSearchParams(search ?? "").get("boss")?.trim();
  return value === "1" || value === "true";
}

function sourceCheckIdFromSearch(search: string | undefined): string | undefined {
  const value = new URLSearchParams(search ?? "").get("sourcecheck")?.trim();
  return value || undefined;
}

function debugSourceCheckReturnTo(
  data: GameData,
  check: DrifellaSourceCheck,
  saveState: SaveState | null
): {
  worldPixel: { x: number; y: number };
  facing: DrifellaSourceCheck["placement"]["facing"];
  context: {
    sceneKey: "chunked-world";
    gameData: GameData;
    saveSlot: number;
    saveSlots: SaveSlotPersistence;
    restore: {
      player: { x: number; y: number; facing: DrifellaSourceCheck["placement"]["facing"] };
      flags: { strings: string[]; numeric: number[] };
      party: SaveState["party"];
      encounter: { enabled: boolean; cooldownMs: number; rngSeed: number };
      source: "event";
    };
  };
} {
  const worldPixel = { ...check.placement.worldPixel };
  const facing = check.placement.facing;
  return {
    worldPixel,
    facing,
    context: {
      sceneKey: "chunked-world",
      gameData: data,
      saveSlot: DEFAULT_SAVE_SLOT,
      saveSlots: SAVE_SLOTS,
      restore: {
        player: { x: worldPixel.x, y: worldPixel.y, facing },
        flags: {
          strings: [...(saveState?.flags.strings ?? [])],
          numeric: [...(saveState?.flags.numeric ?? [])]
        },
        party: saveState?.party ?? emptyDebugParty(data),
        encounter: {
          enabled: Boolean(data.encounters && data.battle),
          cooldownMs: 0,
          rngSeed: seedFromString(check.id)
        },
        source: "event"
      }
    }
  };
}

function emptyDebugParty(data: GameData): SaveState["party"] {
  const partyIds = data.characters?.characters.slice(0, 2).map((character) => character.id) ?? [];
  return {
    wallet: 0,
    bank: 0,
    partyIds,
    inventory: [],
    equipped: [],
    battleMembers: []
  };
}

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function debugBattlePartyMembersFromSearch(
  search: string | undefined,
  characters: GameData["characters"]
): PartyMember[] | undefined {
  const source = characters?.characters ?? [];
  if (source.length === 0) {
    return undefined;
  }
  const members = source.slice(0, debugPartyCountFromSearch(search)).map(buildPartyMember);
  // Dev affordance: ?items=103,110 appends item ids to the lead member's battle
  // inventory so Goods can be exercised in a debug battle (e.g. ?battle=448&items=103).
  const debugItems = debugBattleItemsFromSearch(search);
  if (debugItems.length > 0 && members[0]) {
    members[0] = { ...members[0], inventory: [...members[0].inventory, ...debugItems] };
  }
  return members;
}

function debugBattleItemsFromSearch(search: string | undefined): number[] {
  const value = new URLSearchParams(search ?? "").get("items");
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((token) => Number.parseInt(token.trim(), 10))
    .filter((id) => Number.isInteger(id) && id >= 0);
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

function debugEncounterAdvantageFromSearch(search: string | undefined): EncounterAdvantage {
  const value = new URLSearchParams(search ?? "").get("advantage")?.trim().toLowerCase();
  switch (value) {
    case "party":
    case "partyfirststrike":
    case "party-first-strike":
      return "partyFirstStrike";
    case "enemy":
    case "enemyfirststrike":
    case "enemy-first-strike":
      return "enemyFirstStrike";
    case "instant":
    case "instantwin":
    case "instant-win":
      return "instantWin";
    default:
      return "normal";
  }
}

// Dev affordance: ?psi=31,39 (or ?psi=all) grants the lead member (charId 0) those PSI in a debug
// battle - regardless of who learns them in EB - so assist-PSI effects can be verified in-browser.
function grantDebugPsi(psi: GameData["psi"], search: string | undefined): GameData["psi"] {
  const value = new URLSearchParams(search ?? "").get("psi");
  if (!value || !psi) {
    return psi;
  }
  const grantAll = value.trim().toLowerCase() === "all";
  const ids = new Set(
    value.split(",").map((token) => Number.parseInt(token.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 0)
  );
  const granted = psi.psi.map((entry) =>
    grantAll || ids.has(entry.id)
      ? { ...entry, learnedBy: [...entry.learnedBy, { charId: 0, level: 1 }] }
      : entry
  );
  return { ...psi, psi: granted };
}

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "app",
  width: 512,
  height: 448,
  backgroundColor: "#000000",
  pixelArt: true,
  scene: [BootScene, TitleMenuScene, FilingIntakeScene, Act1IntroScene, IntroScene, WorldScene, ChunkedWorldScene, UiScene, FallbackScene, BattleScene, GameOverScene, SourceCheckScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});
if (import.meta.env.DEV) {
  // Forensics handle for headless QA harnesses (texture/scene inspection).
  (globalThis as Record<string, unknown>).__game = game;
}

// Dev-only "Track Lab" panel for auditioning music against live locations.
// Gated to the dev server so it never ships in a production build.
if (import.meta.env.DEV) {
  mountMusicAuditioner();
}
