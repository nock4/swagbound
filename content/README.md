# Original Content Slices

This folder holds committed, original content that is safe to build and review
without any ROM, extracted assets, or EarthBound-derived fixtures.

## Slice Format

Each slice is a JSON document with:

- `id`, `title`, and `description`: metadata used in generated reports.
- `tileSize`: source tile size in pixels. The current runtime region scene
  expects 32 pixel tiles.
- `palette`: tile definitions keyed by a one-character `symbol`.
  - `solid: true` marks a tile as blocking; the builder derives collision rows.
  - `color` and optional `accent` drive the generated original placeholder art.
- `grid`: an array of equal-length strings. Each character must match one
  palette symbol.
- `player`: spawn tile/facing/sprite metadata.
- `sprites`: original programmatic sprite descriptors. `groupId` is the runtime
  sprite-group id referenced by the player and NPCs.
- `npcs`: original NPC definitions with tile position, facing, sprite group, and
  `dialogue` pages. Multiple strings in `dialogue` become multiple dialogue
  pages in `scripts.json`. NPCs currently default to runtime
  `showSprite: "always"` so they are visible when the slice boots.

The content-builder compiles a slice into the same generated files consumed by
`apps/game`: `manifest.json`, `world.json`, `scripts.json`, `npcs.json`,
`sprite-groups.json`, `sprites.json`, `tutorial-status.json`, and
`validation-report.json`, plus generated PNG assets.

## Music Manifest

`music-manifest.json` maps small, named music cues to user-owned track files.
Act 1 currently defines `overworld`, `battle`, and `intro`. Put real tracks at
`apps/game/public/audio/music/<cue>.<ext>` and update the manifest file names if
the extension differs. No tracks are committed by default; missing files keep
the runtime silent.
