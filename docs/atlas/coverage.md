# Swagbound design-language coverage (Atlas Phase 6)

The point of the Atlas is to author **custom maps in the Swagbound design language**.
That requires knowing which element classes already *have* a Swagbound treatment vs.
which are still raw EarthBound. Computed from the atlas datasets:

| Element class | Swagbound coverage | Source |
|---|---|---|
| **Characters** (sprites) | **253 / 342 skinned (74%)** — 89 raw EB | `sprites.json` overrideKind (group/npc/enemy) |
| **Battle backgrounds** | **183 / 200 used reskinned (92%)** | `backgrounds.json` + `background-overrides.json` |
| **Map tiles** | **0% — no tile-override system exists** | `tiles.json` (no override field; no `content/tile-overrides.json`) |
| **Motifs / buildings / rooms** | **0%** — composed from raw EB tiles | derived from `tiles.json` |
| **UI / windows / fonts** | minimal / largely raw EB | `ui.json` |
| **Town maps + icons** | raw EB | `townmaps.json` |

## The strategic finding

**Characters and battle backdrops have a real Swagbound design language. The map itself does not.**
Every one of the 21,707 tiles — and therefore every tree, bush, building, room, and
sign motif built from them — is still rendered with EarthBound's original art. There is
no tile-override layer (the `sprite-overrides.json` / `background-overrides.json` pattern
has no equivalent for map tiles).

So: **authoring custom maps "in the design language" is currently blocked on there being
a map design language at all.** The sprites walking around are Swagbound; the world they
walk through is EarthBound.

## The path forward (Phase 7 — map design system)

To customize maps in a Swagbound language, the missing piece is a **tile/motif override
layer** — a `content/tile-overrides.json` (and/or `motif-overrides.json`) analogous to
`sprite-overrides.json`, mapping EB tiles/motifs → Swagbound art, consumed by the
converter when it renders chunks. The Atlas is the exact tool to drive that work:

1. **Prioritize by usage** — `tiles.json` ranks every tile by real-map `usageCount`.
   Reskinning the top ~200 tiles (grass, road, brick, roof, water, tree) covers the
   overwhelming majority of what the player sees. The long tail can follow.
2. **Work at the motif level where it reads as objects** — trees/bushes/buildings are
   recognizable motifs (`motifs.json`); a Swagbound treatment per motif type is higher
   leverage than per fragment-tile.
3. **The browser is the worklist** — `/atlas/` shows every tile/motif that needs art;
   add Swagbound art + the override entry, rebuild, and the map shifts into the design
   language incrementally (exactly how the 253 character skins were built).

This is design-direction work (Nick creates the Swagbound tile art); the engine side is
a converter override hook + a content file, mirroring the proven sprite/background path.
