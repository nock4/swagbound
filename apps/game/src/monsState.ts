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
  type OwnedMon, resolveFusionWithAccident} from "./monsModel";
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

  /** Add a pre-built OwnedMon to the roster (Compendium re-summon). */
  adopt(mon: OwnedMon): OwnedMon {
    const owned: OwnedMon = { ...mon, inherited: [...mon.inherited] };
    this.roster.push(owned);
    return owned;
  }

  /** Teach a roster Mon an inherited ability (move card). No-op if unknown
   * index or the ability is already inherited. Returns success. */
  teachInherited(index: number, abilityId: string): boolean {
    const mon = this.roster[index];
    if (!mon || mon.inherited.includes(abilityId)) {
      return false;
    }
    this.roster[index] = { ...mon, inherited: [...mon.inherited, abilityId] };
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

  previewFusion(indexA: number, indexB: number, sacrificeIndex?: number): FusionPreview | undefined {
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
    let sacrifice: { entry: MonsRegistryEntry; owned: OwnedMon } | undefined;
    if (sacrificeIndex !== undefined && sacrificeIndex !== indexA && sacrificeIndex !== indexB) {
      const sac = this.roster[sacrificeIndex];
      const sacEntry = sac ? this.entryFor(sac) : undefined;
      if (sac && sacEntry) sacrifice = { entry: sacEntry, owned: sac };
    }
    const ownedIds = new Set(this.roster.map((m) => m.registryId));
    return resolveFusion(
      { entry: entryA, owned: a },
      { entry: entryB, owned: b },
      this.registry,
      this.fusion,
      this.abilities,
      ownedIds,
      sacrifice
    );
  }

  fuse(
    indexA: number,
    indexB: number,
    picks: string[],
    options: { sacrificeIndex?: number; accidentRng?: () => number; accidentChance?: number } = {}
  ): OwnedMon | undefined {
    let preview = this.previewFusion(indexA, indexB, options.sacrificeIndex);
    if (!preview?.ok) {
      return undefined;
    }
    // Fusion accident (gated by the caller: altar tier / moon). Re-roll the
    // preview through the accident path when an rng is supplied.
    if (options.accidentRng) {
      const a0 = this.roster[indexA];
      const b0 = this.roster[indexB];
      const entryA = a0 ? this.entryFor(a0) : undefined;
      const entryB = b0 ? this.entryFor(b0) : undefined;
      let sacrifice: { entry: MonsRegistryEntry; owned: OwnedMon } | undefined;
      if (options.sacrificeIndex !== undefined) {
        const sac = this.roster[options.sacrificeIndex];
        const sacEntry = sac ? this.entryFor(sac) : undefined;
        if (sac && sacEntry) sacrifice = { entry: sacEntry, owned: sac };
      }
      if (entryA && entryB && a0 && b0) {
        const ownedIds = new Set(this.roster.map((m) => m.registryId));
        const accidentPreview = resolveFusionWithAccident(
          { entry: entryA, owned: a0 },
          { entry: entryB, owned: b0 },
          this.registry, this.fusion, this.abilities, ownedIds,
          sacrifice, options.accidentRng, options.accidentChance
        );
        if (accidentPreview?.ok) preview = accidentPreview;
      }
    }
    const result = executeFusion(preview, picks);
    if (!result) {
      return undefined;
    }
    // Remove the sacrifice mon too, highest index first.
    const removals = [indexA, indexB, options.sacrificeIndex]
      .filter((i): i is number => i !== undefined)
      .sort((x, y) => y - x);
    const a = this.roster[indexA];
    const b = this.roster[indexB];
    const fused: OwnedMon = {
      ...result.owned,
      lineage: { parents: [a.registryId, b.registryId] }
    };
    // Remove parents (and sacrifice) highest-index first so lower indices stay valid.
    for (const i of removals) this.roster.splice(i, 1);
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
