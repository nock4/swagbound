# Swagbound Sprite Role Authority Handoff

Purpose: help agents distinguish **regular enemies**, **bosses**, **friendly NPCs**, and **hero characters** without guessing from sprite filenames.

## Current repo

Work in this repo unless Nick explicitly names another repo:

```bash
cd /Users/nickgeorge-studio/Projects/coilsnake-tutorial-experiment
```

## Current runtime/source-of-truth files

| Role question | Current repo authority |
|---|---|
| Hero / player sprite | `content/sprite-overrides.json` → `player` |
| Hero / player name | `content/character-overrides.json` → `byCharId["0"]` |
| Friendly overworld NPC sprites | `content/sprite-overrides.json` → `byNpcId` and `bySpriteGroup` |
| Battle enemy sprites | `content/sprite-overrides.json` → `byEnemyId` |
| Battle enemy names | `content/enemy-overrides.json` → `byEnemyId` |
| Boss/story placement | `content/triggers.json` battle triggers + `content/battle-rules.json` unescapable groups |
| Story barrier / route gate sprites | `content/triggers.json` → `barriers[]` |

## Do not infer role from folder alone

The current override file may reference paths like `assets/swagbound/enemy/...`, but role is decided by the JSON section:

- `player` = hero/player sprite
- `byNpcId` = specific overworld NPC override
- `bySpriteGroup` = broad overworld person/NPC reskin
- `byEnemyId` = battle enemy sprite override

If an image path looks like an enemy but appears under `byNpcId`/`bySpriteGroup`, treat it as overworld/NPC usage for that runtime context. If it appears under `byEnemyId`, treat it as battle enemy usage.

## Current hero

Act 1 is solo Bosch.

```json
content/character-overrides.json
{
  "byCharId": {
    "0": { "name": "Bosch" }
  }
}
```

Current player sprite:

```text
content/sprite-overrides.json → player.image = assets/swagbound/hero/lsw-2821-walk.png
```

Do not invent or surface party slots 1-3 for Act 1.

## Current friendly NPC buckets

Friendly / overworld NPC usage is in:

```text
content/sprite-overrides.json → byNpcId
content/sprite-overrides.json → bySpriteGroup
```

At the latest inspection:

- `byNpcId`: 83 entries
- `bySpriteGroup`: 204 entries

Examples under `byNpcId`:

| NPC id | Sprite path |
|---|---|
| `404` | `assets/swagbound/npc/npc-sal.png` |
| `749` | `assets/swagbound/npc/npc-morrow.png` |
| `100100` | `assets/swagbound/npc/npc-neighbor.png` |
| `100101` | `assets/swagbound/npc/npc-kid.png` |
| `100102` | `assets/swagbound/npc/npc-bonkle.png` |

Use these for overworld/friendly/person placement. They are not battle enemies unless separately present under `byEnemyId` or in battle content.

## Current regular battle enemies

Battle enemy sprites are in:

```text
content/sprite-overrides.json → byEnemyId
```

Battle enemy names are in:

```text
content/enemy-overrides.json → byEnemyId
```

At the latest inspection:

- `byEnemyId`: 143 entries
- unique Swagbound enemy names: 34

Current unique enemy-name families and EB numeric IDs:

