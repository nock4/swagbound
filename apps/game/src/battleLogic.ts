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
  calculateStatsAtLevel,
  levelForExperience,
  type PartyMember,
  type PartyMemberExpThreshold,
  type PartyMemberGrowth,
  type PartyMemberStatBonuses,
  type PartyMemberStats
} from "./characterModel";
import {
  applyUseEffectToVitals,
  decodeItemUseEffect,
  itemEffectTargetSide,
  type ItemUseEffect,
  type PartyVitals
} from "./partyState";
import {
  cureStatus,
  hasStatus,
  incomingDamageScale,
  inflictStatus,
  resolveTurnGate,
  tickStatuses,
  type StatusState
} from "./statusEffects";

export type Rng = () => number;
export type BattleSide = "party" | "enemy";
export type BattleActor = {
  side: BattleSide;
  index: number;
};
export type BattleOutcome = "ongoing" | "win" | "lose";
export type EncounterAdvantage = "normal" | "partyFirstStrike" | "enemyFirstStrike" | "instantWin";
const ALL_BATTLE_COMMANDS = ["BASH", "GOODS", "AUTO", "PSI", "SPY", "PRAY", "MIRROR", "DEFEND", "RUN"] as const;
export type BattleCommand = typeof ALL_BATTLE_COMMANDS[number];
export const BATTLE_COMMANDS = ["BASH", "GOODS", "AUTO", "PSI", "DEFEND", "RUN"] as const satisfies readonly BattleCommand[];
const PAULA_BATTLE_COMMANDS = ["BASH", "GOODS", "AUTO", "PSI", "PRAY", "DEFEND", "RUN"] as const satisfies readonly BattleCommand[];
const JEFF_BATTLE_COMMANDS = ["BASH", "GOODS", "AUTO", "SPY", "DEFEND", "RUN"] as const satisfies readonly BattleCommand[];
const POO_BATTLE_COMMANDS = ["BASH", "GOODS", "AUTO", "PSI", "MIRROR", "DEFEND", "RUN"] as const satisfies readonly BattleCommand[];

export type Combatant = {
  combatantId: string;
  charId: number;
  name: string;
  level: number;
  experience: number;
  maxHp: number;
  maxPp: number;
  pp: number;
  inventory: number[];
  hp: RollingMeterState;
  offense: number;
  defense: number;
  speed: number;
  stats: PartyMemberStats;
  growth?: PartyMemberGrowth;
  expTable?: PartyMemberExpThreshold[];
  money: number;
  itemDropped: number | null;
  itemRarity: BattleEnemy["itemRarity"];
  isEnemy: boolean;
  defending?: boolean;
  /** Battle-scoped status ailments (poisoned/paralyzed/asleep/...); see statusEffects.ts. */
  statuses?: StatusState;
  actions?: BattleEnemy["actions"];
  nextActionIndex?: number;
};

export type BattleState = {
  party: Combatant[];
  enemies: Combatant[];
  wallet: number;
  roundNumber: number;
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
  wallet?: number;
  roundNumber?: number;
};

export type BattleTargetOptions = {
  targetIndex?: number;
  targetCombatantId?: string;
  /** Force the target side (e.g. a confused attacker striking its own side). */
  targetSide?: BattleSide;
};

export type TurnResolution = {
  state: BattleState;
  actor: BattleActor;
  defender: BattleActor | null;
  damage: number;
  outcome: BattleOutcome;
  skipped: boolean;
  missed?: boolean;
  smash?: boolean;
  gutsSurvived?: boolean;
};

export type EnemyActionEffectKind = "physical" | "psi" | "statusStub" | "assist" | "none" | "unknown";

export type EnemyActionSelection = {
  action: BattleEnemy["actions"][number];
  actionIndex: number;
  actionId: number;
  actionType?: number;
  target?: number;
};

export type EnemyActionResolution = {
  state: BattleState;
  actor: BattleActor;
  targets: BattleActor[];
  amount: number;
  outcome: BattleOutcome;
  skipped: boolean;
  action: EnemyActionSelection | null;
  effectKind: EnemyActionEffectKind;
  intendedStatus?: "generic-ailment";
  missed?: boolean;
  smash?: boolean;
  gutsSurvived?: boolean;
};

export type PhysicalAttackPipelineResult = {
  damage: number;
  missed: boolean;
  smash: boolean;
  gutsSurvived: boolean;
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

export type SpyResolution = BattleActionResolution & {
  message: string;
};

export type PrayEffect = "healParty" | "restorePp" | "damageEnemies" | "nothing";

export type PrayResolution = BattleActionResolution & {
  effect: PrayEffect;
  targets: BattleActor[];
  message: string;
};

export type MirrorResolution = BattleActionResolution & {
  message: string;
};

export type PsiBattleKind = "offense" | "recovery" | "assist" | "other";

export type BattleDropSummary = {
  enemyId: number;
  itemId: number;
  itemName: string;
  recipientCharId: number;
  roll: number;
  rarity: NonNullable<BattleEnemy["itemRarity"]>;
};

export type BattleLearnedSkillSummary = {
  psiId: number;
  name: string;
};

export type BattleLevelUpStatKey = keyof PartyMemberStats | "maxHp" | "maxPp";

export type BattleLevelUpStatChange = {
  stat: BattleLevelUpStatKey;
  before: number;
  after: number;
  gain: number;
};

export type BattleLevelUpSummary = {
  charId: number;
  name: string;
  fromLevel: number;
  toLevel: number;
  statGains: PartyMemberStats & { maxHp: number; maxPp: number };
  statChanges: BattleLevelUpStatChange[];
  learnedSkills: BattleLearnedSkillSummary[];
};

export type BattleVictorySummary = {
  expGained: number;
  moneyGained: number;
  drops: BattleDropSummary[];
  levelUps: BattleLevelUpSummary[];
};

export type BattleVictoryViewModel = {
  lines: string[];
  pages: string[][];
  pageDetails: BattleVictoryViewPage[];
  expGained: number;
  moneyGained: number;
  itemsFound: string[];
  levelUps: BattleLevelUpSummary[];
};

export type BattleVictoryViewPageKind = "tally" | "level-up" | "stat-gains" | "learned-psi";

export type BattleVictoryViewPage = {
  kind: BattleVictoryViewPageKind;
  lines: string[];
  highlighted?: boolean;
  levelUpIndex?: number;
  learnedSkillIndex?: number;
};

export const VICTORY_SUMMARY_PAGE_LINE_LIMIT = 3;

export type VictorySummaryPageAdvance = {
  pageIndex: number;
  shouldExit: boolean;
};

export type EncounterAdvantagePartyMember = {
  level: number;
  offense?: number;
  stats?: { offense: number };
};

export type EncounterAdvantageEnemy = {
  level: number;
  hp?: unknown;
  maxHp?: number;
  bossFlag?: boolean;
};

export type InstantWinRewardOptions = {
  wallet?: number;
  roundNumber?: number;
  rng?: Rng;
  items?: Array<Pick<ItemData, "id" | "name">>;
  psi?: PsiData[];
};

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
// Chance a single-target enemy attack swings at a non-lead party member instead of
// the lead. Low so the lead still soaks most hits, but enough that a glass back-row
// member is a real liability you have to protect.
const ENEMY_OFF_LEAD_TARGET_CHANCE = 0.18;
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
const PRAY_HEAL_AMOUNT = 12;
const PRAY_PP_RESTORE_AMOUNT = 4;
const PRAY_DAMAGE_AMOUNT = 8;
const INSTANT_WIN_LEVEL_MARGIN = 8;
const NOOP_ENEMY_ACTION: BattleEnemy["actions"][number] = {
  id: 0,
  arg: 0,
  actionId: 0,
  actionType: 0,
  target: 0
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
  const offense = stat(options.offense ?? PLAYER_DEFAULTS.offense) + stat(options.statBonuses?.offense ?? 0);
  const defense = stat(options.defense ?? PLAYER_DEFAULTS.defense) + stat(options.statBonuses?.defense ?? 0);
  const speed = stat(options.speed ?? PLAYER_DEFAULTS.speed) + stat(options.statBonuses?.speed ?? 0);
  return {
    combatantId: stableCombatantId("party", 0),
    charId: PLAYER_DEFAULTS.charId,
    name: options.name ?? PLAYER_DEFAULTS.name,
    level: stat(options.level ?? PLAYER_DEFAULTS.level),
    experience: 0,
    maxHp,
    maxPp: PLAYER_DEFAULTS.maxPp,
    pp: PLAYER_DEFAULTS.pp,
    inventory: [...PLAYER_DEFAULTS.inventory],
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? PLAYER_DEFAULTS.hpRatePerSec),
    offense,
    defense,
    speed,
    stats: {
      offense,
      defense,
      speed,
      guts: stat(options.statBonuses?.guts ?? 0),
      vitality: stat(options.statBonuses?.vitality ?? 0),
      iq: stat(options.statBonuses?.iq ?? 0),
      luck: stat(options.statBonuses?.luck ?? 0)
    },
    money: 0,
    itemDropped: null,
    itemRarity: null,
    isEnemy: false
  };
}

