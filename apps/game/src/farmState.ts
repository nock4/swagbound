// Runtime container for the player's Mons Ranch: coins, buildings, decor,
// assignments, and work progress. Persisted via FarmSaveSnapshot (saveState v3).
// Pure-ish: no Phaser; scenes read/write through this.

import type { FarmSaveSnapshot } from "./saveState";
import { activePerks, type RatingPerks } from "./farmPerks";

export type FarmBuildingKind =
  | "monBarn"
  | "trainingYard"
  | "itemWorks"
  | "snackKitchen"
  | "monBath"
  | "gachaShrine"
  | "billboard"
  | "fusionAltar"
  | "riddleArchive";

export type FarmDecorKind =
  | "fenceH"
  | "fenceV"
  | "pathTile"
  | "lamp"
  | "statueMon"
  | "topiary"
  | "ranchFlag"
  | "bench"
  | "crate"
  | "well";

export type PlacedBuilding = {
  id: string;
  kind: FarmBuildingKind;
  tier: number;
  cell: { x: number; y: number };
  progressSteps: number;
  jobRecipeId?: string;
  assignedMonIds: string[];
};

export type PlacedDecor = {
  id: string;
  kind: FarmDecorKind;
  cell: { x: number; y: number };
};

export type FarmCatalogEntry = {
  name: string;
  price: number[];
  footprint: { w: number; h: number };
  value: number;
  desc: string;
};

export type DecorCatalogEntry = {
  name: string;
  price: number;
  footprint: { w: number; h: number };
  value: number;
  desc: string;
};

export const FARM_CATALOG: Record<FarmBuildingKind, FarmCatalogEntry> = {
  monBarn: {
    name: "Mon Barn",
    price: [0, 400, 900],
    footprint: { w: 128, h: 88 },
    value: 120,
    desc: "A warm roof for Mons who prefer hay to destiny."
  },
  trainingYard: {
    name: "Training Yard",
    price: [120, 350, 800],
    footprint: { w: 128, h: 88 },
    value: 100,
    desc: "Mons train here. The fence tries not to watch."
  },
  itemWorks: {
    name: "Item Works",
    price: [200, 500, 1000],
    footprint: { w: 96, h: 72 },
    value: 140,
    desc: "Useful things emerge, usually with a receipt."
  },
  snackKitchen: {
    name: "Snack Kitchen",
    price: [150, 400],
    footprint: { w: 96, h: 72 },
    value: 110,
    desc: "Something is always cooling. Nobody remembers baking it."
  },
  monBath: {
    name: "Mon Bath",
    price: [180, 450],
    footprint: { w: 96, h: 72 },
    value: 115,
    desc: "The water is warm. The towels are strangely confident."
  },
  gachaShrine: {
    name: "Gacha Shrine",
    price: [250],
    footprint: { w: 96, h: 72 },
    value: 150,
    desc: "A tiny wish goes in. A tinier noise comes out."
  },
  billboard: {
    name: "Billboard",
    price: [80],
    footprint: { w: 96, h: 72 },
    value: 60,
    desc: "It says your ranch is famous. That seems official."
  },
  fusionAltar: {
    name: "Fusion Altar",
    price: [0, 300],
    footprint: { w: 128, h: 88 },
    value: 160,
    desc: "Two family trees meet under flattering light."
  },
  riddleArchive: {
    name: "Riddle Archive",
    price: [0, 200],
    footprint: { w: 96, h: 72 },
    value: 90,
    desc: "Old questions sleep here with one eye open."
  }
};

