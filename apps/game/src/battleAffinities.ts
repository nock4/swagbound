/**
 * Elemental weakness system. Offense PSI carries an element (derived from its
 * name), and enemies can be weak or resistant to elements — so choosing the
 * right PSI matters instead of BASH-spamming. A super-effective hit does 1.5x
 * and pops "WEAK!"; a resisted hit does 0.6x. Neutral by default.
 *
 * Enemy weaknesses live here as authored data keyed by enemy id (Combatant.charId
 * on the enemy side). Small enough to keep in code; movable to content later.
 */

export type PsiElement = "fire" | "ice" | "thunder" | "flash" | "cosmic" | "beam";

export const WEAK_MULTIPLIER = 1.5;
export const RESIST_MULTIPLIER = 0.6;

/**
 * Element for an offense PSI, keyed by its STABLE EarthBound psi id (id ranges
 * never change, unlike the Swagbound display-name overrides). Ness's beam PSI
 * (Rockin, "Static") = 1-4, Fire = 5-8, Freeze = 9-12, Thunder = 13-16,
 * Flash = 17-20, Starstorm = 21-22. Non-offense ids return null.
 */
export function psiElementForId(psiId: number | undefined): PsiElement | null {
  if (psiId === undefined) {
    return null;
  }
  if (psiId >= 1 && psiId <= 4) return "beam";
  if (psiId >= 5 && psiId <= 8) return "fire";
  if (psiId >= 9 && psiId <= 12) return "ice";
  if (psiId >= 13 && psiId <= 16) return "thunder";
  if (psiId >= 17 && psiId <= 20) return "flash";
  if (psiId >= 21 && psiId <= 22) return "cosmic";
  return null;
}

type Affinity = { weak?: PsiElement; resist?: PsiElement };

/**
 * Authored enemy affinities (enemy id → weakness/resistance). Thematic where it
 * lands: the Soul Consuming Flame shrugs off fire and hates ice; machines fear
 * thunder; icy things melt to fire. Everything unlisted is neutral.
 */
const ENEMY_AFFINITY: Record<number, Affinity> = {
  130: { weak: "thunder" }, // Frankystein Mark II (arena 1) — a machine
  135: { weak: "ice" }, // Tough Guy (arena 2) — cool him off
  147: { weak: "ice", resist: "fire" }, // Soul Consuming Flame (arena 3)
  132: { weak: "thunder" }, // Cute Li'l UFO
  133: { weak: "thunder" }, // Beautiful UFO
  150: { weak: "thunder" }, // Li'l UFO
  151: { weak: "thunder" }, // High-class UFO
  214: { weak: "beam" }, // Starman Junior
  153: { weak: "thunder" }, // Robo-pump
  148: { weak: "fire", resist: "ice" }, // Demonic Petunia (a plant)
  145: { weak: "fire" }, // Gruff Goat
  144: { weak: "flash" }, // Mole Playing Rough (blind it)
  159: { weak: "flash" }, // Spiteful Crow
  448: { weak: "beam", resist: "flash" } // Milady swarm — copies, weak to the source beam
};

/** Damage multiplier + tag for an offense PSI element against an enemy. */
export function elementalAffinity(
  enemyId: number,
  element: PsiElement | null
): { multiplier: number; kind: "weak" | "resist" | null } {
  if (!element) {
    return { multiplier: 1, kind: null };
  }
  const affinity = ENEMY_AFFINITY[enemyId];
  if (!affinity) {
    return { multiplier: 1, kind: null };
  }
  if (affinity.weak === element) {
    return { multiplier: WEAK_MULTIPLIER, kind: "weak" };
  }
  if (affinity.resist === element) {
    return { multiplier: RESIST_MULTIPLIER, kind: "resist" };
  }
  return { multiplier: 1, kind: null };
}
