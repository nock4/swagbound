import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import {
  WindowCollectionSchema,
  type RgbColor,
  type WindowCollection,
  type WindowFlavor,
  type WindowRect
} from "@eb/schemas";

export const WINDOW_FILE = "window.json";
export const WINDOW_ASSET_DIR = "assets/window";
export const DEFAULT_WINDOW_FLAVOR_ID = 0;
export const WINDOW_FLAVOR_IDS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WINDOW_TRANSPARENT_KEY: RgbColor = { r: 0, g: 224, b: 112 };
export const WINDOW_CORNER_RECT: WindowRect = { x: 32, y: 0, w: 8, h: 8 };
export const WINDOW_H_EDGE_RECT: WindowRect = { x: 40, y: 0, w: 8, h: 8 };
export const WINDOW_V_EDGE_RECT: WindowRect = { x: 48, y: 0, w: 8, h: 8 };
export const WINDOW_MORE_ARROW_RECT: WindowRect = { x: 32, y: 8, w: 8, h: 8 };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type IndexedPngImage = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  palette: RgbColor[];
  pixels: Uint8Array;
};

type WindowBuildOptions = {
  projectAbs: string;
  outAbs: string;
};

type WindowCopy = {
  source: string;
  destination: string;
};

export async function buildWindowData(options: WindowBuildOptions): Promise<WindowCollection | undefined> {
  const windowsDir = path.join(options.projectAbs, "WindowGraphics");
  if (!existsSync(windowsDir)) {
    return undefined;
  }

  const flavors: WindowFlavor[] = [];
  const copies: WindowCopy[] = [];
  for (const id of WINDOW_FLAVOR_IDS) {
    const sourcePng = path.join(windowsDir, `Windows1_${id}.png`);
    if (!existsSync(sourcePng)) {
      continue;
    }

    const file = `${WINDOW_ASSET_DIR}/${id}.png`;
    const image = decodeIndexedPng(await readFile(sourcePng), `Windows1_${id}.png`);
    flavors.push(detectWindowFlavor({
      id,
      file,
      image
    }));
    copies.push({
      source: sourcePng,
      destination: path.join(options.outAbs, file)
    });
  }

  if (!flavors.some((flavor) => flavor.id === DEFAULT_WINDOW_FLAVOR_ID)) {
    return undefined;
  }

  await mkdir(path.join(options.outAbs, WINDOW_ASSET_DIR), { recursive: true });
  await Promise.all(copies.map((copy) => copyFile(copy.source, copy.destination)));

  return WindowCollectionSchema.parse({
    defaultFlavorId: DEFAULT_WINDOW_FLAVOR_ID,
    transparentKey: WINDOW_TRANSPARENT_KEY,
    flavors
  });
}

