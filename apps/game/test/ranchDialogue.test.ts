import { describe, expect, it } from "vitest";
import {
  BATH_KITCHEN_CHATTER,
  COIN_MILESTONE_QUIPS,
  GACHA_VOICE,
  VISITOR_RETURN_LINES,
  buildingStateLines,
  farmhandLines,
  pick
} from "../src/ranchDialogue";

const BUILDING_KINDS = [
  "monBarn",
  "trainingYard",
  "itemWorks",
  "snackKitchen",
  "monBath",
  "gachaShrine",
  "billboard"
] as const;

const BUILDING_STATES = ["idle", "working", "ready"] as const;

describe("ranch dialogue data", () => {
  it("keeps every authored string non-empty and free of em dashes", () => {
    const lines = [
      ...GACHA_VOICE,
      ...COIN_MILESTONE_QUIPS,
      ...BATH_KITCHEN_CHATTER,
      ...VISITOR_RETURN_LINES
    ];

    for (const kind of BUILDING_KINDS) {
      for (const state of BUILDING_STATES) {
        lines.push(
          ...buildingStateLines(kind, state, ["Humgoo"], fixedRng(0)),
          ...buildingStateLines(kind, state, ["Humgoo"], fixedRng(0.999))
        );
      }
    }

    for (const buildingCount of [0, 2, 6]) {
      for (const swagRating of [0, 100, 300, 600, 1000]) {
        lines.push(
          ...farmhandLines(buildingCount, swagRating, true, fixedRng(0)),
          ...farmhandLines(buildingCount, swagRating, true, fixedRng(0.999))
        );
      }
    }

    expect(new Set(lines).size).toBeGreaterThanOrEqual(40);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line.includes(String.fromCharCode(8212))).toBe(false);
    }
  });
});

describe("buildingStateLines", () => {
  it("covers every ranch building in every state with one or two pages", () => {
    for (const kind of BUILDING_KINDS) {
      for (const state of BUILDING_STATES) {
        const pages = buildingStateLines(kind, state, ["Humgoo"], fixedRng(0.4));
        expect(pages.length).toBeGreaterThanOrEqual(1);
        expect(pages.length).toBeLessThanOrEqual(2);
        expect(pages.every((page) => page.trim().length > 0)).toBe(true);
      }
    }
  });

  it("inserts a crew name into working dialogue", () => {
    for (const kind of BUILDING_KINDS) {
      const pages = buildingStateLines(kind, "working", ["Humgoo"], fixedRng(0));
      expect(pages.join(" ")).toContain("Humgoo");
      expect(pages.join(" ")).not.toContain("{crew}");
    }
  });
});

describe("farmhandLines", () => {
  it("uses tutor, mentor, and peer voices at the band boundaries", () => {
    expect(farmhandLines(0, 0, false, fixedRng(0))[0]).toContain("show you");
    expect(farmhandLines(1, 0, false, fixedRng(0))[0]).toContain("show you");
    expect(farmhandLines(2, 0, false, fixedRng(0))[0]).toContain("enough roofs");
    expect(farmhandLines(5, 0, false, fixedRng(0))[0]).toContain("enough roofs");
    expect(farmhandLines(6, 0, false, fixedRng(0))[0]).toContain("What is your secret?");
  });

  it("adds a first-of-session greeting variant", () => {
    const withoutGreeting = farmhandLines(2, 0, false, fixedRng(0));
    const withGreeting = farmhandLines(2, 0, true, fixedRng(0));

    expect(withGreeting).toHaveLength(withoutGreeting.length + 1);
    expect(withGreeting[0]).toContain("Morning");
  });

  it("acknowledges only the highest rating tier reached", () => {
    expect(farmhandLines(2, 99, false, fixedRng(0))).toHaveLength(1);
    expect(farmhandLines(2, 100, false, fixedRng(0)).at(-1)).toContain("100");
    expect(farmhandLines(2, 599, false, fixedRng(0)).at(-1)).toContain("Three hundred");
    expect(farmhandLines(2, 600, false, fixedRng(0)).at(-1)).toContain("Six hundred");
    expect(farmhandLines(2, 1000, false, fixedRng(0)).at(-1)).toContain("One thousand");
  });
});

describe("seeded selectors", () => {
  it("returns the same selections for the same seeded rng", () => {
    const firstRng = mulberry32(0x51a6b00d);
    const secondRng = mulberry32(0x51a6b00d);

    const firstResults = BUILDING_KINDS.flatMap((kind) =>
      BUILDING_STATES.flatMap((state) =>
        buildingStateLines(kind, state, ["Humgoo", "Lil Stink"], firstRng)
      )
    );
    const secondResults = BUILDING_KINDS.flatMap((kind) =>
      BUILDING_STATES.flatMap((state) =>
        buildingStateLines(kind, state, ["Humgoo", "Lil Stink"], secondRng)
      )
    );

    expect(firstResults).toEqual(secondResults);
    expect(
      farmhandLines(6, 1000, true, mulberry32(0xbad5eed))
    ).toEqual(
      farmhandLines(6, 1000, true, mulberry32(0xbad5eed))
    );
    expect(pick(GACHA_VOICE, mulberry32(42))).toBe(
      pick(GACHA_VOICE, mulberry32(42))
    );
  });
});

function fixedRng(value: number): () => number {
  return () => value;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
