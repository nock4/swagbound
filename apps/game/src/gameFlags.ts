export class GameFlags {
  private readonly flags = new Set<string>();
  private readonly numericFlags = new Set<number>();
  /**
   * Story-flag -> EarthBound numeric event-flag bridge (content/flag-map.json).
   * Setting an aliased story flag also raises its EB flags, which drives the
   * vanilla flag machinery the converter carried over (NPC appear/disappear,
   * encounter gating). Applied on save restore too, so old saves inherit
   * newly-mapped flags on load.
   */
  private aliases = new Map<string, readonly number[]>();

  setAliases(aliases: ReadonlyMap<string, readonly number[]>): void {
    this.aliases = new Map(aliases);
    // Back-fill: story flags set before the aliases arrived (load order) still bridge.
    for (const flag of this.flags) {
      for (const num of this.aliases.get(flag) ?? []) {
        this.numericFlags.add(normalizeNum(num));
      }
    }
  }

  set(flag: string): void {
    this.flags.add(flag);
    for (const num of this.aliases.get(flag) ?? []) {
      this.numericFlags.add(normalizeNum(num));
    }
  }

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  unset(flag: string): void {
    this.flags.delete(flag);
  }

  /** Numeric EarthBound event flags are session-only and start all clear. */
  setNum(flag: number): void {
    this.numericFlags.add(normalizeNum(flag));
  }

  unsetNum(flag: number): void {
    this.numericFlags.delete(normalizeNum(flag));
  }

  isSet(flag: number): boolean {
    return this.numericFlags.has(normalizeNum(flag));
  }

  clear(): void {
    this.flags.clear();
    this.numericFlags.clear();
  }

  list(): string[] {
    return [...this.flags];
  }

  listNums(): number[] {
    return [...this.numericFlags].sort((a, b) => a - b);
  }
}

export function talkedFlag(npcId: number): string {
  return `npc:${npcId}:talked`;
}

/** Adopted entries only — candidates stay documentation until browser-verified. */
export function flagAliasesFromMap(
  flagMap: { entries: ReadonlyArray<{ storyFlag: string; ebFlags: ReadonlyArray<{ id: number }> }> } | undefined
): Map<string, readonly number[]> {
  const aliases = new Map<string, readonly number[]>();
  for (const entry of flagMap?.entries ?? []) {
    if (entry.ebFlags.length > 0) {
      aliases.set(entry.storyFlag, entry.ebFlags.map((flag) => flag.id));
    }
  }
  return aliases;
}

function normalizeNum(flag: number): number {
  if (!Number.isInteger(flag) || flag < 0) {
    throw new Error(`Invalid numeric event flag: ${flag}`);
  }
  return flag;
}
