# Tile override worklist

`pnpm atlas:worklist` builds `content/atlas/tile-worklist.json` from
`content/atlas/tiles.json` and `content/tile-overrides.json`. The output is the ranked
list of used map tiles that do not yet have Swagbound override art.

## Why this is high leverage

EarthBound's full map repeats a small number of arrangements many times. Reskinning the
top-N tiles by `usageCount` shifts most visible map placements into the Swagbound design
language before the long tail is touched.

The worklist records `cumulativeCoverage` for each tile: the running share of all on-map
tile placements covered if you reskin from the top of the list down to that tile. The
summary also reports how many tiles reach 50%, 80%, and 95% coverage.

## Adding a tile override

1. Pick a high-usage tile from `content/atlas/tile-worklist.json` or the `/atlas` Tiles
   tab. Use `atlasImage`, `gx`, and `gy` to locate the 32px source tile in the tileset
   sheet.
2. Create 32x32 Swagbound tile art under `apps/game/public/assets/swagbound/tiles/`.
3. Add a `byTile` entry to `content/tile-overrides.json`, keyed as
   `<tileset>:<arrangement>`:

```json
{
  "schema": "swagbound.tile-overrides.v1",
  "byTile": {
    "0:42": {
      "image": "assets/swagbound/tiles/sidewalk-001.png"
    }
  }
}
```

The image path is relative to `apps/game/public`. Re-run `pnpm atlas:tiles` when you need
the tile atlas `overridden` flags refreshed, then re-run `pnpm atlas:worklist` to remove
completed tiles from the high-leverage list.

## Visual worklist

The `/atlas` Tiles tab is the visual companion to the JSON worklist. It shows each tile in
its source sheet with the same usage and override metadata, so the art task can be chosen
from the ranked JSON and checked visually in the browser atlas.
