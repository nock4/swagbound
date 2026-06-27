# Setup

The Swagbound game (an EarthBound mod). Most of the repo is self-contained, but the
**EarthBound-derived build inputs — the ROM and the CoilSnake decompile — are NOT committed**.
They're Nintendo's copyrighted data and this repo is public, so they stay local and gitignored.
You supply them once.

## Prerequisites
- Node + `pnpm` (`pnpm install`)
- An EarthBound (USA) ROM you legally own
- A CoilSnake decompile of that ROM (the `external/coilsnake-full` project export)

## One-time setup
1. `pnpm install`
2. Put your ROM at the repo root as `EarthBound (USA).sfc` (gitignored; read by the ROM-RE scripts).
3. Provide the CoilSnake decompile at `external/coilsnake-full/` (gitignored; the build reads it).
   Decompile your ROM with CoilSnake into that path, or point the build elsewhere with
   `EB_PROJECT=/path/to/decompile`.
4. `pnpm build:eb-fullworld` — regenerates `apps/game/public/generated/` (must print `"errors": 0`).
5. `pnpm --filter @eb/game dev` — serves the game (prints the local URL, typically
   http://127.0.0.1:5173).

## Common commands
- `pnpm test` — unit/integration suite
- `pnpm -C apps/game exec tsc --noEmit` — typecheck
- `pnpm exec tsx scripts/run-battle-matrix.ts` — battle item/PSI coverage report

## Vendored sources — `vendor/`
Your own Swagbound source masters (dialogue, sprite art, text corpus, audio) live in `vendor/`,
so the import scripts no longer reach into the external `~/Projects/swagbound-*` repos. See
[`vendor/README.md`](vendor/README.md). Re-import dialogue with
`pnpm exec tsx scripts/import-swagbound-dialogue.ts` (defaults to `vendor/swagbound-dialogue`;
override with arg 1 or `$SWAGBOUND_DIALOGUE_DIR`).

## What's gitignored, and why
- `EarthBound (USA).sfc`, `external/coilsnake-full/`, `external/coilsnake-project/` — Nintendo
  copyright; never goes in a public repo.
- `apps/game/public/generated/` — rebuilt by `build:eb-fullworld`.
- `.codex/`, `apps/game/public/audio/jammers/` — large, local-only artifacts.
