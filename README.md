# Swagbound

**A complete EarthBound total-conversion game, playable now at
[swagbound.pages.dev](https://swagbound.pages.dev).**

Bosch, a kid with a hood and a Dox Sheet, versus Milady, an omnipresent evil that
runs on four fuels: anonymity, network-state spirituality, psy-ops, and financial
nihilism. The counters are friendship, honesty, and your true self. Four acts across
a renamed EarthBound world (Morningside, Postwick, Dead Letter, the Galleria, Solana
Beach, Vacancy Flats, the Unlisted Room), an art gallery's worth of original sprites,
and a licensed 27-track mixtape. The full arc plays start to finish: title screen to
`game:complete`.

> This repo began life as a CoilSnake-tutorial experiment (the old repo name) and
> grew into the full game. If any doc reads like "we are following the EarthBound
> romhacking tutorial," it is historical. This README and `CLAUDE.md` are current.

## What this actually is

- **An original Phaser engine** (Phaser 4, CANVAS renderer; `apps/game/`) that reimplements EarthBound's
  systems: chunked overworld streaming, EB-faithful battles (two-phase rounds,
  hit-rate rolls, rolling HP, Pray/Spy/Mirror), doors/interiors, cutscenes, menus,
  save/continue, and a Web Audio music layer.
- **A converter** (`packages/eb-converter/`) that turns a local CoilSnake decompile
  of an EarthBound ROM into the JSON/PNG runtime data in
  `apps/game/public/generated/`. The ROM and decompile are **never committed**
  (Nintendo's copyright); see [SETUP.md](SETUP.md).
- **An authored content layer** (`content/`) that overrides and extends everything:
  story triggers and flags, custom dialogue (~700 voiced NPCs), cutscenes, sprite
  and enemy reskins, item/PSI effects, music placement, the Attestation
  trivia-collectible minigame, and the four optional "fuel" questlines (The
  Correction, The Floor, The Onboarding, The Unsigned).
- **The Mons system + Mons Ranch** — an SMT-fusion-x-Pokemon layer over 777 Super
  Metal Mons: catch wild mons, raise a companion, and fuse them (race chart,
  skill inheritance, secret recipes, plus triple/sacrificial fusion, affinity-gated
  inheritance, and full-moon fusion accidents). The **Mons Ranch** is a
  Stardew-style buildable farm on newly minted map land, entered through the Site E
  barn door: spend Swag Coins on placeable buildings and decor, staff them with
  mons to produce items and move cards as you walk, fill billboard requests, and
  browse the **Compendium** of every mon you've owned (press C) to re-summon them.
- **Tooling** (`scripts/`): the full build (`build:eb-fullworld`), the ranch
  land-mint step (`scripts/mint-ranch-land.py`), a balance autorunner that plays
  the whole arc unattended (`scripts/arc-runner.mjs`), an **autonomous playtester**
  that explores the game and flags crashes/soft-locks/invariant breaks
  (`scripts/autoplaytest.mjs`), atlas extractors, and collision/navmesh generators.

## Quick start

Prerequisites and the ROM/decompile setup live in [SETUP.md](SETUP.md). Then:

```bash
pnpm install
pnpm build:eb-fullworld   # content/ -> apps/game/public/generated/ (required after content edits)
pnpm dev                  # serve the game locally
pnpm test                 # unit/integration suite
```

**The one rule that bites everyone:** the game reads `apps/game/public/generated/`,
not `content/`. Content edits are INERT until `pnpm build:eb-fullworld` runs. After a
build, reset the chunk-art noise (`git checkout -- apps/game/public/generated/assets/world/chunks/`)
and commit only the changed data files.

## Playtesting & QA

Three nets catch bugs, in addition to the unit/integration suite:

- **In-game bug reporter** — press **N** anywhere in the live game to leave a note.
  It auto-attaches the save file, position, story flags, build stamp, and a
  screenshot, and posts to a Cloudflare Pages Function that stores reports in KV
  (`apps/game/functions/api/`). Reports are pulled for review via a key-gated
  JSON API (`/api/bugs?key=…`).
- **Property-based fuzzing** — `pnpm test:fuzz` (also runs inside `pnpm test`):
  fast-check throws thousands of randomized op sequences at the save-critical pure
  modules (FarmState, Compendium, fusion, move cards) and asserts invariants that
  must hold for any input (no save-bricking, no negative currency, no invalid mon).
- **Autonomous playtester** — `pnpm dev`, then
  `pnpm test:autoplay http://127.0.0.1:5199 <steps> <seed>`: drives the game through
  its debug hooks, explores the overworld/ranch/fusion/menus, and flags crashes,
  soft-locks, dialogue-hangs, and invariant breaks with repro context.

## Deploy

```bash
cd apps/game
npm run build             # vite build + prune-dist-audio (drops non-shipping audio)
wrangler pages deploy --branch=main   # reads apps/game/wrangler.toml: ships dist + the /api/* Functions + KV binding
```

Use the `wrangler.toml` form above (not `wrangler pages deploy dist …`): the config
file wires the Pages Functions bundle and the bug-report KV binding, which a bare
`deploy dist` would drop. Production: **https://swagbound.pages.dev** (Cloudflare
Pages). The 27 runtime soundtrack tracks are cleared for distribution and committed;
raw source audio stays gitignored and is pruned from every build.

## Repo map

| Path | What it is |
|---|---|
| `apps/game/` | The Phaser 4 game (engine + `public/generated/` runtime data) |
| `apps/game/functions/` | Cloudflare Pages Functions (the bug-report API) |
| `packages/eb-converter/` | CoilSnake-decompile → runtime-JSON converter |
| `packages/eb-schemas/` | Shared zod schemas for all generated/content data |
| `packages/content-builder/` | Content-layer build tooling |
| `content/` | Authored game content (triggers, dialogue, cutscenes, overrides) |
| `scripts/` | Build, balance-runner, QA, and extraction tooling |
| `vendor/` | Swagbound source masters (dialogue corpus, art) |
| `docs/` | Design docs + historical reports (dated reports are era-stamped) |
| `docs/qa/codebase-review-handoff.md` | Full engineering + QA onboarding brief for a reviewer (paste-ready) |

## Licensing boundary

The engine, tooling, and authored content are original. The EarthBound ROM and its
CoilSnake decompile are Nintendo's copyrighted data: they are required local build
inputs, are gitignored, and must never be committed. Package scopes (`@eb/*`) and
converter terminology refer to the EarthBound data formats the converter consumes.
