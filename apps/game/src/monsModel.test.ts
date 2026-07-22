import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MonAbilitiesSchema,
  MonFusionSchema,
  MonQuestionBanksSchema,
  MonStorySchema,
  MonsRegistrySchema,
  MON_PERSONALITIES,
  MON_RACES
} from "@eb/schemas";
import {
  answerNegotiation,
  createNegotiation,
  createOwnedMon,
  negotiationForgiveness,
  drawNegotiationQuestions,
  executeFusion,
  grantMonXp,
  monKnownAbilities,
  monLevelForXp,
  monStatsAtLevel,
  monXpForLevel,
  resolveFusion,
  MON_PARTY_ID_BASE,
  isMonPartyCharId
} from "./monsModel";
import { validateSaveState, SAVE_STATE_SCHEMA_VERSION } from "./saveState";

const registry = MonsRegistrySchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mons-registry.json"), "utf8")
));
const abilities = MonAbilitiesSchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-abilities.json"), "utf8")
));
const fusion = MonFusionSchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-fusion.json"), "utf8")
));
const banks = MonQuestionBanksSchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-question-banks.json"), "utf8")
));
const story = MonStorySchema.parse(JSON.parse(
  readFileSync(resolve("content/mons/mon-story.json"), "utf8")
));

describe("mons registry", () => {
  it("holds all 777 mons with valid traits", () => {
    expect(registry.mons).toHaveLength(777);
    expect(registry.mons.filter((m) => m.secretRare)).toHaveLength(5);
  });

  it("every catchable mon has a question bank for its personality", () => {
    for (const mon of registry.mons) {
      if (mon.secretRare) continue;
      expect(banks.banks[mon.personality!], `bank for ${mon.personality}`).toBeDefined();
    }
  });

  it("every race kit resolves for every mon race", () => {
    for (const mon of registry.mons) {
      expect(abilities.raceKits[mon.race], `kit for ${mon.race}`).toBeDefined();
    }
  });

  it("player-facing mon content carries no em dashes", () => {
    const packs = [abilities, fusion, banks, story];
    for (const pack of packs) {
      expect(JSON.stringify(pack)).not.toContain("—");
    }
    for (const mon of registry.mons) {
      expect(mon.displayName ?? mon.name).not.toContain("—");
    }
  });
});

describe("mon leveling", () => {
  it("xp curve is monotonic and round-trips through monLevelForXp", () => {
    for (let level = 1; level < 60; level++) {
      expect(monXpForLevel(level + 1)).toBeGreaterThan(monXpForLevel(level));
      expect(monLevelForXp(monXpForLevel(level))).toBe(level);
    }
  });

  it("stats grow with level and never go below 1", () => {
    const mon = registry.mons.find((m) => !m.secretRare)!;
    const at = (lvl: number) => monStatsAtLevel(mon, lvl);
    expect(at(mon.baseLevel + 10).maxHp).toBeGreaterThan(at(mon.baseLevel).maxHp);
    expect(at(1).offense).toBeGreaterThanOrEqual(1);
  });

  it("grantMonXp levels up and reports newly learned abilities", () => {
    const entry = registry.mons.find((m) => m.race === "Demon" && m.tier === 1)!;
    const owned = createOwnedMon(entry);
    const kit = abilities.raceKits[entry.race];
    const nextUnlock = kit.find((k) => k.unlockLevel > owned.level);
    expect(nextUnlock).toBeDefined();
    const xpNeeded = monXpForLevel(nextUnlock!.unlockLevel) - owned.xp;
    const gain = grantMonXp(owned, entry, abilities, xpNeeded);
    expect(gain.leveledFrom).toBe(owned.level);
    expect(gain.mon.level).toBe(nextUnlock!.unlockLevel);
    expect(gain.learned).toContain(nextUnlock!.abilityId);
  });

  it("material splash ability joins the learnset at level 12", () => {
    const entry = registry.mons.find((m) => !m.secretRare && abilities.materialSplash[m.element])!;
    const splash = abilities.materialSplash[entry.element]!;
    const known = monKnownAbilities(entry, abilities, 12);
    expect(known).toContain(splash);
  });
});

