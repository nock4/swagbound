import { describe, expect, it } from "vitest";
import type { BattleEnemy, CharacterCollection, CharacterData, ItemData, PsiData } from "@eb/schemas";
import {
  BATTLE_COMMANDS,
  beginCombatantTurn,
  buildEnemyCombatant,
  buildPlayerCombatant,
  commandsForCharId,
  createBattleState,
  damage,
  defaultTargetIndexForActor,
  learnedPsiForCombatant,
  outcome,
  PLAYER_DEFAULTS,
  psiPpCost,
  resolveDefaultBashTurn,
  resolveDefendTurn,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolveMirrorTurn,
  resolvePsiTurn,
  resolvePrayTurn,
  resolveSpyTurn,
  resolveTurn,
  selectEnemyAction,
  shouldResetAutoFightRound,
  tickBattleMeters,
  turnOrder,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../src/battleLogic";
import { setTarget } from "../src/rollingMeter";

const opponentA: BattleEnemy = enemy(1, "OPPONENT_A", { hp: 24, defense: 4, offense: 8, level: 3 });
const opponentB: BattleEnemy = enemy(2, "OPPONENT_B", { hp: 30, defense: 4, offense: 8, level: 5 });
const opponentC: BattleEnemy = enemy(3, "OPPONENT_C", { hp: 18, defense: 2, offense: 7, level: 2 });

const partyCharacterA: CharacterData = character(0, "PARTY_A", { speed: 7, maxHp: 72, maxPp: 18, offense: 21, defense: 8 });
const partyCharacterB: CharacterData = character(1, "PARTY_B", { speed: 4, maxHp: 48, maxPp: 10, offense: 16, defense: 6 });

describe("battle command menu", () => {
  it("keeps the Ness/default EarthBound battle command order", () => {
    expect([...BATTLE_COMMANDS]).toEqual(["BASH", "GOODS", "AUTO", "PSI", "DEFEND", "RUN"]);
  });

  it("returns exact EarthBound command sets by party character id", () => {
    expect(commandsForCharId(0)).toEqual(["BASH", "GOODS", "AUTO", "PSI", "DEFEND", "RUN"]);
    expect(commandsForCharId(1)).toEqual(["BASH", "GOODS", "AUTO", "PSI", "PRAY", "DEFEND", "RUN"]);
    expect(commandsForCharId(2)).toEqual(["BASH", "GOODS", "AUTO", "SPY", "DEFEND", "RUN"]);
    expect(commandsForCharId(3)).toEqual(["BASH", "GOODS", "AUTO", "PSI", "MIRROR", "DEFEND", "RUN"]);
    expect(commandsForCharId(99)).toEqual(["BASH", "GOODS", "AUTO", "PSI", "DEFEND", "RUN"]);
    expect(commandsForCharId(2)).not.toContain("PSI");
  });
});

describe("battle damage", () => {
  it("is deterministic when RNG is injected", () => {
    const player = buildPlayerCombatant({ offense: 20 });
    const enemyCombatant = buildEnemyCombatant({ ...opponentA, defense: 4 });

    expect(damage(player, enemyCombatant, () => 0)).toBe(16);
    expect(damage(player, enemyCombatant, () => 0.5)).toBe(18);
    expect(damage(player, enemyCombatant, () => 1)).toBe(19);
  });
});

describe("battle player model", () => {
  it("builds the party from generated character data when provided", () => {
    const battle = createBattleState(opponentA, { characters: characters([partyCharacterA]), hpRatePerSec: 5 });

    expect(battle.party).toHaveLength(1);
    expect(battle.party[0]).toMatchObject({
      name: "PARTY_A",
      level: 6,
      maxHp: 72,
      maxPp: 18,
      pp: 18,
      offense: 21,
      defense: 8,
      speed: 7,
      isEnemy: false
    });
    expect(battle.party[0].hp).toMatchObject({ displayed: 72, target: 72, ratePerSec: 5 });
  });

  it("limits the generated party to four combatants", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([
        partyCharacterA,
        partyCharacterB,
        character(2, "PARTY_C", { speed: 3 }),
        character(3, "PARTY_D", { speed: 2 }),
        character(4, "PARTY_E", { speed: 1 })
      ])
    });

    expect(battle.party.map((member) => member.name)).toEqual(["PARTY_A", "PARTY_B", "PARTY_C", "PARTY_D"]);
  });

  it("applies optional effective stat bonuses to generated party combatants", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA]),
      statBonuses: { offense: 4, defense: 2, speed: 3 }
    });

    expect(battle.party[0]).toMatchObject({
      offense: 25,
      defense: 10,
      speed: 10
    });
  });

  it("keeps the neutral player fallback when generated character data is absent", () => {
    const battle = createBattleState(opponentA);

    expect(battle.party[0]).toMatchObject({
      name: PLAYER_DEFAULTS.name,
      level: PLAYER_DEFAULTS.level,
      maxHp: PLAYER_DEFAULTS.maxHp,
      maxPp: PLAYER_DEFAULTS.maxPp,
      pp: PLAYER_DEFAULTS.pp,
      offense: PLAYER_DEFAULTS.offense,
      defense: PLAYER_DEFAULTS.defense,
      speed: PLAYER_DEFAULTS.speed,
      isEnemy: false
    });
  });
});

