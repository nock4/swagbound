/**
 * Boss taunt resolution + text-fitting for the in-battle boss speech system.
 *
 * Content lives in content/boss-battle-dialogue.json (keyed by battle group).
 * The battle scene injects these utterances into the execution message window as
 * their own beats: `onStart` when the fight opens, `onLowHp` the first time the
 * lead enemy drops to/below `lowHpThreshold`, and `onDefeat` when it dies. Each
 * utterance is one beat; the scene word-wraps it to fit the window.
 */

import type { BossBattleDialogue } from "@eb/schemas";

/** Default low-HP taunt trigger: at or below one third of max HP. */
export const DEFAULT_BOSS_LOW_HP_THRESHOLD = 0.34;

/** Execution message window fits ~3 short lines; wrap conservatively for 480px. */
const TAUNT_WRAP_MAX_CHARS = 44;
const TAUNT_WRAP_MAX_LINES = 3;

export interface ResolvedBossTaunts {
  personaName?: string;
  onStart: string[];
  onLowHp: string[];
  onDefeat: string[];
  lowHpThreshold: number;
}

/**
 * Resolve the taunt set for a battle group, or undefined when the group has no
 * boss dialogue (or every list is empty).
 */
export function resolveBossTaunts(
  data: BossBattleDialogue | undefined,
  groupId: number
): ResolvedBossTaunts | undefined {
  const entry = data?.byBattleGroup?.[String(groupId)];
  if (!entry) {
    return undefined;
  }
  const onStart = entry.onStart ?? [];
  const onLowHp = entry.onLowHp ?? [];
  const onDefeat = entry.onDefeat ?? [];
  if (onStart.length === 0 && onLowHp.length === 0 && onDefeat.length === 0) {
    return undefined;
  }
  return {
    personaName: entry.personaName,
    onStart,
    onLowHp,
    onDefeat,
    lowHpThreshold: entry.lowHpThreshold ?? DEFAULT_BOSS_LOW_HP_THRESHOLD
  };
}

/** Fraction (0..1) of the lead enemy's remaining HP, clamped. Returns 1 when unknown. */
export function bossHpFraction(currentHp: number, maxHp: number): number {
  if (!Number.isFinite(maxHp) || maxHp <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, currentHp) / maxHp);
}

/** True when the lead enemy is alive and at/below the low-HP taunt threshold. */
export function shouldQueueLowHpTaunt(fraction: number, alive: boolean, threshold: number): boolean {
  return alive && fraction <= threshold;
}

/**
 * Greedy word-wrap one taunt utterance into the execution message window's lines.
 * Content is pre-sized (<=118 chars) so it fits in <=3 lines; if a pathological
 * line still overflows, later lines are dropped rather than clipped mid-word.
 */
export function wrapTauntLines(
  utterance: string,
  maxChars: number = TAUNT_WRAP_MAX_CHARS,
  maxLines: number = TAUNT_WRAP_MAX_LINES
): string[] {
  const words = utterance.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length > maxLines ? lines.slice(0, maxLines) : lines;
}
