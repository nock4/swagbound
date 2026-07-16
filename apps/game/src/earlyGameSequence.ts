import type { EarlyGameSequence, OpeningClarity } from "@eb/schemas";

type OpeningOverlaySource = "opening-clarity" | "narrative-redesign";

export function suppressOwnedOpeningClarity(
  clarity: OpeningClarity | undefined,
  sequence: EarlyGameSequence,
  source: OpeningOverlaySource,
  dev: boolean
): OpeningClarity | undefined {
  if (!clarity) {
    return clarity;
  }

  const ownedSpriteNpcIds = new Set(sequence.ownership.spriteOverrideNpcIds.map(String));
  const ownedDialogueKeys = new Set(sequence.ownership.dialogueKeys);
  const suppress = (path: string): void => {
    if (dev) {
      console.warn(
        `[loader] early-game-sequence: suppressed ${source}.${path} (owned by early-game-sequence)`
      );
    }
  };

  return {
    ...clarity,
    cutsceneDialogueById: withoutOwnedKeys(
      clarity.cutsceneDialogueById,
      ownedDialogueKeys,
      "cutsceneDialogueById",
      suppress
    ),
    storyTriggerDialogueById: withoutOwnedKeys(
      clarity.storyTriggerDialogueById,
      ownedDialogueKeys,
      "storyTriggerDialogueById",
      suppress
    ),
    dialogue: {
      ...clarity.dialogue,
      byNpcId: withoutOwnedKeys(
        clarity.dialogue.byNpcId,
        ownedDialogueKeys,
        "dialogue.byNpcId",
        suppress
      ),
      byTextPointer: withoutOwnedKeys(
        clarity.dialogue.byTextPointer,
        ownedDialogueKeys,
        "dialogue.byTextPointer",
        suppress
      )
    },
    dialogueVariantsByNpcId: withoutOwnedKeys(
      clarity.dialogueVariantsByNpcId,
      ownedDialogueKeys,
      "dialogueVariantsByNpcId",
      suppress
    ),
    spriteOverrides: {
      ...clarity.spriteOverrides,
      byNpcId: withoutOwnedKeys(
        clarity.spriteOverrides.byNpcId,
        ownedSpriteNpcIds,
        "spriteOverrides.byNpcId",
        suppress
      )
    }
  };
}

function withoutOwnedKeys<T>(
  entries: Record<string, T>,
  ownedKeys: ReadonlySet<string>,
  path: string,
  onSuppression: (path: string) => void
): Record<string, T> {
  let resolved = entries;
  for (const key of ownedKeys) {
    if (!Object.hasOwn(entries, key)) {
      continue;
    }
    if (resolved === entries) {
      resolved = { ...entries };
    }
    delete resolved[key];
    onSuppression(`${path}.${key}`);
  }
  return resolved;
}
