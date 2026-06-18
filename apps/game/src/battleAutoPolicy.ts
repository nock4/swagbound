import type { PsiData } from "@eb/schemas";
import {
  combatantAt,
  combatantIdForActor,
  defaultTargetIndexForActor,
  isCombatantAlive,
  learnedPsiForCombatant,
  psiBattleKind,
  psiEffectAmount,
  psiPpCost,
  type BattleState,
  type Combatant
} from "./battleLogic";
import type { QueuedCommand } from "./battleRound";

export const AUTO_HEAL_HP_FRACTION = 0.25;

type EndangeredAlly = {
  index: number;
  hpFraction: number;
  missingHp: number;
};

type RecoveryPsiOption = {
  psi: PsiData;
  ppCost: number;
  healAmount: number;
};

export function autoCommandForMember(
  state: BattleState,
  partySlot: number,
  psiList: readonly PsiData[] = []
): QueuedCommand {
  const slot = stat(partySlot);
  const actor = { side: "party" as const, index: slot };
  const member = combatantAt(state, actor);
  if (!member || !isCombatantAlive(member)) {
    return bashCommandForMember(state, slot);
  }

  const endangeredAlly = mostEndangeredAlly(state);
  const recoveryPsi = endangeredAlly
    ? recoveryPsiForMember([...psiList], member, endangeredAlly.missingHp)
    : undefined;
  if (endangeredAlly && recoveryPsi) {
    return {
      partySlot: slot,
      command: "PSI",
      psiId: recoveryPsi.psi.id,
      target: queuedTarget(state, "party", endangeredAlly.index)
    };
  }

  return bashCommandForMember(state, slot);
}

function mostEndangeredAlly(state: BattleState): EndangeredAlly | undefined {
  return state.party
    .flatMap((combatant, index): EndangeredAlly[] => {
      if (!isCombatantAlive(combatant) || combatant.maxHp <= 0) {
        return [];
      }
      const hpFraction = combatant.hp.displayed / combatant.maxHp;
      if (hpFraction >= AUTO_HEAL_HP_FRACTION) {
        return [];
      }
      return [{
        index,
        hpFraction,
        missingHp: Math.max(0, combatant.maxHp - combatant.hp.displayed)
      }];
    })
    .sort((left, right) => {
      const hpDelta = left.hpFraction - right.hpFraction;
      return hpDelta !== 0 ? hpDelta : left.index - right.index;
    })[0];
}

function recoveryPsiForMember(
  psiList: PsiData[],
  member: Combatant,
  missingHp: number
): RecoveryPsiOption | undefined {
  const options = learnedPsiForCombatant(psiList, member)
    .flatMap((psi): RecoveryPsiOption[] => {
      if (psiBattleKind(psi) !== "recovery") {
        return [];
      }
      const ppCost = psiPpCost(psi);
      if (member.pp < ppCost) {
        return [];
      }
      return [{
        psi,
        ppCost,
        healAmount: psiEffectAmount(psi, "recovery")
      }];
    });

  const sufficient = options.filter((option) => option.healAmount >= missingHp);
  const candidates = sufficient.length > 0 ? sufficient : options;
  return candidates
    .sort((left, right) => {
      if (sufficient.length > 0) {
        const costDelta = left.ppCost - right.ppCost;
        if (costDelta !== 0) {
          return costDelta;
        }
        const amountDelta = left.healAmount - right.healAmount;
        return amountDelta !== 0 ? amountDelta : left.psi.id - right.psi.id;
      }

      const amountDelta = right.healAmount - left.healAmount;
      if (amountDelta !== 0) {
        return amountDelta;
      }
      const costDelta = left.ppCost - right.ppCost;
      return costDelta !== 0 ? costDelta : left.psi.id - right.psi.id;
    })[0];
}

function bashCommandForMember(state: BattleState, partySlot: number): QueuedCommand {
  const targetIndex = defaultTargetIndexForActor(state, { side: "party", index: partySlot });
  return {
    partySlot,
    command: "BASH",
    ...(targetIndex >= 0 ? { target: queuedTarget(state, "enemy", targetIndex) } : {})
  };
}

function queuedTarget(state: BattleState, side: "party" | "enemy", index: number): QueuedCommand["target"] {
  const combatantId = combatantIdForActor(state, { side, index });
  return {
    side,
    index,
    ...(combatantId ? { combatantId } : {})
  };
}

function stat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
