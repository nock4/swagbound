#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VAULT_ROOT = "/Users/nickgeorge-studio/Projects/swagbound-new";
const QUEUE_PATH = "content/promoted-sprite-placement-queue-2026-07-09.json";
const ESTIMATE_PATH = "content/promoted-sprite-placement-estimate-2026-07-09.json";
const HOLD_PATH = "tmp/placement-holds-2026-07-10.json";
const LEDGER_PATH = "tmp/placement-execution-2026-07-10.json";
const OUTPUT_ASSET_DIR = "assets/swagbound/overworld-npc";
const OUTPUT_ASSET_PUBLIC_DIR = "apps/game/public/assets/swagbound/overworld-npc";
const GENERATED_DIR = "apps/game/public/generated";

const queue = readJson(QUEUE_PATH);
const estimate = readJson(ESTIMATE_PATH);
const world = readJson("apps/game/public/generated/world.json");
const navmesh = decodeNavmesh(readJson("apps/game/public/generated/navmesh.json"));
const interiorTargets = readJson("tmp/interior-targets.json");
const shopClerks = readJson("scripts/.shop-clerks.json");
const cards = readJson("content/card-nfts.json");
const addedNpcs = readJson("content/added-npcs.json");
const spriteOverrides = readJson("content/sprite-overrides.json");
const sourceChecks = readJson("content/drifella-source-checks.json");
const attestationBattles = readJson("content/attestation-battles.json");

const activePlacements = estimate.placements.filter((placement) => placement.estimatedConfidence !== "low");
const holds = estimate.placements.filter((placement) => placement.estimatedConfidence === "low");
const omittedIds = new Set(queue.omittedDuplicates.map((placement) => placement.id));
const activeById = new Map(activePlacements.map((placement) => [placement.id, placement]));
const activeDrifellaIds = new Set(roleItems("sourceCheckFriendly").map((placement) => placement.id));
const usedActiveIds = new Set();

assertEqual(queue.activePlacements.length, 613, "active placement queue size");
assertEqual(queue.omittedDuplicates.length, 58, "omitted duplicate count");
assertEqual(activePlacements.length, 587, "high and medium placement count");
assertEqual(holds.length, 26, "hold count");
for (const placement of estimate.placements) {
  if (omittedIds.has(placement.id)) {
    throw new Error(`omitted duplicate leaked into estimate placements: ${placement.id}`);
  }
}

const occupied = [];
const doors = (world.doors ?? []).map((door) => door.worldPixel).filter(Boolean);
for (const npc of world.npcs ?? []) {
  if (npc.visible !== false && npc.worldPixel) {
    reserveExisting(`world:${npc.npcId}`, npc.worldPixel);
  }
}
for (const npc of addedNpcs.npcs ?? []) {
  if (npc.worldPixel) {
    reserveExisting(`added:${npc.id}`, npc.worldPixel);
  }
}

const keptSourceChecks = [];
const removedSourceCheckIds = [];
for (const check of sourceChecks.checks ?? []) {
  if (omittedIds.has(check.drifellaId)) {
    removedSourceCheckIds.push(check.id);
    continue;
  }
  keptSourceChecks.push(check);
  reserveExisting(`source:${check.id}`, check.placement.worldPixel);
}

const sourceChecksByDrifellaId = new Map(keptSourceChecks.map((check) => [check.drifellaId, check]));
const usedSourceNpcIds = new Set(keptSourceChecks.map((check) => check.npcId));
let cachedShopComponents;
let cachedMuseumComponents;
const componentCellCache = new Map();
let nextSourceNpcId = 100300;
function allocateSourceNpcId() {
  while (usedSourceNpcIds.has(nextSourceNpcId)) {
    nextSourceNpcId += 1;
  }
  if (nextSourceNpcId > 100499) {
    throw new Error("source check npcId range exhausted");
  }
  usedSourceNpcIds.add(nextSourceNpcId);
  return nextSourceNpcId;
}

let nextAddedNpcId = Math.max(...addedNpcs.npcs.map((npc) => npc.id)) + 1;
const newAddedNpcIds = [];
function allocateAddedNpcId() {
  const id = nextAddedNpcId;
  nextAddedNpcId += 1;
  newAddedNpcIds.push(id);
  return id;
}

