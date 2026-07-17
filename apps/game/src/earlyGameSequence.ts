import type { EarlyGameSequence, NpcInteraction, OpeningClarity } from "@eb/schemas";

const OPENING_WAKE_COMPLETION_FLAGS = [
  "intro:flyover-done",
  "intro:wake-done"
] as const;

type OpeningOverlaySource = "opening-clarity" | "narrative-redesign";

export function openingWakeDialoguePages(sequence: EarlyGameSequence): string[] | undefined {
  const pages = sequence.dialogue.wake;
  return sequence.phaseGatesEnabled && pages && pages.length > 0
    ? [...pages]
    : undefined;
}

export function openingWakeCompletionFlags(sequence: EarlyGameSequence): string[] {
  return sequence.phaseGatesEnabled ? [...OPENING_WAKE_COMPLETION_FLAGS] : [];
}

export function openingOwnedNpcEnabled(sequence: EarlyGameSequence, npcId: number): boolean {
  return sequence.phaseGatesEnabled || !sequence.ownership.npcIds.includes(npcId);
}

/** Resolve an added-NPC ref from the authoritative opening dialogue map when owned there. */
export function resolveEarlyGameDialogueInteraction(
  interaction: NpcInteraction | undefined,
  sequence: EarlyGameSequence
): NpcInteraction | undefined {
  if (!interaction?.ref) {
    return interaction;
  }
  const pages = sequence.dialogue[interaction.ref];
  if (!pages || pages.length === 0) {
    return interaction;
  }
  const { ref: _ref, ...rest } = interaction;
  return { ...rest, pages: [...pages] };
}

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
      // NPC-ID-KEYED maps must be filtered by the owned CAST (npc ids), not by
      // scene dialogue keys: an npc id like "15" never matches "wake", so the
      // old dialogueKeys filter silently suppressed nothing and legacy overlay
      // lines (retired derivative-era narration) kept winning over the
      // opening's recast house NPCs.
      byNpcId: withoutOwnedKeys(
        clarity.dialogue.byNpcId,
        ownedSpriteNpcIds,
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
      ownedSpriteNpcIds,
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
