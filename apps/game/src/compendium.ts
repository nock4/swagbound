import { monXpForLevel, type OwnedMon } from "./monsModel";

export type CompendiumEntry = {
  registryId: string;
  level: number;
  inherited: string[];
  timesOwned: number;
};

export type CompendiumSaveSnapshot = {
  entries: CompendiumEntry[];
};

export class Compendium {
  private entries: Map<string, CompendiumEntry> = new Map();

  register(mon: OwnedMon): void {
    const existing = this.entries.get(mon.registryId);
    if (!existing) {
      this.entries.set(mon.registryId, {
        registryId: mon.registryId,
        level: mon.level,
        inherited: [...mon.inherited],
        timesOwned: 1
      });
      return;
    }

    this.entries.set(mon.registryId, {
      registryId: mon.registryId,
      level: Math.max(existing.level, mon.level),
      inherited: [...new Set([...existing.inherited, ...mon.inherited])],
      timesOwned: existing.timesOwned + 1
    });
  }

  has(registryId: string): boolean {
    return this.entries.has(registryId);
  }

  get(registryId: string): CompendiumEntry | undefined {
    const entry = this.entries.get(registryId);
    return entry ? { ...entry, inherited: [...entry.inherited] } : undefined;
  }

  list(): CompendiumEntry[] {
    return [...this.entries.values()]
      .map((entry) => ({ ...entry, inherited: [...entry.inherited] }))
      .sort((a, b) => a.registryId.localeCompare(b.registryId));
  }

  count(): number {
    return this.entries.size;
  }

  resummonCost(entry: CompendiumEntry): number {
    // SMT-style price: 40 base coins plus 1.5 times the square of the mon's level.
    return Math.round(40 + entry.level * entry.level * 1.5);
  }

  resummon(registryId: string): OwnedMon | undefined {
    const entry = this.entries.get(registryId);
    if (!entry) {
      return undefined;
    }
    return {
      registryId: entry.registryId,
      level: entry.level,
      xp: monXpForLevel(entry.level),
      bond: 0,
      inherited: [...entry.inherited]
    };
  }

  snapshot(): CompendiumSaveSnapshot {
    return {
      entries: this.list().map((entry) => ({ ...entry, inherited: [...entry.inherited] }))
    };
  }

  restore(snapshot: CompendiumSaveSnapshot | undefined): void {
    this.entries = new Map(
      (snapshot?.entries ?? []).map((entry) => [
        entry.registryId,
        { ...entry, inherited: [...entry.inherited] }
      ])
    );
  }
}

export function validateCompendiumSnapshot(value: unknown): CompendiumSaveSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return null;
  }
  const entries: CompendiumEntry[] = [];
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.registryId !== "string" || entry.registryId.length === 0) {
      return null;
    }
    const level = validatePositiveInteger(entry.level);
    const inherited = validateStringArray(entry.inherited);
    const timesOwned = validatePositiveInteger(entry.timesOwned);
    if (level === undefined || !inherited || timesOwned === undefined) {
      return null;
    }
    entries.push({
      registryId: entry.registryId,
      level,
      inherited,
      timesOwned
    });
  }
  return { entries };
}

function validateStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    if (!seen.has(item)) {
      seen.add(item);
      strings.push(item);
    }
  }
  return strings;
}

function validatePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
