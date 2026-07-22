// Pure model for the Mons system: leveling, ability learnsets, negotiation
// (catching), and SMT-style fusion. No Phaser, no scene state - everything here
// is deterministic and unit-testable. Scene/battle integration lives elsewhere.

import type {
  MonAbilities,
  MonFusion,
  MonQuestionBanks,
  MonRace,
  MonsRegistry,
  MonsRegistryEntry
} from "@eb/schemas";

// Reserved id space for mon party members; never collides with characters.json
// (cap 8) or NPC/enemy ids. charId-keyed maps treat >= MON_PARTY_ID_BASE as mons.
export const MON_PARTY_ID_BASE = 100000;
// Synthetic PSI ids for mon MOVES; exempt from the usability matrix (battle-only
// by construction, never in menus outside battle).
export const MON_PSI_ID_BASE = 900100;
export function isMonPsiId(psiId: number): boolean {
  return psiId >= MON_PSI_ID_BASE;
}

// Generous on purpose: EB bash damage swings are large and Bosch has no weak
// poke, so a tight window makes catches luck-dependent (verified in-engine:
// a 42hp wild went 42 -> 17 -> dead around a 35% gate).
export const CONVINCE_HP_RATIO = 0.5;
export const MON_BATTLE_QUESTION_COUNT = 3;
// 2/3 right earns one bonus question instead of outright failure.
export const MON_BONUS_QUESTION_THRESHOLD = 2;

// --- leveling ----------------------------------------------------------------

// EB-flavored quadratic curve; shared by all mons.
export function monXpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return Math.floor((l - 1) * (l - 1) * 14 + (l - 1) * 22);
}

export function monLevelForXp(xp: number): number {
  let level = 1;
  while (level < 99 && monXpForLevel(level + 1) <= xp) {
    level++;
  }
  return level;
}

export interface MonStatline {
  maxHp: number;
  maxPp: number;
  offense: number;
  defense: number;
  speed: number;
}

// Registry stats are the statline AT baseLevel; grow/shrink linearly per level
// with race-agnostic growth already baked into the base numbers.
const LEVEL_GROWTH: MonStatline = { maxHp: 5, maxPp: 2, offense: 1.6, defense: 1.3, speed: 1.1 };

export function monStatsAtLevel(entry: MonsRegistryEntry, level: number): MonStatline {
  const delta = Math.max(1, Math.floor(level)) - entry.baseLevel;
  const grow = (base: number, per: number) => Math.max(1, Math.round(base + per * delta));
  return {
    maxHp: grow(entry.maxHp, LEVEL_GROWTH.maxHp),
    maxPp: grow(entry.maxPp, LEVEL_GROWTH.maxPp),
    offense: grow(entry.offense, LEVEL_GROWTH.offense),
    defense: grow(entry.defense, LEVEL_GROWTH.defense),
    speed: grow(entry.speed, LEVEL_GROWTH.speed)
  };
}

// --- abilities ---------------------------------------------------------------

export const MATERIAL_SPLASH_UNLOCK_LEVEL = 12;

export interface LearnedAbilityRef {
  abilityId: string;
  unlockLevel: number;
  source: "kit" | "splash" | "inherited";
}

export function monLearnset(entry: MonsRegistryEntry, abilities: MonAbilities): LearnedAbilityRef[] {
  const kit = abilities.raceKits[entry.race] ?? [];
  const refs: LearnedAbilityRef[] = kit.map((k) => ({
    abilityId: k.abilityId,
    unlockLevel: k.unlockLevel,
    source: "kit" as const
  }));
  const splash = abilities.materialSplash[entry.element];
  if (splash && !refs.some((r) => r.abilityId === splash)) {
    refs.push({ abilityId: splash, unlockLevel: MATERIAL_SPLASH_UNLOCK_LEVEL, source: "splash" });
  }
  return refs.sort((a, b) => a.unlockLevel - b.unlockLevel);
}

export function monKnownAbilities(
  entry: MonsRegistryEntry,
  abilities: MonAbilities,
  level: number,
  inherited: string[] = []
): string[] {
  const known = monLearnset(entry, abilities)
    .filter((r) => r.unlockLevel <= level)
    .map((r) => r.abilityId);
  for (const id of inherited) {
    if (!known.includes(id) && abilities.abilities[id]) {
      known.push(id);
    }
  }
  return known;
}

// --- owned roster ------------------------------------------------------------

export interface OwnedMon {
  registryId: string;
  level: number;
  xp: number;
  bond: number;
  inherited: string[];
  lineage?: { parents: [string, string] };
  caughtAtFlag?: string;
}