export function decodeIndexedPng(bytes: Uint8Array, label = "indexed PNG"): IndexedPngImage {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.length < PNG_SIGNATURE.length || !view.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${label} is not a PNG file.`);
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compression = 0;
  let filterMethod = 0;
  let interlace = 0;
  let sawTrns = false;
  const palette: RgbColor[] = [];
  const idatChunks: Buffer[] = [];

  while (offset < view.length) {
    if (offset + 8 > view.length) {
      throw new Error(`${label} has a truncated PNG chunk.`);
    }
    const length = view.readUInt32BE(offset);
    const type = view.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > view.length) {
      throw new Error(`${label} has a truncated ${type} chunk.`);
    }
    const data = view.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === "PLTE") {
      if (data.length % 3 !== 0) {
        throw new Error(`${label} has an invalid PLTE chunk.`);
      }
      for (let index = 0; index < data.length; index += 3) {
        palette.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
      }
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "tRNS") {
      sawTrns = true;
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0) {
    throw new Error(`${label} is missing a valid IHDR chunk.`);
  }
  if (bitDepth !== 8 || colorType !== 3) {
    throw new Error(`${label} must be an 8-bit indexed PNG.`);
  }
  if (compression !== 0 || filterMethod !== 0 || interlace !== 0) {
    throw new Error(`${label} uses unsupported PNG encoding options.`);
  }
  if (sawTrns) {
    throw new Error(`${label} must not use PNG tRNS transparency.`);
  }
  if (palette.length === 0 || idatChunks.length === 0) {
    throw new Error(`${label} is missing PLTE or IDAT data.`);
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = width;
  const expectedMin = (stride + 1) * height;
  if (inflated.length < expectedMin) {
    throw new Error(`${label} has truncated image data.`);
  }

  const pixels = new Uint8Array(width * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < width; x += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = x > 0 ? pixels[y * width + x - 1] : 0;
      const up = y > 0 ? pixels[(y - 1) * width + x] : 0;
      const upLeft = x > 0 && y > 0 ? pixels[(y - 1) * width + x - 1] : 0;
      pixels[y * width + x] = unfilterByte(filter, raw, left, up, upLeft);
    }
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    palette,
    pixels
  };
}

export function detectWindowFlavor(input: {
  id: number;
  file: string;
  image: IndexedPngImage;
}): WindowFlavor {
  for (const rect of [WINDOW_CORNER_RECT, WINDOW_H_EDGE_RECT, WINDOW_V_EDGE_RECT, WINDOW_MORE_ARROW_RECT]) {
    assertRectWithin(input.image, rect);
  }

  let exteriorKey = WINDOW_TRANSPARENT_KEY;
  const detectionNotes: Record<string, string> = {};
  if (!rectContainsColor(input.image, WINDOW_CORNER_RECT, WINDOW_TRANSPARENT_KEY)) {
    exteriorKey = colorAt(input.image, WINDOW_CORNER_RECT.x, WINDOW_CORNER_RECT.y);
    detectionNotes.transparentKey = "Corner tile did not contain collection transparentKey; exterior key sampled from the corner tile top-left pixel.";
  }
  if (!rectContainsColor(input.image, WINDOW_CORNER_RECT, exteriorKey)) {
    throw new Error(`Windows1_${input.id}.png corner tile does not contain an exterior key color.`);
  }

  const interiorColor = sampleInteriorColor(input.image, exteriorKey);
  if (sameColor(interiorColor, exteriorKey)) {
    throw new Error(`Windows1_${input.id}.png sampled window interior color matches the transparent key.`);
  }

  const flavor: WindowFlavor = {
    id: input.id,
    file: input.file,
    corner: WINDOW_CORNER_RECT,
    hEdge: WINDOW_H_EDGE_RECT,
    vEdge: WINDOW_V_EDGE_RECT,
    moreArrow: WINDOW_MORE_ARROW_RECT,
    interiorColor
  };
  if (Object.keys(detectionNotes).length > 0) {
    flavor.detectionNotes = detectionNotes;
  }
  return flavor;
}

function unfilterByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  return pb <= pc ? up : upLeft;
}

function colorAt(image: IndexedPngImage, x: number, y: number): RgbColor {
  const paletteIndex = image.pixels[y * image.width + x];
  const color = image.palette[paletteIndex];
  if (!color) {
    throw new Error(`Window PNG pixel references missing palette index ${paletteIndex}.`);
  }
  return color;
}

function rectContainsColor(image: IndexedPngImage, rect: WindowRect, expected: RgbColor): boolean {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (sameColor(colorAt(image, x, y), expected)) {
        return true;
      }
    }
  }
  return false;
}

function sampleInteriorColor(image: IndexedPngImage, exteriorKey: RgbColor): RgbColor {
  const candidates = new Map<string, RgbColor>();
  for (let y = WINDOW_CORNER_RECT.y; y < WINDOW_CORNER_RECT.y + WINDOW_CORNER_RECT.h; y += 1) {
    for (let x = WINDOW_CORNER_RECT.x; x < WINDOW_CORNER_RECT.x + WINDOW_CORNER_RECT.w; x += 1) {
      const color = colorAt(image, x, y);
      if (!sameColor(color, exteriorKey)) {
        candidates.set(colorKey(color), color);
      }
    }
  }

  const sorted = [...candidates.values()].sort((a, b) => colorBrightness(a) - colorBrightness(b));
  if (!sorted[0]) {
    throw new Error("Window corner tile does not contain a non-key interior color.");
  }
  return sorted[0];
}

function sameColor(left: RgbColor, right: RgbColor): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b;
}

function colorKey(color: RgbColor): string {
  return `${color.r},${color.g},${color.b}`;
}

function colorBrightness(color: RgbColor): number {
  return color.r + color.g + color.b;
}

function assertRectWithin(image: IndexedPngImage, rect: WindowRect): void {
  if (!rectWithin(image, rect)) {
    throw new Error(`Detected window rect escapes source image: ${JSON.stringify(rect)}`);
  }
}

function rectWithin(image: IndexedPngImage, rect: WindowRect): boolean {
  return rect.x >= 0 &&
    rect.y >= 0 &&
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x + rect.w <= image.width &&
    rect.y + rect.h <= image.height;
}
