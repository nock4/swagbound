import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  FontCollectionSchema,
  type FontCollection,
  type FontGlyphSheet
} from "@eb/schemas";
import { parseYamlInteger } from "./coilsnakeYaml";

export const FONT_FILE = "font.json";
export const FONT_ASSET_DIR = "assets/font";
export const FONT_COLUMNS = 16;
export const FONT_CHAR_CODE_OFFSET = 0x20;
const PRIMARY_FONT_ID = 0;
const FONT_IDS = [0, 1, 2, 3, 4] as const;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type FontBuildOptions = {
  projectAbs: string;
  outAbs: string;
};

type FontGeometryInput = {
  imageWidth: number;
  imageHeight: number;
  columns: number;
  glyphCount: number;
};

type FontCopy = {
  source: string;
  destination: string;
};

export async function buildFontData(options: FontBuildOptions): Promise<FontCollection | undefined> {
  const fontsDir = path.join(options.projectAbs, "Fonts");
  if (!existsSync(fontsDir)) {
    return undefined;
  }

  const fonts: FontGlyphSheet[] = [];
  const copies: FontCopy[] = [];
  for (const id of FONT_IDS) {
    const sourcePng = path.join(fontsDir, `${id}.png`);
    const widthsPath = path.join(fontsDir, `${id}_widths.yml`);
    if (!existsSync(sourcePng) || !existsSync(widthsPath)) {
      continue;
    }

    const { imageWidth, imageHeight } = readPngDimensions(await readFile(sourcePng));
    const widths = parseFontWidths(await readFile(widthsPath, "utf8"));
    const geometry = deriveFontGeometry({
      imageWidth,
      imageHeight,
      columns: FONT_COLUMNS,
      glyphCount: widths.length
    });
    const file = `${FONT_ASSET_DIR}/${id}.png`;
    fonts.push({
      id,
      file,
      imageWidth,
      imageHeight,
      ...geometry,
      widths
    });
    copies.push({
      source: sourcePng,
      destination: path.join(options.outAbs, file)
    });
  }

  if (!fonts.some((font) => font.id === PRIMARY_FONT_ID)) {
    return undefined;
  }

  await mkdir(path.join(options.outAbs, FONT_ASSET_DIR), { recursive: true });
  await Promise.all(copies.map((copy) => copyFile(copy.source, copy.destination)));

  return FontCollectionSchema.parse({
    primaryFontId: PRIMARY_FONT_ID,
    charCodeOffset: FONT_CHAR_CODE_OFFSET,
    fonts
  });
}

export function parseFontWidths(source: string): number[] {
  const widthsByIndex = new Map<number, number>();
  for (const line of source.split(/\r?\n/)) {
    const withoutComment = line.replace(/\s+#.*$/, "");
    const match = /^\s*(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+):\s*(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|\d+)\s*$/.exec(withoutComment);
    if (!match) {
      continue;
    }
    const index = parseYamlInteger(match[1]);
    const width = parseYamlInteger(match[2]);
    if (!Number.isInteger(index) || index < 0 || !Number.isInteger(width) || width < 0) {
      throw new Error(`Invalid font width entry: ${line}`);
    }
    widthsByIndex.set(index, width);
  }

  if (widthsByIndex.size === 0) {
    return [];
  }

  const glyphCount = Math.max(...widthsByIndex.keys()) + 1;
  const widths: number[] = [];
  for (let index = 0; index < glyphCount; index += 1) {
    const width = widthsByIndex.get(index);
    if (width === undefined) {
      throw new Error(`Missing font width entry ${index}.`);
    }
    widths.push(width);
  }
  return widths;
}

export function deriveFontGeometry(input: FontGeometryInput): {
  columns: number;
  glyphCount: number;
  cellWidth: number;
  cellHeight: number;
} {
  if (!Number.isInteger(input.columns) || input.columns <= 0) {
    throw new Error(`Invalid font column count ${input.columns}.`);
  }
  if (!Number.isInteger(input.glyphCount) || input.glyphCount <= 0) {
    throw new Error(`Invalid font glyph count ${input.glyphCount}.`);
  }
  const rows = Math.ceil(input.glyphCount / input.columns);
  if (input.imageWidth % input.columns !== 0) {
    throw new Error(`Font image width ${input.imageWidth} is not divisible by ${input.columns} columns.`);
  }
  if (input.imageHeight % rows !== 0) {
    throw new Error(`Font image height ${input.imageHeight} is not divisible by ${rows} rows.`);
  }
  return {
    columns: input.columns,
    glyphCount: input.glyphCount,
    cellWidth: input.imageWidth / input.columns,
    cellHeight: input.imageHeight / rows
  };
}

export function readPngDimensions(bytes: Buffer): { imageWidth: number; imageHeight: number } {
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Font sheet is not a PNG file.");
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Font sheet PNG is missing an IHDR chunk.");
  }
  return {
    imageWidth: bytes.readUInt32BE(16),
    imageHeight: bytes.readUInt32BE(20)
  };
}
