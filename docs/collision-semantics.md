# EB Surface-Flag Semantics (definitive)

The per-8×8-cell byte in `world.json` `collision.surfaceRows` is EarthBound's minitile
attribute byte, read verbatim from `external/coilsnake-full/Tilesets/*.fts` by
`packages/eb-converter/src/fts.ts`. This table is the project-wide verdict; code that
interprets surface bytes must match it (constants live in
`apps/game/src/collisionOverlay.ts` and `packages/eb-converter/src/fts.ts`).

| Bit  | Meaning | Runtime behavior |
|------|---------|------------------|
| 0x80 | Solid | Blocks movement (already wired: `solidRows`) |
| 0x40 | Unused (alternate solid) | Zero cells in our map — ignore |
| 0x20 | Unused | Zero cells in our map — ignore. **Legacy bug:** old `SURFACE_WATER_MASK=0x20` matched nothing |
| 0x10 | Ladder / stairs | Future climb mechanic (currently none). Usually `0x90` (over solid cliff) |
| 0x08 | Water | Wade visuals/speed/SFX. Shallow alone; **deep when 0x04 also set** |
| 0x04 | With 0x08: deep water. Without: sunstroke/damage floor (desert, swamp edges) | Status hazard hook (future) |
| 0x02 | Foreground: upper body obscured | Player standing here draws **behind** map art → bake cell into FG chunk layer (converter) |
| 0x01 | Foreground: lower body obscured | `0x01` without `0x02` → crop actor's bottom ~8px at runtime (waterClip pattern) |

Combination notes:
- `0x03` = whole body hidden (canopy interiors, upper wall bands). `0x02`-alone is 36 cells
  globally — treat like `0x03`.
- Swamp bytes decode cleanly: `0x0b/0x0f` = water + obscurity, `0x0c` = deep water,
  `0x09/0x0d` = water + lower-hide (Deep Darkness).
- Derived predicates: `water = (b & 0x08)`, `deepWater = (b & 0x0c) === 0x0c`,
  `sunstroke = (b & 0x0c) === 0x04`, `fgWhole = (b & 0x02)`, `fgLowerOnly = (b & 0x03) === 0x01`.

## Evidence

1. **Sources:** [Data Crystal — Tile Arrangement Collision Data](https://datacrystal.tcrf.net/wiki/EarthBound/Map_Data/Tile_Arrangement_Collision_Data)
   (0x80 solid, 0x02 upper-priority drop, 0x01 combined→fully hidden, 0x08 water, 0x04 damaging)
   and [CoilSnake wiki — Tile Editor](https://github.com/pk-hack/CoilSnake/wiki/Tile-Editor)
   (0x01/0x02 FG lower/upper, 0x04 sunstroke, 0x08 shallow, 0x0C deep, 0x10 ladder/stairs,
   0x20/0x40 unused, 0x80 solid).
2. **Census** (`node --import tsx scripts/surface-flag-census.mjs`, artifacts in `tmp/collision/`):
   whole-map bit usage `0x01=78066 0x02=36393 0x04=65571 0x08=17768 0x10=2077 0x20=0 0x40=0
   0x80=730236`; overlay PNGs show 0x01 on tree/shrub caps + roof top edges, 0x03 on canopy
   bands + upper walls, 0x10 on Onett cliff ladder lines, 0x04 mass = Dusty Dunes,
   0x0c/0x0f = Deep Darkness swamp.
3. **In-engine probes** (native-probe, screenshots in `tmp/collision/`):
   `probe-canopy-before.png` — player at a walkable 0x03 cell (1136,912) renders ON TOP of a
   roof crest (the draw-order bug this effort fixes); `probe-water.png` — 0x08 cell (3188,3268)
   is wet-floor puddle water; `probe-ladder.png` — 0x90 cell (1108,316) is the Giant Step
   cliff ladder mouth.
4. **SNES priority bits are zero** across all 20 tilesets (327,680 arrangement cells) —
   `cell.priority` contributes nothing; EB drives walk-behind entirely via 0x01/0x02.

## Mechanism decisions (why the fix is shaped this way)

- **0x02 → converter bake.** Foreground membership in `composeRegion`
  (`packages/eb-converter/src/world.ts`) additionally includes walkable cells with 0x02 set.
  Per-pixel occlusion via the existing FG chunk PNGs at depth 100000; actors keep y-sort depths
  below it. The solid-occluder heuristic stays (covers solid roof/wall art).
- **0x01-only → runtime bottom-crop** of the actor sprite when its feet cell carries it
  (reuse `waterClip` crop plumbing; no y-shift). Baking 0x01 into the FG layer would hide
  heads in every tall-grass field — EB hides only the lower body.
- **Rejected:** split-sprite half-depths and dynamic actor depth over the FG layer (breaks
  head-overlay depth 110000 and actor-vs-actor y-sort). Fallback if the Onett pilot shows
  front-of-canopy artifacts: dynamic per-actor depth.
- **Roof interiors stay an authored-overrides concern** (`content/collision-overrides.json`):
  EB marks them walkable (byte 0x00) because they were unreachable in EB; no flag bit
  distinguishes them. The reachability tool (Phase 4) finds the leaks.
- **Reusable map elements use tile-identity collision rules.**
  `content/tile-overrides.json` `collisionByTile` is keyed by
  `<map tileset>:<arrangement>`. A reviewed `solidForegroundCells` rule promotes
  that tile's `0x01`/`0x02` foreground-obscured cells to gameplay-solid at conversion
  time while preserving the raw byte in `surfaceRows`. Use this for repeated art
  such as isolated trees and dense tree-canopy families. Keep
  `content/collision-overrides.json` rectangles for
  one-location geometry such as doors, stamped buildings, and room-specific gaps.
  The reachability audit's roof-pocket heuristic also treats connected tree and
  fence edges as wall outlines. The known Onett lawn cells at `1992,1576` and
  `2408,1544` are intentionally baselined: pixel inspection confirms that both
  are open, reachable grass inside fence/tree arrangements, not roof leaks.
