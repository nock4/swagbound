import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterCollection, CharacterData, ItemData, PsiData } from "@eb/schemas";
import {
  createBattleState,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../src/battleLogic";
import {
  applyRoundStartGuardStance,
  encounterAdvantageTurnOrder,
  jitteredTurnOrder,
  MIN_RUN_SUCCESS_CHANCE,
  nextInputState,
  partyInputOrder,
  resolveRoundStartPriority,
  resolveRoundStep,
  runSuccessChance,
  shouldRunEnemyFirstStrikeBeforeInput,
  type BattleRoundInputState,
  type QueuedCommand
} from "../src/battleRound";
import { setTarget } from "../src/rollingMeter";
import { createStatefulRng } from "../src/seededRng";

const opponentA = enemy(1, "OPPONENT_A", { hp: 30, defense: 4, offense: 12, speed: 5 });
const opponentB = enemy(2, "OPPONENT_B", { hp: 24, defense: 2, offense: 9, speed: 5 });
const partyA = character(0, "PARTY_A", { maxHp: 72, maxPp: 18, offense: 21, defense: 8, speed: 5 });
const partyB = character(1, "PARTY_B", { maxHp: 48, maxPp: 10, offense: 16, defense: 6, speed: 5 });
const partyC = character(2, "PARTY_C", { maxHp: 44, maxPp: 0, offense: 14, defense: 5, speed: 5 });

describe("partyInputOrder", () => {
  it("returns living party actors in party-slot order", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyA, partyB, partyC])
    });
    battle = killActor(battle, actor("party", 1));

    expect(partyInputOrder(battle)).toEqual([actor("party", 0), actor("party", 2)]);
  });
});

describe("jitteredTurnOrder", () => {
  it("is deterministic under a fixed seeded rng and includes queued party plus living enemies", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB]),
      enemyOptions: [{ speed: 8 }, { speed: 4 }]
    });
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } },
      { partySlot: 1, command: "DEFEND" }
    ];
    const firstRng = createStatefulRng(0xabc123);
    const secondRng = createStatefulRng(0xabc123);

    const first = jitteredTurnOrder(battle, queued, () => firstRng.next());
    const second = jitteredTurnOrder(battle, queued, () => secondRng.next());

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(first).toEqual(expect.arrayContaining([
      actor("party", 0),
      actor("party", 1),
      actor("enemy", 0),
      actor("enemy", 1)
    ]));
  });

  it("applies speed jitter and the round tiebreak for enemies/later slots", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB]),
      enemyOptions: [{ speed: 5 }, { speed: 5 }]
    });
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "BASH" },
      { partySlot: 1, command: "BASH" }
    ];

    expect(jitteredTurnOrder(battle, queued, sequenceRng([0.5, 0.5, 0.5, 0.5]))).toEqual([
      actor("enemy", 1),
      actor("enemy", 0),
      actor("party", 1),
      actor("party", 0)
    ]);

    expect(jitteredTurnOrder(battle, queued, sequenceRng([0, 1, 0.5, 0.5]))).toEqual([
      actor("party", 1),
      actor("enemy", 1),
      actor("enemy", 0),
      actor("party", 0)
    ]);
  });
});

describe("encounterAdvantageTurnOrder", () => {
  it("makes partyFirstStrike a free party-only round 1 and restores normal order after that", () => {
    const roundOne = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB])
    });
    const roundTwo = { ...roundOne, roundNumber: 2 };
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "BASH" },
      { partySlot: 1, command: "BASH" }
    ];

    const freeRound = encounterAdvantageTurnOrder(roundOne, queued, sequenceRng([0.5, 0.5, 0.5, 0.5]), {
      advantage: "partyFirstStrike"
    });
    const normalRound = encounterAdvantageTurnOrder(roundTwo, queued, sequenceRng([0.5, 0.5, 0.5, 0.5]), {
      advantage: "partyFirstStrike"
    });

    expect(freeRound.every((entry) => entry.side === "party")).toBe(true);
    expect(freeRound).toHaveLength(2);
    expect(normalRound.some((entry) => entry.side === "enemy")).toBe(true);
    expect(normalRound).toHaveLength(4);
  });

  it("models enemyFirstStrike as a pre-input enemy-only round 1", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB])
    });
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "BASH" },
      { partySlot: 1, command: "BASH" }
    ];

    const ambushOrder = encounterAdvantageTurnOrder(battle, queued, sequenceRng([0.5, 0.5, 0.5, 0.5]), {
      advantage: "enemyFirstStrike"
    });

    expect(shouldRunEnemyFirstStrikeBeforeInput(battle, "enemyFirstStrike", false)).toBe(true);
    expect(shouldRunEnemyFirstStrikeBeforeInput(battle, "enemyFirstStrike", true)).toBe(false);
    expect(ambushOrder.every((entry) => entry.side === "enemy")).toBe(true);
    expect(ambushOrder).toHaveLength(2);
  });
});