describe("battle turn resolution", () => {
  it("orders living combatants by speed with deterministic ties", () => {
    const battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyCharacterA, partyCharacterB]),
      enemyOptions: [{ speed: 4 }, { speed: 7 }]
    });

    expect(turnOrder(battle)).toEqual([
      actor("party", 0),
      actor("enemy", 1),
      actor("party", 1),
      actor("enemy", 0)
    ]);
  });

  it("applies player BASH damage to the selected target", () => {
    const battle = createBattleState([opponentA, opponentB], {
      maxHp: 30,
      offense: 20,
      defense: 6
    });

    const result = resolveTurn(battle, actor("party", 0), () => 0.5, { targetIndex: 1 });

    expect(result.actor).toEqual(actor("party", 0));
    expect(result.defender).toEqual(actor("enemy", 1));
    expect(result.damage).toBe(18);
    expect(result.state.enemies[0].hp.target).toBe(24);
    expect(result.state.enemies[1].hp.displayed).toBe(30);
    expect(result.state.enemies[1].hp.target).toBe(12);
    expect(result.state.enemies[1].hp.isRolling).toBe(true);
  });

  it("uses first-living party targeting for simple enemy AI", () => {
    let battle = createBattleState([opponentA], {
      characters: characters([partyCharacterA, partyCharacterB]),
      enemyOptions: [{ speed: 9 }]
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      hp: { ...battle.party[0].hp, displayed: 0, target: 0, isRolling: false }
    });

    const result = resolveTurn(battle, actor("enemy", 0), () => 0.5);

    expect(result.defender).toEqual(actor("party", 1));
    expect(result.state.party[1].hp.target).toBeLessThan(result.state.party[1].hp.displayed);
  });

  it("sets DEFEND and halves incoming physical damage until that combatant's next turn", () => {
    const battle = createBattleState(enemy(15, "OPPONENT_DEFEND", { offense: 20 }), {
      characters: characters([partyCharacterA])
    });

    const defend = resolveDefendTurn(battle, actor("party", 0));
    const normalHit = resolveTurn(battle, actor("enemy", 0), () => 0.5);
    const defendedHit = resolveTurn(defend.state, actor("enemy", 0), () => 0.5);
    const nextTurn = beginCombatantTurn(defend.state, actor("party", 0));

    expect(defend.skipped).toBe(false);
    expect(defend.target).toEqual(actor("party", 0));
    expect(defend.state.party[0].defending).toBe(true);
    expect(normalHit.damage).toBe(16);
    expect(defendedHit.damage).toBe(8);
    expect(defendedHit.state.party[0].hp.target).toBe(64);
    expect(nextTurn.party[0].defending).toBe(false);
  });

  it("reduces physical and PSI enemy action damage against a defending party member", () => {
    const physicalBattle = createBattleState(enemy(16, "OPPONENT_PHYSICAL", {
      offense: 20,
      actions: actionSet(enemyAction(160, 1, 1))
    }), {
      characters: characters([partyCharacterA])
    });
    const psiBattle = createBattleState(enemy(17, "OPPONENT_PSI", {
      offense: 20,
      actions: actionSet(enemyAction(170, 3, 1))
    }), {
      characters: characters([partyCharacterA])
    });

    const physicalNormal = resolveEnemyActionTurn(physicalBattle, actor("enemy", 0), () => 0.5);
    const physicalDefending = resolveEnemyActionTurn(
      resolveDefendTurn(physicalBattle, actor("party", 0)).state,
      actor("enemy", 0),
      () => 0.5
    );
    const psiNormal = resolveEnemyActionTurn(psiBattle, actor("enemy", 0), () => 0.5);
    const psiDefending = resolveEnemyActionTurn(
      resolveDefendTurn(psiBattle, actor("party", 0)).state,
      actor("enemy", 0),
      () => 0.5
    );

    expect(physicalNormal.amount).toBe(16);
    expect(physicalDefending.effectKind).toBe("physical");
    expect(physicalDefending.amount).toBe(8);
    expect(physicalDefending.state.party[0].hp.target).toBe(64);
    expect(psiNormal.amount).toBe(13);
    expect(psiDefending.effectKind).toBe("psi");
    expect(psiDefending.amount).toBe(6);
    expect(psiDefending.state.party[0].hp.target).toBe(66);
  });

  it("AUTO bashes the default living enemy without manual target input", () => {
    let battle = createBattleState([opponentA, opponentB], {
      offense: 20,
      defense: 6
    });
    battle = withCombatant(battle, actor("enemy", 0), {
      ...battle.enemies[0],
      hp: { ...battle.enemies[0].hp, displayed: 0, target: 0, isRolling: false }
    });

    const result = resolveDefaultBashTurn(battle, actor("party", 0), () => 0.5);

    expect(defaultTargetIndexForActor(battle, actor("party", 0))).toBe(1);
    expect(result.skipped).toBe(false);
    expect(result.defender).toEqual(actor("enemy", 1));
    expect(result.damage).toBe(18);
    expect(result.state.enemies[1].hp.target).toBe(12);
  });

  it("detects the round boundary where AUTO should reset", () => {
    expect(shouldResetAutoFightRound(0, 4)).toBe(false);
    expect(shouldResetAutoFightRound(3, 4)).toBe(false);
    expect(shouldResetAutoFightRound(4, 4)).toBe(true);
    expect(shouldResetAutoFightRound(0, 0)).toBe(true);
  });

  it("selects enemy actions by deterministic source-order round robin", () => {
    const selected = selectEnemyAction(actionSet(
      enemyAction(10, 1, 1),
      enemyAction(11, 5, 1),
      enemyAction(12, 3, 4),
      enemyAction(13, 0, 0)
    ), 5);

    expect(selected).toMatchObject({
      actionIndex: 1,
      actionId: 11,
      actionType: 5,
      target: 1
    });
  });

  it("applies a physical enemy action to a party member", () => {
    const battle = createBattleState(enemy(10, "OPPONENT_D", {
      offense: 8,
      actions: actionSet(enemyAction(100, 1, 1))
    }), {
      characters: characters([partyCharacterA, partyCharacterB])
    });

    const result = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);

    expect(result.skipped).toBe(false);
    expect(result.effectKind).toBe("physical");
    expect(result.action).toMatchObject({ actionIndex: 0, actionId: 100, actionType: 1, target: 1 });
    expect(result.targets).toEqual([actor("party", 0)]);
    expect(result.amount).toBe(4);
    expect(result.state.party[0].hp.target).toBe(68);
    expect(result.state.party[1].hp.target).toBe(48);
    expect(result.state.enemies[0].nextActionIndex).toBe(1);
  });

  it("applies an all-target enemy action to all living party members", () => {
    const battle = createBattleState(enemy(11, "OPPONENT_E", {
      offense: 20,
      actions: actionSet(enemyAction(101, 2, 4))
    }), {
      characters: characters([partyCharacterA, partyCharacterB])
    });

    const result = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);

    expect(result.effectKind).toBe("physical");
    expect(result.targets).toEqual([actor("party", 0), actor("party", 1)]);
    expect(result.amount).toBe(33);
    expect(result.state.party[0].hp.target).toBe(56);
    expect(result.state.party[1].hp.target).toBe(31);
  });

  it("degrades a status-class enemy action to small damage with an intended status stub", () => {
    const battle = createBattleState(enemy(12, "OPPONENT_F", {
      offense: 20,
      actions: actionSet(enemyAction(102, 5, 1))
    }), {
      characters: characters([partyCharacterA, partyCharacterB])
    });

    const result = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);

    expect(result.effectKind).toBe("statusStub");
    expect(result.intendedStatus).toBe("generic-ailment");
    expect(result.targets).toEqual([actor("party", 0)]);
    expect(result.amount).toBe(5);
    expect(result.state.party[0].hp.target).toBe(67);
    expect(result.state.party[1].hp.target).toBe(48);
  });

  it("keeps unknown enemy action types as safe no-ops", () => {
    const battle = createBattleState(enemy(13, "OPPONENT_G", {
      offense: 20,
      actions: actionSet(enemyAction(103, 99, 1), enemyAction(104, 1, 1))
    }), {
      characters: characters([partyCharacterA])
    });

    const result = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);

    expect(result.effectKind).toBe("unknown");
    expect(result.amount).toBe(0);
    expect(result.targets).toEqual([]);
    expect(result.state.party[0].hp.target).toBe(72);
    expect(result.state.enemies[0].nextActionIndex).toBe(1);
  });

  it("builds a boss-flagged action enemy and defeats it with existing party turns", () => {
    const boss = enemy(14, "OPPONENT_H", {
      bossFlag: true,
      hp: 96,
      defense: 6,
      offense: 10,
      level: 7,
      actions: actionSet(
        enemyAction(120, 1, 1),
        enemyAction(121, 2, 4),
        enemyAction(122, 5, 1),
        enemyAction(123, 0, 0)
      )
    });
    let battle = createBattleState(boss, {
      characters: characters([
        partyCharacterA,
        partyCharacterB,
        character(2, "PARTY_C", { maxHp: 52, maxPp: 0, offense: 18, defense: 7, speed: 3 }),
        character(3, "PARTY_D", { maxHp: 44, maxPp: 0, offense: 14, defense: 6, speed: 2 })
      ])
    });

    expect(boss.bossFlag).toBe(true);
    expect(battle.enemies[0].actions?.[0]).toMatchObject({ actionId: 120, actionType: 1, target: 1 });

    const enemyResult = resolveEnemyActionTurn(battle, actor("enemy", 0), () => 0.5);
    expect(enemyResult.skipped).toBe(false);
    expect(enemyResult.effectKind).toBe("physical");
    expect(enemyResult.targets).toEqual([actor("party", 0)]);
    battle = tickBattleMeters(enemyResult.state, 15_000);

    let turns = 0;
    while (outcome(battle) !== "win" && turns < 12) {
      const partyIndex = turns % battle.party.length;
      const result = resolveTurn(battle, actor("party", partyIndex), () => 0.5, { targetIndex: 0 });
      expect(result.skipped).toBe(false);
      battle = tickBattleMeters(result.state, 15_000);
      turns += 1;
    }

    expect(outcome(battle)).toBe("win");
    expect(battle.enemies[0].hp.displayed).toBe(0);
  });
});

