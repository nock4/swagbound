import type {
  BackgroundOverrideEntry,
  BackgroundOverrides,
  BattleBackground
} from "@eb/schemas";
import { stableAssetPathHash } from "./spriteOverrides";

const BACKGROUND_OVERRIDE_IMAGE_KEY_PREFIX = "battle-background-override-";

export function resolveBackgroundOverrideEntry(
  overrides: BackgroundOverrides | undefined,
  ebBackgroundId: number
): { entryId: string; entry: BackgroundOverrideEntry } | undefined {
  const entryId = overrides?.byBackgroundId?.[String(ebBackgroundId)] ?? overrides?.default;
  if (!overrides || !entryId) {
    return undefined;
  }
  const entry = overrides.entries[entryId];
  return entry ? { entryId, entry } : undefined;
}

export function backgroundOverrideImageKey(entryId: string, image: string): string {
  return `${BACKGROUND_OVERRIDE_IMAGE_KEY_PREFIX}${entryId}-${stableAssetPathHash(image)}`;
}

export function backgroundOverrideAssetUrl(image: string): string {
  return `/${image.replace(/^\/+/, "")}`;
}

export function toBattleBackground(entry: BackgroundOverrideEntry): BattleBackground {
  return {
    id: 0,
    distortion: { ...entry.distortion, kind: entry.distortionType ?? entry.distortion?.kind },
    scroll: entry.scroll
  };
}
