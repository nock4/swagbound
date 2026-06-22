import type { SpriteOverride, SpriteOverrides } from "@eb/schemas";
import type { DirectionFrameSequence, Facing } from "./playerController";

export type SpriteOverrideSheet = SpriteOverride & {
  animations: NonNullable<SpriteOverride["animations"]>;
  frameHeight: number;
  frameWidth: number;
};
type SpriteOverrideFrameSource = Pick<SpriteOverride, "animations">;
type SpriteOverrideImageSize = {
  width: number;
  height: number;
};
type SpriteOverrideFitBox = {
  maxWidth: number;
  maxHeight: number;
  maxScale?: number;
};
export type ResolvedSpriteOverrideImage = {
  frameWidth: number;
  frameHeight: number;
  displayWidth: number;
  displayHeight: number;
  scale: number;
};

export const PLAYER_SPRITE_OVERRIDE_SHEET_KEY = "sprite-override-player";
const NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX = "sprite-override-npc-";
const GROUP_SPRITE_OVERRIDE_SHEET_KEY_PREFIX = "sprite-override-group-";
const ENEMY_SPRITE_OVERRIDE_IMAGE_KEY_PREFIX = "sprite-override-enemy-";

export function spriteOverrideFrame(
  facing: Facing,
  step: number,
  override: SpriteOverrideFrameSource
): number {
  const frames = override.animations?.[facing] ?? [0];
  const index = Math.max(0, Math.floor(step)) % frames.length;
  return frames[index] ?? 0;
}

/** Procedural walk-bob tunables. */
export const SPRITE_WALK_BOB_AMPLITUDE_PX = 2.5;
export const SPRITE_WALK_BOB_FREQUENCY = 0.0095; // radians per ms; |sin| period ~= 3 hops/sec
export const SPRITE_WALK_BOB_PHASE_STEP = 1.3; // per-seed phase offset so sprites don't bob in lockstep

/**
 * Vertical walk-bob offset (px, >= 0) for an overworld sprite. Single-frame
 * Swagbound skins have no walk-cycle frames, so while they move they hop in place.
 * Returns 0 for idle sprites and for multi-frame sprites (raw EarthBound / player
 * walk cycles) that already animate via frame cycling. Purely visual: callers
 * apply it to display-y AFTER depth sort, so it never affects sort order or logic.
 */
export function spriteWalkBobOffset(params: {
  clockMs: number;
  seed: number;
  moving: boolean;
  frameCount: number;
}): number {
  if (!params.moving || params.frameCount > 1) {
    return 0;
  }
  const phase =
    params.clockMs * SPRITE_WALK_BOB_FREQUENCY + params.seed * SPRITE_WALK_BOB_PHASE_STEP;
  return Math.abs(Math.sin(phase)) * SPRITE_WALK_BOB_AMPLITUDE_PX;
}

export function spriteOverrideScale(displayHeight: number | undefined, frameHeight: number): number {
  if (displayHeight === undefined) {
    return 1;
  }
  return displayHeight / frameHeight;
}

export function spriteOverrideDirectionFrames(override: SpriteOverrideFrameSource): DirectionFrameSequence {
  return {
    up: nonEmptyFrames(override.animations?.up),
    right: nonEmptyFrames(override.animations?.right),
    down: nonEmptyFrames(override.animations?.down),
    left: nonEmptyFrames(override.animations?.left)
  };
}

export function spriteOverrideAssetUrl(image: string): string {
  return `/${image.replace(/^\/+/, "")}`;
}

export function spriteOverrideSheet(override: SpriteOverride | undefined): SpriteOverrideSheet | undefined {
  return override && override.frameWidth !== undefined && override.frameHeight !== undefined && override.animations
    ? override as SpriteOverrideSheet
    : undefined;
}

export function spriteOverrideForNpcId(
  overrides: Pick<SpriteOverrides, "byNpcId"> | undefined,
  npcId: number
): SpriteOverride | undefined {
  return overrides?.byNpcId?.[String(npcId)];
}

