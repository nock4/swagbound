import type { ItemData, PsiData } from "@eb/schemas";
import { decodeItemUseEffect } from "./partyState";
import {
  beginCombatantTurn,
  combatantAt,
  commandsForCharId,
  defaultTargetIndexForActor,
  firstLivingIndex,
  isCombatantAlive,
  learnedPsiForCombatant,
  psiBattleKind,
  psiPpCost,
  resolveDefaultBashTurn,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolveMirrorTurn,
  resolvePrayTurn,
  resolvePsiTurn,
  resolveSpyTurn,
  resolveTurn,
  withCombatant,
  type BattleActionResolution,
  type BattleActor,
  type BattleCommand,
  type BattleSide,
  type BattleState,
  type EnemyActionResolution,
  type MirrorResolution,
  type PrayResolution,
  type Rng,
  type SpyResolution,
  type TurnResolution
} from "./battleLogic";
import { commandTargetSelectionPlan } from "./battleMenuFlow";

export type QueuedCommandTarget = {
  side: BattleSide;
  index: number;
};

export type QueuedCommand = {
  partySlot: number;
  command: BattleCommand;
  target?: QueuedCommandTarget;
  psiId?: number;
  itemId?: number;
};

export type BattleRoundResources = {
  psi?: readonly PsiData[];
  items?: readonly BattleRoundItemData[];
};

export type BattleRoundItemData = Pick<ItemData, "id" | "name" | "action" | "argument" | "miscFlags" | "effect">;

export type BattleRoundStepResolution =
  | TurnResolution
  | EnemyActionResolution
  | BattleActionResolution
  | SpyResolution
  | PrayResolution
  | MirrorResolution;

export type BattleRoundStepNarrationKind =
  | "attack"
  | "psi"
  | "item"
  | "defend"
  | "pray"
  | "spy"
  | "mirror"
  | "run"
  | "skip";

export type BattleRoundStepNarrationDetails = {
  kind: BattleRoundStepNarrationKind;
  attackerName: string;
  targetName?: string;
  moveName?: string;
  psiId?: number;
  itemName?: string;
  message?: string;
  damage?: number;
  healed?: number;
  ppRestored?: number;
  missed?: boolean;
  fled?: boolean;
  defended?: boolean;
  targetDied?: boolean;
};

export type BattleRoundStepResult = {
  state: BattleState;
  message: string;
  actor: BattleActor;
  skipped: boolean;
  fled?: boolean;
  resolution?: BattleRoundStepResolution;
  details: BattleRoundStepNarrationDetails;
};

export type BattleRoundRules = {
  unescapableGroups?: readonly number[];
};

export type BattleRoundStartPriorityOptions = {
  groupId?: number;
  rules?: BattleRoundRules;
  minRunSuccessChance?: number;
};

export type BattleRoundRunAttempt = {
  attempted: boolean;
  actor: BattleActor;
  groupId?: number;
  blocked: boolean;
  chance: number;
  roll: number | null;
  success: boolean;
};

export type BattleRoundStartPriorityResult = {
  state: BattleState;
  queued: QueuedCommand[];
  priorityStep?: BattleRoundStepResult;
  runAttempt?: BattleRoundRunAttempt;
};

export type BattleRoundInputSubmenu = "command" | "psi" | "goods" | "target-enemy" | "target-ally";

export type BattleRoundInputState = {
  memberCursor: number;
  submenu: BattleRoundInputSubmenu;
  selectionIndex: number;
  queue: QueuedCommand[];
  pending?: QueuedCommand;
};

export type BattleRoundInputEvent =
  | { kind: "move"; delta: number }
  | { kind: "confirm" }
  | { kind: "cancel" }
  | { kind: "auto" };

export type BattleRoundInputContext = {
  state: BattleState;
  psi?: readonly PsiData[];
  items?: readonly BattleRoundItemData[];
};

export type BattleRoundInputTransition = {
  input: BattleRoundInputState;
  complete: boolean;
};

export const MIN_RUN_SUCCESS_CHANCE = 0.05;

