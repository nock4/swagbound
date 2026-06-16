# Interior Map Boundaries — sector-area render clipping

## Problem
EarthBound packs every interior into ONE giant tilemap, adjacent to each other.
The chunk renderer streams whatever is in the camera view, so a neighbouring
interior / outdoor region / void packed beside the current room rendered too —
"two maps in one scene" (e.g. an interior with another interior bleeding in
below, or a forest canopy bleeding over a cliff area).

## Why the old heuristic failed (diagnosed against the generated data)
The previous approach (`resolveConnectedRoomBounds`) flood-filled the connected
WALKABLE region, classified an interior by a size cap, then masked walkable +
a fixed 24-cell wall pad. Measured over 838 interior door destinations:
- **Classification miss:** 212/838 destinations flood-fill to a region larger
  than the 4096-cell cap → no mask → full bleed.
- **Pad over-expansion:** 100% of the 625 that *did* classify had neighbour
  walkable cells within the 24-cell pad → the pad pulled the neighbour in.
- **No geometric separator exists:** non-void (rendered) cells form ONE
  connected blob across the whole map (void is only ~33%, scattered), so you
  cannot bound a room by flooding rendered cells either.

## The real boundary: EB map sectors
`map_sectors.yml` carries 2560 sectors (32×80; each 8×4 tiles = 256×128 px) with
`Tileset / Palette / Music / Setting / Town Map / Item`. Validated structure:
- `Setting: none` = the seamless overworld — ONE 1348-sector component (+3 tiny
  strays). The player walks across it freely → **must NOT clip**.
- Every other `Setting` (indoors / "exit mouse usable" caves / magicant / robot /
  lost-underworld) = **370 bounded areas, each ≤45 sectors** → **clip each**.
- A per-sector *area signature* = `Tileset|Palette|Music|Setting|Town Map|Item`.
  The connected component (4-connected) of sectors sharing the player's signature
  CONTAINS the room's walkable floor with ≤2% clip in 720/837 interiors and never
  runs away to the overworld. The remaining ~117 are multi-signature rooms (floor
  crosses a sector boundary), fixed by unioning the sectors the player's bounded
  walkable component touches.

## Implementation
**Converter** (`packages/eb-converter/src/world.ts`, schema in `eb-schemas`):
emits `world.sectors = { cols, rows, sectorWidthTiles, sectorHeightTiles,
tileSize, areaIds, indoor, bounded }`. `areaId` is a stable FNV-1a hash of the
signature (opaque integer — not reversible to names). `bounded = Setting !==
"none"`. `indoor = Setting === "indoors"` (kept for reference; the clip gate uses
`bounded`). IP: only opaque numbers + 0/1 flags reach the JSON; no sector strings.

**Runtime** (`apps/game/src/roomBounds.ts` → `resolveSectorAreaBounds`, wired in
`chunkedWorldScene.ts`):
- player pixel → sector → `areaId` + `bounded`.
- area = 4-connected flood of same-`areaId` sectors, UNIONed with the sectors
  overlapped by the player's walkable component (capped ~6000 cells; over cap →
  skip union = exterior).
- `isInterior`/clip = the player's current sector `bounded` flag. `bounded` →
  mask the render to exactly the area sectors (neighbours/void blacked out).
  not bounded (overworld) → no clip, render normally.
- Camera stays centred on the player (unchanged); only the mask SOURCE changed.

## Verification (native 512×448, orchestrator-owned gate)
Screenshotted 9 spots across all setting types. Bleed eliminated in indoors
(Ness's house, log cabin), "exit mouse usable" caves/mines, and the Lost
Underworld; the overworld (Onett street, snowy cave mouth) renders unchanged
(no clip). 398 unit tests + tsc + `build:eb-fullworld` green.

Known cosmetic (pre-existing, NOT from this change): a few dark floor tiles in
some rooms render as small black patches — present before this work too.
