import { describe, expect, it } from "vitest";
import type { FontCollection, FontGlyphSheet } from "@eb/schemas";
import {
  glyphIndexForCodepoint,
  glyphSourceRect,
  layoutBitmapText,
  measureBitmapText,
  measureBitmapTextForFontId,
  measureBitmapTextRuns,
  processFontImageData
} from "../src/bitmapFont";

const widths = Array.from({ length: 128 }, () => 1);
widths[0] = 2;
widths[33] = 6;
widths[34] = 5;

const sheet: FontGlyphSheet = {
  id: 0,
  file: "assets/font/0.png",
  imageWidth: 256,
  imageHeight: 128,
  columns: 16,
  glyphCount: 128,
  cellWidth: 16,
  cellHeight: 16,
  widths
};

const saturnWidths = Array.from({ length: 128 }, () => 1);
saturnWidths[33] = 10;

const saturnSheet: FontGlyphSheet = {
  ...sheet,
  id: 1,
  file: "assets/font/1.png",
  widths: saturnWidths
};

const font: FontCollection = {
  primaryFontId: 0,
  charCodeOffset: 0x20,
  fonts: [sheet]
};

describe("bitmap font mapping", () => {
  it("maps codepoints through the font offset and falls back to space", () => {
    expect(glyphIndexForCodepoint(" ".codePointAt(0)!, font, sheet)).toBe(0);
    expect(glyphIndexForCodepoint("A".codePointAt(0)!, font, sheet)).toBe(33);
    expect(glyphIndexForCodepoint(">".codePointAt(0)!, font, sheet)).toBe(30);
    expect(glyphIndexForCodepoint(0x1f, font, sheet)).toBe(0);
    expect(glyphIndexForCodepoint(0x20 + sheet.glyphCount, font, sheet)).toBe(0);
  });

  it("computes source rectangles from glyph index and sheet geometry", () => {
    expect(glyphSourceRect(33, sheet)).toEqual({
      x: 16,
      y: 32,
      width: 16,
      height: 16
    });
  });

  it("measures proportional widths at integer scale", () => {
    expect(measureBitmapText(font, sheet, "AB", { scale: 2 })).toEqual({
      width: 22,
      height: 32,
      lineCount: 1
    });
    expect(measureBitmapText(font, sheet, "\u0001", { scale: 2 }).width).toBe(4);
  });

  it("measures a requested font id with that sheet's widths", () => {
    const multiFont: FontCollection = {
      ...font,
      fonts: [sheet, saturnSheet]
    };

    expect(measureBitmapTextForFontId(multiFont, 1, "A", { scale: 2 }).width).toBe(20);
  });

  it("measures multi-run text using each run's font sheet", () => {
    const multiFont: FontCollection = {
      ...font,
      fonts: [sheet, saturnSheet]
    };

    expect(measureBitmapTextRuns(multiFont, [
      { text: "A", fontId: 1 },
      { text: "B", fontId: 0 }
    ], { scale: 2 }).width).toBe(30);
  });

  it("lays out newline-separated glyphs without treating line breaks as glyphs", () => {
    const layout = layoutBitmapText(font, sheet, "A\nB", { scale: 1, lineSpacing: 3 });
    expect(layout.width).toBe(6);
    expect(layout.height).toBe(35);
    expect(layout.lineCount).toBe(2);
    expect(layout.glyphs.map((glyph) => [glyph.char, glyph.dx, glyph.dy])).toEqual([
      ["A", 0, 0],
      ["B", 0, 19]
    ]);
  });

  it("allows EB UI text to advance by visual glyph height instead of atlas cell height", () => {
    const layout = layoutBitmapText(font, sheet, "A\nB", { scale: 2, lineHeight: 18 });

    expect(layout.width).toBe(12);
    expect(layout.height).toBe(50);
    expect(layout.glyphs.map((glyph) => [glyph.char, glyph.dx, glyph.dy])).toEqual([
      ["A", 0, 0],
      ["B", 0, 18]
    ]);
  });
});

describe("bitmap font transparency keying", () => {
  it("keys the sampled background to transparent and normalizes glyph pixels to white", () => {
    const imageData = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        10, 20, 30, 255,
        1, 2, 3, 255,
        10, 20, 30, 255,
        4, 5, 6, 255
      ])
    } as ImageData;

    const result = processFontImageData(imageData);

    expect(result.background).toEqual({ r: 10, g: 20, b: 30, a: 255 });
    expect(result.backgroundPixels).toBe(2);
    expect(result.glyphPixels).toBe(2);
    expect(result.firstGlyphPixel).toEqual({ x: 1, y: 0 });
    expect(Array.from(result.imageData.data.slice(0, 8))).toEqual([
      10, 20, 30, 0,
      255, 255, 255, 255
    ]);
    expect(result.verified).toBe(true);
  });
});
