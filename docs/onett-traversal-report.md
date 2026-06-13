# Onett Traversal Phase-1 Report

Phase 1 delivers data-extraction parity for traversal, not script or behavior parity. The converter can emit the full 256x320 tile world behind `EB_WORLD_MODE=full`, and the runtime can boot that data through `ChunkedWorldScene` with chunk streaming, full-world collision, visible NPC streaming, and imported door triggers.

## Delivered

- Full-world chunk streaming: 16x20 chunk grid, 320 rendered chunks, retained/active chunk loading, and debug state for `currentChunk`, `loadedChunkCount`, and `activeNpcCount`.
- Full NPC placements: generated full-world data carries all `map_sprites.yml` placements from `external/coilsnake-full`, with visible NPCs attached to emitted sprite sheets.
- Door triggers: `door`, `stairway`, and `escalator` entries are extracted from `map_doors.yml`; `door` entries with destinations teleport in the chunked runtime.
- Safety separation: the default generated output remains region mode for the existing Mantis suite. Full-world generation is opt-in through `pnpm test:fullworld` or a temp scorecard output.

## Scorecard

`pnpm parity:scorecard` generated full-world data into a temp output directory, audited it against `external/coilsnake-full`, and removed the temp output afterward.

| Check                 | Value                                     | Expected                                   | Status |
| --------------------- | ----------------------------------------- | ------------------------------------------ | ------ |
| NPC placements        | 891 visible / 1582 total                  | 1582 source NPC IDs                        | PASS   |
| Doors: door           | 1072                                      | 1072                                       | PASS   |
| Doors: escalator      | 20                                        | 20                                         | PASS   |
| Doors: ladder         | 0                                         | 341 source (ladder not emitted in Phase 1) | INFO   |
| Doors: object         | 0                                         | 220 source (object not emitted in Phase 1) | INFO   |
| Doors: person         | 0                                         | 49 source (person not emitted in Phase 1)  | INFO   |
| Doors: rope           | 0                                         | 300 source (rope not emitted in Phase 1)   | INFO   |
| Doors: stairway       | 72                                        | 72                                         | PASS   |
| Doors: switch         | 0                                         | 6 source (switch not emitted in Phase 1)   | INFO   |
| Chunk coverage        | 320 written / 0 void / 320 total          | 320 total                                  | PASS   |
| Sprite sheets emitted | 189 sheets; 0 visible NPCs missing sheets | 189 required groups; 0 missing             | PASS   |
| Collision grid        | 1024x1280                                 | 1024x1280                                  | PASS   |
| Map dimensions        | 256x320 tiles                             | 256x320 source tiles                       | PASS   |

`PARITY: PASS`

## Running Full World

- `pnpm test:fullworld` generates full-world data, runs the `full-world-chromium` Playwright project against the Vite dev server, then restores region-mode generated data in `finally` (even on failure).
- Manual spawn overrides use the query string: `?spawn=x,y`. The full-world e2e uses `?spawn=5484,6900` to approach the door cell whose destination is near `643,68`.
- For manual browser work, generate full mode only for the session and restore region mode afterward with `pnpm convert`.

## Known Gaps

- Event-flag gating is not implemented; imported triggers and visible NPC rules are treated as Phase-1 traversal data.
- Rope and ladder door types are audited as source data but not emitted as runtime triggers yet.
- Interiors still use same-map destination pixels. Separate interior map/session semantics are later parity work.
- The full-world default spawn is derived from fixture data and is not yet Ness's bedroom.

## Phase-2 Handoff

Phase 2 should move from traversal extraction to script parity: real event-flag semantics, EB text-engine command coverage, prompt/window behavior, vanilla NPC dialogue variants, and action-script movement patterns.