describe("resolveRoundStep", () => {
  it("dispatches BASH through resolveTurn with the queued enemy target and begins the actor turn", () => {
    let battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      defending: true
    });

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 1 } },
      () => 0.5
    );

    expect(result.skipped).toBe(false);
    expect(result.state.party[0].defending).toBe(false);
    expect(result.resolution).toMatchObject({ defender: actor("enemy", 1), damage: 20 });
    expect(result.details).toMatchObject({
      kind: "attack",
      attackerName: "PARTY_A",
      targetName: "OPPONENT_B",
      damage: 20,
      missed: false
    });
    expect(result.state.enemies[1].hp.target).toBe(4);
  });

  it("retargets a queued single-target attack when a teammate already defeated the chosen enemy", () => {
    const fragileA = enemy(43, "FRAGILE_A", { hp: 5, defense: 0, offense: 4 });
    const sturdyB = enemy(44, "STURDY_B", { hp: 50, defense: 0, offense: 4 });
    const battle = createBattleState([fragileA, sturdyB], {
      characters: characters([
        character(0, "FAST_A", { offense: 30 }),
        character(1, "SLOW_B", { offense: 18 })
      ])
    });
    const originalTarget = queuedTarget(battle, "enemy", 0);

    const first = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: originalTarget },
      () => 0.5
    );
    const second = resolveRoundStep(
      first.state,
      actor("party", 1),
      { partySlot: 1, command: "BASH", target: originalTarget },
      () => 0.5
    );

    expect(first.details).toMatchObject({ targetName: "FRAGILE_A", targetDied: true });
    expect(second.skipped).toBe(false);
    expect(second.resolution).toMatchObject({ defender: actor("enemy", 1) });
    expect(second.details).toMatchObject({
      kind: "attack",
      attackerName: "SLOW_B",
      targetName: "STURDY_B",
      damage: 18
    });
    expect(second.state.enemies[1].hp.target).toBe(32);
  });

  it("fizzles a queued offensive step when no living enemy target remains", () => {
    let battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB])
    });
    const originalTarget = queuedTarget(battle, "enemy", 0);
    battle = killActor(killActor(battle, actor("enemy", 0)), actor("enemy", 1));

    const result = resolveRoundStep(
      battle,
      actor("party", 1),
      { partySlot: 1, command: "BASH", target: originalTarget },
      () => 0.5
    );

    expect(result.skipped).toBe(true);
    expect(result.message).toBe("There was no target.");
    expect(result.details).toMatchObject({
      kind: "skip",
      attackerName: "PARTY_B",
      message: "There was no target.",
      noTarget: true
    });
    expect(result.resolution).toBeUndefined();
    expect(result.state).toBe(battle);
    expect(result.state.enemies.map((combatant) => combatant.hp.target)).toEqual([0, 0]);
  });

  it("prefers queued combatantId over a stale target index", () => {
    let battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA])
    });
    battle = killActor(battle, actor("enemy", 0));
    const compactedBattle = {
      ...battle,
      enemies: [battle.enemies[1], battle.enemies[0]]
    };
    const staleTarget = {
      side: "enemy" as const,
      index: 1,
      combatantId: battle.enemies[1].combatantId
    };

    const result = resolveRoundStep(
      compactedBattle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: staleTarget },
      () => 0.5
    );

    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ defender: actor("enemy", 0) });
    expect(result.details).toMatchObject({ targetName: "OPPONENT_B" });
    expect(result.state.enemies[0].hp.target).toBeLessThan(opponentB.hp);
    expect(result.state.enemies[1].hp.target).toBe(0);
  });

  it("retargets recovery actions away from a dead ally", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyA, partyB])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      inventory: [200],
      hp: { ...battle.party[0].hp, displayed: 20, target: 20, isRolling: false }
    });
    const originalTarget = queuedTarget(battle, "party", 1);
    battle = killActor(battle, actor("party", 1));

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 200, target: originalTarget },
      () => 0.5,
      { items: [syntheticItem(200, 0x02, 30)] }
    );

    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ target: actor("party", 0), amount: 30 });
    expect(result.details).toMatchObject({
      kind: "item",
      targetName: "PARTY_A",
      healed: 30
    });
    expect(result.state.party[0].hp.target).toBe(50);
    expect(result.state.party[1].hp.target).toBe(0);
  });

  it("keeps solo BASH resolution identical with or without combatantId", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyA])
    });

    const legacy = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } },
      () => 0.5
    );
    const identified = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: queuedTarget(battle, "enemy", 0) },
      () => 0.5
    );

    expect(identified.skipped).toBe(legacy.skipped);
    expect(identified.resolution).toMatchObject({ defender: actor("enemy", 0), damage: 19 });
    expect(legacy.resolution).toMatchObject({ defender: actor("enemy", 0), damage: 19 });
    expect(identified.details).toEqual(legacy.details);
    expect(identified.state.enemies[0].hp.target).toBe(legacy.state.enemies[0].hp.target);
  });

  it("threads physical SMAAAASH and Guts survival flags into narration details", () => {
    let smashBattle = createBattleState(enemy(31, "SMASH_TARGET", { hp: 100, defense: 10, speed: 1 }), {
      characters: characters([partyA])
    });
    smashBattle = withCombatant(smashBattle, actor("party", 0), {
      ...smashBattle.party[0],
      offense: 30,
      speed: 20,
      stats: { ...smashBattle.party[0].stats, guts: 500 }
    });

    const smashResult = resolveRoundStep(
      smashBattle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } },
      sequenceRng([1, 0.5])
    );

    expect(smashResult.resolution).toMatchObject({ damage: 80, smash: true });
    expect(smashResult.details).toMatchObject({
      kind: "attack",
      damage: 80,
      missed: false,
      smash: true,
      gutsSurvived: false
    });

    let gutsBattle = createBattleState(enemy(32, "LETHAL_ENEMY", {
      offense: 50,
      actions: actionSet(enemyAction(320, 1, 1))
    }), {
      characters: characters([partyA])
    });
    gutsBattle = withCombatant(gutsBattle, actor("party", 0), {
      ...gutsBattle.party[0],
      defense: 0,
      hp: setTarget({ ...gutsBattle.party[0].hp, displayed: 10, target: 10, isRolling: false }, 10),
      stats: { ...gutsBattle.party[0].stats, guts: 500 }
    });

    const gutsResult = resolveRoundStep(gutsBattle, actor("enemy", 0), undefined, sequenceRng([1, 1, 0.5, 0]));

    expect(gutsResult.resolution).toMatchObject({ amount: 9, gutsSurvived: true });
    expect(gutsResult.details).toMatchObject({
      kind: "attack",
      damage: 9,
      missed: false,
      smash: false,
      gutsSurvived: true
    });
    expect(gutsResult.state.party[0].hp.target).toBe(1);
  });

  it("dispatches SPY without mutating HP and returns the resolver message", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([character(2, "JEFF_TEST")])
    });

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "SPY", target: { side: "enemy", index: 0 } },
      () => 0.5
    );

    expect(result.skipped).toBe(false);
    expect(result.message).toBe("OPPONENT_A HP 30/30 Off 12 Def 4.");
    expect(result.details).toMatchObject({
      kind: "spy",
      attackerName: "JEFF_TEST",
      targetName: "OPPONENT_A",
      message: "OPPONENT_A HP 30/30 Off 12 Def 4."
    });
    expect(result.state).toBe(battle);
  });

  it("dispatches PSI with resolver target routing through the queued target index", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyA])
    });
    const psi = syntheticPsi(100, "offense", "beta", [{ charId: 0, level: 1 }]);

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "PSI", psiId: 100, target: { side: "enemy", index: 0 } },
      () => 0.5,
      { psi: [psi] }
    );

    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ target: actor("enemy", 0), amount: 42 });
    expect(result.details).toMatchObject({
      kind: "psi",
      attackerName: "PARTY_A",
      targetName: "OPPONENT_A",
      moveName: "PSI_100",
      psiId: 100,
      damage: 42,
      missed: false
    });
    expect(result.state.party[0].pp).toBe(10);
    expect(result.state.enemies[0].hp.target).toBe(0);
    expect(result.state.enemies[0].hp.displayed).toBe(0);
    expect(result.details).toMatchObject({ targetDied: true });
  });

  it("dispatches GOODS through resolveItemTurn with a party target", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyA, partyB])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      inventory: [200]
    });
    battle = withCombatant(battle, actor("party", 1), {
      ...battle.party[1],
      hp: { ...battle.party[1].hp, displayed: 20, target: 20, isRolling: false }
    });

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 200, target: { side: "party", index: 1 } },
      () => 0.5,
      { items: [syntheticItem(200, 0x02, 30)] }
    );

    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ target: actor("party", 1), amount: 28 });
    expect(result.details).toMatchObject({
      kind: "item",
      attackerName: "PARTY_A",
      targetName: "PARTY_B",
      itemName: "ITEM_200",
      healed: 28,
      missed: false
    });
    expect(result.state.party[0].inventory).toEqual([]);
    expect(result.state.party[1].hp.target).toBe(48);
  });

  it("dispatches DEFEND, PRAY, MIRROR, RUN, enemy steps, and dead skips", () => {
    const defendBattle = createBattleState(opponentA, { characters: characters([partyA]) });
    const guarding = applyRoundStartGuardStance(defendBattle, [{ partySlot: 0, command: "DEFEND" }]);
    const defend = resolveRoundStep(guarding, actor("party", 0), { partySlot: 0, command: "DEFEND" }, () => 0.5);
    expect(defend.skipped).toBe(false);
    expect(defend.message).toBe("PARTY_A took a defensive stance.");
    expect(defend.details).toMatchObject({
      kind: "defend",
      attackerName: "PARTY_A",
      defended: true,
      message: "PARTY_A took a defensive stance."
    });
    expect(defend.state.party[0].defending).toBe(true);

    const prayBattle = createBattleState(opponentA, { characters: characters([partyA, partyB]) });
    const pray = resolveRoundStep(prayBattle, actor("party", 1), { partySlot: 1, command: "PRAY" }, () => 0.95);
    expect(pray.skipped).toBe(false);
    expect(pray.message).toBe("PARTY_B prayed. Nothing happened.");
    expect(pray.details).toMatchObject({
      kind: "pray",
      attackerName: "PARTY_B",
      message: "PARTY_B prayed. Nothing happened.",
      missed: true
    });

    const mirrorBattle = createBattleState(enemy(20, "MIRROR_TARGET", { hp: 30, offense: 20, defense: 4 }), {
      characters: characters([character(3, "POO_TEST", { offense: 5 })])
    });
    const mirror = resolveRoundStep(
      mirrorBattle,
      actor("party", 0),
      { partySlot: 0, command: "MIRROR", target: { side: "enemy", index: 0 } },
      () => 0.5
    );
    expect(mirror.skipped).toBe(false);
    expect(mirror.message).toBe("POO_TEST mirrored MIRROR_TARGET for 18 damage.");
    expect(mirror.details).toMatchObject({
      kind: "mirror",
      attackerName: "POO_TEST",
      targetName: "MIRROR_TARGET",
      damage: 18
    });

    let runBattle = createBattleState(opponentA, { characters: characters([partyA]) });
    runBattle = withCombatant(runBattle, actor("party", 0), { ...runBattle.party[0], defending: true });
    const run = resolveRoundStep(runBattle, actor("party", 0), { partySlot: 0, command: "RUN" }, () => 0.5);
    expect(run.fled).toBeUndefined();
    expect(run.skipped).toBe(true);
    expect(run.message).toBe("Run is resolved at round start.");
    expect(run.state.party[0].defending).toBe(false);
    expect(run.state.enemies[0].hp.target).toBe(30);

    const enemyBattle = createBattleState(enemy(30, "ENEMY_STEP", {
      offense: 18,
      actions: actionSet(enemyAction(300, 1, 1))
    }), {
      characters: characters([partyA])
    });
    const enemyResult = resolveRoundStep(enemyBattle, actor("enemy", 0), undefined, () => 0.5);
    expect(enemyResult.skipped).toBe(false);
    expect(enemyResult.resolution).toMatchObject({ targets: [actor("party", 0)], amount: 14 });
    expect(enemyResult.details).toMatchObject({
      kind: "attack",
      attackerName: "ENEMY_STEP",
      targetName: "PARTY_A",
      damage: 14
    });
    expect(enemyResult.state.enemies[0].nextActionIndex).toBe(1);

    const deadBattle = killActor(createBattleState(opponentA, { characters: characters([partyA]) }), actor("party", 0));
    const dead = resolveRoundStep(deadBattle, actor("party", 0), { partySlot: 0, command: "BASH" }, () => 0.5);
    expect(dead.skipped).toBe(true);
    expect(dead.details).toMatchObject({ kind: "skip", attackerName: "PARTY_A" });
    expect(dead.state).toBe(deadBattle);
  });
});