export function buildEnemyCombatant(enemy: BattleEnemy, options: EnemyCombatantOptions = {}): Combatant {
  const maxHp = stat(enemy.hp);
  return {
    combatantId: stableCombatantId("enemy", 0),
    charId: enemy.id,
    name: enemy.name,
    level: stat(enemy.level),
    experience: stat(enemy.experience),
    maxHp,
    maxPp: 0,
    pp: 0,
    inventory: [],
    hp: createRollingMeter(maxHp, options.hpRatePerSec ?? ENEMY_HP_RATE_PER_SEC),
    offense: stat(enemy.offense),
    defense: stat(enemy.defense),
    speed: stat(options.speed ?? enemySpeed(enemy)),
    stats: {
      offense: stat(enemy.offense),
      defense: stat(enemy.defense),
      speed: stat(options.speed ?? enemySpeed(enemy)),
      guts: 0,
      vitality: 0,
      iq: 0,
      luck: 0
    },
    money: stat(enemy.money),
    itemDropped: enemy.itemDropped === null ? null : stat(enemy.itemDropped),
    itemRarity: enemy.itemRarity,
    isEnemy: true,
    actions: enemy.actions.map((action) => ({ ...action })),
    nextActionIndex: 0
  };
}

export function buildPartyCombatants(options: BattleStateOptions = {}): Combatant[] {
  const members = options.partyMembers?.slice(0, 4) ?? [];
  if (members.length > 0) {
    return assignCombatantIds(
      members.map((partyMember, index) => buildPlayerCombatant(playerOptionsAt(options, index, { partyMember }))),
      "party"
    );
  }

  const characters = options.characters?.characters.slice(0, 4) ?? [];
  if (characters.length > 0) {
    return assignCombatantIds(
      characters.map((character, index) => buildPlayerCombatant(playerOptionsAt(options, index, { character }))),
      "party"
    );
  }

  if (options.partyMember) {
    return assignCombatantIds([buildPlayerCombatant(playerOptionsAt(options, 0, { partyMember: options.partyMember }))], "party");
  }

  if (options.character) {
    return assignCombatantIds([buildPlayerCombatant(playerOptionsAt(options, 0, { character: options.character }))], "party");
  }

  return assignCombatantIds([buildPlayerCombatant(playerOptionsAt(options, 0))], "party");
}

export function createBattleState(enemies: BattleEnemy | BattleEnemy[], options: BattleStateOptions = {}): BattleState {
  const enemyList = Array.isArray(enemies) ? enemies : [enemies];
  const party = buildPartyCombatants(options);
  return {
    party,
    enemies: assignCombatantIds(
      enemyList.map((enemy, index) => buildEnemyCombatant(enemy, options.enemyOptions?.[index])),
      "enemy"
    ),
    wallet: stat(options.wallet ?? party.reduce((sum, member) => sum + member.money, 0)),
    roundNumber: Math.max(1, stat(options.roundNumber ?? 1))
  };
}

export function computeEncounterAdvantage(
  party: readonly EncounterAdvantagePartyMember[],
  enemies: readonly EncounterAdvantageEnemy[]
): EncounterAdvantage {
  if (party.length === 0 || enemies.length === 0) {
    return "normal";
  }
  if (enemies.some((enemy) => enemy.bossFlag)) {
    return "normal";
  }

  const partyOffenses = party.map(encounterPartyOffense);
  const minPartyOffense = Math.min(...partyOffenses);
  const averagePartyLevel = party.reduce((sum, member) => sum + stat(member.level), 0) / party.length;
  const totalEnemyMaxHp = enemies.reduce((sum, enemy) => sum + encounterEnemyMaxHp(enemy), 0);
  const maxEnemyLevel = Math.max(...enemies.map((enemy) => stat(enemy.level)));

  if (minPartyOffense >= totalEnemyMaxHp && averagePartyLevel >= maxEnemyLevel + INSTANT_WIN_LEVEL_MARGIN) {
    return "instantWin";
  }
  return "normal";
}

export function battleRngSeedForGroup(groupId: number, enemies: readonly Pick<BattleEnemy, "id">[]): number {
  return (stat(groupId) + 1) * 65537 + enemies.reduce((sum, enemy) => sum + stat(enemy.id), 0);
}

