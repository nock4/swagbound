# Full Romhack Slice Report

## Summary

The Phaser app is no longer a block-based debug scene. It now renders a real,
playable top-down slice of the tutorial romhack, driven entirely by data parsed
from the local CoilSnake project:

- The actual map region around the tutorial NPC (NPC 744) is rendered from
  imported tile, sector, and tileset data — background and walk-behind
  foreground layers.
- Imported per-cell collision drives player movement.
- The player and NPC use the real sprite-group sheets, with directional walk
  animation for the player.
- Talking to the NPC plays the imported `robot.hello_world` dialogue
  (`@Hello World!`) through the generated `scripts.json` pipeline, in a retro
  dialogue window drawn with Phaser shapes and system fonts.
- Camera follows the player at 2x zoom over a 512x448 canvas (CANVAS renderer,
  pixel-art mode).

All rendered/copied assets are local-only and gitignored. Nothing extracted
from the ROM is committed.

## What Was Implemented

### Converter (`packages/eb-converter`)

New modules, all original TypeScript:

- `src/fts.ts` — parser for CoilSnake `.fts` map tilesets: 8x8 minitile
  graphics (base-32 text), palettes keyed by (map tileset, map palette),
  1024 4x4-minitile arrangements with per-cell SNES BG attributes (minitile,
  subpalette, priority, h/v flip) and surface-flag bytes. Includes an RGBA
  tile composer (`drawArrangement`) and a blank/void arrangement detector.
- `src/coilsnakeYaml.ts` — purpose-built readers for the narrow CoilSnake YAML
  shapes used here: int-keyed tables (`npc_config_table.yml`,
  `map_sectors.yml`, `sprite_groups.yml`), `map_sprites.yml` placements
  (256x256-pixel area bands → world pixels), and `map_tiles.map` rows.
- `src/png.ts` — dependency-free PNG encoder (RGBA, filter 0) used to write
  the rendered region images. No new npm dependencies were added; the
  lockfile is unchanged.
- `src/world.ts` — the world builder:
  - Finds the NPC 744 placement in `map_sprites.yml` (area 27/29, local
    192,216 → world pixel 7616,7128 — the same placement the existing
    `proof:check` roadblock-706 preset pins).
  - Chooses a sector-aligned 48x44-tile region (1536x1408 px) around it,
    clamped to the 256x320-tile world map.
  - Renders `background.png` (all tiles) and `foreground.png` (only
    high-priority minitiles, drawn above actors for walk-behind).
  - Emits a collision grid at 8px resolution: raw imported surface bytes
    (`surfaceRows`, hex) plus a gameplay solidity grid (`solidRows`, 0/1 =
    imported solid flag 0x80 OR void/unrendered tile).
  - Joins placements with `npc_config_table.yml` (direction, sprite group,
    text pointer, type, movement, show-sprite) for every NPC inside the
    region. `interactable` = text pointer looks like a ccscript
    `file.label` reference; `visible` = shows always (or is NPC 744).
  - Derives a deterministic player spawn near the NPC on walkable ground
    (documented in `world.json` as derived, not fixture data).
  - Copies the needed `SpriteGroups/*.png` sheets (player group 1 + visible
    NPC groups) into the generated assets directory and records frame
    geometry from `sprite_groups.yml` (16x24 frames, 4 columns).

### Generated output contract

`pnpm convert` now emits, under `apps/game/public/generated/` (gitignored
except `.gitkeep`):

| File | Purpose |
| --- | --- |
| `manifest.json` | Entry point; references all files; counts include `worldNpcs`, `spriteSheets` |
| `scripts.json` | Parsed ccscript (unchanged) |
| `npcs.json` | Text/YML reference scan (unchanged) |
| `sprite-groups.json` | Sprite PNG metadata index (unchanged) |
| `tutorial-status.json` | Tutorial audit; new `world_region_rendered` step |
| `validation-report.json` | Aggregated issues |
| `world.json` | Region geometry, images, collision, NPCs, player spawn, sources, counts |
| `sprites.json` | Copied sprite sheet descriptors (frame size, columns, frames) |
| `assets/world/*.png` | Rendered region background/foreground (local-only) |
| `assets/sprites/*.png` | Copied sprite sheets (local-only) |

`SCHEMA_VERSION` bumped to `0.2.0`. Schemas for the new files live in
`@eb/schemas` (`WorldRegionSchema`, `SpriteSheetCollectionSchema`).

When the fixture (or any required map file) is missing, `world.json` is still
emitted with `available: false` and structured warnings; exit code stays 0.

### Validation (`pnpm validate`)

- Parses the two new JSON files against their schemas.
- Verifies every referenced asset file exists and that no asset path is
  absolute or escapes the generated directory.
- The public-JSON leak scan (no `/Users/`, no `.sfc`/`.smc`, no concrete ROM
  name) now covers `world.json` and `sprites.json`.

### Phaser app (`apps/game`)

Rewritten from one debug scene into four small scenes:

- `BootScene` (`main.ts`) — loads/validates the manifest, fetches all
  generated JSON, then starts the world scene, or the fallback scene when
  world data is unavailable, or an error screen when the manifest is invalid
  (same error contract as before).
- `WorldScene` — the playable scene: imported background/foreground images,
  collision-checked 8-direction movement (feet-box vs the 8px solidity
  grid plus NPC bodies), facing-aware two-frame walk animation, Y-sorted
  depth, camera follow with bounds and 2x zoom, interaction probe, dialogue
  state machine.