const placements = [];
const newSourceChecks = [];
const byNpcId = { ...(spriteOverrides.byNpcId ?? {}) };
const activeAssets = new Map();
const rumorUses = new Map();

const singleFrameOverride = (image) => ({
  image,
  frameWidth: 48,
  frameHeight: 48,
  animations: { down: [0], left: [0], right: [0], up: [0] },
  displayHeight: 24,
  originX: 0.5,
  originY: 1
});

for (const placement of activePlacements) {
  const output = `${OUTPUT_ASSET_DIR}/${placement.id}-ow.png`;
  activeAssets.set(placement.id, output);
}
for (const check of keptSourceChecks) {
  for (const hint of check.hints ?? []) {
    if (hint.kind === "rumorNpc") {
      rumorUses.set(hint.npcId, (rumorUses.get(hint.npcId) ?? 0) + 1);
    }
  }
}

generateAssets(activePlacements);

const lswRegionCounts = [
  ["morningside", 10],
  ["postwick", 10],
  ["bluebell-village", 8],
  ["little-swag-world", 16],
  ["solana-beach", 8],
  ["the-galleria", 10],
  ["vacancy-flats", 10],
  ["dead-letter", 12],
  ["the-unlisted-room", 5],
  ["secret", 4]
];
placeAddedBatch(roleItems("npc"), lswRegionCounts.flatMap(([region, count]) => Array(count).fill(region)), "lsw-dialogue");

const shopkeeperItems = roleItems("shopkeeper");
const realClerks = realShopClerks();
const realClerkItems = shopkeeperItems.slice(0, realClerks.length);
const ambientShopItems = shopkeeperItems.slice(realClerks.length);
realClerkItems.forEach((placement, index) => {
  const clerk = realClerks[index];
  const image = activeAssets.get(placement.id);
  byNpcId[String(clerk.npcId)] = singleFrameOverride(image);
  usedActiveIds.add(placement.id);
  placements.push({
    itemId: placement.id,
    reviewKey: placement.reviewKey,
    lane: placement.lane,
    role: placement.estimatedRole,
    zone: placement.estimatedZone,
    placementKind: "real-shop-clerk-reskin",
    npcId: clerk.npcId,
    storeId: clerk.storeId,
    worldPixel: { x: clerk.clerkX, y: clerk.clerkY },
    asset: image
  });
});

placeAddedBatch(ambientShopItems, Array(ambientShopItems.length).fill("shop-interiors"), "shop-patron");
placeAddedBatch(roleItems("psychedelicNpc"), Array(roleItems("psychedelicNpc").length).fill("psychedelic-maps"), "psychedelic");
placeAddedBatch(roleItems("beachNpc"), Array(roleItems("beachNpc").length).fill("beach-map"), "beach");
placeAddedBatch(roleItems("wildlifeNpc").filter((p) => p.estimatedZone === "desert-map"), Array(29).fill("desert-map"), "desert-wildlife");
placeAddedBatch(roleItems("wildlifeNpc").filter((p) => p.estimatedZone === "swamp-map"), Array(33).fill("swamp-map"), "swamp-wildlife");
placeAddedBatch(roleItems("museumNpc"), Array(roleItems("museumNpc").length).fill("museum-map"), "museum");

placeSourceChecks();
applyMinchReconciliation();
writeHolds();

const finalSourceChecks = [...keptSourceChecks, ...newSourceChecks];
sourceChecks.checks = finalSourceChecks;
attestationBattles.checks = finalSourceChecks.map((check) => ({ checkId: check.id, tier: check.tier }));
spriteOverrides.byNpcId = byNpcId;

writeJson("content/added-npcs.json", addedNpcs);
writeJson("content/sprite-overrides.json", spriteOverrides);
writeJson("content/drifella-source-checks.json", sourceChecks);
writeJson("content/attestation-battles.json", attestationBattles);

