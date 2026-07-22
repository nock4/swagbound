#!/usr/bin/env node
// Promotes the 777 mon sprites (battle-260 + overworld-anchor-96) from the
// swagbound-new asset vault into apps/game/public/generated/assets/mons/<id>/.
// Idempotent: skips files whose size already matches. ~63 MB total.
//
// Usage: node scripts/mons/promote-mon-assets.mjs [--check]

import { readFileSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = "/Users/nickgeorge-studio/Projects/swagbound-new/asset-lab/curation/good-new-sprites/supermetalmons-gen2-direct-codex-anchor96-0001";
const DEST = join(ROOT, "apps", "game", "public", "generated", "assets", "mons");
const REGISTRY = join(ROOT, "content", "mons", "mons-registry.json");

const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
const check = process.argv.includes("--check");
let copied = 0, skipped = 0, missing = 0;

for (const mon of registry.mons) {
  const pairs = [
    [join(SOURCE, mon.id, "battle-260.png"), join(DEST, mon.id, "battle-260.png")],
    [join(SOURCE, mon.id, "overworld-anchor-96.png"), join(DEST, mon.id, "overworld-96.png")]
  ];
  for (const [src, dst] of pairs) {
    if (!existsSync(src)) { console.error(`MISSING SOURCE: ${src}`); missing++; continue; }
    const srcSize = statSync(src).size;
    if (existsSync(dst) && statSync(dst).size === srcSize) { skipped++; continue; }
    if (check) { console.error(`STALE/ABSENT: ${dst}`); missing++; continue; }
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
    copied++;
  }
}

// Sync the mons content packs (registry + authored packs) into generated/ so the
// runtime can fetch them (content/ is inert until mirrored, same as other packs).
const CONTENT_DIR = join(ROOT, "content", "mons");
const GEN_DIR = join(ROOT, "apps", "game", "public", "generated", "mons");
mkdirSync(GEN_DIR, { recursive: true });
let synced = 0;
for (const file of ["mons-registry.json", "mon-abilities.json", "mon-fusion.json", "mon-question-banks.json", "mon-story.json"]) {
  const src = join(CONTENT_DIR, file);
  if (!existsSync(src)) { console.warn(`(not yet authored: ${file})`); continue; }
  copyFileSync(src, join(GEN_DIR, file));
  synced++;
}

if (missing > 0) { console.error(`${missing} problems`); process.exit(1); }
console.log(`mon assets: ${copied} copied, ${skipped} up-to-date (${registry.mons.length} mons); ${synced} content packs synced`);
