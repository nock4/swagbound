import { encodePngRgba } from "../../eb-converter/src/png";
import type { NormalizedSlice, SlicePaletteEntry, SliceSprite } from "./types";

export const FRAME_WIDTH = 24;
export const FRAME_HEIGHT = 32;
export const SPRITE_COLUMNS = 4;
export const SPRITE_ROWS = 2;
export const SPRITE_FRAMES = SPRITE_COLUMNS * SPRITE_ROWS;

type Rgba = [number, number, number, number];

const TRANSPARENT: Rgba = [0, 0, 0, 0];
const OUTLINE: Rgba = [38, 43, 48, 255];

export function renderWorldBackground(slice: NormalizedSlice): Buffer {
  const width = slice.widthTiles * slice.tileSize;
  const height = slice.heightTiles * slice.tileSize;
  const rgba = new Uint8Array(width * height * 4);

  for (let ty = 0; ty < slice.heightTiles; ty += 1) {
    const row = slice.grid[ty];
    for (let tx = 0; tx < slice.widthTiles; tx += 1) {
      const tile = slice.paletteBySymbol.get(row[tx]);
      if (!tile) {
        continue;
      }
      drawTile(rgba, width, tx * slice.tileSize, ty * slice.tileSize, slice.tileSize, tile, tx, ty);
    }
  }

  return encodePngRgba(width, height, rgba);
}

export function renderTransparentForeground(width: number, height: number): Buffer {
  return encodePngRgba(width, height, new Uint8Array(width * height * 4));
}

export function renderSpriteSheet(sprite: SliceSprite): Buffer {
  const width = FRAME_WIDTH * SPRITE_COLUMNS;
  const height = FRAME_HEIGHT * SPRITE_ROWS;
  const rgba = new Uint8Array(width * height * 4);
  const directions = ["up", "right", "down", "left"] as const;
  for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
    for (let step = 0; step < 2; step += 1) {
      const frame = directionIndex * 2 + step;
      const frameX = frame % SPRITE_COLUMNS;
      const frameY = Math.floor(frame / SPRITE_COLUMNS);
      drawCharacterFrame(
        rgba,
        width,
        frameX * FRAME_WIDTH,
        frameY * FRAME_HEIGHT,
        sprite,
        directions[directionIndex],
        step
      );
    }
  }
  return encodePngRgba(width, height, rgba);
}

function drawTile(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  size: number,
  tile: SlicePaletteEntry,
  tx: number,
  ty: number
): void {
  const base = hex(tile.color);
  const accent = hex(tile.accent ?? tile.color);
  fillRect(rgba, width, x, y, size, size, base);

  if (tile.symbol === "G") {
    for (let i = 0; i < 5; i += 1) {
      const px = x + ((tx * 11 + ty * 7 + i * 9) % (size - 4));
      const py = y + ((tx * 5 + ty * 13 + i * 6) % (size - 4));
      fillRect(rgba, width, px, py, 3, 2, accent);
    }
  } else if (tile.symbol === "F") {
    fillRect(rgba, width, x + 6, y + 7, 3, 3, accent);
    fillRect(rgba, width, x + 20, y + 18, 3, 3, accent);
    fillRect(rgba, width, x + 13, y + 24, 2, 2, accent);
  } else if (tile.symbol === "P") {
    fillRect(rgba, width, x, y + 12, size, 2, accent);
    fillRect(rgba, width, x + 5, y + 23, 5, 2, accent);
    fillRect(rgba, width, x + 19, y + 7, 4, 2, accent);
  } else if (tile.symbol === "T") {
    fillRect(rgba, width, x + 3, y + 3, size - 6, size - 6, accent);
    fillRect(rgba, width, x + 7, y + 7, size - 14, size - 14, base);
    fillRect(rgba, width, x + 12, y + 2, 8, size - 4, accent);
  } else if (tile.symbol === "W") {
    fillRect(rgba, width, x + 2, y + 8, size - 4, 2, accent);
    fillRect(rgba, width, x + 6, y + 18, size - 12, 2, accent);
    fillRect(rgba, width, x + 1, y + 28, size - 2, 1, accent);
  }
}

function drawCharacterFrame(
  rgba: Uint8Array,
  sheetWidth: number,
  x: number,
  y: number,
  sprite: SliceSprite,
  direction: "up" | "right" | "down" | "left",
  step: number
): void {
  const hair = hex(sprite.colors.hair);
  const shirt = hex(sprite.colors.shirt);
  const pants = hex(sprite.colors.pants);
  const accent = hex(sprite.colors.accent);
  const skin = hex(sprite.colors.skin);
  const bob = step === 0 ? 0 : 1;
  const armShift = step === 0 ? -1 : 1;

  fillRect(rgba, sheetWidth, x, y, FRAME_WIDTH, FRAME_HEIGHT, TRANSPARENT);
  fillRect(rgba, sheetWidth, x + 8, y + 4 + bob, 8, 8, OUTLINE);
  fillRect(rgba, sheetWidth, x + 9, y + 5 + bob, 6, 6, skin);
  if (direction === "up") {
    fillRect(rgba, sheetWidth, x + 8, y + 4 + bob, 8, 5, hair);
  } else {
    fillRect(rgba, sheetWidth, x + 8, y + 3 + bob, 8, 4, hair);
  }
  if (direction === "right") {
    fillRect(rgba, sheetWidth, x + 14, y + 7 + bob, 2, 2, OUTLINE);
  } else if (direction === "left") {
    fillRect(rgba, sheetWidth, x + 8, y + 7 + bob, 2, 2, OUTLINE);
  } else if (direction === "down") {
    fillRect(rgba, sheetWidth, x + 10, y + 8 + bob, 1, 1, OUTLINE);
    fillRect(rgba, sheetWidth, x + 13, y + 8 + bob, 1, 1, OUTLINE);
  }

  fillRect(rgba, sheetWidth, x + 7, y + 12 + bob, 10, 10, OUTLINE);
  fillRect(rgba, sheetWidth, x + 8, y + 13 + bob, 8, 8, shirt);
  fillRect(rgba, sheetWidth, x + 10, y + 14 + bob, 4, 2, accent);
  fillRect(rgba, sheetWidth, x + 5 + armShift, y + 14 + bob, 3, 8, skin);
  fillRect(rgba, sheetWidth, x + 16 - armShift, y + 14 + bob, 3, 8, skin);
  fillRect(rgba, sheetWidth, x + 8, y + 22, 4, 7, pants);
  fillRect(rgba, sheetWidth, x + 13, y + 22, 4, 7, pants);
  fillRect(rgba, sheetWidth, x + 7, y + 29, 5, 2, OUTLINE);
  fillRect(rgba, sheetWidth, x + 13, y + 29, 5, 2, OUTLINE);
}

function fillRect(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: Rgba
): void {
  for (let py = Math.max(0, y); py < y + rectHeight; py += 1) {
    for (let px = Math.max(0, x); px < x + rectWidth; px += 1) {
      const offset = (py * width + px) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }
}

function hex(value: string): Rgba {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid color "${value}". Expected #RRGGBB.`);
  }
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff, 255];
}
