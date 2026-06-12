/**
 * Parser for CoilSnake .fts map tileset files.
 *
 * The format (text, three sections separated by blank lines):
 * 1. 512 minitile pairs. Each pair is two 64-character lines (minitile i and
 *    minitile i^512), one base-32 character per 8x8 pixel (values 0-15),
 *    followed by a blank line.
 * 2. Palette lines: char 0 = map tileset id (base 32), char 1 = map palette
 *    id, then 6 subpalettes x 16 colors x 3 base-32 characters (each color
 *    component is 0-31).
 * 3. 1024 arrangement lines: 16 cells (4x4 minitiles, row-major), each cell
 *    six hex characters: 4 for the SNES BG entry, 2 for the surface flags.
 *
 * This file implements an original TypeScript reader for that format; it does
 * not copy CoilSnake code. Parsed data is only ever written to the gitignored
 * generated output directory.
 */

export const FTS_MINITILE_COUNT = 896;
export const FTS_ARRANGEMENT_COUNT = 1024;
export const FTS_CELLS_PER_ARRANGEMENT = 16;
export const SUBPALETTES_PER_PALETTE = 6;
export const COLORS_PER_SUBPALETTE = 16;

const BASE32 = "0123456789abcdefghijklmnopqrstuv";

export type FtsPalette = {
  mapTileset: number;
  mapPalette: number;
  /** RGBA per color: 6 subpalettes x 16 colors x 4 bytes. */
  colors: Uint8Array;
};

export type FtsTileset = {
  /** 896 minitiles, each 64 pixel values (0-15), row-major 8x8. */
  minitiles: Uint8Array[];
  palettes: FtsPalette[];
  /** 1024x16 SNES BG entries. */
  arrangements: Uint16Array;
  /** 1024x16 surface-flag bytes, aligned with arrangements. */
  collisions: Uint8Array;
};

export type ArrangementCell = {
  minitile: number;
  subpalette: number;
  priority: boolean;
  hFlip: boolean;
  vFlip: boolean;
};

export function decodeArrangementCell(entry: number): ArrangementCell {
  return {
    minitile: entry & 0x3ff,
    // SNES BG palettes 2-7 hold the six map subpalettes.
    subpalette: Math.min(Math.max(((entry >> 10) & 0x7) - 2, 0), SUBPALETTES_PER_PALETTE - 1),
    priority: ((entry >> 13) & 1) === 1,
    hFlip: ((entry >> 14) & 1) === 1,
    vFlip: ((entry >> 15) & 1) === 1
  };
}

export const SURFACE_SOLID_MASK = 0x80;
export const SURFACE_WATER_MASK = 0x20;

export function isSolidSurface(surfaceByte: number): boolean {
  return (surfaceByte & SURFACE_SOLID_MASK) !== 0;
}

/**
 * True when every minitile of the arrangement is entirely pixel value 0 —
 * the black "void" filler between disconnected map rooms. Void tiles carry
 * surface byte 0 in the source data (they are unreachable in the original
 * engine), so the gameplay collision grid marks them solid explicitly.
 */
export function isBlankArrangement(tileset: FtsTileset, arrangementIndex: number): boolean {
  const base = arrangementIndex * FTS_CELLS_PER_ARRANGEMENT;
  for (let cell = 0; cell < FTS_CELLS_PER_ARRANGEMENT; cell += 1) {
    const decoded = decodeArrangementCell(tileset.arrangements[base + cell]);
    const minitile = tileset.minitiles[decoded.minitile];
    if (!minitile) {
      continue;
    }
    for (let pixel = 0; pixel < 64; pixel += 1) {
      if (minitile[pixel] !== 0) {
        return false;
      }
    }
  }
  return true;
}

function base32Value(char: string): number {
  const value = BASE32.indexOf(char.toLowerCase());
  if (value < 0) {
    throw new Error(`fts: invalid base-32 character "${char}"`);
  }
  return value;
}

/** Scales a 5-bit color component (0-31) to 8 bits. */
function scaleComponent(value: number): number {
  return (value << 3) | (value >> 2);
}

function parseMinitileLine(line: string, target: Uint8Array): void {
  if (line.length < 64) {
    throw new Error(`fts: minitile line too short (${line.length})`);
  }
  for (let index = 0; index < 64; index += 1) {
    target[index] = base32Value(line[index]) & 0xf;
  }
}

