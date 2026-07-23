/**
 * Pure visitor selection for the Mons Ranch.
 * Scenes own timing, sprite spawning, dialogue, and coin side effects.
 */

export type VisitorEntry = {
  id: string;
  name: string;
  line: string;
  tipCoins: number;
  minRating: number;
};

export const VISITOR_POOL: VisitorEntry[] = [
  {
    id: "merchant-pocket",
    name: "Mr. Pocket",
    line: "I sell maps to places I have already left, which keeps the refunds adventurous.",
    tipCoins: 5,
    minRating: 0
  },
  {
    id: "tourist-marcy",
    name: "Mapless Marcy",
    line: "My guidebook calls this ranch a museum, so I have been politely waiting for the gift shop.",
    tipCoins: 8,
    minRating: 0
  },
  {
    id: "rival-buck",
    name: "Buck Bragley",
    line: "Your Mons look happy, which is either excellent ranching or very persuasive hay.",
    tipCoins: 12,
    minRating: 120
  },
  {
    id: "photographer-pam",
    name: "Flash Pam",
    line: "Hold still while I photograph the exact moment your fence becomes famous.",
    tipCoins: 16,
    minRating: 240
  },
  {
    id: "scout-dottie",
    name: "Scout Dottie",
    line: "I came seeking rare Mons, but your snack shed has stronger credentials.",
    tipCoins: 20,
    minRating: 360
  },
  {
    id: "weather-wendell",
    name: "Weather Wendell",
    line: "The wind says your ranch will prosper, although the wind still owes me five coins.",
    tipCoins: 26,
    minRating: 520
  },
  {
    id: "adjuster-clive",
    name: "Clive Claims",
    line: "I insure barns against destiny, weather, and unusually confident chickens.",
    tipCoins: 32,
    minRating: 700
  },
  {
    id: "judge-rosette",
    name: "Judge Rosette",
    line: "The committee awarded your ranch a ribbon, then misplaced both the committee and the ribbon.",
    tipCoins: 40,
    minRating: 900
  }
];

export const VISITOR_BASE_INTERVAL = 400;

const VISITOR_BASE_CHANCE = 0.08;

export function pickVisitor(
  rating: number,
  rng: () => number,
  recentIds: readonly string[]
): VisitorEntry | undefined {
  const recent = new Set(recentIds);
  const eligible = VISITOR_POOL.filter(
    (visitor) => visitor.minRating <= rating && !recent.has(visitor.id)
  );
  if (eligible.length === 0) return undefined;
  return eligible[Math.floor(rng() * eligible.length)];
}

export function shouldVisitorAppear(
  stepsSinceLast: number,
  rareVisitChance: number,
  rng: () => number
): boolean {
  if (stepsSinceLast <= VISITOR_BASE_INTERVAL) return false;
  const probability = Math.min(1, Math.max(0, VISITOR_BASE_CHANCE + rareVisitChance));
  return rng() < probability;
}
