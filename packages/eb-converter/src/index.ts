import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ManifestSchema,
  NpcReferenceCollectionSchema,
  SCHEMA_VERSION,
  ScriptCollectionSchema,
  SpriteGroupCollectionSchema,
  TeleportDestinationsSchema,
  TutorialStatusSchema,
  ValidationReportSchema,
  type DialogueSegment,
  type Manifest,
  type NpcReferenceCollection,
  type ScriptCollection,
  type ScriptCommand,
  type SpriteGroupCollection,
  type SpriteSheetCollection,
  type TutorialStatus,
  type BattleData,
  type Encounters,
  type FontCollection,
  type WindowCollection,
  type CharacterCollection,
  type ItemCollection,
  type PsiCollection,
  type ShopData,
  type ValidationIssue,
  type ValidationReport,
  type TeleportDestinations,
  type WorldArtifact
} from "@eb/schemas";
import { BATTLE_FILE, buildBattleData } from "./battle";
import { ENCOUNTERS_FILE, buildEncounterData } from "./encounters";
import { FONT_FILE, buildFontData } from "./font";
import { WINDOW_FILE, buildWindowData } from "./window";
import { CHARACTERS_FILE, buildCharacterData } from "./characters";
import { ITEMS_FILE, PSI_FILE, buildItemPsiData } from "./itemsPsi";
import { SHOPS_FILE, buildShopData } from "./shops";
import { buildWorldArtifacts, TUTORIAL_NPC_ID, type WorldMode } from "./world";
import { parseTeleportDestinationTable } from "./coilsnakeYaml";
import {
  DEFAULT_EB_ROM_PATH,
  ROM_NEW_GAME_START_DERIVATION,
  ROM_NEW_GAME_STARTUP_DERIVATION,
  readEbRomStartMetadata,
  scriptReferenceForSnesLabel
} from "./romStart";

const DEFAULT_PROJECT = "external/coilsnake-project";
const DEFAULT_FULL_WORLD_PROJECT = "external/coilsnake-full";
const DEFAULT_OUT = "apps/game/public/generated";
const GENERATED_FILES = {
  scripts: "scripts.json",
  npcs: "npcs.json",
  spriteGroups: "sprite-groups.json",
  tutorialStatus: "tutorial-status.json",
  validationReport: "validation-report.json",
  world: "world.json",
  sprites: "sprites.json"
} as const;
const TELEPORT_DESTINATIONS_FILE = "teleport-destinations.json";

const TUTORIAL_URL = "https://github.com/pk-hack/CoilSnake/wiki/Tutorial%3A-Your-First-Hack";

type CliArgs = {
  project: string;
  out: string;
  worldMode: WorldMode;
  battle: boolean;
  font: boolean;
  window: boolean;
  characters: boolean;
  items: boolean;
  shops: boolean;
  spawnWorldPixel?: { x: number; y: number };
  spawnWorldPixelDerivation?: string;
  romPath?: string;
};

type ConvertResult = {
  manifest: Manifest;
  scripts: ScriptCollection;
  npcs: NpcReferenceCollection;
  spriteGroups: SpriteGroupCollection;
  tutorialStatus: TutorialStatus;
  validationReport: ValidationReport;
  world: WorldArtifact;
  sprites: SpriteSheetCollection;
  teleportDestinations?: TeleportDestinations;
  encounters?: Encounters;
  battle?: BattleData;
  font?: FontCollection;
  window?: WindowCollection;
  characters?: CharacterCollection;
  items?: ItemCollection;
  psi?: PsiCollection;
  shops?: ShopData;
};

