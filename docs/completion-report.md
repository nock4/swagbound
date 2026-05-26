# CoilSnake to Phaser Prototype Completion Report

## Completed

- Preserved the audited CoilSnake project to generated JSON pipeline.
- Added `npcs.json` generation for textual script references found in obvious text/YML metadata files.
- Added shared Zod schemas for NPC reference collections and manifest `files.npcs` / `counts.npcReferences`.
- Added validation for `npcs.json` through `pnpm validate`.
- Added pure script domain logic:
  - `resolveScriptReference`
  - `buildDialoguePages`
- Added dialogue playback support for `text`, `next`, `end`, `eob`, and preserved `unknown` commands.
- Replaced the static Phaser debug display with a primitive playable debug room:
  - controllable placeholder player
  - placeholder script/NPC marker
  - interaction opens resolved `robot.hello_world` dialogue when available
  - status display for import, scripts, NPC references, warnings, and sprite metadata
- Kept sprite preview metadata-only; no extracted PNGs are copied or rendered.
- Added synthetic-only Vitest coverage for NPC scanning, binary-file skipping, source locations, script resolution, dialogue page grouping, manifest NPC output, and validation failures.

## Commands Run

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
pnpm dev
```

The Phaser app was smoke-tested at:

```text
http://127.0.0.1:5173/
```

## Generated File Contract

`pnpm convert` now emits these generated files under `apps/game/public/generated`:

- `manifest.json`
- `scripts.json`
- `npcs.json`
- `sprite-groups.json`
- `validation-report.json`

`manifest.json` remains the app entrypoint. It references the other generated files through `files` and does not embed the larger collections.

## Safety Verification

- The ROM was not read, copied, moved, modified, compiled, generated, or committed.
- No extracted CoilSnake PNGs are copied into generated output.
- `external/coilsnake-project` remains local-only input.
- Generated output remains under `apps/game/public/generated`.
- Public generated JSON was checked for ROM filename, `.sfc`, and `/Users/` path references.
- SpriteGroups data is metadata-only: relative path, inferred id, extension, and PNG dimensions.
- The Phaser scene uses primitive graphics and system fonts only.

## Known Gaps

- The verified local fixture does not contain an obvious text/YML NPC metadata reference to `robot.hello_world`; `npcs.json` therefore has zero references and conversion emits an info warning.
- The debug room still creates a placeholder marker for the resolved `robot.hello_world` script label so the prototype remains locally playable.
- No map rendering, real sprite rendering, battle systems, audio, emulator integration, ROM compilation, or full-game recreation were attempted.
- NPC scanning is deliberately conservative and only inspects obvious text/YML metadata filenames, not arbitrary extracted data or binary files.

## Prototype Completeness

“Complete” for this prototype means:

- A local CoilSnake project can be converted into validated generated JSON.
- Parsed CCScript labels can be resolved by reference.
- The Phaser scene can display import status and a minimal navigable debug space.
- A placeholder marker can open imported dialogue from `robot.hello_world`.
- Sprite data is visible as safe metadata without rendering or copying extracted assets.

## Next Recommended Milestone

Create a small synthetic or documented local-only NPC metadata fixture that explicitly references `robot.hello_world`, then extend the debug room to place markers from `npcs.json` positions if safe textual coordinates are available.
