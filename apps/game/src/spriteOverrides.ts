import type { SpriteOverride, SpriteOverrides } from "@eb/schemas";
import type { DirectionFrameSequence, Facing } from "./playerController";

type SpriteOverrideFrameSource = Pick<SpriteOverride, "animations">;

export const PLAYER_SPRITE_OVERRIDE_SHEET_KEY = "sprite-override-player";
const NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX = "sprite-override-npc-";

export function spriteOverrideFrame(
  facing: Facing,
  step: number,
  override: SpriteOverrideFrameSource
): number {
  const frames = override.animations[facing];
  const index = Math.max(0, Math.floor(step)) % frames.length;
  return frames[index] ?? 0;
}

export function spriteOverrideScale(displayHeight: number | undefined, frameHeight: number): number {
  if (displayHeight === undefined) {
    return 1;
  }
  return displayHeight / frameHeight;
}

export function spriteOverrideDirectionFrames(override: SpriteOverrideFrameSource): DirectionFrameSequence {
  return {
    up: nonEmptyFrames(override.animations.up),
    right: nonEmptyFrames(override.animations.right),
    down: nonEmptyFrames(override.animations.down),
    left: nonEmptyFrames(override.animations.left)
  };
}

export function spriteOverrideAssetUrl(image: string): string {
  return `/${image.replace(/^\/+/, "")}`;
}

export function spriteOverrideForNpcId(
  overrides: Pick<SpriteOverrides, "byNpcId"> | undefined,
  npcId: number
): SpriteOverride | undefined {
  return overrides?.byNpcId?.[String(npcId)];
}

export function spriteOverrideNpcEntries(
  overrides: Pick<SpriteOverrides, "byNpcId"> | undefined
): Array<[number, SpriteOverride]> {
  return Object.entries(overrides?.byNpcId ?? {}).flatMap(([rawNpcId, override]) => {
    const npcId = Number.parseInt(rawNpcId, 10);
    return Number.isSafeInteger(npcId) && String(npcId) === rawNpcId ? [[npcId, override] as [number, SpriteOverride]] : [];
  });
}

export function spriteOverrideNpcSheetKey(npcId: number): string {
  return `${NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX}${npcId}`;
}

export function spriteOverrideNpcIdFromSheetKey(key: string): number | undefined {
  if (!key.startsWith(NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX)) {
    return undefined;
  }
  const rawNpcId = key.slice(NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX.length);
  const npcId = Number.parseInt(rawNpcId, 10);
  return Number.isSafeInteger(npcId) && String(npcId) === rawNpcId ? npcId : undefined;
}

function nonEmptyFrames(frames: readonly number[]): readonly [number, ...number[]] {
  return frames.length > 0 ? frames as [number, ...number[]] : [0];
}
