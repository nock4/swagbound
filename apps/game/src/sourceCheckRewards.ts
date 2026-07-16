import type { CardNfts, DrifellaSourceCheck, ItemCollection } from "@eb/schemas";
import type { ChunkedWorldRestore } from "./battleReturn";
import { PartyState } from "./partyState";
import { cardById, resolveSourceCheckRewards } from "./sourceCheckModel";

export type AppliedSourceCheckReward = {
  itemGiven: boolean;
  itemHeld: boolean;
  cardId: string;
  cardName: string;
  itemName: string;
};

export function attestationRewardDialoguePages(options: {
  drifellaName: string;
  cardName: string;
  itemName: string;
  itemHeld: boolean;
}): string[] {
  return [
    `${options.drifellaName}: Congratulations on attesting. Here is your reward.`,
    `${options.cardName}\n${options.itemHeld ? "Item held" : "Item"}: ${options.itemName}`
  ];
}

export function applySourceCheckRewardToRestore(options: {
  check: DrifellaSourceCheck;
  cards: CardNfts;
  items?: ItemCollection;
  restore: ChunkedWorldRestore;
}): AppliedSourceCheckReward {
  const party = new PartyState();
  party.restore(options.restore.party);
  const leadCharId = options.restore.party.partyIds[0] ?? 0;
  const result = resolveSourceCheckRewards(options.check, leadCharId, (charId, itemId) => party.give(charId, itemId));
  options.restore.party = party.snapshot();
  for (const flag of result.flagsToSet) {
    setRestoreFlag(options.restore, flag);
  }
  for (const flag of result.flagsToClear) {
    clearRestoreFlag(options.restore, flag);
  }
  options.restore.sourceCheck = {
    id: options.check.id,
    outcome: "cleared",
    awardedCardId: options.check.rewards.cardId,
    worldPixel: { ...options.check.placement.worldPixel }
  };
  return {
    itemGiven: result.itemGiven,
    itemHeld: result.itemHeld,
    cardId: options.check.rewards.cardId,
    cardName: cardById(options.cards, options.check.rewards.cardId)?.name ?? options.check.rewards.cardId,
    itemName: itemName(options.items, options.check.rewards.itemId)
  };
}

function setRestoreFlag(restore: ChunkedWorldRestore, flag: string): void {
  if (!restore.flags.strings.includes(flag)) {
    restore.flags.strings.push(flag);
  }
}

function clearRestoreFlag(restore: ChunkedWorldRestore, flag: string): void {
  restore.flags.strings = restore.flags.strings.filter((entry) => entry !== flag);
}

function itemName(items: ItemCollection | undefined, itemId: number): string {
  return items?.items.find((item) => item.id === itemId)?.name.trim() || `item ${itemId}`;
}