export function spriteOverrideForSpriteGroup(
  overrides: Pick<SpriteOverrides, "bySpriteGroup"> | undefined,
  spriteGroup: number | undefined
): SpriteOverride | undefined {
  return spriteGroup === undefined ? undefined : overrides?.bySpriteGroup?.[String(spriteGroup)];
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

export function spriteOverrideGroupEntries(
  overrides: Pick<SpriteOverrides, "bySpriteGroup"> | undefined
): Array<[number, SpriteOverride]> {
  return Object.entries(overrides?.bySpriteGroup ?? {}).flatMap(([rawSpriteGroup, override]) => {
    const spriteGroup = Number.parseInt(rawSpriteGroup, 10);
    return Number.isSafeInteger(spriteGroup) && String(spriteGroup) === rawSpriteGroup
      ? [[spriteGroup, override] as [number, SpriteOverride]]
      : [];
  });
}

export function spriteOverrideGroupSheetKey(spriteGroup: number, image: string): string {
  return `${GROUP_SPRITE_OVERRIDE_SHEET_KEY_PREFIX}${spriteGroup}-${stableAssetPathHash(image)}`;
}

export function spriteOverrideSpriteGroupFromSheetKey(key: string): number | undefined {
  if (!key.startsWith(GROUP_SPRITE_OVERRIDE_SHEET_KEY_PREFIX)) {
    return undefined;
  }
  const [, rawSpriteGroup] = /^sprite-override-group-(\d+)-[0-9a-z]+$/.exec(key) ?? [];
  if (!rawSpriteGroup) {
    return undefined;
  }
  const spriteGroup = Number.parseInt(rawSpriteGroup, 10);
  return Number.isSafeInteger(spriteGroup) && String(spriteGroup) === rawSpriteGroup ? spriteGroup : undefined;
}

export function spriteOverrideForEnemyId(
  overrides: Pick<SpriteOverrides, "byEnemyId"> | undefined,
  enemyId: number
): SpriteOverride | undefined {
  return overrides?.byEnemyId?.[String(enemyId)];
}

const ENEMY_OVERWORLD_SPRITE_OVERRIDE_SHEET_KEY_PREFIX = "sprite-override-enemy-ow-";

/** Swagbound skin for a VISIBLE roaming overworld enemy, keyed by EB enemy id. */
export function spriteOverrideForEnemyOverworld(
  overrides: Pick<SpriteOverrides, "overworldByEnemyId"> | undefined,
  enemyId: number
): SpriteOverride | undefined {
  return overrides?.overworldByEnemyId?.[String(enemyId)];
}

export function spriteOverrideEnemyOverworldSheetKey(enemyId: number, image: string): string {
  return `${ENEMY_OVERWORLD_SPRITE_OVERRIDE_SHEET_KEY_PREFIX}${enemyId}-${stableAssetPathHash(image)}`;
}

export function spriteOverrideEnemyEntries(
  overrides: Pick<SpriteOverrides, "byEnemyId"> | undefined
): Array<[number, SpriteOverride]> {
  return Object.entries(overrides?.byEnemyId ?? {}).flatMap(([rawEnemyId, override]) => {
    const enemyId = Number.parseInt(rawEnemyId, 10);
    return Number.isSafeInteger(enemyId) && String(enemyId) === rawEnemyId
      ? [[enemyId, override] as [number, SpriteOverride]]
      : [];
  });
}

export function spriteOverrideEnemyImageKey(enemyId: number, image?: string): string {
  const imageHash = image ? `-${stableAssetPathHash(image)}` : "";
  return `${ENEMY_SPRITE_OVERRIDE_IMAGE_KEY_PREFIX}${enemyId}${imageHash}`;
}

export function resolveSpriteOverrideImageFrame(
  override: Pick<SpriteOverride, "displayHeight" | "displayWidth" | "frameHeight" | "frameWidth">,
  source: SpriteOverrideImageSize,
  fitBox: SpriteOverrideFitBox
): ResolvedSpriteOverrideImage {
  const frameWidth = positiveDimension(override.frameWidth) ?? source.width;
  const frameHeight = positiveDimension(override.frameHeight) ?? source.height;
  const maxScale = Math.min(
    positiveDimension(fitBox.maxScale) ?? Number.POSITIVE_INFINITY,
    fitBox.maxWidth / frameWidth,
    fitBox.maxHeight / frameHeight
  );
  const desiredScale = requestedDisplayScale(override, frameWidth, frameHeight) ?? maxScale;
  const scale = Math.max(0, Math.min(desiredScale, maxScale));
  return {
    frameWidth,
    frameHeight,
    displayWidth: frameWidth * scale,
    displayHeight: frameHeight * scale,
    scale
  };
}

function requestedDisplayScale(
  override: Pick<SpriteOverride, "displayHeight" | "displayWidth">,
  frameWidth: number,
  frameHeight: number
): number | undefined {
  const displayWidth = positiveDimension(override.displayWidth);
  const displayHeight = positiveDimension(override.displayHeight);
  const widthScale = displayWidth === undefined ? undefined : displayWidth / frameWidth;
  const heightScale = displayHeight === undefined ? undefined : displayHeight / frameHeight;
  if (widthScale !== undefined && heightScale !== undefined) {
    return Math.min(widthScale, heightScale);
  }
  return widthScale ?? heightScale;
}

function positiveDimension(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function stableAssetPathHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function nonEmptyFrames(frames: readonly number[] | undefined): readonly [number, ...number[]] {
  return frames && frames.length > 0 ? frames as [number, ...number[]] : [0];
}