writeJson(LEDGER_PATH, {
  schema: "swagbound.promoted-sprite-placement-execution.v1",
  generatedAt: "2026-07-10",
  sources: {
    queue: QUEUE_PATH,
    estimate: ESTIMATE_PATH
  },
  counts: summarizePlacements(placements),
  idRanges: {
    addedNpcIds: {
      first: Math.min(...newAddedNpcIds),
      last: Math.max(...newAddedNpcIds),
      count: newAddedNpcIds.length
    },
    sourceCheckNpcIds: {
      added: newSourceChecks.map((check) => check.npcId),
      count: newSourceChecks.length
    }
  },
  mifellaNotes: [
    "mifella-001 = Pokey equivalent",
    "mifella-005 = Pickey equivalent"
  ],
  reconciliations: [
    { npcId: 100101, itemId: "mifella-001", asset: activeAssets.get("mifella-001"), note: "door kid adopts mifella-001 skin" },
    { npcId: 52, itemId: "mifella-001", asset: activeAssets.get("mifella-001"), note: "interior group 44 adopts mifella-001 skin" },
    { npcId: 53, itemId: "mifella-005", asset: activeAssets.get("mifella-005"), note: "interior group 45 adopts mifella-005 skin" }
  ],
  sourceCheckCleanup: {
    removedOmittedDuplicateChecks: removedSourceCheckIds
  },
  placements
});

copyGenerated("added-npcs.json");
copyGenerated("sprite-overrides.json");
copyGenerated("drifella-source-checks.json");
copyGenerated("attestation-battles.json");

assertEqual(placements.length, 587, "placement ledger count");
assertEqual(usedActiveIds.size, 587, "unique active item ids placed");
for (const id of omittedIds) {
  if (placementContainsExactItemId(placements, id) || holdContainsExactItemId(readJson(HOLD_PATH), id)) {
    throw new Error(`omitted duplicate leaked into placement outputs: ${id}`);
  }
}

console.log(`Placed ${placements.length} active high and medium items.`);
console.log(`Added NPC ids ${Math.min(...newAddedNpcIds)}-${Math.max(...newAddedNpcIds)} (${newAddedNpcIds.length}).`);
console.log(`Added ${newSourceChecks.length} missing Source Checks after removing ${removedSourceCheckIds.length} omitted duplicate checks.`);
console.log(`Wrote ${HOLD_PATH} with ${holds.length} holds.`);
console.log(`Wrote ${LEDGER_PATH}.`);

function roleItems(role) {
  return activePlacements.filter((placement) => placement.estimatedRole === role);
}

function placeAddedBatch(items, zones, kind) {
  if (items.length !== zones.length) {
    throw new Error(`${kind}: item and zone count mismatch`);
  }
  items.forEach((placement, index) => {
    const zone = zones[index];
    const point = pointForZone(zone, `${kind}:${placement.id}:${index}`);
    const npcId = allocateAddedNpcId();
    const facing = facingForZone(zone, index);
    const npc = {
      id: npcId,
      worldPixel: point,
      spriteGroup: 59,
      facing,
      alwaysSpawn: true,
      interaction: { pages: dialoguePages(kind, placement, zone, index) }
    };
    addedNpcs.npcs.push(npc);
    byNpcId[String(npcId)] = singleFrameOverride(activeAssets.get(placement.id));
    usedActiveIds.add(placement.id);
    placements.push({
      itemId: placement.id,
      reviewKey: placement.reviewKey,
      lane: placement.lane,
      role: placement.estimatedRole,
      zone: placement.estimatedZone,
      assignedRegion: zone,
      placementKind: kind,
      npcId,
      worldPixel: point,
      facing,
      alwaysSpawn: true,
      asset: activeAssets.get(placement.id)
    });
  });
}

function realShopClerks() {
  const seen = new Set();
  const clerks = [];
  for (const entry of shopClerks) {
    if (!Number.isInteger(entry.npcId) || seen.has(entry.npcId)) {
      continue;
    }
    seen.add(entry.npcId);
    if (byNpcId[String(entry.npcId)]) {
      continue;
    }
    clerks.push(entry);
  }
  clerks.sort((a, b) => a.storeId - b.storeId || a.npcId - b.npcId);
  return clerks;
}