describe("battle PSI and goods resolution", () => {
  it("applies offensive PSI to an enemy rolling meter and consumes PP", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA])
    });
    const psi = syntheticPsi(100, "offense", "beta", [{ charId: 0, level: 1 }]);

    const result = resolvePsiTurn(battle, actor("party", 0), psi, () => 0.5, { targetIndex: 0 });

    expect(result.skipped).toBe(false);
    expect(result.target).toEqual(actor("enemy", 0));
    expect(result.amount).toBe(42);
    expect(result.ppCost).toBe(psiPpCost(psi));
    expect(result.state.party[0].pp).toBe(18 - psiPpCost(psi));
    expect(result.state.enemies[0].hp.displayed).toBe(24);
    expect(result.state.enemies[0].hp.target).toBe(0);
    expect(result.state.enemies[0].hp.isRolling).toBe(true);
  });

  it("applies recovery PSI to a party member rolling meter and consumes PP", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA, partyCharacterB])
    });
    battle = withCombatant(battle, actor("party", 1), {
      ...battle.party[1],
      hp: { ...battle.party[1].hp, displayed: 20, target: 20, isRolling: false }
    });
    const psi = syntheticPsi(101, "recovery", "alpha", [{ charId: 0, level: 1 }]);

    const result = resolvePsiTurn(battle, actor("party", 0), psi, () => 0.5, { targetIndex: 1 });

    expect(result.skipped).toBe(false);
    expect(result.target).toEqual(actor("party", 1));
    expect(result.amount).toBe(40);
    expect(result.state.party[0].pp).toBe(18 - psiPpCost(psi));
    expect(result.state.party[1].hp.displayed).toBe(20);
    expect(result.state.party[1].hp.target).toBe(48);
    expect(result.state.party[1].hp.isRolling).toBe(true);
  });

  it("blocks PSI when the actor does not have enough PP", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      pp: 1
    });
    const psi = syntheticPsi(102, "offense", "gamma", [{ charId: 0, level: 1 }]);

    const result = resolvePsiTurn(battle, actor("party", 0), psi, () => 0.5, { targetIndex: 0 });

    expect(result.skipped).toBe(true);
    expect(result.blockedReason).toBe("insufficientPp");
    expect(result.state).toBe(battle);
    expect(result.state.party[0].pp).toBe(1);
    expect(result.state.enemies[0].hp.target).toBe(24);
  });

  it("uses a consumable good in battle, heals, and removes it from inventory", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([character(0, "PARTY_A", { maxHp: 72, maxPp: 18 })])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      inventory: [200],
      hp: { ...battle.party[0].hp, displayed: 32, target: 32, isRolling: false }
    });
    const item = syntheticItem(200, 0x02, 30);

    const result = resolveItemTurn(battle, actor("party", 0), item, { inventorySlot: 0, targetIndex: 0 });

    expect(result.skipped).toBe(false);
    expect(result.itemConsumed).toBe(true);
    expect(result.target).toEqual(actor("party", 0));
    expect(result.amount).toBe(30);
    expect(result.state.party[0].inventory).toEqual([]);
    expect(result.state.party[0].hp.displayed).toBe(32);
    expect(result.state.party[0].hp.target).toBe(62);
    expect(result.state.party[0].hp.isRolling).toBe(true);
  });

  it("filters the in-battle PSI list by learned character and level", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA, partyCharacterB])
    });
    const psiList = [
      syntheticPsi(110, "offense", "alpha", [{ charId: 0, level: 1 }]),
      syntheticPsi(111, "offense", "beta", [{ charId: 0, level: 9 }]),
      syntheticPsi(112, "recovery", "alpha", [{ charId: 1, level: 1 }])
    ];

    expect(learnedPsiForCombatant(psiList, battle.party[0]).map((psi) => psi.id)).toEqual([110]);
    expect(learnedPsiForCombatant(psiList, battle.party[1]).map((psi) => psi.id)).toEqual([112]);
  });
});