export function createOwnedMon(entry: MonsRegistryEntry, overrides: Partial<OwnedMon> = {}): OwnedMon {
  return {
    registryId: entry.id,
    level: entry.baseLevel,
    xp: monXpForLevel(entry.baseLevel),
    bond: 0,
    inherited: [],
    ...overrides
  };
}

export interface MonXpGain {
  mon: OwnedMon;
  leveledFrom?: number;
  learned: string[];
}

export function grantMonXp(
  mon: OwnedMon,
  entry: MonsRegistryEntry,
  abilities: MonAbilities,
  amount: number
): MonXpGain {
  const xp = mon.xp + Math.max(0, Math.floor(amount));
  const level = monLevelForXp(xp);
  if (level <= mon.level) {
    return { mon: { ...mon, xp }, learned: [] };
  }
  const before = new Set(monKnownAbilities(entry, abilities, mon.level, mon.inherited));
  const after = monKnownAbilities(entry, abilities, level, mon.inherited);
  return {
    mon: { ...mon, xp, level },
    leveledFrom: mon.level,
    learned: after.filter((id) => !before.has(id))
  };
}

// --- negotiation (catching) --------------------------------------------------

export interface MonNegotiationQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  rightLine: string;
  wrongLine: string;
}

export interface MonNegotiationState {
  questions: MonNegotiationQuestion[];
  askedIndex: number;
  correct: number;
  wrong: number;
  bonusGranted: boolean;
  outcome: "asking" | "joined" | "refused";
}

// Deterministic question draw: hash of (monId, seedTag) picks without RNG so
// harnesses replay exactly. seedTag varies per encounter (e.g. step counter).
function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function drawNegotiationQuestions(
  banks: MonQuestionBanks,
  personality: string,
  seed: string,
  count = MON_BATTLE_QUESTION_COUNT + 1 // +1 so a bonus question is pre-drawn
): MonNegotiationQuestion[] {
  const bank = banks.banks[personality];
  if (!bank) {
    return [];
  }
  const pool = [...bank.questions];
  const target = Math.min(count, pool.length);
  const drawn: MonNegotiationQuestion[] = [];
  let h = hash32(`${personality}:${seed}`);
  while (drawn.length < target) {
    h = hash32(`${h}`);
    const pick = h % pool.length;
    drawn.push(pool.splice(pick, 1)[0]);
  }
  return drawn;
}

export function createNegotiation(questions: MonNegotiationQuestion[]): MonNegotiationState {
  return { questions, askedIndex: 0, correct: 0, wrong: 0, bonusGranted: false, outcome: "asking" };
}

export function answerNegotiation(state: MonNegotiationState, optionIndex: number): MonNegotiationState {
  if (state.outcome !== "asking") {
    return state;
  }
  const question = state.questions[state.askedIndex];
  if (!question) {
    return { ...state, outcome: "refused" };
  }
  const right = optionIndex === question.correctIndex;
  const correct = state.correct + (right ? 1 : 0);
  const wrong = state.wrong + (right ? 0 : 1);
  const asked = state.askedIndex + 1;
  const base = { ...state, askedIndex: asked, correct, wrong };
  if (asked < MON_BATTLE_QUESTION_COUNT) {
    return base;
  }
  if (asked === MON_BATTLE_QUESTION_COUNT) {
    if (correct >= MON_BATTLE_QUESTION_COUNT) {
      return { ...base, outcome: "joined" };
    }
    if (correct >= MON_BONUS_QUESTION_THRESHOLD && state.questions.length > MON_BATTLE_QUESTION_COUNT) {
      return { ...base, bonusGranted: true };
    }
    return { ...base, outcome: "refused" };
  }
  // bonus question resolution
  return { ...base, outcome: right ? "joined" : "refused" };
}

// --- fusion ------------------------------------------------------------------

export interface FusionPreview {
  ok: boolean;
  reason?: "secret-parent" | "no-candidate" | "same-mon";
  resultRace?: MonRace | "SAME";
  result?: MonsRegistryEntry;
  projectedLevel?: number;
  inheritable?: string[];
  secretResult?: MonsRegistryEntry;
}

