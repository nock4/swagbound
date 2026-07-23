/**
 * Pure flavor dialogue selection for the Mons Ranch.
 * Scenes own timing, speaker presentation, and ranch side effects.
 */

type RanchBuildingKind =
  | "monBarn"
  | "trainingYard"
  | "itemWorks"
  | "snackKitchen"
  | "monBath"
  | "gachaShrine"
  | "billboard";

type RanchBuildingState = "idle" | "working" | "ready";

type RanchBuildingLinePools = Readonly<
  Record<RanchBuildingKind, Readonly<Record<RanchBuildingState, readonly string[]>>>
>;

const BUILDING_LINE_POOLS: RanchBuildingLinePools = {
  monBarn: {
    idle: [
      "The barn is quiet enough to hear the hay waiting.",
      "An empty feed bucket is practicing patience. Assign somebody before it masters it."
    ],
    working: [
      "{crew} is sorting hay by emotional texture.",
      "{crew} has been in the barn long enough to be elected by the chickens."
    ],
    ready: [
      "The barn produced something useful and one mysterious feather.",
      "Work is done. The hay looks proud, although it denies everything."
    ]
  },
  trainingYard: {
    idle: [
      "The training dummy has won by default again. Assign a crew member to challenge the ruling.",
      "The yard is doing stretches very slowly. It may take all afternoon."
    ],
    working: [
      "{crew} is teaching the punching bag about consequences.",
      "{crew} ran one lap and discovered a second, less cooperative lap."
    ],
    ready: [
      "Training is complete. The dummy would like the record sealed.",
      "The yard finished making everyone tougher and slightly dustier."
    ]
  },
  itemWorks: {
    idle: [
      "The workbench has all the tools except a person. Assign one when convenient.",
      "A loose screw is waiting for professional supervision."
    ],
    working: [
      "{crew} is elbow-deep in something with a warranty of seven minutes.",
      "{crew} tightened one bolt. The other bolts are reconsidering their behavior."
    ],
    ready: [
      "The Item Works made a useful object and several confident noises.",
      "Production is complete. The toolbox is pretending this was easy."
    ]
  },
  snackKitchen: {
    idle: [
      "The stove is cold, but the soup pot remains optimistic. Assign a cook.",
      "An onion sits on the counter with nothing left to prove."
    ],
    working: [
      "{crew} is stirring clockwise for flavor and counterclockwise for luck.",
      "{crew} tasted the soup. The soup is now tasting back."
    ],
    ready: [
      "Snacks are ready. One of them is still humming.",
      "The kitchen produced a full tray and a very small weather system."
    ]
  },
  monBath: {
    idle: [
      "The bath is clean enough to bathe the bath. Assign somebody before it gets ideas.",
      "A folded towel is waiting to become part of the economy."
    ],
    working: [
      "{crew} is testing the bubbles for structural integrity.",
      "{crew} found the exact temperature between cozy and soup."
    ],
    ready: [
      "Bath time is complete. Everything smells like a polite forest.",
      "The towels are warm, the Mons are shiny, and the drain knows too much."
    ]
  },
  gachaShrine: {
    idle: [
      "The shrine is accepting silence today. Assign a keeper to improve business.",
      "The offering bowl contains one leaf and a complicated expectation."
    ],
    working: [
      "{crew} is polishing the shrine where the tiny voice can see.",
      "{crew} counted the wishes twice. One of them moved."
    ],
    ready: [
      "The shrine has answered. Its answer is wrapped and difficult to interpret.",
      "A reward is ready. The tiny voice requests no follow-up questions."
    ]
  },
  billboard: {
    idle: [
      "The billboard currently advertises wood. Assign someone with a message.",
      "A blank sign is facing the road with tremendous confidence."
    ],
    working: [
      "{crew} is painting a letter large enough to have its own opinion.",
      "{crew} has attracted three spectators and one highly critical crow."
    ],
    ready: [
      "The new message is up. Travelers are already pretending they meant to stop.",
      "The billboard is finished and can now be misunderstood from farther away."
    ]
  }
};

