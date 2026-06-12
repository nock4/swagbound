export class GameFlags {
  private readonly flags = new Set<string>();

  set(flag: string): void {
    this.flags.add(flag);
  }

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  clear(): void {
    this.flags.clear();
  }

  list(): string[] {
    return [...this.flags];
  }
}

export function talkedFlag(npcId: number): string {
  return `npc:${npcId}:talked`;
}
