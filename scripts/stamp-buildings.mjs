// Drop-in building sprites: composite a custom building PNG onto the map where
// an EB building is. You make a building image, add an entry here, rebuild —
// it shows up in the game. Idempotent post-build step (re-applies after builds).
//
//   node scripts/stamp-buildings.mjs
//
// content/building-overrides.json:
//   { "buildings": [
//       { "id": "the-plug", "chunk": "3,2", "x": 14, "y": 0, "w": 120, "h": 158,
//         "image": "assets/buildings/the-plug.png" }   // x,y,w,h = where/size on the chunk (512x512), top-left origin
//   ] }
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUB = join(ROOT, "apps/game/public");
const CHUNKS = join(PUB, "generated/assets/world/chunks");
const CONFIG = join(ROOT, "content/building-overrides.json");

try { execSync("magick -version", { stdio: "ignore" }); }
catch { console.warn("stamp-buildings: ImageMagick not found — skipping"); process.exit(0); }
if (!existsSync(CONFIG)) { console.log("no content/building-overrides.json — nothing to stamp"); process.exit(0); }

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
let stamped = 0, skipped = 0;
for (const b of cfg.buildings ?? []) {
  const [cx, cy] = String(b.chunk).split(",").map(Number);
  const chunk = join(CHUNKS, `background-${cx}-${cy}.png`);
  const img = join(PUB, b.image);
  if (!existsSync(chunk) || !existsSync(img)) { console.warn(`  skip ${b.id}: missing ${!existsSync(chunk) ? "chunk" : "image"}`); skipped++; continue; }
  // resize the building image to w x h (nearest-neighbour = crisp pixels), composite at x,y over the baked chunk
  execSync(`magick "${chunk}" \\( "${img}" -filter point -resize ${b.w}x${b.h}! \\) -geometry +${b.x}+${b.y} -compose over -composite "${chunk}"`, { stdio: "ignore" });
  console.log(`  stamped ${b.id} -> chunk ${b.chunk} @ ${b.x},${b.y} (${b.w}x${b.h})`);
  stamped++;
}
console.log(`stamped ${stamped} building(s)${skipped ? `, skipped ${skipped}` : ""}`);
