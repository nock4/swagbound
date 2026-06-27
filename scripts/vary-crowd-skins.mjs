import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const worldPath = path.join(repoRoot, "apps/game/public/generated/world.json");
const overridesPath = path.join(repoRoot, "content/sprite-overrides.json");
const skinDir = path.join(
  repoRoot,
  "apps/game/public/assets/swagbound/overworld-npc",
);

const PROXIMITY_PX = 48;
const VARIETY_POOL = [
  "npc-neighbor",
  "npc-kid",
  "cryptic-kids",
  "cryptic-kids-2",
  "happy-camper",
  "ushanka-shade",
  "knitkitmori",
  "swag-raccoon",
  "pifella",
  "milardio",
  "mifella-2",
  "sawtooth-bun",
  "goobdle-s",
  "wifeystation",
];

const SINGLE_FRAME_ANIMATIONS = {
  down: [0],
  left: [0],
  right: [0],
  up: [0],
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function skinNameFromImage(image) {
  if (!image || typeof image !== "string") {
    return null;
  }
  return path.basename(image, ".png");
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";

  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("not a PNG");
  }

  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("missing IHDR");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function buildOverride(skinName, dimensions) {
  return {
    image: `assets/swagbound/overworld-npc/${skinName}.png`,
    frameWidth: dimensions.width,
    frameHeight: dimensions.height,
    animations: SINGLE_FRAME_ANIMATIONS,
    displayHeight: 24,
    originX: 0.5,
    originY: 1,
  };
}

function distanceSquared(a, b) {
  const dx = a.worldPixel.x - b.worldPixel.x;
  const dy = a.worldPixel.y - b.worldPixel.y;
  return dx * dx + dy * dy;
}

function findClusters(npcs) {
  const byGroup = new Map();

  for (const npc of npcs) {
    if (
      npc.visible !== true ||
      npc.type !== "person" ||
      !npc.worldPixel ||
      typeof npc.worldPixel.x !== "number" ||
      typeof npc.worldPixel.y !== "number"
    ) {
      continue;
    }

    const groupKey = String(npc.spriteGroup);
    const groupNpcs = byGroup.get(groupKey) ?? [];
    groupNpcs.push(npc);
    byGroup.set(groupKey, groupNpcs);
  }

  const clusters = [];
  const maxDistanceSquared = PROXIMITY_PX * PROXIMITY_PX;

  for (const [spriteGroup, groupNpcs] of byGroup.entries()) {
    const sorted = [...groupNpcs].sort((a, b) => a.npcId - b.npcId);
    const visited = new Set();

    for (const seed of sorted) {
      if (visited.has(seed.npcId)) {
        continue;
      }

      const cluster = [];
      const queue = [seed];
      visited.add(seed.npcId);

      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        cluster.push(current);

        for (const candidate of sorted) {
          if (visited.has(candidate.npcId)) {
            continue;
          }

          if (distanceSquared(current, candidate) <= maxDistanceSquared) {
            visited.add(candidate.npcId);
            queue.push(candidate);
          }
        }
      }

      cluster.sort((a, b) => a.npcId - b.npcId);
      if (cluster.length >= 3) {
        clusters.push({ spriteGroup, npcs: cluster });
      }
    }
  }

  clusters.sort((a, b) => {
    const firstNpcDelta = a.npcs[0].npcId - b.npcs[0].npcId;
    if (firstNpcDelta !== 0) {
      return firstNpcDelta;
    }
    return Number(a.spriteGroup) - Number(b.spriteGroup);
  });

  return clusters;
}

function loadAvailableSkins() {
  const available = new Map();
  const skipped = [];

  for (const skinName of VARIETY_POOL) {
    const pngPath = path.join(skinDir, `${skinName}.png`);

    if (!fs.existsSync(pngPath)) {
      skipped.push(`${skinName}: missing PNG`);
      continue;
    }

    try {
      available.set(skinName, readPngDimensions(pngPath));
    } catch (error) {
      skipped.push(`${skinName}: ${error.message}`);
    }
  }

  return { available, skipped };
}

function main() {
  const world = readJson(worldPath);
  const overrides = readJson(overridesPath);
  overrides.byNpcId ??= {};
  overrides.bySpriteGroup ??= {};

  const { available, skipped } = loadAvailableSkins();
  const npcs = Array.isArray(world.npcs) ? world.npcs : [];
  const clusters = findClusters(npcs);
  const assignments = [];

  for (const cluster of clusters) {
    const groupDefaultSkin = skinNameFromImage(
      overrides.bySpriteGroup[String(cluster.spriteGroup)]?.image,
    );
    const candidateSkins = VARIETY_POOL.filter(
      (skinName) => skinName !== groupDefaultSkin && available.has(skinName),
    );

    if (candidateSkins.length === 0) {
      continue;
    }

    for (let index = 1; index < cluster.npcs.length; index += 1) {
      const npc = cluster.npcs[index];
      const npcKey = String(npc.npcId);

      if (Object.prototype.hasOwnProperty.call(overrides.byNpcId, npcKey)) {
        continue;
      }

      const skinName = candidateSkins[(index - 1) % candidateSkins.length];
      const dimensions = available.get(skinName);
      if (!dimensions) {
        skipped.push(`${skinName}: dimensions unavailable for npc ${npc.npcId}`);
        continue;
      }

      overrides.byNpcId[npcKey] = buildOverride(skinName, dimensions);
      assignments.push({ npcId: npc.npcId, spriteGroup: cluster.spriteGroup, skinName });
    }
  }

  if (assignments.length > 0) {
    fs.writeFileSync(overridesPath, `${JSON.stringify(overrides, null, 2)}\n`);
  }

  console.log(`clusters found: ${clusters.length}`);
  console.log(`npcs varied: ${assignments.length}`);

  const examples = assignments
    .slice(0, 10)
    .map((assignment) => `${assignment.npcId} -> ${assignment.skinName}`);
  console.log(`examples: ${examples.length > 0 ? examples.join(", ") : "none"}`);

  if (skipped.length > 0) {
    console.log(`skipped pool entries: ${skipped.join("; ")}`);
  }
}

main();
