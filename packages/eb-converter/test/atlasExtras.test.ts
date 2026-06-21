import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractExtraAtlas } from "../../../scripts/atlas/extract-extras";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "swagbound-extra-atlas-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("extra atlas extractor", () => {
  it("joins battle backgrounds to enemy groups and Swagbound overrides", async () => {
    const outDir = await makeTempDir();
    const atlas = await extractExtraAtlas({
      atlasContentDirRelative: path.join(outDir, "content"),
      atlasPublicDirRelative: path.join(outDir, "public")
    });

    const background262 = atlas.backgrounds.backgrounds.find((background) => background.bgId === 262);
    expect(background262).toMatchObject({
      bgId: 262,
      image: "../generated/assets/battle/backgrounds/262.png",
      used: true,
      override: "buzzword-shotgun-001"
    });
    expect(background262?.usedByEnemyGroups).toContain(1);
    expect(background262?.usedByEnemyGroups.length).toBeGreaterThan(0);

    const copiedUnused = atlas.backgrounds.backgrounds.find((background) =>
      !background.used && background.image.startsWith("atlas/backgrounds/")
    );
    expect(copiedUnused).toBeDefined();
    await expect(readFile(path.join(outDir, "public", copiedUnused?.image.replace(/^atlas\//, "") ?? ""))).resolves.toBeInstanceOf(Buffer);

    const primaryFont = atlas.ui.fonts.find((font) => font.fontId === 0);
    expect(primaryFont).toMatchObject({
      fontId: 0,
      glyphCount: 128,
      sampleGlyphWidths: [2, 2, 3, 2, 5, 9, 7, 2, 3, 3, 3, 5, 2, 2, 2, 4]
    });

    expect(atlas.backgrounds.counts.used).toBe(200);
    expect(atlas.ui.counts.fonts).toBeGreaterThanOrEqual(5);
    expect(atlas.townmaps.counts.maps).toBeGreaterThanOrEqual(6);
    await expect(readFile(path.join(outDir, "content", "backgrounds.json"))).resolves.toBeInstanceOf(Buffer);
    await expect(readFile(path.join(outDir, "public", "townmaps", "icons.png"))).resolves.toBeInstanceOf(Buffer);
  });
});
