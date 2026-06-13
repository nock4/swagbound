import type { BattleEnemy, CharacterCollection, CharacterData, ItemData, PsiData } from "@eb/schemas";
import {
  createRollingMeter,
  isDepleted,
  setTarget,
  tick,
  type RollingMeterState
} from "./rollingMeter";
import {
  buildCombatantFromPartyMember,
  buildPartyMember,
  type PartyMember,
  type PartyMemberStatBonuses
} from "./characterModel";
import {
  applyUseEffectToVitals,
  decodeItemUseEffect,
  type ItemUseEffect,
  type PartyVitals
} from "./partyState";

export type Rng = () => number;
export type BattleSide = "party" | "enemy";
export type BattleActor = {
  side: BattleSide;
  index: number;
};
export type BattleOutcome = "ongoing" | "win" | "lose";

export type Combatant = {
  charId: number;
  name: string;
  level: number;
  maxHp: number;
  maxPp: number;
  pp: number;
  inventory: number[];
  hp: RollingMeterState;
  offense: number;
  defense: number;
  speed: number;
  isEnemy: boolean;
};

export type BattleState = {
  party: Combatant[];
  enemies: Combatant[];
};

export type PlayerCombatantOptions = Partial<Pick<Combatant, "name" | "level" | "maxHp" | "offense" | "defense" | "speed">> & {
  hpRatePerSec?: number;
  character?: CharacterData;
  partyMember?: PartyMember;
  statBonuses?: PartyMemberStatBonuses;
};

export type EnemyCombatantOptions = {
  hpRatePerSec?: number;
  speed?: number;
};

export type BattleStateOptions = PlayerCombatantOptions & {
  characters?: CharacterCollection;
  partyMembers?: PartyMember[];
  partyOptions?: PlayerCombatantOptions[];
  enemyOptions?: EnemyCombatantOptions[];
};

export type TurnResolution = {
  state: BattleState;
  actor: BattleActor;
  defender: BattleActor | null;
  damage: number;
  outcome: BattleOutcome;
  skipped: boolean;
};

export type BattleActionBlockReason =
  | "invalidActor"
  | "noTarget"
  | "unsupportedPsi"
  | "insufficientPp"
  | "missingItem"
  | "notConsumable"
  | "unknownEffect";

export type BattleActionResolution = {
  state: BattleState;
  actor: BattleActor;
  target: BattleActor | null;
  amount: number;
  outcome: BattleOutcome;
  skipped: boolean;
  blockedReason?: BattleActionBlockReason;
  ppCost?: number;
  itemConsumed?: boolean;
};

export type PsiBattleKind = "offense" | "recovery" | "assist" | "other";

export const PLAYER_DEFAULTS = {
  charId: 0,
  name: "PLAYER",
  level: 1,
  maxHp: 40,
  maxPp: 0,
  pp: 0,
  inventory: [] as number[],
  offense: 12,
  defense: 6,
  speed: 5,
  hpRatePerSec: 36
} as const;

const ENEMY_HP_RATE_PER_SEC = 42;
const STRENGTH_RANK: Record<string, number> = {
  none: 0,
  alpha: 1,
  beta: 2,
  gamma: 3,
  sigma: 4,
  omega: 5
};
const STRENGTH_PP_COST: Record<string, number> = {
  none: 0,
  alpha: 4,
  beta: 8,
  gamma: 13,
  sigma: 18,
  omega: 24
};

export function buildPlayerCombatant(options: PlayerCombatantOptions = {}): Combatant {
  const member = options.partyMember ?? (options.character ? buildPartyMember(options.character) : undefined);
  if (member) {
    return buildCombatantFromPartyMember(member, {
      hpRatePerSec: options.hpRatePerSec,
      statBonuses: options.statBonuses
    });
  }

  const maxHp = stat(options.maxHp ?? PLAYER_DEFAULTS.maxHp);
  return {
    charId: PLAYER_DEFAULTS.charId,
    name: options.name ?? PLAYER_DEFAULTS.name,
    level: stat(options.level ?? PLAYER_DEFAULTS.level),
    maxHp,
    maxPp: PLAYER_DEFAULTS.maxPp,
    pp: PLAYER_DEFAULTS.pp,
    inventory: [...PLAYER_DEFAULTS.inventory],
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? PLAYER_DEFAULTS.hpRatePerSec),
    offense: stat(options.offense ?? PLAYER_DEFAULTS.offense) + stat(options.statBonuses?.offense ?? 0),
    defense: stat(options.defense ?? PLAYER_DEFAULTS.defense) + stat(options.statBonuses?.defense ?? 0),
    speed: stat(options.speed ?? PLAYER_DEFAULTS.speed) + stat(options.statBonuses?.speed ?? 0),
    isEnemy: false
  };
}

