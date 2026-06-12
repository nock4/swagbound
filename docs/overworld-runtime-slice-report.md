# Overworld Runtime Slice Report

Date: 2026-06-12
Slice: correct, data-driven playable overworld foundation (player controller, animation mapping, facing-aware interaction).

## What changed

1. **Moonwalking fixed.** The previous scene mapped sprite-sheet rows as up/down/left/right. CoilSnake
   sprite-group sheets are actually ordered **up, right, down, left** (then diagonals), so walking right
   played the left-facing frames and vice versa, and walking down showed the right-facing profile.
2. **New pure controller module** [playerController.ts](../apps/game/src/playerController.ts): movement,
   facing, walk-cycle animation, input lock, and facing-aware interaction targeting live in one
   Phaser-free, unit-tested module. The scene ([worldScene.ts](../apps/game/src/worldScene.ts)) feeds it
   input + collision callbacks and applies the resulting position/frame to the sprite.
3. **Generated animation metadata.** `sprites.json` sheets now carry an `animations` record
   (direction → `[frameA, frameB]`) emitted by the converter, so the runtime reads frame mappings from
   the data contract instead of hardcoding them (with the canonical mapping as fallback).
4. **Facing-aware interaction.** Talking to the robot requires being near it *and* facing it. A
   non-debuggy prompt ("Turn toward the robot, then press Space/Enter") appears when near but facing away.
5. **Dialogue locks input atomically.** Opening/advancing/closing dialogue locks/unlocks the player at the
   transition point (not on the next frame), so published debug state is never inconsistent
   (`dialogueOpen=false` with `inputLocked=true` can no longer be observed).
6. **NPC idle facing from data.** The robot idles on its imported `Direction: down` config frame via the
   same animations metadata.
7. **E2E coverage** for movement/facing/animation per direction, idle persistence, facing-gated
   interaction, dialogue locking, NPC body collision, and the JSON safety scan
   ([overworld-runtime.spec.ts](../tests/review/overworld-runtime.spec.ts)).

## Animation/frame mapping assumptions

CoilSnake decompiles a 16-sprite group in pair order **N, E, S, W, NE, SE, SW, NW**
(`SPRITE_COMPILATION_ORDER = [2, 4, 1, 3, 8, 7, 6, 5]` in CoilSnake's `sprites.py`, comment: compiled
order is "S, N, W, E, NW, SW, SE, NE"; inverting that permutation gives the PNG order). For the 4-column
16×24 sheets used here:

| Frames | Facing      |
|--------|-------------|
| 0–1    | walk up     |
| 2–3    | walk right  |
| 4–5    | walk down   |
| 6–7    | walk left   |
| 8–9    | up-right    |
| 10–11  | down-right  |
| 12–13  | down-left   |
| 14–15  | up-left     |

Verified two ways: derived from CoilSnake source, and visually against the locally rendered sheets for
groups 1 (Ness) and 5 (robot). The converter emits cardinal pairs for any sheet with ≥ 8 frames; sheets
with fewer frames reuse the lead pair for every facing (`spriteGroupAnimations` in
[world.ts](../packages/eb-converter/src/world.ts)). Diagonal pairs (frames 8–15) are **not** yet emitted
or rendered — diagonal movement resolves to a cardinal facing.

- Walk cycle: the two frames alternate every 150 ms of accumulated walking time.
- Idle: first frame of the current facing's pair; the walk clock resets on stop.

## Input/facing rules

- Arrow keys/WASD; one active axis faces that direction.
- Diagonal: if the current facing is still one of the held directions, it is kept (no flicker);
  otherwise the horizontal component wins. Opposing keys cancel (no movement, facing kept).
- Idle facing persists after key release.
- While dialogue is open, input is locked: no movement, no facing change, idle frame shown.
- Interact (Space/Enter) while stationary uses the current facing.

## Interaction rules

`findInteractionTarget` (feet-to-feet vector, facing-relative):
- distance ≤ 28 px, forward component ≥ 2 px (rules out "behind"), lateral offset ≤ 16 px,
  candidate must be `interactable`.
- Nearest-in-front wins (forward distance, then lateral) when several qualify.
- Prompts: in front → "Space/Enter: talk to the robot"; in radius but facing away →
  "Turn toward the robot, then press Space/Enter"; otherwise the movement hint.
- Esc/Backspace closes dialogue; Space/Enter advances; the 150 ms advance / 75 ms reopen cooldowns in
  `DialogueController` (unchanged) prevent double-advance from one key burst. The NPC remains
  interactable after dialogue closes (re-verified by e2e).

