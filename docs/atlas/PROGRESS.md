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
| 1 | Tile vocabulary (atlas sheets + tiles.json) | ✅ (re-audit running) | atlas/tiles/*.png + tiles.json |
| 2 | Character catalog (sprites.json) | ✅ (metric fix queued) | content/atlas/sprites.json |
| 3 | Motif detection — door-anchored | ✅ | motifs.json (flora 79 / interactables 275 / rooms 221 / buildings 262) |
| 4 | Vision labeling & taxonomy | ⬜ | enriched catalog |
| 5 | Atlas browser (HTML) | ✅ | apps/game/public/atlas/index.html (open /atlas/index.html) |
| 6 | Design-language map & gaps | ⬜ | content/atlas/coverage.json |
| 7 | Map-authoring primitives | ⬜ | content/atlas/map-kit.json + demo |
| 8 | SCOPE EXPANSION (post-critique) | ✅ | backgrounds.json, ui.json (windows+fonts+icons), townmaps.json |

Scope: NOT just overworld. "Every element" = tiles + sprites + motifs/buildings + **battle backgrounds + UI/window frames + fonts + town-maps + item/PSI icons + interactables (doors/switches)**. Phase 8 closes the gaps the scope critic found.

## Log
- 2026-06-20: Plan set, data model grounded, foundation started.
- 2026-06-20: **Phase 1 done** — `pnpm atlas:tiles` renders 31 tileset sheets + `tiles.json`. **21,707 non-blank tiles, 13,453 used.** Top: ts0/arr0 grass×2060. Per-tile: solidCells, isForeground, paletteId, usageCount. Sheets render correctly (verified tileset-00: forest/grass/pond/cliff/sanctuary terrains). Gates green (tsc, build errors:0, vitest 742). PRs #96/#97.
- 2026-06-20: **Phase 2 done** — `pnpm atlas:sprites` + `sprites.json`. **342 sprite groups (342 used), 204 skinned (Swagbound override), 138 un-skinned.** Per group: portrait, sheet, frames/animations, usedByNpcCount, sampleNpcIds/locations, overrideKind, roleGuess. Incl. 78 source-backed groups beyond the 264 public sheets. Top: group 195 used by 123 NPCs. Gates green (vitest 743).
- 2026-06-21: **CRITICAL REVIEW** (4 adversarial subagents) found real problems — acting on all:
  - **Unicorn claim RETRACTED.** `unicornio` skin (groups 71/111/152/216/382) is real, but NO unicornio NPC is in/near the drugstore — the actual drugstore NPCs are `bat-poncho`(g117), `npc-neighbor`(g114), `plastic-fool`(g140). The "drugstore unicorn = unicornio" claim was unsubstantiated. Unicorn still needs the user to point at it.
  - **Phase 3 motifs (v1) were garbage → discarded.** Terrain split mis-tuned (148/13k tiles terrain → whole map one blob → arbitrary 8×8 window slicing); 53% singletons; 20k overlapping frequent-block double-counts; "sign" category 100% spurious. REWRITE (door-anchored, Phase 3 above): buildings seeded from door anchors, signs/interactables from `map_doors.yml` object/switch/person + textPointer (NOT tile clusters), flora via deduped components with mirror/tileset-folded signatures + 1-tile motifs allowed.
  - **Sprite skinned metric undercounts** — 204/138 ignores `byEnemyId` skins; true split **253/89** (49 "un-skinned" groups are skinned as battle enemies). Fix queued (extract-sprites overrideKind to count enemy + npc).
  - **Scope incomplete** — Phase 8 added (backgrounds/ui/fonts/townmaps/icons/interactables). Highest-leverage for map-authoring = interactables (doors/warps/switches).
  - tile re-audit re-running (first auditor returned corrupted output).
- 2026-06-21: **Tile audit PASSED (high confidence).** Independent re-implementation of parseFts/isSolidSurface/world map-usage confirmed all 21,707 tiles tile-for-tile: 0 solidCells mismatches, 0 blanks included, 0 gx/gy out of bounds, usage counts + both headline counts (21,707 / 13,453) exact. Two defensible exclusions: blank void arrangements + **map-tileset 31** (832 tiles, declared in 00.fts sharing ts0 graphics but referenced by NO sector → unused). NOTE/TODO: optionally include ts31 flagged `unused:true` for literal completeness. tiles.json is trustworthy.
- 2026-06-21: **Phase 3 done (door-anchored rewrite + building refinement).** `motifs.json` self-checks PASS: object density sparse, **0% singletons** (was 53%). Four layers: **flora/props 79** (clean recurring trees/cactus/bushes/rocks/barriers — verified), **interactables 275** (from map_doors object/switch/person anchors + textPointer; textPreview null TODO), **rooms 221** (clean interior sectors — verified), **buildings 262** (door-anchored, bounded ≤14×14, doorCount ≤3 — no more blobs; SOME of the 14×14 ones still crop surrounding terrain since isolating a building from an EB tilemap is inherently fuzzy — vision pass will flag the clean ones; clear wins: awning shop, brick mansion, red-roof house). Gates green (vitest 747). Terrain split 3442 types (was 148). PR pending.