export function buildEnemyCombatant(enemy: BattleEnemy, options: EnemyCombatantOptions = {}): Combatant {
  const maxHp = stat(enemy.hp);
  return {
    charId: enemy.id,
    name: enemy.name,
    level: stat(enemy.level),
    maxHp,
    maxPp: 0,
    pp: 0,
    inventory: [],
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? ENEMY_HP_RATE_PER_SEC),
    offense: stat(enemy.offense),
    defense: stat(enemy.defense),
    speed: stat(options.speed ?? enemySpeed(enemy)),
    isEnemy: true
  };
}

export function buildPartyCombatants(options: BattleStateOptions = {}): Combatant[] {
  const members = options.partyMembers?.slice(0, 4) ?? [];
  if (members.length > 0) {
    return members.map((partyMember, index) => buildPlayerCombatant(playerOptionsAt(options, index, { partyMember })));
  }

  const characters = options.characters?.characters.slice(0, 4) ?? [];
  if (characters.length > 0) {
    return characters.map((character, index) => buildPlayerCombatant(playerOptionsAt(options, index, { character })));
  }

  if (options.partyMember) {
    return [buildPlayerCombatant(playerOptionsAt(options, 0, { partyMember: options.partyMember }))];
  }

  if (options.character) {
    return [buildPlayerCombatant(playerOptionsAt(options, 0, { character: options.character }))];
  }

  return [buildPlayerCombatant(playerOptionsAt(options, 0))];
}

export function createBattleState(enemies: BattleEnemy | BattleEnemy[], options: BattleStateOptions = {}): BattleState {
  const enemyList = Array.isArray(enemies) ? enemies : [enemies];
  return {
    party: buildPartyCombatants(options),
    enemies: enemyList.map((enemy, index) => buildEnemyCombatant(enemy, options.enemyOptions?.[index]))
  };
}

export function damage(attacker: Combatant, defender: Combatant, rng: Rng): number {
  const base = Math.max(1, attacker.offense - Math.floor(defender.defense / 2));
  const roll = normalizedRoll(rng());
  const spread = 0.9 + roll * 0.2;
  return Math.max(1, Math.floor(base * spread));
}

export function turnOrder(state: BattleState): BattleActor[] {
  return allActors(state)
    .filter((actor) => {
      const combatant = combatantFor(state, actor);
      return Boolean(combatant && isCombatantAlive(combatant));
    })
    .sort((a, b) => {
      const left = combatantFor(state, a);
      const right = combatantFor(state, b);
      const speedDelta = stat(right?.speed ?? 0) - stat(left?.speed ?? 0);
      if (speedDelta !== 0) {
        return speedDelta;
      }
      const sideDelta = sideTieRank(a.side) - sideTieRank(b.side);
      return sideDelta !== 0 ? sideDelta : a.index - b.index;
    });
}

export function resolveTurn(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy",
  rng: Rng,
  options: { targetIndex?: number } = {}
): TurnResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing") {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const attackerCombatant = combatantFor(state, actor);
  if (!attackerCombatant || !isCombatantAlive(attackerCombatant)) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const defender = targetForActor(state, actor, options.targetIndex);
  if (!defender) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const defenderCombatant = combatantFor(state, defender);
  if (!defenderCombatant) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const amount = damage(attackerCombatant, defenderCombatant, rng);
  const nextDefender = applyDamage(defenderCombatant, amount);
  const nextState = withCombatant(state, defender, nextDefender);
  return {
    state: nextState,
    actor,
    defender,
    damage: amount,
    outcome: outcome(nextState),
    skipped: false
  };
}

