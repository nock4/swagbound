# EarthBound grounding for the Swagbound Atlas

Research pass (2026-06): how to keep the Atlas / design system *accurate*, and what the
authoritative sources actually are — written for AI-assisted processes that build on this.

## Principle: the local ROM data is the ground truth

The Atlas is grounded in **the CoilSnake project the converter consumes**
(`external/coilsnake-full/`), which is a faithful decompile of the EarthBound ROM. That is
the authoritative source — more reliable, and self-contained, vs. external wikis. Verified
against Data Crystal's ROM map; do not override local data with a wiki guess.

Authoritative local signals already used by the Atlas:
- **Town** — `map_sectors.yml` `Town Map Image` (per sector). EB defines exactly **6 town
  maps**, confirmed by Data Crystal's ROM map (per-town blocks at 0x2023A8–0x20EF02):
  **Onett, Twoson, Threed, Fourside, Scaraba, Summers**. Everything else is `none`
  ("Unmapped area") — that is true in the ROM, not a gap in our data.
- **Area music** — `map_sectors.yml` `Music` (per sector; ROM table 0x1CD837). A numeric id
  with NO name table in the ROM. Clusters the unmapped buildings into ~15 areas but does not
  name them (EBMusEd's "code list" / map_music.yml carry ids, not authoritative area names).
- **Buildings/doors** — `map_doors.yml` (`parseMapDoors`), filtered to outdoor-source doors.
- **Characters** — `SpriteGroups/` + `sprite-overrides` (Swagbound names).
- **Text** — `scripts.json` (the in-game text bank: shop/area strings live here).

## What research could and could NOT provide
- COULD (Data Crystal, accessible): validated the 6-town structure + the ROM data layout
  (per-sector music, town-map blocks, song table 0x04F90A). No song/area NAME tables in ROM.
- COULD NOT (all 403 / expired-cert / bot-blocked for automated fetch): starmen.net
  shoplist + music-numbers, Fandom, WikiBound, StrategyWiki, web.archive.org. These hold the
  community-maintained music-id→name and shop-per-town lists.

## Browser research (2026-06, via the user's Chrome — reaches the bot-blocked sources)
Using a live browser bypassed the 403/cert blocks. Findings:
- **Authoritative shop list obtained** (starmen.net) → `content/atlas/eb-shops.json` (16 areas, the canonical EarthBound shop/vendor vocabulary). This is the reference for shop names + catalog validation. Mapping a multi-shop town's individual buildings still needs the interior sign / shop inventory.
- **Music-id table is NOT directly applicable.** The community list (ShrineFox) maps SONG ids → area (46=Onett, 51=Desert, 54=Winters, 50=Moonside, 59=Dalaam, 64=Deep Darkness, 48=Saturn Valley, 52=Peaceful Rest Valley; 26=Hotel, 28=Store, 23=Home). BUT our `map_sectors.yml` `Music` field is an **INDEX**, not the song id — verified: Onett's overworld Music = `2`, not `46`. Translating index→song needs `map_music.yml`, which is event-flag-conditional with encoded values (49306, 33284…) — too much RE for the payoff. So area names stay **visual-grounded** (in-game recognition), not music-mapped. (Correction: PR #112's "Moonside" guess used the wrong frame; trust the in-game visual, mark confidence.)

## EarthBound location set (reference, from search; for AI context)
6 town-mapped: **Onett, Twoson, Threed, Fourside, Scaraba, Summers**.
Unmapped areas (no town map; ~22): Peaceful Rest Valley, Happy-Happy Village, Lilliput
Steps/Giant Step, Winters, Saturn Valley, Belch's Base, Milky Well, Dusty Dunes Desert,
Moonside, Monkey Caves, Monotoli Building, Dalaam, Pink Cloud, Pyramid, Dungeon Man, Deep
Darkness, Tenda Village, Stonehenge Base, Lumine Hall, Lost Underworld, Fire Spring,
Magicant.

## Accurate path for the remaining gaps (no external source needed)
- **Unmapped area names** — group unmapped buildings by sector `Music` id (done: ~15
  clusters), then NAME each cluster by **in-game visual recognition** (spawn at the cluster
  center; EB areas are visually unmistakable: Winters = snow, Dusty Dunes/Scaraba = desert,
  Dalaam = clouds, Deep Darkness = swamp, Magicant = psychedelic, Saturn Valley = caves +
  Mr. Saturn). This is grounded (the rendered ROM map), not a guess. Cross-check the cluster
  center's world position against the EB overworld layout.
- **Shop types** — for named-town shops, mine the shop NPC's event (`shop` id + inventory)
  and the in-game `scripts.json` text near the building; reserve "Drugstore vs Bakery" calls
  for cases where the interior sign reads cleanly from the chunk render or the inventory is
  decisive. Otherwise keep the function label (Shop/Inn/Service desk) — honest over guessed.

## Rule for future AI processes
Prefer local ROM-derived data; verify spatial/identity claims in-game (spawn + screenshot),
never by eyeballing coordinates; mark confidence (`verified` vs `inferred`); and treat
external wikis as secondary references, not authorities.

Sources: [Data Crystal — EarthBound ROM map](https://datacrystal.tcrf.net/wiki/EarthBound/ROM_map),
[Data Crystal — EarthBound Audio](https://datacrystal.tcrf.net/wiki/EarthBound/Audio),
[CoilSnake (pk-hack)](https://github.com/pk-hack/CoilSnake),
[List of EarthBound locations (Fandom)](https://nintendo.fandom.com/wiki/List_of_EarthBound_locations).