describe("round-start priority layer", () => {
  it("sets Guard before speed order so a slow guarder is protected from a faster enemy", () => {
    const battle = createBattleState(enemy(40, "FAST_ENEMY", {
      offense: 20,
      actions: actionSet(enemyAction(400, 1, 1))
    }), {
      characters: characters([character(0, "SLOW_GUARD", { speed: 1, defense: 8 })]),
      enemyOptions: [{ speed: 30 }]
    });
    const queued: QueuedCommand[] = [{ partySlot: 0, command: "DEFEND" }];

    const priority = resolveRoundStartPriority(battle, queued, () => 0.5);
    const order = jitteredTurnOrder(priority.state, priority.queued, sequenceRng([0.5, 0.5]));
    const enemyResult = resolveRoundStep(priority.state, actor("enemy", 0), undefined, () => 0.5);
    const defendResult = resolveRoundStep(enemyResult.state, actor("party", 0), queued[0], () => 0.5);

    expect(priority.state.party[0].defending).toBe(true);
    expect(order[0]).toEqual(actor("enemy", 0));
    expect(enemyResult.resolution).toMatchObject({ amount: 8 });
    expect(enemyResult.state.party[0].hp.target).toBe(32);
    expect(defendResult.message).toBe("SLOW_GUARD took a defensive stance.");
    expect(defendResult.state.party[0].defending).toBe(true);
  });

  it("resolves failed Run once at round start, forfeits party actions, and leaves enemies acting", () => {
    const battle = createBattleState(enemy(41, "NO_ESCAPE_ENEMY", {
      offense: 10,
      speed: 40,
      actions: actionSet(enemyAction(410, 1, 1))
    }), {
      characters: characters([partyA, partyB])
    });
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "RUN" },
      { partySlot: 1, command: "BASH", target: { side: "enemy", index: 0 } }
    ];

    const priority = resolveRoundStartPriority(battle, queued, () => 0.9);
    const order = jitteredTurnOrder(priority.state, priority.queued, () => 0.5);
    const enemyResult = resolveRoundStep(priority.state, order[0], undefined, () => 0.5);

    expect(priority.runAttempt).toMatchObject({
      attempted: true,
      actor: actor("party", 0),
      blocked: false,
      success: false
    });
    expect(priority.runAttempt?.chance).toBe(MIN_RUN_SUCCESS_CHANCE);
    expect(priority.priorityStep?.message).toBe("PARTY_A couldn't escape!");
    expect(priority.priorityStep?.fled).toBe(false);
    expect(priority.queued).toEqual([]);
    expect(order).toEqual([actor("enemy", 0)]);
    expect(enemyResult.skipped).toBe(false);
    expect(enemyResult.state.party[0].hp.target).toBeLessThan(battle.party[0].hp.target);
    expect(enemyResult.resolution && "outcome" in enemyResult.resolution ? enemyResult.resolution.outcome : "ongoing").toBe("ongoing");
  });

  it("resolves successful Run at round start as a flee priority step", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([character(0, "FAST_RUNNER", { speed: 90 })]),
      roundNumber: 2
    });

    const priority = resolveRoundStartPriority(
      battle,
      [{ partySlot: 0, command: "RUN" }],
      () => 0.1
    );

    expect(priority.runAttempt).toMatchObject({
      attempted: true,
      actor: actor("party", 0),
      blocked: false,
      success: true
    });
    expect(priority.priorityStep?.fled).toBe(true);
    expect(priority.priorityStep?.details).toMatchObject({
      kind: "run",
      attackerName: "FAST_RUNNER",
      fled: true
    });
    expect(priority.queued).toEqual([]);
  });

  it("always blocks Run against unescapable battle group 450", () => {
    const battle = createBattleState(opponentA, { characters: characters([partyA]), roundNumber: 5 });
    const priority = resolveRoundStartPriority(
      battle,
      [{ partySlot: 0, command: "RUN" }],
      () => 0,
      { groupId: 450, rules: { unescapableGroups: [450] } }
    );

    expect(runSuccessChance(battle)).toBeGreaterThan(0);
    expect(priority.runAttempt).toMatchObject({
      attempted: true,
      actor: actor("party", 0),
      groupId: 450,
      blocked: true,
      chance: 0,
      roll: null,
      success: false
    });
    expect(priority.priorityStep?.message).toBe("PARTY_A couldn't escape!");
    expect(priority.queued).toEqual([]);
  });

  it("latches a mortally hit enemy dead immediately so it cannot act later that round", () => {
    const battle = createBattleState(enemy(42, "FRAGILE_ENEMY", {
      hp: 5,
      speed: 1,
      actions: actionSet(enemyAction(420, 1, 1))
    }), {
      characters: characters([character(0, "FAST_PARTY", { offense: 24, speed: 40 })])
    });
    const queued: QueuedCommand[] = [
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } }
    ];
    const priority = resolveRoundStartPriority(battle, queued, () => 0.5);
    const order = jitteredTurnOrder(priority.state, priority.queued, sequenceRng([0.5, 0.5]));

    const partyResult = resolveRoundStep(priority.state, order[0], queued[0], () => 0.5);
    const enemyResult = resolveRoundStep(partyResult.state, actor("enemy", 0), undefined, () => 0.5);

    expect(order).toEqual([actor("party", 0), actor("enemy", 0)]);
    expect(partyResult.details).toMatchObject({ targetDied: true });
    expect(partyResult.state.enemies[0].hp).toMatchObject({ displayed: 0, target: 0, isRolling: false });
    expect(enemyResult.skipped).toBe(true);
    expect(enemyResult.state).toBe(partyResult.state);
  });

  it("preserves party mortal-survival: a target-zero member still acts while displayed HP is positive", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyA])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      hp: setTarget(battle.party[0].hp, 0)
    });

    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } },
      () => 0.5
    );

    expect(battle.party[0].hp.displayed).toBeGreaterThan(0);
    expect(battle.party[0].hp.target).toBe(0);
    expect(result.skipped).toBe(false);
    expect(result.state.enemies[0].hp.target).toBeLessThan(opponentA.hp);
  });
});

