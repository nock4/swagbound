import type { UsabilityItemRow, UsabilityMatrix, UsabilityPsiRow } from "@eb/schemas";

export const USABILITY_REFUSAL_MESSAGE = "You can't use that here.";

export type UsabilityContext = "field" | "battle";
export type UsabilitySide = "party" | "enemy";

export function itemUsability(matrix: UsabilityMatrix | undefined, itemId: number): UsabilityItemRow | undefined {
  return matrix?.items.find((row) => row.id === Math.max(0, Math.floor(itemId)));
}

export function psiUsability(matrix: UsabilityMatrix | undefined, psiId: number): UsabilityPsiRow | undefined {
  return matrix?.psi.find((row) => row.id === Math.max(0, Math.floor(psiId)));
}

export function canUseItemInField(matrix: UsabilityMatrix | undefined, itemId: number): boolean {
  return itemUsability(matrix, itemId)?.fieldUse ?? false;
}

export function canUseItemInBattle(matrix: UsabilityMatrix | undefined, itemId: number): boolean {
  return itemUsability(matrix, itemId)?.battleUse ?? false;
}

export function canUsePsiInField(matrix: UsabilityMatrix | undefined, psiId: number): boolean {
  return psiUsability(matrix, psiId)?.fieldUse ?? false;
}

export function canUsePsiInBattle(matrix: UsabilityMatrix | undefined, psiId: number): boolean {
  return psiUsability(matrix, psiId)?.battleUse ?? false;
}

export function battleUsablePsi<T extends { id: number }>(
  psi: readonly T[],
  matrix: UsabilityMatrix | undefined
): T[] {
  return psi.filter((entry) => canUsePsiInBattle(matrix, entry.id));
}

export function targetSideFromRowTargets(
  row: Pick<UsabilityItemRow | UsabilityPsiRow, "targets"> | undefined,
  context: UsabilityContext
): UsabilitySide | undefined {
  for (const target of row?.targets ?? []) {
    const parts = target.split(":");
    if (parts[0] === context && (parts[1] === "party" || parts[1] === "enemy")) {
      return parts[1];
    }
  }
  return undefined;
}

export function isTeleportFieldPsi(row: Pick<UsabilityPsiRow, "targets"> | undefined): boolean {
  return row?.targets.includes("field:teleport") ?? false;
}
