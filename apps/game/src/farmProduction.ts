/**
 * Mons Ranch production tables: what working buildings make and how fast.
 * Progress is step-driven (FarmState.tickStep on the field-step hook); the
 * scene resolves completed cycles through resolveProductionCycle.
 */
import type { PlacedBuilding } from "./farmState";

/** Steps per production cycle, indexed by tier (1-based tiers, index tier-1). */
export const PRODUCTION_STEPS: Partial<Record<PlacedBuilding["kind"], number[]>> = {
  itemWorks: [300, 220, 150],
  snackKitchen: [260, 190],
  trainingYard: [200, 150, 110],
  monBath: [240, 180]
};

/** Item Works output by the crew's dominant element (EB item ids). */
export const ITEM_WORKS_OUTPUT: Record<string, number> = {
  ash: 147,       // Bomb
  steel: 148,     // Super bomb
  frost: 106,     // Can of fruit juice
  earth: 101,     // Rock candy
  crystal: 101,   // Rock candy
  arcana: 232,    // Cup of coffee
  ooze: 123,      // Jar of hot sauce
  grave: 233,     // Double burger
  rubber: 88,     // Cookie
  default: 88     // Cookie
};

export const SNACK_KITCHEN_OUTPUT: number[] = [90, 233]; // Hamburger, Double burger by tier

/** XP per training cycle per assigned mon, by tier. */
export const TRAINING_XP: number[] = [12, 20, 32];

export function stepsForCycle(building: PlacedBuilding): number | undefined {
  const table = PRODUCTION_STEPS[building.kind];
  if (!table) return undefined;
  return table[Math.min(building.tier, table.length) - 1];
}

export type ProductionResult =
  | { kind: "item"; itemId: number }
  | { kind: "training"; xp: number }
  | { kind: "bond" }
  | undefined;

/** Resolve one completed cycle. Pure: the caller applies side effects. */
export function resolveProductionCycle(
  building: PlacedBuilding,
  crewElements: string[]
): ProductionResult {
  if (building.kind === "itemWorks") {
    const dominant = crewElements.find((e) => e in ITEM_WORKS_OUTPUT) ?? "default";
    return { kind: "item", itemId: ITEM_WORKS_OUTPUT[dominant] ?? ITEM_WORKS_OUTPUT.default };
  }
  if (building.kind === "snackKitchen") {
    return { kind: "item", itemId: SNACK_KITCHEN_OUTPUT[Math.min(building.tier, SNACK_KITCHEN_OUTPUT.length) - 1] };
  }
  if (building.kind === "trainingYard") {
    return { kind: "training", xp: TRAINING_XP[Math.min(building.tier, TRAINING_XP.length) - 1] };
  }
  if (building.kind === "monBath") {
    return { kind: "bond" };
  }
  return undefined;
}

/** Buildings that need an assigned crew before progress counts. */
export const NEEDS_CREW = new Set<PlacedBuilding["kind"]>(["itemWorks", "snackKitchen", "trainingYard", "monBath"]);
