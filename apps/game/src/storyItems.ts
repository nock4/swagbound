import type { OverworldInteractable, StoryItem, StoryItems } from "@eb/schemas";

export type StoryItemFlagReader = {
  has(flag: string): boolean;
};

export type StoryItemsReader = Pick<StoryItems, "items"> | undefined;

export type PresentSpriteTextureIssue =
  | { kind: "missingStoryItem"; storyItemId: string }
  | { kind: "missingStoryTexture"; storyItemId: string; textureKey: string };

export type PresentSpriteTextureChoice = {
  textureKey: string;
  visible: boolean;
  hideWhenOpened: boolean;
  storyItemId?: string;
  issue?: PresentSpriteTextureIssue;
};

export function storyItemById(storyItems: StoryItemsReader, id: string | undefined): StoryItem | undefined {
  const normalized = id?.trim();
  return normalized ? storyItems?.items.find((item) => item.id === normalized) : undefined;
}

export function storyItemByItemId(storyItems: StoryItemsReader, itemId: number | undefined): StoryItem | undefined {
  return Number.isInteger(itemId)
    ? storyItems?.items.find((item) => item.itemId === itemId)
    : undefined;
}

export function isStoryItemAcquired(flags: StoryItemFlagReader, storyItem: StoryItem): boolean {
  return flags.has(storyItem.pickupFlag);
}

export function storyItemWorldAssetUrl(storyItem: Pick<StoryItem, "worldAsset">): string {
  return `/${storyItem.worldAsset.replace(/^\/+/, "")}`;
}

export function resolvePresentSpriteTexture(
  entry: Pick<Extract<OverworldInteractable, { kind: "present" }>, "storyItemId">,
  options: {
    opened: boolean;
    storyItems: StoryItemsReader;
    textureExists: (textureKey: string) => boolean;
    genericClosedTexture: string;
    genericOpenTexture: string;
  }
): PresentSpriteTextureChoice {
  const genericTexture = options.opened ? options.genericOpenTexture : options.genericClosedTexture;
  if (!entry.storyItemId) {
    return { textureKey: genericTexture, visible: true, hideWhenOpened: false };
  }
  const storyItem = storyItemById(options.storyItems, entry.storyItemId);
  if (!storyItem) {
    return {
      textureKey: genericTexture,
      visible: true,
      hideWhenOpened: false,
      issue: { kind: "missingStoryItem", storyItemId: entry.storyItemId }
    };
  }
  if (!options.textureExists(storyItem.worldTexture)) {
    return {
      textureKey: genericTexture,
      visible: true,
      hideWhenOpened: false,
      storyItemId: storyItem.id,
      issue: {
        kind: "missingStoryTexture",
        storyItemId: storyItem.id,
        textureKey: storyItem.worldTexture
      }
    };
  }
  return {
    textureKey: storyItem.worldTexture,
    visible: !options.opened,
    hideWhenOpened: true,
    storyItemId: storyItem.id
  };
}

export function presentSpriteTextureIssueMessage(
  entryId: string,
  issue: PresentSpriteTextureIssue
): string {
  switch (issue.kind) {
    case "missingStoryItem":
      return `Story present ${entryId} references unknown story item ${issue.storyItemId}; using generic present texture.`;
    case "missingStoryTexture":
      return `Story present ${entryId} references story item ${issue.storyItemId} but texture ${issue.textureKey} is missing; using generic present texture.`;
  }
}