export function resolvePsiTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  psi: PsiData,
  rng: Rng,
  options: { targetIndex?: number } = {}
): BattleActionResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing") {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }
  if (actor.side !== "party") {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const caster = combatantFor(state, actor);
  if (!caster || !isCombatantAlive(caster)) {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const kind = psiBattleKind(psi);
  if (kind !== "offense" && kind !== "recovery") {
    return blockedAction(state, actor, currentOutcome, "unsupportedPsi");
  }

  const ppCost = psiPpCost(psi);
  if (caster.pp < ppCost) {
    return {
      ...blockedAction(state, actor, currentOutcome, "insufficientPp"),
      ppCost
    };
  }

  const target = kind === "offense"
    ? livingTarget(state.enemies, "enemy", options.targetIndex)
    : livingTarget(state.party, "party", options.targetIndex);
  if (!target) {
    return {
      ...blockedAction(state, actor, currentOutcome, "noTarget"),
      ppCost
    };
  }

  const targetCombatant = combatantFor(state, target);
  if (!targetCombatant) {
    return {
      ...blockedAction(state, actor, currentOutcome, "noTarget"),
      ppCost
    };
  }

  const amount = psiEffectAmount(psi, kind, rng);
  const nextTarget = kind === "offense"
    ? applyDamage(targetCombatant, amount)
    : applyHeal(targetCombatant, amount);
  const withTarget = withCombatant(state, target, nextTarget);
  const nextState = spendPp(withTarget, actor, ppCost);
  return {
    state: nextState,
    actor,
    target,
    amount,
    outcome: outcome(nextState),
    skipped: false,
    ppCost
  };
}

export function resolveItemTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  item: Pick<ItemData, "id" | "action" | "argument" | "miscFlags">,
  options: { inventorySlot?: number; targetIndex?: number } = {}
): BattleActionResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing") {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }
  if (actor.side !== "party") {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const user = combatantFor(state, actor);
  if (!user || !isCombatantAlive(user)) {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const itemId = stat(item.id);
  const slot = options.inventorySlot ?? user.inventory.indexOf(itemId);
  if (slot < 0 || user.inventory[slot] !== itemId) {
    return blockedAction(state, actor, currentOutcome, "missingItem");
  }

  const effect = decodeItemUseEffect(item);
  if (!effect) {
    const maybeConsumable = item.miscFlags.some((flag) => flag.trim().toLowerCase() === "item disappears when used");
    return blockedAction(state, actor, currentOutcome, maybeConsumable ? "unknownEffect" : "notConsumable");
  }

  const target = livingTarget(state.party, "party", options.targetIndex);
  if (!target) {
    return blockedAction(state, actor, currentOutcome, "noTarget");
  }
  const targetCombatant = combatantFor(state, target);
  if (!targetCombatant) {
    return blockedAction(state, actor, currentOutcome, "noTarget");
  }

  const applied = applyItemEffectToCombatant(targetCombatant, effect);
  const withTarget = withCombatant(state, target, applied.combatant);
  const nextState = removeInventoryItem(withTarget, actor, slot, itemId);
  return {
    state: nextState,
    actor,
    target,
    amount: Math.max(0, applied.nextValue - applied.previousValue),
    outcome: outcome(nextState),
    skipped: false,
    itemConsumed: true
  };
}

export function learnedPsiForCombatant(psiList: PsiData[], combatant: Pick<Combatant, "charId" | "level">): PsiData[] {
  const charId = stat(combatant.charId);
  const level = stat(combatant.level);
  return psiList.filter((psi) =>
    psi.learnedBy.some((entry) => stat(entry.charId) === charId && stat(entry.level) <= level)
  );
}

export function psiBattleKind(psi: Pick<PsiData, "type">): PsiBattleKind | undefined {
  const tokens = psiTypeTokens(psi.type);
  if (tokens.has("offense")) {
    return "offense";
  }
  if (tokens.has("recovery") || tokens.has("recover")) {
    return "recovery";
  }
  if (tokens.has("assist")) {
    return "assist";
  }
  if (tokens.has("other")) {
    return "other";
  }
  return undefined;
}

export function psiPpCost(psi: Pick<PsiData, "strength">): number {
  return STRENGTH_PP_COST[normalizedStrength(psi.strength)] ?? STRENGTH_PP_COST.none;
}

export function psiEffectAmount(psi: Pick<PsiData, "strength">, kind: "offense" | "recovery", rng: Rng = () => 0.5): number {
  const rank = STRENGTH_RANK[normalizedStrength(psi.strength)] ?? 0;
  const base = kind === "offense"
    ? 18 + rank * 12
    : 24 + rank * 16;
  const spread = kind === "offense" ? 0.95 + normalizedRoll(rng()) * 0.1 : 1;
  return Math.max(1, Math.floor(base * spread));
}

export function tickBattleMeters(state: BattleState, dtMs: number): BattleState {
  return {
    party: state.party.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) })),
    enemies: state.enemies.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) }))
  };
}

export function outcome(state: BattleState): BattleOutcome {
  if (state.enemies.length === 0 || state.enemies.every((enemy) => isDepleted(enemy.hp))) {
    return "win";
  }
  if (state.party.length === 0 || state.party.every((member) => isDepleted(member.hp))) {
    return "lose";
  }
  return "ongoing";
}

export function withCombatant(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy",
  combatant: Combatant
): BattleState {
  const actor = normalizeActor(actorInput);
  if (actor.side === "party") {
    return { ...state, party: replaceAt(state.party, actor.index, combatant) };
  }
  return { ...state, enemies: replaceAt(state.enemies, actor.index, combatant) };
}

export function combatantAt(state: BattleState, actorInput: BattleActor | "player" | "enemy"): Combatant | undefined {
  return combatantFor(state, normalizeActor(actorInput));
}

export function isCombatantAlive(combatant: Pick<Combatant, "hp">): boolean {
  return !isDepleted(combatant.hp);
}

export function firstLivingIndex(combatants: Combatant[]): number {
  return combatants.findIndex(isCombatantAlive);
}

