# Map transitions — fade + kind-aware sound effects

## Goal
Map-point transitions were an abrupt ~180ms cut (`DOOR_FADE_HALF_MS = 90` × 2, no
hold, no sound), which felt disorienting. Every transition now does
**fade-out → black hold → fade-in** with a kind-specific sound effect.

## How EarthBound does it (research)
- **Doors:** play a door sound, then darken the whole screen toward black (stepped
  palette fade), load the destination, then brighten back up.
- **Stairways / escalators:** not a fade — EB disables input and auto-walks the
  character across the stairs (~19–21 frames top, ~15 bottom) with footstep
  movement.
We adopt a single unified fade for *all* transitions (the house style the user
chose) and use EB's behaviour for the sounds/feel.

## Design
- **Pure state machine** (`apps/game/src/mapTransition.ts`): `idle → fadeOut →
  hold → fadeIn → done`, advanced by delta-ms. Constants `FADE_OUT_MS = 300`,
  `BLACK_HOLD_MS = 700`, `FADE_IN_MS = 300` (~1.3s total). Emits boundary events:
  `start(kind)` at fade-out, `swap` at hold start (do the warp under black),
  `arrive(kind)` at fade-in, `complete`. No Phaser/audio deps → unit-testable.
- **Kind** = `door | stairway | escalator | teleport`. Field warps map from
  `door.type`; scripted event warps use `teleport`.
- **Cues** (`transitionSfxCueForEvent`): door → `doorOpen` at start + `doorClose`
  at arrive; stairway → `footsteps`; escalator → `escalatorHum`; teleport →
  `whoosh`.
- **SFX engine** (`apps/game/src/audio/transitionSfx.ts`): all sounds are
  **synthesized at runtime via Web Audio** (oscillator + gain envelopes + filtered
  noise bursts). No audio sample/asset files — original sounds only, consistent
  with the project's own-audio decision. Lazy `AudioContext`, resumed on first
  input (browser gesture rule), graceful no-op when AudioContext is unavailable
  (tests/jsdom). `NoopTransitionSfx` fallback.
- The scene drives the machine from its update loop and paints the existing
  black overlay from `transitionOverlayAlpha`. Player input stays locked across
  the whole transition (unchanged). Warp-into-void guard + fire-once debounce
  reused.

## Trailing-line fix
The interior render mask showed a thin line off the bottom-right edge. Caused by
fractional camera scroll producing a 1px `GeometryMask` seam. Fixed by rounding
the rendered mask rects and insetting only the outer right/bottom mask edge by
`0.5 / zoom` world pixels. Logical room/sector bounds are unchanged.

## Verification (native 512×448, orchestrator-owned)
- Door warp: fade-out → ~700ms black hold → fade-in confirmed frame-by-frame.
- `AudioContext` spy: door-open SFX fires at fade-out start; door-close fires
  ~1027ms later at fade-in start (= fade-out 300 + hold 700). No page errors.
- Stairway/escalator/teleport cue routing is unit-tested and shares the verified
  machine + audio path.
- Trailing line gone; no interior-bleed regression.
- 403 unit tests + tsc + `build:eb-fullworld` green.

## Tuning
Timing lives in the three constants in `mapTransition.ts`; adjust there if the
~1.3s pacing needs a tweak.
