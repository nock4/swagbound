# vendor/ — Swagbound source masters

Original Swagbound / Little Swag World source assets, copied in so this project no
longer reaches into the (100+ GB) `~/Projects/swagbound-*` sibling repos at import time.

**All of this is Nick George's own work.** No EarthBound / Nintendo content lives here —
the EB ROM and the CoilSnake decompile stay external and gitignored (see `SETUP.md`).

| Dir | Vendored from | What it is | Used by |
|-----|---------------|-----------|---------|
| `swagbound-dialogue/` | `swagbound-new/swagbound-phaser/public/data` | Structured Swagbound dialogue JSON (act1 grammar, content-dialogue, overworld, …) | `scripts/import-swagbound-dialogue.ts` → `content/swagbound-dialogue-library.json` |
| `sprite-masters/` | `swagbound-new/asset-lab/sprites` | LSW / Drifella sprite art + Act-1 person-sprite assignment data | source for `content/sprite-overrides.json` + the committed `apps/game/public/assets/swagbound` sprites |
| `text-corpus/` | `swagbound-new/asset-lab/text-extraction` | Drifella2 NFT lore / trait text corpus | source for `content/drifella-barks.json` |
| `audio-masters/` | `swagbound-new/asset-lab/audio` | Original Swagbound SFX / music masters (`.wav`) | source for the audio layer / future SFX |

These are **source masters** — the game ships from the derived, committed versions in
`content/` and `apps/game/public/`. Vendored 2026-06-27.

To re-sync a master from the sibling repo (run from the repo root):

```sh
rsync -a --delete ~/Projects/swagbound-new/asset-lab/sprites/        vendor/sprite-masters/
rsync -a --delete ~/Projects/swagbound-new/asset-lab/text-extraction/ vendor/text-corpus/
rsync -a --delete ~/Projects/swagbound-new/asset-lab/audio/          vendor/audio-masters/
rsync -a --delete ~/Projects/swagbound-new/swagbound-phaser/public/data/ vendor/swagbound-dialogue/
```
