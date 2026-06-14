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
3. **Selection cursor.** Still text `>` — no clean EB hand-cursor art was identifiable;
   not invented. (open, low priority) [6528f59 skipped]
4. ~~**Battle background animation.**~~ DONE — scroll + bounded scanline warp from the
   bg distortion/scroll tables. [e6fd0ee]
5. ~~**Enemy damage flash.**~~ DONE — white-tint flash on hit + subtle idle wobble.
   [9480b87] (true per-enemy frame animation still out of scope.)
6. ~~**Transitions.**~~ DONE — procedural battle-enter swirl + overworld door fades. [13a3b35]
7. ~~**Dialogue advance prompt.**~~ DONE — animated ▼ arrow. [5f926ef]
8. **Text reveal SFX.** Absent — deferred by design to the own-music/audio phase.

Also closed: **window flavor switching** + 7 distinct per-flavor interior colors [6528f59].

## Concrete bugs / data gaps found

- ~~**Control-code leak:**~~ FIXED — leading `@` sentinel dropped at the tokenizer. [27cc0ad]
- ~~**Placeholder party stats:**~~ FIXED — real per-character starting vitals from
  `initial_stats.yml`. [5f926ef]
- ~~**Menu order drift:**~~ FIXED — vanilla order Talk/Goods/PSI/Equip/Check/Status. [5f926ef]
- **Battles not in the default boot:** battle data is still a separate opt-in build; a
  default `pnpm dev` world has no roaming/contact encounters wired. (open — Batch 3)
- **Dev chrome on-screen:** the top instruction bar and `F1: debug` badge overlay the
  game (acceptable for dev; not part of EB). (open, low priority)

## Status: design/chrome parity essentially complete

The two dominant tells (font, window frames) plus all the 2nd-order battle/world effects
are done and verified. Remaining open items are (a) low-priority polish (hand cursor, dev
chrome, true enemy-frame animation, BG palette cycling), (b) the deferred audio phase, and
(c) two large/structural items tracked separately: **overworld battle encounters** and the
**intro cutscene** (uncertain RE).
