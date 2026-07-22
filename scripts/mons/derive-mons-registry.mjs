#!/usr/bin/env node
// Derives content/mons/mons-registry.json from the 777 Super Metal Mons Gen 2
// manifests in swagbound-new. DETERMINISTIC: same input -> byte-identical output,
// forever. Stats come from (race archetype x tier x tokenId-hash jitter); no RNG.
//
// Usage: node scripts/mons/derive-mons-registry.mjs [--check]
//   --check  verify the committed registry matches a fresh derivation (CI gate)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = "/Users/nickgeorge-studio/Projects/swagbound-new/asset-lab/curation/good-new-sprites/supermetalmons-gen2-direct-codex-anchor96-0001";
const OUT = join(ROOT, "content", "mons", "mons-registry.json");

// --- trait normalization ------------------------------------------------------
const TIERS = { Fine: 1, Good: 2, Superb: 3, Excellent: 4, Perfect: 5 };
const RACES = [
  "Drainer", "Angel", "Demon", "Mystic", "Trickster",
  "Fielder", "Spirit", "Zombie", "Vampire", "Ancient"
];
const MATERIAL_ELEMENT = {
  Gum: "rubber", Clay: "earth", Metal: "steel", Mana: "arcana", Gem: "crystal",
  Slime: "ooze", Bone: "grave", Ice: "frost", Dust: "ash",
  "Super metal": "steel", Ultralight: "arcana", "Super mana": "arcana", Liquid: "ooze"
};
// Non-plain-ASCII names get a font-safe display name (audited 2026-07-21: 7 names).
const DISPLAY_OVERRIDES = {
  "supermetalmons-gen2-390-samo": "Samo",
  "supermetalmons-gen2-548-mmmmon-upgradeee": "Mmmmon Upgradeee",
  "supermetalmons-gen2-575-clown-pogger-0": "Clown Pogger",
  "supermetalmons-gen2-678-starcat-3": "Starcat",
  "supermetalmons-gen2-717-bunnigotchi": "Bunnigotchi",
  // Non-ASCII names whose strip-fallback amputated letters ("pərl"->"prl",
  // "Applcrème"->"Applcrme"): transliterate instead.
  "supermetalmons-gen2-185-p-rl": "Perl",
  "supermetalmons-gen2-489-applcr-me": "Applcreme"
};
const norm = (v) => (typeof v === "string" ? v.trim() : v);
// Trait gaps in the source collection, resolved by hand (audited 2026-07-21):
// Minbot (745) is the only non-secret mon with no Type trait.
const MANUAL_RACE = { "supermetalmons-gen2-745-minbot": "Fielder" };

// --- deterministic hash (FNV-1a 32-bit over id string) ------------------------
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
// stable pseudo-random in [0,1) derived from (id, salt)
const jitter = (id, salt) => fnv1a(`${id}:${salt}`) / 0xffffffff;

// --- race archetypes (multipliers on the tier base statline) ------------------
// hp/pp/off/def/spd express each race's battle identity.
const ARCHETYPES = {
  Drainer:   { hp: 1.15, pp: 0.9,  off: 0.95, def: 1.1,  spd: 0.9  },
  Angel:     { hp: 0.95, pp: 1.3,  off: 0.8,  def: 1.0,  spd: 1.05 },
  Demon:     { hp: 1.0,  pp: 0.9,  off: 1.3,  def: 0.9,  spd: 1.0  },
  Mystic:    { hp: 0.9,  pp: 1.4,  off: 0.85, def: 0.9,  spd: 1.0  },
  Trickster: { hp: 0.85, pp: 1.0,  off: 0.95, def: 0.85, spd: 1.4  },
  Fielder:   { hp: 1.05, pp: 1.0,  off: 1.05, def: 1.05, spd: 1.05 },
  Spirit:    { hp: 0.75, pp: 1.5,  off: 0.9,  def: 0.8,  spd: 1.1  },
  Zombie:    { hp: 1.35, pp: 0.7,  off: 1.0,  def: 1.25, spd: 0.6  },
  Vampire:   { hp: 0.95, pp: 1.0,  off: 1.15, def: 0.9,  spd: 1.25 },
  Ancient:   { hp: 1.2,  pp: 1.1,  off: 1.25, def: 1.15, spd: 0.55 },
  Secret:    { hp: 1.25, pp: 1.25, off: 1.25, def: 1.25, spd: 1.25 }
};
// tier -> base level band [min, max] and base statline scale
const TIER_LEVEL_BAND = { 1: [2, 8], 2: [6, 14], 3: [12, 22], 4: [18, 30], 5: [26, 38] };
const TIER_STAT_SCALE = { 1: 1.0, 2: 1.25, 3: 1.6, 4: 2.05, 5: 2.6 };
// statline at tier scale 1.0, level band bottom (EB-comparable early-game numbers)
const BASE = { hp: 34, pp: 12, off: 9, def: 7, spd: 7 };

