import type { PsiData } from "@eb/schemas";

export const PSI_STRENGTH_ORDER = ["alpha", "beta", "gamma", "sigma", "omega"] as const;

export type PsiStrengthName = typeof PSI_STRENGTH_ORDER[number];

const PSI_STRENGTH_GLYPHS: Record<PsiStrengthName, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  sigma: "Σ",
  omega: "Ω"
};

export type PsiMenuRow<T> = {
  family: string;
  entries: T[];
};

export function normalizedPsiStrength(strength: string): string {
  return strength.trim().toLowerCase();
}

export function psiStrengthGlyph(strength: string): string {
  const normalized = normalizedPsiStrength(strength);
  return PSI_STRENGTH_GLYPHS[normalized as PsiStrengthName] ?? strength.trim();
}

export function psiStrengthRank(strength: string): number {
  const index = PSI_STRENGTH_ORDER.indexOf(normalizedPsiStrength(strength) as PsiStrengthName);
  return index >= 0 ? index : PSI_STRENGTH_ORDER.length;
}

export function displayPsiFamilyName(psi: Pick<PsiData, "id" | "name">): string {
  return psi.name.trim() || `[psi ${Math.max(0, Math.floor(psi.id))}]`;
}

export function isDisplayablePsi(psi: Pick<PsiData, "id" | "name" | "type" | "strength" | "target">): boolean {
  const name = psi.name.trim();
  const type = psi.type.trim().toLowerCase();
  const strength = normalizedPsiStrength(psi.strength);
  if (!name || /^\[psi\s+\d+\]$/i.test(name)) {
    return false;
  }
  // EB's psi table carries placeholder rows literally named with "????"; they
  // are not learnable skills and must never render in a list.
  if (/\?{2,}/.test(name)) {
    return false;
  }
  if (!type || type === "[]" || type === "none") {
    return false;
  }
  if (strength === "none") {
    return false;
  }
  return psi.target !== "none";
}

export function buildPsiMenuRows<T extends Pick<PsiData, "id" | "name" | "strength">>(entries: readonly T[]): PsiMenuRow<T>[] {
  const rows: PsiMenuRow<T>[] = [];
  const byFamily = new Map<string, PsiMenuRow<T>>();
  for (const entry of entries) {
    const family = displayPsiFamilyName(entry);
    const existing = byFamily.get(family);
    if (existing) {
      existing.entries.push(entry);
    } else {
      const row = { family, entries: [entry] };
      byFamily.set(family, row);
      rows.push(row);
    }
  }
  for (const row of rows) {
    row.entries.sort((left, right) =>
      psiStrengthRank(left.strength) - psiStrengthRank(right.strength) || left.id - right.id
    );
  }
  return rows;
}