export function parseArgs(argv: string[]): CliArgs {
  const itemsEnabled = parseItemMode(process.env.EB_ITEMS);
  const worldMode = parseWorldMode(process.env.EB_WORLD_MODE);
  let fontOverridden = false;
  let windowOverridden = false;
  const args: CliArgs = {
    project: process.env.EB_PROJECT ?? DEFAULT_PROJECT,
    out: DEFAULT_OUT,
    worldMode,
    battle: parseBattleMode(process.env.EB_BATTLE),
    font: parseFontMode(process.env.EB_FONT, worldMode),
    window: parseWindowMode(process.env.EB_WINDOW, worldMode),
    characters: parseCharacterMode(process.env.EB_CHARS),
    items: itemsEnabled,
    shops: parseShopMode(process.env.EB_SHOPS) || itemsEnabled,
    ...(process.env.EB_SPAWN ? { spawnWorldPixel: parseSpawn(process.env.EB_SPAWN) } : {}),
    ...(process.env.EB_ROM ? { romPath: process.env.EB_ROM } : {})
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project") {
      args.project = argv[index + 1] ?? args.project;
      index += 1;
    } else if (arg === "--out") {
      args.out = argv[index + 1] ?? args.out;
      index += 1;
    } else if (arg === "--world-mode") {
      args.worldMode = parseWorldMode(argv[index + 1]);
      if (!fontOverridden && process.env.EB_FONT === undefined) {
        args.font = parseFontMode(undefined, args.worldMode);
      }
      if (!windowOverridden && process.env.EB_WINDOW === undefined) {
        args.window = parseWindowMode(undefined, args.worldMode);
      }
      index += 1;
    } else if (arg === "--battle") {
      args.battle = true;
    } else if (arg === "--font") {
      args.font = true;
      fontOverridden = true;
    } else if (arg === "--no-font") {
      args.font = false;
      fontOverridden = true;
    } else if (arg === "--window") {
      args.window = true;
      windowOverridden = true;
    } else if (arg === "--no-window") {
      args.window = false;
      windowOverridden = true;
    } else if (arg === "--characters" || arg === "--chars") {
      args.characters = true;
    } else if (arg === "--items" || arg === "--item-data") {
      args.items = true;
      args.shops = true;
    } else if (arg === "--shops" || arg === "--shop-data") {
      args.shops = true;
    } else if (arg === "--spawn") {
      args.spawnWorldPixel = parseSpawn(argv[index + 1]);
      index += 1;
    } else if (arg === "--rom") {
      args.romPath = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function parseWorldMode(value: string | undefined): WorldMode {
  if (!value || value === "region") {
    return "region";
  }
  if (value === "full") {
    return "full";
  }
  throw new Error(`Unsupported EB_WORLD_MODE "${value}". Expected "region" or "full".`);
}

function parseBattleMode(value: string | undefined): boolean {
  if (!value || value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_BATTLE "${value}". Expected "1" or "0".`);
}

function parseFontMode(value: string | undefined, worldMode: WorldMode): boolean {
  if (!value) {
    return worldMode === "full";
  }
  if (value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_FONT "${value}". Expected "1" or "0".`);
}

function parseWindowMode(value: string | undefined, worldMode: WorldMode): boolean {
  if (!value) {
    return worldMode === "full";
  }
  if (value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_WINDOW "${value}". Expected "1" or "0".`);
}

function parseCharacterMode(value: string | undefined): boolean {
  if (!value || value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_CHARS "${value}". Expected "1" or "0".`);
}

function parseItemMode(value: string | undefined): boolean {
  if (!value || value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_ITEMS "${value}". Expected "1" or "0".`);
}

function parseShopMode(value: string | undefined): boolean {
  if (!value || value === "0" || value.toLowerCase() === "false" || value.toLowerCase() === "no") {
    return false;
  }
  if (value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes") {
    return true;
  }
  throw new Error(`Unsupported EB_SHOPS "${value}". Expected "1" or "0".`);
}

function parseSpawn(value: string | undefined): { x: number; y: number } {
  const match = /^(\d+),(\d+)$/.exec(value ?? "");
  if (!match) {
    throw new Error(`Invalid EB_SPAWN "${value ?? ""}". Expected "x,y" world pixels.`);
  }
  return { x: Number.parseInt(match[1], 10), y: Number.parseInt(match[2], 10) };
}

export function parseCcsFile(relativePath: string, source: string): {
  commands: ScriptCommand[];
  labels: string[];
  warnings: ValidationIssue[];
} {
  const commands: ScriptCommand[] = [];
  const labels: string[] = [];
  const warnings: ValidationIssue[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const withoutComment = stripComment(line);
    const trimmed = withoutComment.trim();
    if (!trimmed) {
      return;
    }
    const column = Math.max(1, withoutComment.search(/\S/) + 1);
    const sourceLocation = { file: relativePath, line: index + 1, column };

    const inlineControl = scriptInlineControlFromRaw(trimmed, sourceLocation);
    if (inlineControl) {
      commands.push(inlineControl);
      return;
    }

    const labelMatch = trimmed.match(/^([A-Za-z_][\w.]*)\s*:\s*$/);
    if (labelMatch) {
      const name = labelMatch[1];
      labels.push(name);
      commands.push({ cmd: "label", name, raw: trimmed, sourceLocation });
      return;
    }

    for (const part of parseCcsLineParts(withoutComment)) {
      const partLocation = { ...sourceLocation, column: part.column };
      if (part.kind === "text") {
        commands.push({
          cmd: "text",
          value: part.value,
          segments: tokenizeCcsString(part.value),
          raw: `"${part.value}"`,
          sourceLocation: partLocation
        });
        continue;
      }

      const command = scriptCommandFromRaw(part.raw, partLocation);
      commands.push(command);
      addUnknownWarning(command, warnings);
    }
  });

  return { commands, labels, warnings };
}

type CcsLinePart =
  | { kind: "text"; value: string; column: number }
  | { kind: "command"; raw: string; column: number };

function parseCcsLineParts(line: string): CcsLinePart[] {
  const parts: CcsLinePart[] = [];
  let index = 0;

  while (index < line.length) {
    while (index < line.length && /\s/.test(line[index])) {
      index += 1;
    }
    if (index >= line.length) {
      break;
    }

    const column = index + 1;
    if (line[index] === "\"") {
      const close = line.indexOf("\"", index + 1);
      if (close < 0) {
        parts.push({ kind: "command", raw: line.slice(index).trim(), column });
        break;
      }
      parts.push({ kind: "text", value: line.slice(index + 1, close), column });
      index = close + 1;
      continue;
    }

    const start = index;
    const identifier = /^[A-Za-z_][\w.]*/.exec(line.slice(index));
    if (identifier) {
      index += identifier[0].length;
      if (line[index] === "(") {
        let depth = 0;
        while (index < line.length) {
          if (line[index] === "(") {
            depth += 1;
          } else if (line[index] === ")") {
            depth -= 1;
            if (depth === 0) {
              index += 1;
              break;
            }
          }
          index += 1;
        }
        parts.push({ kind: "command", raw: line.slice(start, index).trim(), column });
        continue;
      }
    }

    while (index < line.length && !/\s/.test(line[index])) {
      index += 1;
    }
    parts.push({ kind: "command", raw: line.slice(start, index).trim(), column });
  }

  const meaningfulParts = parts.filter((part) => part.kind === "text" || part.raw.length > 0);
  const hasStructuredPart = meaningfulParts.some((part) =>
    part.kind === "text" || isStructuredCommandPart(part.raw)
  );
  if (!hasStructuredPart) {
    const raw = line.trim();
    return raw ? [{ kind: "command", raw, column: Math.max(1, line.search(/\S/) + 1) }] : [];
  }
  return meaningfulParts;
}

type CcsTextCodeRegistryEntry = {
  opcode: string;
  length: number;
  matches: (bytes: number[], offset: number) => boolean;
  toSegment: (bytes: number[], raw: string) => DialogueSegment;
};

const byte = (value: number) => value.toString(16).toUpperCase().padStart(2, "0");

function signature(...values: number[]) {
  return (bytes: number[], offset: number) =>
    values.every((value, index) => bytes[offset + index] === value);
}

function prefixed(...values: number[]) {
  return (bytes: number[], offset: number) =>
    values.every((value, index) => bytes[offset + index] === value);
}

const controlSegment = (code: string, raw: string, target?: string): DialogueSegment => ({
  kind: "control",
  code,
  raw,
  ...(target ? { target } : {})
});

const substitutionSegment = (
  name: Extract<DialogueSegment, { kind: "substitution" }>["name"],
  args: number[]
): DialogueSegment => ({ kind: "substitution", name, args });

const styleSegment = (
  style: Extract<DialogueSegment, { kind: "style" }>["style"],
  args: number[] = [],
  value?: string
): DialogueSegment => ({
  kind: "style",
  style,
  ...(value ? { value } : {}),
  ...(args.length > 0 ? { args } : {})
});

export const EB_TEXT_FONT_IDS = {
  normal: 0,
  saturn: 1
} as const;

const fontSegment = (
  fontId: typeof EB_TEXT_FONT_IDS[keyof typeof EB_TEXT_FONT_IDS],
  value: keyof typeof EB_TEXT_FONT_IDS
): DialogueSegment => styleSegment("font", [fontId], value);

const windowSegment = (
  op: Extract<DialogueSegment, { kind: "window" }>["op"],
  args: number[] = []
): DialogueSegment => ({ kind: "window", op, args });

const setFlagSegment = (flag: number, raw: string): DialogueSegment => ({ kind: "setFlag", flag, raw });

const unsetFlagSegment = (flag: number, raw: string): DialogueSegment => ({ kind: "unsetFlag", flag, raw });

const partySegment = (
  op: Extract<DialogueSegment, { kind: "party" }>["op"],
  char: number,
  raw: string
): DialogueSegment => ({ kind: "party", op, char, raw });

const warpSegment = (dest: number, raw: string): DialogueSegment => ({ kind: "warp", dest, raw });

const teleportSegment = (dest: number, style: number, raw: string): DialogueSegment => ({
  kind: "teleport",
  dest,
  style,
  raw
});

const anchorWarpSegment = (raw: string): DialogueSegment => ({ kind: "anchorWarp", raw });

const battleSegment = (group: number, raw: string): DialogueSegment => ({ kind: "battle", group, raw });

const giveSegment = (char: number, item: number, raw: string): DialogueSegment => ({ kind: "give", char, item, raw });

const takeSegment = (char: number, item: number, raw: string): DialogueSegment => ({ kind: "take", char, item, raw });

const moneySegment = (
  op: Extract<DialogueSegment, { kind: "money" }>["op"],
  amount: number,
  raw: string
): DialogueSegment => ({ kind: "money", op, amount, raw });

const atmSegment = (
  op: Extract<DialogueSegment, { kind: "atm" }>["op"],
  amount: number,
  raw: string
): DialogueSegment => ({ kind: "atm", op, amount, raw });

const shopSegment = (storeId: number, raw: string): DialogueSegment => ({ kind: "shop", storeId, raw });

const musicPlaySegment = (track: number, raw: string): DialogueSegment => ({ kind: "music", op: "play", track, raw });

const musicSimpleSegment = (
  op: Extract<DialogueSegment, { kind: "music" }>["op"] & ("stop" | "resume"),
  raw: string
): DialogueSegment => ({ kind: "music", op, raw });

const soundSegment = (id: number, raw: string): DialogueSegment => ({ kind: "sound", id, raw });

const musicEffectSegment = (id: number, raw: string): DialogueSegment => ({ kind: "musicEffect", id, raw });

const partyStatSegment = (
  op: Extract<DialogueSegment, { kind: "partyStat" }>["op"],
  char: number,
  amount: number,
  raw: string
): DialogueSegment => ({ kind: "partyStat", op, char, amount, raw });

const inflictSegment = (char: number, status: number, raw: string): DialogueSegment => ({
  kind: "inflict",
  char,
  status,
  raw
});

const learnPsiSegment = (char: number, psi: number, raw: string): DialogueSegment => ({
  kind: "learnPsi",
  char,
  psi,
  raw
});

const eventSegment = (id: number, raw: string): DialogueSegment => ({ kind: "event", id, raw });

function fixedCode(
  opcode: string,
  values: number[],
  toSegment: (bytes: number[], raw: string) => DialogueSegment
): CcsTextCodeRegistryEntry {
  return {
    opcode,
    length: values.length,
    matches: (bytes, offset) => offset + values.length <= bytes.length && signature(...values)(bytes, offset),
    toSegment
  };
}

function prefixCode(
  opcode: string,
  length: number,
  values: number[],
  toSegment: (bytes: number[], raw: string) => DialogueSegment
): CcsTextCodeRegistryEntry {
  return {
    opcode,
    length,
    matches: (bytes, offset) => offset + length <= bytes.length && prefixed(...values)(bytes, offset),
    toSegment
  };
}

// Derived from CoilSnake-master/coilsnake/assets/mobile-sprout/lib/std.ccs.
export const CCS_TEXT_CODE_REGISTRY: CcsTextCodeRegistryEntry[] = [
  fixedCode("13 02", [0x13, 0x02], (_bytes, raw) => controlSegment("end", raw)),
  fixedCode("03 00", [0x03, 0x00], (_bytes, raw) => controlSegment("next", raw)),
  fixedCode("00", [0x00], () => ({ kind: "break", break: "line" })),
  fixedCode("01", [0x01], () => ({ kind: "break", break: "newline" })),
  fixedCode("02", [0x02], (_bytes, raw) => controlSegment("eob", raw)),
  fixedCode("13", [0x13], () => ({ kind: "prompt" })),
  fixedCode("14", [0x14], () => ({ kind: "prompt" })),
  prefixCode("10", 2, [0x10], (bytes) => ({ kind: "pause", frames: bytes[1] })),
  fixedCode("12", [0x12], () => ({ kind: "break", break: "clear" })),
  fixedCode("18 00", [0x18, 0x00], () => windowSegment("closeTop")),
  prefixCode("18 01", 3, [0x18, 0x01], (bytes) => windowSegment("open", [bytes[2]])),
  prefixCode("18 03", 3, [0x18, 0x03], (bytes) => windowSegment("switch", [bytes[2]])),
  fixedCode("18 04", [0x18, 0x04], () => windowSegment("closeAll")),
  fixedCode("18 06", [0x18, 0x06], () => windowSegment("clear")),
  prefixCode("1C 00", 3, [0x1C, 0x00], (bytes) => styleSegment("color", [bytes[2]])),
  prefixCode("1C 01", 3, [0x1C, 0x01], (bytes) => substitutionSegment("stat", [bytes[2]])),
  prefixCode("1C 02", 3, [0x1C, 0x02], (bytes) =>
    substitutionSegment(bytes[2] === 0 ? "playerName" : "partyChar", [bytes[2]])
  ),
  prefixCode("1C 05", 3, [0x1C, 0x05], (bytes) => substitutionSegment("item", [bytes[2]])),
  prefixCode("1C 06", 3, [0x1C, 0x06], (bytes) => substitutionSegment("teleport", [bytes[2]])),
  prefixCode("1C 0A", 6, [0x1C, 0x0A], (bytes) => substitutionSegment("number", [readLittleEndian(bytes.slice(2))])),
  prefixCode("1C 0B", 6, [0x1C, 0x0B], (bytes) => substitutionSegment("money", [readLittleEndian(bytes.slice(2))])),
  fixedCode("1C 0D", [0x1C, 0x0D], () => substitutionSegment("user", [])),
  fixedCode("1C 0E", [0x1C, 0x0E], () => substitutionSegment("target", [])),
  prefixCode("1C 12", 3, [0x1C, 0x12], (bytes) => substitutionSegment("psi", [bytes[2]])),
  prefixCode("19 05", 5, [0x19, 0x05], (bytes, raw) =>
    inflictSegment(bytes[2], readLittleEndian(bytes.slice(3)), raw)
  ),
  prefixCode("1D 00", 4, [0x1D, 0x00], (bytes, raw) => giveSegment(bytes[2], bytes[3], raw)),
  prefixCode("1D 01", 4, [0x1D, 0x01], (bytes, raw) => takeSegment(bytes[2], bytes[3], raw)),
  prefixCode("1D 06", 6, [0x1D, 0x06], (bytes, raw) => atmSegment("deposit", readLittleEndian(bytes.slice(2)), raw)),
  prefixCode("1D 07", 6, [0x1D, 0x07], (bytes, raw) => atmSegment("withdraw", readLittleEndian(bytes.slice(2)), raw)),
  prefixCode("1D 08", 4, [0x1D, 0x08], (bytes, raw) => moneySegment("give", readLittleEndian(bytes.slice(2)), raw)),
  prefixCode("1D 09", 4, [0x1D, 0x09], (bytes, raw) => moneySegment("take", readLittleEndian(bytes.slice(2)), raw)),
  prefixCode("1E 00", 4, [0x1E, 0x00], (bytes, raw) => partyStatSegment("heal_percent", bytes[2], bytes[3], raw)),
  prefixCode("1E 01", 4, [0x1E, 0x01], (bytes, raw) => partyStatSegment("hurt_percent", bytes[2], bytes[3], raw)),
  prefixCode("1E 02", 4, [0x1E, 0x02], (bytes, raw) => partyStatSegment("heal", bytes[2], bytes[3], raw)),
  prefixCode("1E 03", 4, [0x1E, 0x03], (bytes, raw) => partyStatSegment("hurt", bytes[2], bytes[3], raw)),
  prefixCode("1E 04", 4, [0x1E, 0x04], (bytes, raw) =>
    partyStatSegment("recoverpp_percent", bytes[2], bytes[3], raw)
  ),
  prefixCode("1E 05", 4, [0x1E, 0x05], (bytes, raw) =>
    partyStatSegment("consumepp_percent", bytes[2], bytes[3], raw)
  ),
  prefixCode("1E 06", 4, [0x1E, 0x06], (bytes, raw) => partyStatSegment("recoverpp", bytes[2], bytes[3], raw)),
  prefixCode("1E 07", 4, [0x1E, 0x07], (bytes, raw) => partyStatSegment("consumepp", bytes[2], bytes[3], raw)),
  prefixCode("1E 08", 4, [0x1E, 0x08], (bytes, raw) => partyStatSegment("change_level", bytes[2], bytes[3], raw)),
  prefixCode("1E 09", 6, [0x1E, 0x09], (bytes, raw) =>
    partyStatSegment("boost_exp", bytes[2], readLittleEndian(bytes.slice(3)), raw)
  ),
  prefixCode("1E 0A", 4, [0x1E, 0x0A], (bytes, raw) => partyStatSegment("boost_iq", bytes[2], bytes[3], raw)),
  prefixCode("1E 0B", 4, [0x1E, 0x0B], (bytes, raw) => partyStatSegment("boost_guts", bytes[2], bytes[3], raw)),
  prefixCode("1E 0C", 4, [0x1E, 0x0C], (bytes, raw) => partyStatSegment("boost_speed", bytes[2], bytes[3], raw)),
  prefixCode("1E 0D", 4, [0x1E, 0x0D], (bytes, raw) => partyStatSegment("boost_vitality", bytes[2], bytes[3], raw)),
  prefixCode("1E 0E", 4, [0x1E, 0x0E], (bytes, raw) => partyStatSegment("boost_luck", bytes[2], bytes[3], raw)),
  prefixCode("1F 00 00", 4, [0x1F, 0x00, 0x00], (bytes, raw) => musicPlaySegment(bytes[3], raw)),
  fixedCode("1F 01 02", [0x1F, 0x01, 0x02], (_bytes, raw) => musicSimpleSegment("stop", raw)),
  prefixCode("1F 02", 3, [0x1F, 0x02], (bytes, raw) => soundSegment(bytes[2], raw)),
  fixedCode("1F 03", [0x1F, 0x03], (_bytes, raw) => musicSimpleSegment("resume", raw)),
  prefixCode("1F 04", 3, [0x1F, 0x04], (bytes) => styleSegment("blips", [bytes[2]])),
  prefixCode("1F 07", 3, [0x1F, 0x07], (bytes, raw) => musicEffectSegment(bytes[2], raw)),
  prefixCode("1F 11", 3, [0x1F, 0x11], (bytes, raw) => partySegment("add", bytes[2], raw)),
  prefixCode("1F 12", 3, [0x1F, 0x12], (bytes, raw) => partySegment("remove", bytes[2], raw)),
  prefixCode("1F 20", 4, [0x1F, 0x20], (bytes, raw) => teleportSegment(bytes[2], bytes[3], raw)),
  prefixCode("1F 21", 3, [0x1F, 0x21], (bytes, raw) => warpSegment(bytes[2], raw)),
  prefixCode("1F 23", 4, [0x1F, 0x23], (bytes, raw) => battleSegment(readLittleEndian(bytes.slice(2)), raw)),
  fixedCode("1F 30", [0x1F, 0x30], () => fontSegment(EB_TEXT_FONT_IDS.normal, "normal")),
  fixedCode("1F 31", [0x1F, 0x31], () => fontSegment(EB_TEXT_FONT_IDS.saturn, "saturn")),
  prefixCode("1F 41", 3, [0x1F, 0x41], (bytes, raw) => eventSegment(bytes[2], raw)),
  fixedCode("1F 69", [0x1F, 0x69], (_bytes, raw) => anchorWarpSegment(raw)),
  prefixCode("1F 71", 4, [0x1F, 0x71], (bytes, raw) => learnPsiSegment(bytes[2], bytes[3], raw)),
  prefixCode("1F 83", 4, [0x1F, 0x83], (bytes, raw) => shopSegment(readLittleEndian(bytes.slice(2)), raw)),
  prefixCode("04", 3, [0x04], (bytes, raw) => setFlagSegment(readLittleEndian(bytes.slice(1)), raw)),
  prefixCode("05", 3, [0x05], (bytes, raw) => unsetFlagSegment(readLittleEndian(bytes.slice(1)), raw)),
  prefixCode("07", 3, [0x07], (_bytes, raw) => controlSegment("isset", raw)),
  prefixCode("08", 5, [0x08], (_bytes, raw) => controlSegment("call", raw)),
  prefixCode("0A", 5, [0x0A], (_bytes, raw) => controlSegment("goto", raw)),
  prefixCode("0B", 2, [0x0B], (_bytes, raw) => controlSegment("result_is", raw)),
  prefixCode("0C", 2, [0x0C], (_bytes, raw) => controlSegment("result_not", raw)),
  fixedCode("1B 00", [0x1B, 0x00], (_bytes, raw) => controlSegment("store_registers", raw)),
  fixedCode("1B 01", [0x1B, 0x01], (_bytes, raw) => controlSegment("load_registers", raw)),
  prefixCode("1B 02", 6, [0x1B, 0x02], (_bytes, raw) => controlSegment("branch_false", raw)),
  prefixCode("1B 03", 6, [0x1B, 0x03], (_bytes, raw) => controlSegment("branch_true", raw)),
  fixedCode("1B 04", [0x1B, 0x04], (_bytes, raw) => controlSegment("swap", raw)),
  prefixCode("1B", 2, [0x1B], (_bytes, raw) => controlSegment("register", raw))
];

export function tokenizeCcsString(value: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let textStart = 0;
  let index = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      const text = stripCcsTextSentinel(value.slice(textStart, end));
      if (text.length > 0) {
        segments.push({ kind: "text", value: text });
      }
    }
  };

  while (index < value.length) {
    if (value[index] === "[") {
      const close = value.indexOf("]", index + 1);
      if (close >= 0) {
        const raw = value.slice(index, close + 1);
        const branchSegment = branchSegmentForPointerBlock(raw);
        if (branchSegment) {
          flushText(index);
          segments.push(branchSegment);
          index = close + 1;
          textStart = index;
          continue;
        }
        const bytes = parseHexByteBlock(raw);
        if (bytes) {
          flushText(index);
          segments.push(...decodeByteSegments(bytes, raw));
          index = close + 1;
          textStart = index;
          continue;
        }
        const mixedControlSegment = controlSegmentForMixedBracketBlock(raw);
        if (mixedControlSegment) {
          flushText(index);
          segments.push(mixedControlSegment);
          index = close + 1;
          textStart = index;
          continue;
        }
      }
    } else if (value[index] === "{") {
      const close = value.indexOf("}", index + 1);
      if (close >= 0) {
        const raw = value.slice(index, close + 1);
        const segment = segmentForMacro(raw);
        if (segment) {
          flushText(index);
          segments.push(segment);
          index = close + 1;
          textStart = index;
          continue;
        }
      }
    } else if (value[index] === "<") {
      // CoilSnake writes EarthBound "compressed text" (saved-phrase dictionary)
      // references as the decompressed phrase wrapped in angle brackets. The
      // brackets are annotation only — in-game the phrase renders as plain text.
      // Recurse on the inner content so nested {macros} (e.g. {itemname(n)}) still
      // resolve, and drop the delimiters.
      const close = value.indexOf(">", index + 1);
      if (close >= 0) {
        flushText(index);
        segments.push(...tokenizeCcsString(value.slice(index + 1, close)));
        index = close + 1;
        textStart = index;
        continue;
      }
    }
    index += 1;
  }

  flushText(value.length);
  return segments;
}

function stripCcsTextSentinel(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function branchSegmentForPointerBlock(raw: string): DialogueSegment | undefined {
  const match = /^\[1B\s+(0[23])\s+\{e\(([A-Za-z_][\w.-]*)\)\}\]$/iu.exec(raw.trim());
  if (!match) {
    return undefined;
  }
  return controlSegment(match[1].toUpperCase() === "03" ? "branch_true" : "branch_false", raw, match[2]);
}

function controlSegmentForMixedBracketBlock(raw: string): DialogueSegment | undefined {
  const inner = raw.slice(1, -1).trim();
  if (!inner || !/(?:^|\s)[0-9a-f]{2}(?:\s|$)|\{e\(/iu.test(inner)) {
    return undefined;
  }
  return controlSegment("unknown", raw, pointerTargetFromBracketBlock(inner));
}

function pointerTargetFromBracketBlock(inner: string): string | undefined {
  return /\{e\(([A-Za-z_][\w.-]*)\)\}/u.exec(inner)?.[1];
}

function decodeByteSegments(bytes: number[], raw: string): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const entry = CCS_TEXT_CODE_REGISTRY.find((item) => item.matches(bytes, offset));
    if (!entry) {
      segments.push({
        kind: "control",
        code: "unknown",
        raw: offset === 0 ? raw : `[${bytes.slice(offset).map(byte).join(" ")}]`
      });
      break;
    }

    const chunk = bytes.slice(offset, offset + entry.length);
    segments.push(entry.toSegment(chunk, `[${chunk.map(byte).join(" ")}]`));
    offset += entry.length;
  }

  return segments;
}

function parseHexByteBlock(raw: string): number[] | undefined {
  const inner = raw.slice(1, -1).trim();
  if (!inner) {
    return undefined;
  }
  const parts = inner.split(/\s+/);
  if (!parts.every((part) => /^[0-9a-f]{2}$/i.test(part))) {
    return undefined;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

function segmentForMacro(raw: string): DialogueSegment | undefined {
  const match = raw.match(/^\{([A-Za-z_][\w.]*)\s*(?:\((.*)\))?\}$/);
  if (!match) {
    return undefined;
  }
  const name = match[1].toLowerCase();
  const argsText = match[2];
  const args = parseNumericArgs(argsText);

  switch (name) {
    case "linebreak":
      return { kind: "break", break: "line" };
    case "newline":
      return { kind: "break", break: "newline" };
    case "clearline":
      return { kind: "break", break: "clear" };
    case "pause":
      return args ? { kind: "pause", frames: args[0] ?? 0 } : controlSegment(name, raw);
    case "wait":
    case "prompt":
      return { kind: "prompt" };
    case "next":
    case "end":
    case "eob":
      return controlSegment(name, raw);
    case "window_open":
      return args ? windowSegment("open", [args[0] ?? 0]) : controlSegment(name, raw);
    case "window_closetop":
      return windowSegment("closeTop");
    case "window_switch":
      return args ? windowSegment("switch", [args[0] ?? 0]) : controlSegment(name, raw);
    case "window_closeall":
      return windowSegment("closeAll");
    case "window_clear":
      return windowSegment("clear");
    case "text_color":
      return args ? styleSegment("color", [args[0] ?? 0]) : controlSegment(name, raw);
    case "text_blips":
      return args ? styleSegment("blips", [args[0] ?? 0]) : controlSegment(name, raw);
    case "font_normal":
      return fontSegment(EB_TEXT_FONT_IDS.normal, "normal");
    case "font_saturn":
      return fontSegment(EB_TEXT_FONT_IDS.saturn, "saturn");
    case "stat":
      return args ? substitutionSegment("stat", [args[0] ?? 0]) : controlSegment(name, raw);
    case "name":
      return args
        ? substitutionSegment((args[0] ?? 0) === 0 ? "playerName" : "partyChar", [args[0] ?? 0])
        : controlSegment(name, raw);
    case "itemname":
      return args ? substitutionSegment("item", [args[0] ?? 0]) : controlSegment(name, raw);
    case "teleportname":
      return args ? substitutionSegment("teleport", [args[0] ?? 0]) : controlSegment(name, raw);
    case "number":
      return args ? substitutionSegment("number", [args[0] ?? 0]) : controlSegment(name, raw);
    case "money":
      return args ? substitutionSegment("money", [args[0] ?? 0]) : controlSegment(name, raw);
    case "user":
      return substitutionSegment("user", []);
    case "target":
      return substitutionSegment("target", []);
    case "psiname":
      return args ? substitutionSegment("psi", [args[0] ?? 0]) : controlSegment(name, raw);
    case "give":
      return args && args[0] !== undefined && args[1] !== undefined
        ? giveSegment(args[0], args[1], raw)
        : controlSegment(name, raw);
    case "take":
      return args && args[0] !== undefined && args[1] !== undefined
        ? takeSegment(args[0], args[1], raw)
        : controlSegment(name, raw);
    case "givemoney":
      return args && args[0] !== undefined ? moneySegment("give", args[0], raw) : controlSegment(name, raw);
    case "takemoney":
      return args && args[0] !== undefined ? moneySegment("take", args[0], raw) : controlSegment(name, raw);
    case "deposit":
    case "atm_deposit":
      return args && args[0] !== undefined ? atmSegment("deposit", args[0], raw) : controlSegment(name, raw);
    case "withdraw":
    case "atm_withdraw":
      return args && args[0] !== undefined ? atmSegment("withdraw", args[0], raw) : controlSegment(name, raw);
    case "shop":
      return args && args[0] !== undefined ? shopSegment(args[0], raw) : controlSegment(name, raw);
    case "inflict":
      return args && args[0] !== undefined && args[1] !== undefined
        ? inflictSegment(args[0], args[1], raw)
        : controlSegment(name, raw);
    case "heal_percent":
    case "hurt_percent":
    case "heal":
    case "hurt":
    case "recoverpp_percent":
    case "consumepp_percent":
    case "recoverpp":
    case "consumepp":
    case "change_level":
    case "boost_exp":
    case "boost_iq":
    case "boost_guts":
    case "boost_speed":
    case "boost_vitality":
    case "boost_luck":
      return args && args[0] !== undefined && args[1] !== undefined
        ? partyStatSegment(name as Extract<DialogueSegment, { kind: "partyStat" }>["op"], args[0], args[1], raw)
        : controlSegment(name, raw);
    case "sound":
      return args && args[0] !== undefined ? soundSegment(args[0], raw) : controlSegment(name, raw);
    case "music":
      return args && args[0] !== undefined ? musicPlaySegment(args[0], raw) : controlSegment(name, raw);
    case "music_stop":
      return musicSimpleSegment("stop", raw);
    case "music_resume":
      return musicSimpleSegment("resume", raw);
    case "music_effect":
      return args && args[0] !== undefined ? musicEffectSegment(args[0], raw) : controlSegment(name, raw);
    case "battle":
      return args && args[0] !== undefined ? battleSegment(args[0], raw) : controlSegment(name, raw);
    case "warp":
      return args && args[0] !== undefined ? warpSegment(args[0], raw) : controlSegment(name, raw);
    case "teleport":
      return args && args[0] !== undefined && args[1] !== undefined
        ? teleportSegment(args[0], args[1], raw)
        : controlSegment(name, raw);
    case "anchor_warp":
      return anchorWarpSegment(raw);
    case "party_add":
      return args && args[0] !== undefined ? partySegment("add", args[0], raw) : controlSegment(name, raw);
    case "party_remove":
      return args && args[0] !== undefined ? partySegment("remove", args[0], raw) : controlSegment(name, raw);
    case "event":
      return args && args[0] !== undefined ? eventSegment(args[0], raw) : controlSegment(name, raw);
    case "learnpsi":
      return args && args[0] !== undefined && args[1] !== undefined
        ? learnPsiSegment(args[0], args[1], raw)
        : controlSegment(name, raw);
    case "set":
      return args && args[0] !== undefined ? setFlagSegment(args[0], raw) : controlSegment(name, raw);
    case "unset":
      return args && args[0] !== undefined ? unsetFlagSegment(args[0], raw) : controlSegment(name, raw);
    case "isset":
    case "call":
    case "goto":
      return controlSegment(name, raw, parseFlowTarget(argsText));
    case "result_is":
    case "result_not":
    case "hasitem":
    case "branch_true":
    case "branch_false":
    case "store_registers":
    case "load_registers":
    case "swap":
      return controlSegment(name, raw);
    default:
      return controlSegment("unknown_macro", raw);
  }
}

function parseNumericArgs(argsText: string | undefined): number[] | undefined {
  if (!argsText?.trim()) {
    return [];
  }
  const args = argsText.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = args.map(parseNumericLiteral);
  return parsed.every((item): item is number => item !== undefined) ? parsed : undefined;
}

function parseNumericLiteral(value: string): number | undefined {
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(2), 16);
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function readLittleEndian(bytes: number[]): number {
  return bytes.reduce((total, value, index) => total + value * (256 ** index), 0);
}

export async function convertProject(options: Partial<CliArgs> = {}): Promise<ConvertResult> {
  const project = options.project ?? process.env.EB_PROJECT ?? DEFAULT_PROJECT;
  const out = options.out ?? DEFAULT_OUT;
  const worldMode = options.worldMode ?? parseWorldMode(process.env.EB_WORLD_MODE);
  const battleEnabled = options.battle ?? parseBattleMode(process.env.EB_BATTLE);
  const fontEnabled = options.font ?? parseFontMode(process.env.EB_FONT, worldMode);
  const windowEnabled = options.window ?? parseWindowMode(process.env.EB_WINDOW, worldMode);
  const charactersEnabled = options.characters ?? parseCharacterMode(process.env.EB_CHARS);
  const itemsEnabled = options.items ?? parseItemMode(process.env.EB_ITEMS);
  const shopsEnabled = options.shops ?? (parseShopMode(process.env.EB_SHOPS) || itemsEnabled);
  const projectAbs = resolveFromRoot(project);
  const outAbs = resolveFromRoot(out);
  const configuredSpawnWorldPixel = options.spawnWorldPixel ?? (process.env.EB_SPAWN ? parseSpawn(process.env.EB_SPAWN) : undefined);
  const romStartPath = defaultFullWorldRomPath(worldMode, projectAbs, options.romPath ?? process.env.EB_ROM);
  const romStartMetadata = romStartPath ? await readEbRomStartMetadata(resolveFromRoot(romStartPath)) : undefined;
  const romStartWorldPixel = configuredSpawnWorldPixel ? undefined : romStartMetadata?.spawnWorldPixel;
  const spawnWorldPixel = configuredSpawnWorldPixel ?? romStartWorldPixel;
  const spawnWorldPixelDerivation = configuredSpawnWorldPixel
    ? options.spawnWorldPixelDerivation
    : romStartWorldPixel
      ? ROM_NEW_GAME_START_DERIVATION
      : undefined;
  const warnings: ValidationIssue[] = [];
  const errors: ValidationIssue[] = [];
  const generatedAt = await readPreviousGeneratedAt(outAbs) ?? new Date().toISOString();

  await mkdir(outAbs, { recursive: true });
  await clearGeneratedOutput(outAbs);

  const projectExists = existsSync(projectAbs);
  const projectSnakePath = path.join(projectAbs, "Project.snake");
  const hasProjectSnake = projectExists && existsSync(projectSnakePath);
  const detectedFolders = projectExists ? await listDetectedFolders(projectAbs) : [];

  if (!projectExists) {
    warnings.push(issue("warning", "missing_project", "CoilSnake project path is missing.", project));
  } else if (!hasProjectSnake) {
    warnings.push(issue("warning", "missing_project_snake", "Project.snake is missing.", "Project.snake"));
  }

  const scripts = await readScripts(projectAbs, project, projectExists, warnings);
  const newGameStartupRef = scriptReferenceForSnesLabel(scripts, romStartMetadata?.startupTargetSnesAddress);
  const npcs = await readNpcReferences(projectAbs, project, projectExists);
  const spriteGroups = await readSpriteGroups(projectAbs, project, projectExists, warnings);
  const worldBuild = await buildWorldArtifacts({
    projectAbs,
    outAbs,
    displayPath: makeDisplayPath(project),
    projectExists,
    worldMode,
    spawnWorldPixel,
    spawnWorldPixelDerivation,
    newGameStartupRef,
    newGameStartupDerivation: newGameStartupRef ? ROM_NEW_GAME_STARTUP_DERIVATION : undefined
  });
  const world = worldBuild.world;
  const sprites = worldBuild.sprites;
  const referencesRobotHelloWorld = npcs.references.some((reference) => reference.reference === "robot.hello_world");
  const robotFile = scripts.files.find((file) => file.path === "ccscript/robot.ccs");
  const helloWorldIndex = robotFile?.commands.findIndex(
    (command) => command.cmd === "label" && command.name === "hello_world"
  ) ?? -1;
  const hasRobotHelloWorldContent = helloWorldIndex >= 0
    ? robotFile?.commands.slice(helloWorldIndex + 1).some((command) => command.cmd === "text" || isKnownRuntimeCommand(command.cmd)) ?? false
    : false;

  const sourceProject = {
    path: makeDisplayPath(project),
    exists: projectExists,
    hasProjectSnake,
    detectedFolders,
    tutorialFixtureHints: {
      hasRobotCcs: Boolean(robotFile),
      hasHelloWorldLabel: Boolean(robotFile?.labels.includes("hello_world")),
      hasRobotHelloWorldContent,
      hasSpriteGroup005: spriteGroups.images.some((image) => image.path === "SpriteGroups/005.png"),
      npcReferencesRobotHelloWorld: referencesRobotHelloWorld
    }
  };

  if (projectExists && !sourceProject.tutorialFixtureHints.hasRobotCcs) {
    warnings.push(issue("warning", "missing_robot_ccs", "Tutorial robot.ccs is missing.", "ccscript/robot.ccs"));
  }
  if (projectExists && sourceProject.tutorialFixtureHints.hasRobotCcs && !sourceProject.tutorialFixtureHints.hasHelloWorldLabel) {
    warnings.push(issue("warning", "missing_hello_world", "robot.ccs does not contain hello_world label.", "ccscript/robot.ccs"));
  }
  if (projectExists && !sourceProject.tutorialFixtureHints.hasSpriteGroup005) {
    warnings.push(issue("info", "missing_sprite_group_005", "Tutorial SpriteGroups/005.png was not found.", "SpriteGroups/005.png"));
  }
  if (projectExists && !referencesRobotHelloWorld) {
    warnings.push(issue("info", "missing_robot_hello_world_reference", "No text/YML NPC reference to robot.hello_world was found.", "robot.hello_world"));
  }

  const tutorialStatus = await readTutorialStatus(projectAbs, project, projectExists, scripts, npcs, spriteGroups, world);
  const encounterBuild = battleEnabled && worldMode === "full" && "mode" in world && world.mode === "full"
    ? await buildEncounterData({
      projectAbs,
      displayPath: makeDisplayPath(project),
      mapWidthTiles: world.mapWidthTiles,
      mapHeightTiles: world.mapHeightTiles
    })
    : undefined;
  const encounters = encounterBuild?.encounters;
  const battle = battleEnabled
    ? await buildBattleData({
      projectAbs,
      outAbs,
      displayPath: makeDisplayPath(project),
      referencedBattleGroupIds: encounters ? encounterBuild.referencedBattleGroupIds : undefined
    })
    : undefined;
  const font = fontEnabled
    ? await buildFontData({
      projectAbs,
      outAbs
    })
    : undefined;
  const window = windowEnabled
    ? await buildWindowData({
      projectAbs,
      outAbs
    })
    : undefined;
  const characters = charactersEnabled
    ? await buildCharacterData({
      projectAbs,
      displayPath: makeDisplayPath(project)
    })
    : undefined;
  const itemPsi = itemsEnabled
    ? await buildItemPsiData({
      projectAbs,
      displayPath: makeDisplayPath(project)
    })
    : undefined;
  const items = itemPsi?.items;
  const psi = itemPsi?.psi;
  const shops = shopsEnabled
    ? await buildShopData({
      projectAbs,
      displayPath: makeDisplayPath(project)
    })
    : undefined;
  const teleportDestinations = await readTeleportDestinations(projectAbs, projectExists, worldMode);
  const manifestFiles = {
    ...GENERATED_FILES,
    ...(teleportDestinations ? { teleportDestinations: TELEPORT_DESTINATIONS_FILE } : {}),
    ...(encounters ? { encounters: ENCOUNTERS_FILE } : {}),
    ...(battle ? { battle: BATTLE_FILE } : {}),
    ...(font ? { font: FONT_FILE } : {}),
    ...(window ? { window: WINDOW_FILE } : {}),
    ...(characters ? { characters: CHARACTERS_FILE } : {}),
    ...(items ? { items: ITEMS_FILE, psi: PSI_FILE } : {}),
    ...(shops ? { shops: SHOPS_FILE } : {})
  };
  const manifestWarnings = [
    ...warnings,
    ...scripts.warnings,
    ...npcs.warnings,
    ...spriteGroups.warnings,
    ...tutorialStatus.warnings,
    ...world.warnings,
    ...(encounterBuild?.warnings ?? []),
    ...(battle?.warnings ?? []),
    ...(characters?.warnings ?? []),
    ...(items?.warnings ?? []),
    ...(psi?.warnings ?? []),
    ...(shops?.warnings ?? [])
  ];
  const generatedFiles = [
    "manifest.json",
    GENERATED_FILES.scripts,
    GENERATED_FILES.npcs,
    GENERATED_FILES.spriteGroups,
    GENERATED_FILES.tutorialStatus,
    GENERATED_FILES.validationReport,
    GENERATED_FILES.world,
    GENERATED_FILES.sprites,
    ...(teleportDestinations ? [TELEPORT_DESTINATIONS_FILE] : []),
    ...(encounters ? [ENCOUNTERS_FILE] : []),
    ...(battle ? [BATTLE_FILE] : []),
    ...(font ? [FONT_FILE] : []),
    ...(window ? [WINDOW_FILE] : []),
    ...(characters ? [CHARACTERS_FILE] : []),
    ...(items ? [ITEMS_FILE, PSI_FILE] : []),
    ...(shops ? [SHOPS_FILE] : [])
  ];

  const manifest: Manifest = ManifestSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    files: manifestFiles,
    counts: {
      scriptFiles: scripts.counts.files,
      scriptCommands: scripts.counts.commands,
      labels: scripts.counts.labels,
      textCommands: scripts.counts.textCommands,
      unknownCommands: scripts.counts.unknownCommands,
      npcReferences: npcs.counts.references,
      spriteImages: spriteGroups.counts.images,
      worldNpcs: world.counts.npcs,
      spriteSheets: sprites.counts.sheets,
      ...(teleportDestinations ? { teleportDestinations: teleportDestinations.counts.destinations } : {}),
      ...(encounters ? {
        encounterSectors: encounters.counts.sectors,
        encounterEnemyGroups: encounters.counts.enemyGroups
      } : {}),
      ...(battle ? {
        battleEnemies: battle.counts.enemies,
        battleGroups: battle.counts.groups
      } : {}),
      ...(font ? {
        fontSheets: font.fonts.length,
        fontGlyphs: sum(font.fonts, (sheet) => sheet.glyphCount)
      } : {}),
      ...(window ? {
        windowFlavors: window.flavors.length,
        windowLayouts: window.layouts?.length ?? 0
      } : {}),
      ...(characters ? {
        characters: characters.counts.characters,
        characterStatFieldsPopulated: characters.counts.statFieldsPopulated
      } : {}),
      ...(items && psi ? {
        items: items.counts.items,
        equippableItems: items.counts.equippable,
        psi: psi.counts.psi,
        psiLearnedByEntries: psi.counts.learnedBy
      } : {}),
      ...(shops ? {
        shops: shops.counts.shops,
        shopItemEntries: shops.counts.entries
      } : {}),
      warnings: manifestWarnings.length,
      errors: errors.length
    },
    warnings: manifestWarnings,
    errors
  });

  const validationReport: ValidationReport = ValidationReportSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceProject,
    generatedFiles,
    issues: [...manifest.warnings, ...manifest.errors],
    counts: {
      warnings: manifest.warnings.filter((item) => item.severity !== "info").length,
      errors: manifest.errors.length
    }
  });

  await writeJson(path.join(outAbs, "manifest.json"), manifest);
  await writeJson(path.join(outAbs, GENERATED_FILES.scripts), scripts);
  await writeJson(path.join(outAbs, GENERATED_FILES.npcs), npcs);
  await writeJson(path.join(outAbs, GENERATED_FILES.spriteGroups), spriteGroups);
  await writeJson(path.join(outAbs, GENERATED_FILES.tutorialStatus), tutorialStatus);
  await writeJson(path.join(outAbs, GENERATED_FILES.validationReport), validationReport);
  await writeJson(path.join(outAbs, GENERATED_FILES.world), world);
  await writeJson(path.join(outAbs, GENERATED_FILES.sprites), sprites);
  if (teleportDestinations) {
    await writeJson(path.join(outAbs, TELEPORT_DESTINATIONS_FILE), teleportDestinations);
  }
  if (encounters) {
    await writeJson(path.join(outAbs, ENCOUNTERS_FILE), encounters);
  }
  if (battle) {
    await writeJson(path.join(outAbs, BATTLE_FILE), battle);
  }
  if (font) {
    await writeJson(path.join(outAbs, FONT_FILE), font);
  }
  if (window) {
    await writeJson(path.join(outAbs, WINDOW_FILE), window);
  }
  if (characters) {
    await writeJson(path.join(outAbs, CHARACTERS_FILE), characters);
  }
  if (items && psi) {
    await writeJson(path.join(outAbs, ITEMS_FILE), items);
    await writeJson(path.join(outAbs, PSI_FILE), psi);
  }
  if (shops) {
    await writeJson(path.join(outAbs, SHOPS_FILE), shops);
  }

  return {
    manifest,
    scripts,
    npcs,
    spriteGroups,
    tutorialStatus,
    validationReport,
    world,
    sprites,
    ...(teleportDestinations ? { teleportDestinations } : {}),
    ...(encounters ? { encounters } : {}),
    ...(battle ? { battle } : {}),
    ...(font ? { font } : {}),
    ...(window ? { window } : {}),
    ...(characters ? { characters } : {}),
    ...(items ? { items } : {}),
    ...(psi ? { psi } : {}),
    ...(shops ? { shops } : {})
  };
}

async function readTutorialStatus(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  scripts: ScriptCollection,
  npcs: NpcReferenceCollection,
  spriteGroups: SpriteGroupCollection,
  world?: WorldArtifact
): Promise<TutorialStatus> {
  const steps: TutorialStatus["steps"] = [];
  const warnings: ValidationIssue[] = [];
  const addStep = (step: TutorialStatus["steps"][number]) => {
    steps.push(step);
    if (step.status === "fail" || step.status === "blocked") {
      warnings.push(issue(
        step.status === "blocked" ? "warning" : "info",
        `tutorial_${step.id}`,
        step.evidence,
        step.path
      ));
    }
  };

  const robotFile = scripts.files.find((file) => file.path === "ccscript/robot.ccs");
  const robotCommands = robotFile?.commands ?? [];
  const labelIndex = robotCommands.findIndex((command) => command.cmd === "label" && command.name === "hello_world");
  const labelCommands = labelIndex >= 0 ? robotCommands.slice(labelIndex + 1) : [];
  const sprite005 = spriteGroups.images.find((image) => image.path === "SpriteGroups/005.png");
  const npc744 = projectExists ? await readNpcConfigEntry(projectAbs, "744") : undefined;
  const mapNpc744 = projectExists ? await findMapSpriteNpc(projectAbs, "744") : undefined;
  const runProof = projectExists ? await readTutorialRunProof(projectAbs) : undefined;

  addStep({
    id: "project_snake",
    label: "CoilSnake project metadata exists",
    status: projectExists && existsSync(path.join(projectAbs, "Project.snake")) ? "pass" : "fail",
    evidence: projectExists ? "Project.snake was checked in the local fixture." : "Local CoilSnake project is missing.",
    path: "Project.snake"
  });
  addStep({
    id: "robot_ccs",
    label: "robot.ccs exists",
    status: robotFile ? "pass" : "fail",
    evidence: robotFile ? "ccscript/robot.ccs was parsed." : "ccscript/robot.ccs was not found.",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_label",
    label: "hello_world label exists",
    status: labelIndex >= 0 ? "pass" : "fail",
    evidence: labelIndex >= 0 ? "hello_world label was parsed from robot.ccs." : "hello_world label was not parsed.",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_text",
    label: "Hello World dialogue text exists",
    status: labelCommands.some((command) => command.cmd === "text" && command.value === "@Hello World!") ? "pass" : "fail",
    evidence: "Expected imported text command value @Hello World! after robot.hello_world.",
    expected: "@Hello World!",
    actual: labelCommands.find((command) => command.cmd === "text")?.value ?? "missing",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "hello_world_end",
    label: "Dialogue terminates with end or eob",
    status: labelCommands.some((command) => command.cmd === "end" || command.cmd === "eob") ? "pass" : "fail",
    evidence: "Expected robot.hello_world to terminate with end/eob.",
    expected: "end or eob",
    actual: labelCommands.find((command) => command.cmd === "end" || command.cmd === "eob")?.cmd ?? "missing",
    path: "ccscript/robot.ccs"
  });
  addStep({
    id: "sprite_group_005",
    label: "Robot tutorial sprite metadata exists",
    status: sprite005 ? "pass" : "fail",
    evidence: sprite005 ? "SpriteGroups/005.png was indexed as metadata only." : "SpriteGroups/005.png was not indexed.",
    path: "SpriteGroups/005.png"
  });
  addStep({
    id: "scanner_reference",
    label: "Text/YML scanner finds robot.hello_world",
    status: npcs.references.some((reference) => reference.reference === "robot.hello_world") ? "pass" : "fail",
    evidence: "Scanner should find a local text/YML reference to robot.hello_world.",
    expected: "robot.hello_world",
    actual: String(npcs.references.map((reference) => reference.reference).join(", ") || "none"),
    path: "npcs.json"
  });
  addStep({
    id: "npc_744_exists",
    label: "NPC 744 config entry exists",
    status: npc744 ? "pass" : "fail",
    evidence: npc744 ? "npc_config_table.yml contains entry 744." : "npc_config_table.yml entry 744 was not found.",
    path: "npc_config_table.yml"
  });
  addNpcFieldStep(steps, warnings, npc744, "npc_744_sprite", "NPC 744 sprite id", "Sprite", "5");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_movement", "NPC 744 movement id", "Movement", "605");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_event_flag", "NPC 744 event flag", "Event Flag", "0x0");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_appears", "NPC 744 appears always", "Show Sprite", "always");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_dialogue", "NPC 744 dialogue pointer", "Text Pointer 1", "robot.hello_world");
  addNpcFieldStep(steps, warnings, npc744, "npc_744_type", "NPC 744 interaction type", "Type", "person");
  addStep({
    id: "map_sprites_npc_744",
    label: "Map sprites include NPC 744",
    status: mapNpc744 ? "pass" : "unknown",
    evidence: mapNpc744
      ? `map_sprites.yml references NPC 744 at line ${mapNpc744.line}. Bedroom placement is not inferred.`
      : "No map_sprites.yml reference to NPC 744 was found.",
    path: "map_sprites.yml",
    actual: mapNpc744?.raw ?? "missing"
  });
  const worldNpc744 = world?.npcs.find((npc) => npc.npcId === TUTORIAL_NPC_ID);
  const worldNpc744RegionPixel = world && !("mode" in world)
    ? world.npcs.find((npc) => npc.npcId === TUTORIAL_NPC_ID)?.regionPixel
    : undefined;
  const worldNpc744Pixel = worldNpc744RegionPixel
    ? `region pixel ${worldNpc744RegionPixel.x},${worldNpc744RegionPixel.y}`
    : worldNpc744?.worldPixel
      ? `world pixel ${worldNpc744.worldPixel.x},${worldNpc744.worldPixel.y}`
      : "missing";
  addStep({
    id: "world_region_rendered",
    label: "Map region around NPC 744 renders from imported data",
    status: world?.available && worldNpc744 ? "pass" : "fail",
    evidence: world?.available
      ? "world.json includes a rendered region and the tutorial NPC placement."
      : "World region rendering was skipped; see world.json warnings.",
    path: "world.json",
    actual: worldNpc744Pixel
  });
  addStep({
    id: "rom_compile_run",
    label: "Compile and run patched ROM",
    status: runProof?.compileSucceeded && runProof.bootVerified ? "pass" : "blocked",
    evidence: runProof?.compileSucceeded && runProof.bootVerified
      ? "Ignored local ROM output was compiled and boot-verified in an emulator."
      : "ROM compilation and emulator testing require explicit permission and local-only proof.",
    path: "tutorial-run-proof.json",
    actual: runProof?.reviewUrl ?? "local proof only"
  });

  return TutorialStatusSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    sourceTutorialUrl: TUTORIAL_URL,
    steps,
    counts: {
      steps: steps.length,
      passed: steps.filter((step) => step.status === "pass").length,
      failed: steps.filter((step) => step.status === "fail").length,
      blocked: steps.filter((step) => step.status === "blocked").length,
      unknown: steps.filter((step) => step.status === "unknown").length
    },
    warnings
  });
}

function addNpcFieldStep(
  steps: TutorialStatus["steps"],
  warnings: ValidationIssue[],
  npc744: Record<string, string> | undefined,
  id: string,
  label: string,
  field: string,
  expected: string
): void {
  const actual = npc744?.[field] ?? "missing";
  const status = normalizeYamlValue(actual) === normalizeYamlValue(expected) ? "pass" : "fail";
  const step = {
    id,
    label,
    status,
    evidence: `Expected NPC 744 ${field} to match the tutorial value.`,
    path: "npc_config_table.yml",
    expected,
    actual
  } as TutorialStatus["steps"][number];
  steps.push(step);
  if (step.status === "fail") {
    warnings.push(issue("info", `tutorial_${step.id}`, step.evidence, step.path));
  }
}

type TutorialRunProof = {
  compileSucceeded: boolean;
  bootVerified: boolean;
  emulator: string;
  reviewUrl?: string;
};

async function readScripts(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  warnings: ValidationIssue[]
): Promise<ScriptCollection> {
  const ccscriptAbs = path.join(projectAbs, "ccscript");
  if (!projectExists || !existsSync(ccscriptAbs)) {
    if (projectExists) {
      warnings.push(issue("warning", "missing_ccscript", "ccscript directory is missing.", "ccscript"));
    }
    return emptyScripts(projectDisplayPath);
  }

  const ccsFiles = (await walk(ccscriptAbs))
    .filter((file) => file.endsWith(".ccs"))
    .sort();
  const files = [];
  const scriptWarnings: ValidationIssue[] = [];
  for (const fileAbs of ccsFiles) {
    const relativePath = toPosix(path.relative(projectAbs, fileAbs));
    const parsed = parseCcsFile(relativePath, await readFile(fileAbs, "utf8"));
    scriptWarnings.push(...parsed.warnings);
    files.push({
      path: relativePath,
      commands: parsed.commands,
      labels: parsed.labels,
      counts: countCommands(parsed.commands),
      warnings: parsed.warnings
    });
  }

  const collection = {
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    files,
    counts: {
      files: files.length,
      commands: sum(files, (file) => file.counts.commands),
      labels: sum(files, (file) => file.counts.labels),
      textCommands: sum(files, (file) => file.counts.textCommands),
      unknownCommands: sum(files, (file) => file.counts.unknownCommands)
    },
    warnings: scriptWarnings
  };
  return ScriptCollectionSchema.parse(collection);
}

async function readSpriteGroups(
  projectAbs: string,
  projectDisplayPath: string,
  projectExists: boolean,
  warnings: ValidationIssue[]
): Promise<SpriteGroupCollection> {
  const spriteAbs = path.join(projectAbs, "SpriteGroups");
  if (!projectExists || !existsSync(spriteAbs)) {
    if (projectExists) {
      warnings.push(issue("info", "missing_sprite_groups", "SpriteGroups directory is missing.", "SpriteGroups"));
    }
    return emptySpriteGroups(projectDisplayPath);
  }

  const images = [];
  for (const fileAbs of (await walk(spriteAbs)).filter((file) => file.toLowerCase().endsWith(".png")).sort()) {
    const parsed = await readPngSize(fileAbs);
    const basename = path.basename(fileAbs);
    const numericId = basename.match(/^(\d+)\.png$/i);
    images.push({
      path: toPosix(path.relative(projectAbs, fileAbs)),
      id: numericId ? Number(numericId[1]) : undefined,
      extension: ".png",
      ...(parsed ?? {})
    });
  }

  return SpriteGroupCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    images,
    counts: { images: images.length },
    warnings: []
  });
}

async function readTeleportDestinations(
  projectAbs: string,
  projectExists: boolean,
  worldMode: WorldMode
): Promise<TeleportDestinations | undefined> {
  if (worldMode !== "full" || !projectExists) {
    return undefined;
  }
  const file = path.join(projectAbs, "teleport_destination_table.yml");
  if (!existsSync(file)) {
    return undefined;
  }
  const destinations = parseTeleportDestinationTable(await readFile(file, "utf8"));
  return TeleportDestinationsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    units: {
      x: "world-pixels",
      y: "world-pixels"
    },
    destinations,
    counts: {
      destinations: destinations.length
    }
  });
}

export async function readNpcReferences(
  projectAbs: string,
  projectDisplayPath: string = projectAbs,
  projectExists = existsSync(projectAbs)
): Promise<NpcReferenceCollection> {
  if (!projectExists) {
    return emptyNpcReferences(projectDisplayPath);
  }
  const files = (await walk(projectAbs)).filter((file) => {
    const name = path.basename(file).toLowerCase();
    const looksText = name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".txt");
    const looksRelevant = ["npc", "sprite", "event", "hotspot", "placement"].some((part) => name.includes(part));
    return looksText && looksRelevant;
  });

  const references = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    const relativePath = toPosix(path.relative(projectAbs, file));
    const lines = contents.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const referencePattern = /\b([A-Za-z_][\w-]*)\.([A-Za-z_][\w-]*)\b/g;
      for (const match of line.matchAll(referencePattern)) {
        const scriptFileStem = match[1];
        const label = match[2];
        references.push({
          reference: `${scriptFileStem}.${label}`,
          scriptFileStem,
          label,
          sourceLocation: {
            file: relativePath,
            line: lineIndex + 1,
            column: (match.index ?? 0) + 1
          },
          raw: line.trim(),
          contextType: inferContextType(relativePath)
        });
      }
    }
  }

  return NpcReferenceCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    references,
    counts: { references: references.length },
    warnings: []
  });
}

function stripComment(line: string): string {
  let inQuote = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    if (line[index] === '"') {
      inQuote = !inQuote;
    }
    if (!inQuote && line[index] === "/" && line[index + 1] === "/") {
      return line.slice(0, index);
    }
  }
  return line;
}

function scriptCommandFromRaw(raw: string, sourceLocation: ScriptCommand["sourceLocation"]): ScriptCommand {
  const inlineControl = scriptInlineControlFromRaw(raw, sourceLocation);
  if (inlineControl) {
    return inlineControl;
  }
  const commandSegment = executableCommandSegmentFromRaw(raw);
  if (commandSegment) {
    return {
      cmd: "control",
      raw,
      sourceLocation,
      code: commandCodeFromSegment(raw, commandSegment),
      segments: [commandSegment]
    };
  }
  const control = parseControlCommand(raw);
  if (control) {
    return {
      cmd: "control",
      raw,
      sourceLocation,
      code: control.code,
      ...(control.target ? { target: control.target } : {})
    };
  }
  return {
    cmd: normalizeKnownCommand(raw),
    raw,
    sourceLocation
  };
}

function scriptInlineControlFromRaw(
  raw: string,
  sourceLocation: ScriptCommand["sourceLocation"]
): ScriptCommand | undefined {
  const trimmed = raw.trim();
  if (/^if\b/i.test(trimmed)) {
    return { cmd: "control", raw: trimmed, sourceLocation, code: "if" };
  }
  if (/^else\b/i.test(trimmed)) {
    return { cmd: "control", raw: trimmed, sourceLocation, code: "else" };
  }
  if (/^(?:endif|\})$/i.test(trimmed)) {
    return { cmd: "control", raw: trimmed, sourceLocation, code: "endif" };
  }
  return undefined;
}

function executableCommandSegmentFromRaw(raw: string): DialogueSegment | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const segment = segmentForMacro(`{${trimmed}}`);
  return segment && isExecutableCommandSegment(segment) ? segment : undefined;
}

function isExecutableCommandSegment(segment: DialogueSegment): boolean {
  switch (segment.kind) {
    case "pause":
    case "prompt":
    case "setFlag":
    case "unsetFlag":
    case "party":
    case "warp":
    case "teleport":
    case "anchorWarp":
    case "battle":
    case "give":
    case "take":
    case "money":
    case "atm":
    case "shop":
    case "music":
    case "sound":
    case "musicEffect":
    case "partyStat":
    case "inflict":
    case "learnPsi":
    case "event":
      return true;
    default:
      return false;
  }
}

function commandCodeFromSegment(raw: string, segment: DialogueSegment): string {
  const match = /^([A-Za-z_][\w.]*)/.exec(raw.trim());
  if (match) {
    return match[1].toLowerCase();
  }
  if (segment.kind === "setFlag") {
    return "set";
  }
  if (segment.kind === "unsetFlag") {
    return "unset";
  }
  return segment.kind;
}

function parseControlCommand(raw: string): { code: string; target?: string } | undefined {
  const match = raw.trim().match(/^([A-Za-z_][\w.]*)\s*(?:\((.*)\))?$/);
  if (!match) {
    return undefined;
  }
  const code = match[1].toLowerCase();
  if (!isKnownControlCommand(code)) {
    return undefined;
  }
  const target = code === "call" || code === "goto" || code === "branch_true" || code === "branch_false"
    ? parseFlowTarget(match[2])
    : undefined;
  return { code, ...(target ? { target } : {}) };
}

function parseFlowTarget(argsText: string | undefined): string | undefined {
  const target = argsText?.trim();
  return target && /^[A-Za-z_][\w.-]*$/.test(target) ? target : undefined;
}

function isStructuredCommandPart(raw: string): boolean {
  return Boolean(parseInlineControlCommand(raw) || executableCommandSegmentFromRaw(raw) || parseControlCommand(raw))
    || isKnownRuntimeCommand(raw.trim().toLowerCase());
}

function parseInlineControlCommand(raw: string): boolean {
  const trimmed = raw.trim();
  return /^if\b/i.test(trimmed) || /^else\b/i.test(trimmed) || /^(?:endif|\})$/i.test(trimmed);
}

function isKnownControlCommand(cmd: string): boolean {
  return CONTROL_COMMANDS.has(cmd);
}

const CONTROL_COMMANDS = new Set([
  "set",
  "unset",
  "isset",
  "call",
  "goto",
  "result_is",
  "result_not",
  "hasitem",
  "branch_true",
  "branch_false",
  "store_registers",
  "load_registers",
  "swap"
]);

function normalizeKnownCommand(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return isKnownRuntimeCommand(lower) ? lower : "unknown";
}

function isKnownRuntimeCommand(cmd: string): boolean {
  return cmd === "next" || cmd === "end" || cmd === "eob";
}

function addUnknownWarning(command: ScriptCommand | undefined, warnings: ValidationIssue[]): void {
  if (command?.cmd !== "unknown") {
    return;
  }
  warnings.push(issue("warning", "unknown_ccscript_command", `Unknown CCScript command preserved: ${command.raw}`, command.sourceLocation.file));
}

function countCommands(commands: ScriptCommand[]) {
  return {
    commands: commands.length,
    labels: commands.filter((command) => command.cmd === "label").length,
    textCommands: commands.filter((command) => command.cmd === "text").length,
    unknownCommands: commands.filter((command) => command.cmd === "unknown").length
  };
}

async function listDetectedFolders(projectAbs: string): Promise<string[]> {
  const entries = await readdir(projectAbs, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function walk(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name);
    return entry.isDirectory() ? walk(resolved) : [resolved];
  }));
  return files.flat();
}

async function readPngSize(file: string): Promise<{ width: number; height: number } | undefined> {
  const buffer = await readFile(file);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return undefined;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

async function readNpcConfigEntry(projectAbs: string, npcId: string): Promise<Record<string, string> | undefined> {
  const file = path.join(projectAbs, "npc_config_table.yml");
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${npcId}:`);
  if (start < 0) {
    return undefined;
  }

  const entry: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim().endsWith(":")) {
      break;
    }
    const match = line.match(/^\s{2}([^:]+):\s*(.*)$/);
    if (match) {
      entry[match[1].trim()] = match[2].trim();
    }
  }
  return entry;
}

