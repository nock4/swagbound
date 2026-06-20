import { resolveScriptReference, type BattleData, type ScriptCollection, type WorldChunked, type WorldDoor } from "@eb/schemas";
import { resolveDoorWarpLanding } from "./doorTriggers";

export const EARTHBOUND_OPENING_KNOCK_REF = "data_20.l_0xc66b97";
export const EARTHBOUND_INTRO_METEOR_MARKER_REF = "data_38.l_0xc86279";
export const EARTHBOUND_BUZZ_BUZZ_METEOR_REF = "data_15.l_0xc5eb0b";
export const EARTHBOUND_STARMAN_JUNIOR_ENEMY_ID = 214;
export const INTRO_BEDROOM_OPENING_DONE_FLAG = "intro:bedroom-opening-done";
export const INTRO_METEOR_BEAT_FIRED_FLAG = "intro:meteor-beat-fired";

const INTRO_METEOR_TRIGGER_RADIUS_TILES = 3;

export const INTRO_ACTOR_VM_STUBS = [
  {
    id: "pokey-picky-escort",
    beat: "Pokey/Picky walking, party_add, and escort-home",
    reason: "actor movement and party escort VM are not implemented in this slice"
  },
  {
    id: "roadblock-npc-movement",
    beat: "Onett roadblock NPC movement",
    reason: "map actor movement VM is not implemented in this slice"
  },
  {
    id: "buzz-buzz-death-sound-stone",
    beat: "Buzz Buzz death and Sound Stone handoff",
    reason: "multi-actor cutscene and item handoff VM are not implemented in this slice"
  }
] as const;

export type WorldPoint = { x: number; y: number };
export type WorldRect = { x: number; y: number; width: number; height: number };

export type NewGameOpeningStart = {
  eventRef: string;
  spawn: WorldPoint;
  derivation: string;
};

export type NewGameOpeningDecision =
  | { runOpening: true; start: NewGameOpeningStart }
  | { runOpening: false; fallbackReason: "disabled" | "not_new_game" | "unresolved_opening" };

export type ResolvedNewGameOpening =
  | { resolved: true; start: NewGameOpeningStart }
  | { resolved: false; reason: "missing_world" | "missing_script" | "missing_house_entry" | "missing_upstairs_door" | "unwalkable_spawn" };

export type IntroMeteorBeatStart = {
  markerRef: string;
  dialogueRef: string;
  battleGroupId: number;
  trigger: WorldRect;
  marker: WorldPoint;
  triggerCenter: WorldPoint;
  derivation: string;
};

export type ResolvedIntroMeteorBeat =
  | { resolved: true; start: IntroMeteorBeatStart }
  | {
      resolved: false;
      reason:
        | "missing_world"
        | "missing_script"
        | "missing_meteor_marker"
        | "unwalkable_meteor_trigger"
        | "missing_battle"
        | "missing_battle_group";
    };

export type IntroMeteorBeatFireDecision =
  | { fire: true; nextAlreadyFired: true }
  | {
      fire: false;
      nextAlreadyFired: boolean;
      reason: "not_intro_active" | "opening_not_complete" | "outside_trigger" | "already_fired";
    };

export type IntroSpineProgression =
  | { monotonic: true; next: "bedroom" | "meteor" | "complete" }
  | { monotonic: false; violation: "meteor_without_bedroom" };

export type IntroMeteorBattleTransitionDecision =
  | { action: "battle"; clearIntroActive: true; returnControl: false }
  | {
      action: "return_control";
      clearIntroActive: true;
      returnControl: true;
      reason: "missing_battle_group" | "battle_start_failed";
    };

export function decideNewGameOpening(options: {
  newGame: boolean;
  disabled: boolean;
  resolvedStart?: NewGameOpeningStart;
}): NewGameOpeningDecision {
  if (options.disabled) {
    return { runOpening: false, fallbackReason: "disabled" };
  }
  if (!options.newGame) {
    return { runOpening: false, fallbackReason: "not_new_game" };
  }
  if (!options.resolvedStart) {
    return { runOpening: false, fallbackReason: "unresolved_opening" };
  }
  return { runOpening: true, start: options.resolvedStart };
}