function placeSourceChecks() {
  const regionTargets = new Map([
    ["morningside", 10],
    ["postwick", 10],
    ["bluebell-village", 9],
    ["dead-letter", 11],
    ["the-galleria", 12],
    ["solana-beach", 10],
    ["little-swag-world", 12],
    ["vacancy-flats", 10],
    ["the-unlisted-room", 9],
    ["secret", 9]
  ]);
  const regionCounts = new Map([...regionTargets.keys()].map((region) => [region, 0]));
  const maxSuffixByRegion = new Map();
  for (const check of keptSourceChecks) {
    const suffix = Number((/-([0-9]+)$/.exec(check.id) ?? [])[1] ?? 0);
    maxSuffixByRegion.set(check.region, Math.max(maxSuffixByRegion.get(check.region) ?? 0, suffix));
    if (activeDrifellaIds.has(check.drifellaId)) {
      regionCounts.set(check.region, (regionCounts.get(check.region) ?? 0) + 1);
      const placement = activeById.get(check.drifellaId);
      if (placement) {
        byNpcId[String(check.npcId)] = singleFrameOverride(activeAssets.get(placement.id));
        usedActiveIds.add(placement.id);
        placements.push({
          itemId: placement.id,
          reviewKey: placement.reviewKey,
          lane: placement.lane,
          role: placement.estimatedRole,
          zone: placement.estimatedZone,
          assignedRegion: check.region,
          placementKind: "source-check-existing",
          checkId: check.id,
          npcId: check.npcId,
          worldPixel: check.placement.worldPixel,
          facing: check.placement.facing,
          asset: activeAssets.get(placement.id)
        });
      }
    }
  }

  const missing = roleItems("sourceCheckFriendly").filter((placement) => !sourceChecksByDrifellaId.has(placement.id));
  for (const placement of missing) {
    const region = nextSourceCheckRegion(regionCounts, regionTargets);
    regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    const nextSuffix = (maxSuffixByRegion.get(region) ?? 0) + 1;
    maxSuffixByRegion.set(region, nextSuffix);
    const checkId = `sourcecheck-${region}-${String(nextSuffix).padStart(3, "0")}`;
    const point = pointForZone(region, `source:${placement.id}:${checkId}`);
    const tier = sourceCheckTier(region);
    const npcId = allocateSourceNpcId();
    const facing = facingForZone(region, nextSuffix);
    const card = cards.cards[(newSourceChecks.length + keptSourceChecks.length) % cards.cards.length];
    const rumorNpcId = rumorNpcFor(region);
    const check = {
      id: checkId,
      drifellaId: placement.id,
      drifellaName: drifellaNameFromId(placement.id),
      npcId,
      region,
      tier,
      placement: {
        kind: "promoted-placement",
        worldPixel: point,
        facing
      },
      visibility: { requireFlags: [], blockFlags: [] },
      personality: {
        bit: sourceCheckPersonality(region, placement.id),
        tic: "\"Witnessed, not filed.\""
      },
      battleSprite: `assets/swagbound/drifella-battle/${placement.id}.png`,
      hints: [
        { kind: "binder" },
        {
          kind: "rumorNpc",
          npcId: rumorNpcId,
          page: `Drifella ${placement.id.replace(/^drifella2-/, "")} is asking warm provenance questions near ${regionLabel(region)}.`
        }
      ],
      entryPrompt: [
        `The Drifella checks your shadow against a very tired folder.`,
        `"Attestation. Two questions. The folder gets no vote unless you give it one."`
      ],
      questions: sourceQuestions(region),
      rewards: { cardId: card.id, itemId: 88 },
      retry: { policy: "leaveArea", rotatePool: true, checkpointAt: tier >= 3 ? 1 : null },
      reactions: {
        correct: [
          "\"Witnessed, not filed.\"",
          "\"Correct. The folder hates that.\"",
          "\"Good. Your memory kept its receipt.\""
        ],
        cleared: [
          "\"Cleared. The card belongs to the witness now.\"",
          "\"Take it before the record invents a nicer owner.\""
        ],
        failed: [
          "\"No harm done. Come back when the label stops talking over you.\"",
          "\"The folder won that round. Embarrassing, but fixable.\""
        ],
        alreadyCleared: [
          "\"Already witnessed. The folder is still upset.\"",
          "\"We did this. Your receipt is warm.\""
        ]
      }
    };
    newSourceChecks.push(check);
    byNpcId[String(npcId)] = singleFrameOverride(activeAssets.get(placement.id));
    usedActiveIds.add(placement.id);
    placements.push({
      itemId: placement.id,
      reviewKey: placement.reviewKey,
      lane: placement.lane,
      role: placement.estimatedRole,
      zone: placement.estimatedZone,
      assignedRegion: region,
      placementKind: "source-check-new",
      checkId,
      npcId,
      worldPixel: point,
      facing,
      asset: activeAssets.get(placement.id)
    });
  }
}

