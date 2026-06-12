# Next Milestones

> **Status update (full romhack slice):** Milestones 2-4 below have been
> delivered by the full romhack slice — real map/NPC metadata parsing
> (`world.json`), a real tile/map renderer, and a local-only gitignored
> asset-preview pipeline (rendered region PNGs + copied sprite sheets), plus
> the Milestone 5 dialogue playback for `robot.hello_world`. See
> `docs/full-romhack-slice-report.md`. The next milestone is doors/teleport
> interpretation, region streaming, and a minimal event-flag model.

## Milestone 2: Real Map/NPC Metadata Discovery, No Rendering Yet

Implemented now:

- Local fixture conversion.
- Script parsing for the tutorial dialogue.
- Text/YML NPC reference scanning.
- Synthetic local-only `robot.hello_world` scanner proof.

Fixture-only proof:

- `external/coilsnake-project/tutorial-fixture-npc-reference.yml` proves scanner wiring only.

Not implemented:

- Real map metadata interpretation.
- Real NPC placement parsing.
- Any rendering from extracted map or sprite assets.

Explicitly forbidden for now:

- Reading or compiling the ROM.
- Committing extracted assets.
- Rendering extracted assets.

Goal:

- Discover which extracted text/YML files can safely describe map or NPC metadata.
- Emit structured generated metadata without rendering anything.

## Milestone 3: Local-Safe Tile/Map Renderer Using Generated Placeholders First

Implemented now:

- Primitive Phaser first scene.
- Placeholder player and NPC/script marker.

Not implemented:

- Tilemap rendering.
- Real map rendering.
- Real tileset asset use.

Explicitly forbidden for now:

- Rendering copyrighted extracted maps or sprites directly.
- Copying extracted image assets into committed source.

Goal:

- Use generated placeholder geometry first.
- Prove camera, collision, and scene layout with safe generated primitives before any asset-preview work.

## Milestone 4: Controlled Asset-Preview Pipeline, Still Gitignored

Implemented now:

- Metadata-only SpriteGroups index.
- `SpriteGroups/005.png` detection and inferred id.

Not implemented:

- Rendering extracted PNGs.
- Copying extracted PNGs.
- Asset preview UI.

Explicitly forbidden for now:

- Committing extracted CoilSnake assets.

Goal:

- If previewing is needed, create a local-only, gitignored preview path with explicit safety checks and no committed asset files.

## Milestone 5: Scene Scripting/Event Triggers

Implemented now:

- Resolving `robot.hello_world`.
- Dialogue page playback for `text`, `next`, `end`, `eob`, and unknown command preservation.

Not implemented:

- Event trigger graph.
- Script-driven scene changes.
- Broader CCScript command behavior.

Goal:

- Add safe trigger metadata and a tiny event runner for generated placeholder scenes.

## Milestone 6: Save/Load Prototype

Implemented now:

- No persistence.

Not implemented:

- Save slots.
- Scene state serialization.
- Player state persistence.

Goal:

- Persist minimal local prototype state, such as player position and interacted marker ids.

## Milestone 7: Broader CCScript Support

Implemented now:

- Narrow parser for labels, quoted text, compact quoted text plus simple command, `next`, `end`, `eob`, comments, and unknown command preservation.

Not implemented:

- Full CCScript parser.
- Command semantics beyond dialogue paging.

Goal:

- Expand parser coverage only when driven by observed fixture data and tests, preserving unknown commands instead of failing.
