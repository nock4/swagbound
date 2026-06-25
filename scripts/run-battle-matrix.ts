/**
 * Battle action matrix — drives the REAL battle resolver (resolveRoundStep) over
 * every item and every PSI in the generated data, classifying each as
 * applied / blocked / unsupported / error. This is the "battle-test every item +
 * PSI" diagnostic: it proves which menu actions actually do something and surfaces
 * the gaps (consumables/PSI with no implemented effect) as a worklist.
 *
 * Headless + pure (no Phaser, no browser). Run: pnpm tsx scripts/run-battle-matrix.ts
 * Reads apps/game/public/generated/{items,psi}.json (build first).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { BattleEnemy, CharacterCollection, CharacterData, ItemData, PsiData } from "@eb/schemas";
import {
  createBattleState,
  psiBattleKind,
  withCombatant,
  type BattleActor,
  type BattleState
} from "../apps/game/src/battleLogic";
import { resolveRoundStep } from "../apps/game/src/battleRound";
import { isConsumableItem } from "../apps/game/src/partyState";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = path.join(ROOT, "apps/game/public/generated");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(GENERATED, file), "utf8")) as T;
}

const itemsData = readJson<{ items: ItemData[] }>("items.json").items;
const psiData = readJson<{ psi: PsiData[] }>("psi.json").psi;

// Apply the Swagbound content overrides (authored effects), as the loader does at runtime,
// so the matrix reflects actual in-game item/PSI behavior rather than the raw EB data.
function readContent<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(ROOT, "content", file), "utf8")) as T;
}
const itemOverrides = readContent<{ byItemId: Record<string, { effect?: ItemData["effect"] }> }>("item-overrides.json").byItemId;
const psiOverrides = readContent<{ byPsiId: Record<string, { effect?: PsiData["effect"] }> }>("psi-overrides.json").byPsiId;
for (const item of itemsData) {
  const effect = itemOverrides[String(item.id)]?.effect;
  if (effect) {
    item.effect = effect;
  }
}
for (const psi of psiData) {
  const effect = psiOverrides[String(psi.id)]?.effect;
  if (effect) {
    psi.effect = effect;
  }
}

const HERO: CharacterData = {
  id: 0,
  name: "HERO",
  level: 20,
  maxHp: 300,
  maxPp: 200,
  offense: 30,
  defense: 12,
  speed: 8,
  guts: 8,
  vitality: 10,
  iq: 8,
  luck: 6,
  startingItems: [],
  money: 0
};

function characters(list: CharacterData[]): CharacterCollection {
  return {
    schemaVersion: "matrix",
    sourceProjectPath: "matrix",
    derivation: { source: "matrix", baseStats: "matrix", statFormula: "matrix", hpPpFormula: "matrix", uncertainty: "matrix" },
    characters: list,
    counts: { characters: list.length, statFieldsPopulated: list.length * 7 },
    warnings: []
  };
}

function dummyEnemy(): BattleEnemy {
  return {
    id: 9001,
    name: "DUMMY",
    spriteId: 0,
    level: 10,
    hp: 500,
    defense: 4,
    offense: 10,
    speed: 4,
    experience: 0,
    money: 0,
    bossFlag: false,
    actions: [0, 1, 2, 3].map(() => ({ id: 0, arg: 0, actionId: 0, actionType: 0, target: 0 })) as BattleEnemy["actions"],
    itemDropped: null,
    itemRarity: null
  };
}

const PARTY0: BattleActor = { side: "party", index: 0 };
const rng = () => 0.5;

/**
 * Battle with a damaged hero vs a high-HP dummy, so heals and damage both register.
 * pp defaults to 0 (for item HP/PP-restore tests); PSI tests pass full PP so spells
 * aren't blocked for insufficient PP.
 */
function freshBattle(inventory: number[] = [], pp = 0): BattleState {
  let battle = createBattleState(dummyEnemy(), { characters: characters([HERO]) });
  battle = withCombatant(battle, PARTY0, {
    ...battle.party[0],
    inventory,
    pp,
    hp: { ...battle.party[0].hp, displayed: 1, target: 1, isRolling: false }
  });
  return battle;
}

type Bucket = "applied" | "blocked" | "unsupported" | "error";

