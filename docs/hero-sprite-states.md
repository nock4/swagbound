# Hero sprite states — catalog, engine, and art briefs

How every EarthBound hero appearance-change maps onto our custom-sprite system, what's built, and
the generation briefs for the faithful state sheets.

## Coverage: ALL hero characters
The visual-state system applies to **every playable hero**, not just the lead. Each hero's override
(`player`, `follower`, and any future party member) carries its OWN `states` sheets + `anchors`; the
party shares the resolved state (water/dead/bike/ladder/… computed once for the lead) and each sprite
renders it in its own art. So state sheets must be generated for EACH hero (Bosch `lsw-2821`, the
follower `lsw-855`, future members). Overlays + the teleport spin are currently lead-only (the lead
casts/wears them) — a documented refinement. Follower in-engine testing awaits a party context (Act 1
is solo Bosch); the follower render path mirrors the verified player path.

## Engine (built — `feat/hero-sprite-states`)
- Resolver: `apps/game/src/playerVisualState.ts` (pure; inputs → base state + transforms + overlays + fallback).
- Render: `chunkedWorldScene.applyPlayerVisualState()` — swaps to a faithful `states.<name>` sheet when
  present, else applies a generic approximation. Overlays pinned to `anchors.head`. Water clip at `anchors.waterline`.
- Schema: `SpriteOverride.states` (per-state alternate sheets) + `overlays` registry + `anchors` (`packages/eb-schemas`).
- Debug: `__setPlayerVisualState({...})` / `__playerVisualState()` / `__overlayInfo()`; readout on `__firstSceneDebug.visualState`.
- Tests (all green): `playerVisualState.test.ts` (unit A) · `sprite-state-probe.mjs` (in-engine readout +
  geometry, 11/11) · `sprite-state-goldens.mjs` (golden snapshots H, AE diff 0) · `sprite-state-matrix.mjs`
  + `sprite-state-matrix-fleet.workflow.js` (multi-agent fleet I: 28/28 cells = 7 states × 4 facings).
- HARNESS NOTE: the headless renderer does not composite WebGL color ops (tint/ColorMatrix). Color
  effects (invert/diamondized) verify via readout; geometry/alpha/overlay/water via pixel-diff. Confirm
  color visuals in a real (headed) browser.

## Catalog (every hero appearance change)
| State / effect | Mechanism | Art? | Status |
|---|---|---|---|
| default walk | base sheet | have | ✅ |
| **dead / ghost** | `states.dead` sheet swap | derived from walk art | ✅ done (ImageMagick recolor) |
| **tiny / tinyDead** | scale (approx) — or `states.tiny` sheet | optional faithful | ✅ approx; sheet optional |
| **ladder** | `states.ladder` sheet swap | Codex img-gen (both heroes) | ✅ done |
| **rope** | `states.rope` sheet swap | Codex img-gen (both heroes) | ✅ done |
| **bike** | `states.bike` sheet swap | Codex img-gen (both heroes) | ✅ done |
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
