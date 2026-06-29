# Hero sprite states — catalog, engine, and art briefs

How every EarthBound hero appearance-change maps onto our custom-sprite system, what's built, and
the generation briefs for the faithful state sheets.

## Engine (built — `feat/hero-sprite-states`)
- Resolver: `apps/game/src/playerVisualState.ts` (pure; inputs → base state + transforms + overlays + fallback).
- Render: `chunkedWorldScene.applyPlayerVisualState()` — swaps to a faithful `states.<name>` sheet when
  present, else applies a generic approximation. Overlays pinned to `anchors.head`. Water clip at `anchors.waterline`.
- Schema: `SpriteOverride.states` (per-state alternate sheets) + `overlays` registry + `anchors` (`packages/eb-schemas`).
- Debug: `__setPlayerVisualState({...})` / `__playerVisualState()` / `__overlayInfo()`; readout on `__firstSceneDebug.visualState`.
- Tests: `apps/game/src/playerVisualState.test.ts` (unit) + `scripts/sprite-state-probe.mjs` (in-engine).
- HARNESS NOTE: the headless renderer does not composite WebGL color ops (tint/ColorMatrix). Color
  effects (invert/diamondized) verify via readout; geometry/alpha/overlay/water via pixel-diff. Confirm
  color visuals in a real (headed) browser.

## Catalog (every hero appearance change)
| State / effect | Mechanism | Art? | Status |
|---|---|---|---|
| default walk | base sheet | have | ✅ |
| **dead / ghost** | `states.dead` sheet swap | derived from walk art | ✅ done (ImageMagick recolor) |
| **tiny / tinyDead** | scale (approx) — or `states.tiny` sheet | optional faithful | ✅ approx; sheet optional |
| **ladder** | `states.ladder` sheet swap | NEW POSE | ⏳ gen |
| **rope** | `states.rope` sheet swap | NEW POSE | ⏳ gen |
| **bike** | `states.bike` sheet swap | NEW POSE | ⏳ gen (pilot) |
| **sleeping / sitting / falling / pajamas / robot / meditating / teleportBurnt / diamondized** | `states.<name>` sheet | NEW POSE / shared | ⏳ later-act |
| color inversion (Moonside) | camera ColorMatrix.negative + tint fallback | none | ✅ (verify headed) |
| teleport spin | frame-cycle transform | none (reuses walk) | ✅ |
| water wading | waterline crop | none | ✅ |
| mushroom / possession / sweat | head overlays | shared (placeholder PNGs) | ✅ engine; art = placeholder |

Not hero-sprite changes (don't allocate art): buses / Sky Runner (vehicle objects), pray/confusion/
sunstroke (battle-only), swimming (none), baby-Ness / captured-Paula (cutscene illustrations).

## Generation brief (for Codex GPT-Image runs / artists)
Every state sheet must match the base walk sheet so it drops straight into `states`:
- **Canvas:** 768×768 PNG, **transparent background**.
- **Grid:** 4×4 of **192×192** frames. **Rows = directions in this order: down, left, right, up.**
  Columns = the 4 animation frames for that direction. (Indices: down `0–3`, left `4–7`, right `8–11`, up `12–15`.)
- **Style anchor:** `assets/swagbound/hero/lsw-2821-walk.png` (match character design, palette, line weight,
  scale, and the foot baseline so the sprite stands at the same spot — origin is bottom-center, rendered at `displayHeight: 24`).
- **EB pose references** (decompiled, local): `external/coilsnake-full/SpriteGroups/` — `008.png` (ghost),
  `017.png` (ladder), `021.png` (rope). Use for POSE only; render in the Bosch style.
- Wire into `content/sprite-overrides.json` → `player.states.<name>` with `frameWidth/frameHeight: 192`,
  `displayHeight: 24`, and `animations` matching the layout. Then `scripts/sprite-state-probe.mjs` verifies the swap.

### Per-state pose
- **bike:** Bosch seated on a bicycle, 4 directions, 2–4 pedal frames each.
- **ladder:** climbing — back-to-camera (up-facing) hand-over-hand on rungs; can be ~2 frames reused across rows.
- **rope:** climbing a rope — similar to ladder, gripping a vertical rope.
- **dead/ghost:** DONE — `lsw-2821-dead.png`, derived (ethereal recolor + 50% alpha of the walk sheet).
