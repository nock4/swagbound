import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterCollection, CharacterData, PsiData } from "@eb/schemas";
import {
  buildPartyMember,
  calculateStatsAtLevel,
  type PartyMemberStatSnapshot,
  levelForExperience
} from "../src/characterModel";
import {
  applyVictoryRewards,
  advanceVictorySummaryPageIndex,
  buildVictorySummaryViewModel,
  createBattleState,
  learnedPsiForCombatant
} from "../src/battleLogic";

// QA domain: leveling & skill growth.
// All fixtures are synthetic (numeric ids + neutral names only) so the suite
// carries no source-game names. The growth/expTable shapes mirror the generated
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

const STAT_FIELDS = ["offense", "defense", "speed", "guts", "vitality", "iq", "luck"] as const;
const GENERATED_CHARACTERS = JSON.parse(
  readFileSync(new URL("../public/generated/characters.json", import.meta.url), "utf8")
) as CharacterCollection;

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

function syntheticPsi(id: number, charId: number, level: number, type = "offense", name = `SKILL_${id}`): PsiData {
  return {
    id,
    name,
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
    let previous = calculateStatsAtLevel(GROWTH, 1);
    for (let level = 2; level <= 30; level += 1) {
      const current = calculateStatsAtLevel(GROWTH, level);
      for (const field of STAT_FIELDS) {
        expect(current.stats[field]).toBeGreaterThanOrEqual(previous.stats[field]);
      }
      expect(current.maxHp).toBeGreaterThanOrEqual(previous.maxHp);
      expect(current.maxPp).toBeGreaterThanOrEqual(previous.maxPp);
      previous = current;
    }
  });

  it("projects generated base stats from level 1 without an early dead zone", () => {
    const character = generatedCharacter(0);
    const growth = requireGrowth(character);
    const base = statSnapshotFromCharacter(character);
    const baseProjection = calculateStatsAtLevel(growth, character.level, {
      level: character.level,
      ...base
    });

    expect(baseProjection).toEqual(base);

    let previous = baseProjection;
    for (let level = 2; level <= 12; level += 1) {
      const current = calculateStatsAtLevel(growth, level, {
        level: character.level,
        ...base
      });
      for (const field of STAT_FIELDS) {
        expect(current.stats[field]).toBeGreaterThanOrEqual(previous.stats[field]);
      }
      expect(current.maxHp).toBeGreaterThanOrEqual(previous.maxHp);
      expect(current.maxPp).toBeGreaterThanOrEqual(previous.maxPp);
      if (level <= 7) {
        expect(totalStats(current)).toBeGreaterThan(totalStats(previous));
      }
      previous = current;
    }

    const earlySliceProjection = calculateStatsAtLevel(growth, 7, {
      level: character.level,
      ...base
    });
    expect(earlySliceProjection.maxHp).toBeGreaterThan(base.maxHp);
    expect(earlySliceProjection.stats.offense).toBeGreaterThan(base.stats.offense);
  });

  it("a generated-base multi-level EXP grant raises HP and offense", () => {
    const member = buildPartyMember(generatedCharacter(0));
    let state = createBattleState([fallenEnemy(449, 0)], { partyMembers: [member] });
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const before = state.party[0];
    const { state: after, summary } = applyVictoryRewards(state, { rng: () => 1 });
    const leveled = after.party[0];

    expect(leveled.level).toBe(7);
    expect(leveled.experience).toBe(449);
    expect(leveled.maxHp).toBeGreaterThan(before.maxHp);
    expect(leveled.offense).toBeGreaterThan(before.offense);
    expect(leveled.maxPp).toBeGreaterThanOrEqual(before.maxPp);
    for (const field of STAT_FIELDS) {
      expect(leveled.stats[field]).toBeGreaterThanOrEqual(before.stats[field]);
    }

    expect(summary.levelUps).toHaveLength(1);
    expect(summary.levelUps[0]).toMatchObject({
      charId: 0,
      fromLevel: 1,
      toLevel: 7
    });
    expect(summary.levelUps[0].statGains.maxHp).toBeGreaterThan(0);
    expect(summary.levelUps[0].statGains.offense).toBeGreaterThan(0);
    for (const gain of Object.values(summary.levelUps[0].statGains)) {
      expect(gain).toBeGreaterThanOrEqual(0);
    }
  });

  it("a multi-level EXP grant raises level, grants stat increases, and learns a skill", () => {
    const member = buildPartyMember(growthCharacter(7));
    const psiList = [
      syntheticPsi(500, 7, 3, "offense", "Wake Up"), // learned at level 3 -> reachable
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

    const { state: after, summary } = applyVictoryRewards(state, { rng: () => 1, psi: psiList });
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
    expect(levelUp.learnedSkills).toEqual([{ psiId: 500, name: "Wake Up" }]);
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

  it("victory view model surfaces tally, level-up spotlight, stat deltas, and learned PSI lines", () => {
    const member = buildPartyMember(growthCharacter(7));
    const psiList = [
      syntheticPsi(500, 7, 3, "offense", "Wake Up")
    ];
    let state = createBattleState([fallenEnemy(250, 40)], { partyMembers: [member] });
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const { summary } = applyVictoryRewards(state, { rng: () => 1, psi: psiList });
    const viewModel = buildVictorySummaryViewModel(summary);

    expect(viewModel.expGained).toBe(250);
    expect(viewModel.moneyGained).toBe(40);
    expect(viewModel.levelUps).toHaveLength(1);
    expect(viewModel.lines).toContain("250 EXP");
    expect(viewModel.lines).toContain("You got $40");
    expect(viewModel.lines).toContain("PARTY_7 LEVEL UP!");
    expect(viewModel.lines).toContain("Lv 1 -> 6 ↑");
    expect(viewModel.lines.some((line) => /^Offense \d+ -> \d+ ↑$/.test(line))).toBe(true);
    expect(viewModel.lines).toContain("Learned PSI Wake Up!");
  });

  it("paginates a multi-beat victory summary and advances before exit", () => {
    const member = buildPartyMember(growthCharacter(7));
    const psiList = [
      syntheticPsi(500, 7, 3, "offense", "Wake Up")
    ];
    let state = createBattleState([fallenEnemy(250, 40)], { partyMembers: [member] });
    state.enemies[0].hp.displayed = 0;
    state.enemies[0].hp.target = 0;
    state.enemies[0].hp.isRolling = false;

    const { summary } = applyVictoryRewards(state, { rng: () => 1, psi: psiList });
    const viewModel = buildVictorySummaryViewModel(summary);

    expect(viewModel.pages.length).toBeGreaterThan(3);
    expect(viewModel.pages[0]).toEqual(["250 EXP", "You got $40", "Found no items"]);
    expect(viewModel.pageDetails[1]).toMatchObject({
      kind: "level-up",
      highlighted: true,
      lines: ["PARTY_7 LEVEL UP!", "Lv 1 -> 6 ↑"]
    });
    expect(viewModel.pageDetails.some((page) => page.kind === "stat-gains" && page.lines[0]?.includes("->"))).toBe(true);
    expect(viewModel.pageDetails[viewModel.pageDetails.length - 1]).toMatchObject({
      kind: "learned-psi",
      highlighted: true,
      lines: ["Learned PSI Wake Up!"]
    });

    const afterFirstConfirm = advanceVictorySummaryPageIndex(0, viewModel.pages.length);
    expect(afterFirstConfirm).toEqual({ pageIndex: 1, shouldExit: false });
    expect(advanceVictorySummaryPageIndex(viewModel.pages.length - 1, viewModel.pages.length))
      .toEqual({ pageIndex: viewModel.pages.length - 1, shouldExit: true });
  });

  it("keeps a trivial victory summary on one page and exits on first confirm", () => {
    const viewModel = buildVictorySummaryViewModel({
      expGained: 4,
      moneyGained: 1,
      drops: [],
      levelUps: []
    });

    expect(viewModel.pages).toEqual([["4 EXP", "You got $1", "Found no items"]]);
    expect(advanceVictorySummaryPageIndex(0, viewModel.pages.length))
      .toEqual({ pageIndex: 0, shouldExit: true });
  });
});

function generatedCharacter(id: number): CharacterData {
  const character = GENERATED_CHARACTERS.characters.find((entry) => entry.id === id);
  if (!character) {
    throw new Error(`Missing generated character id ${id}`);
  }
  return character;
}

function requireGrowth(character: CharacterData): NonNullable<CharacterData["growth"]> {
  if (!character.growth) {
    throw new Error(`Missing growth for character id ${character.id}`);
  }
  return character.growth;
}

function statSnapshotFromCharacter(character: CharacterData): PartyMemberStatSnapshot {
  return {
    maxHp: character.maxHp,
    maxPp: character.maxPp,
    stats: {
      offense: character.offense,
      defense: character.defense,
      speed: character.speed,
      guts: character.guts,
      vitality: character.vitality,
      iq: character.iq,
      luck: character.luck
    }
  };
}

function totalStats(snapshot: PartyMemberStatSnapshot): number {
  return snapshot.maxHp
    + snapshot.maxPp
    + STAT_FIELDS.reduce((sum, field) => sum + snapshot.stats[field], 0);
}
