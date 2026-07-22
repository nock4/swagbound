// Runtime container for the player's mon roster: catching, active companion,
// bond, farm XP trickle, and fusion execution. Persisted via MonsSaveSnapshot
// (saveState v2). Pure-ish: no Phaser; scenes read/write through this.

import type { MonAbilities, MonsRegistry, MonsRegistryEntry } from "@eb/schemas";
import {
  createOwnedMon,
  executeFusion,
  grantMonXp,
  monById,
  resolveFusion,
  type FusionPreview,
  type MonXpGain,
  type OwnedMon
} from "./monsModel";
import type { MonsSaveSnapshot } from "./saveState";
import type { MonFusion } from "@eb/schemas";

export const FARM_TRICKLE_XP_PER_TICK = 2;
export const BOND_PER_PET = 1;
export const BOND_MAX = 99;

export class MonsState {
  private roster: OwnedMon[] = [];
  private activeIndex: number | undefined;

  constructor(
    private readonly registry: MonsRegistry,
    private readonly abilities: MonAbilities,
    private readonly fusion: MonFusion
  ) {}

  list(): readonly OwnedMon[] {
    return this.roster;
  }

  count(): number {
    return this.roster.length;
  }

  entryFor(mon: OwnedMon): MonsRegistryEntry | undefined {
    return monById(this.registry, mon.registryId);
  }

  at(index: number): OwnedMon | undefined {
    return this.roster[index];
  }

  active(): { mon: OwnedMon; entry: MonsRegistryEntry; index: number } | undefined {
    if (this.activeIndex === undefined) {
      return undefined;
    }
    const mon = this.roster[this.activeIndex];
    const entry = mon ? this.entryFor(mon) : undefined;
    return mon && entry ? { mon, entry, index: this.activeIndex } : undefined;
  }

  setActive(index: number | undefined): boolean {
    if (index === undefined) {
      this.activeIndex = undefined;
      return true;
    }
    if (!this.roster[index]) {
      return false;
    }
    this.activeIndex = index;
    return true;
  }

  catchMon(registryId: string, options: { caughtAtFlag?: string } = {}): OwnedMon | undefined {
    const entry = monById(this.registry, registryId);
    if (!entry) {
      return undefined;
    }
    const owned = createOwnedMon(entry, options.caughtAtFlag ? { caughtAtFlag: options.caughtAtFlag } : {});
    this.roster.push(owned);
    return owned;
  }

  release(index: number): boolean {
    if (!this.roster[index]) {
      return false;
    }
    this.roster.splice(index, 1);
    if (this.activeIndex !== undefined) {
      if (this.activeIndex === index) {
        this.activeIndex = undefined;
      } else if (this.activeIndex > index) {
        this.activeIndex -= 1;
      }
    }
    return true;
  }

  grantXp(index: number, amount: number): MonXpGain | undefined {
    const mon = this.roster[index];
    const entry = mon ? this.entryFor(mon) : undefined;
    if (!mon || !entry) {
      return undefined;
    }
    const gain = grantMonXp(mon, entry, this.abilities, amount);
    this.roster[index] = gain.mon;
    return gain;
  }

  // Farm day-care: every non-active mon gains a trickle.
  farmTick(): void {
    this.roster.forEach((_, index) => {
      if (index !== this.activeIndex) {
        this.grantXp(index, FARM_TRICKLE_XP_PER_TICK);
      }
    });
  }

  pet(index: number): number | undefined {
    const mon = this.roster[index];
    if (!mon) {
      return undefined;
    }
    const bond = Math.min(BOND_MAX, mon.bond + BOND_PER_PET);
    this.roster[index] = { ...mon, bond };
    return bond;
  }

  previewFusion(indexA: number, indexB: number): FusionPreview | undefined {
    if (indexA === indexB) {
      return { ok: false, reason: "same-mon" };
    }
    const a = this.roster[indexA];
    const b = this.roster[indexB];
    const entryA = a ? this.entryFor(a) : undefined;
    const entryB = b ? this.entryFor(b) : undefined;
    if (!a || !b || !entryA || !entryB) {
      return undefined;
    }
    const ownedIds = new Set(this.roster.map((m) => m.registryId));
    return resolveFusion(
      { entry: entryA, owned: a },
      { entry: entryB, owned: b },
      this.registry,
      this.fusion,
      this.abilities,
      ownedIds
    );
  }

  fuse(indexA: number, indexB: number, picks: string[]): OwnedMon | undefined {
    const preview = this.previewFusion(indexA, indexB);
    if (!preview?.ok) {
      return undefined;
    }
    const result = executeFusion(preview, picks);
    if (!result) {
      return undefined;
    }
    const a = this.roster[indexA];
    const b = this.roster[indexB];
    const fused: OwnedMon = {
      ...result.owned,
      lineage: { parents: [a.registryId, b.registryId] }
    };
    // remove higher index first so the lower index stays valid
    const [hi, lo] = indexA > indexB ? [indexA, indexB] : [indexB, indexA];
    this.roster.splice(hi, 1);
    this.roster.splice(lo, 1);
    this.roster.push(fused);
    this.activeIndex = undefined;
    return fused;
  }

  snapshot(): MonsSaveSnapshot {
    return {
      roster: this.roster.map((mon) => ({ ...mon, inherited: [...mon.inherited] })),
      ...(this.activeIndex !== undefined ? { activeIndex: this.activeIndex } : {})
    };
  }

  restore(snapshot: MonsSaveSnapshot | undefined): void {
    this.roster = (snapshot?.roster ?? [])
      .filter((mon) => monById(this.registry, mon.registryId) !== undefined)
      .map((mon) => ({ ...mon, inherited: [...mon.inherited] }));
    this.activeIndex =
      snapshot?.activeIndex !== undefined && snapshot.activeIndex < this.roster.length
        ? snapshot.activeIndex
        : undefined;
  }
}
