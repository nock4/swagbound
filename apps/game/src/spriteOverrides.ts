import type { SpriteOverride } from "@eb/schemas";
import type { DirectionFrameSequence, Facing } from "./playerController";

type SpriteOverrideFrameSource = Pick<SpriteOverride, "animations">;

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

function nonEmptyFrames(frames: readonly number[]): readonly [number, ...number[]] {
  return frames.length > 0 ? frames as [number, ...number[]] : [0];
}
