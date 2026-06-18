import type { ItemData, PsiData } from "@eb/schemas";
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
  resolveDefendTurn,
  resolveEnemyActionTurn,
  resolveItemTurn,
  resolveMirrorTurn,
  resolvePrayTurn,
  resolvePsiTurn,
  resolveSpyTurn,
  resolveTurn,
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

export type BattleRoundItemData = Pick<ItemData, "id" | "action" | "argument" | "miscFlags" | "effect">;

export type BattleRoundStepResolution =
  | TurnResolution
  | EnemyActionResolution
  | BattleActionResolution
  | SpyResolution
  | PrayResolution
  | MirrorResolution;

export type BattleRoundStepResult = {
  state: BattleState;
  message: string;
  actor: BattleActor;
  skipped: boolean;
  fled?: boolean;
  resolution?: BattleRoundStepResolution;
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

  const turnState = beginCombatantTurn(state, actor);
  if (actor.side === "enemy") {
    return fromResolution(resolveEnemyActionTurn(turnState, actor, rng));
  }

  if (!queued) {
    return skippedRoundStep(turnState, actor, "No queued command.");
  }

  switch (queued.command) {
    case "BASH":
      return fromResolution(resolveTurn(turnState, actor, rng, enemyTargetOptions(queued)));
    case "AUTO":
      return fromResolution(resolveDefaultBashTurn(turnState, actor, rng));
    case "SPY":
      return fromResolution(resolveSpyTurn(turnState, actor, enemyTargetOptions(queued)));
    case "PSI": {
      const psi = findById(resources.psi, queued.psiId);
      if (!psi) {
        return skippedRoundStep(turnState, actor, "Cannot use that PSI here.");
      }
      return fromResolution(resolvePsiTurn(turnState, actor, psi, rng, targetOptions(queued)));
    }
    case "GOODS": {
      const item = findById(resources.items, queued.itemId);
      if (!item) {
        return skippedRoundStep(turnState, actor, "Cannot use that item.");
      }
      return fromResolution(resolveItemTurn(turnState, actor, item, targetOptions(queued)));
    }
    case "DEFEND":
      return fromResolution(resolveDefendTurn(turnState, actor));
    case "PRAY":
      return fromResolution(resolvePrayTurn(turnState, actor, rng));
    case "MIRROR":
      return fromResolution(resolveMirrorTurn(turnState, actor, rng, enemyTargetOptions(queued)));
    case "RUN":
      return {
        state: turnState,
        message: `${combatant.name} ran away.`,
        actor,
        skipped: false,
        fled: true
      };
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

function fromResolution(resolution: BattleRoundStepResolution): BattleRoundStepResult {
  return {
    state: resolution.state,
    message: resolutionMessage(resolution),
    actor: resolution.actor,
    skipped: resolution.skipped,
    resolution
  };
}

function resolutionMessage(resolution: BattleRoundStepResolution): string {
  return "message" in resolution ? resolution.message : "";
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
    skipped: true
  };
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
