// Bridges the mon roster into the battle system. A companion mon becomes a
// PartyMember with a reserved charId, and its abilities become SYNTHETIC PSI
// entries (id >= MON_PSI_ID_BASE) so the existing PSI submenu, resolvePsiTurn,
// psiEffectAmount (reads .power) and ItemUseEffect machinery execute MOVES with
// zero new battle-effect code.

import type { MonAbilities, MonsRegistryEntry, PsiData } from "@eb/schemas";
import type { PartyMember } from "./characterModel";
import { MON_PARTY_ID_BASE, MON_PSI_ID_BASE, monDisplayName, monKnownAbilities, monStatsAtLevel, type OwnedMon } from "./monsModel";

export { MON_PSI_ID_BASE };

type PsiEffect = NonNullable<PsiData["effect"]>;

export type MonBattleKit = {
  member: PartyMember;
  psi: PsiData[];
};

const STATUS_TO_EFFECT: Record<string, PsiEffect> = {
  poison: { kind: "inflictStatus", ailment: "poisoned" },
  paralysis: { kind: "inflictStatus", ailment: "paralyzed" },
  sleep: { kind: "inflictStatus", ailment: "asleep" },
  confusion: { kind: "inflictStatus", ailment: "confused" },
  shield: { kind: "inflictStatus", ailment: "shielded" },
  offenseUp: { kind: "buffStat", stat: "offense", multiplier: 1.4 },
  defenseUp: { kind: "buffStat", stat: "defense", multiplier: 1.4 },
  speedUp: { kind: "buffStat", stat: "speed", multiplier: 1.4 },
  offenseDown: { kind: "buffStat", stat: "offense", multiplier: 0.7 },
  defenseDown: { kind: "buffStat", stat: "defense", multiplier: 0.7 }
};

function abilityToPsi(abilityId: string, index: number, abilities: MonAbilities, monCharId: number): PsiData | undefined {
  const ability = abilities.abilities[abilityId];
  if (!ability) {
    return undefined;
  }
  const offensive = ability.kind === "damage" || ability.kind === "drain" ||
    (ability.kind === "debuff" || (ability.kind === "status" && ability.target !== "self" && ability.target !== "ally" && ability.target !== "allAllies"));
  const direction = offensive ? "enemy" : "party";
  const target = ability.target === "allEnemies" || ability.target === "allAllies" ? "all" : "one";
  const base: PsiData = {
    id: MON_PSI_ID_BASE + index,
    name: ability.name,
    type: ability.kind === "damage" || ability.kind === "drain" ? "offense"
      : ability.kind === "heal" ? "recovery"
      : "assist",
    strength: "alpha",
    ppCost: ability.ppCost,
    target,
    direction,
    usableOutsideBattle: false,
    learnedBy: [{ charId: monCharId, level: 1 }]
  };
  if (ability.kind === "damage" || ability.kind === "drain") {
    return { ...base, ...(ability.power !== undefined ? { power: ability.power } : {}) } as PsiData;
  }
  if (ability.kind === "heal") {
    return { ...base, ...(ability.power !== undefined ? { power: ability.power } : {}) } as PsiData;
  }
  const effect = ability.status ? STATUS_TO_EFFECT[ability.status] : undefined;
  if (!effect) {
    return undefined;
  }
  return { ...base, effect };
}

export function buildMonBattleKit(
  entry: MonsRegistryEntry,
  owned: OwnedMon,
  abilities: MonAbilities,
  options: { hp?: number; pp?: number } = {}
): MonBattleKit {
  const stats = monStatsAtLevel(entry, owned.level);
  const monCharId = MON_PARTY_ID_BASE;
  const member: PartyMember = {
    id: monCharId,
    name: monDisplayName(entry),
    level: owned.level,
    experience: owned.xp,
    maxHp: stats.maxHp,
    hp: Math.max(1, Math.min(stats.maxHp, options.hp ?? stats.maxHp)),
    maxPp: stats.maxPp,
    pp: Math.max(0, Math.min(stats.maxPp, options.pp ?? stats.maxPp)),
    stats: {
      offense: stats.offense,
      defense: stats.defense,
      speed: stats.speed,
      // Mons don't roll the EB secondary stats; give neutral floors so any
      // formula that reads them behaves.
      guts: 5,
      vitality: Math.max(1, Math.floor(stats.maxHp / 15)),
      iq: 5,
      luck: 5
    },
    inventory: [],
    money: 0
  };
  const known = monKnownAbilities(entry, abilities, owned.level, owned.inherited);
  const psi = known
    .map((abilityId, index) => abilityToPsi(abilityId, index, abilities, monCharId))
    .filter((p): p is PsiData => p !== undefined);
  return { member, psi };
}

// Commands available to a mon combatant (no items, no run, no EB PSI screens
// beyond its own MOVES which ride the PSI submenu).
export const MON_BATTLE_COMMANDS = ["BASH", "PSI", "DEFEND"] as const;
