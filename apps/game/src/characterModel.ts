import type { CharacterData, CharacterExpThreshold, CharacterGrowth } from "@eb/schemas";
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
export type PartyMemberGrowth = CharacterGrowth;
export type PartyMemberExpThreshold = CharacterExpThreshold;
export type PartyMemberStatSnapshot = {
  maxHp: number;
  maxPp: number;
  stats: PartyMemberStats;
};
export type PartyMemberStatBase = PartyMemberStatSnapshot & {
  level?: number;
};

export type PartyMember = {
  id: number;
  name: string;
  level: number;
  experience: number;
  maxHp: number;
  hp: number;
  maxPp: number;
  pp: number;
  stats: PartyMemberStats;
  inventory: number[];
  money: number;
  growth?: PartyMemberGrowth;
  expTable?: PartyMemberExpThreshold[];
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
    experience: stat(data.experience ?? 0),
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
    money: stat(data.money),
    ...(data.growth ? { growth: normalizeGrowth(data.growth) } : {}),
    ...(data.expTable ? { expTable: normalizeExpTable(data.expTable) } : {})
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
    experience: stat(member.experience),
    stats: effectiveStats,
    ...(member.growth ? { growth: { ...member.growth } } : {}),
    ...(member.expTable ? { expTable: member.expTable.map((entry) => ({ ...entry })) } : {}),
    money: stat(member.money),
    itemDropped: null,
    itemRarity: null,
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

export function calculateStatsAtLevel(
  growth: PartyMemberGrowth,
  level: number,
  base?: PartyMemberStatBase
): PartyMemberStatSnapshot {
  const targetLevel = normalizedLevel(level);
  if (!base) {
    return calculateNeutralStatsAtLevel(growth, targetLevel);
  }

  const normalizedBase = normalizeStatSnapshot(base);
  const baseLevel = normalizedLevel(base.level ?? 1);
  if (targetLevel <= baseLevel) {
    return normalizedBase;
  }

  const neutralBase = calculateNeutralStatsAtLevel(growth, baseLevel);
  const neutralTarget = calculateNeutralStatsAtLevel(growth, targetLevel);
  return {
    maxHp: normalizedBase.maxHp + Math.max(0, neutralTarget.maxHp - neutralBase.maxHp),
    maxPp: normalizedBase.maxPp + Math.max(0, neutralTarget.maxPp - neutralBase.maxPp),
    stats: {
      offense: projectStat("offense", normalizedBase, neutralBase, neutralTarget),
      defense: projectStat("defense", normalizedBase, neutralBase, neutralTarget),
      speed: projectStat("speed", normalizedBase, neutralBase, neutralTarget),
      guts: projectStat("guts", normalizedBase, neutralBase, neutralTarget),
      vitality: projectStat("vitality", normalizedBase, neutralBase, neutralTarget),
      iq: projectStat("iq", normalizedBase, neutralBase, neutralTarget),
      luck: projectStat("luck", normalizedBase, neutralBase, neutralTarget)
    }
  };
}

function calculateNeutralStatsAtLevel(growth: PartyMemberGrowth, level: number): PartyMemberStatSnapshot {
  const calculated = neutralLevelOneStats();

  for (let nextLevel = 2; nextLevel <= normalizedLevel(level); nextLevel += 1) {
    calculated.stats.offense = calcNewStat("offense", growth, nextLevel, calculated.stats.offense);
    calculated.stats.defense = calcNewStat("defense", growth, nextLevel, calculated.stats.defense);
    calculated.stats.speed = calcNewStat("speed", growth, nextLevel, calculated.stats.speed);
    calculated.stats.guts = calcNewStat("guts", growth, nextLevel, calculated.stats.guts);
    calculated.stats.vitality = calcNewStat("vitality", growth, nextLevel, calculated.stats.vitality);
    calculated.stats.iq = calcNewStat("iq", growth, nextLevel, calculated.stats.iq);
    calculated.stats.luck = calcNewStat("luck", growth, nextLevel, calculated.stats.luck);

    const targetHp = 15 * calculated.stats.vitality;
    calculated.maxHp = targetHp - calculated.maxHp < 2 ? calculated.maxHp + 2 : targetHp;

    const targetPp = 5 * calculated.stats.iq;
    calculated.maxPp = targetPp - calculated.maxPp < 2 ? calculated.maxPp + 1 : targetPp;
  }

  return calculated;
}

export function levelForExperience(
  thresholds: PartyMemberExpThreshold[] | undefined,
  experience: number,
  currentLevel: number
): number {
  const normalizedExperience = stat(experience);
  return normalizeExpTable(thresholds ?? []).reduce(
    (level, threshold) => normalizedExperience >= threshold.experience ? Math.max(level, threshold.level) : level,
    Math.max(1, stat(currentLevel))
  );
}

function addStat(base: number, bonus: number | undefined): number {
  return stat(base) + stat(bonus ?? 0);
}

function normalizeGrowth(growth: CharacterGrowth): PartyMemberGrowth {
  return {
    offense: stat(growth.offense),
    defense: stat(growth.defense),
    speed: stat(growth.speed),
    guts: stat(growth.guts),
    vitality: stat(growth.vitality),
    iq: stat(growth.iq),
    luck: stat(growth.luck)
  };
}

function normalizeExpTable(thresholds: CharacterExpThreshold[]): PartyMemberExpThreshold[] {
  return thresholds
    .map((entry) => ({
      level: Math.max(1, stat(entry.level)),
      experience: stat(entry.experience)
    }))
    .sort((a, b) => a.level - b.level);
}

function calcNewStat(
  statName: keyof PartyMemberGrowth,
  growth: PartyMemberGrowth,
  newLevel: number,
  oldStatValue: number
): number {
  const r = midpointRoll(statName, newLevel);
  const targetGap = (growth[statName] * (newLevel - 1)) - ((oldStatValue - 2) * 10);
  return Math.max(oldStatValue, oldStatValue + Math.trunc(targetGap * (r / 50)));
}

function midpointRoll(statName: keyof PartyMemberGrowth, newLevel: number): number {
  if ((statName === "vitality" || statName === "iq") && newLevel <= 10) {
    return 5;
  }
  if (newLevel % 4 === 0) {
    return 8.5;
  }
  return 4.5;
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizedLevel(level: number): number {
  return Math.max(1, stat(level));
}

function neutralLevelOneStats(): PartyMemberStatSnapshot {
  return {
    maxHp: 30,
    maxPp: 10,
    stats: {
      offense: 2,
      defense: 2,
      speed: 2,
      guts: 2,
      vitality: 2,
      iq: 2,
      luck: 2
    }
  };
}

function normalizeStatSnapshot(snapshot: PartyMemberStatSnapshot): PartyMemberStatSnapshot {
  return {
    maxHp: stat(snapshot.maxHp),
    maxPp: stat(snapshot.maxPp),
    stats: {
      offense: stat(snapshot.stats.offense),
      defense: stat(snapshot.stats.defense),
      speed: stat(snapshot.stats.speed),
      guts: stat(snapshot.stats.guts),
      vitality: stat(snapshot.stats.vitality),
      iq: stat(snapshot.stats.iq),
      luck: stat(snapshot.stats.luck)
    }
  };
}

function projectStat(
  field: keyof PartyMemberStats,
  base: PartyMemberStatSnapshot,
  neutralBase: PartyMemberStatSnapshot,
  neutralTarget: PartyMemberStatSnapshot
): number {
  return base.stats[field] + Math.max(0, neutralTarget.stats[field] - neutralBase.stats[field]);
}