export const DECOR_CATALOG: Record<FarmDecorKind, DecorCatalogEntry> = {
  fenceH: {
    name: "Fence",
    price: 10,
    footprint: { w: 48, h: 16 },
    value: 5,
    desc: "Keeps the ranch in. Mostly."
  },
  fenceV: {
    name: "Fence",
    price: 10,
    footprint: { w: 16, h: 48 },
    value: 5,
    desc: "The same fence, thinking vertically."
  },
  pathTile: {
    name: "Path Tile",
    price: 10,
    footprint: { w: 16, h: 16 },
    value: 4,
    desc: "A polite suggestion for your feet."
  },
  lamp: {
    name: "Ranch Lamp",
    price: 25,
    footprint: { w: 16, h: 32 },
    value: 12,
    desc: "A small light with a very steady job."
  },
  statueMon: {
    name: "Mon Statue",
    price: 60,
    footprint: { w: 32, h: 48 },
    value: 35,
    desc: "It never blinks. Good craftsmanship."
  },
  topiary: {
    name: "Topiary",
    price: 35,
    footprint: { w: 32, h: 32 },
    value: 20,
    desc: "A bush pretending to be somebody."
  },
  ranchFlag: {
    name: "Ranch Flag",
    price: 40,
    footprint: { w: 24, h: 48 },
    value: 24,
    desc: "It waves even when nobody is looking."
  },
  bench: {
    name: "Bench",
    price: 30,
    footprint: { w: 48, h: 24 },
    value: 16,
    desc: "For sitting near all your responsibilities."
  },
  crate: {
    name: "Crate",
    price: 15,
    footprint: { w: 24, h: 24 },
    value: 7,
    desc: "Contains the idea of supplies."
  },
  well: {
    name: "Well",
    price: 50,
    footprint: { w: 48, h: 48 },
    value: 30,
    desc: "The bucket knows how far down it goes."
  }
};

const PASSIVE_BUILDING_KINDS = new Set<FarmBuildingKind>([
  "monBarn",
  "trainingYard",
  "monBath",
  "gachaShrine",
  "billboard",
  "fusionAltar",
  "riddleArchive"
]);

export class FarmState {
  swagCoins = 0;
  buildings: PlacedBuilding[] = [];
  decor: PlacedDecor[] = [];

