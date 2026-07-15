import type { CustomDialogue, NpcInteraction, OpeningClarity } from "@eb/schemas";

export const GENERATED_DRIFELLA_BARK_SOURCE = "generated:drifella-barks";

export type RuntimeCustomDialogueEntry = NpcInteraction & {
  generated?: {
    source: typeof GENERATED_DRIFELLA_BARK_SOURCE;
  };
};

export type RuntimeCustomDialogue = Omit<CustomDialogue, "byNpcId"> & {
  byNpcId: Record<string, RuntimeCustomDialogueEntry>;
  variantsByNpcId?: OpeningClarity["dialogueVariantsByNpcId"];
};

export type CustomDialogueLookup = Pick<RuntimeCustomDialogue, "byNpcId" | "byTextPointer" | "variantsByNpcId">;

export type StoryFlagReader = {
  has(flag: string): boolean;
};

export function resolveRuntimeNpcDialogue(
  dialogue: CustomDialogueLookup | undefined,
  npcId: number,
  flags: StoryFlagReader
): RuntimeCustomDialogueEntry | undefined {
  const variants = dialogue?.variantsByNpcId?.[String(npcId)] ?? [];
  const variant = variants.find((entry) =>
    entry.requireFlags.every((flag) => flags.has(flag))
    && entry.blockFlags.every((flag) => !flags.has(flag))
  );
  const base = dialogue?.byNpcId[String(npcId)];
  return variant ? { ...base, pages: [...variant.pages], ref: undefined } : base;
}

export function isGeneratedDrifellaBarkEntry(
  entry: RuntimeCustomDialogueEntry | undefined
): entry is RuntimeCustomDialogueEntry & { generated: { source: typeof GENERATED_DRIFELLA_BARK_SOURCE } } {
  return entry?.generated?.source === GENERATED_DRIFELLA_BARK_SOURCE;
}
