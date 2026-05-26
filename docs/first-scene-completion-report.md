# First Scene Completion Report

## What Changed

- Added a synthetic local-only scanner proof file at `external/coilsnake-project/tutorial-fixture-npc-reference.yml`.
  - It is clearly marked as non-extracted, local-only scanner proof.
  - It references `robot.hello_world` so `npcs.json` verifies the scanner path against the local fixture.
- Polished the Phaser app into a single first playable import scene.
  - The scene has a structured status panel, imported sprite metadata panel, bounded play area, visible interaction zone, player marker, NPC/script marker, and dialogue box.
  - The player can move with Arrow keys or WASD.
  - Space/Enter opens and advances imported dialogue when in range.
  - Esc/Backspace closes dialogue.
  - Player movement is paused while dialogue is open.
- The scene now loads all generated data through `manifest.json` references:
  - `scripts.json`
  - `npcs.json`
  - `sprite-groups.json`
  - `validation-report.json`
- The dialogue still resolves through generated `scripts.json`; `@Hello World!` is not hardcoded in the app.

## Final Controls

- Move: Arrow keys or WASD
- Interact: Space or Enter
- Advance dialogue: Space or Enter
- Close dialogue: Esc or Backspace

## Generated Data Flow

1. `pnpm convert` reads the local CoilSnake fixture and writes generated JSON under `apps/game/public/generated`.
2. `manifest.json` is loaded first by Phaser.
3. The app loads `scripts.json`, `npcs.json`, `sprite-groups.json`, and `validation-report.json` using manifest file references.
4. `robot.hello_world` is resolved from parsed script commands.
5. The NPC marker opens dialogue pages built from `text`, `next`, `end`, and `eob` commands. Unknown commands are preserved and do not crash playback.

Generated files:

- `manifest.json`
- `scripts.json`
- `npcs.json`
- `sprite-groups.json`
- `validation-report.json`

## Commands Run

```sh
pnpm install --frozen-lockfile
pnpm convert
pnpm validate
pnpm test
pnpm exec tsc --noEmit
pnpm dev
```

The dev scene was smoke-tested in a browser at `http://127.0.0.1:5173/`, including player movement and opening the imported dialogue.

## Safety Checks

- The ROM was not read, copied, moved, modified, compiled, generated, or committed.
- No extracted CoilSnake PNGs were copied into generated output.
- `external/coilsnake-project` remains local-only input and ignored by git.
- Generated output remains under `apps/game/public/generated`.
- Public generated JSON was checked for ROM filename, `.sfc`, and `/Users/` path references.
- Sprite display remains metadata-only; extracted SpriteGroups PNGs are not rendered.
- The Phaser scene uses primitive graphics and system fonts only.

## Known Gaps

- This is still a prototype first scene, not a game recreation.
- No real map rendering, sprite rendering, battles, audio, emulator integration, ROM compilation, or full-game systems were implemented.
- NPC placement uses a safe placeholder marker instead of parsed world coordinates.
- The scanner proof is synthetic local-only metadata because the verified tutorial fixture did not include an obvious extracted text/YML NPC reference to `robot.hello_world`.

## What First Scene Complete Means

The first scene is complete when a user can run `pnpm dev`, open the game, move a player marker around a clean play area, approach the NPC/script marker, open imported CoilSnake dialogue, advance or close it, and read concise project import status without seeing broken, copied, or copyrighted game assets.

## Next Recommended Milestone

Add a second safe metadata slice for local-only NPC placement coordinates, then place debug markers from generated JSON instead of fixed scene coordinates.
