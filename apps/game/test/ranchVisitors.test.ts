import { describe, expect, it } from "vitest";
import {
  VISITOR_BASE_INTERVAL,
  VISITOR_POOL,
  pickVisitor,
  shouldVisitorAppear
} from "../src/ranchVisitors";

describe("VISITOR_POOL", () => {
  it("provides complete, valid visitor entries without em dashes", () => {
    expect(VISITOR_POOL).toHaveLength(8);

    for (const visitor of VISITOR_POOL) {
      expect(visitor.name.trim().length).toBeGreaterThan(0);
      expect(visitor.line.trim().length).toBeGreaterThan(0);
      expect(visitor.tipCoins).toBeGreaterThanOrEqual(5);
      expect(visitor.tipCoins).toBeLessThanOrEqual(40);
      expect(visitor.line.includes(String.fromCharCode(8212))).toBe(false);
    }
  });
});

describe("pickVisitor", () => {
  it("respects rating gates and excludes recent visitor ids", () => {
    const atZeroRating = pickVisitor(0, mulberry32(1), []);
    expect(atZeroRating?.minRating).toBe(0);

    const eligible = VISITOR_POOL.filter((visitor) => visitor.minRating <= 240);
    const expected = eligible.at(-1);
    const recentIds = eligible.slice(0, -1).map((visitor) => visitor.id);
    expect(pickVisitor(240, mulberry32(2), recentIds)).toBe(expected);
  });

  it("is deterministic with a seeded rng", () => {
    const firstRng = mulberry32(0x51a6b00d);
    const secondRng = mulberry32(0x51a6b00d);
    const firstIds = Array.from(
      { length: 12 },
      () => pickVisitor(900, firstRng, [])?.id
    );
    const secondIds = Array.from(
      { length: 12 },
      () => pickVisitor(900, secondRng, [])?.id
    );

    expect(firstIds).toEqual(secondIds);
  });

  it("returns undefined when every eligible visitor is recent or the rating is too low", () => {
    const eligibleIds = VISITOR_POOL
      .filter((visitor) => visitor.minRating <= 120)
      .map((visitor) => visitor.id);

    expect(pickVisitor(120, mulberry32(3), eligibleIds)).toBeUndefined();
    expect(pickVisitor(-1, mulberry32(4), [])).toBeUndefined();
  });
});

describe("shouldVisitorAppear", () => {
  it("returns false until the base interval has been exceeded without rolling rng", () => {
    const rng = (): number => {
      throw new Error("rng should not be called before the visitor interval");
    };

    expect(shouldVisitorAppear(VISITOR_BASE_INTERVAL - 1, 1, rng)).toBe(false);
    expect(shouldVisitorAppear(VISITOR_BASE_INTERVAL, 1, rng)).toBe(false);
  });

  it("increases the appearance probability with rareVisitChance", () => {
    const roll = (): number => 0.1;

    expect(shouldVisitorAppear(VISITOR_BASE_INTERVAL + 1, 0, roll)).toBe(false);
    expect(shouldVisitorAppear(VISITOR_BASE_INTERVAL + 1, 0.05, roll)).toBe(true);
  });

  it("is deterministic with a seeded rng", () => {
    const firstRng = mulberry32(0xbad5eed);
    const secondRng = mulberry32(0xbad5eed);
    const firstResults = Array.from(
      { length: 20 },
      () => shouldVisitorAppear(VISITOR_BASE_INTERVAL + 1, 0.2, firstRng)
    );
    const secondResults = Array.from(
      { length: 20 },
      () => shouldVisitorAppear(VISITOR_BASE_INTERVAL + 1, 0.2, secondRng)
    );

    expect(firstResults).toEqual(secondResults);
  });
});

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