describe("nextInputState", () => {
  it("routes offensive PSI to enemy targeting and recovery PSI to ally targeting", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB])
    });
    const offense = syntheticPsi(100, "offense", "alpha", [{ charId: 0, level: 1 }]);
    const recovery = syntheticPsi(101, "recovery", "alpha", [{ charId: 0, level: 1 }]);
    const context = { state: battle, psi: [offense, recovery] };

    const command = nextInputState(inputState({ selectionIndex: 3 }), { kind: "confirm" }, context);
    expect(command.input.submenu).toBe("psi");

    const offenseTarget = nextInputState(command.input, { kind: "confirm" }, context);
    expect(offenseTarget.input).toMatchObject({
      submenu: "target-enemy",
      selectionIndex: 0,
      pending: { command: "PSI", psiId: 100 }
    });

    const recoveryTarget = nextInputState(
      { ...command.input, selectionIndex: 1 },
      { kind: "confirm" },
      context
    );
    expect(recoveryTarget.input).toMatchObject({
      submenu: "target-ally",
      selectionIndex: 0,
      pending: { command: "PSI", psiId: 101 }
    });
  });

  it("routes a damage GOODS item to enemy targeting and a healing one to ally targeting", () => {
    let battle = createBattleState([opponentA, opponentB], { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [212, 220] });
    const bomb: ItemData = { ...syntheticItem(212, 0, 0), effect: { kind: "damage", amount: 12 } };
    const heal: ItemData = syntheticItem(220, 0x02, 30);
    const context = { state: battle, items: [bomb, heal] };

    const offensive = nextInputState(inputState({ submenu: "goods", selectionIndex: 0 }), { kind: "confirm" }, context);
    expect(offensive.input).toMatchObject({ submenu: "target-enemy", pending: { command: "GOODS", itemId: 212 } });

    const healing = nextInputState(inputState({ submenu: "goods", selectionIndex: 1 }), { kind: "confirm" }, context);
    expect(healing.input).toMatchObject({ submenu: "target-ally", pending: { command: "GOODS", itemId: 220 } });
  });

  it("routes an effect PSI to the target submenu the effect dictates", () => {
    const battle = createBattleState([opponentA, opponentB], { characters: characters([partyA]) });
    const inflictPsi: PsiData = { ...syntheticPsi(100, "assist", "alpha", [{ charId: 0, level: 1 }]), effect: { kind: "inflictStatus", ailment: "paralyzed" } };
    const shieldPsi: PsiData = { ...syntheticPsi(101, "assist", "alpha", [{ charId: 0, level: 1 }]), effect: { kind: "inflictStatus", ailment: "shielded", magnitude: 50 } };
    const context = { state: battle, psi: [inflictPsi, shieldPsi] };
    const inflict = nextInputState(inputState({ submenu: "psi", selectionIndex: 0 }), { kind: "confirm" }, context);
    expect(inflict.input).toMatchObject({ submenu: "target-enemy", pending: { command: "PSI", psiId: 100 } });
    const shield = nextInputState(inputState({ submenu: "psi", selectionIndex: 1 }), { kind: "confirm" }, context);
    expect(shield.input).toMatchObject({ submenu: "target-ally", pending: { command: "PSI", psiId: 101 } });
  });

  it("uses enemy target gating for BASH, confirms selected targets, and cancels back to command", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA])
    });
    const opened = nextInputState(inputState(), { kind: "confirm" }, { state: battle });
    expect(opened.input).toMatchObject({
      submenu: "target-enemy",
      selectionIndex: 0,
      pending: { command: "BASH" }
    });

    const moved = nextInputState(opened.input, { kind: "move", delta: 1 }, { state: battle });
    expect(moved.input.selectionIndex).toBe(1);

    const confirmed = nextInputState(moved.input, { kind: "confirm" }, { state: battle });
    expect(confirmed.complete).toBe(true);
    expect(confirmed.input.queue).toEqual([
      { partySlot: 0, command: "BASH", target: queuedTarget(battle, "enemy", 1) }
    ]);

    const cancelled = nextInputState(opened.input, { kind: "cancel" }, { state: battle });
    expect(cancelled.input).toMatchObject({
      submenu: "command",
      selectionIndex: 0,
      queue: []
    });
  });

  it("pops the previous member command when canceling at the next member command top", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyA, partyB])
    });
    const queuedFirst = nextInputState(inputState({ selectionIndex: 4 }), { kind: "confirm" }, { state: battle });
    expect(queuedFirst.complete).toBe(false);
    expect(queuedFirst.input).toMatchObject({
      memberCursor: 1,
      queue: [{ partySlot: 0, command: "DEFEND" }]
    });

    const back = nextInputState(queuedFirst.input, { kind: "cancel" }, { state: battle });
    expect(back.input).toMatchObject({
      memberCursor: 0,
      submenu: "command",
      selectionIndex: 4,
      queue: []
    });
  });

  it("auto queues default BASH for the current and all remaining members", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyA, partyB, partyC])
    });
    const transition = nextInputState(
      inputState({
        memberCursor: 1,
        queue: [{ partySlot: 0, command: "DEFEND" }]
      }),
      { kind: "auto" },
      { state: battle }
    );

    expect(transition.complete).toBe(true);
    expect(transition.input.queue).toEqual([
      { partySlot: 0, command: "DEFEND" },
      { partySlot: 1, command: "BASH", target: queuedTarget(battle, "enemy", 0) },
      { partySlot: 2, command: "BASH", target: queuedTarget(battle, "enemy", 0) }
    ]);
  });
});