describe("battle character-specific command resolution", () => {
  it("SPY reveals enemy HP and stats without changing HP and consumes the turn", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([character(2, "JEFF_TEST", { maxHp: 44, maxPp: 0 })])
    });

    const result = resolveSpyTurn(battle, actor("party", 0), { targetIndex: 0 });

    expect(result.skipped).toBe(false);
    expect(result.target).toEqual(actor("enemy", 0));
    expect(result.amount).toBe(0);
    expect(result.message).toBe("OPPONENT_A HP 24/24 Off 8 Def 4.");
    expect(result.state.party.map((member) => member.hp.target)).toEqual([44]);
    expect(result.state.enemies.map((enemyCombatant) => enemyCombatant.hp.target)).toEqual([24]);
  });

  it("PRAY deterministically heals living party members with a bounded seeded outcome", () => {
    let battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA, partyCharacterB])
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      hp: { ...battle.party[0].hp, displayed: 50, target: 50, isRolling: false }
    });
    battle = withCombatant(battle, actor("party", 1), {
      ...battle.party[1],
      hp: { ...battle.party[1].hp, displayed: 20, target: 20, isRolling: false }
    });

    const result = resolvePrayTurn(battle, actor("party", 1), () => 0.2);

    expect(result.skipped).toBe(false);
    expect(result.effect).toBe("healParty");
    expect(result.targets).toEqual([actor("party", 0), actor("party", 1)]);
    expect(result.amount).toBe(24);
    expect(result.state.party[0].hp.target).toBe(62);
    expect(result.state.party[1].hp.target).toBe(32);
    expect(result.message).toContain("recovered 24 HP");
  });

  it("PRAY can deterministically do nothing without changing battle state", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA, partyCharacterB])
    });

    const result = resolvePrayTurn(battle, actor("party", 1), () => 0.95);

    expect(result.skipped).toBe(false);
    expect(result.effect).toBe("nothing");
    expect(result.amount).toBe(0);
    expect(result.state).toBe(battle);
    expect(result.message).toBe("PARTY_B prayed. Nothing happened.");
  });

  it("PRAY damage outcome is bounded and safe after enemies are gone", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([partyCharacterA, partyCharacterB])
    });
    const damageResult = resolvePrayTurn(battle, actor("party", 1), () => 0.7);
    const emptyEnemyBattle = { ...battle, enemies: [] };
    const emptyEnemyResult = resolvePrayTurn(emptyEnemyBattle, actor("party", 1), () => 0.7);

    expect(damageResult.skipped).toBe(false);
    expect(damageResult.effect).toBe("damageEnemies");
    expect(damageResult.amount).toBe(8);
    expect(damageResult.state.enemies[0].hp.target).toBe(16);
    expect(emptyEnemyResult.skipped).toBe(true);
    expect(emptyEnemyResult.state).toBe(emptyEnemyBattle);
  });

  it("MIRROR strikes with the target enemy offense against its own defense and consumes the turn", () => {
    const battle = createBattleState(enemy(20, "MIRROR_TARGET", { hp: 30, offense: 20, defense: 4 }), {
      characters: characters([character(3, "POO_TEST", { offense: 5 })])
    });

    const result = resolveMirrorTurn(battle, actor("party", 0), () => 0.5, { targetIndex: 0 });

    expect(result.skipped).toBe(false);
    expect(result.target).toEqual(actor("enemy", 0));
    expect(result.amount).toBe(18);
    expect(result.state.enemies[0].hp.target).toBe(12);
    expect(result.message).toBe("POO_TEST mirrored MIRROR_TARGET for 18 damage.");
  });

  it("MIRROR safely skips when no enemy remains", () => {
    const battle = createBattleState(opponentA, {
      characters: characters([character(3, "POO_TEST")])
    });
    const emptyEnemyBattle = { ...battle, enemies: [] };

    const result = resolveMirrorTurn(emptyEnemyBattle, actor("party", 0), () => 0.5, { targetIndex: 0 });

    expect(result.skipped).toBe(true);
    expect(result.state).toBe(emptyEnemyBattle);
  });
});