export function createBattleRng(seed: number): Rng {
  let state = stat(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function resolveInstantWinRewards(
  party: readonly Combatant[],
  enemies: readonly BattleEnemy[],
  options: InstantWinRewardOptions = {}
): { state: BattleState; summary: BattleVictorySummary } {
  const instantWinState: BattleState = {
    party: assignCombatantIds(party.map(cloneCombatant), "party"),
    enemies: assignCombatantIds(enemies.map((enemy) => defeatedCombatant(buildEnemyCombatant(enemy))), "enemy"),
    wallet: stat(options.wallet ?? party.reduce((sum, member) => sum + member.money, 0)),
    roundNumber: Math.max(1, stat(options.roundNumber ?? 1))
  };
  const rewardOptions: { rng?: Rng; items?: Array<Pick<ItemData, "id" | "name">>; psi?: PsiData[] } = {};
  if (options.rng) {
    rewardOptions.rng = options.rng;
  }
  if (options.items) {
    rewardOptions.items = options.items;
  }
  if (options.psi) {
    rewardOptions.psi = options.psi;
  }
  return applyVictoryRewards(instantWinState, rewardOptions);
}

export function commandsForCharId(charId: number): BattleCommand[] {
  switch (stat(charId)) {
    case 1:
      return [...PAULA_BATTLE_COMMANDS];
    case 2:
      return [...JEFF_BATTLE_COMMANDS];
    case 3:
      return [...POO_BATTLE_COMMANDS];
    case 0:
    default:
      return [...BATTLE_COMMANDS];
  }
}

export function damage(attacker: Combatant, defender: Combatant, rng: Rng): number {
  return applyDefendingDamageReduction(baseDamage(attacker, defender, rng), defender);
}

export function resolvePhysicalAttackDamage(
  attacker: Combatant,
  defender: Combatant,
  rng: Rng
): PhysicalAttackPipelineResult {
  // EB-style accuracy: a real baseline whiff chance, raised when the defender is
  // faster/luckier and lowered when the attacker is. The old formula (/500) maxed
  // near ~4% in Act-1 speed ranges, so attacks effectively never missed.
  const missChance = clamp(
    0.1 +
      (stat(defender.speed) - stat(attacker.speed)) / 120 +
      (stat(defender.stats.luck) - stat(attacker.stats.luck)) / 220,
    0.03,
    0.45
  );
  if (normalizedRoll(rng()) < missChance) {
    return {
      damage: 0,
      missed: true,
      smash: false,
      gutsSurvived: false
    };
  }

  const smashChance = Math.max(stat(attacker.stats.guts) / 500, 1 / 20);
  const smash = normalizedRoll(rng()) < smashChance;
  const rawDamage = smash
    ? Math.max(1, 4 * (stat(attacker.offense) - stat(defender.defense)))
    : baseDamage(attacker, defender, rng);
  let damageAmount = applyDefendingDamageReduction(rawDamage, defender);

  const defenderGuts = stat(defender.stats.guts);
  const lethal = defender.hp.target - damageAmount <= 0;
  if (lethal && defender.hp.target > 1 && defenderGuts > 0) {
    const surviveChance = Math.max(defenderGuts / 500, 1 / 20);
    if (normalizedRoll(rng()) < surviveChance) {
      damageAmount = defender.hp.target - 1;
      return {
        damage: damageAmount,
        missed: false,
        smash,
        gutsSurvived: true
      };
    }
  }

  return {
    damage: damageAmount,
    missed: false,
    smash,
    gutsSurvived: false
  };
}

function baseDamage(attacker: Combatant, defender: Combatant, rng: Rng): number {
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
  options: BattleTargetOptions = {}
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

  const defender = targetForActor(state, actor, options);
  if (!defender) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const defenderCombatant = combatantFor(state, defender);
  if (!defenderCombatant) {
    return { state, actor, defender: null, damage: 0, outcome: currentOutcome, skipped: true };
  }

  const attack = resolvePhysicalAttackDamage(attackerCombatant, defenderCombatant, rng);
  const nextState = attack.missed
    ? state
    : withCombatant(state, defender, applyDamage(defenderCombatant, attack.damage));
  return {
    state: nextState,
    actor,
    defender,
    damage: attack.missed ? attack.damage : shieldedDamage(defenderCombatant, attack.damage),
    outcome: outcome(nextState),
    skipped: false,
    missed: attack.missed,
    smash: attack.smash,
    gutsSurvived: attack.gutsSurvived
  };
}

export function resolveDefaultBashTurn(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy",
  rng: Rng
): TurnResolution {
  const actor = normalizeActor(actorInput);
  const targetIndex = defaultTargetIndexForActor(state, actor);
  return resolveTurn(state, actor, rng, targetIndex >= 0 ? { targetIndex } : {});
}

export function resolveDefendTurn(
  state: BattleState,
  actorInput: BattleActor | "player"
): BattleActionResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing" || actor.side !== "party") {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const defender = combatantFor(state, actor);
  if (!defender || !isCombatantAlive(defender)) {
    return blockedAction(state, actor, currentOutcome, "invalidActor");
  }

  const nextState = withCombatant(state, actor, {
    ...defender,
    defending: true
  });
  return {
    state: nextState,
    actor,
    target: actor,
    amount: 0,
    outcome: outcome(nextState),
    skipped: false
  };
}

export function resolveSpyTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  options: BattleTargetOptions = {}
): SpyResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing" || actor.side !== "party") {
    return blockedSpecialAction(state, actor, currentOutcome, "invalidActor", "");
  }

  const user = combatantFor(state, actor);
  if (!user || !isCombatantAlive(user)) {
    return blockedSpecialAction(state, actor, currentOutcome, "invalidActor", "");
  }

  const target = resolveTargetActor(state, "enemy", options);
  if (!target) {
    return blockedSpecialAction(state, actor, currentOutcome, "noTarget", "No target.");
  }

  const enemy = combatantFor(state, target);
  if (!enemy) {
    return blockedSpecialAction(state, actor, currentOutcome, "noTarget", "No target.");
  }

  return {
    state,
    actor,
    target,
    amount: 0,
    outcome: currentOutcome,
    skipped: false,
    message: spyMessage(enemy)
  };
}

export function resolvePrayTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  rng: Rng
): PrayResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing" || actor.side !== "party") {
    return blockedPrayAction(state, actor, currentOutcome, "invalidActor", "");
  }

  const user = combatantFor(state, actor);
  if (!user || !isCombatantAlive(user)) {
    return blockedPrayAction(state, actor, currentOutcome, "invalidActor", "");
  }

  // Bounded approximation: EarthBound Pray uses a large random effect table;
  // this slice keeps it to modest party/enemy effects plus a no-op.
  const roll = normalizedRoll(rng());
  if (roll < 0.35) {
    return applyPrayHeal(state, actor, user);
  }
  if (roll < 0.55) {
    return applyPrayPpRestore(state, actor, user);
  }
  if (roll < 0.85) {
    return applyPrayDamage(state, actor, user);
  }
  return {
    state,
    actor,
    target: actor,
    amount: 0,
    outcome: currentOutcome,
    skipped: false,
    effect: "nothing",
    targets: [],
    message: `${user.name} prayed. Nothing happened.`
  };
}

export function resolveMirrorTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  rng: Rng,
  options: BattleTargetOptions = {}
): MirrorResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing" || actor.side !== "party") {
    return blockedSpecialAction(state, actor, currentOutcome, "invalidActor", "");
  }

  const user = combatantFor(state, actor);
  if (!user || !isCombatantAlive(user)) {
    return blockedSpecialAction(state, actor, currentOutcome, "invalidActor", "");
  }

  const target = resolveTargetActor(state, "enemy", options);
  if (!target) {
    return blockedSpecialAction(state, actor, currentOutcome, "noTarget", "No target.");
  }

  const enemy = combatantFor(state, target);
  if (!enemy) {
    return blockedSpecialAction(state, actor, currentOutcome, "noTarget", "No target.");
  }

  // Bounded approximation: EarthBound Mirror can copy an enemy form over
  // multiple turns; this slice resolves it as one offense-mirrored strike.
  const mirroredUser = { ...user, offense: enemy.offense };
  const amount = damage(mirroredUser, enemy, rng);
  const nextState = withCombatant(state, target, applyDamage(enemy, amount));
  return {
    state: nextState,
    actor,
    target,
    amount,
    outcome: outcome(nextState),
    skipped: false,
    message: `${user.name} mirrored ${enemy.name} for ${amount} damage.`
  };
}

export function beginCombatantTurn(state: BattleState, actorInput: BattleActor | "player" | "enemy"): BattleState {
  const actor = normalizeActor(actorInput);
  const combatant = combatantFor(state, actor);
  if (!combatant?.defending) {
    return state;
  }
  return withCombatant(state, actor, {
    ...combatant,
    defending: false
  });
}

export function advanceBattleRound(state: BattleState): BattleState {
  return {
    ...clearPartyDefending(state),
    roundNumber: Math.max(1, stat(state.roundNumber) + 1)
  };
}

export function clearPartyDefending(state: BattleState): BattleState {
  if (!state.party.some((member) => member.defending)) {
    return state;
  }
  return {
    ...state,
    party: state.party.map((member) => member.defending ? { ...member, defending: false } : member)
  };
}

export function defaultTargetIndexForActor(
  state: BattleState,
  actorInput: BattleActor | "player" | "enemy"
): number {
  const actor = normalizeActor(actorInput);
  return actor.side === "party" ? firstLivingIndex(state.enemies) : firstLivingIndex(state.party);
}

