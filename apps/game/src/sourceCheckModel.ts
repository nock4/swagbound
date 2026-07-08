import type {
  AttestationBattles,
  BattleData,
  CardNft,
  CardNfts,
  DrifellaSourceCheck,
  SourceCheckQuestion
} from "@eb/schemas";
import { createStatefulRng, hashSeed } from "./seededRng";

export const SOURCE_CHECK_RETRY_DISTANCE_PX = 400;

export type FlagReader = {
  has(flag: string): boolean;
};

export type DrawnSourceCheckQuestion = {
  sourceIndex: number;
  type: SourceCheckQuestion["type"];
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  failLine?: string;
};

export type SourceCheckDraw = {
  attempt: number;
  drawCount: number;
  questions: DrawnSourceCheckQuestion[];
};

/**
 * Derive the "Drifella <token>" display name from a `drifella2-<token>` sprite id.
 * The sprite token IS the name (drifella2-168 -> "Drifella 168"); this keeps the
 * id as the single source of truth so names can never drift from the sprite.
 * Falls back to the raw id if it isn't a drifella2 id.
 */
export function drifellaNameFromId(drifellaId: string): string {
  const match = /^drifella2-(.+)$/.exec(drifellaId.trim());
  return match ? `Drifella ${match[1]}` : drifellaId;
}

/** Resolve a check's display name: explicit override if present, else derived from the id. */
export function drifellaDisplayName(check: { drifellaId: string; drifellaName?: string }): string {
  const override = check.drifellaName?.trim();
  return override && override.length > 0 ? override : drifellaNameFromId(check.drifellaId);
}

export type SourceCheckRewardResult = {
  flagsToSet: string[];
  flagsToClear: string[];
  itemGiven: boolean;
  itemHeld: boolean;
};

export type BinderCardView = {
  id: string;
  cardId: string;
  region: string;
  label: string;
  owned: boolean;
  image: string;
  caption: string;
  silhouetteHint: string;
  sortIndex: number;
};

export type BinderRegionView = {
  id: string;
  label: string;
  owned: number;
  total: number;
};

export type BinderViewModel = {
  owned: number;
  total: number;
  regions: BinderRegionView[];
  cardsByRegion: Record<string, BinderCardView[]>;
};

const TRUE_FALSE_OPTIONS = ["TRUE", "FALSE"] as const;
const WORLD_REGION_ORDER = [
  "morningside",
  "postwick",
  "bluebell-village",
  "dead-letter",
  "solana-beach",
  "the-galleria",
  "little-swag-world",
  "vacancy-flats",
  "the-unlisted-room",
  "secret"
];

export function sourceCheckClearedFlag(checkId: string): string {
  return `sourcecheck:${checkId}:cleared`;
}

export function sourceCheckItemHeldFlag(checkId: string): string {
  return `sourcecheck:${checkId}:itemHeld`;
}

export function cardOwnedFlag(cardId: string): string {
  return `cardnft:${cardId}:owned`;
}

export function sourceCheckVisible(check: DrifellaSourceCheck, flags: FlagReader): boolean {
  if (flags.has(sourceCheckClearedFlag(check.id))) {
    return true;
  }
  return check.visibility.requireFlags.every((flag) => flags.has(flag))
    && check.visibility.blockFlags.every((flag) => !flags.has(flag));
}

export function sourceCheckCanRetry(distancePx: number, requiredDistancePx = SOURCE_CHECK_RETRY_DISTANCE_PX): boolean {
  return Number.isFinite(distancePx) && distancePx >= requiredDistancePx;
}

export function drawSourceCheckQuestions(
  check: DrifellaSourceCheck,
  flags: FlagReader,
  attempt: number
): SourceCheckDraw {
  const drawCount = check.questions.drawCount;
  const pool = gatedQuestionPool(check, flags);
  const indexed = pool.map((question) => ({
    question,
    sourceIndex: check.questions.pool.indexOf(question)
  }));
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  // Bias the draw by question category against the check's difficulty tier: early
  // (tier 1) checks surface the approachable art/lore questions first, late (tier 4)
  // checks surface the game-memory ("witnessed") ones. rotatePool keeps its
  // rotate-through-unseen semantics on top of this stable, biased base order.
  const ordered = check.retry.rotatePool
    ? rotate(weightedQuestionOrder(indexed, check, ""), ((normalizedAttempt - 1) * drawCount) % indexed.length)
    : weightedQuestionOrder(indexed, check, `:${normalizedAttempt}`);
  return {
    attempt: normalizedAttempt,
    drawCount,
    questions: ordered.slice(0, drawCount).map((entry, drawIndex) =>
      prepareDrawnQuestion(entry.question, entry.sourceIndex, check.id, normalizedAttempt, drawIndex)
    )
  };
}

export function answerSourceCheckQuestion(question: DrawnSourceCheckQuestion, selectedOptionIndex: number): boolean {
  return selectedOptionIndex === question.correctOptionIndex;
}

