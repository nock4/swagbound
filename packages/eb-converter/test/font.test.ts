import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FontCollectionSchema } from "@eb/schemas";
import { convertProject } from "../src/index";
import { validateGeneratedOutput } from "../src/validate";
import {
  buildFontData,
  deriveFontGeometry,
  parseFontWidths,
  readPngDimensions
} from "../src/font";

describe("font extraction", () => {
  it("parses width YAML and derives grid geometry", () => {
    expect(parseFontWidths([
      "0: 2",
      "1: 0x03",
      "2: $04 # inline comment",
      ""
    ].join("\n"))).toEqual([2, 3, 4]);

    expect(deriveFontGeometry({
      imageWidth: 48,
      imageHeight: 16,
      columns: 16,
      glyphCount: 3
    })).toEqual({
      columns: 16,
      glyphCount: 3,
      cellWidth: 3,
      cellHeight: 16
    });
  });

  it("copies a synthetic primary font sheet and emits schema-valid metadata", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-font-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await writeFontFixture(project);

      const font = await buildFontData({
        projectAbs: project,
        outAbs: out
      });
      const roundTrip = FontCollectionSchema.parse(JSON.parse(JSON.stringify(font)));

      expect(roundTrip).toMatchObject({
        primaryFontId: 0,
        charCodeOffset: 32,
        fonts: [{
          id: 0,
          file: "assets/font/0.png",
          imageWidth: 48,
          imageHeight: 16,
          columns: 16,
          glyphCount: 3,
          cellWidth: 3,
          cellHeight: 16,
          widths: [2, 3, 4]
        }]
      });
      expect(readPngDimensions(await readFile(path.join(out, "assets/font/0.png")))).toEqual({
        imageWidth: 48,
        imageHeight: 16
      });
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("emits no font collection when Fonts is absent", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-font-absent-"));
    try {
      const font = await buildFontData({
        projectAbs: path.join(temp, "project"),
        outAbs: path.join(temp, "generated")
      });

      expect(font).toBeUndefined();
      expect(existsSync(path.join(temp, "generated/font.json"))).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("wires font.json through converter manifest and generated validation", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "eb-font-convert-"));
    try {
      const project = path.join(temp, "project");
      const out = path.join(temp, "generated");
      await mkdir(project, { recursive: true });
      await writeFile(path.join(project, "Project.snake"), "CoilSnakeVersion: 4\n", "utf8");
      await writeFontFixture(project);

      const generated = await convertProject({ project, out, font: true });
      const validation = await validateGeneratedOutput(out);

      expect(generated.font?.fonts).toHaveLength(1);
      expect(generated.manifest.files.font).toBe("font.json");
      expect(generated.manifest.counts.fontSheets).toBe(1);
      expect(generated.manifest.counts.fontGlyphs).toBe(3);
      expect(existsSync(path.join(out, "font.json"))).toBe(true);
      expect(existsSync(path.join(out, "assets/font/0.png"))).toBe(true);
      expect(validation.generatedFiles).toContain("font.json");
      expect(validation.fontSheets).toBe(1);
      expect(validation.fontGlyphs).toBe(3);
      expect(validation.fontAssetsChecked).toBe(1);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});

async function writeFontFixture(project: string): Promise<void> {
  await mkdir(path.join(project, "Fonts"), { recursive: true });
  await writeFile(path.join(project, "Fonts", "0.png"), syntheticPngHeader(48, 16));
  await writeFile(path.join(project, "Fonts", "0_widths.yml"), [
    "0: 2",
    "1: 3",
    "2: 4",
    ""
  ].join("\n"), "utf8");
}

function syntheticPngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