async function findMapSpriteNpc(projectAbs: string, npcId: string): Promise<{ line: number; raw: string } | undefined> {
  const file = path.join(projectAbs, "map_sprites.yml");
  if (!existsSync(file)) {
    return undefined;
  }
  const lines = (await readFile(file, "utf8")).split(/\r?\n/);
  const pattern = new RegExp(`\\bNPC ID:\\s*${escapeRegExp(npcId)}\\b`);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) {
    return undefined;
  }
  return { line: index + 1, raw: lines[index].trim() };
}

async function readTutorialRunProof(projectAbs: string): Promise<TutorialRunProof | undefined> {
  const file = path.join(projectAbs, "tutorial-run-proof.json");
  if (!existsSync(file)) {
    return undefined;
  }
  const parsed = JSON.parse(await readFile(file, "utf8")) as Partial<TutorialRunProof>;
  if (typeof parsed.compileSucceeded !== "boolean" || typeof parsed.bootVerified !== "boolean") {
    return undefined;
  }
  return {
    compileSucceeded: parsed.compileSucceeded,
    bootVerified: parsed.bootVerified,
    emulator: typeof parsed.emulator === "string" ? parsed.emulator : "unknown",
    ...(typeof parsed.reviewUrl === "string" ? { reviewUrl: parsed.reviewUrl } : {})
  };
}

function normalizeYamlValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^(?:0x[0-9a-f]+|\d+)$/.test(normalized)) {
    return `number:${Number.parseInt(normalized, normalized.startsWith("0x") ? 16 : 10)}`;
  }
  return normalized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readPreviousGeneratedAt(outAbs: string): Promise<string | undefined> {
  const file = path.join(outAbs, "manifest.json");
  if (!existsSync(file)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined;
  } catch {
    return undefined;
  }
}

async function clearGeneratedOutput(outAbs: string): Promise<void> {
  const entries = await readdir(outAbs, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (entry.name === ".gitkeep") {
      return;
    }
    await rm(path.join(outAbs, entry.name), { recursive: true, force: true });
  }));
}

function emptyScripts(projectDisplayPath: string): ScriptCollection {
  return ScriptCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    files: [],
    counts: { files: 0, commands: 0, labels: 0, textCommands: 0, unknownCommands: 0 },
    warnings: []
  });
}

function emptySpriteGroups(projectDisplayPath: string): SpriteGroupCollection {
  return SpriteGroupCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    images: [],
    counts: { images: 0 },
    warnings: []
  });
}

function emptyNpcReferences(projectDisplayPath: string): NpcReferenceCollection {
  return NpcReferenceCollectionSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    sourceProjectPath: makeDisplayPath(projectDisplayPath),
    references: [],
    counts: { references: 0 },
    warnings: []
  });
}

