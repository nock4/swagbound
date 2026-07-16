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
export type SpriteOverrideCropRect = { x: number; y: number; width: number; height: number };

export const PLAYER_SPRITE_OVERRIDE_SHEET_KEY = "sprite-override-player";
export const FOLLOWER_SPRITE_OVERRIDE_SHEET_KEY = "sprite-override-follower";
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

/** EB-style step-toggle tunables. */
export const SPRITE_WALK_STEP_INTERVAL_MS = 140; // ~7 swaps/sec, EarthBound walk cadence
export const SPRITE_WALK_STEP_SEED_OFFSET_MS = 61; // per-seed clock shift so crowds don't step in unison

/**
 * Walk step phase (0 or 1) for a moving single-frame sprite. EarthBound never
 * bobs walkers: it hard-swaps two step frames at walk cadence, and many of its
 * own walk cycles get the second frame by MIRRORING the first. Single-frame LSW
 * skins do exactly that: phase 1 renders the frame horizontally mirrored (a
 * weight shift, not a hop). Safe for every facing because single-frame skins
 * show the same camera-facing frame in all directions. Returns 0 for idle
 * sprites and for multi-frame sprites (raw EarthBound / hero walk cycles) that
 * already animate via frame cycling. Purely visual: callers apply it as flipX,
 * so it never affects sort order, collision, or logical position.
 */
export function spriteWalkStepPhase(params: {
  clockMs: number;
  seed: number;
  moving: boolean;
  frameCount: number;
}): 0 | 1 {
  if (!params.moving || params.frameCount > 1) {
    return 0;
  }
  const shifted = params.clockMs + params.seed * SPRITE_WALK_STEP_SEED_OFFSET_MS;
  return Math.floor(shifted / SPRITE_WALK_STEP_INTERVAL_MS) % 2 === 1 ? 1 : 0;
}

/** True when a moving single-frame sprite should render mirrored this step. */
export function spriteWalkMirror(params: {
  clockMs: number;
  seed: number;
  moving: boolean;
  frameCount: number;
}): boolean {
  return spriteWalkStepPhase(params) === 1;
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

export function spriteOverrideNpcSheetKey(npcId: number, image?: string): string {
  const imageHash = image ? `-${stableAssetPathHash(image)}` : "";
  return `${NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX}${npcId}${imageHash}`;
}

export function spriteOverrideNpcIdFromSheetKey(key: string): number | undefined {
  if (!key.startsWith(NPC_SPRITE_OVERRIDE_SHEET_KEY_PREFIX)) {
    return undefined;
  }
  const [, rawNpcId] = /^sprite-override-npc-(\d+)(?:-[0-9a-z]+)?$/.exec(key) ?? [];
  if (!rawNpcId) {
    return undefined;
  }
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

/**
 * Battle overrides may deliberately point at one canonical frame inside an
 * overworld sheet. Phaser loads those overrides as images rather than atlases,
 * so crop the top-left frame when authored frame dimensions are smaller than
 * the source texture. Ordinary single-image battle art remains uncropped.
 */
export function spriteOverrideCropRect(
  override: Pick<SpriteOverride, "frameHeight" | "frameWidth">,
  source: SpriteOverrideImageSize
): SpriteOverrideCropRect | undefined {
  const width = positiveDimension(override.frameWidth);
  const height = positiveDimension(override.frameHeight);
  if (width === undefined || height === undefined || (width >= source.width && height >= source.height)) {
    return undefined;
  }
  return {
    x: 0,
    y: 0,
    width: Math.min(width, source.width),
    height: Math.min(height, source.height)
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
