// Generates generated/sector-music.json: resolved EB song id per map sector.
// Runtime sector index == map_sectors.yml key (32 cols x 80 rows). The EB song id
// groups interiors by BUILDING TYPE (all hospitals share one id, etc.), so the
// music manifest can map interior music by type, faithfully to EarthBound.
import fs from "node:fs";

const SRC = "external/coilsnake-full";
const sectorsTxt = fs.readFileSync(`${SRC}/map_sectors.yml`, "utf8").split(/\r?\n/);
const musicTxt = fs.readFileSync(`${SRC}/map_music.yml`, "utf8").split(/\r?\n/);

// map_music index -> default song id (Event Flag 0x0 entry = base music)
const defaultSong = {};
{
  let idx = null, last = null;
  for (const l of musicTxt) {
    let m = l.match(/^(\d+):\s*$/);
    if (m) { if (idx != null) defaultSong[idx] = last; idx = +m[1]; last = null; continue; }
    m = l.match(/Music:\s*(\d+)/);
    if (m) last = +m[1];
  }
  if (idx != null) defaultSong[idx] = last;
}

// per-sector Music index + indoor flag
const song = new Array(2560).fill(0);
const indoor = new Array(2560).fill(0);
{
  let cur = null;
  for (const l of sectorsTxt) {
    let m = l.match(/^(\d+):\s*$/);
    if (m) { cur = +m[1]; continue; }
    m = l.match(/^\s+Music:\s*(\d+)/);
    if (m && cur != null) song[cur] = defaultSong[+m[1]] ?? 0;
    m = l.match(/^\s+Setting:\s*(.+?)\s*$/);
    if (m && cur != null) indoor[cur] = m[1] === "indoors" ? 1 : 0;
  }
}

const out = { schema: "swagbound.sector-music.v1", cols: 32, rows: 80, song, indoor };
fs.writeFileSync("apps/game/public/generated/sector-music.json", JSON.stringify(out));
// also drop a copy in content/ so the build keeps it
fs.writeFileSync("content/sector-music.json", JSON.stringify(out, null, 0));
console.log("wrote sector-music.json (2560 sectors)");

// summary: indoor song ids in Onett
const inOnett = {};
for (let i = 0; i < 2560; i++) if (indoor[i]) { /* count globally */ }
const bySong = {};
for (let i = 0; i < 2560; i++) if (indoor[i]) bySong[song[i]] = (bySong[song[i]] || 0) + 1;
console.log("indoor song-id -> #sectors (game-wide):");
console.log(Object.entries(bySong).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`song ${s}: ${n}`).join(" | "));