function inferContextType(relativePath: string): string {
  const lowerPath = relativePath.toLowerCase();
  if (lowerPath.includes("npc")) {
    return "npc";
  }
  if (lowerPath.includes("sprite")) {
    return "sprite";
  }
  if (lowerPath.includes("event")) {
    return "event";
  }
  return "unknown";
}

function issue(severity: "info" | "warning" | "error", code: string, message: string, issuePath?: string): ValidationIssue {
  return { severity, code, message, ...(issuePath ? { path: makeDisplayPath(issuePath) } : {}) };
}

function makeDisplayPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? `[debug-absolute] ${toPosix(inputPath)}` : toPosix(inputPath);
}

function resolveFromRoot(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.env.INIT_CWD ?? findWorkspaceRoot(process.cwd()), inputPath);
}

function defaultFullWorldRomPath(
  worldMode: WorldMode,
  projectAbs: string,
  configuredRomPath: string | undefined
): string | undefined {
  if (worldMode !== "full") {
    return undefined;
  }
  if (configuredRomPath) {
    return configuredRomPath;
  }
  return projectAbs === resolveFromRoot(DEFAULT_FULL_WORLD_PROJECT) ? DEFAULT_EB_ROM_PATH : undefined;
}

function toPosix(inputPath: string): string {
  return inputPath.split(path.sep).join("/");
}

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function sum<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  convertProject(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        ok: result.manifest.errors.length === 0,
        files: [
          "manifest.json",
          GENERATED_FILES.scripts,
          GENERATED_FILES.npcs,
          GENERATED_FILES.spriteGroups,
          GENERATED_FILES.tutorialStatus,
          GENERATED_FILES.validationReport,
          GENERATED_FILES.world,
          GENERATED_FILES.sprites,
          ...(result.teleportDestinations ? [TELEPORT_DESTINATIONS_FILE] : []),
          ...(result.encounters ? [ENCOUNTERS_FILE] : []),
          ...(result.battle ? [BATTLE_FILE] : []),
          ...(result.font ? [FONT_FILE] : []),
          ...(result.window ? [WINDOW_FILE] : []),
          ...(result.characters ? [CHARACTERS_FILE] : []),
          ...(result.items ? [ITEMS_FILE, PSI_FILE] : []),
          ...(result.shops ? [SHOPS_FILE] : [])
        ],
        counts: result.manifest.counts,
        world: {
          available: result.world.available,
          npcs: result.world.counts.npcs,
          spriteSheets: result.sprites.counts.sheets,
          ...(result.teleportDestinations ? {
            teleportDestinations: result.teleportDestinations.counts.destinations
          } : {}),
          ...(result.encounters ? {
            encounterSectors: result.encounters.counts.sectors,
            encounterEnemyGroups: result.encounters.counts.enemyGroups
          } : {}),
          ...("mode" in result.world && result.world.mode === "full" ? {
            chunks: result.world.counts.chunks,
            chunksWritten: result.world.counts.chunksWritten,
            voidChunks: result.world.counts.voidChunks,
            chunkFiles: result.world.counts.chunkFiles
          } : {})
        },
        ...(result.items && result.psi ? {
          itemPsi: {
            items: result.items.counts.items,
            equippableItems: result.items.counts.equippable,
            psi: result.psi.counts.psi,
            learnedByEntries: result.psi.counts.learnedBy
          }
        } : {}),
        ...(result.shops ? {
          shops: {
            shops: result.shops.counts.shops,
            itemEntries: result.shops.counts.entries
          }
        } : {}),
        ...(result.font ? {
          font: {
            sheets: result.font.fonts.length,
            glyphs: sum(result.font.fonts, (sheet) => sheet.glyphCount),
            primaryFontId: result.font.primaryFontId
          }
        } : {}),
        ...(result.window ? {
          window: {
            flavors: result.window.flavors.length,
            defaultFlavorId: result.window.defaultFlavorId
          }
        } : {}),
        tutorial: result.tutorialStatus.counts,
        warnings: result.manifest.warnings,
        errors: result.manifest.errors
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