describe("mon negotiation", () => {
  const questions = drawNegotiationQuestions(banks, "Cheerful", "test-seed");

  it("draws deterministic distinct questions incl. a pre-drawn bonus", () => {
    expect(questions).toHaveLength(4);
    expect(new Set(questions.map((q) => q.prompt)).size).toBe(4);
    expect(drawNegotiationQuestions(banks, "Cheerful", "test-seed")).toEqual(questions);
  });

  it("3/3 correct joins", () => {
    let state = createNegotiation(questions);
    for (let i = 0; i < 3; i++) {
      state = answerNegotiation(state, questions[i].correctIndex);
    }
    expect(state.outcome).toBe("joined");
  });

  it("2/3 grants a bonus question; right bonus joins, wrong refuses", () => {
    const play = (bonusRight: boolean) => {
      let state = createNegotiation(questions);
      state = answerNegotiation(state, questions[0].correctIndex);
      state = answerNegotiation(state, questions[1].correctIndex);
      state = answerNegotiation(state, (questions[2].correctIndex + 1) % 4);
      expect(state.bonusGranted).toBe(true);
      expect(state.outcome).toBe("asking");
      const bonus = questions[3];
      return answerNegotiation(state, bonusRight ? bonus.correctIndex : (bonus.correctIndex + 1) % 4);
    };
    expect(play(true).outcome).toBe("joined");
    expect(play(false).outcome).toBe("refused");
  });

  it("bond forgiveness shrugs off one wrong answer", () => {
    // forgiveness 1: two right + one wrong should still reach 3 'correct' -> join
    let state = createNegotiation(questions, 1);
    state = answerNegotiation(state, questions[0].correctIndex);
    state = answerNegotiation(state, questions[1].correctIndex);
    state = answerNegotiation(state, (questions[2].correctIndex + 1) % 4); // wrong, forgiven
    expect(state.forgiven).toBe(1);
    expect(state.outcome).toBe("joined");
  });

  it("negotiationForgiveness needs a bonded same-personality companion", () => {
    expect(negotiationForgiveness("Shy", { personality: "Shy", bond: 25 })).toBe(1);
    expect(negotiationForgiveness("Shy", { personality: "Shy", bond: 5 })).toBe(0);
    expect(negotiationForgiveness("Shy", { personality: "Cool", bond: 99 })).toBe(0);
    expect(negotiationForgiveness("Shy", undefined)).toBe(0);
  });

  it("1/3 refuses outright", () => {
    let state = createNegotiation(questions);
    state = answerNegotiation(state, questions[0].correctIndex);
    state = answerNegotiation(state, (questions[1].correctIndex + 1) % 4);
    state = answerNegotiation(state, (questions[2].correctIndex + 1) % 4);
    expect(state.outcome).toBe("refused");
  });

  it("every personality bank draws cleanly", () => {
    for (const personality of MON_PERSONALITIES) {
      expect(drawNegotiationQuestions(banks, personality, "x").length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("mon fusion", () => {
  const byRace = (race: string, tier?: number) =>
    registry.mons.find((m) => m.race === race && !m.secretRare && (tier === undefined || m.tier === tier))!;

  it("cross-race fusion follows the chart and the SMT level rule", () => {
    const a = byRace("Angel", 2);
    const b = byRace("Demon", 2);
    const expected = fusion.chart["Angel"]!["Demon"]!;
    const preview = resolveFusion(
      { entry: a, owned: createOwnedMon(a) },
      { entry: b, owned: createOwnedMon(b) },
      registry, fusion, abilities, new Set()
    );
    expect(preview.ok).toBe(true);
    expect(preview.result!.race).toBe(expected);
    const avg = Math.floor((a.baseLevel + b.baseLevel) / 2) + 1;
    const result = preview.result!;
    expect(preview.projectedLevel!).toBeGreaterThanOrEqual(Math.min(avg, result.baseLevel));
    expect(result.tier).toBeLessThanOrEqual(Math.max(a.tier, b.tier) + 1);
  });

  it("same-race fusion rerolls within the race", () => {
    const [a, b] = registry.mons.filter((m) => m.race === "Drainer" && !m.secretRare);
    const preview = resolveFusion(
      { entry: a, owned: createOwnedMon(a) },
      { entry: b, owned: createOwnedMon(b) },
      registry, fusion, abilities, new Set()
    );
    expect(preview.ok).toBe(true);
    expect(preview.result!.race).toBe("Drainer");
    expect(preview.result!.id).not.toBe(a.id);
    expect(preview.result!.id).not.toBe(b.id);
  });

  it("secret recipes produce the secret rares", () => {
    for (const recipe of fusion.secretRecipes) {
      const a = byRace(recipe.requires.races[0], 5) ?? byRace(recipe.requires.races[0]);
      const b = byRace(recipe.requires.races[1], 5) ?? byRace(recipe.requires.races[1]);
      if (a.tier < recipe.requires.minTier || b.tier < recipe.requires.minTier) continue;
      const preview = resolveFusion(
        { entry: a, owned: createOwnedMon(a) },
        { entry: b, owned: createOwnedMon(b) },
        registry, fusion, abilities, new Set()
      );
      expect(preview.ok).toBe(true);
      expect(preview.secretResult?.id).toBe(recipe.resultId);
    }
  });

  it("secret parents cannot fuse and execution honors inheritance picks", () => {
    const secret = registry.mons.find((m) => m.secretRare)!;
    const other = byRace("Angel");
    const blocked = resolveFusion(
      { entry: secret, owned: createOwnedMon(secret) },
      { entry: other, owned: createOwnedMon(other) },
      registry, fusion, abilities, new Set()
    );
    expect(blocked.ok).toBe(false);

    const a = byRace("Mystic", 3);
    const b = byRace("Spirit", 2);
    const preview = resolveFusion(
      { entry: a, owned: createOwnedMon(a) },
      { entry: b, owned: createOwnedMon(b) },
      registry, fusion, abilities, new Set()
    );
    expect(preview.ok).toBe(true);
    const picks = preview.inheritable!.slice(0, 2);
    const fused = executeFusion(preview, picks);
    expect(fused!.owned.inherited).toEqual(picks);
    expect(fused!.owned.level).toBe(preview.projectedLevel);
  });

  it("every off-diagonal chart cell points at a race with catchable members", () => {
    for (const a of MON_RACES) {
      for (const b of MON_RACES) {
        if (a === b) continue;
        const result = fusion.chart[a]![b]!;
        expect(registry.mons.some((m) => m.race === result && !m.secretRare)).toBe(true);
      }
    }
  });
});

describe("save v2 migration", () => {
  const v1Blob = {
    schemaVersion: 1,
    flags: { strings: ["act1:complete"], numeric: [] },
    party: {
      wallet: 50,
      partyIds: [0, 1],
      inventory: [{ charId: 0, itemIds: [101] }],
      equipped: [{ charId: 0, slots: {} }]
    },
    player: { mode: "chunked", x: 100, y: 200, facing: "down" }
  };

  it("migrates a v1 blob forward with an empty roster", () => {
    const migrated = validateSaveState(v1Blob);
    expect(migrated).not.toBeNull();
    expect(migrated!.schemaVersion).toBe(SAVE_STATE_SCHEMA_VERSION);
    expect(migrated!.mons).toBeUndefined();
    expect(migrated!.party.partyIds).toEqual([0, 1]);
  });

  it("round-trips a v2 blob with a mon roster", () => {
    const mon = registry.mons.find((m) => !m.secretRare)!;
    const v2 = {
      ...v1Blob,
      schemaVersion: 2,
      mons: {
        roster: [{ registryId: mon.id, level: 7, xp: monXpForLevel(7), bond: 3, inherited: [] }],
        activeIndex: 0
      }
    };
    const validated = validateSaveState(v2);
    expect(validated).not.toBeNull();
    expect(validated!.mons!.roster[0].registryId).toBe(mon.id);
    expect(validated!.mons!.activeIndex).toBe(0);
    const again = validateSaveState(JSON.parse(JSON.stringify(validated)));
    expect(again).toEqual(validated);
  });

  it("rejects malformed rosters and out-of-range activeIndex", () => {
    const bad = (mons: unknown) => validateSaveState({ ...v1Blob, schemaVersion: 2, mons });
    expect(bad({ roster: [{ registryId: "", level: 1, xp: 0, bond: 0, inherited: [] }] })).toBeNull();
    expect(bad({ roster: [], activeIndex: 0 })).toBeNull();
    expect(bad({ roster: "nope" })).toBeNull();
  });

  it("reserved mon party ids never collide with character ids", () => {
    expect(MON_PARTY_ID_BASE).toBeGreaterThan(10000);
    expect(isMonPartyCharId(0)).toBe(false);
    expect(isMonPartyCharId(MON_PARTY_ID_BASE)).toBe(true);
  });
});
