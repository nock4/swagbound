// Extract clean, alpha-cut crops of every map element from the rendered chunks.
// Uses motifs.json metadata to locate each element, crops from the faithful
// baked chunks (NOT the noisy motif images), floods the grass/road background
// transparent. Outputs extracted-elements/<category>/ + manifest + contact sheets.
//
//   node scripts/extract-elements.mjs [buildings|motifs|interactables|all]
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TS = 32, CHUNK_PX = 512;
const CH = join(ROOT, "apps/game/public/generated/assets/world/chunks");
const OUT = join(ROOT, "extracted-elements");
const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
const m = JSON.parse(readFileSync(join(ROOT, "content/atlas/motifs.json"), "utf8"));
const want = process.argv[2] || "all";
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function acut(px, py, W, H, out, fuzz = 13) {
  const cx = Math.floor(px / CHUNK_PX), cy = Math.floor(py / CHUNK_PX);
  const lx = Math.max(0, px - cx * CHUNK_PX), ly = Math.max(0, py - cy * CHUNK_PX);
  const chunk = join(CH, `background-${cx}-${cy}.png`);
  if (!existsSync(chunk)) return null;
  // clamp crop to chunk bounds
  const w = Math.min(W, CHUNK_PX - lx), h = Math.min(H, CHUNK_PX - ly);
  if (w < 8 || h < 8) return null;
  try {
    execSync(`magick "${chunk}" -crop ${w}x${h}+${lx}+${ly} +repage -alpha set -fuzz ${fuzz}% ` +
      `-fill none -draw "alpha 0,0 floodfill" -draw "alpha ${w - 1},0 floodfill" ` +
      `-draw "alpha 0,${h - 1} floodfill" -draw "alpha ${w - 1},${h - 1} floodfill" "${out}"`,
      { stdio: "ignore" });
    return { chunk: `${cx},${cy}`, x: lx, y: ly, w, h };
  } catch { return null; }
}

const manifest = [];
function run(cat, items, toRegion, fuzz) {
  const dir = join(OUT, cat); mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const el of items) {
    const id = el.buildingId || el.motifId || el.id || `${cat}-${ok}`;
    const r = toRegion(el); if (!r) continue;
    const out = join(dir, `${slug(id)}.png`);
    const got = acut(r.px, r.py, r.W, r.H, out, fuzz);
    if (got) { ok++; manifest.push({ cat, id, file: `extracted-elements/${cat}/${slug(id)}.png`, region: got, footprint: el.footprintWxH || `${el.widthTiles}x${el.heightTiles}`, guess: el.categoryGuessAdvisory }); }
  }
  // contact sheet
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).map((f) => join(dir, f));
  if (files.length) {
    const list = files.map((f) => `"${f}"`).join(" ");
    try { execSync(`magick montage ${list} -tile 8x -geometry 110x110+4+4 -background '#16161c' -fill '#9cf' -font "${FONT}" -pointsize 9 -label '%t' "${join(OUT, `_contact-${cat}.png`)}"`, { stdio: "ignore" }); } catch {}
  }
  console.log(`  ${cat}: ${ok}/${items.length} extracted`);
}

if (want === "buildings" || want === "all")
  run("buildings", m.buildings, (b) => {
    const l = (b.sampleLocations || [])[0]; if (!l) return null;
    const [fw, fh] = (b.footprintWxH || "4x4").split("x").map(Number);
    const roof = Math.max(3, Math.ceil(fh * 0.7));
    return { px: (l.mapX - 1) * TS, py: Math.max(0, (l.mapY - roof) * TS), W: (fw + 2) * TS, H: (fh + roof) * TS };
  }, 12);

if (want === "motifs" || want === "all")
  run("motifs", m.motifs, (mo) => {
    const l = (mo.sampleLocations || [])[0]; if (!l) return null;
    return { px: l.mapX * TS, py: l.mapY * TS, W: mo.widthTiles * TS, H: mo.heightTiles * TS };
  }, 14);

if (want === "interactables" || want === "all")
  run("interactables", m.interactables.filter((i) => i.worldPixel), (it) => {
    const p = it.worldPixel; return { px: p.x - 24, py: p.y - 48, W: 48, H: 56 };
  }, 13);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ schema: "swagbound.extracted-elements.v1", count: manifest.length, elements: manifest }, null, 2) + "\n");
console.log(`manifest: ${manifest.length} elements -> extracted-elements/manifest.json`);
