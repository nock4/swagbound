# Act 1 sprite coverage — un-skinned NPC checklist

Generated for the sprite-quality pass. The "inconsistent quality" NPCs in playtest
are **un-skinned EB sprites** — NPCs whose sprite isn't yet overridden with Swagbound
art, so they fall through to the raw EarthBound sprite.

## How skinning works
`content/sprite-overrides.json` skins NPCs two ways (an NPC is skinned if **either** matches):
- **`bySpriteGroup`** — one art asset covers *every* NPC that uses that EB sprite group. **Highest leverage.**
- **`byNpcId`** — a single specific NPC (use for named/story NPCs that need a unique look).

Gotcha (see memory `sprite-override-system`): override texture keys need an image-path hash, or stale Phaser textures render nothing.

## Current coverage
- **Skinned:** 204 sprite groups + 83 specific NPCs (+ player, 8 battle enemies).
- **Un-skinned in Act 1:** **19 sprite groups → 44 NPCs.** These are the ones to draw.

## Un-skinned groups visible in Act 1 (priority = Act-1 count)
Add a `bySpriteGroup` entry for each. Spawn the sample NPC (`?nointro=1&spawn=x,y`) to see what it currently looks like.

| Priority | Sprite group | Act-1 NPCs | Total NPCs | Sample NPC @ x,y |
|---|---|---|---|---|
| 1 | **204** | 7 | 18 | npc 168 @ 1552,1184 |
| 2 | **374** | 6 | 6 | npc 49 @ 7280,824 |
| 3 | **199** | 4 | 8 | npc 177 @ 1664,2000 |
| 4 | **259** | 4 | 20 | npc 12 @ 7784,1472 |
| 5 | **373** | 4 | 4 | npc 23 @ 7728,304 |
| 6 | **214** | 3 | 26 | npc 1408 @ 1824,1128 |
| 7 | **375** | 3 | 3 | npc 29 @ 8176,1104 |
| 8 | **227** | 2 | 12 | npc 181 @ 1080,1400 |
| 9 | 206 | 1 | 5 | npc 186 @ 2072,1496 |
| 10 | 207 | 1 | 3 | npc 176 @ 1816,1768 |
| 11 | 208 | 1 | 2 | npc 175 @ 2000,1160 |
| 12 | 240 | 1 | 2 | npc 1273 @ 6064,272 |
| 13 | 293 | 1 | 4 | npc 375 @ 7552,1888 |
| 14 | 350 | 1 | 1 | npc 22 @ 7792,344 |
| 15 | 378 | 1 | 1 | npc 26 @ 8136,1088 |
| 16 | 384 | 1 | 1 | npc 27 @ 8152,1080 |
| 17 | 401 | 1 | 1 | npc 202 @ 1656,1608 |
| 18 | 414 | 1 | 2 | npc 593 @ 7328,1888 |
| 19 | 442 | 1 | 7 | npc 191 @ 2008,1440 |

Groups **204, 374, 259, 214** give the most visible coverage per asset (high total counts) — draw those first. Several samples at x>7000 are interior NPCs (homes/shops); x~1000–2200 are downtown overworld.

## Regenerate this list
After adding overrides, re-run the coverage scan (the node snippet in the orchestration log) to see what's still un-skinned. Once a group is in `bySpriteGroup`, every NPC using it is covered at once.