- `UiScene` — camera-independent overlay: retro dialogue window (Phaser
  shapes + system monospace font; not a reproduction of the original UI),
  interaction prompt, and an F1-toggled import-status/debug panel. The
  first screen is a game, not a dashboard.
- `FallbackScene` — preserves the old primitive bounded field (with import
  status) for environments without the fixture, so the app never hard-fails.

Controls: Arrow/WASD move, Space/Enter interact/advance, Esc/Backspace close,
F1 import-status panel. Movement is locked while dialogue is open.

Dialogue robustness: the dialogue controller enforces a 150ms cooldown between
open/advance transitions and a 75ms reopen guard after closing. During e2e
work, confirm-key events were occasionally observed double-dispatched in the
harnessed browser, which could open-and-instantly-close (or close-and-reopen)
a one-page dialogue. The guards make single key bursts safe without affecting
human-paced input.

Sprite frame mapping (up 0/1, down 2/3, left 4/5, right 6/7) was verified
visually against locally rendered sheets. Diagonal facings currently reuse the
dominant cardinal direction.

## NPC 744 placement proof

- `npc_config_table.yml` entry 744 carries `Text Pointer 1: robot.hello_world`,
  `Sprite: 5`, `Show Sprite: always`, `Type: person` (tutorial edit).
- `map_sprites.yml` contains exactly one NPC 744 placement: outer band 27,
  inner band 29, offset (192, 216) → world pixel (7616, 7128) → tile
  (238, 222). This matches the committed `proof:check` "roadblock-706"
  placement preset. The rendered region shows this is inside an interior
  room on the lower (rooms) portion of the world map; the scene places the
  NPC exactly there and the e2e suite asserts scene placement equals
  `world.json` data.
- The player spawn is *derived* (nearest walkable point search) because
  CoilSnake projects do not define a player start for this slice; this is
  stated in `world.json` itself.

## Asset & ROM safety

- The ROM is never read, copied, compiled, or committed (`*.sfc` ignored).
- `external/coilsnake-project` remains local-only ignored fixture input.
- All rendered/copied assets and generated JSON stay under
  `apps/game/public/generated/`, which is gitignored except `.gitkeep`.
  `git status` shows no generated files tracked.
- Committed code contains parsers and renderers only — no embedded game
  data. Tests use synthetic fixtures exclusively.
- Generated JSON is scanned (validate + e2e + `rg`) for `/Users/`, `.sfc`,
  and the concrete ROM name; all scans pass clean.
- The dialogue window and HUD are original primitive-shape designs with
  system fonts — no extracted fonts, logos, sounds, or exact UI
  reproduction.

## Tests

- Vitest: 34 passing. New `packages/eb-converter/test/world.test.ts` covers
  the fts parser (minitile pairing, palette decode, arrangement bitfields,
  blank detection, foreground priority), the YAML readers (including the
  placement world-pixel math pinned to the committed proof presets), region
  selection/clamping, collision encoding with void override, spawn search,
  PNG encode round-trip, and a full synthetic-project conversion that
  validates end-to-end (assets on disk, schema-valid JSON, leak-free).
- Playwright (`pnpm test:mantis` / `pnpm test:review`): 9 scenarios, all
  passing — see the updated Mantis report.

## Commands Run (all passing)

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
pnpm test:mantis
rg -n "EarthBound \(USA\)|\.sfc|/Users/" apps/game/public/generated/*.json || true   # no matches
```

`pnpm dev` then http://127.0.0.1:5173/ shows the playable scene (visually
smoke-checked: imported room renders, player walks with animation and
collision, robot NPC talks, dialogue shows `@Hello World!`).

Note: generated output is produced per machine. After pulling this commit, run
`pnpm convert` once (or `pnpm verify`) before `pnpm dev`.

## Known Gaps (honest list)

- Doors/teleports are inert: `map_doors.yml` is not interpreted, so doorway
  tiles do nothing. Movement is intentionally confined to the rendered
  region around the NPC.
- Only one 48x44-tile region is rendered, not the whole world map.
- NPC movement AI (`Movement` ids) is not implemented; NPCs stand still.
  Flag-gated NPCs (`Show Sprite` other than `always`) are hidden rather
  than evaluated against game flags.
- Sector sprite-palette overrides (`map_palette_settings.yml`) and palette
  animation/event palettes are not applied; sprites use the palettes baked
  into the CoilSnake-exported PNGs.
- Surface flags other than solid (water, ledges, talk-through counters) are
  preserved in `world.json` but not interpreted by movement.
- Diagonal walk frames (sheet frames 8-15) are not used yet.
- Dialogue is instant-reveal (no typewriter effect) and only the v0 ccscript
  command set is supported (text/next/end/eob; unknowns preserved).
- No audio, battles, items, save/load, or emulator integration.
- The player spawn point is derived, not fixture-defined (see above).

## What Still Prevents Full Parity

Full EarthBound parity would require interpreting door/teleport tables, NPC
movement scripts, event flags, the full CCScript command set, palette events,
audio, and battle systems — none of which are in scope for this slice, and
several of which would push against the asset-safety boundaries this repo
maintains (everything interpreted so far stays local-only and uncommitted).

## Next Milestone

Doors and region streaming: interpret `map_doors.yml` for the rendered region,
render adjacent regions on demand, and add a minimal event-flag model so
flag-gated NPCs appear correctly — all under the same local-only asset rules.
