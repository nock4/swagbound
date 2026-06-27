import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveScriptEvents } from "@eb/schemas";

import {
  TARGET_REFERENCE,
  applyNpcOverride,
  buildCustomDialogueWithDrifellaBarks
} from "../apps/game/src/loader.ts";
import {
  addedNpcInteractionEvents,
  interactionEvents
} from "../apps/game/src/eventRunner.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const generatedDir = resolve(repoRoot, "apps/game/public/generated");
const outputPath = resolve(__dirname, ".shop-clerks.json");

const readGeneratedJson = async (name) => {
  const text = await readFile(resolve(generatedDir, name), "utf8");
  return JSON.parse(text);
};

const flagReader = {
  has: () => false,
  isSet: () => false
};

const numericFlags = {
  isSet: () => false
};

function shopIdsFromEvents(events, scripts) {
  const shopIds = [];
  for (const event of events) {
    if (event.kind === "shop") {
      shopIds.push(event.storeId);
      continue;
    }
    if (event.kind !== "dialogue" || !event.reference || !scripts) {
      continue;
    }
    const resolved = resolveScriptEvents(scripts, event.reference, {}, { flags: numericFlags });
    for (const effect of resolved?.effects ?? []) {
      if (effect.kind === "shop") {
        shopIds.push(effect.storeId);
      }
    }
  }
  return [...new Set(shopIds)].sort((a, b) => a - b);
}

function clerkEntriesForNpc(npc, shopIds, shopsById) {
  return shopIds.map((storeId) => ({
    storeId,
    npcId: npc.npcId,
    spriteGroup: npc.spriteGroup,
    clerkX: npc.worldPixel?.x,
    clerkY: npc.worldPixel?.y,
    itemCount: shopsById.get(storeId)?.itemIds?.length ?? 0
  }));
}

const [
  world,
  shops,
  customDialogue,
  dialogueLibrary,
  drifellaBarks,
  addedNpcs,
  npcOverrides,
  scripts
] = await Promise.all([
  readGeneratedJson("world.json"),
  readGeneratedJson("shops.json"),
  readGeneratedJson("custom-dialogue.json"),
  readGeneratedJson("swagbound-dialogue-library.json"),
  readGeneratedJson("drifella-barks.json"),
  readGeneratedJson("added-npcs.json"),
  readGeneratedJson("npc-overrides.json"),
  readGeneratedJson("scripts.json")
]);

const runtimeCustomDialogue = buildCustomDialogueWithDrifellaBarks(
  customDialogue,
  world.npcs ?? [],
  drifellaBarks
);
const shopsById = new Map((shops.shops ?? []).map((shop) => [shop.id, shop]));
const clerkTargets = [];

for (const rawNpc of world.npcs ?? []) {
  const npc = applyNpcOverride(rawNpc, npcOverrides);
  if (!npc || !npc.interactable || !npc.visible) {
    continue;
  }
  const events = interactionEvents(
    npc,
    TARGET_REFERENCE,
    flagReader,
    runtimeCustomDialogue,
    dialogueLibrary
  );
  const shopIds = shopIdsFromEvents(events, scripts);
  clerkTargets.push(...clerkEntriesForNpc(npc, shopIds, shopsById));
}

for (const npc of addedNpcs.npcs ?? []) {
  if (npc.interactable === false || npc.visible === false) {
    continue;
  }
  const events = addedNpcInteractionEvents(npc, dialogueLibrary, flagReader);
  const shopIds = shopIdsFromEvents(events, scripts);
  clerkTargets.push(...clerkEntriesForNpc(npc, shopIds, shopsById));
}

clerkTargets.sort((a, b) => a.storeId - b.storeId || a.npcId - b.npcId);

await writeFile(outputPath, `${JSON.stringify(clerkTargets, null, 2)}\n`);

const distinctStoreIds = new Set(clerkTargets.map((entry) => entry.storeId));
const stockedClerks = clerkTargets.filter((entry) => entry.itemCount > 0).length;
const shopIds = new Set((shops.shops ?? []).map((shop) => shop.id));
const orphanedStoreIds = [...shopIds]
  .filter((storeId) => !distinctStoreIds.has(storeId))
  .sort((a, b) => a - b);

console.log(`Shop clerks found: ${clerkTargets.length}`);
console.log(`Distinct storeIds: ${distinctStoreIds.size}`);
console.log(`Clerks with itemCount > 0: ${stockedClerks}`);
console.log(
  `Shop coverage: ${distinctStoreIds.size} reachable / ${shopIds.size} total; ${orphanedStoreIds.length} orphaned`
);
console.log(`Orphaned storeIds: ${orphanedStoreIds.join(", ") || "(none)"}`);
console.log("First 10 clerk entries:");
console.log(JSON.stringify(clerkTargets.slice(0, 10), null, 2));
