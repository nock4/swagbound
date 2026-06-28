# Atlas catalog — accuracy notes

## ⚠️ `content/atlas/motifs.json` rendered images are ANALYTICAL, not faithful

The `image` PNGs referenced by `motifs.json` (`atlas/motifs/building-*.png`,
`room-*.png`) are **auto-grouped multi-tile pattern extractions** rendered with
palette/layer artifacts. They are **fragmented and not a faithful representation
of the in-game art** (an EB building spans multiple tilesets, palettes, and
foreground/background layers that the motif extractor flattens incorrectly).

**Do NOT use the motif images as art references or regeneration sources.**

Their **metadata is reliable** and useful: `footprintWxH`, `widthTiles/heightTiles`,
`instanceCount`, `sampleLocations` (tile coords), `doorCount`, `worldPixel`
(interactables). Use the metadata to locate an element, then crop the faithful
art from the **baked chunks** (`apps/game/public/generated/assets/world/chunks/`).

## Reliable layers (trust these)
- `tiles.json` + tileset atlases — the chunks are baked from these and render correctly.
- `sprites.json` + sprite sheets — the game renders NPCs from these.
- `backgrounds.json`, `ui.json`, `townmaps.json`, `building-names.json` — direct/used assets.

## Clean element extraction
`scripts/stamp-signs.mjs` and the building-extract pass crop from the rendered
chunks (the faithful source) using element metadata. Coordinate units: motif
`sampleLocations` are TILE coords (×32 = world px); interactable `worldPixel` is
world px; chunk = `floor(worldPx / 512)`, local = `worldPx % 512`.