function parsePaletteLine(line: string): FtsPalette {
  const colorChars = line.slice(2).trimEnd();
  const expected = SUBPALETTES_PER_PALETTE * COLORS_PER_SUBPALETTE * 3;
  if (colorChars.length < expected) {
    throw new Error(`fts: palette line too short (${colorChars.length} < ${expected})`);
  }
  const colors = new Uint8Array(SUBPALETTES_PER_PALETTE * COLORS_PER_SUBPALETTE * 4);
  for (let colorIndex = 0; colorIndex < SUBPALETTES_PER_PALETTE * COLORS_PER_SUBPALETTE; colorIndex += 1) {
    const offset = colorIndex * 3;
    colors[colorIndex * 4] = scaleComponent(base32Value(colorChars[offset]));
    colors[colorIndex * 4 + 1] = scaleComponent(base32Value(colorChars[offset + 1]));
    colors[colorIndex * 4 + 2] = scaleComponent(base32Value(colorChars[offset + 2]));
    colors[colorIndex * 4 + 3] = 255;
  }
  return {
    mapTileset: base32Value(line[0]),
    mapPalette: base32Value(line[1]),
    colors
  };
}

export function parseFts(source: string): FtsTileset {
  const lines = source.split(/\r?\n/);
  let cursor = 0;

  const nextContentLine = (): string => {
    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor += 1;
    }
    if (cursor >= lines.length) {
      throw new Error("fts: unexpected end of file");
    }
    return lines[cursor++];
  };

  const minitiles: Uint8Array[] = Array.from({ length: FTS_MINITILE_COUNT }, () => new Uint8Array(64));
  for (let i = 0; i < 512; i += 1) {
    parseMinitileLine(nextContentLine(), minitiles[i]);
    const mirrored = i ^ 512;
    const second = nextContentLine();
    if (mirrored < FTS_MINITILE_COUNT) {
      parseMinitileLine(second, minitiles[mirrored]);
    }
  }

  // Palette lines: between the minitile and arrangement sections. Arrangement
  // lines are 96 hex characters; palette lines are 290 base-32 characters.
  const palettes: FtsPalette[] = [];
  let pending: string | undefined;
  while (cursor < lines.length) {
    const line = nextContentLine();
    if (line.trimEnd().length === FTS_CELLS_PER_ARRANGEMENT * 6 && /^[0-9a-f]+$/i.test(line.trimEnd())) {
      pending = line;
      break;
    }
    palettes.push(parsePaletteLine(line));
  }

  const arrangements = new Uint16Array(FTS_ARRANGEMENT_COUNT * FTS_CELLS_PER_ARRANGEMENT);
  const collisions = new Uint8Array(FTS_ARRANGEMENT_COUNT * FTS_CELLS_PER_ARRANGEMENT);
  for (let i = 0; i < FTS_ARRANGEMENT_COUNT; i += 1) {
    const line = pending ?? nextContentLine();
    pending = undefined;
    for (let cell = 0; cell < FTS_CELLS_PER_ARRANGEMENT; cell += 1) {
      const offset = cell * 6;
      arrangements[i * FTS_CELLS_PER_ARRANGEMENT + cell] = Number.parseInt(line.slice(offset, offset + 4), 16);
      collisions[i * FTS_CELLS_PER_ARRANGEMENT + cell] = Number.parseInt(line.slice(offset + 4, offset + 6), 16);
    }
  }

  return { minitiles, palettes, arrangements, collisions };
}

/**
 * Draws one 32x32 map tile (a 4x4 minitile arrangement) into an RGBA buffer.
 * When `priorityOnly` is true, only high-priority minitiles are drawn and all
 * other pixels stay transparent (used for the above-sprites foreground layer).
 */
export function drawArrangement(options: {
  tileset: FtsTileset;
  arrangementIndex: number;
  palette: FtsPalette;
  target: Uint8Array;
  targetWidth: number;
  targetX: number;
  targetY: number;
  priorityOnly: boolean;
}): void {
  const { tileset, arrangementIndex, palette, target, targetWidth, targetX, targetY, priorityOnly } = options;
  const base = arrangementIndex * FTS_CELLS_PER_ARRANGEMENT;
  for (let cellY = 0; cellY < 4; cellY += 1) {
    for (let cellX = 0; cellX < 4; cellX += 1) {
      const cell = decodeArrangementCell(tileset.arrangements[base + cellY * 4 + cellX]);
      if (priorityOnly && !cell.priority) {
        continue;
      }
      const minitile = tileset.minitiles[cell.minitile] ?? tileset.minitiles[0];
      for (let py = 0; py < 8; py += 1) {
        const sourceY = cell.vFlip ? 7 - py : py;
        for (let px = 0; px < 8; px += 1) {
          const sourceX = cell.hFlip ? 7 - px : px;
          const pixel = minitile[sourceY * 8 + sourceX];
          if (priorityOnly && pixel === 0) {
            continue; // color 0 stays transparent on the foreground layer
          }
          const colorOffset = (cell.subpalette * COLORS_PER_SUBPALETTE + pixel) * 4;
          const outOffset = ((targetY + cellY * 8 + py) * targetWidth + targetX + cellX * 8 + px) * 4;
          target[outOffset] = palette.colors[colorOffset];
          target[outOffset + 1] = palette.colors[colorOffset + 1];
          target[outOffset + 2] = palette.colors[colorOffset + 2];
          target[outOffset + 3] = 255;
        }
      }
    }
  }
}
