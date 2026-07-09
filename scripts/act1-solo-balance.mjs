#!/usr/bin/env node
import "tsx";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");
const CONTENT = path.join(ROOT, "content");
const RUNS_PER_GROUP = 200;
const MAX_ROUNDS = 40;
const HEAL_THRESHOLD = 0.35;
const DEFEND_THRESHOLD = 0.2;
const FIRST_TIER_GROUPS = new Set([1, 2, 3]);

const [
  battleLogic,
  battleRound,
  battleGroups,
  characterModel,
  partyState
] = await Promise.all([
  import("../apps/game/src/battleLogic.ts"),
  import("../apps/game/src/battleRound.ts"),
  import("../apps/game/src/battleGroups.ts"),
  import("../apps/game/src/characterModel.ts"),
  import("../apps/game/src/partyState.ts")
]);

const {
  advanceBattleRound,
  battleRngSeedForGroup,
  createBattleRng,
  createBattleState,
  isCombatantAlive,
  outcome
} = battleLogic;
const {
  encounterAdvantageTurnOrder,
  resolveRoundStartPriority,
  resolveRoundStep
} = battleRound;
const { expandBattleGroupEnemies } = battleGroups;
const { buildPartyMember } = characterModel;
const { decodeItemUseEffect, isConsumableItem } = partyState;

function readJson(base, file) {
  return JSON.parse(readFileSync(path.join(base, file), "utf8"));
}

function readText(base, file) {
  return readFileSync(path.join(base, file), "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyCharacterOverrides(characters, overrides) {
  const next = clone(characters);
  for (const character of next.characters ?? []) {
    const override = overrides.byCharId?.[String(character.id)];
    if (!override) continue;
    if (override.name) character.name = override.name;
    if (override.startingItems) character.startingItems = [...override.startingItems];
  }
  return next;
}

function applyEnemyNameOverrides(battle, overrides) {
  const next = clone(battle);
  for (const enemy of next.enemies ?? []) {
    const override = overrides.byEnemyId?.[String(enemy.id)];
    if (override?.name) enemy.name = override.name;
  }
  return next;
}

function applyEnemyStatOverrides(battle, overrides) {
  const next = clone(battle);
  for (const enemy of next.enemies ?? []) {
    const override = overrides.byEnemyId?.[String(enemy.id)];
    if (!override) continue;
    for (const key of ["hp", "offense", "defense", "speed"]) {
      if (override[key] !== undefined) enemy[key] = override[key];
    }
  }
  return next;
}

function applyEnemyActionEffects(battle, effects) {
  const next = clone(battle);
  for (const enemy of next.enemies ?? []) {
    enemy.actions = (enemy.actions ?? []).map((action) => {
      const actionId = String(action.actionId ?? action.id);
      const effect = effects.byActionId?.[actionId];
      return effect
        ? {
            ...action,
            ...(effect.name ? { name: effect.name } : {}),
            effect: { ...effect.effect }
          }
        : action;
    });
  }
  return next;
}

function resolvedBattleData() {
  const battle = readJson(GENERATED, "battle.json");
  const enemyNames = readJson(GENERATED, "enemy-overrides.json");
  const enemyStats = readJson(GENERATED, "enemy-stat-overrides.json");
  const enemyEffects = readJson(GENERATED, "enemy-action-effects.json");
  return applyEnemyActionEffects(
    applyEnemyStatOverrides(applyEnemyNameOverrides(battle, enemyNames), enemyStats),
    enemyEffects
  );
}

function resolvedCharacters() {
  const characters = readJson(GENERATED, "characters.json");
  const overrides = readJson(GENERATED, "character-overrides.json");
  return applyCharacterOverrides(characters, overrides);
}

function allowedGroups() {
  const source = readJson(CONTENT, "roamer-zone-caps.json");
  const zone = source.zones?.find((entry) => entry.id === "act1-morningside-northwest-quadrant") ?? source.zones?.[0];
  return [...(zone?.allowedGroups ?? [])];
}

function roamerCopiesIdentical() {
  return readText(CONTENT, "roamer-zone-caps.json") === readText(GENERATED, "roamer-zone-caps.json");
}

function makeSoloBoschParty(characters) {
  const bosch = characters.characters.find((entry) => entry.id === 0) ?? characters.characters[0];
  if (!bosch) {
    throw new Error("Missing generated character 0 for solo Bosch sim.");
  }
  const member = buildPartyMember(bosch);
  return {
    ...member,
    inventory: []
  };
}

function healingItemIds(items, inventory) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return inventory.filter((itemId) => {
    const item = itemById.get(itemId);
    if (!item || !isConsumableItem(item)) return false;
    const effect = decodeItemUseEffect(item);
    return effect?.kind === "healHp" || effect?.kind === "healHpPercent";
  });
}

function commandForRound(state, items) {
  const actor = state.party[0];
  if (!actor || !isCombatantAlive(actor)) {
    return undefined;
  }
  const hpRatio = actor.maxHp > 0 ? actor.hp.target / actor.maxHp : 0;
  const heals = healingItemIds(items, actor.inventory);
  if (hpRatio < HEAL_THRESHOLD && heals.length > 0) {
    return {
      partySlot: 0,
      command: "GOODS",
      itemId: heals[0],
      target: { side: "party", index: 0 }
    };
  }
  if (hpRatio < DEFEND_THRESHOLD) {
    return {
      partySlot: 0,
      command: "DEFEND"
    };
  }
  return {
    partySlot: 0,
    command: "BASH",
    target: { side: "enemy", index: firstLivingEnemyIndex(state) }
  };
}

