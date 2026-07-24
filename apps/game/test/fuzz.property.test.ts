/**
 * Property-based fuzzing (fast-check) over the save-critical pure modules.
 * These throw thousands of random operation sequences at FarmState, the
 * Compendium, fusion, and the save layer, asserting invariants that must hold
 * for ANY input: no negative currency, no non-finite cells, every state
 * round-trips through the save validator (the class of bug that bricks a save),
 * and fusion never yields an invalid Mon.
 *
 * Run: pnpm vitest run apps/game/test/fuzz.property.test.ts
 * Reproduce a failure: fast-check prints the seed + counterexample.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MonAbilitiesSchema,
  MonFusionSchema,
  MonsRegistrySchema,
  type MonsRegistryEntry
} from "@eb/schemas";
import {
  FarmState,
  FARM_CATALOG,
  DECOR_CATALOG,
  type FarmBuildingKind,
  type FarmDecorKind
} from "../src/farmState";
import { Compendium } from "../src/compendium";
import { teachMoveCard, MOVE_CARDS } from "../src/moveCards";
import {
  createOwnedMon,
  executeFusion,
  resolveFusion,
  resolveFusionWithAccident,
  type OwnedMon
} from "../src/monsModel";
import { validateFarmSnapshot } from "../src/saveState";
import { validateCompendiumSnapshot } from "../src/compendium";

const NUM_RUNS = 400;

const BUILDING_KINDS = Object.keys(FARM_CATALOG) as FarmBuildingKind[];
const DECOR_KINDS = Object.keys(DECOR_CATALOG) as FarmDecorKind[];

// ---- FarmState: random op sequences must never brick the save ---------------
type FarmOp =
  | { t: "buildingBuy"; kind: FarmBuildingKind; x: number; y: number }
  | { t: "decorBuy"; kind: FarmDecorKind; x: number; y: number }
  | { t: "coins"; delta: number }
  | { t: "spend"; amount: number }
  | { t: "tick" }
  | { t: "sellBuilding"; idx: number }
  | { t: "sellDecor"; idx: number }
  | { t: "moveBuilding"; idx: number; x: number; y: number }
  | { t: "upgrade"; idx: number };

const cellCoord = fc.oneof(
  fc.integer({ min: -50, max: 4000 }),
  fc.constantFrom(0, -1, 8, 7, NaN, Infinity, -Infinity) // adversarial coords
);

const farmOp: fc.Arbitrary<FarmOp> = fc.oneof(
  fc.record({ t: fc.constant("buildingBuy" as const), kind: fc.constantFrom(...BUILDING_KINDS), x: cellCoord, y: cellCoord }),
  fc.record({ t: fc.constant("decorBuy" as const), kind: fc.constantFrom(...DECOR_KINDS), x: cellCoord, y: cellCoord }),
  fc.record({ t: fc.constant("coins" as const), delta: fc.integer({ min: -9999, max: 9999 }) }),
  fc.record({ t: fc.constant("spend" as const), amount: fc.integer({ min: -50, max: 9999 }) }),
  fc.record({ t: fc.constant("tick" as const) }),
  fc.record({ t: fc.constant("sellBuilding" as const), idx: fc.nat(8) }),
  fc.record({ t: fc.constant("sellDecor" as const), idx: fc.nat(8) }),
  fc.record({ t: fc.constant("moveBuilding" as const), idx: fc.nat(8), x: cellCoord, y: cellCoord }),
  fc.record({ t: fc.constant("upgrade" as const), idx: fc.nat(8) })
);

function applyFarmOp(farm: FarmState, op: FarmOp): void {
  switch (op.t) {
    case "buildingBuy": farm.placeBuilding(op.kind, { x: op.x, y: op.y }); break;
    case "decorBuy": farm.placeDecor(op.kind, { x: op.x, y: op.y }); break;
    case "coins": farm.addCoins(op.delta); break;
    case "spend": farm.spendCoins(op.amount); break;
    case "tick": farm.tickStep(); break;
    case "sellBuilding": farm.sellBuilding(farm.buildings[op.idx % Math.max(1, farm.buildings.length)]?.id ?? "x"); break;
    case "sellDecor": farm.sellDecor(farm.decor[op.idx % Math.max(1, farm.decor.length)]?.id ?? "x"); break;
    case "moveBuilding": farm.moveBuilding(farm.buildings[op.idx % Math.max(1, farm.buildings.length)]?.id ?? "x", { x: op.x, y: op.y }); break;
    case "upgrade": farm.upgradeBuilding(farm.buildings[op.idx % Math.max(1, farm.buildings.length)]?.id ?? "x"); break;
  }
}

describe("fuzz: FarmState invariants", () => {
  it("never produces a non-round-trippable / save-bricking state", () => {
    fc.assert(
      fc.property(fc.array(farmOp, { maxLength: 40 }), (ops) => {
        const farm = new FarmState();
        farm.addCoins(100000); // afford purchases
        for (const op of ops) applyFarmOp(farm, op);

        // 1. currency + rating stay non-negative finite integers
        expect(Number.isFinite(farm.swagCoins) && farm.swagCoins >= 0).toBe(true);
        expect(Number.isFinite(farm.swagRating()) && farm.swagRating() >= 0).toBe(true);

        // 2. every placed cell is a finite 8px-snapped integer (the snapCell class)
        for (const b of farm.buildings) {
          expect(Number.isInteger(b.cell.x) && Number.isInteger(b.cell.y)).toBe(true);
          expect(b.tier >= 1 && b.tier <= 3).toBe(true);
        }
        for (const d of farm.decor) {
          expect(Number.isInteger(d.cell.x) && Number.isInteger(d.cell.y)).toBe(true);
        }

        // 3. the snapshot round-trips AND passes the save validator
        const snap = farm.snapshot();
        expect(validateFarmSnapshot(snap)).not.toBeNull();
        const restored = new FarmState();
        restored.restore(snap);
        expect(restored.snapshot()).toEqual(snap);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---- Compendium: register/resummon invariants -------------------------------
const ownedMonArb: fc.Arbitrary<OwnedMon> = fc.record({
  registryId: fc.constantFrom("a", "b", "c", "d"),
  level: fc.integer({ min: 1, max: 99 }),
  xp: fc.nat(999999),
  bond: fc.nat(99),
  inherited: fc.array(fc.constantFrom("m1", "m2", "m3"), { maxLength: 4 })
});

describe("fuzz: Compendium invariants", () => {
  it("register keeps the highest level; resummon + snapshot are sound", () => {
    fc.assert(
      fc.property(fc.array(ownedMonArb, { maxLength: 30 }), (mons) => {
        const comp = new Compendium();
        const bestLevel = new Map<string, number>();
        for (const m of mons) {
          comp.register(m);
          bestLevel.set(m.registryId, Math.max(bestLevel.get(m.registryId) ?? 0, m.level));
        }
        for (const [id, lvl] of bestLevel) {
          const e = comp.get(id)!;
          expect(e.level).toBe(lvl);        // highest level retained
          expect(e.timesOwned).toBeGreaterThanOrEqual(1);
          expect(comp.resummonCost(e)).toBeGreaterThan(0);
          const fresh = comp.resummon(id)!;
          expect(fresh.level).toBe(lvl);    // re-summoned at registered level
          expect(fresh.bond).toBe(0);
        }
        // snapshot round-trip + validator
        const snap = comp.snapshot();
        expect(validateCompendiumSnapshot(snap)).not.toBeNull();
        const restored = new Compendium();
        restored.restore(snap);
        expect(restored.snapshot()).toEqual(snap);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---- Move cards: teach never duplicates or mutates --------------------------
describe("fuzz: teachMoveCard purity", () => {
  it("appends without duplicating and never mutates the input", () => {
    fc.assert(
      fc.property(ownedMonArb, fc.nat(MOVE_CARDS.length - 1), (mon, cardIdx) => {
        const card = MOVE_CARDS[cardIdx];
        const before = JSON.parse(JSON.stringify(mon));
        const taught = teachMoveCard(mon, card);
        expect(mon).toEqual(before);                       // input untouched
        expect(taught.inherited).toContain(card.abilityId);
        const count = taught.inherited.filter((a) => a === card.abilityId).length;
        expect(count).toBe(1);                             // no duplicate
        // teaching again is idempotent
        expect(teachMoveCard(taught, card).inherited).toEqual(taught.inherited);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ---- Fusion: real data, random parents/sacrifice, invariant results ---------
const registry = MonsRegistrySchema.parse(JSON.parse(readFileSync(resolve("content/mons/mons-registry.json"), "utf8")));
const abilities = MonAbilitiesSchema.parse(JSON.parse(readFileSync(resolve("content/mons/mon-abilities.json"), "utf8")));
const fusion = MonFusionSchema.parse(JSON.parse(readFileSync(resolve("content/mons/mon-fusion.json"), "utf8")));
const fusableMons: MonsRegistryEntry[] = registry.mons.filter((m) => !m.secretRare && m.race !== "Secret");

describe("fuzz: fusion never yields an invalid Mon", () => {
  it("random parents/sacrifice/accident produce level>=1, valid inheritance", () => {
    const idx = fc.nat(fusableMons.length - 1);
    fc.assert(
      fc.property(idx, idx, idx, fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 99 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.boolean(),
        (ai, bi, si, la, lb, roll, withSac) => {
          const A = fusableMons[ai], B = fusableMons[bi], S = fusableMons[si];
          if (A.id === B.id) return; // parents must differ
          const a = { entry: A, owned: { ...createOwnedMon(A), level: la } };
          const b = { entry: B, owned: { ...createOwnedMon(B), level: lb } };
          const sac = withSac && S.id !== A.id && S.id !== B.id ? { entry: S, owned: createOwnedMon(S) } : undefined;
          const ownedIds = new Set([A.id, B.id]);
          const preview = roll < 0.5
            ? resolveFusion(a, b, registry, fusion, abilities, ownedIds, sac)
            : resolveFusionWithAccident(a, b, registry, fusion, abilities, ownedIds, sac, () => roll, 0.5);
          if (!preview?.ok) return; // no candidate is a legal outcome, not a bug
          expect(preview.projectedLevel).toBeGreaterThanOrEqual(1);
          // inheritable list references known abilities only
          for (const id of preview.inheritable ?? []) {
            expect(abilities.abilities[id] !== undefined).toBe(true);
          }
          const result = executeFusion(preview, (preview.inheritable ?? []).slice(0, 2));
          if (result) {
            expect(result.owned.level).toBeGreaterThanOrEqual(1);
            expect(result.owned.xp).toBeGreaterThanOrEqual(0);
            expect(new Set(result.owned.inherited).size).toBe(result.owned.inherited.length); // no dup moves
          }
        }),
      { numRuns: NUM_RUNS }
    );
  });
});