function deriveStats(id, race, tier) {
  const a = ARCHETYPES[race];
  const scale = TIER_STAT_SCALE[tier];
  const band = TIER_LEVEL_BAND[tier];
  const lvlJ = jitter(id, "lvl");
  const baseLevel = band[0] + Math.floor(lvlJ * (band[1] - band[0] + 1));
  const stat = (key, mult) => {
    const j = 0.9 + jitter(id, key) * 0.2; // +-10%
    return Math.max(1, Math.round(BASE[key] * mult * scale * j));
  };
  return {
    baseLevel,
    maxHp: stat("hp", a.hp),
    maxPp: stat("pp", a.pp),
    offense: stat("off", a.off),
    defense: stat("def", a.def),
    speed: stat("spd", a.spd)
  };
}

// --- main ---------------------------------------------------------------------
const entries = [];
for (const dir of readdirSync(SOURCE).sort()) {
  const mf = join(SOURCE, dir, "manifest.json");
  if (!existsSync(mf)) continue;
  const m = JSON.parse(readFileSync(mf, "utf8"));
  if (m.schema !== "swagbound.superMetalMonsGen2BattleAnchor96Item.v1") continue;
  const attrs = {};
  for (const a of m.attributes ?? []) {
    const key = norm(a.traitType);
    if (!(key in attrs)) attrs[key] = norm(a.value);
  }
  const rawType = attrs["Type"] ?? MANUAL_RACE[m.id] ?? null;
  const secretRare = rawType === "[SECRET RARE]";
  const race = secretRare ? "Secret" : rawType;
  if (!secretRare && !RACES.includes(race)) {
    throw new Error(`${m.id}: unknown race ${JSON.stringify(rawType)}`);
  }
  const tier = secretRare ? 5 : (TIERS[attrs["GAN Brilliance"]] ?? null);
  if (!tier) throw new Error(`${m.id}: unknown brilliance ${JSON.stringify(attrs["GAN Brilliance"])}`);
  let materials = ["Material", "Material 2", "Material 3"]
    .map((k) => attrs[k]).filter(Boolean);
  // Secret rares carry no material traits in the source collection; they are
  // canonically "Super mana" (-> arcana), fitting their special-fusion role.
  if (materials.length === 0 && secretRare) materials = ["Super mana"];
  const element = MATERIAL_ELEMENT[materials[0]] ?? "rubber";
  for (const mat of materials) {
    if (!(mat in MATERIAL_ELEMENT)) throw new Error(`${m.id}: unknown material ${mat}`);
  }
  const personality = secretRare ? null : (attrs["Personality"] ?? null);
  if (!secretRare && !personality) throw new Error(`${m.id}: missing personality`);
  const battleRel = `assets/mons/${m.id}/battle-260.png`;
  const overworldRel = `assets/mons/${m.id}/overworld-96.png`;
  entries.push({
    id: m.id,
    tokenId: m.tokenId,
    name: m.name,
    displayName: DISPLAY_OVERRIDES[m.id] ?? (/^[\x20-\x7e]+$/.test(m.name) ? undefined : m.name.replace(/[^\x20-\x7e]/g, "").trim() || `Mon ${m.tokenId}`),
    race,
    race2: secretRare ? undefined : (attrs["Type 2"] && attrs["Type 2"] !== rawType ? attrs["Type 2"] : undefined),
    tier,
    secretRare: secretRare || undefined,
    personality: personality ?? undefined,
    personality2: attrs["Personality 2"] && attrs["Personality 2"] !== personality ? attrs["Personality 2"] : undefined,
    materials,
    element,
    ...deriveStats(m.id, race, tier),
    sprites: { battle: battleRel, overworld: overworldRel }
  });
}

if (entries.length !== 777) {
  throw new Error(`expected 777 mons, derived ${entries.length}`);
}

const registry = {
  schema: "swagbound.mons-registry.v1",
  source: "supermetalmons-gen2-direct-codex-anchor96-0001",
  count: entries.length,
  mons: entries
};
const json = JSON.stringify(registry, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const existing = readFileSync(OUT, "utf8");
  if (existing !== json) {
    console.error("REGISTRY DRIFT: committed registry does not match fresh derivation");
    process.exit(1);
  }
  console.log("registry check OK (777 mons, derivation stable)");
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, json);
  const byRace = {};
  for (const e of entries) byRace[e.race] = (byRace[e.race] ?? 0) + 1;
  console.log(`wrote ${OUT} (${entries.length} mons)`);
  console.log("by race:", JSON.stringify(byRace));
}