  addCoins(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) {
      return;
    }
    this.swagCoins += amount;
  }

  spendCoins(amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 0 || amount > this.swagCoins) {
      return false;
    }
    this.swagCoins -= amount;
    return true;
  }

  placeBuilding(kind: FarmBuildingKind, cell: { x: number; y: number }): PlacedBuilding {
    const placed: PlacedBuilding = {
      id: this.mintId("b", this.buildings),
      kind,
      tier: 1,
      cell: snapCell(cell),
      progressSteps: 0,
      assignedMonIds: []
    };
    this.buildings.push(placed);
    return placed;
  }

  placeDecor(kind: FarmDecorKind, cell: { x: number; y: number }): PlacedDecor {
    const placed: PlacedDecor = {
      id: this.mintId("d", this.decor),
      kind,
      cell: snapCell(cell)
    };
    this.decor.push(placed);
    return placed;
  }

  removeById(id: string): boolean {
    const buildingIndex = this.buildings.findIndex((building) => building.id === id);
    if (buildingIndex >= 0) {
      this.buildings.splice(buildingIndex, 1);
      return true;
    }
    const decorIndex = this.decor.findIndex((placed) => placed.id === id);
    if (decorIndex < 0) {
      return false;
    }
    this.decor.splice(decorIndex, 1);
    return true;
  }

  sellBuilding(id: string): number | undefined {
    const buildingIndex = this.buildings.findIndex((building) => building.id === id);
    if (buildingIndex < 0) {
      return undefined;
    }
    const building = this.buildings[buildingIndex];
    for (const registryId of [...building.assignedMonIds]) {
      this.recallMon(building.id, registryId);
    }
    const totalCost = FARM_CATALOG[building.kind].price
      .slice(0, building.tier)
      .reduce((total, price) => total + price, 0);
    const refund = Math.floor(totalCost * 0.6);
    this.buildings.splice(buildingIndex, 1);
    this.addCoins(refund);
    return refund;
  }

  sellDecor(id: string): number | undefined {
    const decorIndex = this.decor.findIndex((placed) => placed.id === id);
    if (decorIndex < 0) {
      return undefined;
    }
    const refund = Math.floor(DECOR_CATALOG[this.decor[decorIndex].kind].price * 0.6);
    this.decor.splice(decorIndex, 1);
    this.addCoins(refund);
    return refund;
  }

  moveBuilding(id: string, cell: { x: number; y: number }): boolean {
    const building = this.buildingById(id);
    if (!building) {
      return false;
    }
    building.cell = snapCell(cell);
    return true;
  }

  moveDecor(id: string, cell: { x: number; y: number }): boolean {
    const decor = this.decor.find((placed) => placed.id === id);
    if (!decor) {
      return false;
    }
    decor.cell = snapCell(cell);
    return true;
  }

  buildingById(id: string): PlacedBuilding | undefined {
    return this.buildings.find((building) => building.id === id);
  }

  upgradeBuilding(buildingId: string): boolean {
    const building = this.buildingById(buildingId);
    if (!building || building.tier >= 3) {
      return false;
    }
    building.tier += 1;
    return true;
  }

  assignMon(buildingId: string, registryId: string): boolean {
    const building = this.buildingById(buildingId);
    if (
      !building ||
      registryId.length === 0 ||
      this.buildings.some((placed) => placed.assignedMonIds.includes(registryId))
    ) {
      return false;
    }
    building.assignedMonIds.push(registryId);
    return true;
  }

  recallMon(registryId: string): boolean;
  recallMon(buildingId: string, registryId: string): boolean;
  recallMon(buildingIdOrRegistryId: string, registryId?: string): boolean {
    const assignedId = registryId ?? buildingIdOrRegistryId;
    const building = registryId === undefined
      ? this.buildings.find((placed) => placed.assignedMonIds.includes(assignedId))
      : this.buildingById(buildingIdOrRegistryId);
    const assignedIndex = building?.assignedMonIds.indexOf(assignedId) ?? -1;
    if (!building || assignedIndex < 0) {
      return false;
    }
    building.assignedMonIds.splice(assignedIndex, 1);
    return true;
  }

  tickStep(): void {
    for (const building of this.buildings) {
      if (
        (typeof building.jobRecipeId === "string" && building.jobRecipeId.length > 0) ||
        PASSIVE_BUILDING_KINDS.has(building.kind)
      ) {
        building.progressSteps += 1;
      }
    }
  }

  swagRating(): number {
    return this.buildings.reduce((total, building) => total + FARM_CATALOG[building.kind].value, 0)
      + this.decor.reduce((total, placed) => total + DECOR_CATALOG[placed.kind].value, 0);
  }

  perks(): RatingPerks {
    return activePerks(this.swagRating());
  }

  snapshot(): FarmSaveSnapshot {
    return {
      swagCoins: this.swagCoins,
      buildings: this.buildings.map(cloneBuilding),
      decor: this.decor.map(cloneDecor)
    };
  }

  restore(snapshot: FarmSaveSnapshot | undefined): void {
    this.swagCoins = snapshot?.swagCoins ?? 0;
    this.buildings = (snapshot?.buildings ?? []).map(cloneBuilding);
    this.decor = (snapshot?.decor ?? []).map(cloneDecor);
  }

  private mintId(prefix: "b" | "d", placed: readonly { id: string }[]): string {
    const highest = placed.reduce((max, entry) => {
      if (!entry.id.startsWith(prefix)) {
        return max;
      }
      const numeric = Number(entry.id.slice(prefix.length));
      return Number.isInteger(numeric) && numeric > max ? numeric : max;
    }, 0);
    return `${prefix}${highest + 1}`;
  }
}

function snapCell(cell: { x: number; y: number }): { x: number; y: number } {
  // Defensive: a malformed cell must never store a non-finite coordinate, or a
  // later snapshot fails validation and bricks the save. Fall back to 0.
  const sx = Number.isFinite(cell?.x) ? cell.x : 0;
  const sy = Number.isFinite(cell?.y) ? cell.y : 0;
  return {
    x: Math.round(sx / 8) * 8,
    y: Math.round(sy / 8) * 8
  };
}

function cloneBuilding(building: PlacedBuilding): PlacedBuilding {
  return {
    id: building.id,
    kind: building.kind,
    tier: building.tier,
    cell: { ...building.cell },
    progressSteps: building.progressSteps,
    ...(building.jobRecipeId !== undefined ? { jobRecipeId: building.jobRecipeId } : {}),
    assignedMonIds: [...building.assignedMonIds]
  };
}

function cloneDecor(decor: PlacedDecor): PlacedDecor {
  return {
    id: decor.id,
    kind: decor.kind,
    cell: { ...decor.cell }
  };
}
