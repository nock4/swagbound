import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractSpriteAtlas } from "../../../scripts/atlas/extract-sprites";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "swagbound-sprite-atlas-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("sprite atlas extractor", () => {
  it("tallies real NPC usage and sprite override coverage", async () => {
    const outDir = await makeTempDir();
    const atlas = await extractSpriteAtlas({
      atlasImageDirRelative: path.join(outDir, "sprites"),
      atlasJsonRelative: path.join(outDir, "sprites.json")
    });

    const group59 = atlas.groups.find((group) => group.groupId === 59);
    expect(group59).toMatchObject({
      groupId: 59,
      usedByNpcCount: 32,
      overridden: true,
      overrideKind: "group"
    });
    expect(group59?.sampleNpcIds).toEqual([48, 78, 91, 246, 308]);
    expect(group59?.sampleLocations[0]).toEqual({ x: 7272, y: 848 });
    await expect(readFile(path.join(outDir, "sprites", "059.png"))).resolves.toBeInstanceOf(Buffer);

    const sourceBackedGroup = atlas.groups.find((group) => group.groupId === 3);
    expect(sourceBackedGroup).toMatchObject({
      groupId: 3,
      usedByNpcCount: 5,
      overridden: true,
      overrideKind: "group",
      image: "atlas/sprites/sheets/003.png"
    });
    await expect(readFile(path.join(outDir, "sprites", "003.png"))).resolves.toBeInstanceOf(Buffer);
    await expect(readFile(path.join(outDir, "sprites", "sheets", "003.png"))).resolves.toBeInstanceOf(Buffer);

    expect(atlas.counts.groups).toBe(atlas.groups.length);
    expect(atlas.counts.usedGroups).toBe(atlas.groups.filter((group) => group.usedByNpcCount > 0 || group.sampleEnemyIds.length > 0).length);
    expect(atlas.counts.overriddenGroups + atlas.counts.unskinnedGroups).toBe(atlas.counts.groups);
    expect(atlas.enemies.length).toBeGreaterThan(100);
    expect(atlas.enemies.every((enemy) => typeof enemy.overridden === "boolean")).toBe(true);
  });
});