export function partyInputOrder(state: BattleState): BattleActor[] {
  return state.party.flatMap((combatant, index) =>
    isCombatantAlive(combatant) ? [{ side: "party" as const, index }] : []
  );
}

export function jitteredTurnOrder(
  state: BattleState,
  queued: QueuedCommand[],
  rng: Rng
): BattleActor[] {
  const queuedPartySlots = new Set(queued.map((command) => command.partySlot));
  const actors = [
    ...state.party.flatMap((combatant, index) =>
      queuedPartySlots.has(index) && isCombatantAlive(combatant)
        ? [{ side: "party" as const, index }]
        : []
    ),
    ...state.enemies.flatMap((combatant, index) =>
      isCombatantAlive(combatant) ? [{ side: "enemy" as const, index }] : []
    )
  ];
  const scored = actors.map((actor) => {
    const speed = stat(combatantAt(state, actor)?.speed ?? 0);
    return {
      actor,
      score: speed * (0.5 + normalizedRoll(rng()))
    };
  });

  return scored
    .sort((left, right) => {
      const speedDelta = right.score - left.score;
      return speedDelta !== 0 ? speedDelta : roundTieBreak(left.actor, right.actor);
    })
    .map((entry) => entry.actor);
}

export function applyRoundStartGuardStance(
  state: BattleState,
  queued: readonly QueuedCommand[]
): BattleState {
  let nextState = state;
  for (const entry of queued) {
    if (entry.command !== "DEFEND") {
      continue;
    }
    const actor = { side: "party" as const, index: entry.partySlot };
    const combatant = combatantAt(nextState, actor);
    if (!combatant || !isCombatantAlive(combatant) || combatant.defending) {
      continue;
    }
    nextState = withCombatant(nextState, actor, {
      ...combatant,
      defending: true
    });
  }
  return nextState;
}

export function resolveRoundStartPriority(
  state: BattleState,
  queued: readonly QueuedCommand[],
  rng: Rng,
  options: BattleRoundStartPriorityOptions = {}
): BattleRoundStartPriorityResult {
  const guardedState = applyRoundStartGuardStance(state, queued);
  const runActor = firstLivingQueuedRunActor(guardedState, queued);
  if (!runActor) {
    return { state: guardedState, queued: [...queued] };
  }

  const runner = combatantAt(guardedState, runActor);
  const blocked = isUnescapableGroup(options.groupId, options.rules);
  const chance = blocked
    ? 0
    : runSuccessChance(guardedState, guardedState.roundNumber, options.minRunSuccessChance);
  const roll = blocked ? null : normalizedRoll(rng());
  const success = !blocked && (roll ?? 1) < chance;
  const message = success
    ? `${runner?.name ?? "Someone"} ran away.`
    : `${runner?.name ?? "Someone"} couldn't escape!`;

  return {
    state: guardedState,
    queued: [],
    priorityStep: {
      state: guardedState,
      message,
      actor: runActor,
      skipped: false,
      fled: success,
      details: {
        kind: "run",
        attackerName: runner?.name ?? "Someone",
        message,
        fled: success
      }
    },
    runAttempt: {
      attempted: true,
      actor: runActor,
      ...(options.groupId !== undefined ? { groupId: options.groupId } : {}),
      blocked,
      chance,
      roll,
      success
    }
  };
}

export function runSuccessChance(
  state: BattleState,
  roundNumber = state.roundNumber,
  minSuccessChance = MIN_RUN_SUCCESS_CHANCE
): number {
  const partySpeed = highestLivingSpeed(state.party);
  const enemySpeed = highestLivingSpeed(state.enemies);
  const rawChance = (partySpeed - enemySpeed + 10 * Math.max(1, stat(roundNumber))) / 100;
  return Math.max(clamp01(minSuccessChance), clamp01(rawChance));
}