export function resolveFusion(
  a: { entry: MonsRegistryEntry; owned: OwnedMon },
  b: { entry: MonsRegistryEntry; owned: OwnedMon },
  registry: MonsRegistry,
  fusion: MonFusion,
  abilities: MonAbilities,
  ownedIds: Set<string>
): FusionPreview {
  if (a.entry.id === b.entry.id && a.owned === b.owned) {
    return { ok: false, reason: "same-mon" };
  }
  if (a.entry.race === "Secret" || b.entry.race === "Secret") {
    return { ok: false, reason: "secret-parent" };
  }
  // Secret recipe check first: exact race pair + both parents at/above minTier.
  const pair = new Set([a.entry.race, b.entry.race]);
  for (const recipe of fusion.secretRecipes) {
    const want = new Set(recipe.requires.races);
    const tiersOk = a.entry.tier >= recipe.requires.minTier && b.entry.tier >= recipe.requires.minTier;
    if (tiersOk && want.size === pair.size && [...want].every((r) => pair.has(r))) {
      const secret = registry.mons.find((m) => m.id === recipe.resultId);
      if (secret && !ownedIds.has(secret.id)) {
        return {
          ok: true,
          resultRace: secret.race as MonRace,
          result: secret,
          secretResult: secret,
          projectedLevel: Math.max(secret.baseLevel, avgLevel(a, b)),
          inheritable: inheritableAbilities(a, b, abilities)
        };
      }
    }
  }
  const raceA = a.entry.race as MonRace;
  const raceB = b.entry.race as MonRace;
  const cell = fusion.chart[raceA]?.[raceB];
  if (!cell) {
    return { ok: false, reason: "no-candidate" };
  }
  const tierCap = Math.min(5, Math.max(a.entry.tier, b.entry.tier) + 1);
  const targetLevel = avgLevel(a, b) + 1;
  if (cell === "SAME") {
    // same-race fusion: tier-up reroll within the race
    const candidates = registry.mons
      .filter((m) => m.race === raceA && !m.secretRare && m.tier <= tierCap && !ownedIds.has(m.id))
      .filter((m) => m.id !== a.entry.id && m.id !== b.entry.id)
      .sort((x, y) => (y.tier - x.tier) || (x.baseLevel - y.baseLevel));
    const result = candidates.find((m) => m.baseLevel >= targetLevel) ?? candidates[candidates.length - 1];
    if (!result) {
      return { ok: false, reason: "no-candidate" };
    }
    return {
      ok: true, resultRace: "SAME", result,
      projectedLevel: Math.max(result.baseLevel, targetLevel),
      inheritable: inheritableAbilities(a, b, abilities)
    };
  }
  // SMT rule: lowest baseLevel of the result race >= avg+1 (not owned, not a parent).
  const candidates = registry.mons
    .filter((m) => m.race === cell && !m.secretRare && m.tier <= tierCap && !ownedIds.has(m.id))
    .filter((m) => m.id !== a.entry.id && m.id !== b.entry.id)
    .sort((x, y) => x.baseLevel - y.baseLevel);
  const result = candidates.find((m) => m.baseLevel >= targetLevel) ?? candidates[candidates.length - 1];
  if (!result) {
    return { ok: false, reason: "no-candidate" };
  }
  return {
    ok: true, resultRace: cell, result,
    projectedLevel: Math.max(result.baseLevel, targetLevel),
    inheritable: inheritableAbilities(a, b, abilities)
  };
}

function avgLevel(a: { owned: OwnedMon }, b: { owned: OwnedMon }): number {
  return Math.floor((a.owned.level + b.owned.level) / 2);
}

function inheritableAbilities(
  a: { entry: MonsRegistryEntry; owned: OwnedMon },
  b: { entry: MonsRegistryEntry; owned: OwnedMon },
  abilities: MonAbilities
): string[] {
  const union = new Set([
    ...monKnownAbilities(a.entry, abilities, a.owned.level, a.owned.inherited),
    ...monKnownAbilities(b.entry, abilities, b.owned.level, b.owned.inherited)
  ]);
  return [...union];
}

export function executeFusion(
  preview: FusionPreview,
  picks: string[]
): { owned: OwnedMon } | undefined {
  if (!preview.ok || !preview.result || preview.projectedLevel === undefined) {
    return undefined;
  }
  const inherited = picks.filter((p) => preview.inheritable?.includes(p)).slice(0, 2);
  return {
    owned: {
      registryId: preview.result.id,
      level: preview.projectedLevel,
      xp: monXpForLevel(preview.projectedLevel),
      bond: 0,
      inherited
    }
  };
}

// --- registry helpers --------------------------------------------------------

export function monById(registry: MonsRegistry, id: string): MonsRegistryEntry | undefined {
  return registry.mons.find((m) => m.id === id);
}

export function monDisplayName(entry: MonsRegistryEntry): string {
  return entry.displayName ?? entry.name;
}

export function monPartyCharId(index: number): number {
  return MON_PARTY_ID_BASE + index;
}

export function isMonPartyCharId(charId: number): boolean {
  return charId >= MON_PARTY_ID_BASE;
}
