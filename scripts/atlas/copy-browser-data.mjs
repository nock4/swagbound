import { constants } from "node:fs";
import { access, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(rootDir, "apps/game/public/atlas");

const requiredCopies = [
  ["content/atlas/tiles.json", "tiles.json"],
  ["content/atlas/sprites.json", "sprites.json"],
  ["content/atlas/motifs.json", "motifs.json"],
  ["content/sprite-overrides.json", "sprite-overrides.json"]
];

const optionalCopies = [
  ["content/atlas/labels.json", "labels.json"],
  ["content/atlas/backgrounds.json", "backgrounds.json"],
  ["content/atlas/ui.json", "ui.json"],
  ["content/atlas/townmaps.json", "townmaps.json"]
];

async function exists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyDataset([fromRelative, toName]) {
  const from = path.join(rootDir, fromRelative);
  const to = path.join(outDir, toName);
  await copyFile(from, to);
  console.log(`copied ${fromRelative} -> apps/game/public/atlas/${toName}`);
}

await mkdir(outDir, { recursive: true });

for (const copy of requiredCopies) {
  await copyDataset(copy);
}

for (const [fromRelative, toName] of optionalCopies) {
  const from = path.join(rootDir, fromRelative);
  const to = path.join(outDir, toName);
  if (await exists(from)) {
    await copyFile(from, to);
    console.log(`copied ${fromRelative} -> apps/game/public/atlas/${toName}`);
  } else {
    await rm(to, { force: true });
    console.log(`skipped missing optional ${fromRelative}; removed stale apps/game/public/atlas/${toName}`);
  }
}