function nextSourceCheckRegion(regionCounts, targets) {
  let bestRegion = "";
  let bestScore = Infinity;
  for (const [region, target] of targets) {
    const count = regionCounts.get(region) ?? 0;
    if (count >= target) {
      continue;
    }
    const score = count / target;
    if (score < bestScore) {
      bestScore = score;
      bestRegion = region;
    }
  }
  if (!bestRegion) {
    throw new Error("no source check region quota remains");
  }
  return bestRegion;
}

function sourceQuestions(region) {
  return {
    drawCount: 2,
    pool: [
      {
        type: "trueFalse",
        prompt: "A witnessed source is warmer than a clean filing.",
        answer: true,
        category: "lore",
        failLine: "\"Warmth matters. Paperwork mostly sweats.\""
      },
      {
        type: "multipleChoice4",
        prompt: "When a file and a witness disagree, trust...",
        options: ["The witness who was there", "The louder label", "The blank form", "The prettiest stamp"],
        answerIndex: 0,
        officialIndex: 2,
        category: "witnessed",
        failLine: "\"The blank form would like that. Denied.\""
      },
      {
        type: "trueFalse",
        prompt: "A copied face becomes original just because the paperwork arrives first.",
        answer: false,
        category: "witnessed",
        failLine: "\"Early paperwork is still paperwork.\""
      },
      {
        type: "multipleChoice4",
        prompt: `The ${regionLabel(region)} attestation protects...`,
        options: ["The person still present", "The neatest category", "The fastest rumor", "The quietest receipt"],
        answerIndex: 0,
        officialIndex: 1,
        category: "vibe",
        failLine: "\"Categories are tidy because they do not have a pulse.\""
      }
    ]
  };
}

function sourceCheckPersonality(region, id) {
  return `A promoted Drifella from ${regionLabel(region)} who treats ${id.replace(/^drifella2-/, "")} as a witness, not an asset tag.`;
}

function drifellaNameFromId(id) {
  return `Drifella ${id.replace(/^drifella2-/, "")}`;
}

function sourceCheckTier(region) {
  if (region === "morningside" || region === "postwick") return 1;
  if (region === "bluebell-village" || region === "dead-letter") return 2;
  if (region === "the-galleria" || region === "solana-beach" || region === "little-swag-world") return 3;
  return 4;
}

function rumorNpcFor(region) {
  const bounds = zoneBounds(region);
  const candidates = (world.npcs ?? [])
    .filter((npc) => npc.visible !== false && npc.interactable && npc.worldPixel)
    .filter((npc) => pointInBounds(npc.worldPixel, bounds))
    .sort((a, b) => a.npcId - b.npcId);
  for (const npc of candidates) {
    if ((rumorUses.get(npc.npcId) ?? 0) < 2) {
      rumorUses.set(npc.npcId, (rumorUses.get(npc.npcId) ?? 0) + 1);
      return npc.npcId;
    }
  }
  for (const npc of world.npcs ?? []) {
    if (npc.visible !== false && npc.interactable && (rumorUses.get(npc.npcId) ?? 0) < 2) {
      rumorUses.set(npc.npcId, (rumorUses.get(npc.npcId) ?? 0) + 1);
      return npc.npcId;
    }
  }
  throw new Error(`no rumor NPC available for ${region}`);
}

function applyMinchReconciliation() {
  byNpcId["100101"] = singleFrameOverride(activeAssets.get("mifella-001"));
  byNpcId["52"] = singleFrameOverride(activeAssets.get("mifella-001"));
  byNpcId["53"] = singleFrameOverride(activeAssets.get("mifella-005"));
}

function writeHolds() {
  writeJson(HOLD_PATH, {
    schema: "swagbound.promoted-sprite-placement-holds.v1",
    generatedAt: "2026-07-10",
    sourceEstimate: ESTIMATE_PATH,
    count: holds.length,
    holds: holds.map((placement) => ({
      id: placement.id,
      reviewKey: placement.reviewKey,
      lane: placement.lane,
      collection: placement.collection,
      estimatedRole: placement.estimatedRole,
      estimatedZone: placement.estimatedZone,
      estimatedConfidence: placement.estimatedConfidence,
      proposedDecision: proposedHoldDecision(placement),
      rationale: placement.estimatedRationale
    }))
  });
}

