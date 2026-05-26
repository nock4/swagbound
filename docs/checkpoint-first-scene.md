# First Playable Scene Checkpoint

## Status

Implemented checkpoint: first playable scene complete.

The current prototype converts a local CoilSnake project into generated JSON, validates that JSON, and runs a Phaser first scene where the player can move, approach an NPC/script marker, and open imported `robot.hello_world` dialogue.

## Current Architecture

- `packages/eb-schemas`
  - Shared Zod schemas and TypeScript types for generated data.
  - Pure script domain helpers:
    - `resolveScriptReference`
    - `buildDialoguePages`
- `packages/eb-converter`
  - TypeScript CLI importer.
  - Reads local CoilSnake fixture data only.
  - Emits generated public JSON under `apps/game/public/generated`.
  - Includes validation CLI for generated JSON.
- `apps/game`
  - Vite + Phaser 4 app.
  - Loads `manifest.json` first.
  - Loads all other generated data through manifest file references.
  - Renders a primitive first scene with player movement, interaction, status UI, and dialogue playback.
- `external/coilsnake-project`
  - Local-only fixture input.
  - Ignored by git.
  - Contains a synthetic scanner proof file, documented below.

## Generated Files And Contracts

Generated output lives only under:

```text
apps/game/public/generated
```

Current generated files:

- `manifest.json`
  - Entrypoint for the app.
  - References other generated files through `files`.
  - Contains source/project status, counts, warnings, and errors.
- `scripts.json`
  - Combined parsed CCScript output.
  - Includes script files, commands, labels, counts, and warnings.
- `npcs.json`
  - Text/YML script-reference scan results.
  - Includes `reference`, `scriptFileStem`, `label`, `sourceLocation`, `raw`, and `contextType`.
- `sprite-groups.json`
  - Metadata-only PNG index for `SpriteGroups`.
  - Does not copy or render extracted PNGs.
- `validation-report.json`
  - Structured validation/issues report for generated data.

`apps/game/public/generated/.gitkeep` is the only intended tracked sentinel in the generated directory.

## Controls

- Move: Arrow keys or WASD
- Interact: Space or Enter
- Advance dialogue: Space or Enter
- Close dialogue: Esc or Backspace

Movement is paused while dialogue is active.

## Fixture Setup

Expected local fixture:

```text
external/coilsnake-project
```

Required tutorial fixture signals:

- `Project.snake`
- `ccscript/robot.ccs`
- `hello_world:`
- quoted text
- `end`
- `SpriteGroups/005.png`

Fixture-only proof:

- `external/coilsnake-project/tutorial-fixture-npc-reference.yml`
- This file is synthetic local-only scanner proof.
- It is not extracted ROM data.
- It exists only so `npcs.json` can prove the scanner detects `robot.hello_world` through a text/YML path without mutating real extracted fixture files.

## Safety Boundaries

Implemented:

- Generated JSON stays under `apps/game/public/generated`.
- `external/coilsnake-project` remains local-only input.
- SpriteGroup data is metadata-only.
- Phaser renders only primitive graphics and system fonts.
- Public generated JSON safety scan passed for:
  - ROM filename
  - `.sfc`
  - `/Users/`

Explicitly forbidden for now:

- Reading, copying, moving, modifying, compiling, generating, or committing the ROM.
- Committing extracted CoilSnake assets.
- Rendering extracted PNGs as game assets.
- Map rendering from real extracted data.
- Battle systems.
- Audio.
- Emulator integration.
- ROM compilation.
- Full game recreation.

Not implemented:

- Real map/NPC placement parsing.
- Tile rendering.
- Sprite animation.
- Save/load.
- Broad CCScript support.
- Event scripting beyond resolving and playing the tutorial dialogue.

## Verification Commands And Results

Run on checkpoint:

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
```

Results:

- `pnpm install --frozen-lockfile`: pass
- `pnpm convert`: pass
  - `scriptFiles`: 1
  - `scriptCommands`: 3
  - `labels`: 1
  - `textCommands`: 1
  - `unknownCommands`: 0
  - `npcReferences`: 1
  - `spriteImages`: 464
  - `warnings`: 0
  - `errors`: 0
- `pnpm validate`: pass
- `pnpm test`: pass, 11 tests
- `pnpm exec tsc --noEmit`: pass
- Generated JSON safety scan: pass

## Known Limitations

- The first scene uses placeholder player and NPC markers.
- The NPC reference is proven with a synthetic local-only fixture file.
- The scene is intentionally a first playable debug scene, not a real map.
- No extracted asset rendering is performed.
- CCScript parser support remains intentionally narrow.

## Exact Next Milestones

1. Milestone 2: Real map/NPC metadata discovery, no rendering yet.
2. Milestone 3: Local-safe tile/map renderer using generated placeholders first.
3. Milestone 4: Controlled asset-preview pipeline, still gitignored.
4. Milestone 5: Scene scripting/event triggers.
5. Milestone 6: Save/load prototype.
6. Milestone 7: Broader CCScript support.