| Enemy family | EB numeric ids |
|---|---|
| AI Slop | 59, 106, 159, 224 |
| Bat Poncho | 36, 87, 111, 148 |
| Cinder Cap | 29, 64, 80, 136 |
| Collection 2 for Solana | 43, 91, 117, 151 |
| Cryptic Kids | 14, 22, 68, 119 |
| Cryptic Kids 2 | 50, 100, 144, 195 |
| Demonfella II | 6, 10, 62, 109, 130 |
| Edible Demon | 4, 5, 61, 108, 209 |
| Ethereal Sols | 28, 57, 78, 135 |
| Faithful Servants | 1, 3, 60, 107, 227 |
| Gay Mouse Crisis Center | 56, 104, 157, 222 |
| Goobdle-S | 58, 105, 158, 223 |
| Happy Camper | 7, 11, 63, 112 |
| Heavy Liquid Graphic | 35, 86, 98, 147 |
| Hexp Hood | 46, 96, 129, 154 |
| Knitkitmori | 8, 12, 66, 114, 210 |
| Malady | 18, 37, 72, 126 |
| Mifella 2 | 30, 65, 82, 138, 131 |
| Milardio | 15, 24, 69, 120 |
| Paingelz | 17, 32, 71, 124 |
| Pifella | 16, 25, 70, 123 |
| Plastic Fool | 38, 89, 113, 149 |
| Question Marketeer | 47, 97, 134, 155 |
| Returnless King | 20, 54, 76, 132 |
| Runway Show | 45, 94, 122, 153 |
| Sawtooth Bun | 44, 92, 121, 152, 211 |
| Signal Stutter | 23, 55, 77, 133 |
| Solfis | 9, 13, 67, 115 |
| Swag Raccoon | 48, 99, 139, 156 |
| Tape Code | 52, 101, 145, 212 |
| Tojiba Disc Buddy | 33, 85, 88, 143 |
| Unicornio | 53, 103, 150, 214 |
| Ushanka Shade | 31, 81, 84, 118, 142 |
| Wifeystation | 19, 51, 75, 127 |

Treat these as battle enemies when referenced by enemy ID/group in generated EB battle data or Swagbound triggers.

## Current boss / story battle placement

Bossness is not encoded only by sprite filename. For the current repo, use story trigger usage and battle rules.

Current story-trigger battle gates:

| Trigger | Battle group | Story role | Flags set |
|---|---:|---|---|
| `signal-town-card-clique` | 448 | public-version clique / local Act-1 confrontation | `signal:clique_cleared` |
| `relay-gate-returnless-king` | 36 | civic authority / classification gate | `signal:route_open` |
| `first-threshold-malady` | 450 | first threshold / Malady symptom boss | `signal:threshold_cleared`, `source:first_witness` |

For Act 1, the intended boss/major story enemies are:

- **Malady**: primary Act-1 threshold boss / Milady-world infection symptom
- **Returnless King**: civic authority / road-opening story boss
- **Public Version Clique / card-clique encounter**: local public-version gang function, currently battle group 448

Check `content/battle-rules.json` for unescapable groups before deciding whether a battle should behave as boss-like.

## Historical organized sprite-role audit

We did organize this in the prior Swagbound repo. Use it as **historical review authority**, not as the active runtime target unless Nick asks to migrate or compare.

Historical paths:

```text
/Users/nickgeorge-studio/Projects/swagbound-new/docs/ops/character-set-authority-sprite-audit.md
/Users/nickgeorge-studio/Projects/swagbound-new/asset-lab/sprites/sprite-audit/character-set-authority.json
/Users/nickgeorge-studio/Projects/swagbound-new/asset-lab/sprites/sprite-audit/character-set-authority-decisions.json
/Users/nickgeorge-studio/Projects/swagbound-new/_archive/swagbound-phaser/docs/status/enemy-placement-board-2026-05-11.md
```

Key rules from that audit:

- Review unit is a **character set**, not an individual PNG.
- Enemies require one battle sprite and one overworld sprite.
- Friendly NPCs require one overworld/walk sprite only.
- Heroes/party candidates stay in the person/overworld lane unless a later battle system explicitly requires battle art.
- `isBoss` is review metadata for encounter planning.
- `isOverworldFriendlyNpc` means no battle sprite is required.
- Runtime roster/content is the highest authority when it exists.

Historical accepted boss-set decisions:

| Character set | Act | Battle path | Overworld path |
|---|---|---|---|
| `malady` | act-1 | `swagbound-phaser/public/assets/generated/enemies/malady-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/malady-overworld-v1-ow-001-nearest.png` |
| `beefellaz` | act-2 | `swagbound-phaser/public/assets/generated/enemies/beefellaz-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/beefellaz-overworld-v1-ow-001-nearest.png` |
| `milardio` | act-2 | `swagbound-phaser/public/assets/generated/enemies/milardio-battle-v1-extracted-crop.png` | `swagbound-phaser/public/assets/generated/enemies/milardio-overworld-v1-ow-001-nearest.png` |
| `hakutaku-rebirth` | act-3 | `swagbound-phaser/public/assets/generated/enemies/hakutaku-rebirth-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/hakutaku-rebirth-overworld-v1-ow-001-nearest.png` |
| `midladys-fumogeddon` | act-3 | `swagbound-phaser/public/assets/generated/enemies/midladys-fumogeddon-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/midladys-fumogeddon-overworld-v1-ow-001-nearest.png` |
| `milady-3832` | act-3 | `swagbound-phaser/public/assets/generated/enemies/milady-3832-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/milady-3832-overworld-v1-ow-001-nearest.png` |
| `milady-4847` | act-3 | `swagbound-phaser/public/assets/generated/enemies/milady-4847-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/milady-4847-overworld-v1-ow-001-nearest.png` |
| `mimany` | act-3 | `swagbound-phaser/public/assets/generated/enemies/mimany-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/mimany-overworld-v1-ow-001-nearest.png` |
| `mylady` | act-3 | `swagbound-phaser/public/assets/generated/enemies/mylady-battle-v1-alpha-extracted-source-size.png` | `swagbound-phaser/public/assets/generated/enemies/mylady-overworld-v1-ow-001-nearest.png` |

Historical Act-1 placement board:

| Encounter | Role | Placement intent |
|---|---|---|
| `question-marketeer` | early public demand | Signal Town pressure where Bosch is made to answer the wrong question loudly |
| `mirror-glitch` | false-signal proof | early false public version and repeated afterimage pressure |
| `sawtooth-bun` | low-route friction | early ordinary-strange route hazard |
| `cinder-cap` | hot feedback | signal burn and feedback pressure before Relay logic hardens |
| `park-static` | witness pressure | Signal Park public gaze |
| `tunnel-hiss` | decree/classification pressure | Underpass/Relay approach pressure |
| `malady` | Milady-world infection | hostile public-version disease, not generic static |
| `tape-code` | copied correction loop | Bosch's correction replayed wrong until official |
| `tojiba-disc` | proof-media registry | witness marks, scanning, filing, half-written records |

Historical Act-1 reserves:

- `plastic-fool`: corner-shop, false-defense, charm-loop, prize-machine, or “fit first, truth later”; do not use for Relay classification.
- `faithful-servants`: late Act 1 civic/Town Hall/Relay administrative pressure.
- `hexp-hood`: harsher street or underpass pressure.
- `knitkitmori`: thread/witness/canon-drag side route.
- `glitchling`: static/noise reserve.
- `happy-camper`: hold, no strong Act-1 story slot yet.

Historical Act-2 reserve families:

| Family | Candidates |
|---|---|
| casino/timeshare/debt/status | `collection-2-for-solana`, `runway-show`, `milardio`, `mifella-2` |
| med-spa/body/appetite | `heavy-liquid-graphic`, `paingelz`, `pifella`, `ethereal-sols` |
| dead condos/service loneliness | `wifeystation`, `faithful-servants`, `gay-mouse-crisis-center` |
| coastal proof-map weird | `unicornio`, `demonfella-ii`, `cryptic-kids`, `cryptic-kids-2`, `goobdle-s` |
| provisional visual hold | `solfis` |

## Classification procedure for another agent

When confused, follow this exact order:

1. Open `content/sprite-overrides.json`.
2. If the sprite path is under `player`, it is the hero/player.
3. If it is under `byNpcId` or `bySpriteGroup`, it is overworld NPC/person usage.
4. If it is under `byEnemyId`, it is battle enemy usage.
5. Open `content/enemy-overrides.json` to get the Swagbound enemy name for that numeric enemy ID.
6. Open `content/triggers.json` and `content/battle-rules.json` to determine whether that enemy/group is currently boss/story-gated/unescapable.
7. Only consult the historical `swagbound-new` audit when choosing from unpromoted candidates or explaining prior organization.

## Validation commands after edits

```bash
cd /Users/nickgeorge-studio/Projects/coilsnake-tutorial-experiment
python3 -m json.tool content/sprite-overrides.json >/dev/null
python3 -m json.tool content/enemy-overrides.json >/dev/null
python3 -m json.tool content/triggers.json >/dev/null
pnpm build:eb-fullworld
pnpm validate
pnpm test
pnpm exec tsc --noEmit
```