describe("battle outcomes", () => {
  it("wins only when every enemy displayed HP reaches zero", () => {
    let battle = createBattleState([opponentA, opponentB]);
    battle = drainDisplayedHp(battle, actor("enemy", 0));

    expect(outcome(battle)).toBe("ongoing");

    battle = drainDisplayedHp(battle, actor("enemy", 1));

    expect(battle.enemies.map((enemyCombatant) => enemyCombatant.hp.displayed)).toEqual([0, 0]);
    expect(outcome(battle)).toBe("win");
  });

  it("loses only when every party member displayed HP reaches zero", () => {
    let battle = createBattleState([opponentA], { characters: characters([partyCharacterA, partyCharacterB]) });
    battle = drainDisplayedHp(battle, actor("party", 0));

    expect(outcome(battle)).toBe("ongoing");

    battle = drainDisplayedHp(battle, actor("party", 1));

    expect(battle.party.map((member) => member.hp.displayed)).toEqual([0, 0]);
    expect(outcome(battle)).toBe("lose");
  });

  it("survives a party member fatal target when all enemies display zero first", () => {
    let battle = createBattleState([opponentC], {
      characters: characters([partyCharacterA, partyCharacterB]),
      hpRatePerSec: 2
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      hp: setTarget(battle.party[0].hp, 0)
    });
    battle = withCombatant(battle, actor("enemy", 0), {
      ...battle.enemies[0],
      hp: setTarget({ ...battle.enemies[0].hp, displayed: 1, target: 1, isRolling: false }, 0)
    });

    battle = tickBattleMeters(battle, 500);

    expect(battle.party[0].hp.target).toBe(0);
    expect(battle.party[0].hp.displayed).toBeGreaterThan(0);
    expect(battle.enemies[0].hp.displayed).toBe(0);
    expect(outcome(battle)).toBe("win");
  });

  it("skips displayed-dead combatants in turn order and turn resolution", () => {
    let battle = createBattleState([opponentA, opponentB], {
      characters: characters([partyCharacterA, partyCharacterB]),
      enemyOptions: [{ speed: 9 }, { speed: 3 }]
    });
    battle = withCombatant(battle, actor("party", 0), {
      ...battle.party[0],
      hp: { ...battle.party[0].hp, displayed: 0, target: 0, isRolling: false }
    });
    battle = withCombatant(battle, actor("enemy", 0), {
      ...battle.enemies[0],
      hp: { ...battle.enemies[0].hp, displayed: 0, target: 0, isRolling: false }
    });

    expect(turnOrder(battle)).toEqual([actor("party", 1), actor("enemy", 1)]);

    const result = resolveTurn(battle, actor("party", 0), () => 0.5, { targetIndex: 1 });
    expect(result.skipped).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.state).toBe(battle);
  });
});

function drainDisplayedHp(battle: BattleState, target: BattleActor): BattleState {
  const combatant = target.side === "party" ? battle.party[target.index] : battle.enemies[target.index];
  return tickBattleMeters(
    withCombatant(battle, target, {
      ...combatant,
      hp: setTarget(combatant.hp, 0)
    }),
    15_000
  );
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
    startingItems: [1],
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
