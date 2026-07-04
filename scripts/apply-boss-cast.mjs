#!/usr/bin/env node
/**
 * Apply a boss-cast.json exported from tools/boss-casting-studio.html.
 *
 * For each boss it:
 *   1. copies the chosen Milady's battle + overworld sprite into the game assets
 *   2. points the boss's lead enemy at that sprite (content/sprite-overrides.json)
 *   3. names the enemy after its source collection (content/enemy-name-families.json)
 *   4. writes the pre-battle dialogue (content/triggers.json)
 *   5. writes the in-battle taunts (content/boss-battle-dialogue.json)
 * then rebuilds and reverts the incidental world-chunk artifacts.
 *
 * Usage: node scripts/apply-boss-cast.mjs [path/to/boss-cast.json]
 *   VAULT env var overrides the swagbound-new asset vault location.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..");
const VAULT = process.env.VAULT || "/Users/nickgeorge-studio/Projects/swagbound-new";
const castPath = resolve(process.argv[2] || "boss-cast.json");

const ENEMY_ASSET_DIR = join(REPO, "apps/game/public/assets/swagbound/enemy");
const OW_ASSET_DIR = join(REPO, "apps/game/public/assets/swagbound/overworld-npc");
const SPRITE_OVERRIDES = join(REPO, "content/sprite-overrides.json");
const NAME_FAMILIES = join(REPO, "content/enemy-name-families.json");
const TRIGGERS = join(REPO, "content/triggers.json");
const BOSS_DIALOGUE = join(REPO, "content/boss-battle-dialogue.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

/** Split a long taunt utterance into <=118-char beats at sentence boundaries. */
function splitBeats(s, cap = 118) {
  s = s.trim();
  if (s.length <= cap) return [s];
  const sentences = s.match(/.+?(?:[.?!]["”]?(?=\s|$)|$)/g) || [s];
  const beats = [];
  let cur = "";
  for (const p of sentences) {
    const t = p.trim();
    if (!cur) cur = t;
    else if (cur.length + 1 + t.length <= cap) cur += " " + t;
    else { beats.push(cur); cur = t; }
  }
  if (cur) beats.push(cur);
  const out = [];
  for (let b of beats) {
    while (b.length > cap) {
      let cut = b.lastIndexOf(" ", cap);
      if (cut <= 0) cut = cap;
      out.push(b.slice(0, cut).trim());
      b = b.slice(cut).trim();
    }
    out.push(b);
  }
  return out;
}
const expand = (arr) => (arr || []).flatMap((s) => splitBeats(s));

if (!existsSync(castPath)) {
  console.error(`boss-cast not found: ${castPath}`);
  process.exit(1);
}
const cast = readJson(castPath);
if (cast.schema !== "swagbound.boss-cast.v1" || !Array.isArray(cast.bosses)) {
  console.error("not a valid boss-cast.v1 file");
  process.exit(1);
}

const spriteOverrides = readJson(SPRITE_OVERRIDES);
spriteOverrides.byEnemyId ??= {};
spriteOverrides.overworldByEnemyId ??= {};
const families = readJson(NAME_FAMILIES);
const triggers = readJson(TRIGGERS);
const bossDialogue = existsSync(BOSS_DIALOGUE)
  ? readJson(BOSS_DIALOGUE)
  : { schema: "swagbound.boss-battle-dialogue.v1", byBattleGroup: {} };
bossDialogue.byBattleGroup ??= {};

const summary = [];
for (const boss of cast.bosses) {
  const { triggerId, battleGroup, leadEnemyId, spriteId, spriteCollection, spriteBattlePath } = boss;
  const key = String(leadEnemyId);

  // 1. copy sprites (battle + overworld) if a source is available
  if (spriteBattlePath) {
    const srcBattle = join(VAULT, spriteBattlePath);
    const srcOw = join(dirname(srcBattle), "overworld-48.png");
    const dstBattle = join(ENEMY_ASSET_DIR, `gns-${spriteId}.png`);
    const dstOw = join(OW_ASSET_DIR, `gns-${spriteId}-ow.png`);
    if (existsSync(srcBattle)) copyFileSync(srcBattle, dstBattle);
    if (existsSync(srcOw)) copyFileSync(srcOw, dstOw);
  }

  // 2. sprite overrides (battle + overworld)
  spriteOverrides.byEnemyId[key] = {
    image: `assets/swagbound/enemy/gns-${spriteId}.png`,
    displayHeight: 160, originX: 0.5, originY: 0.5
  };
  spriteOverrides.overworldByEnemyId[key] = {
    image: `assets/swagbound/overworld-npc/gns-${spriteId}-ow.png`,
    frameWidth: 48, frameHeight: 48,
    animations: { down: [0], left: [0], right: [0], up: [0] },
    displayHeight: 24, originX: 0.5, originY: 1
  };

  // 3. name the enemy after its source collection (<=24, EB cap)
  if (spriteCollection) {
    const name = spriteCollection.slice(0, 24);
    for (const fam of Object.keys(families.families)) {
      families.families[fam] = families.families[fam].filter((id) => id !== leadEnemyId);
      if (families.families[fam].length === 0) delete families.families[fam];
    }
    (families.families[name] ??= []).push(leadEnemyId);
    families.families[name] = [...new Set(families.families[name])].sort((a, b) => a - b);
  }

  // 4. pre-battle dialogue
  const trig = triggers.triggers.find((t) => t.id === triggerId);
  if (trig && Array.isArray(boss.preBattle) && boss.preBattle.length) {
    trig.dialogue = boss.preBattle.map((s) => s.trim()).filter(Boolean);
  }

  // 5. in-battle taunts
  bossDialogue.byBattleGroup[String(battleGroup)] = {
    ...(boss.personaName ? { personaName: boss.personaName.slice(0, 24) } : {}),
    onStart: expand(boss.onStart),
    onLowHp: expand(boss.onLowHp),
    onDefeat: expand(boss.onDefeat),
    lowHpThreshold: 0.34
  };
  summary.push(`  ${triggerId} (grp ${battleGroup}) -> ${spriteCollection || "?"} / ${spriteId}`);
}

writeJson(SPRITE_OVERRIDES, spriteOverrides);
// families/schema order: keep schema first
writeJson(NAME_FAMILIES, {
  schema: families.schema,
  families: Object.fromEntries(Object.entries(families.families).sort(([a], [b]) => a.localeCompare(b)))
});
writeJson(TRIGGERS, triggers);
writeJson(BOSS_DIALOGUE, bossDialogue);

console.log("applied boss cast:\n" + summary.join("\n"));
console.log("\nrebuilding…");
execFileSync("node", ["--import", "tsx", "scripts/build-eb-fullworld.ts"], { cwd: REPO, stdio: "inherit" });
// revert incidental world-chunk artifacts the build regenerates
try {
  execFileSync("git", ["checkout", "--", "apps/game/public/generated/assets/"], { cwd: REPO });
} catch { /* nothing to revert */ }
console.log("\ndone. Review `git status`, then commit content/ + the new gns-*.png assets.");
