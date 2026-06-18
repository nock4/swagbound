import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterCollection, CharacterData, ItemData, PsiData } from "@eb/schemas";
import {
  createBattleState,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../src/battleLogic";
import {
  jitteredTurnOrder,
  nextInputState,
  partyInputOrder,
  resolveRoundStep,
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
      damage: 42,
      missed: false
    });
    expect(result.state.party[0].pp).toBe(10);
    expect(result.state.enemies[0].hp.target).toBe(0);
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
    const defend = resolveRoundStep(defendBattle, actor("party", 0), { partySlot: 0, command: "DEFEND" }, () => 0.5);
    expect(defend.skipped).toBe(false);
    expect(defend.details).toMatchObject({ kind: "defend", attackerName: "PARTY_A", defended: true });
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
    expect(run.fled).toBe(true);
    expect(run.details).toMatchObject({ kind: "run", attackerName: "PARTY_A", fled: true });
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
      { partySlot: 0, command: "BASH", target: { side: "enemy", index: 1 } }
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
      { partySlot: 1, command: "BASH", target: { side: "enemy", index: 0 } },
      { partySlot: 2, command: "BASH", target: { side: "enemy", index: 0 } }
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
