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
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUB = join(ROOT, "apps/game/public");
const CHUNKS = join(PUB, "generated/assets/world/chunks");
const CONFIG = join(ROOT, "content/building-overrides.json");

try { execSync("magick -version", { stdio: "ignore" }); }
catch { console.warn("stamp-buildings: ImageMagick not found — skipping"); process.exit(0); }
if (!existsSync(CONFIG)) { console.log("no content/building-overrides.json — nothing to stamp"); process.exit(0); }

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const GROUND = cfg.groundColor || "srgb(41,189,99)"; // grass green to erase the EB building to
let stamped = 0, skipped = 0;
for (const b of cfg.buildings ?? []) {
  const [cx, cy] = String(b.chunk).split(",").map(Number);
  const chunk = join(CHUNKS, `background-${cx}-${cy}.png`);
  const img = join(PUB, b.image);
  if (!existsSync(chunk) || !existsSync(img)) { console.warn(`  skip ${b.id}: missing ${!existsSync(chunk) ? "chunk" : "image"}`); skipped++; continue; }
  // Drop the sprite straight over the EB building (no ground fill). Placement
  // is anchored by the BOTTOM edge (b.y + b.h = the EB building's base).
  execSync(`magick "${chunk}" \\( "${img}" -filter point -resize ${b.w}x${b.h}! \\) -geometry +${b.x}+${b.y} -compose over -composite "${chunk}"`, { stdio: "ignore" });
  // Tall buildings are promoted to a FOREGROUND chunk layer (you walk behind
  // them), and the sign can live there too — so the un-patched foreground would
  // render the old sign over our background patch. Stamp the patch onto the
  // foreground as well, but CLIP it to the foreground's existing silhouette so
  // we never add stray opaque pixels (which would occlude the player).
  const fg = join(CHUNKS, `foreground-${cx}-${cy}.png`);
  if (existsSync(fg)) {
    const tmp = join(CHUNKS, `.fgtmp-${cx}-${cy}.png`);
    execSync(`magick "${fg}" \\( "${img}" -filter point -resize ${b.w}x${b.h}! \\) -geometry +${b.x}+${b.y} -compose over -composite "${tmp}"`, { stdio: "ignore" });
    execSync(`magick "${tmp}" \\( "${fg}" -alpha extract \\) -compose CopyOpacity -composite "${fg}"`, { stdio: "ignore" });
    rmSync(tmp, { force: true });
  }
  console.log(`  stamped ${b.id} -> chunk ${b.chunk} @ ${b.x},${b.y} (${b.w}x${b.h}, base ${b.y + b.h})`);
  stamped++;
}
console.log(`stamped ${stamped} building(s)${skipped ? `, skipped ${skipped}` : ""}`);
