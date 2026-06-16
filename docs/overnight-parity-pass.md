# Overnight Parity Pass — "Act 1 Slice: New Game → First Boss"

Goal: bring the whole early-game slice to vanilla-EB parity end to end — every map,
every transition, the battles, and the story spine from a fresh New Game through the
first boss. Orchestrated as sequential Codex tasks (each with an explicit `<goal>` +
DONE criteria) gated by the orchestrator's **native 512×448** in-browser checks.
Honest about the RE ceilings (the event/actor system) up front.

"First boss" target: **Frank / Frankystein Mark 2** in Onett (the first dedicated
boss fight after the intro's Starman Jr), with **Titanic Ant** at Giant Step as the
stretch milestone.

## Phase 0 — Close the open loops (must land first)
- **Interior camera/mask** (in flight): player always centered, map scrolls, only the
  current room renders (no neighbor bleed). Verify native + commit.
- **Fonts in the right places**: lock the default font (pending the user's pick from
  the comparison), then per-context selection — honor in-text font-switch codes →
  Mr. Saturn font (1) for Saturn speech, small font (4) where EB uses it.

## Phase 1 — Maps refinement (Onett + the first-boss corridor)
- Diagnostic sweep: walkability-grid-vs-frame across Ness's neighborhood, downtown
  Onett, and north to Giant Step. Flag mis-collided cliffs/edges, mis-rendered tile
  seams, palette/animation tiles, and any chunk-seam artifacts.
- Fix the concrete map defects found (collision mask + tile/arrangement issues only;
  data stays gitignored).
- Gate: walk the corridor new-game→Giant-Step entrance with no clip-through / no
  walkable-wall / no render seams.

## Phase 2 — Transitions (full Act-1 door + warp audit)
- Round-trip EVERY Act-1 door (Ness's house up/down, neighbor houses, drugstore,
  hospital, police station, Pokey's house, the Giant Step entrance): enter → correct
  interior → exit → correct exterior spot. Both directions.
- Fix the residual ~8% over-range door destinations and any mismatched returns with
  per-door ground truth.
- Resolve the scripted-teleport coordinate-unit lead (teleport destinations read as
  world px vs 8px warp units) so story warps land correctly.
- Gate: a scripted in-browser tour that enters+exits each door and asserts walkable,
  correct-area landings.

## Phase 3 — Battles (depth parity for the early roster + bosses)
- Audit damage/turn-order/enemy-AI against EB for the Onett roster (e.g. Spiteful
  Crow, Coil Snake, Runaway Dog, Skate Punk, Pogo Punk, Territorial Oak) — correct
  stats, AI action selection, EXP/money/drops.
- Bosses: Starman Jr (intro), **Frank + Frankystein Mark 2** (first boss), Titanic Ant
  (stretch) — correct stats, multi-form/phase behavior, scripted entry.
- Flow/timing polish to EB feel (command → roll → result cadence).
- Gate: fight each scripted boss to victory in-browser; spot-check roster encounters.

## Phase 4 — Early story spine (the RE-heavy phase, through first boss)
- Intro P3–P5: Pokey at the door + his dialogue, travel to the meteor (player-driven +
  scripted beats), Buzz Buzz exposition (data_15) → Starman Jr, Pokey/Picky join,
  return home.
- Onett beats to the first boss: the morning-after gating (police line / roadblocks),
  Pokey's house, the path that leads to the first boss encounter, with the real
  (pointer-referenced) dialogue.
- HONEST SCOPE: EB's intro/story past the knock is engine-orchestrated, not a linear
  script. This phase reconstructs the spine using our event executor + real text
  fragments + the battle system, and extends the executor with the minimum actor ops
  needed (show/hide/move NPC, party_add) — the genuine ceiling. Each beat is
  player-driven where EB is, scripted where EB is. Report coverage per beat.
- Gate: a fresh New Game can be played start → first boss without dead-ends.

## Phase 5 — Integration + scorecard
- Full New-Game → first-boss playthrough verification at native size.
- Update `docs/design-parity-pass.md` with the slice's parity grades.
- Honest report: what's pixel/behavior-faithful vs approximated, and the next slice.

## Process guarantees (per user direction)
- Every Codex task uses a `<goal>` block + DONE criteria + honest self-verification;
  Codex verifies code/tests/build, the orchestrator owns the **native-viewport**
  visual gate ([[ui-verify-native-viewport]], [[subagent-goal-prompts]]).
- One Codex thread at a time; commit per landed+verified change; ROM read-only,
  extracted text/values stay gitignored and referenced by pointer.