function proposedHoldDecision(placement) {
  const key = `${placement.collection} ${placement.id}`.toLowerCase();
  if (key.includes("grill")) {
    return { role: "shopkeeper", zone: "shop-interiors", note: "Food-service name, but needs visual review before clerk or patron use." };
  }
  if (key.includes("little-fellow")) {
    return { role: "npc", zone: "little-swag-world-dialogue-pool", note: "Likely friendly origin-town NPC after visual confirmation." };
  }
  if (key.includes("fair")) {
    return { role: "psychedelicNpc", zone: "psychedelic-maps", note: "Likely dreamspace fit after visual confirmation." };
  }
  if (key.includes("meangirl")) {
    return { role: "shopkeeper", zone: "shop-interiors", note: "Likely human ambient patron after visual confirmation." };
  }
  if (key.includes("miyakaki")) {
    return { role: "museumNpc", zone: "museum-map", note: "Likely exhibit or docent after visual confirmation." };
  }
  return { role: "unset", zone: "needs-human-placement", note: "Keep held until a human visual pass assigns the lane." };
}

function dialoguePages(kind, placement, zone, index) {
  const token = cleanToken(placement.id);
  if (kind === "lsw-dialogue") {
    const variants = [
      [
        `I came from Little Swag World with a receipt in my sock and a folder chasing me uphill.`,
        `The folder calls me ${token}. I call the folder a copier with posture.`,
        `Tell the registry I am friendly. It hates adjectives it did not invent.`
      ],
      [
        `They said the source war needed heroes. I brought snacks and a clean witness statement.`,
        `If anyone asks, ${token} was here before the label learned to spell me.`,
        `Do not let the clipboard flatter you. That is how it gets a folder started.`
      ],
      [
        `I am posted in ${regionLabel(zone)} because the route needed someone normal-adjacent.`,
        `The leaked version of me smiles better. Naturally it has investors.`,
        `The real version has dry socks and worse lighting. More trustworthy, honestly.`
      ]
    ];
    return variants[index % variants.length];
  }
  if (kind === "shop-patron") {
    return [
      `I am just browsing. The shelf keeps trying to browse me back.`,
      `If the clerk asks, ${token} is a customer, not inventory. Subtle distinction, huge paperwork.`
    ];
  }
  if (kind === "psychedelic") {
    return [
      `The room says I am ${token}. The room says a lot when nobody is supervising it.`,
      `I stood still and became a citation. Very rude architecture.`
    ];
  }
  if (kind === "beach") {
    return [
      `The tide tried to verify me and got bored halfway through.`,
      `${token} is on vacation from the registry. Do not forward my mail.`
    ];
  }
  if (kind === "desert-wildlife") {
    return [
      `This little desert local watches the heat file a complaint against the horizon.`,
      `It looks friendly, but only because the paperwork ran out of water first.`
    ];
  }
  if (kind === "swamp-wildlife") {
    return [
      `This damp little witness blinks like it heard the swamp notarize a bubble.`,
      `It has no hostile intent. Mostly mud, patience, and a private receipt.`
    ];
  }
  if (kind === "museum") {
    return [
      `EXHIBIT LABEL: ${token}, provenance disputed, vibes unfortunately admissible.`,
      `The plaque says do not touch. The plaque has never had to prove it was real.`
    ];
  }
  return [
    `${token} watches the paperwork go by.`,
    `Nobody here trusts a clean label anymore.`
  ];
}