export function resolveRoundStep(
  state: BattleState,
  actor: BattleActor,
  queued: QueuedCommand | undefined,
  rng: Rng,
  resources: BattleRoundResources = {}
): BattleRoundStepResult {
  const combatant = combatantAt(state, actor);
  if (!combatant || !isCombatantAlive(combatant)) {
    return skippedRoundStep(state, actor);
  }

  if (actor.side === "party" && queued?.command === "DEFEND") {
    return defendAnnouncementRoundStep(state, actor, combatant.name);
  }

  const turnState = beginCombatantTurn(state, actor);
  if (actor.side === "enemy") {
    return fromResolution(turnState, resolveEnemyActionTurn(turnState, actor, rng), {
      command: "BASH"
    });
  }

  if (!queued) {
    return skippedRoundStep(turnState, actor, "No queued command.");
  }

  switch (queued.command) {
    case "BASH":
      return fromResolution(turnState, resolveTurn(turnState, actor, rng, enemyTargetOptions(queued)), {
        command: queued.command
      });
    case "AUTO":
      return fromResolution(turnState, resolveDefaultBashTurn(turnState, actor, rng), {
        command: queued.command
      });
    case "SPY":
      return fromResolution(turnState, resolveSpyTurn(turnState, actor, enemyTargetOptions(queued)), {
        command: queued.command
      });
    case "PSI": {
      const psi = findById(resources.psi, queued.psiId);
      if (!psi) {
        return skippedRoundStep(turnState, actor, "Cannot use that PSI here.");
      }
      return fromResolution(turnState, resolvePsiTurn(turnState, actor, psi, rng, targetOptions(queued)), {
        command: queued.command,
        moveName: psi.name,
        psiId: psi.id,
        psiKind: psiBattleKind(psi)
      });
    }
    case "GOODS": {
      const item = findById(resources.items, queued.itemId);
      if (!item) {
        return skippedRoundStep(turnState, actor, "Cannot use that item.");
      }
      return fromResolution(turnState, resolveItemTurn(turnState, actor, item, targetOptions(queued)), {
        command: queued.command,
        item
      });
    }
    case "DEFEND":
      return defendAnnouncementRoundStep(turnState, actor, combatant.name);
    case "PRAY":
      return fromResolution(turnState, resolvePrayTurn(turnState, actor, rng), {
        command: queued.command
      });
    case "MIRROR":
      return fromResolution(turnState, resolveMirrorTurn(turnState, actor, rng, enemyTargetOptions(queued)), {
        command: queued.command
      });
    case "RUN":
      return skippedRoundStep(turnState, actor, "Run is resolved at round start.");
  }
}

export function nextInputState(
  input: BattleRoundInputState,
  event: BattleRoundInputEvent,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  switch (event.kind) {
    case "move":
      return { input: moveInputSelection(input, event.delta, context), complete: false };
    case "confirm":
      return confirmInputSelection(input, context);
    case "cancel":
      return { input: cancelInputSelection(input, context), complete: false };
    case "auto":
      return autoQueueRemaining(input, context);
  }
}

function confirmInputSelection(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  switch (input.submenu) {
    case "command":
      return confirmCommand(input, context);
    case "psi":
      return confirmPsi(input, context);
    case "goods":
      return confirmGoods(input, context);
    case "target-enemy":
    case "target-ally":
      return confirmTarget(input, context);
  }
}

function confirmCommand(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  const actor = currentInputActor(input, context);
  if (!actor) {
    return { input, complete: true };
  }
  const combatant = combatantAt(context.state, actor);
  const commands = commandsForCharId(combatant?.charId ?? 0);
  const command = commands[clampSelection(input.selectionIndex, commands.length)] ?? "BASH";

  if (command === "PSI") {
    return {
      input: { ...input, submenu: "psi", selectionIndex: 0, pending: undefined },
      complete: false
    };
  }
  if (command === "GOODS") {
    return {
      input: { ...input, submenu: "goods", selectionIndex: 0, pending: undefined },
      complete: false
    };
  }
  if (command === "AUTO") {
    return autoQueueRemaining(input, context);
  }
  if (command === "DEFEND" || command === "PRAY" || command === "RUN") {
    return queueAndAdvance(input, context, { partySlot: actor.index, command });
  }

  const livingEnemies = livingIndices(context.state, "enemy");
  const targetPlan = commandTargetSelectionPlan(command, livingEnemies.length);
  if (targetPlan.submenu === "target") {
    return {
      input: {
        ...input,
        submenu: "target-enemy",
        selectionIndex: livingEnemies[0] ?? 0,
        pending: { partySlot: actor.index, command }
      },
      complete: false
    };
  }

  const targetIndex = defaultTargetIndexForActor(context.state, actor);
  return queueAndAdvance(input, context, {
    partySlot: actor.index,
    command,
    ...(targetIndex >= 0 ? { target: { side: "enemy", index: targetIndex } } : {})
  });
}

