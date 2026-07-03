import type {
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
  const ordered = check.retry.rotatePool
    ? rotate(shuffle(indexed, `${check.id}:questions`), ((normalizedAttempt - 1) * drawCount) % indexed.length)
    : shuffle(indexed, `${check.id}:questions:${normalizedAttempt}`);
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

export function regionLabel(region: string): string {
  return region
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
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
