#!/usr/bin/env node
/**
 * Authors faithful EarthBound assist-PSI battle effects onto content/psi-overrides.json
 * from the ROM-RE in .codex/rom-output/psi-effects.json. Mirrors author-item-effects.mjs;
 * reuses the shared ItemUseEffect kinds via the PSI-effect subsystem (psi.effect).
 *
 * Provenance / modeling notes (ids 31-50, EB α/σ/β/Ω tiers):
 * - Shield 31-34 + PSI Shield 35-38: EB halve (α/σ) or reflect (β/Ω) for 3 hits. Modeled
 *   uniformly as shielded 50% for ~3 turns (no reflect mechanic; shielded reduces all damage).
 * - Offense up 39-40 / Defense down 41-42: EB ±stat/16 per cast (relative); flat ±8 approx.
 *   Negative amount routes the debuff to the enemy via itemEffectTargetSide.
 * - Hypnosis 43-44 -> asleep (wears off via wake chance). Paralysis 47-48 -> paralyzed,
 *   Brainshock 49-50 -> confused; both given remaining:3 as a balance proxy (EB gates landing
 *   on per-enemy vulnerability%, which isn't modeled yet, so inflicts always land here).
 * - PSI Magnet 45-46 -> drainPp 5 (EB drains a random 2-8 PP from the enemy to the caster).
 * - 'all'-tier PSI hit every target in EB; modeled single-target.
 *
 * Idempotent: merges `effect` into each byPsiId entry, preserving any Swagbound name.
 */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../content/psi-overrides.json", import.meta.url);

const EFFECTS = {};
for (const id of [31, 32, 33, 34, 35, 36, 37, 38]) {
  EFFECTS[id] = { kind: "inflictStatus", ailment: "shielded", magnitude: 50, remaining: 3 };
}
EFFECTS[39] = { kind: "buffStat", stat: "offense", amount: 8 };
EFFECTS[40] = { kind: "buffStat", stat: "offense", amount: 8 };
EFFECTS[41] = { kind: "buffStat", stat: "defense", amount: -8 };
EFFECTS[42] = { kind: "buffStat", stat: "defense", amount: -8 };
EFFECTS[43] = { kind: "inflictStatus", ailment: "asleep" };
EFFECTS[44] = { kind: "inflictStatus", ailment: "asleep" };
EFFECTS[45] = { kind: "drainPp", amount: 5 };
EFFECTS[46] = { kind: "drainPp", amount: 5 };
EFFECTS[47] = { kind: "inflictStatus", ailment: "paralyzed", remaining: 3 };
EFFECTS[48] = { kind: "inflictStatus", ailment: "paralyzed", remaining: 3 };
EFFECTS[49] = { kind: "inflictStatus", ailment: "confused", remaining: 3 };
EFFECTS[50] = { kind: "inflictStatus", ailment: "confused", remaining: 3 };

const data = JSON.parse(readFileSync(PATH, "utf8"));
for (const [id, effect] of Object.entries(EFFECTS)) {
  const entry = (data.byPsiId[id] ??= {});
  entry.effect = effect;
}
writeFileSync(PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Authored ${Object.keys(EFFECTS).length} PSI effects. Total with effects: ${Object.values(data.byPsiId).filter((e) => e.effect).length}`);