function confirmPsi(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  const actor = currentInputActor(input, context);
  const combatant = actor ? combatantAt(context.state, actor) : undefined;
  if (!actor || !combatant) {
    return { input, complete: false };
  }
  const learnedPsi = learnedPsiForCombatant(context.psi ? [...context.psi] : [], combatant);
  const psi = learnedPsi[clampSelection(input.selectionIndex, learnedPsi.length)];
  if (!psi) {
    return { input, complete: false };
  }
  const kind = psiBattleKind(psi);
  if (kind !== "offense" && kind !== "recovery") {
    return { input, complete: false };
  }
  if (combatant.pp < psiPpCost(psi)) {
    return { input, complete: false };
  }

  const targetSide = kind === "offense" ? "enemy" : "party";
  return {
    input: {
      ...input,
      submenu: targetSide === "enemy" ? "target-enemy" : "target-ally",
      selectionIndex: livingIndices(context.state, targetSide)[0] ?? 0,
      pending: { partySlot: actor.index, command: "PSI", psiId: psi.id }
    },
    complete: false
  };
}

function confirmGoods(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  const actor = currentInputActor(input, context);
  const combatant = actor ? combatantAt(context.state, actor) : undefined;
  if (!actor || !combatant) {
    return { input, complete: false };
  }
  const itemId = combatant.inventory[clampSelection(input.selectionIndex, combatant.inventory.length)];
  if (itemId === undefined) {
    return { input, complete: false };
  }
  return {
    input: {
      ...input,
      submenu: "target-ally",
      selectionIndex: livingIndices(context.state, "party")[0] ?? 0,
      pending: { partySlot: actor.index, command: "GOODS", itemId }
    },
    complete: false
  };
}

function confirmTarget(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  if (!input.pending) {
    return { input, complete: false };
  }
  const side = input.submenu === "target-ally" ? "party" : "enemy";
  const targetIndex = livingIndices(context.state, side).includes(input.selectionIndex)
    ? input.selectionIndex
    : livingIndices(context.state, side)[0] ?? 0;
  return queueAndAdvance(input, context, {
    ...input.pending,
    target: { side, index: targetIndex }
  });
}

