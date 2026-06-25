#!/usr/bin/env node
/**
 * Authors faithful battle effects onto content/item-overrides.json from the EarthBound
 * ROM-RE (see .codex/rom-output/consumable-effects.json, gitignored). Closes the
 * "consumables with no effect" gap from the battle-action matrix.
 *
 * Provenance: HP/PP heal amount = EB item Argument[1] * 6 (dispatch routine SNES $C2B27D),
 * verified against canonical values (Cookie=6, Fries=24, Bread roll=30, Coffee=12).
 * EB minor-ailment cures map to Swagbound 'poisoned' (the representative minor ailment);
 * the broad cure-all (Secret herb) maps to 'all'. EB cold/sunstroke/etc. have no Swagbound
 * equivalent, so those remedies become poison cures.
 *
 * Idempotent: merges `effect` into each existing byItemId entry, preserving Swagbound names.
 * Re-run after editing the maps below.
 */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../content/item-overrides.json", import.meta.url);

// HP heal (faithful amount = arg[1] * 6). 97 Large pizza heals the whole party in EB; here
// it is single-target. 100 Brain food lunch is HP+PP in EB; the PP half is not modeled yet.
const HEAL = {
  88: 6, 89: 24, 90: 48, 91: 42, 92: 84, 93: 84, 94: 108, 95: 120, 96: 216, 97: 240,
  100: 300, 102: 60, 103: 30, 106: 6, 107: 60, 108: 84, 118: 6, 119: 6, 120: 6, 121: 6,
  122: 6, 123: 6, 124: 6, 126: 6, 189: 30, 190: 24, 191: 60, 198: 30, 223: 42, 232: 12,
  233: 96, 234: 108, 235: 300, 236: 216, 237: 42, 238: 84, 239: 84, 240: 126, 241: 168,
  242: 150, 243: 204, 244: 252, 245: 300, 251: 18
};
// PP restore.
const PP = { 98: 120, 99: 480, 110: 6, 207: 120, 246: 6, 247: 240 };
// Status cures: EB poison/minor-ailment -> Swagbound 'poisoned'; broad cure -> 'all'.
const CURE = { 111: "poisoned", 112: "poisoned", 127: "poisoned", 128: "poisoned", 129: "all", 188: "poisoned" };
// Offensive fixed damage (ROM-RE: rockets = hits*$0078=120 each, single-target; bombs are
// immediate operands). 146 "Multi bottle rocket" is single-target despite its name.
const DAMAGE = { 144: 120, 145: 600, 146: 2400, 147: 90, 148: 270 };
// Revive: Horn of life / Cup of Lifenoodles restore a fainted ally to FULL HP (EB writes Max HP).
// 9999 is a sentinel — applyHeal caps it at the combatant's maxHp, i.e. a full revive.
const REVIVE = { 130: 9999, 252: 9999 };
// Battle stat buff. EB Defense spray is +floor(Defense/16) (relative, ~+6%); modeled here as a
// flat approximation. (Sudden guts pill #159 is Guts*2 — neither guts nor multipliers exist in
// the buffStat kind yet, so it is intentionally left unmapped.)
const BUFF = { 161: { stat: "defense", amount: 5 } };
// Immobilize items (EB status group $1f=4, "can't act this turn") -> mapped to paralyzed.
// remaining is an estimated duration (the exact EB wear-off wasn't decoded). 142 also deals
// damage in EB; only the signature immobilize is modeled.
const INFLICT = { 142: { ailment: "paralyzed", remaining: 3 }, 152: { ailment: "paralyzed", remaining: 3 } };
// Swagbound names for the consumables that had no existing override (civic / signal-tech theme,
// matching the established rename scheme). Red Tape = the bureaucratic immobilizer.
const NAMES = {
  95: "Ward Pie", 97: "District Pie", 98: "Static Caramel", 99: "Relay Truffle",
  142: "Red Tape", 152: "Foul Socks", 188: "Relief Patch", 189: "Ledger Yogurt"
};

const data = JSON.parse(readFileSync(PATH, "utf8"));
// Existing entries keep their Swagbound name; items with no override become effect-only
// (they keep their extracted EB name — these are flagged to rename later).
const entry = (id) => (data.byItemId[id] ??= {});

for (const [id, amount] of Object.entries(HEAL)) entry(id).effect = { kind: "healHp", amount };
for (const [id, amount] of Object.entries(PP)) entry(id).effect = { kind: "recoverPp", amount };
for (const [id, ailment] of Object.entries(CURE)) entry(id).effect = { kind: "cureStatus", ailment };
for (const [id, amount] of Object.entries(DAMAGE)) entry(id).effect = { kind: "damage", amount };
for (const [id, amount] of Object.entries(REVIVE)) entry(id).effect = { kind: "revive", amount };
for (const [id, b] of Object.entries(BUFF)) entry(id).effect = { kind: "buffStat", stat: b.stat, amount: b.amount };
for (const [id, inf] of Object.entries(INFLICT)) {
  entry(id).effect = { kind: "inflictStatus", ailment: inf.ailment, ...(inf.remaining ? { remaining: inf.remaining } : {}) };
}
for (const [id, name] of Object.entries(NAMES)) entry(id).name = name;

writeFileSync(PATH, `${JSON.stringify(data, null, 2)}\n`);
const counts = [HEAL, PP, CURE, DAMAGE, REVIVE, BUFF, INFLICT].map((m) => Object.keys(m).length);
console.log(`Authored: ${counts[0]} heal, ${counts[1]} pp, ${counts[2]} cure, ${counts[3]} damage, ${counts[4]} revive, ${counts[5]} buff, ${counts[6]} inflict`);
console.log(`Total items with effects: ${Object.values(data.byItemId).filter((e) => e.effect).length}`);