export function shouldResetAutoFightRound(roundCursor: number, roundOrderLength: number): boolean {
  return roundCursor >= Math.max(0, roundOrderLength);
}

/**
 * Enemy action selection is deterministic round-robin over the configured
 * Action 1-4 slots. Duplicate slots stay duplicated, matching the source
 * table order without inferring hidden ROM weighting.
 */
export function selectEnemyAction(
  actions: BattleEnemy["actions"] | undefined,
  cursor: number
): EnemyActionSelection {
  const usableActions = actions && actions.length > 0 ? actions : [NOOP_ENEMY_ACTION];
  const actionIndex = modulo(stat(cursor), usableActions.length);
  const action = usableActions[actionIndex] ?? NOOP_ENEMY_ACTION;
  return {
    action,
    actionIndex,
    actionId: stat(action.actionId ?? action.id),
    ...(action.actionType !== undefined ? { actionType: stat(action.actionType) } : {}),
    ...(action.target !== undefined ? { target: stat(action.target) } : {})
  };
}

export function resolveEnemyActionTurn(
  state: BattleState,
  actorInput: BattleActor | "enemy",
  rng: Rng
): EnemyActionResolution {
  const actor = normalizeActor(actorInput);
  const currentOutcome = outcome(state);
  if (currentOutcome !== "ongoing" || actor.side !== "enemy") {
    return skippedEnemyAction(state, actor, currentOutcome, null);
  }

  const attacker = combatantFor(state, actor);
  if (!attacker || !isCombatantAlive(attacker)) {
    return skippedEnemyAction(state, actor, currentOutcome, null);
  }

  const selection = selectEnemyAction(attacker.actions, attacker.nextActionIndex ?? 0);
  let nextState = withCombatant(state, actor, {
    ...attacker,
    nextActionIndex: nextEnemyActionIndex(attacker.actions, selection.actionIndex)
  });
  // A confused enemy strikes a random side (may hit its own kind) instead of its scripted target.
  let targets: BattleActor[];
  if (hasStatus(attacker.statuses, "confused")) {
    const confusedPick = randomLivingActor(nextState, rng);
    targets = confusedPick ? [confusedPick] : [];
  } else {
    targets = targetActorsForEnemyAction(nextState, selection.target, rng);
  }
  const effectKind = enemyActionEffectKind(selection.actionType);
  if (targets.length === 0 || effectKind === "none" || effectKind === "assist" || effectKind === "unknown") {
    return {
      state: nextState,
      actor,
      targets: [],
      amount: 0,
      outcome: outcome(nextState),
      skipped: false,
      action: selection,
      effectKind
    };
  }

  let totalAmount = 0;
  let physicalAttempts = 0;
  let physicalMisses = 0;
  let anySmash = false;
  let anyGutsSurvived = false;
  for (const target of targets) {
    const targetCombatant = combatantFor(nextState, target);
    if (!targetCombatant || !isCombatantAlive(targetCombatant)) {
      continue;
    }
    if (effectKind === "physical") {
      const attack = resolvePhysicalAttackDamage(attacker, targetCombatant, rng);
      physicalAttempts += 1;
      physicalMisses += attack.missed ? 1 : 0;
      anySmash = anySmash || attack.smash;
      anyGutsSurvived = anyGutsSurvived || attack.gutsSurvived;
      totalAmount += attack.missed ? attack.damage : shieldedDamage(targetCombatant, attack.damage);
      if (!attack.missed) {
        nextState = withCombatant(nextState, target, applyDamage(targetCombatant, attack.damage));
      }
      continue;
    }

    const amount = enemyActionDamageAmount(effectKind, attacker, targetCombatant, rng);
    totalAmount += amount;
    nextState = withCombatant(nextState, target, applyDamage(targetCombatant, amount));
  }

  return {
    state: nextState,
    actor,
    targets,
    amount: totalAmount,
    outcome: outcome(nextState),
    skipped: false,
    action: selection,
    effectKind,
    ...(effectKind === "statusStub" ? { intendedStatus: "generic-ailment" as const } : {}),
    ...(effectKind === "physical" ? {
      missed: physicalAttempts > 0 && physicalMisses === physicalAttempts,
      smash: anySmash,
      gutsSurvived: anyGutsSurvived
    } : {})
  };
}

