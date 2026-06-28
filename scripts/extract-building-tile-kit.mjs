// Extract the Swagbound building-tile kit: the distinct tileset:arrangement
// tiles used mostly INSIDE building footprints (brick/window/door/roof/awning/
// sign), excluding shared terrain (grass/path). Outputs a manifest + a swatch
// contact sheet. These keys feed content/tile-overrides.json for reskinning.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const ROOT = process.cwd();
const TS = 32, SECT_W = 8, SECT_H = 4, CHUNK_CELLS = 16;
const CH = `${ROOT}/apps/game/public/generated/assets/world/chunks`;
const OUT = `${ROOT}/content/building-tile-kit.json`;

// --- 1. sector -> tileset (map_sectors.yml: integer-keyed blocks) ---
const sectorsYml = readFileSync(`${ROOT}/external/coilsnake-full/map_sectors.yml`, "utf8").split("\n");
const sectorTileset = new Map();
let cur = null;
for (const line of sectorsYml) {
  const k = line.match(/^(\d+):/);
  if (k) { cur = Number(k[1]); continue; }
  const t = line.match(/^\s+Tileset:\s*(\d+)/);
  if (t && cur != null) sectorTileset.set(cur, Number(t[1]));
}
const MAP_W_TILES = 256, SECTORS_PER_ROW = MAP_W_TILES / SECT_W;
const tilesetAt = (cx, cy) => sectorTileset.get(Math.floor(cy / SECT_H) * SECTORS_PER_ROW + Math.floor(cx / SECT_W)) ?? 0;

// --- 2. full arrangement grid (hex) ---
const grid = readFileSync(`${ROOT}/external/coilsnake-full/map_tiles.map`, "utf8").trim().split("\n")
  .map((l) => l.trim().split(/\s+/).map((h) => parseInt(h, 16)));
const H = grid.length, W = grid[0].length;

// --- 3. building boxes from building-names door coords ---
const bn = JSON.parse(readFileSync(`${ROOT}/content/atlas/building-names.json`, "utf8"));
const boxes = [];
for (const b of bn.buildings ?? []) {
  const d = b.overworldDoor; if (!d) continue;
  const dx = Math.floor(d.x / TS), dy = Math.floor(d.y / TS);
  const [fw, fh] = (b.type && /residence/.test(b.type)) ? [4, 5] : [5, 7]; // building extends up from the door
  boxes.push({ x0: dx - Math.floor(fw / 2), x1: dx + Math.ceil(fw / 2), y0: dy - fh, y1: dy + 1 });
}
const inBuilding = (x, y) => boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);

// --- 4. tally per tile: total + insideBuilding + a sample cell ---
const tally = new Map();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const arr = grid[y][x]; if (arr == null || Number.isNaN(arr)) continue;
  const key = `${tilesetAt(x, y)}:${arr}`;
  let t = tally.get(key); if (!t) { t = { total: 0, inside: 0, sample: null }; tally.set(key, t); }
  t.total++;
  if (inBuilding(x, y)) { t.inside++; if (!t.sample) t.sample = { x, y }; }
}

// --- 5. building-specific = mostly used inside buildings ---
const kit = [];
for (const [key, t] of tally) {
  if (t.inside < 2) continue;                 // needs real building presence
  const frac = t.inside / t.total;
  if (frac < 0.6) continue;                    // skip terrain (mostly used in the open)
  kit.push({ key, total: t.total, inside: t.inside, insideFrac: Number(frac.toFixed(2)), sample: t.sample });
}
kit.sort((a, b) => b.inside - a.inside);

// --- 6. render swatches from the sample cell ---
mkdirSync(`${ROOT}/content/atlas/kit-swatches`, { recursive: true });
const swatches = [];
for (const k of kit) {
  const { x, y } = k.sample;
  const cx = Math.floor(x / CHUNK_CELLS), cy = Math.floor(y / CHUNK_CELLS);
  const lx = (x % CHUNK_CELLS) * TS, ly = (y % CHUNK_CELLS) * TS;
  const chunk = `${CH}/background-${cx}-${cy}.png`;
  const out = `/tmp/kit/${k.key.replace(":", "_")}.png`;
  if (existsSync(chunk)) { try { execSync(`magick "${chunk}" -crop ${TS}x${TS}+${lx}+${ly} +repage "${out}"`, { stdio: "ignore" }); swatches.push(out); } catch {} }
}
mkdirSync("/tmp/kit", { recursive: true });

writeFileSync(OUT, JSON.stringify({ schema: "swagbound.building-tile-kit.v1",
  comment: "Distinct building-specific tiles (tileset:arrangement) to reskin via tile-overrides. Excludes terrain (insideFrac>=0.6).",
  count: kit.length, tiles: kit }, null, 2) + "\n");
console.log(`  kit tiles: ${kit.length} (from ${tally.size} distinct map tiles, ${boxes.length} building boxes)`);
console.log(`  manifest -> content/building-tile-kit.json`);
// contact sheet
if (swatches.length) {
  const list = swatches.map((s) => `"${s}"`).join(" ");
  try { execSync(`magick montage ${list} -tile 16x -geometry 32x32+2+2 -background '#16161c' -filter point /tmp/kit-contact.png`, { stdio: "ignore" }); console.log("  swatches -> /tmp/kit-contact.png"); } catch {}
}
