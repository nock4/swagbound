import type { EncounterSector } from "@eb/schemas";
import { roamerGroupAllowed, type RoamerGroupFilterOptions } from "./overworldEnemies";

export type EncounterSectorGrid = {
  sectorWidthTiles: number;
  sectorHeightTiles: number;
  sectorsPerRow: number;
};

export type EncounterRoll = {
  enemyGroup: number;
};

export type EncounterRollOptions = {
  isFlagSet?: (flag: number) => boolean;
} & RoamerGroupFilterOptions;

export type EncounterRng = () => number;

/**
 * EarthBound encounter table rates are small integer per-step weights. Runtime
 * treats them as `rate / 128`, which keeps low rates occasional while allowing
 * a synthetic test rate of 128 to mean "always".
 */
export const ENCOUNTER_RATE_DENOMINATOR = 128;

export function sectorIndexForTile(tileX: number, tileY: number, grid: EncounterSectorGrid): number {
  const width = positiveInt(grid.sectorWidthTiles, 1);
  const height = positiveInt(grid.sectorHeightTiles, 1);
  const perRow = positiveInt(grid.sectorsPerRow, 1);
  const col = Math.floor(tileX / width);
  const row = Math.floor(tileY / height);
  return row * perRow + col;
}

export function rollEncounter(
  sectorEntry: EncounterSector | undefined,
  rng: EncounterRng,
  options: EncounterRollOptions = {}
): EncounterRoll | null {
  if (!sectorEntry || !eventFlagSatisfied(sectorEntry.eventFlag, options.isFlagSet)) {
    return null;
  }

  for (const subGroup of sectorEntry.subGroups) {
    const rateChance = Math.min(1, Math.max(0, subGroup.rate / ENCOUNTER_RATE_DENOMINATOR));
    if (normalizedRoll(rng()) >= rateChance) {
      continue;
    }
    const eligibleCandidates = subGroup.candidates.filter((candidate) =>
      roamerGroupAllowed(candidate.enemyGroup, options)
    );
    if (eligibleCandidates.length === 0) {
      continue;
    }
    const enemyGroup = pickWeighted(
      eligibleCandidates.map((candidate) => ({
        value: candidate.enemyGroup,
        weight: candidate.probability
      })),
      rng
    );
    return enemyGroup === undefined ? null : { enemyGroup };
  }

  return null;
}

function eventFlagSatisfied(eventFlag: number | undefined, isFlagSet: ((flag: number) => boolean) | undefined): boolean {
  if (eventFlag === undefined || eventFlag <= 0) {
    return true;
  }
  return Boolean(isFlagSet?.(eventFlag));
}

function pickWeighted<T>(
  items: Array<{ value: T; weight: number }>,
  rng: EncounterRng
): T | undefined {
  const weighted = items.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) {
    return undefined;
  }
  let needle = normalizedRoll(rng()) * total;
  for (const item of weighted) {
    if (needle < item.weight) {
      return item.value;
    }
    needle -= item.weight;
  }
  return weighted[weighted.length - 1]?.value;
}

function normalizedRoll(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function positiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