function cleanToken(id) {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function pointForZone(zone, seed) {
  if (zone === "shop-interiors") {
    return sampleInComponents(shopComponents(), seed, 30);
  }
  if (zone === "museum-map") {
    return sampleInComponents(museumComponents(), seed, 30);
  }
  const bounds = zoneBounds(zone);
  return sampleInBounds(bounds, seed, zone === "beach-map" ? 34 : 40);
}

function zoneBounds(zone) {
  const bounds = {
    "morningside": { x1: 1200, y1: 1300, x2: 2400, y2: 2200 },
    "postwick": { x1: 1200, y1: 6200, x2: 3600, y2: 7350 },
    "bluebell-village": { x1: 2300, y1: 7000, x2: 4300, y2: 7450 },
    "little-swag-world": { x1: 4300, y1: 0, x2: 8200, y2: 4500 },
    "solana-beach": { x1: 3800, y1: 2500, x2: 7800, y2: 3800 },
    "the-galleria": { x1: 1900, y1: 3100, x2: 6500, y2: 6900 },
    "vacancy-flats": { x1: 4800, y1: 4300, x2: 8200, y2: 8200 },
    "dead-letter": { x1: 4200, y1: 8200, x2: 8200, y2: 10250 },
    "the-unlisted-room": { x1: 0, y1: 0, x2: 4300, y2: 5500 },
    "secret": { x1: 0, y1: 5200, x2: 5500, y2: 10250 },
    "psychedelic-maps": { x1: 0, y1: 0, x2: 4300, y2: 5500 },
    "beach-map": { x1: 3800, y1: 2500, x2: 7800, y2: 3800 },
    "desert-map": { x1: 4800, y1: 4300, x2: 8200, y2: 8200 },
    "swamp-map": { x1: 300, y1: 8700, x2: 4300, y2: 10150 }
  }[zone];
  if (!bounds) {
    throw new Error(`unknown zone bounds for ${zone}`);
  }
  return bounds;
}

function regionLabel(region) {
  return region.replace(/-/g, " ");
}

function facingForZone(zone, index) {
  if (zone === "shop-interiors" || zone === "museum-map") return "down";
  return ["down", "left", "right", "up"][index % 4];
}

function shopComponents() {
  if (cachedShopComponents) return cachedShopComponents;
  const ids = new Set();
  for (const clerk of realClerksFromAllShops()) {
    const componentId = componentAtPoint(clerk.clerkX, clerk.clerkY);
    if (componentId) ids.add(componentId);
  }
  cachedShopComponents = [...ids];
  return cachedShopComponents;
}

function realClerksFromAllShops() {
  const seen = new Set();
  const clerks = [];
  for (const entry of shopClerks) {
    if (!Number.isInteger(entry.npcId) || seen.has(entry.npcId)) continue;
    seen.add(entry.npcId);
    clerks.push(entry);
  }
  return clerks;
}

function museumComponents() {
  if (cachedMuseumComponents) return cachedMuseumComponents;
  const ids = new Set();
  for (const target of interiorTargets) {
    if (target.x >= 4200 && target.x <= 6700 && target.y >= 8200 && target.y <= 8750) {
      ids.add(target.comp.componentId);
    }
  }
  if (ids.size === 0) {
    for (const target of interiorTargets) {
      if (target.x >= 4200 && target.x <= 8200 && target.y >= 8200 && target.y <= 10250) {
        ids.add(target.comp.componentId);
      }
    }
  }
  cachedMuseumComponents = [...ids];
  return cachedMuseumComponents;
}

function sampleInBounds(bounds, seed, minDistance) {
  for (const distance of [minDistance, minDistance - 6, minDistance - 12, 24]) {
    const rng = createRng(seed + `:${distance}`);
    for (let attempt = 0; attempt < 60000; attempt += 1) {
      const x = Math.floor(bounds.x1 + rng() * (bounds.x2 - bounds.x1 + 1));
      const y = Math.floor(bounds.y1 + rng() * (bounds.y2 - bounds.y1 + 1));
      const cellX = Math.floor(x / navmesh.cellSize);
      const cellY = Math.floor(y / navmesh.cellSize);
      if (componentAtCell(cellX, cellY) === 0) continue;
      const point = {
        x: Math.round((cellX + 0.5) * navmesh.cellSize),
        y: Math.round((cellY + 0.5) * navmesh.cellSize)
      };
      if (!pointInBounds(point, bounds)) continue;
      if (clearPoint(point, distance)) {
        reserveExisting(seed, point);
        return point;
      }
    }
  }
  throw new Error(`could not sample point in ${JSON.stringify(bounds)} for ${seed}`);
}

function sampleInComponents(componentIds, seed, minDistance) {
  if (componentIds.length === 0) {
    throw new Error(`no components for ${seed}`);
  }
  for (const distance of [minDistance, minDistance - 6, minDistance - 12, 20, 16]) {
    const rng = createRng(seed + `:${distance}`);
    for (let attempt = 0; attempt < 80000; attempt += 1) {
      const componentId = componentIds[Math.floor(rng() * componentIds.length)];
      const cells = cellsForComponent(componentId);
      const cell = cells[Math.floor(rng() * cells.length)];
      const point = {
        x: Math.round((cell.x + 0.5) * navmesh.cellSize),
        y: Math.round((cell.y + 0.5) * navmesh.cellSize)
      };
      if (clearPoint(point, distance)) {
        reserveExisting(seed, point);
        return point;
      }
    }
  }
  throw new Error(`could not sample component point for ${seed}`);
}

function clearPoint(point, minDistance) {
  if (componentAtPoint(point.x, point.y) === 0) return false;
  for (const occupiedPoint of occupied) {
    if (distanceSquared(point, occupiedPoint) < minDistance * minDistance) {
      return false;
    }
  }
  for (const door of doors) {
    if (distanceSquared(point, door) < 32 * 32) {
      return false;
    }
  }
  return true;
}

function reserveExisting(label, point) {
  occupied.push({ x: point.x, y: point.y, label });
}

function pointInBounds(point, bounds) {
  return point.x >= bounds.x1 && point.x <= bounds.x2 && point.y >= bounds.y1 && point.y <= bounds.y2;
}

function distanceSquared(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function cellsForComponent(componentId) {
  const cached = componentCellCache.get(componentId);
  if (cached) return cached;
  const cells = [];
  for (let y = 0; y < navmesh.height; y += 1) {
    for (let x = 0; x < navmesh.width; x += 1) {
      if (componentAtCell(x, y) === componentId) {
        cells.push({ x, y });
      }
    }
  }
  componentCellCache.set(componentId, cells);
  return cells;
}

function componentAtPoint(x, y) {
  return componentAtCell(Math.floor(x / navmesh.cellSize), Math.floor(y / navmesh.cellSize));
}

function componentAtCell(cellX, cellY) {
  if (cellX < 0 || cellY < 0 || cellX >= navmesh.width || cellY >= navmesh.height) {
    return 0;
  }
  return navmesh.cells[cellY * navmesh.width + cellX] ?? 0;
}

function decodeNavmesh(json) {
  const cells = new Uint32Array(json.width * json.height);
  for (let y = 0; y < json.height; y += 1) {
    let x = 0;
    for (const [componentId, runLength] of json.rows[y] ?? []) {
      if (componentId !== 0) {
        cells.fill(componentId, y * json.width + x, y * json.width + x + runLength);
      }
      x += runLength;
    }
  }
  return { cellSize: json.cellSize, width: json.width, height: json.height, cells };
}

function createRng(seed) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function generateAssets(items) {
  fs.mkdirSync(path.join(ROOT, OUTPUT_ASSET_PUBLIC_DIR), { recursive: true });
  for (const placement of items) {
    const source = path.join(VAULT_ROOT, placement.anchor96);
    const output = path.join(ROOT, "apps/game/public", activeAssets.get(placement.id));
    if (!fs.existsSync(source)) {
      throw new Error(`missing anchor96 source for ${placement.id}: ${source}`);
    }
    execFileSync("/usr/bin/sips", ["-z", "48", "48", source, "--out", output], { stdio: "ignore" });
    const size = pngSize(output);
    if (size.width !== 48 || size.height !== 48) {
      throw new Error(`bad generated image size for ${placement.id}: ${size.width}x${size.height}`);
    }
  }
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`not a PNG: ${file}`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function summarizePlacements(entries) {
  const byRole = {};
  const byZone = {};
  const byPlacementKind = {};
  const byAssignedRegion = {};
  for (const entry of entries) {
    increment(byRole, entry.role);
    increment(byZone, entry.zone);
    increment(byPlacementKind, entry.placementKind);
    increment(byAssignedRegion, entry.assignedRegion ?? entry.zone);
  }
  return {
    total: entries.length,
    byRole,
    byZone,
    byPlacementKind,
    byAssignedRegion
  };
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeJson(relativePath, data) {
  const absolute = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(data, null, 1)}\n`);
}

function copyGenerated(fileName) {
  fs.copyFileSync(path.join(ROOT, "content", fileName), path.join(ROOT, GENERATED_DIR, fileName));
}

function placementContainsExactItemId(entries, id) {
  return entries.some((entry) => entry.itemId === id);
}

function holdContainsExactItemId(holdFile, id) {
  return (holdFile.holds ?? []).some((entry) => entry.id === id);
}