const FARMHAND_GREETING_LINES: readonly string[] = [
  "Morning. The ranch woke up before either of us and has declined to explain.",
  "Welcome back. I kept the gate busy while you were gone."
];

const FARMHAND_SIZE_LINES: Readonly<
  Record<"tutor" | "mentor" | "peer", readonly string[]>
> = {
  tutor: [
    "I can show you the ropes. First, build a place and assign a crew member who looks rope-ready.",
    "We are just getting started. Give somebody a job and even the quiet buildings will help."
  ],
  mentor: [
    "You have enough roofs now that I can point instead of lecture. Keep the crews where the work is.",
    "This ranch has a rhythm. It is mostly hammers, snack bowls, and you remembering assignments."
  ],
  peer: [
    "Six buildings already. I brought a clipboard, but it started taking notes about me. What is your secret?",
    "At this size, you are the ranch hand. I am merely standing near the fence with confidence."
  ]
};

const FARMHAND_RATING_LINES = [
  {
    minRating: 100,
    line: "A rating of 100. The local birds have begun recommending us."
  },
  {
    minRating: 300,
    line: "Three hundred points. Even the mailbox sits up straighter."
  },
  {
    minRating: 600,
    line: "Six hundred. The ranch now appears on maps drawn by serious crayons."
  },
  {
    minRating: 1000,
    line: "One thousand. I would offer advice, but the advice is asking for your autograph."
  }
] as const;

export const GACHA_VOICE: readonly string[] = [
  "A wish. Denomination: 50.",
  "Your hope has been accepted. No receipt.",
  "Please stand by. Fate is checking the coin."
];

export const COIN_MILESTONE_QUIPS: readonly string[] = [
  "That coin jar just became furniture.",
  "We crossed a coin mark. Please act naturally.",
  "The ranch has enough coins to make the bank nervous."
];

export const BATH_KITCHEN_CHATTER: readonly string[] = [
  "My bubbles know your secret. They are being professional.",
  "The soup smells great. This is bath water.",
  "I washed behind both ears. One of them was somebody else's."
];

export const VISITOR_RETURN_LINES: readonly string[] = [
  "{name} is back. The gate remembered the shoes.",
  "{name} returned to see whether the fence finished its thought.",
  "Last time, {name} left with a snack and several opinions."
];

export function pick<T>(pool: readonly T[], rng: () => number): T {
  if (pool.length === 0) {
    throw new Error("Cannot pick from an empty pool");
  }

  const roll = rng();
  const boundedRoll = Number.isFinite(roll)
    ? Math.min(Math.max(roll, 0), 1 - Number.EPSILON)
    : 0;
  return pool[Math.floor(boundedRoll * pool.length)];
}

export function buildingStateLines(
  kind: string,
  state: RanchBuildingState,
  crewNames: string[],
  rng: () => number = Math.random
): string[] {
  const building = BUILDING_LINE_POOLS[kind as RanchBuildingKind];
  if (!building) return [];

  const pool = building[state];
  const firstPage = pick(pool, rng);
  const pages = [firstPage];

  if (pool.length > 1 && rng() < 0.3) {
    const companionPage = pool.find((line) => line !== firstPage);
    if (companionPage) pages.push(companionPage);
  }

  const needsCrewName = pages.some((line) => line.includes("{crew}"));
  const crewName = needsCrewName && crewNames.length > 0
    ? pick(crewNames, rng).trim() || "Someone"
    : "Someone";

  return pages.map((line) => line.replaceAll("{crew}", crewName));
}

export function farmhandLines(
  buildingCount: number,
  swagRating: number,
  firstOfSession: boolean,
  rng: () => number = Math.random
): string[] {
  const pages: string[] = [];
  if (firstOfSession) pages.push(pick(FARMHAND_GREETING_LINES, rng));

  const sizeBand = buildingCount <= 1
    ? "tutor"
    : buildingCount <= 5
      ? "mentor"
      : "peer";
  pages.push(pick(FARMHAND_SIZE_LINES[sizeBand], rng));

  const ratingTier = [...FARMHAND_RATING_LINES].reverse().find(
    (tier) => swagRating >= tier.minRating
  );
  if (ratingTier) pages.push(ratingTier.line);

  return pages;
}
