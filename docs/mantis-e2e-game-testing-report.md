# Mantis E2E Game Testing Report

## Scope

This pass applies a Mantis-style robust e2e approach to the browser-hosted Phaser
slice. The target is the first playable scene and generated JSON pipeline, not
Snes9x emulator proof or ROM compilation.

## What Changed

- Added a reusable Playwright game harness in `tests/review/gameHarness.ts`.
- Reworked the suite for the real playable world scene (imported map, sprites,
  collision): 9 scenarios.
- The walk-to-NPC route is now adaptive: it navigates from the published debug
  state with stuck detection (perpendicular slide), so it routes around
  imported collision instead of replaying a fixed key sequence.
- Added a canvas pixel-sampling check (CANVAS renderer) proving the scene
  renders real imagery, not a blank frame.
- Added a data-consistency scenario: scene NPC placement and region geometry
  must equal `world.json`.
- Added adverse scenarios for invalid `scripts.json`, invalid `manifest.json`,
  and invalid `world.json` (world failure must degrade to the fallback field
  with working imported dialogue).
- Added an in-browser generated-JSON safety scan scenario.
- Kept the narrow viewport observability test.
- `pnpm test:mantis` remains the explicit robust e2e game-test command.

## Test Strategy

The suite uses Mantis-style test structure:

- Stable game harness instead of duplicated raw test steps.
- Runtime issue capture for browser console errors and page errors.
- State-based game assertions through `globalThis.__firstSceneDebug`.
- Directed player routes for expected tutorial behavior.
- Adverse generated-data routes for broken JSON contracts.
- Exploratory input sweep for movement bounds and state stability.

## Scenarios

Implemented Playwright scenarios:

- World scene renders the imported map (nonblank canvas) and plays imported
  `@Hello World!` dialogue after walking to the NPC.
- NPC placement and region geometry match generated `world.json` data
  (sector-aligned origin; scene position equals data position).
- Dialogue advances, closes, and prevents movement while open.
- Exploratory input sweep keeps the player bounded by imported collision.
- Generated public JSON stays free of ROM names and absolute paths.
- Invalid `scripts.json` keeps the world scene alive and shows a generated fallback.
- Invalid `manifest.json` renders a generated-data error state without a page crash.
- Invalid `world.json` falls back to the placeholder field with working dialogue.
- Scene remains observable on a narrow review viewport.

## Commands

Run the robust e2e game suite:

```sh
pnpm test:mantis
```

Run the full release gate:

```sh
pnpm verify
```

## Current Result

`pnpm test:mantis` passed:

```text
9 passed
```

## Safety Boundaries

- The tests do not read, copy, move, modify, compile, generate, or commit the ROM.
- The tests do not commit extracted CoilSnake assets.
- The tests only load browser-served generated JSON/PNG output and synthetic route overrides.
- The adverse-data tests mock generated JSON responses in Playwright; they do not mutate fixture files.
- Rendered map/sprite assets are local-only, gitignored output of `pnpm convert`;
  the suite verifies the generated JSON contains no ROM names or absolute paths.
- Dialogue/UI chrome uses primitive shapes and system fonts only.

## Remaining Gap

This is robust browser e2e coverage for the playable world slice (real imported
map region, sprites, collision, dialogue). It does not prove emulator behavior,
doors/teleports, NPC movement AI, battle systems, audio, or full game
recreation. See `docs/full-romhack-slice-report.md` for the full gap list.