export function decideIntroMeteorBeatFire(options: {
  introActive: boolean;
  openingComplete: boolean;
  playerInTriggerRegion: boolean;
  alreadyFired: boolean;
}): IntroMeteorBeatFireDecision {
  if (options.alreadyFired) {
    return { fire: false, nextAlreadyFired: true, reason: "already_fired" };
  }
  if (!options.introActive) {
    return { fire: false, nextAlreadyFired: false, reason: "not_intro_active" };
  }
  if (!options.openingComplete) {
    return { fire: false, nextAlreadyFired: false, reason: "opening_not_complete" };
  }
  if (!options.playerInTriggerRegion) {
    return { fire: false, nextAlreadyFired: false, reason: "outside_trigger" };
  }
  return { fire: true, nextAlreadyFired: true };
}

export function introSpineProgression(flags: {
  bedroomDone: boolean;
  meteorDone: boolean;
}): IntroSpineProgression {
  if (flags.meteorDone && !flags.bedroomDone) {
    return { monotonic: false, violation: "meteor_without_bedroom" };
  }
  if (!flags.bedroomDone) {
    return { monotonic: true, next: "bedroom" };
  }
  if (!flags.meteorDone) {
    return { monotonic: true, next: "meteor" };
  }
  return { monotonic: true, next: "complete" };
}

export function decideIntroMeteorBattleTransition(options: {
  battleGroupResolved: boolean;
  battleStarted: boolean;
}): IntroMeteorBattleTransitionDecision {
  if (!options.battleGroupResolved) {
    return {
      action: "return_control",
      clearIntroActive: true,
      returnControl: true,
      reason: "missing_battle_group"
    };
  }
  if (!options.battleStarted) {
    return {
      action: "return_control",
      clearIntroActive: true,
      returnControl: true,
      reason: "battle_start_failed"
    };
  }
  return { action: "battle", clearIntroActive: true, returnControl: false };
}

export function resolveNewGameOpeningStart(
  world: WorldChunked | undefined,
  scripts: ScriptCollection | undefined,
  eventRef = EARTHBOUND_OPENING_KNOCK_REF
): ResolvedNewGameOpening {
  if (!world) {
    return { resolved: false, reason: "missing_world" };
  }
  if (!scripts || !resolveScriptReference(scripts, eventRef)) {
    return { resolved: false, reason: "missing_script" };
  }

  const houseEntry = nearestDoor(world.doors, world.player.spawnWorldPixel, {
    maxDistance: world.tileSize * 32
  });
  if (!houseEntry) {
    return { resolved: false, reason: "missing_house_entry" };
  }

  const upstairsDoor = nearestDoor(world.doors, houseEntry.destinationWorldPixel, {
    maxDistance: world.tileSize * 64,
    maxHorizontalOffset: world.tileSize * 4,
    above: true,
    exclude: houseEntry
  });
  if (!upstairsDoor) {
    return { resolved: false, reason: "missing_upstairs_door" };
  }

  const landing = resolveDoorWarpLanding(
    upstairsDoor.destinationWorldPixel,
    world.collision.solidRows,
    {
      cellSize: world.collision.cellSize,
      width: world.collision.width,
      height: world.collision.height
    },
    { maxRingCells: 8 }
  );
  if (!landing.walkable) {
    return { resolved: false, reason: "unwalkable_spawn" };
  }

  return {
    resolved: true,
    start: {
      eventRef,
      spawn: landing.point,
      derivation: "nearest canonical-start house door, same-column upstairs door, walkable landing"
    }
  };
}

