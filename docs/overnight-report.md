# CoilSnake to Phaser Foundation Report

## Implemented

- Created a pnpm workspace with `apps/game`, `packages/eb-schemas`, and `packages/eb-converter`.
- Added Zod schemas for generated manifests, scripts, sprite metadata, NPC placeholder metadata, and validation reports.
- Added a TypeScript converter that reads only `external/coilsnake-project` by default and writes generated JSON only to `apps/game/public/generated`.
- Added a narrow CCScript v0 parser for labels, quoted text, compact quoted text plus command lines, `next`, `end`, `eob`, and preserved unknown commands.
- Added SpriteGroups PNG indexing without copying or rendering extracted assets.
- Added a Vite + Phaser debug scene that loads the generated manifest and scripts, validates them, and displays imported `robot.hello_world` text when present.
- Added Vitest coverage for schema validation, missing project behavior, CCScript parsing, unknown command preservation, and tutorial fixture hint detection using synthetic fixtures.

## Commands

Run from the repository root:

```sh
pnpm install
pnpm convert
pnpm validate
pnpm test
pnpm dev
```

## Preparing The Fixture

The expected local fixture path is:

```text
external/coilsnake-project
```

It should be created outside this implementation by following the CoilSnake tutorial decompile flow against a user-provided ROM. This project does not read, copy, move, modify, compile, generate, or commit the ROM.

## Generated File Contract

`pnpm convert` emits exactly these files under `apps/game/public/generated`:

- `manifest.json`
- `scripts.json`
- `sprite-groups.json`
- `validation-report.json`

`manifest.json` is the app entrypoint and references the other generated files instead of embedding their contents.

## Validation Behavior

- Missing `external/coilsnake-project`, `Project.snake`, `ccscript`, `robot.ccs`, `hello_world`, or `SpriteGroups` are warnings or info issues and exit successfully during conversion.
- Unknown CCScript commands are preserved, counted, and reported as warnings.
- Missing `apps/game/public/generated/manifest.json` during validation is an error and exits non-zero.
- Invalid generated JSON schema data is an error and exits non-zero.

## Assumptions

- Phaser 4 is installed through npm as `phaser`.
- The first slice intentionally uses only generated JSON and system-font debug rendering.
- Absolute source paths in generated data are marked as debug-only if passed through CLI arguments.

## Known Gaps

- No map rendering, sprite animation, battle systems, audio, emulator integration, ROM compilation, or full game recreation.
- NPC metadata is only a placeholder text scan for obvious references.
- CCScript support is intentionally narrow and not a full parser.

## Next Milestone

Add a second generated-data slice for a tiny map or NPC placement fixture, still keeping conversion schema-first and preserving unknown source data instead of failing.
