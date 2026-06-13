import { readFile } from "node:fs/promises";
import type { ScriptCollection } from "@eb/schemas";

export type RomStartPixel = { x: number; y: number };
export type RomStartMetadata = {
  spawnWorldPixel: RomStartPixel;
  startupTargetSnesAddress?: number;
};

export const DEFAULT_EB_ROM_PATH = "EarthBound (USA).sfc";
export const EB_ROM_SIZE_BYTES = 3 * 1024 * 1024;

export const NEW_GAME_START_X_SNES_ADDRESS = 0xC1FE9E;
export const NEW_GAME_START_Y_SNES_ADDRESS = 0xC1FE9B;
export const NEW_GAME_STARTUP_ASMPTR_SNES_ADDRESS = 0xC1FEA4;
export const SNES_HIROM_FILE_MASK = 0x3FFFFF;

// CoilSnake-master/coilsnake/assets/mobile-sprout/lib/std.ccs documents
// newgame_location(x, y) as writes to ROM[$C1FE9E] and ROM[$C1FE9B].
export const NEW_GAME_START_X_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_START_X_SNES_ADDRESS);
export const NEW_GAME_START_Y_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_START_Y_SNES_ADDRESS);
// std.ccs newgame_startup emits _asmptr($C1FEA4, target): target low16 at +1
// and bank byte at +6 in the unheadered HiROM file image.
export const NEW_GAME_STARTUP_LOW16_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_STARTUP_ASMPTR_SNES_ADDRESS + 1);
export const NEW_GAME_STARTUP_BANK_FILE_OFFSET = snesHiRomToFileOffset(NEW_GAME_STARTUP_ASMPTR_SNES_ADDRESS + 6);

export const ROM_NEW_GAME_START_DERIVATION =
  "ROM-RE canonical new-game start from std.ccs newgame_location offsets $C1FE9E (X) / $C1FE9B (Y), mapped with unheadered HiROM file=addr&0x3FFFFF.";
export const ROM_NEW_GAME_STARTUP_DERIVATION =
  "ROM-RE canonical new-game startup script pointer from std.ccs newgame_startup _asmptr($C1FEA4): target low16 at file 0x1FEA5 and bank byte at file 0x1FEAA, mapped with unheadered HiROM file=addr&0x3FFFFF.";

export function snesHiRomToFileOffset(snesAddress: number): number {
  if (!Number.isInteger(snesAddress) || snesAddress < 0xC00000 || snesAddress > 0xFFFFFF) {
    throw new Error(`SNES HiROM address must be in banks $C0-$FF: 0x${snesAddress.toString(16)}`);
  }
  return snesAddress & SNES_HIROM_FILE_MASK;
}

export function parseEbNewGameStart(bytes: Uint8Array): RomStartPixel {
  assertReadableShort(bytes, NEW_GAME_START_X_FILE_OFFSET, "new-game start X");
  assertReadableShort(bytes, NEW_GAME_START_Y_FILE_OFFSET, "new-game start Y");
  return {
    x: readUInt16LE(bytes, NEW_GAME_START_X_FILE_OFFSET),
    y: readUInt16LE(bytes, NEW_GAME_START_Y_FILE_OFFSET)
  };
}

export function parseEbNewGameStartupTarget(bytes: Uint8Array): number {
  assertReadableShort(bytes, NEW_GAME_STARTUP_LOW16_FILE_OFFSET, "new-game startup target low16");
  assertReadableByte(bytes, NEW_GAME_STARTUP_BANK_FILE_OFFSET, "new-game startup target bank");
  const low16 = readUInt16LE(bytes, NEW_GAME_STARTUP_LOW16_FILE_OFFSET);
  const bank = bytes[NEW_GAME_STARTUP_BANK_FILE_OFFSET];
  return (bank << 16) | low16;
}

export function scriptReferenceForSnesLabel(
  scripts: ScriptCollection | undefined,
  snesAddress: number | undefined
): string | undefined {
  if (!scripts || snesAddress === undefined || !Number.isInteger(snesAddress) || snesAddress < 0) {
    return undefined;
  }
  const label = `l_0x${snesAddress.toString(16)}`;
  const file = scripts.files.find((scriptFile) => scriptFile.labels.includes(label));
  if (!file) {
    return undefined;
  }
  return `${scriptFileStem(file.path)}.${label}`;
}

export async function readEbNewGameStartFromRom(romPath: string): Promise<RomStartPixel | undefined> {
  const metadata = await readEbRomStartMetadata(romPath);
  return metadata?.spawnWorldPixel;
}

export async function readEbRomStartMetadata(romPath: string): Promise<RomStartMetadata | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(romPath);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  validateUnheaderedEbRom(bytes, romPath);
  return {
    spawnWorldPixel: parseEbNewGameStart(bytes),
    startupTargetSnesAddress: parseEbNewGameStartupTarget(bytes)
  };
}

export function validateUnheaderedEbRom(bytes: Uint8Array, romPath = "ROM"): void {
  if (bytes.length % 1024 !== 0) {
    throw new Error(`${romPath} is not an unheadered ROM image: byte length ${bytes.length} is not divisible by 1024.`);
  }
  if (bytes.length !== EB_ROM_SIZE_BYTES) {
    throw new Error(`${romPath} is not the expected unheadered 3 MiB EarthBound ROM image: byte length ${bytes.length}.`);
  }
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function assertReadableShort(bytes: Uint8Array, offset: number, label: string): void {
  if (offset < 0 || offset + 1 >= bytes.length) {
    throw new Error(`Cannot read ${label}: file offset 0x${offset.toString(16)} is outside the provided bytes.`);
  }
}

function assertReadableByte(bytes: Uint8Array, offset: number, label: string): void {
  if (offset < 0 || offset >= bytes.length) {
    throw new Error(`Cannot read ${label}: file offset 0x${offset.toString(16)} is outside the provided bytes.`);
  }
}

function scriptFileStem(filePath: string): string {
  return filePath.replace(/^ccscript\//, "").replace(/\.ccs$/i, "");
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
