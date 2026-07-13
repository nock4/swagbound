/**
 * The Congregation (fuel-onboarding-congregation, the Onboarding fuel's optional
 * boss): one enemy rendered as a crowd whose ATTACK scales with how many
 * testimonial NPCs the player left unchallenged. Challenge all three volunteers
 * before the fight and the crowd speaks at base volume; skip them and every
 * unquestioned voice joins its chorus.
 *
 * Keyed by the story-gate TRIGGER id, not the battle group: group 381 is shared
 * with the source-pier sanctuary gate, which must stay untouched.
 */
import type { BattleEnemy } from "@eb/schemas";

export const CONGREGATION_TRIGGER_ID = "fuel-onboarding-congregation";

const TESTIMONIAL_FLAGS = [
  "fuel:onboarding:testimonial-one",
  "fuel:onboarding:testimonial-two",
  "fuel:onboarding:testimonial-three"
] as const;

/** +30% offense per unchallenged testimonial (0..3 -> 1.0x..1.9x). */
const OFFENSE_SCALE_PER_UNCHALLENGED = 0.3;

export function unchallengedTestimonialCount(flags: readonly string[]): number {
  const present = new Set(flags);
  return TESTIMONIAL_FLAGS.filter((flag) => !present.has(flag)).length;
}

export function applyCongregationScaling(
  enemies: BattleEnemy[],
  storyGateTriggerId: string | undefined,
  flags: readonly string[]
): BattleEnemy[] {
  if (storyGateTriggerId !== CONGREGATION_TRIGGER_ID) {
    return enemies;
  }
  const unchallenged = unchallengedTestimonialCount(flags);
  if (unchallenged === 0) {
    return enemies;
  }
  const scale = 1 + OFFENSE_SCALE_PER_UNCHALLENGED * unchallenged;
  return enemies.map((enemy) => ({
    ...enemy,
    offense: Math.round(enemy.offense * scale)
  }));
}
