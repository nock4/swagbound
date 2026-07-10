// Extract EB ROM ground-truth tables into content/rom-truth/*.json.
// The ROM ("EarthBound (USA).sfc", gitignored) stays local; the extracted JSON is
// checked in so parity work cites data instead of screenshots.
//
// Tables (offsets per Data Crystal's ROM map, which assumes a 0x200 copier header;
// we anchor the real base by pattern-matching the frame-verified talk window so the
// extractor works on headered and unheadered dumps alike):
//   - Dialog Window Attributes Table: 53 entries x 8 bytes (x,y,w,h uint16 LE, 8px units)
//   - Main Font Character Data: 96 width bytes (glyphs = ASCII 0x20..0x7F)
//
// Run: node scripts/rom-tables/extract-rom-truth.mjs [romPath]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ROM_PATH = process.argv[2] ?? "EarthBound (USA).sfc";
const rom = readFileSync(ROM_PATH);
mkdirSync("content/rom-truth", { recursive: true });

// ---- anchor: find the frame-verified talk window entry (x=12,y=1,w=19,h=8) ----
const TALK = Buffer.from([12, 0, 1, 0, 19, 0, 8, 0]);
const hit = rom.indexOf(TALK);
if (hit < 0) throw new Error("talk-window anchor pattern not found; wrong ROM?");
const TALK_WINDOW_ID = 1;
const windowTableBase = hit - TALK_WINDOW_ID * 8;
// Data Crystal documents the table at (headered) 0x3E450; derive the header shift so
// every other documented offset can be corrected the same way.
const HEADER_SHIFT = windowTableBase - 0x3e450; // -0x200 on unheadered dumps
console.log(`window table base: 0x${windowTableBase.toString(16)} (header shift ${HEADER_SHIFT})`);

// ---- Dialog Window Attributes Table ----
const WINDOW_COUNT = 53;
const windows = [];
for (let i = 0; i < WINDOW_COUNT; i++) {
  const o = windowTableBase + i * 8;
  const x = rom.readUInt16LE(o);
  const y = rom.readUInt16LE(o + 2);
  const w = rom.readUInt16LE(o + 4);
  const h = rom.readUInt16LE(o + 6);
  const sane = x <= 32 && y <= 28 && w > 0 && w <= 32 && h > 0 && h <= 28 && x + w <= 33 && y + h <= 29;
  if (!sane) throw new Error(`window ${i} out of range: ${x},${y},${w},${h}`);
  windows.push({ id: i, units: { x, y, w, h }, px: { x: x * 8, y: y * 8, w: w * 8, h: h * 8 } });
}
writeFileSync("content/rom-truth/window-attributes.json", JSON.stringify({
  schema: "swagbound.rom-truth.window-attributes.v1",
  source: "EarthBound (USA) ROM, Dialog Window Attributes Table (Data Crystal 0x3E450 headered)",
  units: "8px PPU units; px = units*8 on the native 256x224 screen",
  knownIds: { talkWindow: 1 },
  windows
}, null, 1));
console.log(`window-attributes.json: ${windows.length} entries; talk window px =`, JSON.stringify(windows[1].px));

// ---- Main Font Character Data (per-glyph advance widths) ----
const FONT_WIDTHS_DOCUMENTED = 0x210e7a;
const fontWidthBase = FONT_WIDTHS_DOCUMENTED + HEADER_SHIFT;
const widths = Array.from(rom.subarray(fontWidthBase, fontWidthBase + 96));
const bad = widths.filter((w) => w === 0 || w > 16);
if (bad.length > 8) throw new Error(`font widths look wrong at 0x${fontWidthBase.toString(16)}: ${widths.slice(0, 16)}`);
const byChar = {};
for (let i = 0; i < 96; i++) byChar[String.fromCharCode(0x20 + i)] = widths[i];
writeFileSync("content/rom-truth/main-font-widths.json", JSON.stringify({
  schema: "swagbound.rom-truth.main-font-widths.v1",
  source: "EarthBound (USA) ROM, Main Font Character Data (Data Crystal 0x210E7A headered)",
  units: "native px advance per glyph, main 16px dialogue font, glyphs ASCII 0x20-0x7F",
  byChar
}, null, 1));
const measure = (s) => [...s].reduce((n, c) => n + (byChar[c] ?? 0), 0);
const SAMPLE = "Don't talk to me.  I... I'm";
console.log(`main-font-widths.json written; advance("${SAMPLE}") = ${measure(SAMPLE)} native px (frame-measured line ~134px)`);
