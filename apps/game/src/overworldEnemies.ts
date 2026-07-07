import type { BattleRules, EncounterSector, RoamerZoneCaps } from "@eb/schemas";
import type { Facing } from "./playerController";

export type EncounterRng = () => number; // returns [0, 1)

export type WorldPoint = { x: number; y: number };

export type RoamerGroupFilterOptions = {
  battleRules?: Pick<BattleRules, "unescapableGroups">;
  roamerZoneCaps?: RoamerZoneCaps;
  worldPixel?: WorldPoint;
};

export const STORY_BOSS_ROAMER_EXCLUSION_GROUPS = [
  55,
  137,
  172,
  402,
  424,
  448,
  449,
  474
] as const;

/**
 * Pick which enemy group should spawn as a VISIBLE roaming enemy in a danger
 * sector. Unlike the old per-step RNG roll, this does not gate on the encounter
 * rate (rate controls how MANY roamers a sector keeps, see sectorSpawnBudget).
 * It chooses a sub-group weighted by its rate, then an eligible enemy group
 * weighted by its probability. Returns null for safe sectors, when the event
 * flag gate is not satisfied, or when all candidates are blocked by story-boss
 * exclusions or zone caps.
 */
export function selectSectorEnemyGroup(
  sector: EncounterSector | undefined,
  rng: EncounterRng,
  options: { isFlagSet?: (flag: number) => boolean } & RoamerGroupFilterOptions = {}
): number | null {
  if (!sector || !eventFlagSatisfied(sector.eventFlag, options.isFlagSet)) {
    return null;
  }
  const eligibleSubGroups = sector.subGroups
    .map((entry) => ({
      ...entry,
      candidates: entry.candidates.filter((candidate) => roamerGroupAllowed(candidate.enemyGroup, options))
    }))
    .filter((entry) => entry.candidates.length > 0);
  const subGroup = pickWeighted(
    eligibleSubGroups.map((entry) => ({ value: entry, weight: entry.rate })),
    rng
  );
  if (!subGroup) {
    return null;
  }
  const enemyGroup = pickWeighted(
    subGroup.candidates.map((candidate) => ({ value: candidate.enemyGroup, weight: candidate.probability })),
    rng
  );
  return enemyGroup ?? null;
}

export function roamerGroupAllowed(groupId: number, options: RoamerGroupFilterOptions = {}): boolean {
  const blockedGroups = roamerBlockedGroupSet(options.battleRules);
  if (blockedGroups.has(groupId)) {
    return false;
  }
  const zoneAllowedGroups = allowedGroupsForRoamerZone(options.roamerZoneCaps, options.worldPixel);
  return !zoneAllowedGroups || zoneAllowedGroups.has(groupId);
}

function roamerBlockedGroupSet(battleRules: Pick<BattleRules, "unescapableGroups"> | undefined): Set<number> {
  // Story bosses and unescapable scripted fights are gates, not ambient enemies.
  // They must never leak into normal roaming or random encounter tables.
  return new Set([
    ...STORY_BOSS_ROAMER_EXCLUSION_GROUPS,
    ...(battleRules?.unescapableGroups ?? [])
  ]);
}

function allowedGroupsForRoamerZone(
  caps: RoamerZoneCaps | undefined,
  worldPixel: WorldPoint | undefined
): Set<number> | undefined {
  if (!caps || !worldPixel) {
    return undefined;
  }
  const zone = caps.zones.find((entry) => pointInRect(worldPixel, entry.rect));
  return zone ? new Set(zone.allowedGroups) : undefined;
}

/**
 * How many visible enemies a danger sector should keep alive at once, scaled by
 * its total encounter rate. Safe sectors (no rate) return 0. Capped so dense
 * sectors don't flood the screen.
 */
export function sectorSpawnBudget(
  sector: EncounterSector | undefined,
  options: { maxPerSector?: number } = {}
): number {
  if (!sector || !eventFlagSatisfied(sector.eventFlag)) {
    return 0;
  }
  const totalRate = sector.subGroups.reduce((sum, entry) => sum + Math.max(0, entry.rate), 0);
  if (totalRate <= 0) {
    return 0;
  }
  const cap = Math.max(1, options.maxPerSector ?? 2);
  // One roamer for any danger sector, plus one per ~8 rate points, capped.
  return Math.max(1, Math.min(cap, 1 + Math.floor(totalRate / 8)));
}

export type TouchAdvantage = "partyFirstStrike" | "enemyFirstStrike" | "normal";

const FACING_VECTORS: Record<Facing, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

/**
 * EarthBound green/red swirl: who strikes first when the player and a roaming
 * enemy touch, decided purely by geometry.
 * - Player walks into the enemy's back -> party first strike (green swirl).
 * - Enemy walks into the player's back -> enemy first strike (red swirl).
 * - Anything else (head-on, side, overlapping) -> a neutral encounter.
 */
export function touchAdvantage(
  player: { x: number; y: number; facing: Facing },
  enemy: { x: number; y: number; facing: Facing }
): TouchAdvantage {
  const toEnemy = normalize(enemy.x - player.x, enemy.y - player.y);
  const toPlayer = { x: -toEnemy.x, y: -toEnemy.y };
  const playerFacesEnemy = dot(FACING_VECTORS[player.facing], toEnemy) > 0.5;
  const enemyFacesPlayer = dot(FACING_VECTORS[enemy.facing], toPlayer) > 0.5;
  if (playerFacesEnemy && !enemyFacesPlayer) {
    return "partyFirstStrike";
  }
  if (enemyFacesPlayer && !playerFacesEnemy) {
    return "enemyFirstStrike";
  }
  return "normal";
}

function eventFlagSatisfied(eventFlag: number | undefined, isFlagSet?: (flag: number) => boolean): boolean {
  if (eventFlag === undefined || eventFlag <= 0) {
    return true;
  }
  return Boolean(isFlagSet?.(eventFlag));
}

function pointInRect(point: WorldPoint, rect: { x: number; y: number; w: number; h: number }): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}

function pickWeighted<T>(items: Array<{ value: T; weight: number }>, rng: EncounterRng): T | undefined {
  const weighted = items.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    return undefined;
  }
  let needle = clamp01(rng()) * total;
  for (const item of weighted) {
    if (needle < item.weight) {
      return item.value;
    }
    needle -= item.weight;
  }
  return weighted[weighted.length - 1]?.value;
}

function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x * b.x + a.y * b.y;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(0.999999, Math.max(0, value));
}
