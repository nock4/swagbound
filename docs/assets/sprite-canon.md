# Sprite Canon (Battle260 + Anchor96)

Authoritative rules for choosing sprite assets. Recorded 2026-07-14 from Nick's
decision handoff. This document is the checkpoint: it records the RULES and the
SOURCE PATHS. It does not itself perform a runtime import. Any import plan must
conform to this file.

## 1. The canonical pair

For a single sprite entity, the canonical pair is:

| Asset | Role |
|---|---|
| `battle-260.png` | battle / combat art |
| `overworld-anchor-96.png` | canonical overworld / map / NPC art |

## 2. OW48 is deprecated

`overworld-48.png` is NOT canonical when an Anchor96 exists. Never select a
separate legacy OW48 asset as final art.

The runtime consumes 48px overworld frames (`frameWidth: 48` throughout
`sprite-overrides.json`). Those 48px frames must be **derived from Anchor96**
(96 -> 48), never sourced from a pre-existing `overworld-48.png`.

## 3. No cross-entity mixing

Never pair a battle file from entity A with an Anchor96 from entity B. One
review/manifest row keeps its own paired assets. The `reviewKey` is the identity
that binds them: in the curation tree, an entity's Anchor96 lives in a folder
whose name encodes the battle entity's reviewKey (`<run>__<id>`).

## 4. Placement defaults (Nick)

- **Little Swag World** sprites are friendly dialogue NPCs, never enemies.
- **Drifella2** belongs to the friendly Source Check (Attestation) lane unless
  explicitly redirected.
- Old OW48 outputs are never treated as final canonical assets.

## 5. Source of truth (local-only, NOT tracked here)

The asset masters live in the vault repo `~/Projects/swagbound-new`. These
artifacts are the authority:

| Artifact | Rows | Notes |
|---|---|---|
| `good-new-sprites-battle-anchor96-authority.tsv` | 316 | 258 PFP + 58 Little Swag World |
| `drifella-sprite-filepaths.tsv` | 220 | Drifella2 |
| `docs/ops/anchor96-missing-fill.md` | - | fill-run notes |
| `asset-lab/curation/good-new-sprites/` | 46 run dirs | per-entity `source.png`, `battle-260.png`, `overworld-anchor-96.png`, `manifest.json` |

**Validation run 2026-07-14** against `good-new-sprites-battle-anchor96-authority.tsv`:
all 316 rows have an existing `battle`, `anchor96`, and `manifest` file, and **0
pairing violations** (every anchor96 folder resolves to its own row's reviewKey).
The table is trustworthy as-is.

### 5a. TRAP in `drifella-sprite-filepaths.tsv`

Its columns `overworld_final` and `overworld_original` both point at
**`overworld-48.png`**, which rule 2 deprecates. The column named "final" is the
WRONG one under this canon.

> Use the **`overworld_anchor96`** column. It is populated for all 220 rows.

### 5b. Vault worktree is unsafe

`swagbound-new` currently has a dirty worktree (~3,335 tracked deletions, ~380
untracked paths). Treat it as **read-only**: never run a blanket
`add` / `commit` / `reset` / `clean` there. Read the artifacts, copy assets out,
change nothing.

## 6. Runtime destination (this repo)

Authoring lives in `content/sprite-overrides.json`; `pnpm build:eb-fullworld`
emits `apps/game/public/generated/sprite-overrides.json` (content is inert until
built). Images live under `apps/game/public/assets/swagbound/**` and are
referenced without a leading slash (`assets/swagbound/...`).

| Canonical asset | Override key | Shape |
|---|---|---|
| `battle-260.png` | `byEnemyId` | battle art (`displayHeight` ~160) |
| `overworld-anchor-96.png` (derived to 48) | `overworldByEnemyId`, `bySpriteGroup`, `byNpcId` | `frameWidth: 48` |
| hero art | `player`, `party` | - |

Gotcha: texture keys need an image-path hash, or stale textures render nothing.

## 7. Current coverage (2026-07-14)

**1,277 of 1,582 world NPCs carry a sprite override (80%). 305 NPCs across 78
sprite groups have none and fall back to stock EarthBound art.** Closing that gap
is the motivating work for the import plan; it is why vanilla EB NPCs are still
visible in the shipped build.

Prior artifacts that are NOT decisions: `content/anchor96-casting-plan.json` on
branch `feat/anchor96-roamers` is a machine proposal (`"status": "proposal"`,
251 of 265 rows marked `needs-human`). Do not mistake it for approved casting.