function inputState(overrides: Partial<BattleRoundInputState> = {}): BattleRoundInputState {
  return {
    memberCursor: 0,
    submenu: "command",
    selectionIndex: 0,
    queue: [],
    ...overrides
  };
}

describe("resolveRoundStep status effects", () => {
  function withStatus(
    battle: BattleState,
    slot: number,
    status: { ailment: "poisoned" | "paralyzed" | "asleep" | "confused" | "shielded"; remaining?: number; magnitude?: number }
  ): BattleState {
    return withCombatant(battle, actor("party", slot), { ...battle.party[slot], statuses: [status] });
  }
  const bash = (): QueuedCommand => ({ partySlot: 0, command: "BASH", target: { side: "enemy", index: 0 } });

  it("skips a paralyzed combatant's turn and leaves the enemy unharmed", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withStatus(battle, 0, { ailment: "paralyzed" });
    const enemyHp = battle.enemies[0].hp.target;
    const result = resolveRoundStep(battle, actor("party", 0), bash(), () => 0.5);
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("can't move");
    expect(result.state.enemies[0].hp.target).toBe(enemyHp);
  });

  it("skips an asleep combatant's turn (wakes or stays asleep, either way no action)", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withStatus(battle, 0, { ailment: "asleep" });
    const result = resolveRoundStep(battle, actor("party", 0), bash(), sequenceRng([0.9]));
    expect(result.skipped).toBe(true);
  });

  it("ticks poison HP loss at the end of the acting combatant's turn", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withStatus(battle, 0, { ailment: "poisoned" });
    const before = battle.party[0].hp.target;
    const result = resolveRoundStep(battle, actor("party", 0), bash(), () => 0.5);
    expect(result.state.party[0].hp.target).toBe(before - Math.floor(battle.party[0].maxHp / 16));
    expect(result.message).toContain("poison");
  });

  it("cures a status with a cureStatus GOODS item", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withStatus(battle, 0, { ailment: "poisoned" });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [210] });
    const cureItem: ItemData = { ...syntheticItem(210, 0, 0), effect: { kind: "cureStatus", ailment: "poisoned" } };
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 210, target: { side: "party", index: 0 } },
      () => 0.5,
      { items: [cureItem] }
    );
    expect(result.skipped).toBe(false);
    expect(result.state.party[0].statuses ?? []).toEqual([]);
    expect(result.details).toMatchObject({ kind: "item", message: expect.stringContaining("no longer poisoned") });
  });

  it("inflicts shielded with an inflictStatus GOODS item", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [211] });
    const shieldItem: ItemData = { ...syntheticItem(211, 0, 0), effect: { kind: "inflictStatus", ailment: "shielded", magnitude: 50 } };
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 211, target: { side: "party", index: 0 } },
      () => 0.5,
      { items: [shieldItem] }
    );
    expect(result.state.party[0].statuses).toEqual([{ ailment: "shielded", magnitude: 50 }]);
    expect(result.details).toMatchObject({ kind: "item", message: expect.stringContaining("shielded") });
  });

  it("reduces incoming attack damage for a shielded combatant (same roll, half the HP loss)", () => {
    const makeBattle = (): BattleState => {
      let b = createBattleState(
        enemy(32, "ATTACKER", { offense: 50, actions: actionSet(enemyAction(320, 1, 1)) }),
        { characters: characters([partyA]) }
      );
      b = withCombatant(b, actor("party", 0), {
        ...b.party[0],
        defense: 0,
        hp: setTarget({ ...b.party[0].hp, displayed: 60, target: 60, isRolling: false }, 60)
      });
      return b;
    };
    const plainBattle = makeBattle();
    const plain = resolveRoundStep(plainBattle, actor("enemy", 0), undefined, sequenceRng([1, 1, 0.5, 0]));
    const plainLoss = plainBattle.party[0].hp.target - plain.state.party[0].hp.target;

    const shieldedBattle = withStatus(makeBattle(), 0, { ailment: "shielded", magnitude: 50 });
    const guarded = resolveRoundStep(shieldedBattle, actor("enemy", 0), undefined, sequenceRng([1, 1, 0.5, 0]));
    const guardedLoss = shieldedBattle.party[0].hp.target - guarded.state.party[0].hp.target;

    expect(plainLoss).toBeGreaterThan(0);
    expect(guardedLoss).toBe(Math.floor(plainLoss / 2));
    // The narrated number matches the post-shield HP actually lost (not the pre-shield roll).
    expect(guarded.details).toMatchObject({ damage: guardedLoss });
    expect(plain.details).toMatchObject({ damage: plainLoss });
  });

  it("routes a damage GOODS item to the enemy and deals its damage", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [212] });
    const bombItem: ItemData = { ...syntheticItem(212, 0, 0), effect: { kind: "damage", amount: 12 } };
    const enemyHp = battle.enemies[0].hp.target;
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 212 },
      () => 0.5,
      { items: [bombItem] }
    );
    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ target: actor("enemy", 0), amount: 12 });
    expect(result.state.enemies[0].hp.target).toBe(enemyHp - 12);
    expect(result.details).toMatchObject({ kind: "item", damage: 12 });
  });

  it("routes an offensive inflictStatus GOODS item to the enemy and afflicts it", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [213] });
    const poisonItem: ItemData = { ...syntheticItem(213, 0, 0), effect: { kind: "inflictStatus", ailment: "poisoned" } };
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 213 },
      () => 0.5,
      { items: [poisonItem] }
    );
    expect(result.skipped).toBe(false);
    expect(result.resolution).toMatchObject({ target: actor("enemy", 0) });
    expect(result.state.enemies[0].statuses).toEqual([{ ailment: "poisoned" }]);
    expect(result.details).toMatchObject({ kind: "item", message: expect.stringContaining("now poisoned") });
  });

  it("a confused attacker's BASH strikes a random side (self or enemy)", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withStatus(battle, 0, { ailment: "confused" });
    // First roll picks the confused target (low -> party/self, high -> enemy), then the
    // physical-attack rolls follow.
    const hitSelf = resolveRoundStep(battle, actor("party", 0), bash(), sequenceRng([0, 1, 1, 0.5, 0]));
    expect(hitSelf.resolution).toMatchObject({ defender: actor("party", 0) });
    const hitEnemy = resolveRoundStep(battle, actor("party", 0), bash(), sequenceRng([0.99, 1, 1, 0.5, 0]));
    expect(hitEnemy.resolution).toMatchObject({ defender: actor("enemy", 0) });
  });

  it("a confused enemy strikes a random side (its own kind is possible)", () => {
    let battle = createBattleState(
      enemy(32, "ATTACKER", { offense: 50, actions: actionSet(enemyAction(320, 1, 1)) }),
      { characters: characters([partyA]) }
    );
    battle = withCombatant(battle, actor("enemy", 0), { ...battle.enemies[0], statuses: [{ ailment: "confused" }] });
    const selfHit = resolveRoundStep(battle, actor("enemy", 0), undefined, sequenceRng([0.99, 1, 1, 0.5, 0]));
    expect(selfHit.resolution).toMatchObject({ targets: [actor("enemy", 0)] });
    const partyHit = resolveRoundStep(battle, actor("enemy", 0), undefined, sequenceRng([0, 1, 1, 0.5, 0]));
    expect(partyHit.resolution).toMatchObject({ targets: [actor("party", 0)] });
  });

  it("raises a battle stat with a buffStat GOODS item", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [214] });
    const sprayItem: ItemData = { ...syntheticItem(214, 0, 0), effect: { kind: "buffStat", stat: "defense", amount: 10 } };
    const beforeDef = battle.party[0].defense;
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 214, target: { side: "party", index: 0 } },
      () => 0.5,
      { items: [sprayItem] }
    );
    expect(result.skipped).toBe(false);
    expect(result.state.party[0].defense).toBe(beforeDef + 10);
    expect(result.details).toMatchObject({ kind: "item", message: expect.stringContaining("defense went up") });
  });

  it("revives a fainted ally with a revive GOODS item", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA, partyB]) });
    battle = withCombatant(battle, actor("party", 1), {
      ...battle.party[1],
      hp: setTarget({ ...battle.party[1].hp, displayed: 0, target: 0, isRolling: false }, 0)
    });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], inventory: [215] });
    const reviveItem: ItemData = { ...syntheticItem(215, 0, 0), effect: { kind: "revive", amount: 30 } };
    expect(battle.party[1].hp.target).toBe(0);
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "GOODS", itemId: 215, target: { side: "party", index: 1 } },
      () => 0.5,
      { items: [reviveItem] }
    );
    expect(result.skipped).toBe(false);
    expect(result.state.party[1].hp.target).toBe(30);
    expect(result.details).toMatchObject({ kind: "item", message: expect.stringContaining("came back to life") });
  });
});

