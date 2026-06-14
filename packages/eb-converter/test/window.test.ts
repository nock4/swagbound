import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { WindowCollectionSchema, type RgbColor } from "@eb/schemas";
import { crc32 } from "../src/png";
import { convertProject } from "../src/index";
import { validateGeneratedOutput } from "../src/validate";
import {
  WINDOW_CORNER_RECT,
  WINDOW_H_EDGE_RECT,
  WINDOW_MORE_ARROW_RECT,
  WINDOW_TRANSPARENT_KEY,
  WINDOW_V_EDGE_RECT,
  buildWindowData,
  decodeIndexedPng,
  detectWindowFlavor,
  type IndexedPngImage
} from "../src/window";

const FILL_COLOR: RgbColor = { r: 16, g: 24, b: 32 };
const EDGE_COLOR: RgbColor = { r: 240, g: 240, b: 240 };
const SHADOW_COLOR: RgbColor = { r: 8, g: 8, b: 8 };
const INTERIOR_FILL_RECT = { x: 16, y: 0, w: 8, h: 8 };
const FLAVOR_FILL_COLORS: RgbColor[] = Array.from({ length: 7 }, (_, id) => ({
  r: FILL_COLOR.r + id * 20,
  g: FILL_COLOR.g + id * 14,
  b: FILL_COLOR.b + id * 9
}));

describe("window extraction", () => {
  it("emits confirmed corner/edge rect constants from a synthetic keyed sheet", () => {
    const image = syntheticWindowSheet();
    const flavor = detectWindowFlavor({
      id: 0,
      file: "assets/window/0.png",
      image
    });

    expect(flavor.corner).toEqual(WINDOW_CORNER_RECT);
    expect(flavor.hEdge).toEqual(WINDOW_H_EDGE_RECT);
    expect(flavor.vEdge).toEqual(WINDOW_V_EDGE_RECT);
    expect(flavor.moreArrow).toEqual(WINDOW_MORE_ARROW_RECT);
    expect(flavor.interiorColor).toEqual(FILL_COLOR);
    expect(flavor.detectionNotes).toBeUndefined();
  });

  it("copies synthetic window sheets and emits schema-valid metadata", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-window-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeWindowFixture(project);

      const window = await buildWindowData({
        projectAbs: project,
        outAbs: out
      });
      const roundTrip = WindowCollectionSchema.parse(JSON.parse(JSON.stringify(window)));

      expect(roundTrip.defaultFlavorId).toBe(0);
      expect(roundTrip.transparentKey).toEqual(WINDOW_TRANSPARENT_KEY);
      expect(roundTrip.flavors).toHaveLength(7);
      expect(new Set(roundTrip.flavors.map((flavor) => colorKey(flavor.interiorColor))).size).toBe(7);
      expect(roundTrip.flavors[0]).toEqual({
        id: 0,
        file: "assets/window/0.png",
        corner: WINDOW_CORNER_RECT,
        hEdge: WINDOW_H_EDGE_RECT,
        vEdge: WINDOW_V_EDGE_RECT,
        moreArrow: WINDOW_MORE_ARROW_RECT,
        interiorColor: FILL_COLOR
      });
      expect(decodeIndexedPng(await readFile(path.join(out, "assets/window/0.png")))).toMatchObject({
        width: 64,
        height: 16,
        bitDepth: 8,
        colorType: 3
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("emits no window collection when WindowGraphics is absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-window-absent-"));
    try {
      const window = await buildWindowData({
        projectAbs: path.join(temp, "project"),
        outAbs: path.join(temp, "generated")
      });

      expect(window).toBeUndefined();
      expect(existsSync(path.join(temp, "generated/window.json"))).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("wires window.json through converter manifest and generated validation", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-window-convert-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await mkdir(project, { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeWindowFixture(project);

      const generated = await convertProject({ project, out, window: true });
      const validation = await validateGeneratedOutput(out);

      expect(generated.window?.flavors).toHaveLength(7);
      expect(new Set(generated.window?.flavors.map((flavor) => colorKey(flavor.interiorColor))).size).toBe(7);
      expect(generated.manifest.files.window).toBe("window.json");
      expect(generated.manifest.counts.windowFlavors).toBe(7);
      expect(existsSync(path.join(out, "window.json"))).toBe(true);
      expect(existsSync(path.join(out, "assets/window/0.png"))).toBe(true);
      expect(validation.generatedFiles).toContain("window.json");
      expect(validation.windowFlavors).toBe(7);
      expect(validation.windowAssetsChecked).toBe(7);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

async function writeWindowFixture(project: string): Promise<void> {
  await mkdir(path.join(project, "WindowGraphics"), { recursive: true });
  for (let id = 0; id < 7; id += 1) {
    const png = encodeIndexedPng(syntheticWindowSheet(FLAVOR_FILL_COLORS[id] ?? FILL_COLOR));
    await writeFile(path.join(project, "WindowGraphics", `Windows1_${id}.png`), png);
  }
}

function syntheticWindowSheet(fillColor: RgbColor = FILL_COLOR): IndexedPngImage {
  const width = 64;
  const height = 16;
  const pixels = new Uint8Array(width * height);
  pixels.fill(2);
  fillRect(pixels, width, INTERIOR_FILL_RECT, 1);
  fillRect(pixels, width, WINDOW_CORNER_RECT, 1);
  fillRect(pixels, width, WINDOW_H_EDGE_RECT, 2);
  fillRect(pixels, width, WINDOW_V_EDGE_RECT, 2);
  fillRect(pixels, width, WINDOW_MORE_ARROW_RECT, 2);
  pixels[WINDOW_CORNER_RECT.y * width + WINDOW_CORNER_RECT.x] = 0;
  pixels[WINDOW_CORNER_RECT.y * width + WINDOW_CORNER_RECT.x + 1] = 0;
  pixels[(WINDOW_CORNER_RECT.y + 1) * width + WINDOW_CORNER_RECT.x] = 0;
  pixels[(WINDOW_CORNER_RECT.y + 2) * width + WINDOW_CORNER_RECT.x + 2] = 3;
  pixels[(WINDOW_CORNER_RECT.y + 3) * width + WINDOW_CORNER_RECT.x + 1] = 3;
  return {
    width,
    height,
    bitDepth: 8,
    colorType: 3,
    palette: [WINDOW_TRANSPARENT_KEY, fillColor, EDGE_COLOR, SHADOW_COLOR],
    pixels
  };
}

function fillRect(pixels: Uint8Array, width: number, rect: { x: number; y: number; w: number; h: number }, value: number): void {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      pixels[y * width + x] = value;
    }
  }
}

function encodeIndexedPng(image: IndexedPngImage): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const plte = Buffer.alloc(image.palette.length * 3);
  image.palette.forEach((color, index) => {
    plte[index * 3] = color.r;
    plte[index * 3 + 1] = color.g;
    plte[index * 3 + 2] = color.b;
  });

  const raw = Buffer.alloc((image.width + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (image.width + 1)] = 0;
    raw.set(image.pixels.subarray(y * image.width, (y + 1) * image.width), y * (image.width + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", plte),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function colorKey(color: RgbColor): string {
  return `${color.r},${color.g},${color.b}`;
}
