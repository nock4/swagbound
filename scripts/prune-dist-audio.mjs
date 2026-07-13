#!/usr/bin/env node
// Post-build: vite copies the entire public/audio tree into dist (2.5GB incl.
// the gitignored jammers-raw/ + earthbound-jammers/ source rips that must NOT
// ship). Trim dist/audio to exactly what the game loads at runtime: the
// music-manifest jammers loops + everything under sfx/ and music/.
import { readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, basename } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const distAudio = join(root, "apps/game/dist/audio");
const manifest = JSON.parse(readFileSync(join(root, "content/music-manifest.json"), "utf8"));

const referencedJammers = new Set(
  [...JSON.stringify(manifest).matchAll(/audio\/(jammers\/[^"]+\.mp3)/g)].map((m) => m[1])
);
// Directories we always keep whole (runtime sfx + short music cues).
const keepDirs = new Set(["sfx", "music"]);

let kept = 0;
let removed = 0;
let freed = 0;

function walk(dir, relBase = "") {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const topDir = rel.split("/")[0];
      if (keepDirs.has(topDir)) {
        kept += 1;
        continue; // keep the whole sfx/ or music/ subtree
      }
      walk(full, rel);
      try {
        if (readdirSync(full).length === 0) rmSync(full, { recursive: true });
      } catch { /* ignore */ }
    } else {
      const isReferencedJammer = rel.startsWith("jammers/") && referencedJammers.has(`jammers/${basename(rel)}`);
      if (isReferencedJammer) {
        kept += 1;
      } else {
        freed += statSync(full).size;
        rmSync(full);
        removed += 1;
      }
    }
  }
}

walk(distAudio);
console.log(`[prune-dist-audio] kept ${kept} referenced tracks/dirs, removed ${removed} files, freed ${(freed / 1024 / 1024).toFixed(0)} MB`);
