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

- **An original Phaser 3 engine** (`apps/game/`) that reimplements EarthBound's
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
- **Tooling** (`scripts/`): the full build (`build:eb-fullworld`), a balance
  autorunner that plays the entire arc unattended (`scripts/arc-runner.mjs`), QA
  fleets, atlas extractors, and collision/navmesh generators.

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

## Deploy

```bash
cd apps/game
npm run build             # vite build + prune-dist-audio (drops non-shipping audio)
wrangler pages deploy dist --project-name=swagbound --branch=main --commit-dirty=true
```

Production: **https://swagbound.pages.dev** (Cloudflare Pages). The 27 runtime
soundtrack tracks are cleared for distribution and committed; raw source audio stays
gitignored and is pruned from every build.

## Repo map

| Path | What it is |
|---|---|
| `apps/game/` | The Phaser 3 game (engine + `public/generated/` runtime data) |
| `packages/eb-converter/` | CoilSnake-decompile → runtime-JSON converter |
| `packages/eb-schemas/` | Shared zod schemas for all generated/content data |
| `packages/content-builder/` | Content-layer build tooling |
| `content/` | Authored game content (triggers, dialogue, cutscenes, overrides) |
| `scripts/` | Build, balance-runner, QA, and extraction tooling |
| `vendor/` | Swagbound source masters (dialogue corpus, art) |
| `docs/` | Design docs + historical reports (dated reports are era-stamped) |

## Licensing boundary

The engine, tooling, and authored content are original. The EarthBound ROM and its
CoilSnake decompile are Nintendo's copyrighted data: they are required local build
inputs, are gitignored, and must never be committed. Package scopes (`@eb/*`) and
converter terminology refer to the EarthBound data formats the converter consumes.