describe("resolveRoundStep PSI effects", () => {
  const psiWith = (id: number, effect: PsiData["effect"]): PsiData => ({
    ...syntheticPsi(id, "assist", "alpha", [{ charId: 0, level: 1 }]),
    effect
  });
  const ready = (battle: BattleState): BattleState =>
    withCombatant(battle, actor("party", 0), { ...battle.party[0], pp: 90, maxPp: 90 });

  it("inflicts a status on the enemy via an assist PSI", () => {
    const battle = ready(createBattleState(opponentA, { characters: characters([partyA]) }));
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "PSI", psiId: 100, target: { side: "enemy", index: 0 } },
      () => 0.5,
      { psi: [psiWith(100, { kind: "inflictStatus", ailment: "paralyzed", remaining: 3 })] }
    );
    expect(result.skipped).toBe(false);
    expect(result.state.enemies[0].statuses).toEqual([{ ailment: "paralyzed", remaining: 3 }]);
    expect(result.details).toMatchObject({ kind: "psi", message: expect.stringContaining("paralyzed") });
  });

  it("shields the caster via an assist PSI (party side)", () => {
    const battle = ready(createBattleState(opponentA, { characters: characters([partyA]) }));
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "PSI", psiId: 101, target: { side: "party", index: 0 } },
      () => 0.5,
      { psi: [psiWith(101, { kind: "inflictStatus", ailment: "shielded", magnitude: 50, remaining: 3 })] }
    );
    // Applied to the caster, then decremented by the caster's own end-of-turn tick (3 -> 2).
    expect(result.state.party[0].statuses).toEqual([{ ailment: "shielded", magnitude: 50, remaining: 2 }]);
    expect(result.details).toMatchObject({ kind: "psi", message: expect.stringContaining("shielded") });
  });

  it("drains enemy PP via a drainPp PSI", () => {
    let battle = createBattleState(opponentA, { characters: characters([partyA]) });
    battle = withCombatant(battle, actor("party", 0), { ...battle.party[0], pp: 30, maxPp: 90 });
    battle = withCombatant(battle, actor("enemy", 0), { ...battle.enemies[0], pp: 20 });
    const result = resolveRoundStep(
      battle,
      actor("party", 0),
      { partySlot: 0, command: "PSI", psiId: 102, target: { side: "enemy", index: 0 } },
      () => 0.5,
      { psi: [psiWith(102, { kind: "drainPp", amount: 5 })] }
    );
    expect(result.skipped).toBe(false);
    expect(result.state.enemies[0].pp).toBe(15);
    expect(result.details).toMatchObject({ kind: "psi", message: expect.stringContaining("PP") });
  });
});

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0.5;
}