export function resolvePsiTurn(
  state: BattleState,
  actorInput: BattleActor | "player",
  psi: PsiData,
  rng: Rng,
  options: BattleTargetOptions = {}
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
  if (kind !== "offense" && kind !== "recovery" && !psi.effect) {
    return blockedAction(state, actor, currentOutcome, "unsupportedPsi");
  }

  const ppCost = psiPpCost(psi);
  if (caster.pp < ppCost) {
    return {
      ...blockedAction(state, actor, currentOutcome, "insufficientPp"),
      ppCost
    };
  }

  // Authored-effect PSI (assist: shield / stat buff / status inflict) reuse the item-effect
  // machinery, with the target side decided by the effect (itemEffectTargetSide).
  if (psi.effect) {
    const effectTarget = psi.effect.kind === "revive"
      ? resolveFaintedPartyTarget(state, options)
      : resolveTargetActor(state, itemEffectTargetSide(psi.effect), options);
    if (!effectTarget) {
      return { ...blockedAction(state, actor, currentOutcome, "noTarget"), ppCost };
    }
    const effectCombatant = combatantFor(state, effectTarget);
    if (!effectCombatant) {
      return { ...blockedAction(state, actor, currentOutcome, "noTarget"), ppCost };
    }
    const applied = applyItemEffectToCombatant(effectCombatant, psi.effect);
    let withEffect = withCombatant(state, effectTarget, applied.combatant);
    if (psi.effect.kind === "drainPp") {
      // Credit the drained PP back to the caster (PSI Magnet).
      const casterNow = combatantFor(withEffect, actor);
      if (casterNow) {
        withEffect = withCombatant(withEffect, actor, applyPpRestore(casterNow, applied.amount));
      }
    }
    const nextState = spendPp(withEffect, actor, ppCost);
    return {
      state: nextState,
      actor,
      target: effectTarget,
      amount: applied.amount,
      outcome: outcome(nextState),
      skipped: false,
      ppCost
    };
  }

  // Past the effect path, only kind-based (offense/recovery) PSI remain; re-narrow for the type.
  if (kind !== "offense" && kind !== "recovery") {
    return blockedAction(state, actor, currentOutcome, "unsupportedPsi");
  }
  const target = kind === "offense"
    ? resolveTargetActor(state, "enemy", options)
    : resolveTargetActor(state, "party", options);
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
  item: Pick<ItemData, "id" | "action" | "argument" | "miscFlags" | "effect">,
  options: { inventorySlot?: number } & BattleTargetOptions = {}
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

  // Revive acts on a FAINTED ally; every other item targets a living combatant.
  const target = effect.kind === "revive"
    ? resolveFaintedPartyTarget(state, options)
    : resolveTargetActor(state, itemEffectTargetSide(effect), options);
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
    amount: applied.amount,
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

export function applyVictoryRewards(
  state: BattleState,
  options: {
    rng?: Rng;
    items?: Array<Pick<ItemData, "id" | "name">>;
    psi?: PsiData[];
  } = {}
): { state: BattleState; summary: BattleVictorySummary } {
  const rng = options.rng ?? (() => 1);
  const defeatedEnemies = state.enemies.filter((enemy) => !isCombatantAlive(enemy));
  const expGained = defeatedEnemies.reduce((sum, enemy) => sum + stat(enemy.experience), 0);
  const moneyGained = defeatedEnemies.reduce((sum, enemy) => sum + stat(enemy.money), 0);
  let nextState: BattleState = {
    ...state,
    party: state.party.map(cloneCombatant),
    enemies: state.enemies.map(cloneCombatant),
    wallet: stat(state.wallet) + moneyGained,
    roundNumber: Math.max(1, stat(state.roundNumber))
  };

  const drops: BattleDropSummary[] = [];
  for (const enemy of defeatedEnemies) {
    const itemId = stat(enemy.itemDropped ?? 0);
    const rarity = enemy.itemRarity;
    if (itemId <= 0 || !rarity) {
      continue;
    }
    const roll = normalizedRoll(rng());
    if (roll >= dropChance(rarity)) {
      continue;
    }
    const recipientIndex = firstLivingIndex(nextState.party);
    const recipient = recipientIndex >= 0 ? nextState.party[recipientIndex] : nextState.party[0];
    if (!recipient) {
      continue;
    }
    const updatedRecipient = {
      ...recipient,
      inventory: [...recipient.inventory, itemId]
    };
    nextState = withCombatant(nextState, { side: "party", index: recipientIndex >= 0 ? recipientIndex : 0 }, updatedRecipient);
    drops.push({
      enemyId: enemy.charId,
      itemId,
      itemName: itemNameFor(itemId, options.items),
      recipientCharId: recipient.charId,
      roll,
      rarity
    });
  }

  const levelUps: BattleLevelUpSummary[] = [];
  nextState = {
    ...nextState,
    party: nextState.party.map((member) => {
      if (!isCombatantAlive(member)) {
        return member;
      }
      const applied = applyExperienceToCombatant(member, expGained, options.psi ?? []);
      if (applied.levelUp) {
        levelUps.push(applied.levelUp);
      }
      return applied.combatant;
    })
  };

  return {
    state: nextState,
    summary: {
      expGained,
      moneyGained,
      drops,
      levelUps
    }
  };
}

export function buildVictorySummaryViewModel(summary: BattleVictorySummary): BattleVictoryViewModel {
  const itemsFound = summary.drops.map((drop) => drop.itemName);
  const pageDetails = victorySummaryPageDetails(summary, itemsFound);
  const lines = pageDetails.flatMap((page) => page.lines);
  return {
    lines,
    pages: pageDetails.map((page) => [...page.lines]),
    pageDetails,
    expGained: summary.expGained,
    moneyGained: summary.moneyGained,
    itemsFound,
    levelUps: summary.levelUps
  };
}

function victorySummaryPageDetails(summary: BattleVictorySummary, itemsFound: string[]): BattleVictoryViewPage[] {
  const pages: BattleVictoryViewPage[] = [{
    kind: "tally",
    lines: [
      `${summary.expGained} EXP`,
      `You got $${summary.moneyGained}`,
      itemsFound.length > 0 ? `Found ${itemsFound.join(", ")}` : "Found no items"
    ]
  }];

  summary.levelUps.forEach((levelUp, levelUpIndex) => {
    pages.push({
      kind: "level-up",
      highlighted: true,
      levelUpIndex,
      lines: [
        `${levelUp.name} LEVEL UP!`,
        `Lv ${levelUp.fromLevel} -> ${levelUp.toLevel} ↑`
      ]
    });

    const statLines = levelUp.statChanges.map((change) =>
      `${levelUpStatLabel(change.stat)} ${change.before} -> ${change.after} ↑`
    );
    for (const page of paginateVictorySummaryLines(statLines)) {
      pages.push({
        kind: "stat-gains",
        levelUpIndex,
        lines: page
      });
    }

    levelUp.learnedSkills.forEach((skill, learnedSkillIndex) => {
      pages.push({
        kind: "learned-psi",
        highlighted: true,
        levelUpIndex,
        learnedSkillIndex,
        lines: [learnedPsiLine(skill.name)]
      });
    });
  });

  return pages;
}

function learnedPsiLine(name: string): string {
  const trimmed = name.trim();
  return /^psi\b/i.test(trimmed) ? `Learned ${trimmed}!` : `Learned PSI ${trimmed}!`;
}

export function paginateVictorySummaryLines(
  lines: string[],
  linesPerPage = VICTORY_SUMMARY_PAGE_LINE_LIMIT
): string[][] {
  const pageSize = Math.max(1, Math.floor(linesPerPage));
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }
  return pages;
}

export function advanceVictorySummaryPageIndex(
  currentPageIndex: number,
  pageCount: number
): VictorySummaryPageAdvance {
  const count = Math.max(1, Math.floor(pageCount));
  const current = clamp(Math.floor(currentPageIndex), 0, count - 1);
  if (current >= count - 1) {
    return { pageIndex: current, shouldExit: true };
  }
  return { pageIndex: current + 1, shouldExit: false };
}

export function tickBattleMeters(state: BattleState, dtMs: number): BattleState {
  return {
    party: state.party.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) })),
    enemies: state.enemies.map((combatant) => ({ ...combatant, hp: tick(combatant.hp, dtMs) })),
    wallet: state.wallet,
    roundNumber: state.roundNumber
  };
}

export function isPendingPartyMortalWound(combatant: Pick<Combatant, "hp" | "isEnemy">): boolean {
  return !combatant.isEnemy && combatant.hp.target <= 0 && combatant.hp.displayed > 0;
}

