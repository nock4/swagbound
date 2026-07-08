// Stamp Swagbound building signs onto the baked map chunks.
// Reads content/sign-overrides.json and composites a rendered sign plate over
// each EB sign's region. IDEMPOTENT post-build step: the converter re-bakes
// clean chunks, then this re-applies the signs. Run after build-eb-fullworld.
//
//   node scripts/stamp-signs.mjs            # stamp all
//   node scripts/stamp-signs.mjs --only 3,2 # one chunk (POC / debugging)
import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const PUB = join(ROOT, "apps/game/public");
const CHUNKS = join(ROOT, "apps/game/public/generated/assets/world/chunks");
const OVERRIDES = join(ROOT, "content/sign-overrides.json");
const PLATE = "#f4d8ec";       // light sign-bar background (matches EB Onett sign palette)
const INK = "#c81e63";         // Swagbound sign text colour
const FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf";
const SS = 3;                  // supersample factor, then nearest-neighbour down = crisp pixel text

const onlyChunk = (() => { const i = process.argv.indexOf("--only"); return i > -1 ? process.argv[i + 1] : null; })();
const mg = (a) => execSync(`magick ${a}`, { stdio: ["ignore", "pipe", "pipe"] });

try { execSync("magick -version", { stdio: "ignore" }); }
catch { console.warn("stamp-signs: ImageMagick (magick) not found — skipping sign stamps (map renders with raw EB signs)"); process.exit(0); }

if (!existsSync(OVERRIDES)) { console.error("no content/sign-overrides.json — run the sign mapping first"); process.exit(1); }
const data = JSON.parse(readFileSync(OVERRIDES, "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "signs-"));
let stamped = 0, skipped = 0;

for (const s of data.signs ?? []) {
  if (onlyChunk && s.chunk !== onlyChunk) continue;
  const [cx, cy] = s.chunk.split(",").map(Number);
  const chunk = join(CHUNKS, `background-${cx}-${cy}.png`);
  const { x, y, w, h } = s.region ?? {};
  if (!existsSync(chunk) || w == null) { skipped++; continue; }
  const sign = join(tmp, `${s.swag.replace(/\W+/g, "_")}-${s.chunk.replace(",", "_")}-${x}_${y}.png`);
  if (s.image) {
    const source = join(PUB, s.image);
    const crop = s.sourceRegion ?? { x: 0, y: 0, w, h };
    if (!existsSync(source)) { skipped++; continue; }
    mg(`"${source}" -crop ${crop.w}x${crop.h}+${crop.x}+${crop.y} +repage -filter point -resize ${w}x${h}! "${sign}"`);
    if (s.clipToChunkAlpha) {
      const mask = join(tmp, `mask-${s.chunk.replace(",", "_")}-${x}_${y}.png`);
      mg(`"${chunk}" -crop ${w}x${h}+${x}+${y} +repage -alpha extract "${mask}"`);
      mg(`"${sign}" "${mask}" -compose CopyOpacity -composite "${sign}"`);
    }
  } else {
    // auto-fit the text to the region via label:, supersampled then pixel-downscaled
    mg(`-size ${w * SS}x${h * SS} -background "${PLATE}" -fill "${INK}" -font "${FONT}" -gravity center label:"${s.swag}" -filter point -resize ${w}x${h}! "${sign}"`);
  }
  mg(`"${chunk}" "${sign}" -geometry +${x}+${y} -composite "${chunk}"`);
  stamped++;
}
console.log(`stamped ${stamped} signs${skipped ? `, skipped ${skipped} (missing chunk/region)` : ""}`);