export function resolveSourceCheckRewards(
  check: DrifellaSourceCheck,
  leadCharId: number,
  giveItem: (charId: number, itemId: number) => boolean
): SourceCheckRewardResult {
  const itemGiven = giveItem(leadCharId, check.rewards.itemId);
  return {
    flagsToSet: [
      sourceCheckClearedFlag(check.id),
      cardOwnedFlag(check.rewards.cardId),
      ...(itemGiven ? [] : [sourceCheckItemHeldFlag(check.id)])
    ],
    flagsToClear: itemGiven ? [sourceCheckItemHeldFlag(check.id)] : [],
    itemGiven,
    itemHeld: !itemGiven
  };
}

export function buildBinderViewModel(cards: CardNfts, flags: FlagReader): BinderViewModel {
  const sortedCards = [...cards.cards].sort((a, b) =>
    regionOrder(a.region) - regionOrder(b.region)
    || a.region.localeCompare(b.region)
    || a.sortIndex - b.sortIndex
    || a.id.localeCompare(b.id)
  );
  const cardsByRegion: Record<string, BinderCardView[]> = {};
  for (const card of sortedCards) {
    const owned = flags.has(cardOwnedFlag(card.id));
    const view: BinderCardView = {
      id: `binder-card-${card.id}`,
      cardId: card.id,
      region: card.region,
      label: owned ? card.name : `???  ${card.silhouetteHint}`,
      owned,
      image: card.image,
      caption: card.caption,
      silhouetteHint: card.silhouetteHint,
      sortIndex: card.sortIndex
    };
    cardsByRegion[card.region] = [...(cardsByRegion[card.region] ?? []), view];
  }
  const regions = Object.entries(cardsByRegion).map(([region, regionCards]) => {
    const owned = regionCards.filter((card) => card.owned).length;
    return {
      id: region,
      label: `${regionLabel(region)} - ${owned}/${regionCards.length}`,
      owned,
      total: regionCards.length
    };
  });
  return {
    owned: sortedCards.filter((card) => flags.has(cardOwnedFlag(card.id))).length,
    total: sortedCards.length,
    regions,
    cardsByRegion
  };
}

export function cardById(cards: CardNfts, cardId: string): CardNft | undefined {
  return cards.cards.find((card) => card.id === cardId);
}

export const ATTESTATION_BATTLE_ENEMY_ID_BASE = 910000;
export const ATTESTATION_BATTLE_GROUP_ID_BASE = 920000;

export type AttestationBattleRuntime = {
  battleData: BattleData;
  groupId: number;
  enemyId: number;
};

export function buildAttestationBattleRuntime(
  base: BattleData,
  check: DrifellaSourceCheck,
  battles: AttestationBattles | undefined
): AttestationBattleRuntime {
  const tier = attestationBattleTier(check, battles);
  const stats = battles?.tierStats[String(tier)] ?? defaultAttestationTierStats(tier);
  const enemyId = ATTESTATION_BATTLE_ENEMY_ID_BASE + check.npcId;
  const groupId = ATTESTATION_BATTLE_GROUP_ID_BASE + check.npcId;
  const enemy = {
    id: enemyId,
    name: drifellaDisplayName(check),
    spriteId: 0,
    overworldSprite: check.npcId,
    level: stats.level,
    hp: stats.hp,
    defense: stats.defense,
    offense: stats.offense,
    speed: stats.speed,
    experience: stats.experience,
    money: stats.money,
    bossFlag: stats.boss ?? tier >= 4,
    actions: physicalAttestationActions(),
    itemDropped: 0,
    itemRarity: { numerator: 1, denominator: 128 }
  };
  const group = {
    id: groupId,
    background1: stats.background1,
    background2: stats.background2,
    enemyIds: [enemyId],
    entries: [{ id: enemyId, amount: 1 }]
  };
  return {
    battleData: {
      ...base,
      enemies: [...base.enemies.filter((entry) => entry.id !== enemyId), enemy],
      groups: [...base.groups.filter((entry) => entry.id !== groupId), group]
    },
    groupId,
    enemyId
  };
}

export function attestationBattleTier(
  check: DrifellaSourceCheck,
  battles: AttestationBattles | undefined
): 1 | 2 | 3 | 4 {
  const mapped = battles?.checks.find((entry) => entry.checkId === check.id)?.tier ?? check.tier;
  return clampTier(mapped);
}

