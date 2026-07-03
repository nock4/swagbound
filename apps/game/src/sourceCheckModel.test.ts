import { describe, expect, it } from "vitest";
import type { CardNfts, DrifellaSourceCheck } from "@eb/schemas";
import {
  answerSourceCheckQuestion,
  buildBinderViewModel,
  cardOwnedFlag,
  drawSourceCheckQuestions,
  resolveSourceCheckRewards,
  sourceCheckCanRetry,
  sourceCheckClearedFlag,
  sourceCheckItemHeldFlag
} from "./sourceCheckModel";

const FLAGS_NONE = { has: () => false };

function check(overrides: Partial<DrifellaSourceCheck> = {}): DrifellaSourceCheck {
  return {
    id: "sourcecheck-test",
    drifellaId: "drifella2-test",
    npcId: 100300,
    region: "morningside",
    tier: 1,
    placement: {
      kind: "test",
      worldPixel: { x: 100, y: 120 },
      facing: "down"
    },
    visibility: {
      requireFlags: [],
      blockFlags: []
    },
    battleSprite: "assets/test.png",
    hints: [],
    entryPrompt: ["Ready?"],
    questions: {
      drawCount: 2,
      pool: [
        { type: "trueFalse", prompt: "A?", answer: true },
        { type: "trueFalse", prompt: "B?", answer: false },
        { type: "trueFalse", prompt: "C?", answer: true },
        { type: "multipleChoice4", prompt: "D?", options: ["A", "B", "C", "D"], answerIndex: 2 }
      ]
    },
    rewards: {
      cardId: "card-a",
      itemId: 88
    },
    retry: {
      policy: "leaveArea",
      rotatePool: true,
      checkpointAt: null
    },
    reactions: {
      correct: ["Correct."],
      cleared: ["Cleared."],
      failed: ["Failed."],
      alreadyCleared: ["Already."]
    },
    ...overrides
  };
}

describe("drawSourceCheckQuestions", () => {
  it("draws deterministically for the same check and attempt", () => {
    const first = drawSourceCheckQuestions(check(), FLAGS_NONE, 1);
    const second = drawSourceCheckQuestions(check(), FLAGS_NONE, 1);

    expect(second.questions.map((question) => question.prompt)).toEqual(first.questions.map((question) => question.prompt));
    expect(second.questions.map((question) => question.options)).toEqual(first.questions.map((question) => question.options));
  });

  it("rotates attempts through unseen questions when rotatePool is enabled", () => {
    const first = drawSourceCheckQuestions(check(), FLAGS_NONE, 1);
    const second = drawSourceCheckQuestions(check(), FLAGS_NONE, 2);

    expect(second.questions.map((question) => question.sourceIndex)).not.toEqual(first.questions.map((question) => question.sourceIndex));
    expect(new Set([...first.questions, ...second.questions].map((question) => question.sourceIndex)).size).toBe(4);
  });

  it("preserves multiple-choice correctness after option shuffle", () => {
    const draw = drawSourceCheckQuestions(check({
      questions: {
        drawCount: 1,
        pool: [
          { type: "multipleChoice4", prompt: "Pick C.", options: ["A", "B", "C", "D"], answerIndex: 2 }
        ]
      }
    }), FLAGS_NONE, 3);
    const question = draw.questions[0];

    expect(question.options[question.correctOptionIndex]).toBe("C");
    expect(answerSourceCheckQuestion(question, question.correctOptionIndex)).toBe(true);
    expect(answerSourceCheckQuestion(question, (question.correctOptionIndex + 1) % 4)).toBe(false);
  });
});

describe("source check rewards and retry", () => {
  it("sets perfect-clear ownership flags when the item fits", () => {
    const result = resolveSourceCheckRewards(check(), 0, () => true);

    expect(result).toMatchObject({
      itemGiven: true,
      itemHeld: false
    });
    expect(result.flagsToSet).toEqual([
      sourceCheckClearedFlag("sourcecheck-test"),
      cardOwnedFlag("card-a")
    ]);
    expect(result.flagsToClear).toEqual([sourceCheckItemHeldFlag("sourcecheck-test")]);
  });

  it("sets itemHeld when the lead inventory is full", () => {
    const result = resolveSourceCheckRewards(check(), 0, () => false);

    expect(result.itemGiven).toBe(false);
    expect(result.flagsToSet).toContain(sourceCheckItemHeldFlag("sourcecheck-test"));
  });

  it("requires leaving the 400px retry radius", () => {
    expect(sourceCheckCanRetry(399.9)).toBe(false);
    expect(sourceCheckCanRetry(400)).toBe(true);
  });
});

describe("buildBinderViewModel", () => {
  it("counts owned cards by region", () => {
    const cards: CardNfts = {
      schema: "swagbound.card-nfts.v1",
      cards: [
        card("card-a", "morningside", 2),
        card("card-b", "morningside", 1),
        card("card-c", "postwick", 1)
      ]
    };
    const flags = new Set([cardOwnedFlag("card-a"), cardOwnedFlag("card-c")]);

    const binder = buildBinderViewModel(cards, { has: (flag) => flags.has(flag) });

    expect(binder.owned).toBe(2);
    expect(binder.total).toBe(3);
    expect(binder.regions.map((region) => region.label)).toEqual(["MORNINGSIDE - 1/2", "POSTWICK - 1/1"]);
    expect(binder.cardsByRegion.morningside.map((entry) => entry.cardId)).toEqual(["card-b", "card-a"]);
  });
});

function card(id: string, region: string, sortIndex: number): CardNfts["cards"][number] {
  return {
    id,
    name: `Card ${id}`,
    collection: "card-nft-2",
    tokenRef: id,
    image: `assets/${id}.png`,
    thumb: `assets/thumbs/${id}.png`,
    rarity: "common",
    region,
    sortIndex,
    caption: `Caption ${id}`,
    silhouetteHint: "missing shape"
  };
}
