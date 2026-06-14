# Design Parity Pass — faithful rebuild vs. vanilla EarthBound

Method: read-only audit of the four runtime surfaces (overworld, main menu, field
dialogue, battle) against vanilla EarthBound, backed by live screenshots captured
from `pnpm dev` (full-world build) + a one-off battle build. Screenshots live under
`.codex/screenshots/parity-*.png` (gitignored). No extracted prose/values committed
here — descriptions and counts only.

## The dividing line

Parity splits cleanly into two layers:

- **Content / geometry layer (real extracted EB data): HIGH parity.** Maps, tiles,
  palettes, player/NPC/enemy sprites, battle backgrounds, dialogue *text*, enemy/stat
  tables, menu structure, first-person battle layout, the rolling-HP mechanic, and the
  BASH/PSI/GOODS/RUN command set are all real EB and read as EarthBound on sight.
- **Chrome / presentation layer (engine-rendered, currently approximated): LOW parity.**
  Everything drawn by our own UI code — font, window frames, cursor, prompts,
  animations, transitions — uses modern/system styling. This is the dominant remaining
  "not-quite-EarthBound" tell, and it sits on top of otherwise-faithful content.

## Scorecard (updated 2026-06-14 — font + window frames closed)

| Surface | Content/data | Presentation/chrome | Notes |
|---|---|---|---|
| Overworld | A | A- | Real start, tiles, sprites, palette. EB bitmap font in field dialogue. Only non-EB pixels are dev chrome (top prompt bar, `F1: debug`) in a web font. |
| Main menu | A- | A- | Correct items; now real **EB bitmap font + EB 9-slice window frame**. Remaining: `>` text cursor (EB uses a hand sprite), menu order differs from EB. |
| Field dialogue | A- | A- | Real EB text in the **EB font + EB window frame**, word-wrapped. `@`-leak fixed. Remaining: text "next" prompt (EB uses an animated ▼; arrow art is extracted but not yet wired). |
| Battle | A- | A- | Real enemy sprites + real psychedelic background + first-person + party HP/PP odometers, now in **EB font + EB window frames**. Remaining: **static (non-animated) background**, no enemy animation/damage flash. |

### Closed this pass
- **EB bitmap font** across menu/dialogue/battle (the #1 tell). [commits 94f263a, 27cc0ad]
- **EB 9-slice window frames** (sage/white double-line border, rounded corners, dark interior) across menu/dialogue/battle. [commits 40177d0, 1113d33]
- **`@` control-code leak** in dialogue. [27cc0ad]

## Presentation gaps (ranked by visual impact)

1. ~~**Bitmap font.**~~ DONE — real EB bitmap font everywhere.
2. ~~**Window frame art.**~~ DONE — real EB 9-slice frames (flavor 0). Flavor switching +
   non-default flavor interior colors remain future work.
3. **Selection cursor.** Text `>` instead of EB's hand/arrow cursor sprite. (open)
4. **Battle background animation.** The extracted background renders but is static; EB
   warps/cycles it. (open)
5. **Enemy sprite animation / damage flash.** Enemies render a single static frame. (open)
6. **Transitions.** Geometric circle/flash on battle-enter and hard-cut warps, vs. EB's
   swirl/ripple/fade. (open)
7. **Dialogue advance prompt.** Static "Space/Enter: next" text vs. EB's animated ▼. The
   ▼ arrow art is already extracted (window.json `moreArrow`); wiring it is a small task. (open)
8. **Text reveal SFX.** Absent — deferred by design to the own-music/audio phase.

## Concrete bugs / data gaps found

- ~~**Control-code leak:**~~ FIXED — the leading `@` text sentinel is dropped at the
  tokenizer; dialogue renders clean. [27cc0ad]
- **Placeholder party stats:** battle party HP/PP show identical default-looking values
  across members rather than real EB starting vitals — stat-mapping approximation.
- **Battles not in the default boot:** battle data is a separate opt-in build
  (`EB_BATTLE`); a default `pnpm dev` world has no encounters wired.
- **Menu order drift:** Status is reordered and ATM replaces Phone vs. vanilla.
- **Dev chrome on-screen:** the top instruction bar and `F1: debug` badge overlay the
  game (acceptable for dev; not part of EB).

## Highest-leverage next step

Two assets close most of the perceived gap: the **EB bitmap font** and the **window
9-slice frame art** (both extractable from ROM, consistent with the RE direction).
Swapping the global font + window renderer to those would lift menu/dialogue/battle
presentation from ~C to ~A in one focused pass — far higher yield per effort than the
open-ended cinematic-intro RE. The `@` control-code leak is a small, separate
correctness fix.
