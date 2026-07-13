# CoilSnake Tutorial: Your First Hack Status

> **Historical document (CoilSnake-tutorial era, 2026-06).** This repo is now
> Swagbound, a complete EarthBound total-conversion game; see the root README.md.
> Kept as a record; do not follow as current guidance.

## Scope

Objective source:

```text
https://github.com/pk-hack/CoilSnake/wiki/Tutorial%3A-Your-First-Hack
```

This project completes the local Phaser/tutorial-data slice and has one
successful narrowed Snes9x NPC `744` proof in a bedroom fixture. The original
roadblock/original-placement NPC targeting proof remains unresolved and is not
claimed complete. ROM compilation and emulator verification were performed only
after explicit permission, and all ROM inputs and outputs remain ignored local
files.

## Implemented

- Local CoilSnake project import from `external/coilsnake-project`.
- CCScript parsing for `ccscript/robot.ccs`.
- `robot.hello_world` script resolution.
- Dialogue playback in the Phaser first scene.
- Metadata-only `SpriteGroups/005.png` detection.
- Text/YML scanner proof for `robot.hello_world`.
- Tutorial NPC `744` text pointer applied to ignored local fixture text/YML.
- Generated tutorial audit status in `tutorial-status.json`.
- Ignored local ROM output compiled successfully.
- Compiled ROM boot-verified in Snes9x.
- Narrowed local-only bedroom NPC `744` proof recorded in Snes9x.
- Local Playwright video/trace review verifies the playable Phaser path.

## Generated Contract

Generated files live under:

```text
apps/game/public/generated
```

Current generated files:

- `manifest.json`
- `scripts.json`
- `npcs.json`
- `sprite-groups.json`
- `tutorial-status.json`
- `validation-report.json`

`manifest.json` references every generated data file through `files`.
`tutorial-status.json` records tutorial checks as structured steps with:

- `id`
- `label`
- `status`
- `evidence`
- optional `path`
- optional `expected`
- optional `actual`

Step statuses are:

- `pass`
- `fail`
- `blocked`
- `unknown`

## Current Tutorial Evidence

Current generated status after `pnpm convert`:

- Steps: 16
- Passed: 14
- Failed: 2
- Blocked: 0
- Unknown: 0

Passing evidence:

- `Project.snake` exists.
- `ccscript/robot.ccs` exists.
- `hello_world:` is parsed.
- `@Hello World!` is parsed.
- `end` is parsed.
- `SpriteGroups/005.png` is indexed as metadata only.
- `robot.hello_world` is found by the text/YML scanner.
- `npc_config_table.yml` has entry `744`.
- NPC `744` `Event Flag` is semantically `0x0` (`0` in the current YAML).
- NPC `744` `Show Sprite` is `always`.
- NPC `744` `Text Pointer 1` is `robot.hello_world`.
- NPC `744` `Type` is `person`.
- `map_sprites.yml` references NPC `744`.
- Ignored local ROM output compiled successfully after expanding an ignored
  working base ROM copy.
- Compiled ROM booted in Snes9x.
- Playwright captures a deterministic local browser verification of the
  generated data and imported dialogue playback.

Expected current fixture deviations:

- NPC `744` `Sprite` is `171`, not tutorial baseline `5`.
- NPC `744` `Movement` is `8`, not tutorial baseline `605`.
These are intentional local-only proof fixture differences for the successful
bedroom Snes9x proof. They should not be used to claim original roadblock or
original tutorial-coordinate proof.

## Fixture-Only Proof

`external/coilsnake-project/tutorial-fixture-npc-reference.yml` is synthetic
local-only scanner proof. It is not extracted ROM data, and it remains ignored
by git with the rest of `external/coilsnake-project`.

`external/coilsnake-project/tutorial-run-proof.json` is local-only proof that the
compile/boot step was completed. It contains no ROM path and no ROM bytes, and
it remains ignored by git with the rest of `external/coilsnake-project`.

`.codex/videos/npc744-bedroom-hello-world-proof-snes9x-labeled.mov` is the
strongest current emulator proof artifact. It is ignored local output and is
documented in `docs/tutorial-rom-video-verification.md`.

## Safety Boundaries

Implemented:

- No extracted CoilSnake asset is committed.
- Only ignored local fixture text/YML was edited for NPC `744`.
- ROM compilation used ignored local inputs and ignored local outputs only.
- Generated public JSON uses relative local fixture paths only.
- Sprite data remains metadata-only.
- Phaser uses primitive graphics and system fonts.

Explicitly forbidden for now:

- Copying or rendering extracted PNGs as game assets.
- Full map rendering.
- Battle systems.
- Audio.
- Full-game recreation.

## Verification

Latest verified commands:

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
pnpm dev
pnpm test:review
```

Results:

- `pnpm install --frozen-lockfile`: pass.
- `pnpm convert`: pass, emits `tutorial-status.json` with 14 passed, 2 failed, 0 blocked.
- `pnpm validate`: pass, validates `tutorial-status.json`.
- `pnpm test`: pass, 14 tests.
- `pnpm exec tsc --noEmit`: pass.
- `pnpm dev`: pass, served `http://127.0.0.1:5173/` with generated tutorial status.
- `pnpm test:review`: pass, writes local video/trace artifacts.

Generated JSON safety scan:

- No `.sfc` references found.
- No absolute user-home path references found.
- No concrete ROM filename references found.

Tracked source safety scan:

- No concrete ROM filename references found.
- No absolute user-home paths found.

## Next Work

Next safest milestone:

1. Keep the bedroom NPC `744` proof as the current defensible Snes9x proof.
2. Continue original roadblock/original-placement investigation only as a
   separate diagnostic lane.
3. Do not broaden object routing or all-NPC routing to produce proof clips.
4. Keep ROMs, generated JSON, local CoilSnake fixture files, videos, and
   review/browser caches ignored.

The Phaser/tutorial-data slice is complete for this local project. The original
roadblock/original-placement NPC targeting proof is not complete.