function cancelInputSelection(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputState {
  const actor = currentInputActor(input, context);
  const combatant = actor ? combatantAt(context.state, actor) : undefined;
  if (input.submenu === "target-enemy" || input.submenu === "target-ally") {
    if (input.pending?.command === "PSI") {
      return { ...input, submenu: "psi", selectionIndex: 0, pending: undefined };
    }
    if (input.pending?.command === "GOODS") {
      return { ...input, submenu: "goods", selectionIndex: 0, pending: undefined };
    }
    return {
      ...input,
      submenu: "command",
      selectionIndex: commandIndex(input.pending?.command, combatant?.charId),
      pending: undefined
    };
  }

  if (input.submenu === "psi" || input.submenu === "goods") {
    return {
      ...input,
      submenu: "command",
      selectionIndex: commandIndex(input.submenu === "psi" ? "PSI" : "GOODS", combatant?.charId),
      pending: undefined
    };
  }

  if (input.memberCursor <= 0) {
    return input;
  }

  const order = partyInputOrder(context.state);
  const previousActor = order[input.memberCursor - 1];
  if (!previousActor) {
    return input;
  }
  const previousCommand = input.queue.find((queued) => queued.partySlot === previousActor.index);
  return {
    memberCursor: input.memberCursor - 1,
    submenu: "command",
    selectionIndex: commandIndex(previousCommand?.command, combatantAt(context.state, previousActor)?.charId),
    queue: input.queue.filter((queued) => queued.partySlot !== previousActor.index)
  };
}

function autoQueueRemaining(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleRoundInputTransition {
  const order = partyInputOrder(context.state);
  const targetIndex = firstLivingIndex(context.state.enemies);
  const queue = order.slice(input.memberCursor).reduce((nextQueue, actor) =>
    upsertQueuedCommand(nextQueue, {
      partySlot: actor.index,
      command: "BASH",
      ...(targetIndex >= 0 ? { target: { side: "enemy" as const, index: targetIndex } } : {})
    }), input.queue);

  return {
    input: {
      memberCursor: order.length,
      submenu: "command",
      selectionIndex: 0,
      queue
    },
    complete: true
  };
}

function queueAndAdvance(
  input: BattleRoundInputState,
  context: BattleRoundInputContext,
  queued: QueuedCommand
): BattleRoundInputTransition {
  const order = partyInputOrder(context.state);
  const memberCursor = input.memberCursor + 1;
  const complete = memberCursor >= order.length;
  return {
    input: {
      memberCursor,
      submenu: "command",
      selectionIndex: 0,
      queue: upsertQueuedCommand(input.queue, queued)
    },
    complete
  };
}

function moveInputSelection(
  input: BattleRoundInputState,
  delta: number,
  context: BattleRoundInputContext
): BattleRoundInputState {
  if (input.submenu === "target-enemy" || input.submenu === "target-ally") {
    const side = input.submenu === "target-ally" ? "party" : "enemy";
    const indices = livingIndices(context.state, side);
    if (indices.length === 0) {
      return input;
    }
    const position = indices.includes(input.selectionIndex) ? indices.indexOf(input.selectionIndex) : 0;
    return { ...input, selectionIndex: indices[wrap(position + delta, indices.length)] };
  }

  const length = selectionLength(input, context);
  if (length <= 0) {
    return input;
  }
  return { ...input, selectionIndex: wrap(input.selectionIndex + delta, length) };
}

function selectionLength(input: BattleRoundInputState, context: BattleRoundInputContext): number {
  const actor = currentInputActor(input, context);
  const combatant = actor ? combatantAt(context.state, actor) : undefined;
  if (!combatant) {
    return 0;
  }
  if (input.submenu === "command") {
    return commandsForCharId(combatant.charId).length;
  }
  if (input.submenu === "psi") {
    return learnedPsiForCombatant(context.psi ? [...context.psi] : [], combatant).length;
  }
  if (input.submenu === "goods") {
    return combatant.inventory.length;
  }
  const side = input.submenu === "target-ally" ? "party" : "enemy";
  return livingIndices(context.state, side).length;
}

function currentInputActor(
  input: BattleRoundInputState,
  context: BattleRoundInputContext
): BattleActor | undefined {
  return partyInputOrder(context.state)[input.memberCursor];
}

function livingIndices(state: BattleState, side: BattleSide): number[] {
  const combatants = side === "party" ? state.party : state.enemies;
  return combatants.flatMap((combatant, index) => isCombatantAlive(combatant) ? [index] : []);
}

function upsertQueuedCommand(queue: QueuedCommand[], queued: QueuedCommand): QueuedCommand[] {
  return [...queue.filter((entry) => entry.partySlot !== queued.partySlot), queued]
    .sort((left, right) => left.partySlot - right.partySlot);
}

function fromResolution(
  previousState: BattleState,
  resolution: BattleRoundStepResolution,
  context: {
    command: BattleCommand;
    moveName?: string;
    psiId?: number;
    psiKind?: ReturnType<typeof psiBattleKind>;
    item?: BattleRoundItemData;
  }
): BattleRoundStepResult {
  return {
    state: resolution.state,
    message: resolutionMessage(resolution),
    actor: resolution.actor,
    skipped: resolution.skipped,
    resolution,
    details: narrationDetailsForResolution(previousState, resolution, context)
  };
}

function resolutionMessage(resolution: BattleRoundStepResolution): string {
  return "message" in resolution ? resolution.message : "";
}

function narrationDetailsForResolution(
  previousState: BattleState,
  resolution: BattleRoundStepResolution,
  context: {
    command: BattleCommand;
    moveName?: string;
    psiId?: number;
    psiKind?: ReturnType<typeof psiBattleKind>;
    item?: BattleRoundItemData;
  }
): BattleRoundStepNarrationDetails {
  const attackerName = combatantName(previousState, resolution.actor);
  const message = resolutionMessage(resolution);
  if (resolution.skipped) {
    return { kind: "skip", attackerName, message };
  }

  if ("defender" in resolution) {
    const targetName = resolution.defender ? combatantName(previousState, resolution.defender) : undefined;
    return {
      kind: "attack",
      attackerName,
      targetName,
      message,
      damage: resolution.damage,
      missed: !targetName || resolution.damage <= 0,
      targetDied: enemyTargetsDied(previousState, resolution.state, [resolution.defender])
    };
  }

  if ("effectKind" in resolution) {
    const targetName = multiTargetName(previousState, resolution.targets);
    const kind = resolution.effectKind === "psi" ? "psi" : "attack";
    return {
      kind,
      attackerName,
      targetName,
      moveName: kind === "psi" ? "PSI" : undefined,
      message,
      damage: resolution.amount,
      missed: !targetName || resolution.amount <= 0,
      targetDied: enemyTargetsDied(previousState, resolution.state, resolution.targets)
    };
  }

  if (context.command === "DEFEND") {
    return {
      kind: "defend",
      attackerName,
      targetName: combatantName(previousState, resolution.actor),
      message,
      defended: true
    };
  }

  if (context.command === "SPY") {
    const target = "target" in resolution ? resolution.target : null;
    return {
      kind: "spy",
      attackerName,
      targetName: target ? combatantName(previousState, target) : undefined,
      message
    };
  }

  if (context.command === "PRAY" && "effect" in resolution) {
    return {
      kind: "pray",
      attackerName,
      targetName: multiTargetName(previousState, resolution.targets),
      message,
      damage: resolution.effect === "damageEnemies" ? resolution.amount : undefined,
      healed: resolution.effect === "healParty" ? resolution.amount : undefined,
      ppRestored: resolution.effect === "restorePp" ? resolution.amount : undefined,
      missed: resolution.effect === "nothing",
      targetDied: enemyTargetsDied(previousState, resolution.state, resolution.targets)
    };
  }

  if (context.command === "MIRROR") {
    const target = "target" in resolution ? resolution.target : null;
    return {
      kind: "mirror",
      attackerName,
      targetName: target ? combatantName(previousState, target) : undefined,
      message,
      damage: "amount" in resolution ? resolution.amount : undefined,
      missed: !("amount" in resolution) || resolution.amount <= 0,
      targetDied: enemyTargetsDied(previousState, resolution.state, [target])
    };
  }

  if (context.command === "PSI") {
    const target = "target" in resolution ? resolution.target : null;
    const amount = "amount" in resolution ? resolution.amount : 0;
    const targetName = target ? combatantName(previousState, target) : undefined;
    return {
      kind: "psi",
      attackerName,
      targetName,
      moveName: context.moveName,
      psiId: context.psiId,
      message,
      damage: context.psiKind === "offense" ? amount : undefined,
      healed: context.psiKind === "recovery" ? amount : undefined,
      missed: !targetName || amount <= 0,
      targetDied: enemyTargetsDied(previousState, resolution.state, [target])
    };
  }

  if (context.command === "GOODS") {
    const target = "target" in resolution ? resolution.target : null;
    const effect = context.item ? decodeItemUseEffect(context.item) : undefined;
    const amount = "amount" in resolution ? resolution.amount : 0;
    return {
      kind: "item",
      attackerName,
      targetName: target ? combatantName(previousState, target) : undefined,
      itemName: context.item?.name,
      message,
      healed: effect?.kind === "healHp" || effect?.kind === "healHpPercent" ? amount : undefined,
      ppRestored: effect?.kind === "recoverPp" || effect?.kind === "recoverPpPercent" ? amount : undefined,
      missed: amount <= 0,
      targetDied: enemyTargetsDied(previousState, resolution.state, [target])
    };
  }

  return { kind: "skip", attackerName, message };
}

function skippedRoundStep(
  state: BattleState,
  actor: BattleActor,
  message = ""
): BattleRoundStepResult {
  return {
    state,
    message,
    actor,
    skipped: true,
    details: {
      kind: "skip",
      attackerName: combatantName(state, actor),
      message
    }
  };
}

function defendAnnouncementRoundStep(
  state: BattleState,
  actor: BattleActor,
  name: string
): BattleRoundStepResult {
  const message = `${name} took a defensive stance.`;
  return {
    state,
    message,
    actor,
    skipped: false,
    details: {
      kind: "defend",
      attackerName: name,
      targetName: name,
      message,
      defended: true
    }
  };
}

function combatantName(state: BattleState, actor: BattleActor): string {
  return combatantAt(state, actor)?.name ?? "Someone";
}

function multiTargetName(state: BattleState, targets: readonly BattleActor[]): string | undefined {
  if (targets.length === 0) {
    return undefined;
  }
  if (targets.length === 1) {
    return combatantName(state, targets[0]);
  }
  const side = targets[0]?.side;
  if (side === "party" && targets.every((target) => target.side === "party")) {
    return "the party";
  }
  if (side === "enemy" && targets.every((target) => target.side === "enemy")) {
    return "the enemies";
  }
  return "everyone";
}

function enemyTargetsDied(
  previousState: BattleState,
  nextState: BattleState,
  targets: readonly (BattleActor | null | undefined)[]
): boolean {
  return targets.some((target) => {
    if (!target || target.side !== "enemy") {
      return false;
    }
    const previous = combatantAt(previousState, target);
    const next = combatantAt(nextState, target);
    return Boolean(previous && isCombatantAlive(previous) && next && !isCombatantAlive(next));
  });
}

function enemyTargetOptions(queued: QueuedCommand): { targetIndex?: number } {
  return queued.target?.side === "enemy" ? { targetIndex: queued.target.index } : {};
}

function targetOptions(queued: QueuedCommand): { targetIndex?: number } {
  return queued.target ? { targetIndex: queued.target.index } : {};
}

function findById<T extends { id: number }>(
  entries: readonly T[] | undefined,
  id: number | undefined
): T | undefined {
  if (id === undefined) {
    return undefined;
  }
  return entries?.find((entry) => stat(entry.id) === stat(id));
}

function firstLivingQueuedRunActor(
  state: BattleState,
  queued: readonly QueuedCommand[]
): BattleActor | null {
  for (const entry of queued) {
    if (entry.command !== "RUN") {
      continue;
    }
    const actor = { side: "party" as const, index: entry.partySlot };
    const combatant = combatantAt(state, actor);
    if (combatant && isCombatantAlive(combatant)) {
      return actor;
    }
  }
  return null;
}

function highestLivingSpeed(combatants: readonly { speed: number; hp: BattleState["party"][number]["hp"] }[]): number {
  return combatants.reduce((highest, combatant) =>
    isCombatantAlive(combatant) ? Math.max(highest, stat(combatant.speed)) : highest, 0);
}

function isUnescapableGroup(groupId: number | undefined, rules: BattleRoundRules | undefined): boolean {
  return groupId !== undefined && Boolean(rules?.unescapableGroups?.some((entry) => stat(entry) === stat(groupId)));
}

function normalizedRoll(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function roundTieBreak(left: BattleActor, right: BattleActor): number {
  const sideDelta = roundSideTieRank(left.side) - roundSideTieRank(right.side);
  return sideDelta !== 0 ? sideDelta : right.index - left.index;
}

function roundSideTieRank(side: BattleSide): number {
  return side === "enemy" ? 0 : 1;
}

function wrap(value: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((value % length) + length) % length;
}

function clampSelection(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, Math.floor(index)));
}

function commandIndex(command: BattleCommand | undefined, charId = 0): number {
  if (!command) {
    return 0;
  }
  const commands = commandsForCharId(charId);
  const index = commands.indexOf(command);
  return index >= 0 ? index : 0;
}