export function regionLabel(region: string): string {
  return region
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

function defaultAttestationTierStats(tier: 1 | 2 | 3 | 4): AttestationBattles["tierStats"][string] {
  switch (tier) {
    case 1:
      return { tier, level: 2, hp: 34, offense: 8, defense: 6, speed: 4, experience: 8, money: 5, background1: 49, background2: 0 };
    case 2:
      return { tier, level: 8, hp: 86, offense: 18, defense: 20, speed: 7, experience: 90, money: 20, background1: 63, background2: 0 };
    case 3:
      return { tier, level: 14, hp: 165, offense: 30, defense: 38, speed: 11, experience: 360, money: 55, background1: 158, background2: 0 };
    case 4:
      return { tier, level: 20, hp: 320, offense: 42, defense: 54, speed: 15, experience: 980, money: 120, background1: 262, background2: 0, boss: true };
  }
}

function physicalAttestationActions(): BattleData["enemies"][number]["actions"] {
  return [
    { id: 4, arg: 0, actionId: 4, actionType: 1, target: 1, direction: "enemy", name: "attacks" },
    { id: 106, arg: 0, actionId: 106, actionType: 1, target: 1, direction: "enemy", name: "presses the record" },
    { id: 4, arg: 0, actionId: 4, actionType: 1, target: 1, direction: "enemy", name: "attacks" },
    { id: 109, arg: 0, actionId: 109, actionType: 1, target: 1, direction: "enemy", name: "cites the receipt" }
  ];
}

function clampTier(value: number): 1 | 2 | 3 | 4 {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

function gatedQuestionPool(check: DrifellaSourceCheck, flags: FlagReader): SourceCheckQuestion[] {
  const gated = check.questions.pool.filter((question) => !question.spoilerGateFlag || flags.has(question.spoilerGateFlag));
  return gated.length >= check.questions.drawCount ? gated : check.questions.pool;
}

function prepareDrawnQuestion(
  question: SourceCheckQuestion,
  sourceIndex: number,
  checkId: string,
  attempt: number,
  drawIndex: number
): DrawnSourceCheckQuestion {
  if (question.type === "trueFalse") {
    const correctOptionIndex = question.answer ? 0 : 1;
    return {
      sourceIndex,
      type: question.type,
      prompt: question.prompt,
      options: [...TRUE_FALSE_OPTIONS],
      correctOptionIndex,
      ...(question.failLine ? { failLine: question.failLine } : {})
    };
  }
  const order = shuffle([0, 1, 2, 3], `${checkId}:options:${attempt}:${sourceIndex}:${drawIndex}`);
  return {
    sourceIndex,
    type: question.type,
    prompt: question.prompt,
    options: order.map((index) => question.options[index] ?? ""),
    correctOptionIndex: order.indexOf(question.answerIndex),
    ...(question.failLine ? { failLine: question.failLine } : {})
  };
}

// Category difficulty, easiest → hardest. "art"/"vibe" lean on real-world or
// intuitive knowledge (approachable); "lore" is learnable world-rules; "witnessed"
// requires having seen a specific one-time event in the game (hardest to recall).
function categoryDifficulty(category: SourceCheckQuestion["category"]): number {
  switch (category) {
    case "art":
    case "vibe":
      return 0;
    case "lore":
      return 1;
    case "witnessed":
    default:
      return 2;
  }
}

// The difficulty a tier should skew toward: tier 1 wants easy (0), tier 4 wants
// hard (2), middle tiers land on learnable lore (1).
function tierDifficultyTarget(tier: number): number {
  if (tier <= 1) return 0;
  if (tier >= 4) return 2;
  return 1;
}

// Weight a question by how well its category matches the tier's target difficulty:
// on-target = 1, one step off = 1/3, two steps off = 1/9. Higher weight = drawn sooner.
function questionCategoryWeight(category: SourceCheckQuestion["category"], tier: number): number {
  const distance = Math.abs(categoryDifficulty(category) - tierDifficultyTarget(tier));
  return 3 ** -distance;
}

// Seeded weighted permutation (Efraimidis–Spirakis): each item gets key u^(1/weight);
// sorting by descending key yields a weighted sample-without-replacement order, so
// higher-weight (on-target-difficulty) questions land first while every question stays
// reachable. Deterministic per (check, salt). An all-same-weight pool degrades to a
// plain seeded shuffle, preserving prior behavior for untagged pools.
function weightedQuestionOrder<T extends { question: SourceCheckQuestion }>(
  items: readonly T[],
  check: DrifellaSourceCheck,
  salt: string
): T[] {
  const rng = createStatefulRng(hashSeed(`${check.id}:qweight${salt}`));
  return items
    .map((item) => {
      const weight = questionCategoryWeight(item.question.category, check.tier);
      return { item, key: Math.pow(rng.next(), 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.item);
}

function shuffle<T>(items: readonly T[], seed: string): T[] {
  const output = [...items];
  const rng = createStatefulRng(hashSeed(seed));
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex] as T, output[index] as T];
  }
  return output;
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const normalized = ((Math.floor(offset) % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function regionOrder(region: string): number {
  const index = WORLD_REGION_ORDER.indexOf(region);
  return index >= 0 ? index : WORLD_REGION_ORDER.length;
}
