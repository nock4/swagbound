import type { CharacterData } from "@eb/schemas";
import type { Combatant } from "./battleLogic";
import { createRollingMeter } from "./rollingMeter";

export type PartyMemberStats = {
  offense: number;
  defense: number;
  speed: number;
  guts: number;
  vitality: number;
  iq: number;
  luck: number;
};

export type PartyMemberStatBonuses = Partial<PartyMemberStats>;

export type PartyMember = {
  id: number;
  name: string;
  level: number;
  maxHp: number;
  hp: number;
  maxPp: number;
  pp: number;
  stats: PartyMemberStats;
  inventory: number[];
  money: number;
};

export type CharacterCombatantOptions = {
  hpRatePerSec?: number;
  statBonuses?: PartyMemberStatBonuses;
};

const DEFAULT_HP_RATE_PER_SEC = 36;

export function buildPartyMember(data: CharacterData): PartyMember {
  const maxHp = stat(data.maxHp);
  const maxPp = stat(data.maxPp);
  return {
    id: stat(data.id),
    name: data.name,
    level: Math.max(1, stat(data.level)),
    maxHp,
    hp: maxHp,
    maxPp,
    pp: maxPp,
    stats: {
      offense: stat(data.offense),
      defense: stat(data.defense),
      speed: stat(data.speed),
      guts: stat(data.guts),
      vitality: stat(data.vitality),
      iq: stat(data.iq),
      luck: stat(data.luck)
    },
    inventory: data.startingItems.map(stat),
    money: stat(data.money)
  };
}

export function buildCombatantFromPartyMember(
  member: PartyMember,
  options: CharacterCombatantOptions = {}
): Combatant {
  const maxHp = Math.max(1, stat(member.maxHp));
  const effectiveStats = effectivePartyMemberStats(member, options.statBonuses);
  return {
    charId: member.id,
    name: member.name,
    level: Math.max(1, stat(member.level)),
    maxHp,
    maxPp: stat(member.maxPp),
    pp: stat(member.pp),
    inventory: member.inventory.map(stat),
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? DEFAULT_HP_RATE_PER_SEC),
    offense: effectiveStats.offense,
    defense: effectiveStats.defense,
    speed: effectiveStats.speed,
    isEnemy: false
  };
}

export function buildCombatantFromCharacter(
  data: CharacterData,
  options: CharacterCombatantOptions = {}
): Combatant {
  return buildCombatantFromPartyMember(buildPartyMember(data), options);
}

export function effectivePartyMemberStats(
  member: Pick<PartyMember, "stats">,
  bonuses: PartyMemberStatBonuses = {}
): PartyMemberStats {
  return {
    offense: addStat(member.stats.offense, bonuses.offense),
    defense: addStat(member.stats.defense, bonuses.defense),
    speed: addStat(member.stats.speed, bonuses.speed),
    guts: addStat(member.stats.guts, bonuses.guts),
    vitality: addStat(member.stats.vitality, bonuses.vitality),
    iq: addStat(member.stats.iq, bonuses.iq),
    luck: addStat(member.stats.luck, bonuses.luck)
  };
}

function addStat(base: number, bonus: number | undefined): number {
  return stat(base) + stat(bonus ?? 0);
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
