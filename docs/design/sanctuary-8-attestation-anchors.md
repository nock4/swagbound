# Sanctuary-8 → Attestation Anchors (wave-2 skeleton)

Approved proposal: EB's eight "Your Sanctuary" boss flags become eight
provenance/Source sites, restoring the collect-the-eight spine inside the
Swagbound thesis. Each anchor = a visible site + a boss gate + the EB sanctuary
flag, so the vanilla doors/NPCs keyed to those flags light up as sites clear.

| # | EB sanctuary (flag) | EB town | Swagbound town | Anchor concept (draft for Nick) |
|---|---|---|---|---|
| 1 | Giant Step — FLG_WIN_GIAN_BOSS (190) | Onett | Morningside | **DONE**: the first threshold (Malady). Already mapped via signal:threshold_cleared. |
| 2 | Lilliput Steps — FLG_WIN_LLPT_BOSS (191) | Happy Happy / Twoson | Postwick | The Registry's sealed records room: the original intake ledger. |
| 3 | Milky Well — FLG_WIN_MLKY_BOSS (192) | Saturn Valley | LSW | The Source spring: where Little Swag World actually originates. |
| 4 | Rainy Circle — FLG_WIN_RAIN_BOSS (193) | Winters | Dead Letter outskirts | The undelivered archive: rain-soaked crates of firsts. |
| 5 | Magnet Hill — FLG_WIN_MGNT_BOSS (194) | Fourside | The Galleria | The vault under the gallery: provenance certificates, forged. |
| 6 | Pink Cloud — FLG_WIN_PINK_BOSS (195) | Summers | Solana Beach | The signal tower over the water: where copies broadcast. |
| 7 | Lumine Hall — FLG_WIN_LUMI_BOSS (196) | Dark | Vacancy Flats | The wall that displays your thoughts back at you, subtly edited. |
| 8 | Fire Spring — FLG_WIN_FIRE_BOSS (197) | Lost Underworld | The Unlisted Room | The first record. The thing Milady copied. |

Implementation recipe per anchor (reuse the boss-gate pattern from act2-postwick):
visible fixed boss sprite -> triggers.json boss gate (requireFlags = previous
act's spine) -> win sets the story flag -> flag-map raises the EB sanctuary flag
-> the vanilla FLG_WIN_*_BOSS doors/NPCs react. Attestation tie-in: each cleared
anchor awards a Source Check moment (existing system) + candidate FLG_STEP_*
flags (STEP_ONET 750 etc.) for the "your record so far" recap beat.

Sites 2-8 need Nick's pass on concepts + placement; then a codex authoring batch
per act (dialogue + boss casting via the boss studio + gate triggers).
