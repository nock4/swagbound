# Drifella 2 Trait Fields Summary

Source: `swagbound-og-assets/lsw-corpus/output/drifella2/`
Items scanned: 1,000
Trait fields found: 14

## Trait fields

- `1background` — 1,000 items, 200 unique values. Examples: convenience store, polar bear, dratini, knights sketch, toji class.
- `2background+` — 1,000 items, 42 unique values. Mostly `none`; examples: pregnant milady, ye fit, sans, chronos, regigigas.
- `3drifellabody` — 1,000 items, 146 unique values. Examples: orange cream plush, pink white sketch, diamond, gray sketch, light aura sketch.
- `4tattoos` — 1,000 items, 3 unique values. Mostly `none`; examples: phantom troupe, hisoka.
- `5cloth` — 1,000 items, 94 unique values. Examples: wet, evil prof oak shirt, tie dye smiley, ye, duck camo.
- `6accesory` — 1,000 items, 4 unique values. Mostly `none`; examples: warlax backpack, pokeball necklace, sonichu medallion.
- `7mouth` — 1,000 items, 88 unique values. Examples: snoot bubble, evil pepe with cigar, spider, skull, demonbat.
- `8nose` — 1,000 items, 5 unique values. Mostly `none`; examples: clown nose, fuzzy nose, bandage, real bandage.
- `9eyes` — 1,000 items, 50 unique values. Examples: gonna die, buttons, 3 eye, astro boy, sleepy.
- `91head` — 1,000 items, 81 unique values. Mostly `none`; examples: my call of duty, drifella angel hat, i feel like dying hat, airbrush hat.
- `92left` — 1,000 items, 110 unique values. Examples: monkey bomb, radium, jesus, dragon pet, ceramic chambered mifella heart.
- `93right` — 1,000 items, 88 unique values. Examples: blue wolf, fawn bat, groudon plush, blue scythe.
- `94overlay` — 1,000 items, 132 unique values. Richest text/flavor field. Examples: wake up we gotta turn the power on, she want me cuz im normal, nails, bomb, person who keeps gambling, dratini line sprite sheets.
- `95noise` — 1,000 items, 1 unique value: noise1.

## Notes

- Trait values often include rarity suffixes like `$1`, `$5`, `$90`; strip those for game text use.
- The most useful flavor-text fields are `94overlay`, `1background`, `5cloth`, `7mouth`, `91head`, `92left`, and `93right`.
- Several fields contain mature/offensive/weapon/drug phrasing, so promotion into runtime text should continue to use the `mature_review` filter.
