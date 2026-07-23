export type RatingPerks = {
  shopDiscount: number;
  xpBonus: number;
  rareVisitChance: number;
};

export type RatingPerkTier = RatingPerks & {
  minRating: number;
};

/**
 * Cumulative perks by Swag Rating. Each tier preserves or increases every
 * earlier benefit, reaching the documented caps at 1,000 rating.
 */
export const RATING_PERKS: readonly RatingPerkTier[] = [
  { minRating: 0, shopDiscount: 0, xpBonus: 0, rareVisitChance: 0 },
  { minRating: 100, shopDiscount: 0.05, xpBonus: 0, rareVisitChance: 0 },
  { minRating: 300, shopDiscount: 0.15, xpBonus: 0.1, rareVisitChance: 0 },
  { minRating: 600, shopDiscount: 0.2, xpBonus: 0.25, rareVisitChance: 0.15 },
  { minRating: 1000, shopDiscount: 0.3, xpBonus: 0.5, rareVisitChance: 0.4 }
];

export function activePerks(rating: number): RatingPerks {
  let active = RATING_PERKS[0];
  for (const tier of RATING_PERKS) {
    if (rating < tier.minRating) {
      break;
    }
    active = tier;
  }
  return {
    shopDiscount: active.shopDiscount,
    xpBonus: active.xpBonus,
    rareVisitChance: active.rareVisitChance
  };
}

export function discountedPrice(base: number, rating: number): number {
  return Math.floor(base * (1 - activePerks(rating).shopDiscount));
}
