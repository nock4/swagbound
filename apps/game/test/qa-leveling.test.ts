import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterData, PsiData } from "@eb/schemas";
import {
  buildPartyMember,
  calculateStatsAtLevel,
  levelForExperience
} from "../src/characterModel";
import {
  applyVictoryRewards,
  buildVictorySummaryViewModel,
  createBattleState,
  learnedPsiForCombatant
} from "../src/battleLogic";

// QA domain: leveling & skill growth.
// All fixtures are synthetic (numeric ids + neutral names only) so the suite
// carries no EarthBound IP. The growth/expTable shapes mirror the generated
// characters.json contract: deterministic midpoint stat growth + cumulative
// EXP thresholds, and psi.json learnedBy { charId, level } gating.

const GROWTH = {
  offense: 18,
  defense: 5,
  speed: 4,
  guts: 7,
  vitality: 5,
  iq: 5,
  luck: 6
} as const;

// Cumulative EXP thresholds: crossing 250 EXP from level 1 lands at level 6.
const EXP_TABLE = [
  { level: 1, experience: 0 },
  { level: 2, experience: 4 },
  { level: 3, experience: 17 },
  { level: 4, experience: 44 },
  { level: 5, experience: 109 },
  { level: 6, experience: 236 },
  { level: 7, experience: 449 }
];

// A neutral-base character: starting stats equal the level-1 baseline so that
// calculateStatsAtLevel growth is realized as positive per-level gains.
function growthCharacter(id: number): CharacterData {
  return {
    id,
    name: `PARTY_${id}`,
    level: 1,
    experience: 0,
    maxHp: 30,
    maxPp: 10,
    offense: 2,
    defense: 2,
    speed: 2,
    guts: 2,
    vitality: 2,
    iq: 2,
    luck: 2,
    startingItems: [],
    money: 0,
    growth: { ...GROWTH },
    expTable: EXP_TABLE.map((entry) => ({ ...entry }))
  };
}

function fallenEnemy(experience: number, money: number): BattleEnemy {
  return {
    id: 9001,
    name: "FOE",
    spriteId: 9001,
    level: 5,
    hp: 10,
    defense: 0,
    offense: 1,
    speed: 5,
    experience,
    money,
    bossFlag: false,
    actions: [0, 1, 2, 3].map(() => ({ id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 })) as BattleEnemy["actions"],
    itemDropped: null,
    itemRarity: null
  };
}

function syntheticPsi(id: number, charId: number, level: number, type = "offense"): PsiData {
  return {
    id,
    name: `SKILL_${id}`,
    type,
    strength: "alpha",
    usableOutsideBattle: type === "recovery",
    learnedBy: [{ charId, level }]
  };
}

describe("leveling & skill growth", () => {
  it("maps cumulative EXP onto level thresholds", () => {
    expect(levelForExperience(EXP_TABLE, 0, 1)).toBe(1);
    expect(levelForExperience(EXP_TABLE, 3, 1)).toBe(1);
    expect(levelForExperience(EXP_TABLE, 4, 1)).toBe(2);
    expect(levelForExperience(EXP_TABLE, 16, 1)).toBe(2);
    expect(levelForExperience(EXP_TABLE, 17, 1)).toBe(3);
    expect(levelForExperience(EXP_TABLE, 250, 1)).toBe(6);
    // Never regresses below the combatant's current level.
    expect(levelForExperience(EXP_TABLE, 0, 4)).toBe(4);
  });

  it("computes stats that are monotonic non-decreasing across levels", () => {
    const fields = ["offense", "defense", "speed", "guts", "vitality", "iq", "luck"] as const;
    let previous = calculateStatsAtLevel(GROWTH, 1);
    for (let level = 2; level <= 30; level += 1) {
      const current = calculateStatsAtLevel(GROWTH, level);
      for (const field of fields) {
        expect(current.stats[field]).toBeGreaterThanOrEqual(previous.stats[field]);
      }
      expect(current.maxHp).toBeGreaterThanOrEqual(previous.maxHp);
      expect(current.maxPp).toBeGreaterThanOrEqual(previous.maxPp);
      previous = current;
    }
  });

  it("a multi-level EXP grant raises level, grants stat increases, and learns a skill", () => {
    const member = buildPartyMember(growthCharacter(7));
    const psiList = [
      syntheticPsi(500, 7, 3, "offense"), // learned at level 3 -> reachable
      syntheticPsi(501, 7, 99, "recovery") // far out of reach
    ];

    let state = createBattleState([fallenEnemy(250, 40)], { partyMembers: [member] });
    // Simulate the enemy already KO'd so applyVictoryRewards awards its EXP/money.
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const before = state.party[0];
    expect(before.level).toBe(1);
    expect(learnedPsiForCombatant(psiList, before)).toHaveLength(0);

    const { state: after, summary } = applyVictoryRewards(state, { rng: () => 1 });
    const leveled = after.party[0];

    // Level crossed multiple thresholds (1 -> 6 for 250 cumulative EXP).
    expect(leveled.level).toBe(6);
    expect(leveled.experience).toBe(250);

    // Stat increases are real and non-decreasing.
    expect(leveled.offense).toBeGreaterThan(before.offense);
    expect(leveled.maxHp).toBeGreaterThan(before.maxHp);
    expect(leveled.maxPp).toBeGreaterThan(before.maxPp);
    for (const field of ["offense", "defense", "speed", "guts", "vitality", "iq", "luck"] as const) {
      expect(leveled.stats[field]).toBeGreaterThanOrEqual(before.stats[field]);
    }

    // Exactly one level-up event, with a positive aggregate stat gain.
    expect(summary.levelUps).toHaveLength(1);
    const levelUp = summary.levelUps[0];
    expect(levelUp.charId).toBe(7);
    expect(levelUp.fromLevel).toBe(1);
    expect(levelUp.toLevel).toBe(6);
    const aggregateGain = Object.values(levelUp.statGains).reduce((sum, value) => sum + value, 0);
    expect(aggregateGain).toBeGreaterThan(0);
    // No stat gain is ever negative.
    for (const gain of Object.values(levelUp.statGains)) {
      expect(gain).toBeGreaterThanOrEqual(0);
    }

    // A skill the character is eligible for at the new level is now learned.
    const learnedAfter = learnedPsiForCombatant(psiList, leveled).map((psi) => psi.id);
    expect(learnedAfter).toContain(500);
    expect(learnedAfter).not.toContain(501);
  });

  it("awards EXP/money rewards only for defeated enemies", () => {
    const member = buildPartyMember(growthCharacter(7));
    let state = createBattleState([fallenEnemy(250, 40)], { partyMembers: [member], wallet: 0 });
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const { state: after, summary } = applyVictoryRewards(state, { rng: () => 1 });
    expect(summary.expGained).toBe(250);
    expect(summary.moneyGained).toBe(40);
    expect(after.wallet).toBe(40);
  });

  it("victory view model surfaces EXP, $swag, and level-up lines", () => {
    const member = buildPartyMember(growthCharacter(7));
    let state = createBattleState([fallenEnemy(250, 40)], { partyMembers: [member] });
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const { summary } = applyVictoryRewards(state, { rng: () => 1 });
    const viewModel = buildVictorySummaryViewModel(summary);

    expect(viewModel.expGained).toBe(250);
    expect(viewModel.moneyGained).toBe(40);
    expect(viewModel.levelUps).toHaveLength(1);
    expect(viewModel.lines).toContain("EXP 250");
    expect(viewModel.lines).toContain("$swag 40");
    expect(viewModel.lines.some((line) => /Lv 6$/.test(line))).toBe(true);
  });
});