function firstLivingEnemyIndex(state) {
  return Math.max(0, state.enemies.findIndex((enemy) => isCombatantAlive(enemy)));
}

function runFight({ battleData, group, enemies, bosch, items, psi, runIndex }) {
  const rng = createBattleRng((battleRngSeedForGroup(group.id, enemies, runIndex + 1) ^ ((runIndex + 1) * 0x9e3779b9)) >>> 0);
  let state = createBattleState(enemies, {
    partyMembers: [bosch],
    partyOptions: [{}],
    wallet: 0,
    bank: 0
  });
  let rounds = 0;
  let damageTaken = 0;
  let damageDealt = 0;

  while (outcome(state) === "ongoing" && rounds < MAX_ROUNDS) {
    rounds += 1;
    const queued = [commandForRound(state, items)].filter(Boolean);
    const priority = resolveRoundStartPriority(state, queued, rng, { groupId: group.id });
    state = priority.state;
    const order = encounterAdvantageTurnOrder(state, priority.queued, rng, { advantage: "normal" });
    if (priority.priorityStep) {
      const totals = damageTotals(priority.priorityStep);
      damageTaken += totals.taken;
      damageDealt += totals.dealt;
    }
    for (const actor of order) {
      if (outcome(state) !== "ongoing") break;
      const command = actor.side === "party"
        ? priority.queued.find((entry) => entry.partySlot === actor.index)
        : undefined;
      const result = resolveRoundStep(state, actor, command, rng, { items, psi });
      state = result.state;
      const totals = damageTotals(result);
      damageTaken += totals.taken;
      damageDealt += totals.dealt;
    }
    if (outcome(state) === "ongoing") {
      state = advanceBattleRound(state);
    }
  }

  return {
    groupId: group.id,
    won: outcome(state) === "win",
    rounds,
    damageTaken,
    damageDealt
  };
}

function damageTotals(result) {
  const amount = result.events
    .filter((event) => event.kind === "damage")
    .reduce((sum, event) => sum + event.amount, 0);
  if (amount <= 0) {
    return { taken: 0, dealt: 0 };
  }
  return result.actor.side === "party"
    ? { taken: 0, dealt: amount }
    : { taken: amount, dealt: 0 };
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatNumber(value, digits = 1) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function enemyStatText(enemies) {
  return enemies.map((enemy) => `${enemy.id} ${enemy.name} hp${enemy.hp} off${enemy.offense} def${enemy.defense}`).join("; ");
}

function groupXp(enemies) {
  return enemies.reduce((sum, enemy) => sum + (enemy.experience ?? 0), 0);
}

function summarizeGroup({ battleData, groupId, bosch, items, psi }) {
  const group = battleData.groups.find((entry) => entry.id === groupId);
  if (!group) {
    throw new Error(`Missing battle group ${groupId}.`);
  }
  const enemies = expandBattleGroupEnemies(battleData, group);
  const runs = Array.from({ length: RUNS_PER_GROUP }, (_, runIndex) =>
    runFight({ battleData, group, enemies, bosch, items, psi, runIndex })
  );
  const rounds = runs.map((run) => run.rounds);
  const wins = runs.filter((run) => run.won).length;
  return {
    groupId,
    enemies,
    winRate: wins / runs.length,
    medianRounds: median(rounds),
    damageTakenPerRound: mean(runs.map((run) => run.damageTaken / Math.max(1, run.rounds))),
    damageDealtPerRound: mean(runs.map((run) => run.damageDealt / Math.max(1, run.rounds))),
    xp: groupXp(enemies)
  };
}

function targetPass(row) {
  const neededWinRate = FIRST_TIER_GROUPS.has(row.groupId) ? 0.97 : 0.9;
  return row.winRate >= neededWinRate && row.medianRounds >= 3 && row.medianRounds <= 6;
}

function printTable(rows) {
  console.log("| Group | Win | Med rounds | Taken/R | Dealt/R | XP | Enemy hp/off/def |");
  console.log("| ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const row of rows) {
    console.log(`| ${row.groupId} | ${(row.winRate * 100).toFixed(1)}% | ${formatNumber(row.medianRounds, 1)} | ${row.damageTakenPerRound.toFixed(1)} | ${row.damageDealtPerRound.toFixed(1)} | ${row.xp} | ${enemyStatText(row.enemies)} |`);
  }
}

const battleData = resolvedBattleData();
const characters = resolvedCharacters();
const bosch = makeSoloBoschParty(characters);
const items = readJson(GENERATED, "items.json").items;
const psi = readJson(GENERATED, "psi.json").psi;
const groups = allowedGroups();
const rows = groups.map((groupId) => summarizeGroup({ battleData, groupId, bosch, items, psi }));
const failures = rows.filter((row) => !targetPass(row));

console.log("# Act 1 solo balance sim");
console.log(`Runs per group: ${RUNS_PER_GROUP}`);
console.log(`Party: ${bosch.name} level ${bosch.level}, hp ${bosch.maxHp}, off ${bosch.stats.offense}, def ${bosch.stats.defense}, speed ${bosch.stats.speed}, inventory none`);
console.log(`Policy: attack; heal below ${(HEAL_THRESHOLD * 100).toFixed(0)} percent if any healing item exists; defend below ${(DEFEND_THRESHOLD * 100).toFixed(0)} percent; never flee; no timed-hit bonuses`);
console.log(`Roamer caps content/generated identical: ${roamerCopiesIdentical() ? "yes" : "no"}`);
console.log("");
printTable(rows);
console.log("");
if (failures.length > 0) {
  console.log(`FAIL groups: ${failures.map((row) => row.groupId).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("PASS all groups meet the Act 1 solo targets.");
}