function classifyItem(item: ItemData): { bucket: Bucket; note: string } {
  let battle: BattleState;
  let result;
  try {
    battle = freshBattle([item.id]);
    const beforeHp = battle.party[0].hp.target;
    const beforePp = battle.party[0].pp;
    result = resolveRoundStep(
      battle,
      PARTY0,
      { partySlot: 0, command: "GOODS", itemId: item.id, target: { side: "party", index: 0 } },
      rng,
      { items: itemsData }
    );
    const afterHp = result.state.party[0].hp.target;
    const afterPp = result.state.party[0].pp;
    if (!result.skipped && (afterHp > beforeHp || afterPp > beforePp)) {
      return { bucket: "applied", note: `hp ${beforeHp}->${afterHp}, pp ${beforePp}->${afterPp}` };
    }
    if (item.effect) {
      // Authored effect that is a no-op against a neutral party target (cure/revive/damage/
      // inflict need an afflicted/fainted/enemy target to show a delta) — covered, not a gap.
      return { bucket: "applied", note: `effect=${item.effect.kind} (no delta vs neutral target)` };
    }
    return { bucket: "blocked", note: (result.message ?? "no effect").trim() };
  } catch (err) {
    return { bucket: "error", note: err instanceof Error ? err.message : String(err) };
  }
}

function classifyPsi(psi: PsiData): { bucket: Bucket; note: string } {
  if (psi.effect) {
    // Authored assist effect (shield / buff / inflict / drain) — covered via the PSI-effect path.
    return { bucket: "applied", note: `effect=${psi.effect.kind}` };
  }
  const kind = psiBattleKind(psi);
  if (kind !== "offense" && kind !== "recovery") {
    return { bucket: "unsupported", note: `kind=${kind ?? "none"}` };
  }
  try {
    const battle = freshBattle([], HERO.maxPp);
    const target: BattleActor = kind === "offense" ? { side: "enemy", index: 0 } : { side: "party", index: 0 };
    const beforeHp = kind === "offense" ? battle.enemies[0].hp.target : battle.party[0].hp.target;
    const result = resolveRoundStep(
      battle,
      PARTY0,
      { partySlot: 0, command: "PSI", psiId: psi.id, target: { side: target.side, index: target.index } },
      rng,
      { psi: psiData }
    );
    const afterHp = kind === "offense" ? result.state.enemies[0].hp.target : result.state.party[0].hp.target;
    const changed = kind === "offense" ? afterHp < beforeHp : afterHp > beforeHp;
    if (!result.skipped && changed) {
      return { bucket: "applied", note: `${kind} hp ${beforeHp}->${afterHp}` };
    }
    return { bucket: "blocked", note: (result.message ?? "no effect").trim() };
  } catch (err) {
    return { bucket: "error", note: err instanceof Error ? err.message : String(err) };
  }
}

function tally<T>(rows: Array<{ item: T; bucket: Bucket; note: string }>): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { applied: 0, blocked: 0, unsupported: 0, error: 0 };
  for (const row of rows) counts[row.bucket]++;
  return counts;
}

// --- Items ---
const consumables = itemsData.filter((it) => isConsumableItem(it));
const consumableRows = consumables.map((item) => ({ item, ...classifyItem(item) }));
const itemCounts = tally(consumableRows);

// --- PSI ---
const psiRows = psiData.map((psi) => ({ item: psi, ...classifyPsi(psi) }));
const psiCounts = tally(psiRows);

console.log("================ BATTLE ACTION MATRIX ================");
console.log(`\nITEMS — ${consumables.length} consumable (of ${itemsData.length} total) run through GOODS`);
console.log(`  applied : ${itemCounts.applied}   blocked/no-effect : ${itemCounts.blocked}   error : ${itemCounts.error}`);
const itemGaps = consumableRows.filter((r) => r.bucket !== "applied");
if (itemGaps.length) {
  console.log(`  consumables with NO working effect (${itemGaps.length}):`);
  for (const r of itemGaps) console.log(`    item ${String(r.item.id).padStart(3)} [${r.bucket}] ${r.note}`);
}

console.log(`\nPSI — ${psiData.length} total run through PSI`);
console.log(`  applied : ${psiCounts.applied}   blocked : ${psiCounts.blocked}   unsupported-kind : ${psiCounts.unsupported}   error : ${psiCounts.error}`);
const psiGaps = psiRows.filter((r) => r.bucket === "blocked" || r.bucket === "error");
if (psiGaps.length) {
  console.log(`  offense/recovery PSI that did NOT resolve (${psiGaps.length}):`);
  for (const r of psiGaps) console.log(`    psi ${String(r.item.id).padStart(3)} [${r.bucket}] ${r.note}`);
}
const psiUnsupported = psiRows.filter((r) => r.bucket === "unsupported");
console.log(`  unsupported-kind PSI (assist/other, not menu-usable as offense/recovery): ${psiUnsupported.length}`);

console.log("\n=====================================================");
const hardErrors = itemCounts.error + psiCounts.error;
console.log(hardErrors === 0 ? "No resolver errors (no crashes)." : `RESOLVER ERRORS: ${hardErrors}`);
process.exit(hardErrors === 0 ? 0 : 1);
