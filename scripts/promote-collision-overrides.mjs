// Promote generated collision-override candidates into the authored file.
//
// Discipline (docs/collision-semantics.md): generators NEVER write
// content/collision-overrides.json. This promoter is the only bridge:
//   - reads tmp/collision/override-candidates.json (from collision-reachability)
//   - appends the selected candidates' rects to content/collision-overrides.json
//   - dedupes any rect fully covered by existing rects
//   - never touches existing entries (append-only; hand-authored rects are safe)
// Review the git diff before committing.
//
// Usage:
//   node scripts/promote-collision-overrides.mjs --ids 0,2,5   # specific candidates
//   node scripts/promote-collision-overrides.mjs --all         # everything
//   node scripts/promote-collision-overrides.mjs --town onett  # all candidates in a town
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CANDIDATES = path.join(ROOT, "tmp/collision/override-candidates.json");
const AUTHORED = path.join(ROOT, "content/collision-overrides.json");

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};
const ALL = args.includes("--all");
const IDS = (argValue("--ids") ?? "").split(",").filter(Boolean).map(Number);
const TOWN = argValue("--town");
if (!ALL && IDS.length === 0 && !TOWN) {
  console.error("select candidates: --ids 0,2 | --town onett | --all");
  process.exit(1);
}

const { candidates } = JSON.parse(fs.readFileSync(CANDIDATES, "utf8"));
const authored = JSON.parse(fs.readFileSync(AUTHORED, "utf8"));
const existing = authored.solids ?? [];

const covered = (rect) =>
  existing.some(
    (e) => rect.x >= e.x && rect.y >= e.y && rect.x + rect.w <= e.x + e.w && rect.y + rect.h <= e.y + e.h
  );

const selected = candidates.filter(
  (c) => ALL || IDS.includes(c.id) || (TOWN && c.town === TOWN)
);
let added = 0;
let skipped = 0;
for (const candidate of selected) {
  for (const rect of candidate.rects) {
    if (covered(rect)) {
      skipped += 1;
      continue;
    }
    existing.push(rect);
    added += 1;
  }
}
authored.solids = existing;
fs.writeFileSync(AUTHORED, `${JSON.stringify(authored, null, 2)}\n`);
// The runtime loads the GENERATED copy (loader.ts), which the full build refreshes
// from content/. Sync it here too so promotions take effect without a rebuild.
const generatedCopy = path.join(ROOT, "apps/game/public/generated/collision-overrides.json");
fs.copyFileSync(AUTHORED, generatedCopy);
console.log(`promoted ${selected.length} candidate(s): +${added} rects, ${skipped} already covered`);
console.log(`synced ${generatedCopy}`);
console.log(`review with: git diff content/collision-overrides.json`);
