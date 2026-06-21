# Swagbound Atlas — progress tracker

Goal: a complete, organized, browsable inventory of **every visual element** in the game
(tiles, trees, bushes, buildings, signs, props, characters), categorized + named + mapped to
the Swagbound design language — the foundation for authoring custom maps in that language.

Source of truth: `content/atlas/*.json`. Images: `apps/game/public/atlas/*` (regenerable via
`scripts/atlas/*`). Browser: `docs/atlas-browser.html`.

## Data model (grounded)
- Map: 32px tiles ("arrangements"), 256×320 tiles, 320 chunks, **31 tilesets** (`Tilesets/*.fts`), 149 palettes.
- Reuse: `packages/eb-converter/src/fts.ts` → `parseFts()`, `drawArrangement()`, `FTS_ARRANGEMENT_COUNT=1024`, `isBlankArrangement()`, surface/collision masks. `world.ts` reads arrangement-index per cell (usage + motifs).
- Sprites: `generated/sprites.json` `sheets[]` (groupId, file, frameW/H, columns, rows, animations) + rendered `generated/assets/sprites/NNN.png`.

## Phases
| # | Phase | Status | Artifact |
|---|-------|--------|----------|
| 0 | Foundation (schema + harness + tracker) | ✅ | content/atlas/, scripts/atlas/, this file |
| 1 | Tile vocabulary (atlas sheets + tiles.json) | ✅ | atlas/tiles/*.png + tiles.json |
| 2 | Character catalog (sprites.json) | ⬜ | content/atlas/sprites.json |
| 3 | Motif detection (recurring objects) | ⬜ | content/atlas/motifs.json |
| 4 | Vision labeling & taxonomy | ⬜ | enriched catalog |
| 5 | Atlas browser (HTML) | ⬜ | docs/atlas-browser.html |
| 6 | Design-language map & gaps | ⬜ | content/atlas/coverage.json |
| 7 | Map-authoring primitives | ⬜ | content/atlas/map-kit.json + demo |

Scope: complete atomic coverage (tiles+sprites global); motifs + labeling prioritized Onett/Act-1 then expand.

## Log
- 2026-06-20: Plan set, data model grounded, foundation started.
- 2026-06-20: **Phase 1 done** — `pnpm atlas:tiles` renders 31 tileset sheets + `tiles.json`. **21,707 non-blank tiles, 13,453 used.** Top: ts0/arr0 grass×2060. Per-tile: solidCells, isForeground, paletteId, usageCount. Sheets render correctly (verified tileset-00: forest/grass/pond/cliff/sanctuary terrains). Gates green (tsc, build errors:0, vitest 742).