function killActor(battle: BattleState, target: BattleActor): BattleState {
  const combatant = target.side === "party" ? battle.party[target.index] : battle.enemies[target.index];
  return withCombatant(battle, target, {
    ...combatant,
    hp: setTarget({ ...combatant.hp, displayed: 0, target: 0, isRolling: false }, 0)
  });
}

function actor(side: "party" | "enemy", index: number): BattleActor {
  return { side, index };
}

function queuedTarget(battle: BattleState, side: "party" | "enemy", index: number): NonNullable<QueuedCommand["target"]> {
  const combatant = side === "party" ? battle.party[index] : battle.enemies[index];
  return {
    side,
    index,
    combatantId: combatant.combatantId
  };
}

function enemy(
  id: number,
  name: string,
  stats: Partial<Pick<BattleEnemy, "hp" | "defense" | "offense" | "speed" | "level" | "bossFlag" | "actions">> = {}
): BattleEnemy {
  return {
    id,
    name,
    spriteId: id,
    level: stats.level ?? 3,
    hp: stats.hp ?? 24,
    defense: stats.defense ?? 4,
    offense: stats.offense ?? 8,
    speed: stats.speed ?? stats.level ?? 3,
    experience: 0,
    money: 0,
    bossFlag: stats.bossFlag ?? false,
    actions: stats.actions ?? actionSet(),
    itemDropped: null,
    itemRarity: null
  };
}