export function resolveIntroMeteorBeatStart(
  world: WorldChunked | undefined,
  scripts: ScriptCollection | undefined,
  battle: BattleData | undefined,
  options: {
    markerRef?: string;
    dialogueRef?: string;
    starmanJuniorEnemyId?: number;
  } = {}
): ResolvedIntroMeteorBeat {
  const markerRef = options.markerRef ?? EARTHBOUND_INTRO_METEOR_MARKER_REF;
  const dialogueRef = options.dialogueRef ?? EARTHBOUND_BUZZ_BUZZ_METEOR_REF;
  const starmanJuniorEnemyId = options.starmanJuniorEnemyId ?? EARTHBOUND_STARMAN_JUNIOR_ENEMY_ID;

  if (!world) {
    return { resolved: false, reason: "missing_world" };
  }
  if (!scripts || !resolveScriptReference(scripts, dialogueRef)) {
    return { resolved: false, reason: "missing_script" };
  }

  const marker = world.npcs.find((npc) => npc.textPointer === markerRef || npc.textPointer2 === markerRef);
  if (!marker) {
    return { resolved: false, reason: "missing_meteor_marker" };
  }

  const landing = resolveDoorWarpLanding(
    marker.worldPixel,
    world.collision.solidRows,
    {
      cellSize: world.collision.cellSize,
      width: world.collision.width,
      height: world.collision.height
    },
    { maxRingCells: Math.max(1, Math.ceil(world.tileSize / world.collision.cellSize)) }
  );
  if (!landing.walkable) {
    return { resolved: false, reason: "unwalkable_meteor_trigger" };
  }

  if (!battle) {
    return { resolved: false, reason: "missing_battle" };
  }
  const battleGroup = battle.groups.find((group) => group.enemyIds.includes(starmanJuniorEnemyId));
  if (!battleGroup) {
    return { resolved: false, reason: "missing_battle_group" };
  }

  const radiusPixels = Math.max(world.tileSize, world.tileSize * INTRO_METEOR_TRIGGER_RADIUS_TILES);
  const trigger = clampedRectAround(landing.point, radiusPixels, {
    width: world.mapWidthTiles * world.tileSize,
    height: world.mapHeightTiles * world.tileSize
  });
  if (trigger.width <= 0 || trigger.height <= 0) {
    return { resolved: false, reason: "unwalkable_meteor_trigger" };
  }

  return {
    resolved: true,
    start: {
      markerRef,
      dialogueRef,
      battleGroupId: battleGroup.id,
      trigger,
      marker: { ...marker.worldPixel },
      triggerCenter: { ...landing.point },
      derivation: "meteor object text pointer, nearest walkable collision landing, generated battle group containing Starman Junior"
    }
  };
}

function nearestDoor(
  doors: readonly WorldDoor[],
  point: WorldPoint,
  options: {
    maxDistance: number;
    maxHorizontalOffset?: number;
    above?: boolean;
    exclude?: WorldDoor;
  }
): WorldDoor | undefined {
  let best: { door: WorldDoor; distanceSq: number } | undefined;
  const maxDistanceSq = options.maxDistance ** 2;
  for (const door of doors) {
    if (door === options.exclude) {
      continue;
    }
    const dx = door.worldPixel.x - point.x;
    const dy = door.worldPixel.y - point.y;
    if (options.above && dy >= 0) {
      continue;
    }
    if (options.maxHorizontalOffset !== undefined && Math.abs(dx) > options.maxHorizontalOffset) {
      continue;
    }
    const distanceSq = dx ** 2 + dy ** 2;
    if (distanceSq > maxDistanceSq) {
      continue;
    }
    if (!best || distanceSq < best.distanceSq) {
      best = { door, distanceSq };
    }
  }
  return best?.door;
}

function clampedRectAround(center: WorldPoint, radiusPixels: number, bounds: { width: number; height: number }): WorldRect {
  const left = clamp(center.x - radiusPixels, 0, bounds.width);
  const top = clamp(center.y - radiusPixels, 0, bounds.height);
  const right = clamp(center.x + radiusPixels, 0, bounds.width);
  const bottom = clamp(center.y + radiusPixels, 0, bounds.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
