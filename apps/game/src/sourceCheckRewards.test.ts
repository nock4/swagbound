import { describe, expect, it } from "vitest";
import type { CardNfts, DrifellaSourceCheck } from "@eb/schemas";
import { pendingAttestationRewardForReturn, type ChunkedWorldRestore } from "./battleReturn";
import {
  applySourceCheckRewardToRestore,
  attestationRewardDialoguePages
} from "./sourceCheckRewards";
import { cardOwnedFlag, sourceCheckClearedFlag } from "./sourceCheckModel";

describe("Attestation reward restore", () => {
  it("commits the reward flags, item, clear result, and awarded card id together", () => {
    const restore = emptyRestore();
    const result = applySourceCheckRewardToRestore({
      check: sourceCheck(),
      cards: cards(),
      restore
    });

    expect(result).toMatchObject({
      itemGiven: true,
      itemHeld: false,
      cardId: "card-nft-2-10464",
      cardName: "Morningside Card NFT: Card #10464"
    });
    expect(restore.flags.strings).toEqual(expect.arrayContaining([
      sourceCheckClearedFlag("morningside-test"),
      cardOwnedFlag("card-nft-2-10464")
    ]));
    expect(restore.party.inventory.find((entry) => entry.charId === 1)?.itemIds).toContain(88);
    expect(restore.sourceCheck).toEqual({
      id: "morningside-test",
      outcome: "cleared",
      awardedCardId: "card-nft-2-10464",
      worldPixel: { x: 100, y: 120 }
    });
  });

  it.each(["correct-answer", "combat-win"])(
    "sets the pending ceremony reward on the %s return path",
    () => {
      const restore = emptyRestore();
      applySourceCheckRewardToRestore({
        check: sourceCheck(),
        cards: cards(),
        restore
      });

      expect(pendingAttestationRewardForReturn(restore.sourceCheck)).toEqual({
        checkId: "morningside-test",
        cardId: "card-nft-2-10464"
      });
    }
  );

  it("names the speaker and full rewards without an ellipsis", () => {
    const pages = attestationRewardDialoguePages({
      drifellaName: "Drifella Clerk",
      cardName: "Morningside Card NFT: Card #10464",
      itemName: "Town map",
      itemHeld: false
    });

    expect(pages[0]).toBe("Drifella Clerk: Congratulations on attesting. Here is your reward.");
    expect(pages.join("\n")).toContain("Morningside Card NFT: Card #10464");
    expect(pages.join("\n")).toContain("Item: Town map");
    expect(pages.join("\n")).not.toContain("...");
  });
});

function emptyRestore(): ChunkedWorldRestore {
  return {
    player: { x: 100, y: 120, facing: "down" },
    flags: { strings: [], numeric: [] },
    party: {
      wallet: 0,
      bank: 0,
      partyIds: [1],
      inventory: [{ charId: 1, itemIds: [] }],
      equipped: []
    },
    encounter: { enabled: true, cooldownMs: 0, rngSeed: 1 },
    source: "event"
  };
}

function sourceCheck(): DrifellaSourceCheck {
  return {
    id: "morningside-test",
    drifellaId: "drifella2-clerk",
    drifellaName: "Drifella Clerk",
    npcId: 100300,
    region: "morningside",
    tier: 1,
    placement: {
      kind: "test",
      worldPixel: { x: 100, y: 120 },
      facing: "down"
    },
    visibility: { requireFlags: [], blockFlags: [] },
    battleSprite: "assets/test.png",
    hints: [],
    entryPrompt: ["Ready?"],
    questions: {
      drawCount: 1,
      pool: [{ type: "trueFalse", prompt: "Ready?", answer: true }]
    },
    rewards: { cardId: "card-nft-2-10464", itemId: 88 },
    retry: { policy: "leaveArea", rotatePool: true, checkpointAt: null },
    reactions: {
      correct: ["Correct."],
      cleared: ["Cleared."],
      failed: ["Failed."],
      alreadyCleared: ["Already."]
    }
  };
}

function cards(): CardNfts {
  return {
    schema: "swagbound.card-nfts.v1",
    cards: [{
      id: "card-nft-2-10464",
      name: "Morningside Card NFT: Card #10464",
      collection: "card-nft-2",
      tokenRef: "10464",
      image: "assets/card.png",
      thumb: "assets/card-thumb.png",
      rarity: "source-grade",
      region: "morningside",
      sortIndex: 1,
      caption: "Earned from an Attestation in Morningside.",
      silhouetteHint: "Filed locally."
    }]
  };
}