function enemyAction(id: number, actionType: number, target: number): BattleEnemy["actions"][number] {
  return { id, arg: 0, actionId: id, actionType, target };
}

function actionSet(...actions: BattleEnemy["actions"][number][]): BattleEnemy["actions"] {
  return [0, 1, 2, 3].map((index) => actions[index] ?? enemyAction(0, 0, 0)) as BattleEnemy["actions"];
}

function character(
  id: number,
  name: string,
  stats: Partial<Pick<CharacterData, "maxHp" | "maxPp" | "offense" | "defense" | "speed">> = {}
): CharacterData {
  return {
    id,
    name,
    level: 6,
    maxHp: stats.maxHp ?? 40,
    maxPp: stats.maxPp ?? 0,
    offense: stats.offense ?? 12,
    defense: stats.defense ?? 6,
    speed: stats.speed ?? 5,
    guts: 5,
    vitality: 6,
    iq: 4,
    luck: 3,
    startingItems: [],
    money: 9
  };
}

function characters(characterList: CharacterData[]): CharacterCollection {
  return {
    schemaVersion: "test",
    sourceProjectPath: "test",
    derivation: {
      source: "test",
      baseStats: "test",
      statFormula: "test",
      hpPpFormula: "test",
      uncertainty: "test"
    },
    characters: characterList,
    counts: {
      characters: characterList.length,
      statFieldsPopulated: characterList.length * 7
    },
    warnings: []
  };
}

function syntheticPsi(
  id: number,
  type: string,
  strength: string,
  learnedBy: PsiData["learnedBy"]
): PsiData {
  return {
    id,
    name: `PSI_${id}`,
    type,
    strength,
    usableOutsideBattle: type === "recovery",
    learnedBy
  };
}

function syntheticItem(id: number, action: number, argument: number): ItemData {
  return {
    id,
    name: `ITEM_${id}`,
    type: 0,
    cost: 0,
    action,
    argument,
    equippable: false,
    miscFlags: ["item disappears when used"]
  };
}