## Collision/spawn notes

- Collision is unchanged: feet-box (14×10) tests against the imported 8 px surface grid (solid flag
  0x80 or void tile), resolved per axis so the player slides along walls; NPC bodies block a
  28×28-ish box around their feet. E2E drives the player into the NPC and asserts feet never overlap.
- Spawn remains converter-derived (documented in `world.json` `player.spawnDerivation`): nearest
  walkable point near the tutorial NPC via deterministic ring search — currently 96 px east of the
  robot at (1056, 728) region pixels. Verified on walkable ground by e2e (spawn equals first published
  player position, and the exploratory sweep stays in bounds).
- Camera: 2× zoom, follow with `roundPixels`; no jitter observed in recordings.
- The F1 panel (hidden by default) now also shows live facing/moving/lock/anim-frame state.

## Generated data contract changes

- `SpriteSheetSchema` gains optional `animations`:
  `{ up|right|down|left: [frameIndexA, frameIndexB] }` (schema + zod validation in
  [eb-schemas](../packages/eb-schemas/src/index.ts), `SpriteAnimationsSchema`).
- Emitted per sheet by the converter; validated by `pnpm validate`; consumed by the runtime with the
  canonical mapping as fallback. No other generated files changed shape. `manifest.json` still carries
  only file refs.

## Commands run

```sh
pnpm install --frozen-lockfile   # via pnpm verify — clean
pnpm convert                     # regenerates world/sprites/animations metadata
pnpm validate                    # ok: true, worldAvailable: true, 4 assets checked
pnpm test                        # 61 unit tests pass (incl. 26 new controller tests)
pnpm exec tsc --noEmit           # clean
pnpm test:mantis                 # 13 e2e tests pass — 8 consecutive green runs
pnpm verify                      # full chain green
rg -n "EarthBound \(USA\)|\.sfc|/Users/" apps/game/public/generated/*.json   # no matches
pnpm dev                         # serves; index/manifest/sprite endpoints return 200
```

## Safety checks

- ROM never read/copied/modified; `external/coilsnake-project` used read-only as local fixture input.
- Generated runtime output stays under `apps/game/public/generated` (gitignored except `.gitkeep`).
- Public JSON safety scan clean (no ROM filename, `.sfc`, or `/Users/` paths) — enforced by
  `pnpm validate`, the e2e safety test, and the manual `rg` scan.
- No extracted CoilSnake assets committed (screenshot/video artifacts live in gitignored
  `test-results/`).

## Test-harness hardening (e2e flake fixes found during this slice)

- Playwright workers capped at 2: more concurrent recorded browsers starved the render loop
  (blank-canvas boots, swallowed key taps).
- `walkToNpc` now detours (perpendicular both ways, then backtrack) when stuck, including inside the
  interaction radius — the map has a concave cliff pocket between spawn and the robot that livelocked
  the old greedy walker.
- The facing-gate test turns away via short perpendicular taps with retry/re-approach, since a single
  timed tap can fall between starved frames.

## Known gaps

- Diagonal facings (frames 8–15) exist on the sheets but are not emitted in `animations` or rendered;
  movement resolves diagonals to cardinals. Fine for EarthBound-style feel, revisit if diagonal
  visuals are wanted.
- Only NPC 744 is visible/interactable in this region; multi-NPC interaction arbitration is
  implemented (nearest-in-front) but only unit-tested, not exercised by real data yet.
- NPC movement values from `npc_config_table.yml` are imported but unused (robot idles).
- The interaction cone constants (28/2/16 px) are tuned to this NPC's body box, not derived from the
  imported per-group collision metadata (`East/West Collision Width` etc. are available in
  `sprite_groups.yml` if needed later).
- `walkClock` carries across facing changes mid-walk (step cadence continues); EarthBound restarts
  the cycle per direction — imperceptible at 150 ms, noted for fidelity.
- Sub-pixel rendering: sprite positions are floats; `roundPixels` handles display, but feet-box math
  uses floats (intentional, keeps movement smooth).

## Next recommended milestone

**Multi-entity overworld scripting**: real NPC placements beyond 744 (visible `showSprite` parsing for
more groups), per-NPC facing/idle from config, simple movement patterns, interaction triggers wired
through a tiny event runner that resolves `textPointer` references generically, and dialogue queueing.
The controller/interaction layer from this slice is the foundation: NPCs can reuse the same state
machine (`stepPlayer` with scripted inputs instead of keyboard input).
