# Design Parity Pass — faithful rebuild vs. vanilla EarthBound

Method: read-only audit of the four runtime surfaces (overworld, main menu, field
dialogue, battle) against vanilla EarthBound, backed by live screenshots captured
from `pnpm dev` (complete full-world build). Screenshots live under
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
3. ~~**Selection cursor.**~~ DONE — the text `>` (which rendered as a stray `"` in the EB
   font) is replaced by a drawn, blinking, right-pointing EB-style triangle in a reserved
   gutter, shared by all battle menus + the overworld main menu. [CU6 014e164]
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
- ~~**Battles not in the default boot:**~~ FIXED — the canonical `pnpm dev` build now
  emits battle, encounter, character, item, PSI, shop, font, window, and world data.
- **Dev chrome on-screen:** the top instruction bar and `F1: debug` badge overlay the
  game (acceptable for dev; not part of EB). (open, low priority)

## Status: design/chrome parity essentially complete

The two dominant tells (font, window frames) plus all the 2nd-order battle/world effects
are done and verified.

### Overworld battle encounters — DONE [ee51e3a, 9b6886a]
Table-driven stepped encounters (EB's real sector spawn model): walking a sector rolls its
rate-weighted enemy groups -> battle -> returns to the field at the saved position with a
cooldown; PartyState carries across. Honest scope: this is the underlying table model, not
visible avoidable roaming enemy *sprites* (those need an enemy->overworld-sprite mapping
CoilSnake doesn't cleanly expose — flagged follow-on).

### Intro cutscene — investigated, deferred (the genuine RE ceiling)
The `newgame_startup` event ($C5E70B) is a brief setup (flags + pause + one warp), NOT the
meteor cutscene. EarthBound's real intro (bedroom -> meteor -> Buzz Buzz -> Starman Jr
battle) is a large separate multi-actor event sequence requiring a substantial slice of the
event-VM actor/cinematic system + interior maps + a scripted boss battle — beyond a
timeboxed attempt. The safe fallback (new game lands controllable at the canonical start)
is in place. **Lead for a careful follow-up:** scripted teleport-destination coords are
currently read as world pixels in `resolveTeleportDestination`; dest 150 only resolves near
the real start when read as 8px units — a likely coordinate-unit bug affecting scripted
teleports generally (verify the unit before changing — low payoff for the intro itself, but
relevant to story warps).

### Remaining open (low priority)
Dev chrome overlay, true enemy-frame animation, BG palette cycling; and the deferred
own-music/audio phase.

## UX / playability fix pass (CU1–CU6) — 2026-06-15

Triggered by hands-on playtest feedback (controls, collision feel, NPCs, menus, doors,
battle). All six committed + verified in-browser on the full build.

- **CU1 — controls + input** [a7618b3]: Z = A/confirm, X = B/cancel (Space/Enter/Esc/Backspace
  aliases); edge-triggered discrete input so every menu/dialogue advance needs a fresh press
  (no key-repeat auto-advance), in battle too.
- **CU2 — window sizing** [6a4f8cd]: removed the double-scale (canvas is already 2× EB native);
  menus content-fit (compact, top-left), dialogue is a wide shallow bottom strip, battle
  windows snug — EB-native proportions.
- **CU3 — NPC spin** [1a6135c]: wandering NPCs no longer re-roll facing every frame when
  blocked; direction changes are gated to the step timer (~1.2 s EB-like cadence).
- **CU4 — collision footprint** [5b6f136]: the collision foot box was floating above the feet
  (shins), so the player clipped tree/cliff bases and stopped ~10 px early going north.
  Re-anchored the box to the feet — collision DATA was already correct (verified: house +
  field trees solid; walk-behind-tree-tops preserved).
- **CU5 — door triggers + void guard** [d389309]: ~90 % of EB door cells are solid; the trigger
  now fires when pressing *toward* an adjacent door cell (EB's "walk into the door"). A guard
  aborts the warp (instead of stranding the player) when the destination resolves to a
  non-walkable void.
- **CU6 — battle/menu visual parity** [014e164]: blinking EB triangle cursor (replaces the `"`),
  battle background fills the full screen behind the windows (no black band), enemies
  flash/fade/vanish on defeat before the victory window.

Diagnosed as **not a bug** (correct EB collision): "can't go north to Ness's house" — the house
is a solid block directly NW of the start; the road goes *around* it, and you *enter* via the door.

### Open follow-ons surfaced by this pass
- ~~**CU-DEST — door destination data:**~~ DONE — door destinations are 8px warp-grid units
  (×8), not raw pixels (the converter applied ×8 to the teleport table but not to doors).
  Hybrid scaling (×8 in range, raw for the ~8% over-range outliers) takes door-destination
  walkability 37% → 100%; the Onett house door now opens into the real house interior.
  [CU-DEST 0cd7f2a]. Residual: a handful of over-range outliers could still need per-door
  ground-truth if a bad warp shows up in play. See memory `door-destination-data-issue`.
- **Battle command completeness:** ~~Auto Fight + Defend~~ DONE [CU-CMD cc54ffe] — menu is now
  BASH/GOODS/AUTO/PSI/DEFEND/RUN; DEFEND halves a round of incoming damage, AUTO auto-attacks
  the party per round. Remaining: character-specific commands (Spy, Pray/Paula, Shoot+Bottle
  Rocket/Jeff, Mirror/Poo) — per-character command sets, a separate gameplay task.
- ~~**Build cleanup (CU7):**~~ DONE — `build:eb-fullworld` is the single complete build used by
  `pnpm dev`, `pnpm build`, and pretest hooks. `build:eb-full` and `dev:full` remain aliases.