export function settlePendingPartyMortalWounds(state: BattleState): { state: BattleState; rescuedCount: number } {
  let rescuedCount = 0;
  const party = state.party.map((combatant) => {
    if (!isPendingPartyMortalWound(combatant)) {
      return combatant;
    }
    rescuedCount += 1;
    const currentHp = clamp(Math.floor(combatant.hp.displayed), 1, Math.max(1, stat(combatant.maxHp)));
    return {
      ...combatant,
      hp: {
        ...combatant.hp,
        displayed: currentHp,
        target: currentHp,
        isRolling: false,
        stepRemainder: 0
      }
    };
  });
  return {
    state: rescuedCount > 0 ? { ...state, party } : state,
    rescuedCount
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

export function combatantIdForActor(state: BattleState, actorInput: BattleActor | "player" | "enemy"): string | undefined {
  return combatantAt(state, actorInput)?.combatantId;
}

export function resolveTargetActor(
  state: BattleState,
  side: BattleSide,
  options: BattleTargetOptions = {}
): BattleActor | null {
  const combatants = side === "party" ? state.party : state.enemies;
  return livingTarget(combatants, side, options.targetIndex, options.targetCombatantId);
}

/** Resolve a FAINTED party member (the specified index if fainted, else the first fainted). Used by revive. */
function resolveFaintedPartyTarget(state: BattleState, options: BattleTargetOptions): BattleActor | null {
  const { targetIndex } = options;
  if (targetIndex !== undefined && state.party[targetIndex] && !isCombatantAlive(state.party[targetIndex])) {
    return { side: "party", index: targetIndex };
  }
  const firstFainted = state.party.findIndex((combatant) => !isCombatantAlive(combatant));
  return firstFainted >= 0 ? { side: "party", index: firstFainted } : null;
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

/**
 * The damage number to NARRATE for an attack on `defender`: the rolled damage reduced by the
 * defender's shield, so the displayed number matches the HP actually lost in applyDamage.
 * (For unshielded defenders this is the rolled damage unchanged.)
 */
function shieldedDamage(defender: Combatant, rolledDamage: number): number {
  return Math.floor(Math.max(0, rolledDamage) * incomingDamageScale(defender.statuses));
}

function applyDamage(combatant: Combatant, amount: number, options: { ignoreShield?: boolean } = {}): Combatant {
  const scale = options.ignoreShield ? 1 : incomingDamageScale(combatant.statuses);
  const target = Math.max(0, combatant.hp.target - Math.max(0, Math.floor(amount * scale)));
  const hp = setTarget(combatant.hp, target);
  if (combatant.isEnemy && target <= 0) {
    return {
      ...combatant,
      hp: {
        ...hp,
        displayed: 0,
        target: 0,
        isRolling: false,
        stepRemainder: 0
      }
    };
  }
  return {
    ...combatant,
    hp
  };
}

function applyHeal(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    hp: setTarget(combatant.hp, Math.min(combatant.maxHp, combatant.hp.target + Math.max(0, Math.floor(amount))))
  };
}

function applyPpRestore(combatant: Combatant, amount: number): Combatant {
  return {
    ...combatant,
    pp: Math.min(combatant.maxPp, combatant.pp + Math.max(0, Math.floor(amount)))
  };
}

/**
 * Battle status turn-gate for a combatant: paralyzed/asleep skip the action. Only
 * consumes an rng roll when an asleep combatant might wake, so combatants without
 * statuses never perturb the rng sequence. Returns the (possibly woke-updated) state.
 */
export function resolveCombatantTurnGate(
  state: BattleState,
  actor: BattleActor,
  rng: Rng
): { state: BattleState; canAct: boolean; reason?: "paralyzed" | "asleep" | "woke" } {
  const combatant = combatantFor(state, actor);
  if (!combatant?.statuses?.length) {
    return { state, canAct: true };
  }
  const needsWakeRoll = !hasStatus(combatant.statuses, "paralyzed") && hasStatus(combatant.statuses, "asleep");
  const gate = resolveTurnGate(combatant.statuses, needsWakeRoll ? normalizedRoll(rng()) : 0);
  const nextState = gate.statuses === combatant.statuses
    ? state
    : withCombatant(state, actor, withStatuses(combatant, gate.statuses));
  return { state: nextState, canAct: gate.canAct, ...(gate.reason ? { reason: gate.reason } : {}) };
}

/**
 * End-of-turn status tick for the acting combatant: poison HP loss + duration decay.
 * No-op for combatants without statuses.
 */
export function applyEndOfTurnStatusTick(
  state: BattleState,
  actor: BattleActor
): { state: BattleState; hpLoss: number; name?: string } {
  const combatant = combatantFor(state, actor);
  if (!combatant || !isCombatantAlive(combatant) || !combatant.statuses?.length) {
    return { state, hpLoss: 0, ...(combatant ? { name: combatant.name } : {}) };
  }
  const result = tickStatuses(combatant.statuses, combatant.maxHp);
  let next = withStatuses(combatant, result.statuses);
  if (result.hpLoss > 0) {
    // Poison is internal damage; the shield only mitigates incoming attacks.
    next = applyDamage(next, result.hpLoss, { ignoreShield: true });
  }
  return { state: withCombatant(state, actor, next), hpLoss: result.hpLoss, name: combatant.name };
}

function withStatuses(combatant: Combatant, statuses: StatusState): Combatant {
  return { ...combatant, statuses: statuses.length > 0 ? statuses : undefined };
}

function combatantFor(state: BattleState, actor: BattleActor): Combatant | undefined {
  return actor.side === "party" ? state.party[actor.index] : state.enemies[actor.index];
}

function targetForActor(state: BattleState, actor: BattleActor, options: BattleTargetOptions): BattleActor | null {
  if (options.targetSide) {
    return resolveTargetActor(state, options.targetSide, options);
  }
  if (actor.side === "party") {
    return resolveTargetActor(state, "enemy", options);
  }

  // Legacy fallback for direct resolveTurn callers; BattleScene uses
  // resolveEnemyActionTurn for table-driven enemy AI.
  return resolveTargetActor(state, "party", options);
}

/**
 * If `actor` is confused, returns target options pointing at a uniformly-random LIVING
 * combatant on either side (the attacker may strike an ally or itself). Returns null when
 * the actor is not confused — and in that case NO rng roll is consumed, so the sequence is
 * undisturbed for unconfused attackers.
 */
/** A uniformly-random LIVING combatant on either side (used by confusion targeting). */
function randomLivingActor(state: BattleState, rng: Rng): BattleActor | null {
  const candidates: BattleActor[] = [];
  state.party.forEach((c, index) => {
    if (isCombatantAlive(c)) {
      candidates.push({ side: "party", index });
    }
  });
  state.enemies.forEach((c, index) => {
    if (isCombatantAlive(c)) {
      candidates.push({ side: "enemy", index });
    }
  });
  if (candidates.length === 0) {
    return null;
  }
  return candidates[Math.min(candidates.length - 1, Math.floor(normalizedRoll(rng()) * candidates.length))];
}

export function confusedTargetOptions(state: BattleState, actor: BattleActor, rng: Rng): BattleTargetOptions | null {
  const combatant = combatantFor(state, actor);
  if (!combatant || !hasStatus(combatant.statuses, "confused")) {
    return null;
  }
  const pick = randomLivingActor(state, rng);
  return pick ? { targetSide: pick.side, targetIndex: pick.index } : null;
}

function nextEnemyActionIndex(actions: BattleEnemy["actions"] | undefined, currentActionIndex: number): number {
  const length = actions && actions.length > 0 ? actions.length : 1;
  return modulo(currentActionIndex + 1, length);
}

function targetActorsForEnemyAction(state: BattleState, target: number | undefined, rng: Rng): BattleActor[] {
  const living = state.party.flatMap((combatant, index) =>
    isCombatantAlive(combatant) ? [{ side: "party" as const, index }] : []
  );
  if (living.length === 0) {
    return [];
  }

  switch (target) {
    case 1: {
      // Single-target enemy attacks nominally hit the lead, but occasionally swing
      // at someone else so a fragile back-row member (e.g. Paula, hp30) isn't
      // perfectly safe behind the tank. Lead stays the heavy favourite.
      if (living.length > 1 && normalizedRoll(rng()) < ENEMY_OFF_LEAD_TARGET_CHANCE) {
        const offLead = living.slice(1);
        const index = Math.min(offLead.length - 1, Math.floor(normalizedRoll(rng()) * offLead.length));
        return [offLead[index]];
      }
      return [living[0]];
    }
    case 2: {
      const index = Math.min(living.length - 1, Math.floor(normalizedRoll(rng()) * living.length));
      return [living[index]];
    }
    case 3:
    case 4:
      return living;
    default:
      return [];
  }
}

function enemyActionEffectKind(actionType: number | undefined): EnemyActionEffectKind {
  switch (actionType) {
    case 0:
      return "none";
    case 1:
    case 2:
      return "physical";
    case 3:
      return "psi";
    case 4:
      return "assist";
    case 5:
      return "statusStub";
    default:
      return "unknown";
  }
}

function enemyActionDamageAmount(
  effectKind: EnemyActionEffectKind,
  attacker: Combatant,
  defender: Combatant,
  rng: Rng
): number {
  const base = baseDamage(attacker, defender, rng);
  if (effectKind === "psi") {
    return applyDefendingDamageReduction(Math.max(1, Math.floor(base * 0.85)), defender);
  }
  if (effectKind === "statusStub") {
    // Code Address owns exact status/magnitude. Until that ROM routine is
    // decoded, status-like actions are represented as small offense damage
    // plus an intendedStatus marker in the pure result.
    return applyDefendingDamageReduction(Math.max(1, Math.floor(base * 0.35)), defender);
  }
  return applyDefendingDamageReduction(base, defender);
}

function applyDefendingDamageReduction(amount: number, defender: Combatant): number {
  const finalAmount = Math.max(1, Math.floor(amount));
  return defender.defending ? Math.max(1, Math.floor(finalAmount / 2)) : finalAmount;
}

function livingTarget(
  combatants: Combatant[],
  side: BattleSide,
  requestedIndex?: number,
  requestedCombatantId?: string
): BattleActor | null {
  if (requestedCombatantId) {
    const idIndex = combatants.findIndex((combatant) => combatant.combatantId === requestedCombatantId);
    if (idIndex >= 0 && isCombatantAlive(combatants[idIndex])) {
      return { side, index: idIndex };
    }
    const index = firstLivingIndex(combatants);
    return index >= 0 ? { side, index } : null;
  }

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

function stableCombatantId(side: BattleSide, index: number): string {
  return `${side}:${stat(index)}`;
}

function assignCombatantIds(combatants: Combatant[], side: BattleSide): Combatant[] {
  return combatants.map((combatant, index) => ({
    ...combatant,
    combatantId: stableCombatantId(side, index)
  }));
}

function livingActors(combatants: Combatant[], side: BattleSide): BattleActor[] {
  return combatants.flatMap((combatant, index) => (isCombatantAlive(combatant) ? [{ side, index }] : []));
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

function applyPrayHeal(state: BattleState, actor: BattleActor, user: Combatant): PrayResolution {
  const targets = livingActors(state.party, "party");
  let nextState = state;
  let totalAmount = 0;
  for (const target of targets) {
    const combatant = combatantFor(nextState, target);
    if (!combatant) {
      continue;
    }
    const nextCombatant = applyHeal(combatant, PRAY_HEAL_AMOUNT);
    totalAmount += Math.max(0, nextCombatant.hp.target - combatant.hp.target);
    nextState = withCombatant(nextState, target, nextCombatant);
  }
  return {
    state: nextState,
    actor,
    target: actor,
    amount: totalAmount,
    outcome: outcome(nextState),
    skipped: false,
    effect: "healParty",
    targets,
    message: `${user.name} prayed. The party recovered ${totalAmount} HP.`
  };
}

function applyPrayPpRestore(state: BattleState, actor: BattleActor, user: Combatant): PrayResolution {
  const targets = livingActors(state.party, "party");
  let nextState = state;
  let totalAmount = 0;
  for (const target of targets) {
    const combatant = combatantFor(nextState, target);
    if (!combatant) {
      continue;
    }
    const nextCombatant = applyPpRestore(combatant, PRAY_PP_RESTORE_AMOUNT);
    totalAmount += Math.max(0, nextCombatant.pp - combatant.pp);
    nextState = withCombatant(nextState, target, nextCombatant);
  }
  return {
    state: nextState,
    actor,
    target: actor,
    amount: totalAmount,
    outcome: outcome(nextState),
    skipped: false,
    effect: "restorePp",
    targets,
    message: `${user.name} prayed. The party recovered ${totalAmount} PP.`
  };
}

function applyPrayDamage(state: BattleState, actor: BattleActor, user: Combatant): PrayResolution {
  const targets = livingActors(state.enemies, "enemy");
  let nextState = state;
  let totalAmount = 0;
  for (const target of targets) {
    const combatant = combatantFor(nextState, target);
    if (!combatant) {
      continue;
    }
    totalAmount += PRAY_DAMAGE_AMOUNT;
    nextState = withCombatant(nextState, target, applyDamage(combatant, PRAY_DAMAGE_AMOUNT));
  }
  return {
    state: nextState,
    actor,
    target: actor,
    amount: totalAmount,
    outcome: outcome(nextState),
    skipped: false,
    effect: "damageEnemies",
    targets,
    message: `${user.name} prayed. The enemies took ${totalAmount} damage.`
  };
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

function blockedSpecialAction(
  state: BattleState,
  actor: BattleActor,
  currentOutcome: BattleOutcome,
  blockedReason: BattleActionBlockReason,
  message: string
): BattleActionResolution & { message: string } {
  return {
    ...blockedAction(state, actor, currentOutcome, blockedReason),
    message
  };
}

function blockedPrayAction(
  state: BattleState,
  actor: BattleActor,
  currentOutcome: BattleOutcome,
  blockedReason: BattleActionBlockReason,
  message: string
): PrayResolution {
  return {
    ...blockedAction(state, actor, currentOutcome, blockedReason),
    effect: "nothing",
    targets: [],
    message
  };
}

function spyMessage(enemy: Combatant): string {
  return `${enemy.name} HP ${enemy.hp.target}/${enemy.maxHp} Off ${enemy.offense} Def ${enemy.defense}.`;
}

function skippedEnemyAction(
  state: BattleState,
  actor: BattleActor,
  currentOutcome: BattleOutcome,
  action: EnemyActionSelection | null
): EnemyActionResolution {
  return {
    state,
    actor,
    targets: [],
    amount: 0,
    outcome: currentOutcome,
    skipped: true,
    action,
    effectKind: "unknown"
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
  amount: number;
} {
  if (effect.kind === "cureStatus") {
    return { combatant: withStatuses(combatant, cureStatus(combatant.statuses, effect.ailment)), amount: 0 };
  }
  if (effect.kind === "inflictStatus") {
    return {
      combatant: withStatuses(combatant, inflictStatus(combatant.statuses, effect.ailment, {
        ...(effect.remaining !== undefined ? { remaining: effect.remaining } : {}),
        ...(effect.magnitude !== undefined ? { magnitude: effect.magnitude } : {})
      })),
      amount: 0
    };
  }
  if (effect.kind === "damage") {
    const before = combatant.hp.target;
    const damaged = applyDamage(combatant, effect.amount);
    return { combatant: damaged, amount: before - damaged.hp.target };
  }
  if (effect.kind === "drainPp") {
    // Drain the target's PP; the caller credits the drained amount to the caster.
    const drained = Math.min(combatant.pp, effect.amount);
    return { combatant: { ...combatant, pp: combatant.pp - drained }, amount: drained };
  }
  if (effect.kind === "buffStat") {
    // Battle-scoped stat change (combatants live only for the fight). Negative = debuff; clamp at 0.
    return applyBattleStatBuff(combatant, effect);
  }
  if (effect.kind === "permStat") {
    // Permanent growth (capsules): raise the BASE stat so applyBattleResult's writeback persists it
    // past the fight (and it re-derives into the effective combatant stats next battle).
    const next = Math.max(0, combatant.stats[effect.stat] + effect.amount);
    return { combatant: { ...combatant, stats: { ...combatant.stats, [effect.stat]: next } }, amount: effect.amount };
  }
  if (effect.kind === "revive") {
    if (isCombatantAlive(combatant)) {
      return { combatant, amount: 0 };
    }
    return { combatant: applyHeal(combatant, effect.amount), amount: effect.amount };
  }
  const applied = applyUseEffectToVitals(combatantVitals(combatant), effect);
  return {
    combatant: {
      ...combatant,
      hp: applied.vitals.hp,
      pp: applied.vitals.pp
    },
    amount: Math.max(0, applied.nextValue - applied.previousValue)
  };
}

function applyBattleStatBuff(
  combatant: Combatant,
  effect: Extract<ItemUseEffect, { kind: "buffStat" }>
): { combatant: Combatant; amount: number } {
  const current = effect.stat === "guts" ? combatant.stats.guts : combatant[effect.stat];
  const next = Math.max(0, Math.floor((current + (effect.amount ?? 0)) * (effect.multiplier ?? 1)));
  if (effect.stat === "guts") {
    return {
      combatant: { ...combatant, stats: { ...combatant.stats, guts: next } },
      amount: next - current
    };
  }
  return {
    combatant: { ...combatant, [effect.stat]: next },
    amount: next - current
  };
}

function applyExperienceToCombatant(combatant: Combatant, expGained: number, psiList: PsiData[]): {
  combatant: Combatant;
  levelUp?: BattleLevelUpSummary;
} {
  const currentLevel = Math.max(1, stat(combatant.level));
  const nextExperience = stat(combatant.experience) + stat(expGained);
  if (!combatant.growth || !combatant.expTable || combatant.expTable.length === 0) {
    return {
      combatant: {
        ...combatant,
        experience: nextExperience
      }
    };
  }

  const nextLevel = levelForExperience(combatant.expTable, nextExperience, currentLevel);
  if (nextLevel <= currentLevel) {
    return {
      combatant: {
        ...combatant,
        experience: nextExperience
      }
    };
  }

  const calculated = calculateStatsAtLevel(combatant.growth, nextLevel, {
    level: currentLevel,
    maxHp: combatant.maxHp,
    maxPp: combatant.maxPp,
    stats: combatant.stats
  });
  const nextStats = maxStats(combatant.stats, calculated.stats);
  const nextMaxHp = Math.max(combatant.maxHp, calculated.maxHp);
  const nextMaxPp = Math.max(combatant.maxPp, calculated.maxPp);
  const statGains = {
    offense: nextStats.offense - combatant.stats.offense,
    defense: nextStats.defense - combatant.stats.defense,
    speed: nextStats.speed - combatant.stats.speed,
    guts: nextStats.guts - combatant.stats.guts,
    vitality: nextStats.vitality - combatant.stats.vitality,
    iq: nextStats.iq - combatant.stats.iq,
    luck: nextStats.luck - combatant.stats.luck,
    maxHp: nextMaxHp - combatant.maxHp,
    maxPp: nextMaxPp - combatant.maxPp
  };

  const maxHpGain = Math.max(0, statGains.maxHp);
  const maxPpGain = Math.max(0, statGains.maxPp);
  const nextCombatant: Combatant = {
    ...combatant,
    level: nextLevel,
    experience: nextExperience,
    maxHp: nextMaxHp,
    maxPp: nextMaxPp,
    pp: Math.min(nextMaxPp, combatant.pp + maxPpGain),
    hp: {
      ...combatant.hp,
      displayed: Math.min(nextMaxHp, combatant.hp.displayed + maxHpGain),
      target: Math.min(nextMaxHp, combatant.hp.target + maxHpGain),
      isRolling: false
    },
    offense: nextStats.offense,
    defense: nextStats.defense,
    speed: nextStats.speed,
    stats: nextStats
  };
  const learnedSkills = newlyLearnedSkillsForCombatant(psiList, combatant, nextCombatant);

  return {
    combatant: nextCombatant,
    levelUp: {
      charId: combatant.charId,
      name: combatant.name,
      fromLevel: currentLevel,
      toLevel: nextLevel,
      statGains,
      statChanges: levelUpStatChanges(combatant, {
        stats: nextStats,
        maxHp: nextMaxHp,
        maxPp: nextMaxPp
      }),
      learnedSkills
    }
  };
}

function newlyLearnedSkillsForCombatant(
  psiList: PsiData[],
  before: Pick<Combatant, "charId" | "level">,
  after: Pick<Combatant, "charId" | "level">
): BattleLearnedSkillSummary[] {
  if (psiList.length === 0) {
    return [];
  }
  const beforeIds = new Set(learnedPsiForCombatant(psiList, before).map((psi) => stat(psi.id)));
  return learnedPsiForCombatant(psiList, after)
    .filter((psi) => !beforeIds.has(stat(psi.id)))
    .map((psi) => ({
      psiId: stat(psi.id),
      name: learnedSkillName(psi)
    }));
}

function learnedSkillName(psi: Pick<PsiData, "id" | "name">): string {
  const trimmed = psi.name.trim();
  return trimmed.length > 0 ? trimmed : `[psi ${stat(psi.id)}]`;
}

function encounterPartyOffense(member: EncounterAdvantagePartyMember): number {
  return stat(member.offense ?? member.stats?.offense ?? 0);
}

function encounterEnemyMaxHp(enemy: EncounterAdvantageEnemy): number {
  if (enemy.maxHp !== undefined) {
    return stat(enemy.maxHp);
  }
  return typeof enemy.hp === "number" ? stat(enemy.hp) : 0;
}

function defeatedCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    hp: {
      ...combatant.hp,
      displayed: 0,
      target: 0,
      isRolling: false,
      stepRemainder: 0
    }
  };
}

function maxStats(left: PartyMemberStats, right: PartyMemberStats): PartyMemberStats {
  return {
    offense: Math.max(left.offense, right.offense),
    defense: Math.max(left.defense, right.defense),
    speed: Math.max(left.speed, right.speed),
    guts: Math.max(left.guts, right.guts),
    vitality: Math.max(left.vitality, right.vitality),
    iq: Math.max(left.iq, right.iq),
    luck: Math.max(left.luck, right.luck)
  };
}

const LEVEL_UP_STAT_KEYS = [
  "offense",
  "defense",
  "speed",
  "guts",
  "vitality",
  "iq",
  "luck",
  "maxHp",
  "maxPp"
] as const satisfies readonly BattleLevelUpStatKey[];

type LevelUpStatSnapshot = {
  stats: PartyMemberStats;
  maxHp: number;
  maxPp: number;
};

function levelUpStatChanges(
  before: LevelUpStatSnapshot,
  after: LevelUpStatSnapshot
): BattleLevelUpStatChange[] {
  return LEVEL_UP_STAT_KEYS
    .map((key) => {
      const beforeValue = levelUpStatValue(before, key);
      const afterValue = levelUpStatValue(after, key);
      return {
        stat: key,
        before: beforeValue,
        after: afterValue,
        gain: afterValue - beforeValue
      };
    })
    .filter((change) => change.gain > 0);
}

function levelUpStatValue(snapshot: LevelUpStatSnapshot, key: BattleLevelUpStatKey): number {
  if (key === "maxHp") {
    return stat(snapshot.maxHp);
  }
  if (key === "maxPp") {
    return stat(snapshot.maxPp);
  }
  return stat(snapshot.stats[key]);
}

function levelUpStatLabel(key: BattleLevelUpStatKey): string {
  switch (key) {
    case "offense":
      return "Offense";
    case "defense":
      return "Defense";
    case "speed":
      return "Speed";
    case "guts":
      return "Guts";
    case "vitality":
      return "Vitality";
    case "iq":
      return "IQ";
    case "luck":
      return "Luck";
    case "maxHp":
      return "Max HP";
    case "maxPp":
      return "Max PP";
  }
}

function cloneCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    inventory: [...combatant.inventory],
    ...(combatant.actions ? { actions: combatant.actions.map((action) => ({ ...action })) } : {}),
    hp: { ...combatant.hp },
    stats: { ...combatant.stats },
    ...(combatant.growth ? { growth: { ...combatant.growth } } : {}),
    ...(combatant.expTable ? { expTable: combatant.expTable.map((entry) => ({ ...entry })) } : {}),
    ...(combatant.itemRarity ? { itemRarity: { ...combatant.itemRarity } } : {})
  };
}

function dropChance(rarity: NonNullable<BattleEnemy["itemRarity"]>): number {
  if (rarity.denominator <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, rarity.numerator / rarity.denominator));
}

function itemNameFor(itemId: number, items: Array<Pick<ItemData, "id" | "name">> | undefined): string {
  return items?.find((item) => stat(item.id) === itemId)?.name || `[item ${itemId}]`;
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

function clamp(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return minValue;
  }
  return Math.min(maxValue, Math.max(minValue, value));
}

function modulo(value: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((value % length) + length) % length;
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