export function normalizeActor(actor: BattleActor | "player" | "enemy"): BattleActor {
  if (actor === "player") {
    return { side: "party", index: 0 };
  }
  if (actor === "enemy") {
    return { side: "enemy", index: 0 };
  }
  return actor;
}

function applyDamage(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    hp: setTarget(combatant.hp, Math.max(0, combatant.hp.target - Math.max(0, Math.floor(amount))))
  };
}

function applyHeal(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    hp: setTarget(combatant.hp, Math.min(combatant.maxHp, combatant.hp.target + Math.max(0, Math.floor(amount))))
  };
}

function combatantFor(state: BattleState, actor: BattleActor): Combatant | undefined {
  return actor.side === "party" ? state.party[actor.index] : state.enemies[actor.index];
}

function targetForActor(state: BattleState, actor: BattleActor, targetIndex: number | undefined): BattleActor | null {
  if (actor.side === "party") {
    return livingTarget(state.enemies, "enemy", targetIndex);
  }

  // Enemy AI is intentionally simple: each enemy attacks the first living party member.
  return livingTarget(state.party, "party");
}

function livingTarget(combatants: Combatant[], side: BattleSide, requestedIndex?: number): BattleActor | null {
  if (
    requestedIndex !== undefined &&
    requestedIndex >= 0 &&
    requestedIndex < combatants.length &&
    isCombatantAlive(combatants[requestedIndex])
  ) {
    return { side, index: requestedIndex };
  }

  const index = firstLivingIndex(combatants);
  return index >= 0 ? { side, index } : null;
}

function allActors(state: BattleState): BattleActor[] {
  return [
    ...state.party.map((_, index) => ({ side: "party" as const, index })),
    ...state.enemies.map((_, index) => ({ side: "enemy" as const, index }))
  ];
}

function sideTieRank(side: BattleSide): number {
  return side === "party" ? 0 : 1;
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  if (index < 0 || index >= items.length) {
    return items;
  }
  return items.map((current, currentIndex) => (currentIndex === index ? item : current));
}

function blockedAction(
  state: BattleState,
  actor: BattleActor,
  currentOutcome: BattleOutcome,
  blockedReason: BattleActionBlockReason
): BattleActionResolution {
  return {
    state,
    actor,
    target: null,
    amount: 0,
    outcome: currentOutcome,
    skipped: true,
    blockedReason
  };
}

function spendPp(state: BattleState, actor: BattleActor, ppCost: number): BattleState {
  if (ppCost <= 0) {
    return state;
  }
  const combatant = combatantFor(state, actor);
  if (!combatant) {
    return state;
  }
  return withCombatant(state, actor, {
    ...combatant,
    pp: Math.max(0, combatant.pp - stat(ppCost))
  });
}

function removeInventoryItem(state: BattleState, actor: BattleActor, slot: number, itemId: number): BattleState {
  const combatant = combatantFor(state, actor);
  if (!combatant || combatant.inventory[slot] !== itemId) {
    return state;
  }
  return withCombatant(state, actor, {
    ...combatant,
    inventory: combatant.inventory.filter((_, index) => index !== slot)
  });
}

function applyItemEffectToCombatant(combatant: Combatant, effect: ItemUseEffect): {
  combatant: Combatant;
  previousValue: number;
  nextValue: number;
} {
  const applied = applyUseEffectToVitals(combatantVitals(combatant), effect);
  return {
    combatant: {
      ...combatant,
      hp: applied.vitals.hp,
      pp: applied.vitals.pp
    },
    previousValue: applied.previousValue,
    nextValue: applied.nextValue
  };
}

function combatantVitals(combatant: Combatant): PartyVitals {
  return {
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    pp: combatant.pp,
    maxPp: combatant.maxPp
  };
}

function psiTypeTokens(type: string): Set<string> {
  return new Set(type.toLowerCase().split(/[^a-z]+/).filter(Boolean));
}

function normalizedStrength(strength: string): string {
  return strength.trim().toLowerCase();
}

function normalizedRoll(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function enemySpeed(enemy: BattleEnemy): number {
  const maybeSpeed = (enemy as BattleEnemy & { speed?: number }).speed;
  return stat(maybeSpeed ?? enemy.level);
}

function playerOptionsAt(
  options: BattleStateOptions,
  index: number,
  extra: Pick<PlayerCombatantOptions, "character" | "partyMember"> = {}
): PlayerCombatantOptions {
  const indexed = options.partyOptions?.[index] ?? {};
  return {
    name: options.name,
    level: options.level,
    maxHp: options.maxHp,
    offense: options.offense,
    defense: options.defense,
    speed: options.speed,
    hpRatePerSec: options.hpRatePerSec,
    statBonuses: options.statBonuses,
    ...indexed,
    ...extra
  };
}
